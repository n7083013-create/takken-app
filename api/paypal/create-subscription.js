// ============================================================
// PayPal サブスクリプション作成 API
// POST /api/paypal/create-subscription
// 認証必須 — Plan ID から Subscription を作成し、approval_url を返却
// ============================================================

const { paypalFetch } = require('../_paypal-utils');
const { hashEmail } = require('../_email-utils');
const { createClient } = require('@supabase/supabase-js');
const { captureServerException, flushSentry } = require('../_sentry');

const supabaseAdmin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// [2026-05] 月額 / 年額の 2 プラン構成。
// 既存の PAYPAL_PLAN_ID は後方互換のため monthly のエイリアスとして残置。
// PayPal Dashboard で年額プランを作成し、PAYPAL_PLAN_ANNUAL に Plan ID をセットすること。
const PAYPAL_PLAN_MONTHLY = process.env.PAYPAL_PLAN_MONTHLY || process.env.PAYPAL_PLAN_ID;
const PAYPAL_PLAN_ANNUAL = process.env.PAYPAL_PLAN_ANNUAL;

/** リクエストの billingCycle から PayPal Plan ID を解決 */
function resolvePlanId(billingCycle) {
  if (billingCycle === 'annual') return PAYPAL_PLAN_ANNUAL;
  return PAYPAL_PLAN_MONTHLY; // default: monthly
}

// フロントに戻る URL（承認後）
const RETURN_URL = process.env.PAYPAL_RETURN_URL || 'https://app.takkenkanzen.com/paywall?status=activating';
const CANCEL_URL = process.env.PAYPAL_CANCEL_URL || 'https://app.takkenkanzen.com/paywall?status=canceled';

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

  // [2026-05] billingCycle を受け取り、PayPal Plan ID を解決
  const requestedCycle = (req.body && req.body.billingCycle) || 'monthly';
  const billingCycle = requestedCycle === 'annual' ? 'annual' : 'monthly';
  const planId = resolvePlanId(billingCycle);

  // [2026-05-22] action="revise" の場合は既存サブスクのプラン変更フローに分岐
  // (Vercel Hobby plan の 12 Functions 制限のため、エンドポイントを統合)
  const action = (req.body && req.body.action) || 'create';

  if (!planId) {
    return res.status(500).json({
      error: billingCycle === 'annual'
        ? 'PAYPAL_PLAN_ANNUAL が未設定です。PayPal Dashboard で年額プランを作成し、環境変数をセットしてください。'
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

    // メール確認必須
    if (!user.email_confirmed_at) {
      return res.status(403).json({
        error: 'メール確認が完了していません。登録メールアドレスの確認リンクをクリックしてからご利用ください。',
        code: 'email_not_confirmed',
      });
    }

    // [2026-05-22] action='revise' の場合: 既存サブスクのプラン変更フロー
    // (Vercel Hobby plan 12 Functions 制限のため、create と統合)
    if (action === 'revise') {
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
      if (profile.billing_cycle === billingCycle) {
        return res.status(400).json({
          error: billingCycle === 'annual'
            ? '既に年額プランに登録されています'
            : '既に月額プランに登録されています',
        });
      }

      const reviseResult = await paypalFetch(
        `/v1/billing/subscriptions/${profile.paypal_subscription_id}/revise`,
        {
          method: 'POST',
          body: {
            plan_id: planId,
            application_context: {
              brand_name: '宅建士 完全対策',
              locale: 'ja-JP',
              shipping_preference: 'NO_SHIPPING',
              user_action: 'SUBSCRIBE_NOW',
              return_url: `${RETURN_URL}&cycle=${billingCycle}&revised=1`,
              cancel_url: CANCEL_URL,
            },
          },
          headers: {
            'PayPal-Request-Id': `revise-${user.id}-${billingCycle}-${Date.now()}`,
            'Prefer': 'return=representation',
          },
        },
      );

      const approveLink = reviseResult.links?.find((l) => l.rel === 'approve');
      if (!approveLink) {
        // 自動承認 (即時反映) ケース
        try {
          await supabaseAdmin
            .from('profiles')
            .update({ billing_cycle: billingCycle, updated_at: new Date().toISOString() })
            .eq('id', user.id);
        } catch {
          // billing_cycle 列が無ければ無視
        }
        return res.status(200).json({
          subscriptionId: profile.paypal_subscription_id,
          status: 'auto-approved',
          billingCycle,
        });
      }

      // 状態を「revising」に
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
        newPlanId: planId,
        newCycle: billingCycle,
      });
    }
    // === 通常の create フローは以下続行 ===

    // [不正利用防止] トライアル履歴チェック
    // 同じメアド（または正規化後ハッシュ一致）が過去にトライアル使用済みなら拒否
    const emailHash = hashEmail(user.email);
    if (emailHash) {
      const { data: trialHistory } = await supabaseAdmin
        .from('trial_history')
        .select('email_hash, trial_count, first_trial_at')
        .eq('email_hash', emailHash)
        .maybeSingle();

      if (trialHistory) {
        return res.status(400).json({
          error: 'このメールアドレスは既に無料トライアルをご利用済みです。継続をご希望の場合はサポートまでお問い合わせください（taira@2023kakeru.com）。',
          code: 'trial_already_used',
        });
      }
    }

    // 既存サブスクチェック
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('plan, subscription_status, paypal_subscription_id, updated_at')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.plan === 'standard' && profile?.paypal_subscription_id && profile?.subscription_status !== 'canceled') {
      return res.status(400).json({ error: '既に有料プランに登録済みです' });
    }

    // [重複防止] (Issue #6) PostgREST .or() + count 方式は版依存で素通りリスクがある。
    //   SECURITY DEFINER 関数 acquire_paypal_creation_lock で FOR UPDATE 行ロックを取得し、
    //   原子的に subscription_status を 'creating' へ遷移させる。
    let { data: lockAcquired, error: lockError } = await supabaseAdmin.rpc(
      'acquire_paypal_creation_lock',
      { p_user_id: user.id, p_stale_ms: 5 * 60 * 1000 },
    );
    if (lockError) {
      console.error('[paypal.create] lock RPC error:', lockError.message);
      return res.status(500).json({ error: 'サーバー側エラーが発生しました' });
    }

    // [再開フロー] ロックが取れない = 直前の試行で承認待ちサブスクが PayPal 側に残っている可能性。
    //   PayPal にクエリして APPROVAL_PENDING ならそのまま同じ approval URL を返却（ユーザーが続きから承認できる）。
    //   ACTIVE なら既に有効化済み。CANCELLED/EXPIRED/SUSPENDED ならクリーンアップして新規作成。
    if (!lockAcquired && profile?.paypal_subscription_id) {
      try {
        const existing = await paypalFetch(
          `/v1/billing/subscriptions/${profile.paypal_subscription_id}`,
          { method: 'GET' },
        );

        if (existing.status === 'APPROVAL_PENDING') {
          const approveLink = existing.links?.find((l) => l.rel === 'approve');
          if (approveLink) {
            return res.status(200).json({
              subscriptionId: existing.id,
              approvalUrl: approveLink.href,
              status: existing.status,
              resumed: true,
            });
          }
        }

        if (existing.status === 'ACTIVE') {
          return res.status(200).json({
            subscriptionId: existing.id,
            status: existing.status,
            alreadyActive: true,
          });
        }

        // 終了済みなら状態をリセットして新規作成へフォールスルー
        if (['CANCELLED', 'EXPIRED', 'SUSPENDED'].includes(existing.status)) {
          await supabaseAdmin
            .from('profiles')
            .update({
              subscription_status: 'canceled',
              updated_at: new Date().toISOString(),
            })
            .eq('id', user.id);

          const retry = await supabaseAdmin.rpc(
            'acquire_paypal_creation_lock',
            { p_user_id: user.id, p_stale_ms: 5 * 60 * 1000 },
          );
          lockAcquired = retry.data;
        }
      } catch (e) {
        console.error('[paypal.create] failed to resume existing subscription:', e.message);
        // フォールスルーして 409 を返す（下のチェックで処理）
      }
    }

    if (!lockAcquired) {
      return res.status(409).json({
        error: '処理中です。少し待ってから再度お試しください。',
      });
    }

    // [2026-05-22] プランステータス確認 + 自動アクティベート
    // PayPal Dashboard で手動作成したプランは CREATED 状態から始まるため、
    // ACTIVE でない場合は自動的にアクティベートを試みる。
    try {
      const planData = await paypalFetch(`/v1/billing/plans/${planId}`, { method: 'GET' });
      console.log(`[paypal.create] plan=${planId} status=${planData.status}`);
      if (planData.status === 'CREATED' || planData.status === 'INACTIVE') {
        console.log(`[paypal.create] Plan is ${planData.status}, activating...`);
        await paypalFetch(`/v1/billing/plans/${planId}/activate`, { method: 'POST' });
        console.log('[paypal.create] Plan activated.');
      } else if (planData.status !== 'ACTIVE') {
        return res.status(500).json({
          error: `PayPal プランが利用できない状態です (status: ${planData.status})。管理者にお問い合わせください。`,
          code: 'plan_unavailable',
        });
      }
    } catch (planErr) {
      // プランチェック失敗は致命的ではないので続行するが、ログに残す
      console.error('[paypal.create] plan status check failed:', planErr.message);
    }

    // PayPal Subscription 作成
    // custom_id にユーザーIDと billingCycle を埋め込み、Webhook で識別 + 課金サイクル復元する
    const subscription = await paypalFetch('/v1/billing/subscriptions', {
      method: 'POST',
      body: {
        plan_id: planId,
        // [2026-05] custom_id に user.id + billingCycle を JSON 化して埋め込む
        // ※ PayPal 側で 127 文字までの文字列制限あり (UUID + cycle で十分収まる)
        custom_id: JSON.stringify({ uid: user.id, cycle: billingCycle }),
        subscriber: {
          email_address: user.email,
        },
        application_context: {
          brand_name: '宅建士 完全対策',
          locale: 'ja-JP',
          shipping_preference: 'NO_SHIPPING',
          user_action: 'SUBSCRIBE_NOW',
          return_url: `${RETURN_URL}&cycle=${billingCycle}`,
          cancel_url: CANCEL_URL,
        },
      },
      headers: {
        'PayPal-Request-Id': `sub-${user.id}-${billingCycle}-${Date.now()}`,  // 冪等性キー (cycle も含める)
        'Prefer': 'return=representation',
      },
    });

    // 承認URL取得
    const approveLink = subscription.links?.find((l) => l.rel === 'approve');
    if (!approveLink) {
      throw new Error('approval URL not found in PayPal response');
    }

    // 一時的に subscription_id を profiles に保存（activate 待ち状態）
    await supabaseAdmin
      .from('profiles')
      .update({
        paypal_subscription_id: subscription.id,
        subscription_status: 'creating',
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    return res.status(200).json({
      subscriptionId: subscription.id,
      approvalUrl: approveLink.href,
      status: subscription.status,
    });
  } catch (e) {
    console.error('[paypal.create] Error:', e.message, e.data);
    captureServerException(e, {
      context: 'paypal.create-subscription',
      route: '/api/paypal/create-subscription',
    });
    await flushSentry();
    return res.status(500).json({ error: 'サブスクリプション作成に失敗しました', detail: e.message });
  }
};
