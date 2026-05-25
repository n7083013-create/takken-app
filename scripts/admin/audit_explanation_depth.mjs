#!/usr/bin/env node
/**
 * audit_explanation_depth.mjs
 *
 * 既存の宅建問題（4択）の explanation / choiceExplanations の「深度」を分析し、
 * 浅い解説をスコアリングして priority_review.json を出力する。
 *
 * 浅い解説の判定基準:
 *  1. choiceExplanations[i] が極端に短い（< 25 文字）
 *  2. choiceExplanations[i] が「正しい。」「誤り。」のみ、または条文番号のみで終わる
 *  3. explanation 全体の文字数が短い（< 120 文字）
 *  4. 「なぜ」を示す接続表現がない（〜だから / 〜ため / 〜により / 〜根拠 / 〜判例 等）
 *  5. 条文番号のみ含み、内容説明がない（「民法第○条」「宅建業法第○条」のみ）
 *
 * スコア: 大きいほど浅い（0=深い、最大10=非常に浅い）
 *
 * Usage:
 *   node scripts/admin/audit_explanation_depth.mjs
 *   node scripts/admin/audit_explanation_depth.mjs --top=50
 *   node scripts/admin/audit_explanation_depth.mjs --out=scripts/admin/priority_review.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');

const TARGETS = [
  'data/modules/takken/questions/kenri.ts',
  'data/modules/takken/questions/takkengyoho.ts',
  'data/modules/takken/questions/horei_seigen.ts',
  'data/modules/takken/questions/tax_other.ts',
];

const args = process.argv.slice(2);
const argMap = Object.fromEntries(
  args
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=');
      return [k, v ?? true];
    })
);
const TOP = argMap.top ? parseInt(argMap.top, 10) : 50;
const OUT_REL = argMap.out || 'scripts/admin/priority_review.json';
const OUT = path.join(ROOT, OUT_REL);

// ─────────────────────────────────────────────────────────────
// Question 抽出（TS ソースを正規表現でパース）
// ─────────────────────────────────────────────────────────────
//
// 各問題は最上位の `{ ... }` ブロック。テキスト本体は複数行の
// テンプレート/結合文字列を含むため、安全に切り出すため簡易ステートマシンを使う。
//
function extractQuestions(src, fileLabel) {
  const lines = src.split('\n');
  const questions = [];
  let depth = 0;
  let buf = [];
  let started = false;
  let startLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!started) {
      // 問題オブジェクト開始: インデント 2 の "{"
      if (/^  \{\s*$/.test(line)) {
        started = true;
        depth = 1;
        buf = [line];
        startLine = i + 1;
      }
      continue;
    }
    buf.push(line);
    // depth 計算（文字列内の括弧は素直にカウントしない簡易実装。tsで実害なし）
    for (const ch of line) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
    if (depth === 0) {
      // ブロック完了
      const block = buf.join('\n');
      questions.push({
        block,
        startLine,
        fileLabel,
        ...parseFields(block),
      });
      started = false;
      buf = [];
    }
  }
  return questions;
}

function parseFields(block) {
  const idMatch = block.match(/^\s+id:\s*'([^']+)'/m);
  const id = idMatch ? idMatch[1] : null;
  const explanation = extractStringField(block, 'explanation');
  const choiceExplanations = extractArrayOfStrings(block, 'choiceExplanations');
  const text = extractStringField(block, 'text');
  const correctIndex = parseInt(
    (block.match(/^\s+correctIndex:\s*(\d)/m) || [])[1] || '0',
    10
  );
  const choices = extractArrayOfStrings(block, 'choices');
  const tags = extractArrayOfStrings(block, 'tags');
  const needsReview = /needsReview:\s*true/.test(block);
  const category = (block.match(/^\s+category:\s*'([^']+)'/m) || [])[1] || '';
  const questionFormat =
    (block.match(/^\s+questionFormat:\s*'([^']+)'/m) || [])[1] || 'standard';
  const statements = extractArrayOfStrings(block, 'statements');
  const statementExplanations = extractArrayOfStrings(
    block,
    'statementExplanations'
  );
  return {
    id,
    text,
    explanation,
    choiceExplanations,
    correctIndex,
    choices,
    tags,
    needsReview,
    category,
    questionFormat,
    statements,
    statementExplanations,
  };
}

// `fieldName: '...'` または `fieldName:\n  '...' + ...` を結合して取得
function extractStringField(block, name) {
  // 単純な単一行 'literal'
  const single = block.match(
    new RegExp(`^\\s+${name}:\\s*'((?:[^'\\\\]|\\\\.)*)',?\\s*$`, 'm')
  );
  if (single) return unescapeJs(single[1]);
  // テンプレート ` `
  const tpl = block.match(
    new RegExp(`^\\s+${name}:\\s*\\\`((?:[^\\\\\\\`]|\\\\.)*)\\\`,?\\s*$`, 'm')
  );
  if (tpl) return tpl[1];
  // 複数行の結合 `'...' +\n      '...' +\n      '...',`
  const startIdx = block.search(new RegExp(`^\\s+${name}:\\s*$`, 'm'));
  if (startIdx >= 0) {
    // 名前: の次行から、次のフィールド開始（^\s+\w+:）まで
    const after = block.slice(startIdx);
    const lines = after.split('\n');
    let pieces = [];
    // 1行目は "explanation:" のみ。2行目以降を順に
    for (let i = 1; i < lines.length; i++) {
      const ln = lines[i];
      // 次のフィールド開始？（インデント直後 word: で、自身が文字列リテラルでない）
      if (/^\s+[a-zA-Z_$][\w]*\s*:/.test(ln) && !/^\s+'/.test(ln)) break;
      // 単純な `'...'` 行
      const m = ln.match(/'((?:[^'\\]|\\.)*)'/);
      if (m) pieces.push(unescapeJs(m[1]));
      // 末尾 , でブロック終了
      if (/,\s*$/.test(ln) && !/'\s*\+/.test(ln)) {
        // 行末がカンマで、かつ「+」継続でなければ終わり
        if (m) break;
      }
    }
    if (pieces.length) return pieces.join('');
  }
  return '';
}

function extractArrayOfStrings(block, name) {
  // 単純な単一行 [ '...', '...', ... ]
  // ただし 'a', 'b', 'c', 'd' のような複数行も多数あるので両対応
  const startRe = new RegExp(`^\\s+${name}:\\s*\\[\\s*$`, 'm');
  const startSingleRe = new RegExp(`^\\s+${name}:\\s*\\[(.*)\\],?\\s*$`, 'm');
  const single = block.match(startSingleRe);
  if (single) {
    return parseInlineStrings(single[1]);
  }
  const startMatch = block.match(startRe);
  if (!startMatch) return [];
  const startPos = block.indexOf(startMatch[0]);
  const after = block.slice(startPos + startMatch[0].length + 1);
  // 配列終端 `  ],` まで
  const endMatch = after.match(/^\s*\],?\s*$/m);
  if (!endMatch) return [];
  const inner = after.slice(0, after.indexOf(endMatch[0]));
  // inner には各要素行が並ぶ。'...', または `...` をかき集める
  const items = [];
  const lines = inner.split('\n');
  let acc = '';
  let inString = false;
  for (const ln of lines) {
    // 行頭空白の後の文字列開始
    // 1要素 = 1行 か '....' + '...' のような結合
    // 単純: 1行ごとに quoted strings を抽出して結合
    const trimmed = ln.trim();
    if (!trimmed) continue;
    // `'..'` パターン抽出
    const matches = [...trimmed.matchAll(/'((?:[^'\\]|\\.)*)'/g)];
    if (matches.length === 0) continue;
    const joined = matches.map((m) => unescapeJs(m[1])).join('');
    // trailing comma で 1要素確定
    if (/,\s*$/.test(trimmed) || trimmed.endsWith("'")) {
      items.push(joined);
    } else {
      // 継続: 次行と結合（簡易）
      // ※実データでは 1要素=1行 がほとんど
      items.push(joined);
    }
  }
  return items;
}

function parseInlineStrings(s) {
  return [...s.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => unescapeJs(m[1]));
}
function unescapeJs(s) {
  return s.replace(/\\'/g, "'").replace(/\\\\/g, '\\').replace(/\\n/g, '\n');
}

// ─────────────────────────────────────────────────────────────
// 浅さスコアリング
// ─────────────────────────────────────────────────────────────
const REASON_MARKERS = [
  'から',
  'ため',
  'により',
  'よって',
  'なぜなら',
  '判例',
  '反対解釈',
  'すなわち',
  '要件',
  '効果',
  '趣旨',
  '理由は',
];
const ARTICLE_ONLY_RE = /^[\s\S]*?(?:正しい|誤り)。\s*[（(]?(?:民法|宅建業法|借地借家法|区分所有法|不動産登記法|建築基準法|都市計画法|国土利用計画法|農地法|宅地造成|相続税法|印紙税法|登録免許税法|所得税法|地方税法|租税特別措置法)[^。]*[）)]?\s*$/;

function scoreShallow(q) {
  let score = 0;
  const reasons = [];
  const exp = q.explanation || '';
  const ces = q.choiceExplanations || [];

  // 1) explanation 長さ
  if (exp.length < 80) {
    score += 3;
    reasons.push(`explanation短い(${exp.length}文字)`);
  } else if (exp.length < 150) {
    score += 1;
    reasons.push(`explanationやや短い(${exp.length}文字)`);
  }

  // 2) explanation に理由表現がない
  const hasReason = REASON_MARKERS.some((m) => exp.includes(m));
  if (!hasReason && exp.length > 0) {
    score += 2;
    reasons.push('explanation理由表現なし');
  }

  // 3) choiceExplanations の浅さ
  if (!ces.length) {
    score += 4;
    reasons.push('choiceExplanationsなし');
  } else {
    let shortCount = 0;
    let articleOnlyCount = 0;
    let noReasonCount = 0;
    for (const c of ces) {
      if (c.length < 25) shortCount++;
      if (ARTICLE_ONLY_RE.test(c)) articleOnlyCount++;
      const cHasReason = REASON_MARKERS.some((m) => c.includes(m));
      if (!cHasReason) noReasonCount++;
    }
    if (shortCount >= 2) {
      score += 2;
      reasons.push(`choiceExp短い×${shortCount}`);
    } else if (shortCount >= 1) {
      score += 1;
      reasons.push(`choiceExp短い×${shortCount}`);
    }
    if (articleOnlyCount >= 2) {
      score += 2;
      reasons.push(`条文番号のみ×${articleOnlyCount}`);
    }
    if (noReasonCount >= 3) {
      score += 1;
      reasons.push(`理由なし×${noReasonCount}`);
    }
  }

  return { score, reasons };
}

// ─────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────
const all = [];
for (const rel of TARGETS) {
  const fpath = path.join(ROOT, rel);
  const src = fs.readFileSync(fpath, 'utf8');
  const qs = extractQuestions(src, rel);
  for (const q of qs) {
    if (!q.id) continue;
    const { score, reasons } = scoreShallow(q);
    all.push({
      id: q.id,
      file: rel,
      category: q.category,
      tags: q.tags,
      needsReview: q.needsReview,
      score,
      shallowReasons: reasons,
      stats: {
        explanationLen: (q.explanation || '').length,
        choiceExplanationsLen: (q.choiceExplanations || []).map((c) => c.length),
      },
      // 後段のAI拡張で必要な原データ
      original: {
        text: q.text,
        choices: q.choices,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        choiceExplanations: q.choiceExplanations,
        tags: q.tags,
        questionFormat: q.questionFormat,
        statements: q.statements,
        statementExplanations: q.statementExplanations,
      },
    });
  }
}

all.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
const worst = all.slice(0, TOP);

// 統計
const totalQ = all.length;
const distribution = { '0': 0, '1-2': 0, '3-4': 0, '5-6': 0, '7+': 0 };
for (const q of all) {
  if (q.score === 0) distribution['0']++;
  else if (q.score <= 2) distribution['1-2']++;
  else if (q.score <= 4) distribution['3-4']++;
  else if (q.score <= 6) distribution['5-6']++;
  else distribution['7+']++;
}

console.log(`\n=== Explanation Depth Audit ===`);
console.log(`Total questions analyzed: ${totalQ}`);
console.log(`Score distribution (higher = shallower):`);
for (const [k, v] of Object.entries(distribution)) {
  const pct = ((v / totalQ) * 100).toFixed(1);
  console.log(`  score ${k.padEnd(4)}: ${String(v).padStart(4)} (${pct}%)`);
}

console.log(`\nTop ${TOP} shallowest questions:`);
console.log('id\tfile\tscore\treasons');
for (const w of worst) {
  console.log(
    `${w.id}\t${w.file.replace('data/modules/takken/questions/', '')}\t${w.score}\t${w.shallowReasons.join(', ')}`
  );
}

// 出力
const outDir = path.dirname(OUT);
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      totalAnalyzed: totalQ,
      distribution,
      top: worst,
    },
    null,
    2
  ),
  'utf8'
);
console.log(`\nWrote: ${OUT_REL} (top ${TOP} questions)`);
