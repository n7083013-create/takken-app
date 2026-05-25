#!/usr/bin/env node
// ============================================================
// 1行エッセンス生成（ローカル実行版）
// ============================================================
// 使い方:
//   export ANTHROPIC_API_KEY=sk-ant-xxxxx
//   node scripts/generate-core-essences.mjs [limit]
//
// 例: node scripts/generate-core-essences.mjs 20   # 最初の20問
//     node scripts/generate-core-essences.mjs all  # 全問題
//
// 注: サーバー側で実行する場合は /api/admin/generate-essences を使用し、
//     scripts/run-essence-batches.sh でバッチ起動する方がシンプル

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const INPUT_PATH = path.join(ROOT, 'scripts', 'all-questions.json');
const OUTPUT_PATH = path.join(ROOT, 'scripts', 'core-essences-output.json');

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY が設定されていません');
  process.exit(1);
}

const SYSTEM_PROMPT = `あなたは宅建士試験の教材制作専門家です。問題文・選択肢・解説を読み、その問題が問うている論点の核心（法的事実）を1文で要約してください。

【重要なルール】
- 覚え方・語呂ではなく、事実ベースの論点要約
- 1文のみ（20〜45文字が理想）
- 専門用語は使ってOK（受験者は理解している前提）
- 「〜である」「〜が必要」「〜は守られる」など断定調
- 条文番号や数字は具体的に（例: 35条、20年）
- 法的に絶対に正確であること（不確かならスキップ）

【良い例】
→「善意の第三者は登記なしでも保護される（民法177条）」
→「代金の10%超 or 1,000万円超の手付は保全措置必須」
→「2都道府県以上に事務所があれば大臣免許」

出力は JSON の配列のみ: [{"id": "...", "coreEssence": "..."}, ...]`;

async function callClaude(questions) {
  const userMsg = `以下の問題にそれぞれ1行エッセンスを生成してください。
JSONの配列のみで回答（前置き・説明なし）:

${questions.map((q, i) => `---
[${i + 1}] id: ${q.id}
問題: ${q.text}
選択肢: ${q.choices.map((c, j) => `${'ABCD'[j]}. ${c}`).join(' / ')}
正解: ${'ABCD'[q.correctIndex]}
解説: ${q.explanation}`).join('\n')}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMsg }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API ${response.status}: ${await response.text()}`);
  }

  const result = await response.json();
  const text = result.content?.[0]?.text ?? '';
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('JSON extraction failed');
  return JSON.parse(match[0]);
}

async function main() {
  const limitArg = process.argv[2] || '20';

  if (!fs.existsSync(INPUT_PATH)) {
    console.error(`❌ ${INPUT_PATH} が見つかりません`);
    console.error('   先に: npm run essences:dump を実行');
    process.exit(1);
  }

  const allQuestions = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
  const limit = limitArg === 'all' ? allQuestions.length : parseInt(limitArg, 10);
  const target = allQuestions.slice(0, limit);

  console.log(`📝 ${target.length}問 のエッセンスを生成します`);

  // 既存の結果は上書きせず再利用
  let existing = {};
  if (fs.existsSync(OUTPUT_PATH)) {
    try {
      const raw = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
      for (const item of raw) existing[item.id] = item.coreEssence;
      console.log(`  既存の ${Object.keys(existing).length}件を再利用`);
    } catch {}
  }

  const BATCH_SIZE = 5;
  const results = [];

  for (let i = 0; i < target.length; i += BATCH_SIZE) {
    const batch = target.slice(i, i + BATCH_SIZE).filter((q) => !existing[q.id]);

    if (batch.length === 0) {
      target.slice(i, i + BATCH_SIZE).forEach((q) => {
        if (existing[q.id]) results.push({ id: q.id, coreEssence: existing[q.id] });
      });
      continue;
    }

    console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length}問生成中...`);
    try {
      const batchResults = await callClaude(batch);
      results.push(...batchResults);
      // 都度保存（レジューム可能）
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2), 'utf8');
    } catch (e) {
      console.error(`  ❌ ${e.message}`);
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`\n✅ 完了: ${results.length}問`);
  console.log(`   出力: ${OUTPUT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
