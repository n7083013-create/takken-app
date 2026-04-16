// ============================================================
// PAY.JP Webhook Handler
// POST /api/webhook
// PAY.JP → Supabase profiles テーブルのプラン状態を更新
// セキュリティ: Basic Auth 必須 + イベント再取得で検証
// ============================================================

const payjp = require('payjp')(process.env.PAYJP_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

if (!process.env.PAYJP_SECRET_KEY) {
  console.error('[Webhook] PAYJP_SECRET_KEY is not set');
}

const supabaseAdmin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

/**
 * PAY.JP customer ID から Supabase ユーザーを探して profile を取得
 * customer ID ベースの検索（メールベースより安全）
 * エラー時は throw して呼び出し元で処理
 */
async function getProfileByCustomerId(customerId) {
  if (!customerId) {
    throw new Error('Customer ID is required');
  }

  const { data: profiles, error } = await supabaseAdmin
    .from('profiles')
    .select('id, plan, subscription_status, payjp_subscription_id, trial_ends_at, subscription_ends_at')
    .eq('payjp_customer_id', customerId)
    .limit(1);

  if (error) {
    throw new Error(`Profile query failed: ${error.message}`);
  }
  if (!profiles || profiles.length === 0) {
    throw new Error(`Profile not found for customer: ${customerId}`);
  }

  return profiles[0];
}

/**
 * 冪等性チェック付きプロフィール更新
 * 既にウェブフックが適用済み（同じ状態）の場合はスキップ
 */
async function updateProfileIdempotent(profile, updates) {
  // 冪等性チェック: 全ての更新値が既に一致しているならスキップ
  const alreadyApplied = Object.keys(updates).every((key) => {
    const current = profile[key];
    const incoming = updates[key];
    // null 同士の比較も考慮
    if (current === null && incoming === null) return true;
    if (current === null || incoming === null) return false;
    return String(current) === String(incoming);
  });

  if (alreadyApplied) {
    console.log(`[Webhook] Idempotent skip: profile ${profile.id} already has expected state`);
    return;
  }

  const { error: updateError } = await supabaseAdmin
    .from('profiles')
    .update(updates)
    .eq('id', profile.id);

  if (updateError) {
    throw new Error(`Profile update failed: ${updateError.message}`);
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // --- [FIX C1] Basic Auth 必須検証 ---
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return res.status(401).json({ error: 'Unauthorized: Basic Auth required' });
  }

  const encoded = authHeader.replace('Basic ', '');
  const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
  const [username] = decoded.split(':');
  if (username !== process.env.PAYJP_SECRET_KEY) {
    return res.status(401).json({ error: 'Unauthorized: Invalid credentials' });
  }

  let event;
  try {
    event = req.body;

    // イベントの基本バリデーション
    if (!event || !event.type || !event.data || !event.id) {
      return res.status(400).json({ error: 'Invalid event payload' });
    }

    // --- PAY.JP API でイベントを再取得して検証 ---
    const verified = await payjp.events.retrieve(event.id);
    if (!verified || verified.type !== event.type) {
      console.error('[Webhook] Event verification failed:', event.id);
      return res.status(400).json({ error: 'Event verification failed' });
    }

    // 検証済みデータを使用
    event = verified;
  } catch (err) {
    console.error('[Webhook] Verification error:', err.message);
    return res.status(400).json({ error: 'Webhook verification failed' });
  }

  try {
    const obj = event.data;

    switch (event.type) {
      // --- サブスクリプション作成 ---
      case 'subscription.created': {
        const profile = await getProfileByCustomerId(obj.customer);
        await updateProfileIdempotent(profile, {
          plan: 'standard',
          payjp_subscription_id: obj.id,
          subscription_status: obj.status === 'trial' ? 'trialing' : 'active',
          trial_ends_at: obj.trial_end
            ? new Date(obj.trial_end * 1000).toISOString()
            : null,
          subscription_ends_at: obj.current_period_end
            ? new Date(obj.current_period_end * 1000).toISOString()
            : null,
        });
        break;
      }

      // --- サブスクリプション更新（トライアル終了→課金開始等） ---
      case 'subscription.renewed':
      case 'subscription.updated': {
        // [FIX H6] canceled ステータスを正しくマッピング
        const status = obj.status === 'trial' ? 'trialing'
          : obj.status === 'active' ? 'active'
          : obj.status === 'paused' ? 'paused'
          : obj.status === 'canceled' ? 'canceled'
          : 'active';

        const profile = await getProfileByCustomerId(obj.customer);
        await updateProfileIdempotent(profile, {
          plan: obj.status === 'canceled' ? 'free' : 'standard',
          subscription_status: status,
          trial_ends_at: obj.trial_end
            ? new Date(obj.trial_end * 1000).toISOString()
            : null,
          subscription_ends_at: obj.current_period_end
            ? new Date(obj.current_period_end * 1000).toISOString()
            : null,
        });
        break;
      }

      // --- サブスクリプション削除 ---
      case 'subscription.deleted': {
        const profile = await getProfileByCustomerId(obj.customer);
        await updateProfileIdempotent(profile, {
          plan: 'free',
          subscription_status: 'canceled',
          payjp_subscription_id: null,
        });
        break;
      }

      // --- 課金失敗 ---
      case 'charge.failed': {
        if (obj.customer) {
          const profile = await getProfileByCustomerId(obj.customer);
          await updateProfileIdempotent(profile, {
            subscription_status: 'past_due',
          });
        }
        break;
      }

      default:
        console.log('[Webhook] Unhandled event type:', event.type);
        break;
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    // [FIX M5] 処理失敗時は500を返してPAY.JPにリトライさせる
    console.error('[Webhook] Processing error:', err.message);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
};
