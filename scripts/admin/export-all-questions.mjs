// ============================================================
// all-questions.json 再生成スクリプト
// 実 .ts ソース(data/index.ts の ALL_QUESTIONS)から 4択全問を
// scripts/all-questions.json に書き出す。
// admin essence/explanation 生成スクリプトの入力を最新化する用途。
// 実行: npx tsx scripts/admin/export-all-questions.mjs
// 注意: このJSONはアプリ本体からは参照されない(アプリは .ts を直接 import)。
//       コンテンツの正本は常に data/modules/takken/questions/*.ts。
// ============================================================
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_QUESTIONS } from '../../data/index.ts';

const out = join(process.cwd(), 'scripts', 'all-questions.json');
writeFileSync(out, JSON.stringify(ALL_QUESTIONS, null, 2) + '\n', 'utf8');
console.log(`wrote ${ALL_QUESTIONS.length} questions -> ${out}`);
