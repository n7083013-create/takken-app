#!/usr/bin/env node
/**
 * balance_correct_index.mjs
 *
 * 4択問題の correctIndex 偏りを均等化するスクリプト。
 *
 * - choices / choiceExplanations / correctIndex を連動して並び替える
 * - explanation 内の「選択肢N」参照を新しい index に合わせて書き換える
 * - 並べ替えは決定的（問題ID をシードにした疑似乱数）
 * - 既に均等な分布の問題はスキップ（=対象選定は分布レベルで判定）
 *
 * Usage:
 *   node scripts/admin/balance_correct_index.mjs --dry-run
 *   node scripts/admin/balance_correct_index.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');

const TARGETS = [
  { file: 'data/modules/takken/questions/kenri.ts', exportName: 'kenriQuestions' },
  { file: 'data/modules/takken/questions/takkengyoho.ts', exportName: 'takkengyohoQuestions' },
  { file: 'data/modules/takken/questions/horei_seigen.ts', exportName: 'horeiSeigenQuestions' },
  { file: 'data/modules/takken/questions/tax_other.ts', exportName: 'taxOtherQuestions' },
];

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY = !APPLY || args.includes('--dry-run');

// --- deterministic PRNG (mulberry32, seeded by string hash) ---
function strHash(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- TS file parse / serialize ---
// ファイル形式が極めて統一的なので、import / export const 行を取り除いた
// 残りを JS 配列リテラルとして eval する。
function parseTsFile(src, exportName) {
  // import 行を削除
  let stripped = src.replace(/^import[^\n]*\n/m, '');
  // "export const NAME: Question[] = [" → "[" に
  const re = new RegExp(`export\\s+const\\s+${exportName}\\s*:\\s*Question\\[\\]\\s*=\\s*`);
  stripped = stripped.replace(re, '');
  // 末尾の ";" を取り除く
  stripped = stripped.replace(/;\s*$/, '');
  // 配列リテラルとして評価
  // eslint-disable-next-line no-new-func
  const arr = new Function(`return (${stripped});`)();
  if (!Array.isArray(arr)) throw new Error('parsed value is not an array');
  return arr;
}

// 単一引用符スタイルでシリアライズ。'\\' と "'" のみエスケープ。
function quote(str) {
  return `'${String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function serializeQuestion(q, indent = '  ') {
  const ind = (n) => indent.repeat(n);
  const lines = [];
  lines.push(`${ind(1)}{`);

  // フィールドの順序を元ファイルに合わせる
  const order = [
    'id', 'moduleId', 'category', 'coreEssence', 'sourceExamYear', 'difficulty',
    'text', 'choices', 'correctIndex', 'explanation', 'choiceExplanations', 'tags',
  ];
  // それ以外のフィールドが存在する場合は末尾に
  const extra = Object.keys(q).filter((k) => !order.includes(k));
  const keys = [...order.filter((k) => k in q), ...extra];

  for (const k of keys) {
    const v = q[k];
    if (k === 'choices' || k === 'choiceExplanations') {
      lines.push(`${ind(2)}${k}: [`);
      for (const item of v) lines.push(`${ind(3)}${quote(item)},`);
      lines.push(`${ind(2)}],`);
    } else if (k === 'tags') {
      const inner = v.map(quote).join(', ');
      lines.push(`${ind(2)}${k}: [${inner}],`);
    } else if (k === 'explanation') {
      // 元ファイルでは多くが explanation: \n      '...' という多行表現
      lines.push(`${ind(2)}${k}:`);
      lines.push(`${ind(3)}${quote(v)},`);
    } else if (typeof v === 'string') {
      lines.push(`${ind(2)}${k}: ${quote(v)},`);
    } else {
      lines.push(`${ind(2)}${k}: ${JSON.stringify(v)},`);
    }
  }
  lines.push(`${ind(1)}},`);
  return lines.join('\n');
}

function serializeFile(originalSrc, exportName, questions) {
  // import 行と export const ... = [ をそのまま再構成
  const importLine = `import { Question } from '../../../../types';\n`;
  const header = `\nexport const ${exportName}: Question[] = [\n`;
  const body = questions.map((q) => serializeQuestion(q)).join('\n');
  const footer = `\n];\n`;
  return importLine + header + body + footer;
}

// --- choice rewriting ---
// explanation 内の「選択肢N」（N=1..4, 半角）を新 index にマッピング
function rewriteSenttakushi(text, mapOldToNew) {
  return text.replace(/選択肢([1-4])/g, (_, n) => {
    const oldZero = parseInt(n, 10) - 1;
    const newZero = mapOldToNew[oldZero];
    if (newZero == null) return `選択肢${n}`;
    return `選択肢${newZero + 1}`;
  });
}

// 決定的シャッフル: ID をシードに、新しい correctIndex 位置だけ目標に固定する
// ここでは「正解を target slot に配置 + 残り 3 つを擬似乱数で並び替える」方式で完全シャッフル
function deterministicReorder(q, targetIndex) {
  const rand = mulberry32(strHash(q.id));
  const oldCorrect = q.correctIndex;
  // 不正解 3 つの順列を擬似乱数で決める（Fisher-Yates）
  const wrongs = [0, 1, 2, 3].filter((i) => i !== oldCorrect);
  for (let i = wrongs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [wrongs[i], wrongs[j]] = [wrongs[j], wrongs[i]];
  }
  // 新並び: targetIndex に oldCorrect、それ以外のスロットに wrongs を順に
  const newOrder = [null, null, null, null];
  newOrder[targetIndex] = oldCorrect;
  let wi = 0;
  for (let i = 0; i < 4; i++) {
    if (newOrder[i] == null) newOrder[i] = wrongs[wi++];
  }
  // newOrder[newPos] = oldPos の対応
  // mapOldToNew[oldPos] = newPos も作る
  const mapOldToNew = [];
  for (let newPos = 0; newPos < 4; newPos++) {
    mapOldToNew[newOrder[newPos]] = newPos;
  }

  const newChoices = newOrder.map((oldIdx) => q.choices[oldIdx]);
  const newChoiceExpl = q.choiceExplanations
    ? newOrder.map((oldIdx) => q.choiceExplanations[oldIdx])
    : undefined;
  const newExplanation = rewriteSenttakushi(q.explanation, mapOldToNew);

  return {
    ...q,
    choices: newChoices,
    correctIndex: targetIndex,
    explanation: newExplanation,
    ...(newChoiceExpl ? { choiceExplanations: newChoiceExpl } : {}),
  };
}

// --- 均等化アルゴリズム ---
// 目標: 各 index が ⌊N/4⌋ 〜 ⌈N/4⌉ 個になるように、過剰スロットの問題を不足スロットへ移動。
// 移動対象は「過剰 index に属する問題のうち、ID ハッシュ順で末尾」を選ぶ → 決定的。
// 並べ替え対象から除外する問題:
//  - questionFormat === 'count' のように choices が順序付きの問題（"1つ"/"2つ"...）
//  - choices 数が 4 でない問題
//  - statements を持つ複合形式（個数選択・組合せ等）
function isShuffleable(q) {
  if (!Array.isArray(q.choices) || q.choices.length !== 4) return false;
  if (q.questionFormat && q.questionFormat !== 'standard' && q.questionFormat !== '4choice') return false;
  if (q.statements) return false;
  // 念のため "Nつ" 形式の選択肢を直接検出
  if (q.choices.every((c) => /^[1-4１-４]つ$/.test(String(c).trim()))) return false;
  return true;
}

function balance(questions) {
  // バランス計算は「シャッフル可能な問題」のみを対象にする
  const idxs = questions.map((_, i) => i).filter((i) => isShuffleable(questions[i]));
  const N = idxs.length;
  const target = Math.floor(N / 4);
  const extra = N - target * 4;
  const desired = [0, 1, 2, 3].map((i) => target + (i < extra ? 1 : 0));

  const buckets = [[], [], [], []];
  for (const i of idxs) buckets[questions[i].correctIndex].push(i);

  const moves = [];
  while (true) {
    const overIdx = buckets.findIndex((b, i) => b.length > desired[i]);
    const underIdx = buckets.findIndex((b, i) => b.length < desired[i]);
    if (overIdx === -1 || underIdx === -1) break;
    const sorted = [...buckets[overIdx]].sort((a, b) => {
      return strHash(questions[a].id) - strHash(questions[b].id);
    });
    const pick = sorted[sorted.length - 1];
    buckets[overIdx] = buckets[overIdx].filter((x) => x !== pick);
    buckets[underIdx].push(pick);
    moves.push({ qIdx: pick, from: overIdx, to: underIdx });
  }
  return { moves, desired, totalShuffleable: N, totalSkipped: questions.length - N };
}

function distribution(questions) {
  const dist = [0, 0, 0, 0];
  for (const q of questions) dist[q.correctIndex]++;
  return dist;
}

function fmtDist(dist) {
  const total = dist.reduce((a, b) => a + b, 0);
  return dist
    .map((c, i) => `i${i}=${c}(${((c / total) * 100).toFixed(1)}%)`)
    .join('  ');
}

// --- main ---
let totalChanges = 0;
const reports = [];

for (const t of TARGETS) {
  const fpath = path.join(ROOT, t.file);
  const src = fs.readFileSync(fpath, 'utf8');
  const questions = parseTsFile(src, t.exportName);

  const before = distribution(questions);
  const { moves, desired, totalShuffleable, totalSkipped } = balance(questions);

  // 適用
  const updated = questions.slice();
  for (const m of moves) {
    updated[m.qIdx] = deterministicReorder(updated[m.qIdx], m.to);
  }

  const after = distribution(updated);
  reports.push({
    file: t.file,
    n: questions.length,
    nShuffleable: totalShuffleable,
    nSkipped: totalSkipped,
    desired,
    before,
    after,
    changes: moves.length,
  });
  totalChanges += moves.length;

  if (APPLY && moves.length > 0) {
    const newSrc = serializeFile(src, t.exportName, updated);
    fs.writeFileSync(fpath, newSrc, 'utf8');
  }
}

// 出力
const mode = APPLY ? 'APPLY' : 'DRY-RUN';
console.log(`\n=== balance_correct_index [${mode}] ===\n`);
const colHeader = ['file', 'N(shuf/skip)', 'desired', 'before', 'after', 'changes'];
console.log(colHeader.join('\t'));
for (const r of reports) {
  console.log([
    r.file.replace('data/modules/takken/questions/', ''),
    `${r.n}(${r.nShuffleable}/${r.nSkipped})`,
    `[${r.desired.join(',')}]`,
    fmtDist(r.before),
    fmtDist(r.after),
    r.changes,
  ].join('\t'));
}
console.log(`\nTotal changes: ${totalChanges}\n`);
if (DRY && !APPLY) {
  console.log('(dry-run) re-run with --apply to write changes.\n');
}
