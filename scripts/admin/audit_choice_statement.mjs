#!/usr/bin/env node
/**
 * audit_choice_statement.mjs
 *
 * 全問題をスキャンして choiceExplanations / statementExplanations が
 * 不足している問題を抽出し、enhance_explanations.mjs が読める形式で
 * scripts/admin/priority_review.json に出力する。
 *
 * 「不足」の定義:
 *  - choiceExplanations が空配列 or undefined
 *  - choiceExplanations[i] が空文字 or 30文字未満
 *  - statements がある問題で statementExplanations が同様に不足
 *
 * Usage:
 *   node scripts/admin/audit_choice_statement.mjs
 *   node scripts/admin/audit_choice_statement.mjs --out=scripts/admin/priority_review.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');

const args = process.argv.slice(2);
const argMap = Object.fromEntries(
  args
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=');
      return [k, v ?? true];
    }),
);

const OUT_REL = argMap.out || 'scripts/admin/priority_review.json';
const OUT = path.join(ROOT, OUT_REL);

// ─────────────────────────────────────────────────────────────
// 問題データを直接ロード (tsx 不要、TypeScript ソースを正規表現で抽出)
// ─────────────────────────────────────────────────────────────
const QUESTION_FILES = [
  'data/modules/takken/questions/kenri.ts',
  'data/modules/takken/questions/takkengyoho.ts',
  'data/modules/takken/questions/horei_seigen.ts',
  'data/modules/takken/questions/tax_other.ts',
];

/** 動的 import で TypeScript を直接読む (tsx ランタイム必要) */
async function loadAllQuestions() {
  const indexPath = path.join(ROOT, 'data', 'index.ts');
  // tsx loader 経由でデータをロード
  const { ALL_QUESTIONS } = await import(`file://${indexPath}`);
  return ALL_QUESTIONS;
}

function isShort(s) {
  return !s || typeof s !== 'string' || s.trim().length < 30;
}

function isInsufficient(q) {
  const choicesMissing =
    !Array.isArray(q.choiceExplanations) ||
    q.choiceExplanations.length === 0 ||
    q.choiceExplanations.some(isShort);
  const stmtMissing =
    Array.isArray(q.statements) &&
    q.statements.length > 0 &&
    (!Array.isArray(q.statementExplanations) ||
      q.statementExplanations.length === 0 ||
      q.statementExplanations.some(isShort));
  return { choicesMissing, stmtMissing, any: choicesMissing || stmtMissing };
}

async function main() {
  const ALL = await loadAllQuestions();
  console.log(`全問題: ${ALL.length}`);

  const targets = [];
  let countMissingChoice = 0;
  let countMissingStmt = 0;

  for (const q of ALL) {
    const r = isInsufficient(q);
    if (!r.any) continue;
    if (r.choicesMissing) countMissingChoice++;
    if (r.stmtMissing) countMissingStmt++;
    targets.push({
      id: q.id,
      category: q.category,
      reasons: [r.choicesMissing && 'choices', r.stmtMissing && 'statements']
        .filter(Boolean)
        .join('+'),
      original: q,
    });
  }

  console.log(`choiceExplanations 不足: ${countMissingChoice}`);
  console.log(`statementExplanations 不足: ${countMissingStmt}`);
  console.log(`合計対象: ${targets.length}`);

  const out = {
    generated_at: new Date().toISOString(),
    total: ALL.length,
    target_count: targets.length,
    top: targets,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
  console.log(`Output: ${OUT_REL}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
