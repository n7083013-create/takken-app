// ============================================================
// PayPal サブスクリプション有効化 API
// POST /api/paypal/activate-subscription
// 認証必須 — ユーザーがPayPal承認から戻ってきた際にサブスク状態を確定
// ============================================================

const { paypalFetch } = require('../_paypal-utils');
const { hashEmail } = require('../_email-utils');
const { createClient } = require('@supabase/supabase-js');
const { captureServerException, flushSentry } = require('../_sentry');

const supabaseAdmin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

module.exports = async (req, res) => {
  // CORS
  const origin = req.headers.origin;
  const allowed = ['https://takken-app-olive.vercel.app', 'https://takkenkanzen.com', 'https://www.takkenkanzen.com', 'https://app.takkenkanzen.com'];
  if (allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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

    // メール確認必須（無確認アカウントによる課金フロー悪用を防ぐ）
    if (!user.email_confirmed_at) {
      return res.status(403).json({
        error: 'メール確認が完了していません。',
        code: 'email_not_confirmed',
      });
    }

    const { subscriptionId } = req.body || {};
    if (!subscriptionId || typeof subscriptionId !== 'string' || subscriptionId.length > 100) {
      return res.status(400).json({ error: 'Invalid subscription ID' });
    }

    // PayPal からサブスク状態を取得
    const subscription = await paypalFetch(`/v1/billing/subscriptions/${subscriptionId}`);

    // [2026-05] custom_id は 2 形式に対応:
    //   旧: "user.id" (UUID 文字列のみ)
    //   新: JSON.stringify({ uid: user.id, cycle: 'monthly'|'annual' })
    // どちらでも uid が user.id と一致することを検証 (他人のサブスクIDの不正注入を防ぐ)
    let customUid = subscription.custom_id;
    let customCycle = 'monthly';
    if (typeof customUid === 'string' && customUid.startsWith('{')) {
      try {
        const parsed = JSON.parse(customUid);
        customUid = parsed.uid;
        customCycle = parsed.cycle === 'annual' ? 'annual' : 'monthly';
      } catch {
        // パース失敗時は旧形式扱い
      }
    }
    if (customUid !== user.id) {
      return res.status(403).json({ error: 'このサブスクリプションはこのユーザーのものではありません' });
    }

    // [2026-05-22] Revise (月→年 等のプラン変更) 後の取り扱い
    // custom_id は初回作成時の cycle のままなので、サブスクの現在 plan_id を見て上書きする。
    // (例: 月額作成時 custom_id={cycle:'monthly'} → revise で plan_id=PAYPAL_PLAN_ANNUAL → 'annual' に更新)
    const currentPlanId = subscription.plan_id;
    if (currentPlanId === process.env.PAYPAL_PLAN_ANNUAL) {
      customCycle = 'annual';
    } else if (
      currentPlanId === process.env.PAYPAL_PLAN_MONTHLY ||
      currentPlanId === process.env.PAYPAL_PLAN_ID
    ) {
      customCycle = 'monthly';
    }

    // ステータスが ACTIVE or APPROVAL_PENDING → 許容
    const status = subscription.status;
    if (status !== 'ACTIVE' && status !== 'APPROVAL_PENDING' && status !== 'APPROVED') {
      return res.status(400).json({
        error: `サブスクリプションの状態が不正です: ${status}`,
      });
    }

    // profile 更新
    const startTime = subscription.start_time || subscription.create_time;
    const nextBillingTime = subscription.billing_info?.next_billing_time;

    // [2026-05] メイン更新: billing_cycle は別 update でベストエフォート (列未マイグレーション耐性)
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        plan: 'standard',
        subscription_status: status === 'ACTIVE' ? 'active' : 'trialing',
        paypal_subscription_id: subscription.id,
        paypal_subscriber_id: subscription.subscriber?.payer_id,
        payment_provider: 'paypal',
        trial_ends_at: nextBillingTime || null,
        subscription_ends_at: nextBillingTime || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    // billing_cycle の永続化はマイグレーション 013 が適用されている場合のみ成功する。
    // 失敗しても無料トライアル / 課金フロー自体は継続できるよう、エラーは握りつぶす。
    try {
      const { error: cycleErr } = await supabaseAdmin
        .from('profiles')
        .update({ billing_cycle: customCycle })
        .eq('id', user.id);
      if (cycleErr) {
        console.warn('[paypal.activate] billing_cycle update skipped (column not migrated?):', cycleErr.message);
      }
    } catch (e) {
      console.warn('[paypal.activate] billing_cycle update threw:', e.message);
    }

    if (updateError) {
      console.error('[paypal.activate] DB update failed:', updateError);
      return res.status(500).json({ error: 'プロフィール更新に失敗しました' });
    }

    // [不正利用防止] トライアル履歴を記録（アカウント削除しても残る）
    const emailHash = hashEmail(user.email);
    if (emailHash) {
      try {
        await supabaseAdmin
          .from('trial_history')
          .upsert(
            {
              email_hash: emailHash,
              paypal_subscriber_id: subscription.subscriber?.payer_id || null,
              last_used_at: new Date().toISOString(),
              trial_count: 1,
            },
            { onConflict: 'email_hash', ignoreDuplicates: false },
          );
      } catch (e) {
        // 履歴記録は失敗してもメイン処理は続行
        console.error('[paypal.activate] trial_history record failed:', e.message);
      }
    }

    return res.status(200).json({
      ok: true,
      subscriptionId: subscription.id,
      status,
    });
  } catch (e) {
    console.error('[paypal.activate] Error:', e.message);
    captureServerException(e, {
      context: 'paypal.activate-subscription',
      route: '/api/paypal/activate-subscription',
    });
    await flushSentry();
    return res.status(500).json({ error: '有効化に失敗しました', detail: e.message });
  }
};
