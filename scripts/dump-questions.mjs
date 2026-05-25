#!/usr/bin/env node
// ============================================================
// 全問題を JSON ファイルに書き出すスクリプト
// ============================================================
// 使い方:
//   node scripts/dump-questions.mjs
//
// 出力:
//   scripts/all-questions.json (生成スクリプトが読み込む)
//
// TypeScript ファイルから問題データを抽出するため、簡易パーサーを使う
// (ts-node なしで動かす)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_PATH = path.join(ROOT, 'scripts', 'all-questions.json');

/**
 * tsx を使ってTypeScriptを直接実行し、ALL_QUESTIONSを吐き出す
 * tsx が無ければ ts-node → 最終手段として出力ファイル経由
 */
function runWithTsx() {
  const tempScript = path.join(ROOT, 'scripts', '_dump-runner.ts');
  const tsCode = `
import { ALL_QUESTIONS } from '../data';
import fs from 'fs';
import path from 'path';

const output = path.join(__dirname, 'all-questions.json');
fs.writeFileSync(output, JSON.stringify(ALL_QUESTIONS, null, 2), 'utf8');
console.log(\`✅ Dumped \${ALL_QUESTIONS.length} questions to \${output}\`);
`;

  fs.writeFileSync(tempScript, tsCode, 'utf8');

  try {
    // tsx を試す（最もシンプル）
    execSync(`npx --yes tsx "${tempScript}"`, { cwd: ROOT, stdio: 'inherit' });
  } finally {
    // 一時ファイル削除
    try { fs.unlinkSync(tempScript); } catch {}
  }
}

try {
  runWithTsx();
  const dump = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
  console.log(`📊 Categories:`);
  const byCat = {};
  for (const q of dump) byCat[q.category] = (byCat[q.category] ?? 0) + 1;
  Object.entries(byCat).forEach(([cat, n]) => console.log(`  - ${cat}: ${n}問`));
} catch (e) {
  console.error('❌ Dump failed:', e.message);
  console.error('   Try: npm install -D tsx');
  process.exit(1);
}
