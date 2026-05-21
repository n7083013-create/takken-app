// ============================================================
// PayPal サブスクリプションプラン変更 API
// POST /api/paypal/revise-subscription
// ============================================================
//
// 用途: 月額 (¥980/月) ↔ 年額 (¥5,980/年) のプラン変更。
//
// 動作:
//   1. ユーザーの現在の paypal_subscription_id を取得
//   2. PayPal の Revise API を呼んで billingCycle 変更を要求
//   3. PayPal が返す approval_url にユーザーをリダイレクト
//   4. ユーザーが PayPal で承認すると、subscription の plan_id が新しいものに切り替わる
//   5. 承認後、activate-subscription 経由で profiles.billing_cycle が更新される
//
// PayPal docs:
//   POST /v1/billing/subscriptions/{id}/revise
//   Body: { plan_id: "P-...", application_context: { ... } }
//   Response 200 (no body) or 422 with detail.
//   approve link from `links` array.

const { paypalFetch } = require('../_paypal-utils');
const { createClient } = require('@supabase/supabase-js');
const { captureServerException, flushSentry } = require('../_sentry');

const supabaseAdmin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const PAYPAL_PLAN_MONTHLY = process.env.PAYPAL_PLAN_MONTHLY || process.env.PAYPAL_PLAN_ID;
const PAYPAL_PLAN_ANNUAL = process.env.PAYPAL_PLAN_ANNUAL;

const RETURN_URL = process.env.PAYPAL_RETURN_URL || 'https://app.takkenkanzen.com/paywall?status=activating';
const CANCEL_URL = process.env.PAYPAL_CANCEL_URL || 'https://app.takkenkanzen.com/paywall?status=canceled';

function resolvePlanId(billingCycle) {
  if (billingCycle === 'annual') return PAYPAL_PLAN_ANNUAL;
  return PAYPAL_PLAN_MONTHLY;
}

module.exports = async (req, res) => {
  const origin = req.headers.origin;
  const allowed = [
    'https://takken-app-olive.vercel.app',
    'https://takkenkanzen.com',
    'https://www.takkenkanzen.com',
    'https://app.takkenkanzen.com',
  ];
  if (allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // billingCycle 受け取り → 新 Plan ID 解決
  const requestedCycle = (req.body && req.body.billingCycle) || 'annual';
  const newCycle = requestedCycle === 'monthly' ? 'monthly' : 'annual';
  const newPlanId = resolvePlanId(newCycle);

  if (!newPlanId) {
    return res.status(500).json({
      error: newCycle === 'annual'
        ? 'PAYPAL_PLAN_ANNUAL が未設定です。'
        : 'PAYPAL_PLAN_MONTHLY (or PAYPAL_PLAN_ID) が未設定です。',
    });
  }

  // 認証
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

    // 現在のサブスク取得
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('paypal_subscription_id, subscription_status, plan, billing_cycle')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile?.paypal_subscription_id) {
      return res.status(400).json({ error: 'PayPal サブスクリプションが見つかりません' });
    }

    if (profile.plan !== 'standard') {
      return res.status(400).json({ error: '有料プランに登録されていません' });
    }

    if (profile.subscription_status === 'canceled') {
      return res.status(400).json({ error: '解約済みのサブスクリプションは変更できません' });
    }

    // 同じサイクルへの変更は無意味
    if (profile.billing_cycle === newCycle) {
      return res.status(400).json({
        error: newCycle === 'annual'
          ? '既に年額プランに登録されています'
          : '既に月額プランに登録されています',
      });
    }

    // PayPal Subscription Revise を呼び出し
    // 注: revise は subscription 全体ではなく plan_id だけ変更。
    // 承認 URL に飛ばすため application_context も指定する。
    const reviseResult = await paypalFetch(
      `/v1/billing/subscriptions/${profile.paypal_subscription_id}/revise`,
      {
        method: 'POST',
        body: {
          plan_id: newPlanId,
          application_context: {
            brand_name: '宅建士 完全対策',
            locale: 'ja-JP',
            shipping_preference: 'NO_SHIPPING',
            user_action: 'SUBSCRIBE_NOW',
            return_url: `${RETURN_URL}&cycle=${newCycle}&revised=1`,
            cancel_url: CANCEL_URL,
          },
        },
        headers: {
          'PayPal-Request-Id': `revise-${user.id}-${newCycle}-${Date.now()}`,
          'Prefer': 'return=representation',
        },
      },
    );

    // 承認 URL を取得
    const approveLink = reviseResult.links?.find((l) => l.rel === 'approve');
    if (!approveLink) {
      // PayPal が承認不要と判断した場合 (即時反映) は links が空の場合あり
      // この場合は activate を直接呼ぶ
      console.warn('[paypal.revise] No approval URL — likely auto-approved');
      // billing_cycle を best-effort で更新
      try {
        await supabaseAdmin
          .from('profiles')
          .update({ billing_cycle: newCycle, updated_at: new Date().toISOString() })
          .eq('id', user.id);
      } catch {
        // 列がない場合は無視
      }
      return res.status(200).json({
        subscriptionId: profile.paypal_subscription_id,
        status: 'auto-approved',
        billingCycle: newCycle,
      });
    }

    // 一時的に状態を記録 (re-approval 中)
    await supabaseAdmin
      .from('profiles')
      .update({
        subscription_status: 'revising',
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    return res.status(200).json({
      subscriptionId: profile.paypal_subscription_id,
      approvalUrl: approveLink.href,
      newPlanId,
      newCycle,
    });
  } catch (e) {
    console.error('[paypal.revise] Error:', e.message, e.data);
    captureServerException(e, {
      context: 'paypal.revise-subscription',
      route: '/api/paypal/revise-subscription',
    });
    await flushSentry();
    return res.status(500).json({
      error: 'プラン変更に失敗しました',
      detail: e.message,
    });
  }
};
