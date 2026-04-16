// ============================================================
// Claude AI チャット API（プロキシ）
// Vercel Serverless Function
// POST /api/ai-chat
// 認証必須 — クライアントから直接Anthropic APIを叩かず、サーバー経由で安全に通信
// ============================================================

const { createClient } = require('@supabase/supabase-js');

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

const supabaseAdmin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// [FIX M2] 簡易レート制限（インメモリ、Vercel function単位）
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1分
const RATE_LIMIT_MAX = 15; // 1分15回

function checkRateLimit(userId) {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(userId, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return false;
  return true;
}

module.exports = async (req, res) => {
  // CORS — [FIX] Authorization ヘッダーを許可
  const origin = req.headers.origin;
  const allowed = ['https://takken-app-olive.vercel.app'];
  if (allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // --- [FIX C2] 認証チェック（Supabase Bearer Token） ---
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '認証が必要です' });
  }

  const token = authHeader.replace('Bearer ', '');
  let user;
  try {
    const { data, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !data?.user) {
      return res.status(401).json({ error: '無効な認証トークンです' });
    }
    user = data.user;
  } catch {
    return res.status(401).json({ error: '認証に失敗しました' });
  }

  // --- レート制限チェック ---
  if (!checkRateLimit(user.id)) {
    return res.status(429).json({ error: 'リクエストが多すぎます。1分後にお試しください。' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[AI] ANTHROPIC_API_KEY not set');
    return res.status(500).json({ error: 'AIサービスが設定されていません' });
  }

  try {
    const { context, messages } = req.body;

    // --- 入力バリデーション ---
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'メッセージが必要です' });
    }
    if (messages.length > 20) {
      return res.status(400).json({ error: 'メッセージ数が上限を超えています' });
    }
    // 各メッセージのバリデーション
    for (const m of messages) {
      if (!m.role || !['user', 'assistant'].includes(m.role)) {
        return res.status(400).json({ error: '不正なメッセージ形式です' });
      }
      if (!m.content || typeof m.content !== 'string' || m.content.length > 5000) {
        return res.status(400).json({ error: 'メッセージが長すぎます' });
      }
    }
    if (context && (typeof context !== 'string' || context.length > 10000)) {
      return res.status(400).json({ error: 'コンテキストが長すぎます' });
    }

    const systemPrompt = [
      'あなたは宅建試験（宅地建物取引士試験）の専門家の講師です。',
      '受験生から問題の解説について質問を受けています。',
      '',
      '以下のルールに従って回答してください：',
      '- 難しい法律用語は噛み砕いてわかりやすく説明する',
      '- 具体例を使って説明する',
      '- 関連する条文番号があれば添える',
      '- 簡潔に回答する（200文字程度を目安に、長すぎない）',
      '- 日本語で回答する',
      '- 親しみやすい口調で、でも正確に',
      '',
      context ? `【問題のコンテキスト】\n${context}` : '',
    ].join('\n');

    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[AI] Claude API ${response.status}:`, errText);

      if (response.status === 429) {
        return res.status(429).json({ error: 'リクエストが多すぎます。少し待ってからお試しください。' });
      }
      if (response.status === 401 || response.status === 403) {
        return res.status(500).json({ error: 'AIサービスの認証エラーです。' });
      }
      return res.status(500).json({ error: 'AI解説の取得に失敗しました。' });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text ?? '';

    return res.status(200).json({ text });
  } catch (err) {
    console.error('[AI] Error:', err.message);
    return res.status(500).json({ error: 'AIサービスに接続できません。' });
  }
};
