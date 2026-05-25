// ============================================================
// PayPal API 共通ユーティリティ
// OAuth アクセストークン取得 + 認証付きリクエスト
// ============================================================

const crypto = require('crypto');

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
// 本番: https://api-m.paypal.com
// Sandbox: https://api-m.sandbox.paypal.com
const PAYPAL_BASE_URL = process.env.PAYPAL_BASE_URL || 'https://api-m.paypal.com';

// アクセストークンをメモリキャッシュ（複数リクエストで使い回し）
let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * PayPal OAuth アクセストークン取得（キャッシュ付き）
 * @returns {Promise<string>}
 */
async function getAccessToken() {
  const now = Date.now();
  // 有効期限の60秒前までキャッシュを使う
  if (cachedToken && now < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error('PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET not set');
  }

  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');

  const res = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`PayPal OAuth failed: ${res.status} ${err}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = now + (data.expires_in * 1000);
  return cachedToken;
}

/**
 * PayPal API に認証付きリクエストを送る
 */
async function paypalFetch(path, { method = 'GET', body, headers = {} } = {}) {
  const token = await getAccessToken();

  const res = await fetch(`${PAYPAL_BASE_URL}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const error = typeof data === 'object' && data?.message ? data.message : text;
    const err = new Error(`PayPal API ${method} ${path} failed: ${res.status} ${error}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

/**
 * タイミング攻撃耐性のある文字列比較
 */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  try {
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Webhook 署名検証（PayPal 推奨方式）
 * https://developer.paypal.com/api/rest/webhooks/rest/#link-receivewebhookpayload
 */
async function verifyWebhookSignature({ headers, body, webhookId }) {
  if (!webhookId) return { ok: false, reason: 'no_webhook_id' };

  const verifyPayload = {
    transmission_id: headers['paypal-transmission-id'],
    transmission_time: headers['paypal-transmission-time'],
    cert_url: headers['paypal-cert-url'],
    auth_algo: headers['paypal-auth-algo'],
    transmission_sig: headers['paypal-transmission-sig'],
    webhook_id: webhookId,
    webhook_event: body,
  };

  if (!verifyPayload.transmission_id || !verifyPayload.transmission_sig) {
    return { ok: false, reason: 'missing_headers' };
  }

  try {
    const result = await paypalFetch('/v1/notifications/verify-webhook-signature', {
      method: 'POST',
      body: verifyPayload,
    });
    return {
      ok: result.verification_status === 'SUCCESS',
      result,
    };
  } catch (e) {
    return { ok: false, reason: 'api_error', error: e.message };
  }
}

module.exports = {
  getAccessToken,
  paypalFetch,
  verifyWebhookSignature,
  timingSafeEqual,
  PAYPAL_BASE_URL,
};
