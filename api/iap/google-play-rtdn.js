// ============================================================
// Google Play Real-Time Developer Notifications (RTDN) Webhook
// POST /api/iap/google-play-rtdn
// ============================================================
// Google Cloud Pub/Sub から定期購入のライフサイクルイベントを受信し
// profiles テーブルを更新する。
//
// 認証: Pub/Sub OIDC JWT 検証
//   Pub/Sub は service account でリクエストに署名する。
//   Authorization: Bearer <ID_TOKEN> を verify する。
//
// セットアップ:
//   1. Google Cloud Pub/Sub でトピックを作成
//   2. Push サブスクリプションでこの URL を指定 + service account 設定
//   3. Play Console > 収益化 > 定期購入 設定 > リアルタイム通知
//      → Pub/Sub トピック名を入力
//
// 必要環境変数:
//   - PUBSUB_AUDIENCE: Pub/Sub Push 設定時の audience（通常はこの URL）
//   - 他は verify-receipt.js と共通
// ============================================================

const { createClient } = require('@supabase/supabase-js');
const { OAuth2Client, JWT } = require('google-auth-library');
const { captureServerException, flushSentry } = require('../_sentry');

const supabaseAdmin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const ANDROID_PACKAGE_NAME = process.env.ANDROID_PACKAGE_NAME || 'com.takkenkanzen.app';
const PUBSUB_AUDIENCE = process.env.PUBSUB_AUDIENCE; // 例: https://app.takkenkanzen.com/api/iap/google-play-rtdn

// Notification Type の定義（Google Play Real-Time Developer Notifications）
const NOTIFICATION_TYPES = {
  1: 'SUBSCRIPTION_RECOVERED',
  2: 'SUBSCRIPTION_RENEWED',
  3: 'SUBSCRIPTION_CANCELED',
  4: 'SUBSCRIPTION_PURCHASED',
  5: 'SUBSCRIPTION_ON_HOLD',
  6: 'SUBSCRIPTION_IN_GRACE_PERIOD',
  7: 'SUBSCRIPTION_RESTARTED',
  8: 'SUBSCRIPTION_PRICE_CHANGE_CONFIRMED',
  9: 'SUBSCRIPTION_DEFERRED',
  10: 'SUBSCRIPTION_PAUSED',
  11: 'SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED',
  12: 'SUBSCRIPTION_REVOKED',
  13: 'SUBSCRIPTION_EXPIRED',
};

const oauthClient = new OAuth2Client();

// ─────────────────────────────────────────────
// Pub/Sub OIDC JWT 検証
// ─────────────────────────────────────────────
async function verifyPubSubAuth(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, reason: 'missing_bearer' };
  }
  if (!PUBSUB_AUDIENCE) {
    return { ok: false, reason: 'audience_not_configured' };
  }
  const idToken = authHeader.replace('Bearer ', '');
  try {
    const ticket = await oauthClient.verifyIdToken({
      idToken,
      audience: PUBSUB_AUDIENCE,
    });
    const payload = ticket.getPayload();
    // Google が発行した token か確認
    if (payload?.iss !== 'https://accounts.google.com' && payload?.iss !== 'accounts.google.com') {
      return { ok: false, reason: 'wrong_issuer' };
    }
    // [H6 セキュリティ] Pub/Sub からの呼び出しか厳格に確認
    // 環境変数 PUBSUB_SERVICE_ACCOUNT_EMAIL に Pub/Sub が使う SA メアドを指定し、
    // 一致しない token は拒否（別の Google 発行 OIDC token によるなりすまし防止）
    const expectedEmail = process.env.PUBSUB_SERVICE_ACCOUNT_EMAIL;
    if (expectedEmail) {
      if (payload?.email !== expectedEmail) {
        return {
          ok: false,
          reason: `email_mismatch: got=${payload?.email} expected=${expectedEmail}`,
        };
      }
      if (payload?.email_verified !== true) {
        return { ok: false, reason: 'email_not_verified' };
      }
    }
    return { ok: true, email: payload?.email };
  } catch (e) {
    return { ok: false, reason: `verify_failed: ${e.message}` };
  }
}

// ─────────────────────────────────────────────
// Play Developer API でサブスクリプション最新状態取得
// ─────────────────────────────────────────────
async function fetchPlaySubscription(purchaseToken) {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!email || !privateKey) throw new Error('Service Account 未設定');

  const client = new JWT({
    email,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  const { access_token } = await client.authorize();

  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
    ANDROID_PACKAGE_NAME,
  )}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });
  if (!res.ok) throw new Error(`Play API error: ${res.status}`);
  return res.json();
}

// ─────────────────────────────────────────────
// 通知タイプ別の処理
// ─────────────────────────────────────────────
async function handleSubscriptionNotification(notification) {
  const { notificationType, purchaseToken, subscriptionId } = notification;
  const typeName = NOTIFICATION_TYPES[notificationType] || `UNKNOWN_${notificationType}`;
  console.log(`[rtdn] ${typeName} for token=${purchaseToken?.slice(0, 12)}...`);

  // purchaseToken からユーザーを特定
  const { data: purchase } = await supabaseAdmin
    .from('iap_purchases')
    .select('user_id')
    .eq('platform', 'android')
    .eq('purchase_token', purchaseToken)
    .maybeSingle();
  if (!purchase) {
    // Issue #12: 未知のトークン → iap_pending_events に永続化して後で reconcile
    // 旧実装はここで swallow していたため、購入直後にネット切断 → verify-receipt 失敗
    // → RTDN 即着 → 永遠に plan='free' のまま という致命的データロス事故が起こりえた
    try {
      await supabaseAdmin.from('iap_pending_events').insert({
        platform: 'android',
        purchase_token: purchaseToken,
        notification_type: typeName,
        payload: notification,
      });
    } catch (e) {
      console.warn('[rtdn] pending insert failed:', e.message);
    }
    return { ok: true, skipped: 'pending_unknown_token' };
  }
  const userId = purchase.user_id;

  // 状態に応じた更新（Play API で最新状態を取得して反映）
  let updates = { updated_at: new Date().toISOString() };

  switch (notificationType) {
    case 4: // PURCHASED
    case 1: // RECOVERED
    case 7: // RESTARTED
    case 2: // RENEWED
    case 8: // PRICE_CHANGE_CONFIRMED
    case 6: // IN_GRACE_PERIOD（まだ有効）
    case 11: // PAUSE_SCHEDULE_CHANGED
    {
      try {
        const sub = await fetchPlaySubscription(purchaseToken);
        const expiryTime = sub.lineItems?.[0]?.expiryTime;
        updates = {
          ...updates,
          plan: 'standard',
          subscription_status: 'active',
          payment_provider: 'google_play',
          subscription_ends_at: expiryTime || null,
          trial_ends_at: expiryTime || null,
        };
      } catch (e) {
        console.error('[rtdn] Play API fetch failed:', e.message);
      }
      break;
    }
    case 3: // CANCELED — ユーザー解約。期間終了まで有効
      updates.subscription_status = 'canceled';
      break;
    case 5: // ON_HOLD — 課金失敗中
    case 10: // PAUSED — ユーザー一時停止
      updates.subscription_status = 'past_due';
      break;
    case 9: // DEFERRED — 次回課金日延長
    {
      try {
        const sub = await fetchPlaySubscription(purchaseToken);
        const expiryTime = sub.lineItems?.[0]?.expiryTime;
        if (expiryTime) {
          updates.subscription_ends_at = expiryTime;
          updates.trial_ends_at = expiryTime;
        }
      } catch (e) {
        console.error('[rtdn] Play API fetch failed:', e.message);
      }
      break;
    }
    case 12: // REVOKED — 返金処理（即時無効）
    case 13: // EXPIRED
      updates.plan = 'free';
      updates.subscription_status = 'canceled';
      break;
    default:
      console.log(`[rtdn] Unhandled type: ${typeName}`);
      return { ok: true, skipped: 'unhandled_type' };
  }

  const { error } = await supabaseAdmin
    .from('profiles')
    .update(updates)
    .eq('id', userId);

  if (error) {
    console.error('[rtdn] Update error:', error.message);
    return { ok: false, recoverable: true };
  }

  return { ok: true, type: typeName };
}

// ─────────────────────────────────────────────
// メインハンドラー
// ─────────────────────────────────────────────
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Pub/Sub 認証検証
  const authResult = await verifyPubSubAuth(req.headers.authorization || '');
  if (!authResult.ok) {
    console.warn('[rtdn] Auth failed:', authResult.reason);
    return res.status(401).json({ error: 'Unauthorized', reason: authResult.reason });
  }

  try {
    const body = req.body || {};
    const message = body.message || {};
    const dataB64 = message.data;
    if (!dataB64) {
      return res.status(400).json({ error: 'No message.data' });
    }

    const decoded = Buffer.from(dataB64, 'base64').toString('utf-8');
    const event = JSON.parse(decoded);

    // packageName 検証
    if (event.packageName && event.packageName !== ANDROID_PACKAGE_NAME) {
      console.warn('[rtdn] packageName mismatch:', event.packageName);
      return res.status(200).json({ skipped: 'wrong_package' });
    }

    if (event.subscriptionNotification) {
      const result = await handleSubscriptionNotification(event.subscriptionNotification);
      if (result.ok === false && result.recoverable) {
        return res.status(500).json({ error: 'Temporary error' });
      }
      return res.status(200).json({ ok: true, result });
    }

    if (event.testNotification) {
      console.log('[rtdn] Test notification received');
      return res.status(200).json({ ok: true, type: 'test' });
    }

    // voidedPurchaseNotification, oneTimeProductNotification 等は今回は使わない
    console.log('[rtdn] Unhandled event:', Object.keys(event));
    return res.status(200).json({ ok: true, skipped: 'unhandled_event' });
  } catch (e) {
    console.error('[rtdn] Error:', e.message, e.stack);
    captureServerException(e, {
      context: 'iap.google-play-rtdn',
      route: '/api/iap/google-play-rtdn',
    });
    await flushSentry();
    return res.status(500).json({ error: 'Processing failed' });
  }
};
