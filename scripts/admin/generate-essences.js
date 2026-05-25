// ============================================================
// 1行エッセンス生成 管理エンドポイント
// ============================================================
// POST /api/admin/generate-essences?limit=20&offset=0
// ADMIN_SECRET による Bearer 認証必須
//
// Vercel に設定済みの ANTHROPIC_API_KEY を使ってサーバー側で生成
// 結果は JSON で返却 → クライアントでレビュー→マージの流れ
//
// 必要な環境変数:
//   ADMIN_SECRET      - 管理者認証用シークレット
//   ANTHROPIC_API_KEY - Claude API キー

const crypto = require('crypto');

// Node ランタイムで読み込むため、事前にダンプした JSON ファイルを読む
const path = require('path');
const fs = require('fs');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  try {
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

const SYSTEM_PROMPT = `あなたは宅建士試験の教材制作専門家です。問題文・選択肢・解説を読み、その問題が問うている論点の核心（法的事実）を1文で要約してください。

【重要なルール】
- 覚え方・語呂ではなく、事実ベースの論点要約
- 1文のみ（20〜45文字が理想）
- 専門用語は使ってOK（受験者は理解している前提）
- 「〜である」「〜が必要」「〜は守られる」など断定調
- 条文番号や数字は具体的に（例: 35条、20年）
- 覚えれば試験で即座に正解が思いつく内容
- 法的に絶対に正確であること（不確かならスキップ）

【良い例】
問題: 善意の第三者に対抗できるか
→ 「善意の第三者は登記なしでも保護される（民法177条）」

問題: 手付金等の保全措置
→ 「代金の10%超 or 1,000万円超の手付は保全措置必須」

問題: 宅建業免許
→ 「2都道府県以上に事務所があれば大臣免許」

【悪い例】
×「抵当権はちゃんと勉強しましょう」（情報量ゼロ）
×「民法について考えてみよう」（内容が薄い）
×「30年覚えておこう」（語呂合わせ風）

出力は JSON の配列のみ: [{"id": "...", "coreEssence": "..."}, ...]`;

async function callClaude(questions) {
  const userMsg = `以下の問題にそれぞれ1行エッセンスを生成してください。
JSONの配列のみで回答（前置き・説明なし）:
[{"id": "q_xxx", "coreEssence": "..."}, ...]

問題リスト:
${questions.map((q, i) => `---
[${i + 1}] id: ${q.id}
問題: ${q.text}
選択肢: ${q.choices.map((c, j) => `${'ABCD'[j]}. ${c}`).join(' / ')}
正解: ${'ABCD'[q.correctIndex]}
解説: ${q.explanation}`).join('\n')}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
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
    const err = await response.text();
    throw new Error(`Claude API ${response.status}: ${err}`);
  }

  const result = await response.json();
  const text = result.content?.[0]?.text ?? '';
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('JSON extraction failed');
  return JSON.parse(match[0]);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 認証: ADMIN_SECRET
  const authHeader = req.headers.authorization || '';
  const providedSecret = authHeader.replace('Bearer ', '');
  if (!ADMIN_SECRET || !timingSafeEqual(providedSecret, ADMIN_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });
  }

  // パラメータ
  const limit = Math.min(50, parseInt(req.query.limit || '20', 10));  // 一度に最大50問
  const offset = parseInt(req.query.offset || '0', 10);

  // 問題 JSON を読み込み
  let allQuestions;
  try {
    const jsonPath = path.join(process.cwd(), 'scripts', 'all-questions.json');
    allQuestions = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load questions JSON', detail: e.message });
  }

  const target = allQuestions.slice(offset, offset + limit);
  if (target.length === 0) {
    return res.status(200).json({ ok: true, results: [], message: 'No more questions', total: allQuestions.length });
  }

  // バッチ処理（5問ずつ）
  const BATCH_SIZE = 5;
  const results = [];
  const errors = [];

  for (let i = 0; i < target.length; i += BATCH_SIZE) {
    const batch = target.slice(i, i + BATCH_SIZE);
    try {
      const batchResults = await callClaude(batch);
      results.push(...batchResults);
    } catch (e) {
      errors.push({ batch: Math.floor(i / BATCH_SIZE) + 1, error: e.message });
    }
    // レート制限配慮
    await new Promise((r) => setTimeout(r, 500));
  }

  return res.status(200).json({
    ok: true,
    results,
    errors,
    meta: {
      limit,
      offset,
      processed: target.length,
      generated: results.length,
      total: allQuestions.length,
      nextOffset: offset + limit,
    },
  });
};
