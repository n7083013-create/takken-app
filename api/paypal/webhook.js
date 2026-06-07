// ============================================================
// PayPal Webhook ハンドラー
// POST /api/paypal/webhook
// PayPal → Supabase profiles テーブルのプラン状態を更新
// 署名検証必須
// ============================================================

const { verifyWebhookSignature } = require('../_paypal-utils');
const { hashEmail } = require('../_email-utils');
const { createClient } = require('@supabase/supabase-js');
const { captureServerException, flushSentry } = require('../_sentry');

const supabaseAdmin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID;

/**
 * custom_id からユーザーIDを取得
 */
function extractUserId(resource) {
  // resource.custom_id に user.id が入っている（create時に埋め込み）
  return resource?.custom_id || null;
}

/**
 * 冪等性チェック付きプロフィール更新
 */
/**
 * @returns {Promise<{ok:true}|{ok:false, recoverable:boolean, reason:string, current?:any}>}
 *   recoverable=true: 一時的エラー（DB接続不良等）→ 500 で再送依頼
 *   recoverable=false: ユーザー削除済み等の永続的問題 → 200 で swallow（再送不要）
 */
async function updateProfileIdempotent(userId, updates) {
  const { data: current, error: selectError } = await supabaseAdmin
    .from('profiles')
    .select('plan, subscription_status, paypal_subscription_id, trial_ends_at, subscription_ends_at')
    .eq('id', userId)
    .maybeSingle();

  if (selectError) {
    return { ok: false, recoverable: true, reason: `select_error: ${selectError.message}` };
  }
  if (!current) {
    // ユーザー削除済み等の永続的問題。再送しても同じ結果なので 200 で swallow。
    return { ok: false, recoverable: false, reason: 'profile_not_found' };
  }

  // 既に期待値ならスキップ
  const alreadyApplied = Object.keys(updates).every((key) => {
    const c = current[key];
    const n = updates[key];
    if (c === null && n === null) return true;
    if (c === null || n === null) return false;
    return String(c) === String(n);
  });

  if (alreadyApplied) {
    console.log(`[paypal.webhook] Idempotent skip for user ${userId}`);
    return { ok: true, current };
  }

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) {
    return { ok: false, recoverable: true, reason: `update_error: ${error.message}` };
  }
  return { ok: true, current };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 署名検証
  const verification = await verifyWebhookSignature({
    headers: req.headers,
    body: req.body,
    webhookId: PAYPAL_WEBHOOK_ID,
  });

  if (!verification.ok) {
    console.error('[paypal.webhook] Signature verification failed:', verification.reason);
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  const event = req.body;
  const eventType = event.event_type;
  const resource = event.resource || {};

  console.log(`[paypal.webhook] Received: ${eventType}`);

  // 結果収集: recoverable な失敗があれば 500 で再送依頼、permanent な失敗は 200 で swallow
  let permanentSkipReason = null;
  let recoverableError = null;

  function handleResult(result, label) {
    if (result.ok) return;
    if (result.recoverable) {
      recoverableError = `${label}: ${result.reason}`;
    } else {
      permanentSkipReason = `${label}: ${result.reason}`;
    }
  }

  try {
    switch (eventType) {
      // サブスクリプション作成（承認前）
      case 'BILLING.SUBSCRIPTION.CREATED': {
        const userId = extractUserId(resource);
        if (!userId) break;
        const r = await updateProfileIdempotent(userId, {
          subscription_status: 'creating',
          paypal_subscription_id: resource.id,
          payment_provider: 'paypal',
        });
        handleResult(r, 'CREATED');
        break;
      }

      // サブスクリプション有効化（承認完了・課金開始）
      case 'BILLING.SUBSCRIPTION.ACTIVATED': {
        const userId = extractUserId(resource);
        if (!userId) break;
        const nextBilling = resource.billing_info?.next_billing_time;
        const r = await updateProfileIdempotent(userId, {
          plan: 'premium',
          subscription_status: 'active',
          paypal_subscription_id: resource.id,
          paypal_subscriber_id: resource.subscriber?.payer_id,
          payment_provider: 'paypal',
          subscription_ends_at: nextBilling || null,
          trial_ends_at: nextBilling || null,
        });
        handleResult(r, 'ACTIVATED');

        // [不正利用防止] トライアル履歴を記録（バックアップ・冪等）
        try {
          const subscriberEmail = resource.subscriber?.email_address;
          const emailHash = hashEmail(subscriberEmail);
          if (emailHash) {
            await supabaseAdmin
              .from('trial_history')
              .upsert(
                {
                  email_hash: emailHash,
                  paypal_subscriber_id: resource.subscriber?.payer_id || null,
                  last_used_at: new Date().toISOString(),
                  trial_count: 1,
                },
                { onConflict: 'email_hash', ignoreDuplicates: true },
              );
          }
        } catch (e) {
          console.error('[paypal.webhook] trial_history record failed:', e.message);
        }
        break;
      }

      // サブスクリプション更新（課金成功・次回日時更新）
      case 'BILLING.SUBSCRIPTION.UPDATED':
      case 'PAYMENT.SALE.COMPLETED': {
        const userId = extractUserId(resource);
        if (!userId) break;
        const nextBilling = resource.billing_info?.next_billing_time;
        // M5 fix: 既に canceled 中（解約手続き済・期間終了待ち）なら status を上書きしない。
        // PayPal 側の決済 retry や残金処理で UPDATED が飛んできても、
        // 解約状態を維持する。ただし subscription_ends_at の更新は許容。
        const { data: cur } = await supabaseAdmin
          .from('profiles')
          .select('subscription_status')
          .eq('id', userId)
          .maybeSingle();
        const updates = nextBilling ? { subscription_ends_at: nextBilling } : {};
        if (cur?.subscription_status !== 'canceled') {
          updates.plan = 'premium';
          updates.subscription_status = 'active';
        }
        if (Object.keys(updates).length > 0) {
          const r = await updateProfileIdempotent(userId, updates);
          handleResult(r, eventType);
        }
        break;
      }

      // サブスクリプション解約
      case 'BILLING.SUBSCRIPTION.CANCELLED': {
        const userId = extractUserId(resource);
        if (!userId) break;
        // 期間終了まで standard 維持、ステータスだけ canceled
        const r = await updateProfileIdempotent(userId, {
          subscription_status: 'canceled',
        });
        handleResult(r, 'CANCELLED');
        break;
      }

      // サブスクリプション期限切れ or 失効
      case 'BILLING.SUBSCRIPTION.EXPIRED':
      case 'BILLING.SUBSCRIPTION.SUSPENDED': {
        const userId = extractUserId(resource);
        if (!userId) break;
        const r = await updateProfileIdempotent(userId, {
          plan: 'free',
          subscription_status: 'canceled',
        });
        handleResult(r, eventType);
        break;
      }

      // 課金失敗
      case 'PAYMENT.SALE.DENIED':
      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED': {
        const userId = extractUserId(resource);
        if (!userId) break;
        const r = await updateProfileIdempotent(userId, {
          subscription_status: 'past_due',
        });
        handleResult(r, eventType);
        break;
      }

      default:
        console.log(`[paypal.webhook] Unhandled event type: ${eventType}`);
    }

    if (recoverableError) {
      // 一時的エラー → 500 で PayPal に再送依頼
      console.error('[paypal.webhook] Recoverable error:', recoverableError);
      return res.status(500).json({ error: 'Temporary processing failure', detail: recoverableError });
    }
    if (permanentSkipReason) {
      // 永続的問題（プロフィール削除済み等）→ 200 で swallow（再送無効）
      console.warn('[paypal.webhook] Permanent skip:', permanentSkipReason);
      return res.status(200).json({ received: true, skipped: permanentSkipReason });
    }
    return res.status(200).json({ received: true });
  } catch (e) {
    console.error('[paypal.webhook] Processing error:', e.message, e.stack);
    captureServerException(e, {
      context: 'paypal.webhook',
      route: '/api/paypal/webhook',
    });
    await flushSentry();
    // 想定外の例外 → 一時的とみなして再送
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
};
