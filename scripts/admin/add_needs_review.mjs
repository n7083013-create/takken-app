#!/usr/bin/env node
/**
 * add_needs_review.mjs
 *
 * 全自動生成問題（4択 + 一問一答）に needsReview フラグを付与する。
 *
 * 戦略:
 *  - needsReview が未定義の問題 → needsReview: true を付加（人間レビュー未完了マーカー）
 *  - レビュー済みの問題（REVIEWED_IDS に列挙） → needsReview: false
 *  - 既に needsReview が定義されている問題は触らない（冪等）
 *
 * 実装方針:
 *  - 各オブジェクト内の `tags:` 行の直後に `needsReview: <bool>,` を 1 行挿入する
 *    - tags の出現位置はファイル構造上、各問題オブジェクトの末尾近くに 1 回だけ
 *  - 配列リテラル全体を eval せず、原文の整形・コメント・空行を完全保存する
 *
 * Usage:
 *   node scripts/admin/add_needs_review.mjs --dry-run
 *   node scripts/admin/add_needs_review.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');

const TARGETS = [
  // 4択問題
  'data/modules/takken/questions/kenri.ts',
  'data/modules/takken/questions/takkengyoho.ts',
  'data/modules/takken/questions/horei_seigen.ts',
  'data/modules/takken/questions/tax_other.ts',
  // 一問一答
  'data/modules/takken/quick-quiz/kenri.ts',
  'data/modules/takken/quick-quiz/takkengyoho.ts',
  'data/modules/takken/quick-quiz/horei_seigen.ts',
  'data/modules/takken/quick-quiz/tax_other.ts',
];

// 人間レビュー済み（needsReview: false を明示）
const REVIEWED_IDS = new Set([
  'takkengyoho-004',
  'takkengyoho-058',
]);

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY = !APPLY || args.includes('--dry-run');

// id を取得（トップレベルオブジェクト 1 件単位）
// 各オブジェクトは "  {" で始まり "  }," で終わる前提
// オブジェクト内には id: '...', tags: [...], などが現れる
function processFile(src) {
  const lines = src.split('\n');
  const out = [];

  let inObject = false;
  // 現オブジェクトの開始行（"  {" の行）の out 内 index
  let currentObjectStartOut = -1;
  let currentId = null;
  let currentHasNeedsReview = false;
  let currentTagsOutIdx = -1; // out に push した tags 行のインデックス
  let currentObjectIndent = ''; // オブジェクト内のフィールド字下げ ("    " 等)

  let countTotal = 0;
  let countAlready = 0;
  let countAddedTrue = 0;
  let countAddedFalse = 0;

  // tags 行直後に needsReview を挿入する関数（this object のクローズ時に呼ぶ）
  function flushObject() {
    if (currentId == null) return; // id を見つけられなかったオブジェクトはスキップ
    countTotal++;
    if (currentHasNeedsReview) {
      countAlready++;
      return;
    }
    if (currentTagsOutIdx === -1) {
      // tags 行が見つからない（万が一の構造異常）→ 触らない
      countAlready++;
      return;
    }
    const reviewed = REVIEWED_IDS.has(currentId);
    const value = reviewed ? 'false' : 'true';
    if (reviewed) countAddedFalse++;
    else countAddedTrue++;
    // tags 行の直後に挿入
    const insertLine = `${currentObjectIndent}needsReview: ${value},`;
    // 挿入位置: out[currentTagsOutIdx] の後
    out.splice(currentTagsOutIdx + 1, 0, insertLine);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // オブジェクト開始の検出: 行を trim したときに "{" のみ、または末尾が "{"
    if (!inObject) {
      // "  {" のみの行をオブジェクト開始とみなす
      if (/^\s*\{\s*$/.test(line)) {
        inObject = true;
        currentObjectStartOut = out.length;
        currentId = null;
        currentHasNeedsReview = false;
        currentTagsOutIdx = -1;
        currentObjectIndent = '';
      }
      out.push(line);
      continue;
    }

    // オブジェクト内
    // インデント取得（id, tags 行のインデント）
    const indentMatch = line.match(/^(\s+)/);
    if (indentMatch && currentObjectIndent === '') {
      // 最初に出会ったフィールド行のインデントを採用
      // ただし、ネストした配列要素の行は除外したいので、明確なフィールド行のみ採用
      if (/^\s+[a-zA-Z_$][\w]*:/.test(line)) {
        currentObjectIndent = indentMatch[1];
      }
    }

    // id 取得
    const idMatch = line.match(/^\s+id:\s*'([^']+)'/);
    if (idMatch && currentId == null) {
      currentId = idMatch[1];
    }

    // needsReview の存在チェック
    if (/^\s+needsReview\s*:/.test(line)) {
      currentHasNeedsReview = true;
    }

    // tags 行: "    tags: [...]," の形式（同一行で完結する想定）
    // 同一行で閉じない場合（複数行配列）はサポート外（実データでは未使用）
    if (/^\s+tags:\s*\[/.test(line)) {
      // out に push する直前の長さ = 挿入位置
      currentTagsOutIdx = out.length;
    }

    // オブジェクト終了の検出: "  }," または "  }"（最後の要素）
    if (/^\s*\},?\s*$/.test(line)) {
      out.push(line);
      flushObject();
      inObject = false;
      currentObjectStartOut = -1;
      currentId = null;
      currentHasNeedsReview = false;
      currentTagsOutIdx = -1;
      currentObjectIndent = '';
      continue;
    }

    out.push(line);
  }

  return {
    text: out.join('\n'),
    countTotal,
    countAlready,
    countAddedTrue,
    countAddedFalse,
  };
}

// before/after の needsReview 件数を素直に数える（true / false / 未定義）
function countDistribution(src) {
  // オブジェクト単位で id があり、その後 closing "}" までに needsReview が出るか
  const lines = src.split('\n');
  let inObject = false;
  let currentId = null;
  let currentNeedsReview = null; // null=未定義, 'true', 'false'
  const buckets = { undefined: 0, true: 0, false: 0 };

  for (const line of lines) {
    if (!inObject) {
      if (/^\s*\{\s*$/.test(line)) {
        inObject = true;
        currentId = null;
        currentNeedsReview = null;
      }
      continue;
    }
    if (currentId == null) {
      const m = line.match(/^\s+id:\s*'([^']+)'/);
      if (m) currentId = m[1];
    }
    const nr = line.match(/^\s+needsReview\s*:\s*(true|false)/);
    if (nr) currentNeedsReview = nr[1];

    if (/^\s*\},?\s*$/.test(line)) {
      if (currentId != null) {
        if (currentNeedsReview == null) buckets.undefined++;
        else buckets[currentNeedsReview]++;
      }
      inObject = false;
    }
  }
  return buckets;
}

// --- main ---
const reports = [];
let grandTotal = 0;
let grandAlready = 0;
let grandAddedTrue = 0;
let grandAddedFalse = 0;

for (const rel of TARGETS) {
  const fpath = path.join(ROOT, rel);
  const src = fs.readFileSync(fpath, 'utf8');

  const before = countDistribution(src);
  const result = processFile(src);
  const after = countDistribution(result.text);

  reports.push({
    file: rel,
    total: result.countTotal,
    already: result.countAlready,
    addedTrue: result.countAddedTrue,
    addedFalse: result.countAddedFalse,
    before,
    after,
  });
  grandTotal += result.countTotal;
  grandAlready += result.countAlready;
  grandAddedTrue += result.countAddedTrue;
  grandAddedFalse += result.countAddedFalse;

  if (APPLY && (result.countAddedTrue + result.countAddedFalse) > 0) {
    fs.writeFileSync(fpath, result.text, 'utf8');
  }
}

const mode = APPLY ? 'APPLY' : 'DRY-RUN';
console.log(`\n=== add_needs_review [${mode}] ===\n`);
console.log('file\ttotal\talready\t+true\t+false\tbefore(undef/T/F)\tafter(undef/T/F)');
for (const r of reports) {
  const b = `${r.before.undefined}/${r.before.true}/${r.before.false}`;
  const a = `${r.after.undefined}/${r.after.true}/${r.after.false}`;
  console.log([
    r.file.replace('data/modules/takken/', ''),
    r.total,
    r.already,
    r.addedTrue,
    r.addedFalse,
    b,
    a,
  ].join('\t'));
}
console.log(`\nTotal: questions=${grandTotal}  already=${grandAlready}  +needsReview:true=${grandAddedTrue}  +needsReview:false=${grandAddedFalse}`);
if (DRY && !APPLY) {
  console.log('\n(dry-run) re-run with --apply to write changes.\n');
}
