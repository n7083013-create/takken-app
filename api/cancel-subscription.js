// ============================================================
// PAY.JP サブスクリプション解約 API
// POST /api/cancel-subscription
// 認証必須 — 自分のサブスクリプションのみ解約可能
// ============================================================

const payjp = require('payjp')(process.env.PAYJP_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

module.exports = async (req, res) => {
  // --- CORS ---
  const origin = req.headers.origin;
  const allowed = ['https://takken-app-olive.vercel.app'];
  if (allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // --- 認証チェック ---
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '認証が必要です' });
  }

  try {
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: '無効な認証トークンです' });
    }

    // --- プロフィール取得 ---
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('payjp_subscription_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile?.payjp_subscription_id) {
      return res.status(400).json({ error: 'アクティブなサブスクリプションがありません' });
    }

    // --- PAY.JP サブスクリプション解約（期間終了時に停止） ---
    const result = await payjp.subscriptions.cancel(profile.payjp_subscription_id);
    const periodEnd = result.current_period_end
      ? new Date(result.current_period_end * 1000).toISOString()
      : null;

    // --- Supabase profiles 更新 ---
    // plan は 'standard' のまま維持（期間終了まで利用可能）
    // webhook subscription.deleted で最終的に plan: 'free' へ遷移
    await supabaseAdmin
      .from('profiles')
      .update({
        subscription_status: 'canceled',
        // plan は変更しない — ユーザーは期間終了まで利用可能
        subscription_ends_at: periodEnd,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    return res.status(200).json({
      success: true,
      message: '解約が完了しました。期間終了まで引き続きご利用いただけます。',
      periodEnd,
    });
  } catch (err) {
    console.error('[CancelSub] Error:', err.message);
    return res.status(500).json({ error: '解約処理に失敗しました' });
  }
};
