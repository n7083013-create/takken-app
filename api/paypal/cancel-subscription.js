// ============================================================
// PayPal サブスクリプション解約 API
// POST /api/paypal/cancel-subscription
// ============================================================

const { paypalFetch } = require('../_paypal-utils');
const { createClient } = require('@supabase/supabase-js');
const { captureServerException, flushSentry } = require('../_sentry');

const supabaseAdmin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

module.exports = async (req, res) => {
  const origin = req.headers.origin;
  const allowed = ['https://takken-app-olive.vercel.app', 'https://takkenkanzen.com', 'https://www.takkenkanzen.com', 'https://app.takkenkanzen.com'];
  if (allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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

    // メール確認必須（OAuth は自動確認済み・email/password はリンククリック必要）
    if (!user.email_confirmed_at) {
      return res.status(403).json({
        error: 'メール確認が完了していません。',
        code: 'email_not_confirmed',
      });
    }

    // サブスクID取得
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('paypal_subscription_id, subscription_status')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile?.paypal_subscription_id) {
      return res.status(400).json({ error: '解約対象のサブスクリプションが見つかりません' });
    }

    if (profile.subscription_status === 'canceled') {
      return res.status(200).json({
        ok: true,
        message: '既に解約済みです。期間終了まで引き続きご利用いただけます。',
      });
    }

    // PayPal で解約（即時ではなく期間終了時に）
    try {
      await paypalFetch(`/v1/billing/subscriptions/${profile.paypal_subscription_id}/cancel`, {
        method: 'POST',
        body: {
          reason: 'User-initiated cancellation from app',
        },
      });
    } catch (e) {
      // 既に解約済みの場合は許容
      if (e.status !== 422 && e.status !== 404) {
        throw e;
      }
    }

    // DB更新（期間終了まで 'standard' 維持、status だけ変更）
    await supabaseAdmin
      .from('profiles')
      .update({
        subscription_status: 'canceled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    return res.status(200).json({
      ok: true,
      message: '解約が完了しました。次回更新日まで引き続きご利用いただけます。',
    });
  } catch (e) {
    console.error('[paypal.cancel] Error:', e.message);
    captureServerException(e, {
      context: 'paypal.cancel-subscription',
      route: '/api/paypal/cancel-subscription',
    });
    await flushSentry();
    return res.status(500).json({ error: '解約処理に失敗しました', detail: e.message });
  }
};
