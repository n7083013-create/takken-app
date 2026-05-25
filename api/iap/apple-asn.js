// ============================================================
// Apple App Store Server Notifications V2 Webhook
// POST /api/iap/apple-asn
// ============================================================
// Apple のサブスクリプションライフサイクルイベント（自動更新・解約・返金等）
// を受信し、profiles テーブルを更新する。
//
// 認証: signedPayload (JWS) の x5c 証明書チェーン検証
//   - x5c[0] (leaf) で JWS 署名検証
//   - x5c[2] (root) が Apple Root CA G3 と一致することを検証
//   - leaf の bundleId が APPLE_BUNDLE_ID と一致することを検証
//
// セットアップ:
//   1. App Store Connect > App Information > App Store Server Notifications
//   2. Production Server URL: https://app.takkenkanzen.com/api/iap/apple-asn
//   3. Sandbox Server URL も同URL（本実装は両環境を判定して処理）
//   4. Version: V2
//
// 必要環境変数:
//   - EXPO_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//   - APPLE_BUNDLE_ID (default: com.takkenkanzen.app)
// ============================================================

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const { captureServerException, flushSentry } = require('../_sentry');

const supabaseAdmin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const APPLE_BUNDLE_ID = process.env.APPLE_BUNDLE_ID || 'com.takkenkanzen.app';

// Apple Root CA - G3 SHA-256 fingerprint
// 出典: https://www.apple.com/certificateauthority/
// 検証用: 受信した x5c chain の root (x5c[2]) がこれと一致すれば Apple 発行と確認
const APPLE_ROOT_CA_G3_FINGERPRINT =
  '63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79';

// ─────────────────────────────────────────────
// JWS 検証ユーティリティ
// ─────────────────────────────────────────────

/**
 * x5c の base64-DER を PEM 形式に変換
 */
function derBase64ToPem(b64Der) {
  const lines = b64Der.match(/.{1,64}/g) || [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----\n`;
}

/**
 * Apple JWS を検証してペイロードを返す
 *  1. JWS ヘッダの x5c から証明書チェーン抽出
 *  2. ルート証明書が Apple Root CA G3 と一致するか
 *  3. チェーンが連続して署名されているか（intermediate→root, leaf→intermediate）
 *  4. leaf cert の公開鍵で JWS 署名検証
 * @returns {Object} payload
 */
function verifyAppleJws(token) {
  if (typeof token !== 'string' || token.split('.').length !== 3) {
    throw new Error('Invalid JWS structure');
  }
  const [headerB64] = token.split('.');
  const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
  if (header.alg !== 'ES256') {
    throw new Error(`Unsupported alg: ${header.alg}`);
  }
  if (!Array.isArray(header.x5c) || header.x5c.length < 3) {
    throw new Error('x5c chain missing or incomplete');
  }

  // 証明書チェーンを X509Certificate オブジェクトに変換
  const certs = header.x5c.map((b64) => new crypto.X509Certificate(derBase64ToPem(b64)));
  const leaf = certs[0];
  const intermediate = certs[1];
  const root = certs[2];

  // 1) Root が Apple Root CA G3 か（fingerprint で照合）
  if (root.fingerprint256 !== APPLE_ROOT_CA_G3_FINGERPRINT) {
    // Issue #24: Apple のルート証明書がローテーションされた可能性が高い。
    // ハードコード値を更新するまで全 webhook が rejected になるため、
    // 高優先度のアラートとして専用ログ + (将来) Sentry/監視通知を出す
    const newFp = root.fingerprint256;
    const subject = root.subject || 'unknown';
    console.error(
      `[apple-asn] CRITICAL: Apple Root CA fingerprint mismatch. Hardcoded G3 may be rotated. ` +
      `received_fingerprint=${newFp} subject=${subject}. ` +
      `Update APPLE_ROOT_CA_G3_FINGERPRINT in api/iap/apple-asn.js`,
    );
    throw new Error(`Root cert mismatch: ${newFp}`);
  }

  // 2) チェーン署名検証（Node 18+ では verify(parentPublicKey) が利用可能）
  if (!intermediate.verify(root.publicKey)) {
    throw new Error('Intermediate cert signature invalid');
  }
  if (!leaf.verify(intermediate.publicKey)) {
    throw new Error('Leaf cert signature invalid');
  }

  // 3) leaf 公開鍵で JWS 署名検証
  const decoded = jwt.verify(token, leaf.publicKey, { algorithms: ['ES256'] });
  return decoded;
}

// ─────────────────────────────────────────────
// 通知タイプ別の処理
// ─────────────────────────────────────────────
// 公式: https://developer.apple.com/documentation/appstoreservernotifications/notificationtype

/**
 * notificationType / subtype に応じて profiles を更新
 */
async function handleAppleNotification(notification, transactionInfo, renewalInfo) {
  const { notificationType, subtype } = notification;

  if (transactionInfo?.bundleId && transactionInfo.bundleId !== APPLE_BUNDLE_ID) {
    return { ok: true, skipped: 'bundle_id_mismatch', got: transactionInfo.bundleId };
  }

  // originalTransactionId からユーザーを特定
  const otId = transactionInfo?.originalTransactionId;
  if (!otId) {
    console.warn('[apple-asn] missing originalTransactionId');
    return { ok: true, skipped: 'no_otid' };
  }

  const { data: purchase } = await supabaseAdmin
    .from('iap_purchases')
    .select('user_id')
    .eq('platform', 'ios')
    .eq('purchase_token', otId)
    .maybeSingle();
  if (!purchase) {
    // 未知のトークン → iap_pending_events に保存して後で reconcile
    // (verify-receipt 経由で iap_purchases に登録される前に webhook が先着するケース)
    try {
      await supabaseAdmin.from('iap_pending_events').insert({
        platform: 'ios',
        purchase_token: otId,
        notification_type: `${notificationType}${subtype ? '/' + subtype : ''}`,
        payload: { notification, transactionInfo, renewalInfo },
      });
    } catch (e) {
      console.warn('[apple-asn] pending insert failed:', e.message);
    }
    return { ok: true, skipped: 'pending_unknown_otid' };
  }
  const userId = purchase.user_id;

  // SECURITY (Issue #4): appAccountToken による所有検証
  // appAccountToken は購入時に StoreKit に渡した UUID。Apple がトランザクションに紐付けて返す。
  // クライアントが user.id（または UUIDマッピング）を appAccountToken として渡している前提で
  // iap_purchases に保存した userId と Apple 側のひも付けが一致するか確認。
  // 不一致＝別ユーザーが他人の購入を流用しようとしている疑い → 拒否。
  if (transactionInfo?.appAccountToken) {
    // appAccountToken は UUID 形式。プロフィールの apple_app_account_token カラム or
    // user.id (UUID) に一致するかチェック。
    const claimedToken = String(transactionInfo.appAccountToken).toLowerCase();
    const expectedUserId = String(userId).toLowerCase();
    if (claimedToken !== expectedUserId) {
      console.warn(
        `[apple-asn] appAccountToken mismatch: claimed=${claimedToken} stored_user=${expectedUserId}`,
      );
      return { ok: true, skipped: 'app_account_token_mismatch' };
    }
  }
  // appAccountToken が無い旧購入は許容（StoreKit2 以降は基本セットされる）

  const updates = { updated_at: new Date().toISOString() };
  const expiryMs = transactionInfo?.expiresDate;
  const expiryIso = expiryMs ? new Date(expiryMs).toISOString() : null;
  // offerType 1 / FREE_TRIAL 表記でトライアル判定
  const isTrial =
    transactionInfo?.offerType === 1 ||
    transactionInfo?.offerDiscountType === 'FREE_TRIAL';

  switch (notificationType) {
    case 'SUBSCRIBED': // 新規購入 / 再購入
    case 'DID_RENEW': // 自動更新成功
    case 'DID_CHANGE_RENEWAL_PREF': // プラン変更（同価格/アップグレード）
    case 'OFFER_REDEEMED': // 特別オファー利用
    case 'PRICE_INCREASE': // 価格上昇承認 / 拒否（subtype による）
    {
      updates.plan = 'standard';
      updates.payment_provider = 'apple';
      if (isTrial) {
        updates.subscription_status = 'trialing';
        if (expiryIso) updates.trial_ends_at = expiryIso;
      } else {
        updates.subscription_status = 'active';
        if (expiryIso) {
          updates.subscription_ends_at = expiryIso;
          updates.trial_ends_at = null;
        }
      }
      break;
    }
    case 'DID_CHANGE_RENEWAL_STATUS':
      // subtype: AUTO_RENEW_ENABLED / AUTO_RENEW_DISABLED
      // DISABLED → 解約予約（期間終了まで standard）
      if (subtype === 'AUTO_RENEW_DISABLED') {
        updates.subscription_status = 'canceled';
      } else if (subtype === 'AUTO_RENEW_ENABLED') {
        updates.subscription_status = 'active';
      }
      break;
    case 'DID_FAIL_TO_RENEW':
      // 課金失敗。subtype = GRACE_PERIOD なら猶予期間中、無ければ ON_HOLD 相当
      updates.subscription_status = 'past_due';
      break;
    case 'GRACE_PERIOD_EXPIRED':
      updates.subscription_status = 'canceled';
      updates.plan = 'free';
      break;
    case 'EXPIRED':
      updates.plan = 'free';
      updates.subscription_status = 'canceled';
      break;
    case 'REVOKE': // ファミリー共有取消等
    case 'REFUND':
      updates.plan = 'free';
      updates.subscription_status = 'canceled';
      break;
    case 'REFUND_DECLINED':
    case 'REFUND_REVERSED':
      // ここでは何もしない（既存状態維持）
      return { ok: true, skipped: 'no_action' };
    case 'TEST':
      console.log('[apple-asn] TEST notification received');
      return { ok: true, type: 'test' };
    default:
      console.log(`[apple-asn] Unhandled type: ${notificationType} / ${subtype || ''}`);
      return { ok: true, skipped: 'unhandled_type' };
  }

  const { error } = await supabaseAdmin
    .from('profiles')
    .update(updates)
    .eq('id', userId);
  if (error) {
    console.error('[apple-asn] update error:', error.message);
    return { ok: false, recoverable: true };
  }
  return { ok: true, type: notificationType, subtype };
}

// ─────────────────────────────────────────────
// メインハンドラー
// ─────────────────────────────────────────────
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const signedPayload = body.signedPayload;
    if (!signedPayload || typeof signedPayload !== 'string') {
      return res.status(400).json({ error: 'signedPayload required' });
    }

    // 1) signedPayload を検証
    let notification;
    try {
      notification = verifyAppleJws(signedPayload);
    } catch (e) {
      console.warn('[apple-asn] JWS verify failed:', e.message);
      return res.status(401).json({ error: 'Invalid signature', reason: e.message });
    }

    // 2) signedTransactionInfo / signedRenewalInfo もそれぞれ JWS なので検証
    const data = notification.data || {};
    let transactionInfo = null;
    let renewalInfo = null;
    if (data.signedTransactionInfo) {
      try {
        transactionInfo = verifyAppleJws(data.signedTransactionInfo);
      } catch (e) {
        console.warn('[apple-asn] tx JWS verify failed:', e.message);
      }
    }
    if (data.signedRenewalInfo) {
      try {
        renewalInfo = verifyAppleJws(data.signedRenewalInfo);
      } catch (e) {
        console.warn('[apple-asn] renewal JWS verify failed:', e.message);
      }
    }

    // 3) 処理
    const result = await handleAppleNotification(notification, transactionInfo, renewalInfo);
    if (result.ok === false && result.recoverable) {
      // 一時エラー: 500 を返して Apple に再送させる
      return res.status(500).json({ error: 'Temporary error' });
    }

    return res.status(200).json({ ok: true, result });
  } catch (e) {
    console.error('[apple-asn] error:', e.message, e.stack);
    captureServerException(e, {
      context: 'iap.apple-asn',
      route: '/api/iap/apple-asn',
    });
    await flushSentry();
    return res.status(500).json({ error: 'Processing failed' });
  }
};
