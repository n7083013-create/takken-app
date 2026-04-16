// ============================================================
// サブスクリプション検証 API
// POST /api/verify-subscription
// クライアントからの起動時チェック用
// Supabase profiles テーブルの plan を信頼する（PAY.JP Webhook で更新される）
// ============================================================

const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// past_due の猶予期間（7日）
const PAST_DUE_GRACE_DAYS = 7;

module.exports = async (req, res) => {
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
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // --- profiles テーブルからプラン情報を取得 ---
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('plan, subscription_status, trial_ends_at, subscription_ends_at')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('[VerifySub] Profile fetch error:', profileError.message);
      return res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }

    if (!profile) {
      // プロフィールが未作成（古いユーザー）→ 自動作成
      await supabaseAdmin.from('profiles').insert({
        id: user.id,
        email: user.email,
        plan: 'free',
      });
      return res.status(200).json({
        plan: 'free',
        isPro: false,
        subscriptionStatus: 'none',
      });
    }

    // --- プラン状態の判定 ---
    let isPro = profile.plan === 'standard';

    // トライアル期限チェック
    if (profile.subscription_status === 'trialing' && profile.trial_ends_at) {
      isPro = new Date(profile.trial_ends_at) > new Date();
    }
    // 課金期限チェック
    if (profile.subscription_status === 'active' && profile.subscription_ends_at) {
      isPro = new Date(profile.subscription_ends_at) > new Date();
    }
    // [FIX H5] past_due は猶予期間（7日）のみPro維持
    if (profile.subscription_status === 'past_due') {
      if (profile.subscription_ends_at) {
        const endDate = new Date(profile.subscription_ends_at);
        const graceEnd = new Date(endDate.getTime() + PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000);
        isPro = new Date() < graceEnd;
      } else {
        isPro = false;
      }
    }
    // canceled は常に free
    if (profile.subscription_status === 'canceled') {
      isPro = false;
    }

    return res.status(200).json({
      plan: isPro ? 'standard' : 'free',
      isPro,
      subscriptionStatus: profile.subscription_status,
      trialEndsAt: profile.trial_ends_at,
      subscriptionEndsAt: profile.subscription_ends_at,
    });
  } catch (err) {
    console.error('[VerifySub] Error:', err.message);
    return res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
};
