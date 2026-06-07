// ============================================================
// IAP レシート検証 API
// POST /api/iap/verify-receipt
// ============================================================
// クライアントから受け取った購入トークンを Google Play Developer API
// （または Apple App Store Server API）で検証し、profiles を更新。
//
// 認証: Supabase Bearer Token
// 入力: { platform, productId, purchaseToken | transactionReceipt }
// 出力: { ok, plan, expiresAt }
//
// 必要環境変数（Vercel）:
//   - GOOGLE_SERVICE_ACCOUNT_EMAIL  : Play Developer API 用 SA メール
//   - GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY : SA 秘密鍵（改行は \n で）
//   - ANDROID_PACKAGE_NAME : 'com.takkenkanzen.app'（変更時はここも更新）
// ============================================================

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const { JWT } = require('google-auth-library');
const { captureServerException, flushSentry } = require('../_sentry');

const supabaseAdmin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const ANDROID_PACKAGE_NAME = process.env.ANDROID_PACKAGE_NAME || 'com.takkenkanzen.app';
const APPLE_BUNDLE_ID = process.env.APPLE_BUNDLE_ID || 'com.takkenkanzen.app';

// CORS — モバイルアプリは Origin が無いケース多いが、Web版互換のため設定
const ALLOWED_ORIGINS = [
  'https://takken-app-olive.vercel.app',
  'https://takkenkanzen.com',
  'https://www.takkenkanzen.com',
  'https://app.takkenkanzen.com',
];

// ─────────────────────────────────────────────
// Google Play Developer API クライアント
// ─────────────────────────────────────────────

/**
 * Service Account でアクセストークン取得
 * （JWT を androidpublisher スコープで signing）
 */
async function getPlayApiAccessToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (!email || !privateKey) {
    throw new Error('Google Service Account credentials not configured');
  }

  const client = new JWT({
    email,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  const { access_token } = await client.authorize();
  if (!access_token) throw new Error('Failed to obtain Play API access token');
  return access_token;
}

/**
 * Play Developer API で subscriptionsv2 を取得
 * @returns {Promise<{state, lineItems, latestOrderId, ...}>}
 */
async function fetchPlaySubscription(purchaseToken) {
  const accessToken = await getPlayApiAccessToken();
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
    ANDROID_PACKAGE_NAME,
  )}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Play API error ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * Play Subscription を Acknowledge（旧API・v2 では自動だが安全策）
 * v2 で取得時に自動 acknowledge されるが、
 * クライアント側でも finishTransaction で acknowledge する設計
 */
async function acknowledgePlaySubscription(purchaseToken) {
  try {
    const accessToken = await getPlayApiAccessToken();
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
      ANDROID_PACKAGE_NAME,
    )}/purchases/subscriptions/${encodeURIComponent('premium_monthly')}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
    await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
  } catch (e) {
    // acknowledge 失敗は致命的ではない（クライアント finishTransaction が後でやる）
    console.warn('[iap.verify] acknowledge warning:', e.message);
  }
}

// ─────────────────────────────────────────────
// Apple App Store Server API (modern, JWS-signed)
// ─────────────────────────────────────────────
// 参考:
//   https://developer.apple.com/documentation/appstoreserverapi
//   https://developer.apple.com/documentation/appstoreserverapi/get-v1-transactions-_transactionid_
//
// 仕組み:
//   1. ES256 で JWT を署名（API認証用）
//   2. GET /inApps/v1/transactions/{transactionId} で signedTransactionInfo を取得
//   3. signedTransactionInfo (JWS) を decode して購入詳細を抽出
//      ※ Apple API から認証付きで取得しているため、JWS の追加検証は省略
const APPLE_API_PROD = 'https://api.storekit.itunes.apple.com';
const APPLE_API_SANDBOX = 'https://api.storekit-sandbox.itunes.apple.com';

/**
 * App Store Server API 用 JWT を生成（ES256 / 1時間有効）
 */
function generateAppleApiToken() {
  const issuerId = process.env.APPLE_ISSUER_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const privateKeyRaw = process.env.APPLE_PRIVATE_KEY;
  if (!issuerId || !keyId || !privateKeyRaw) {
    throw new Error('Apple API credentials not configured');
  }
  // .p8 の改行が \n でエンコードされているケースに対応
  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');

  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: issuerId,
      iat: now,
      exp: now + 3600, // 最大 1 時間
      aud: 'appstoreconnect-v1',
      bid: APPLE_BUNDLE_ID,
    },
    privateKey,
    {
      algorithm: 'ES256',
      header: { kid: keyId, typ: 'JWT' },
    },
  );
}

/**
 * 署名付き JWS をデコード（ペイロードのみ抽出）
 * Apple API 認証経由なのでここでは署名検証は省略。
 * ASN webhook 側ではフル検証する。
 */
function decodeJwsPayload(signedToken) {
  if (typeof signedToken !== 'string' || !signedToken.includes('.')) {
    throw new Error('Invalid JWS format');
  }
  const parts = signedToken.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWS structure');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  return payload;
}

/**
 * App Store Server API でトランザクション情報を取得
 * Production を先に試し、404 ならサンドボックスにフォールバック
 * @returns {Promise<{ok:true, productId, expiresMs, transactionId, originalTransactionId, isTrial} | {ok:false, code, status}>}
 */
async function verifyAppleTransaction(transactionId) {
  let token;
  try {
    token = generateAppleApiToken();
  } catch (e) {
    return { ok: false, code: 'apple_credentials_missing', status: -1 };
  }

  const fetchOnce = async (baseUrl) => {
    const url = `${baseUrl}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    return res;
  };

  // 1) Prod 先行
  let res = await fetchOnce(APPLE_API_PROD);
  // 2) 404 → Sandbox（TestFlight / Sandbox 購入）
  if (res.status === 404) {
    res = await fetchOnce(APPLE_API_SANDBOX);
  }
  if (!res.ok) {
    return { ok: false, code: 'apple_api_error', status: res.status };
  }

  const body = await res.json().catch(() => ({}));
  const signed = body.signedTransactionInfo;
  if (!signed) {
    return { ok: false, code: 'no_signed_transaction', status: -1 };
  }

  let payload;
  try {
    payload = decodeJwsPayload(signed);
  } catch (e) {
    return { ok: false, code: 'jws_decode_failed', status: -1 };
  }

  // bundleId 検証（別アプリのレシート流用防止）
  if (payload.bundleId !== APPLE_BUNDLE_ID) {
    return { ok: false, code: 'bundle_id_mismatch', status: -1 };
  }

  // type が "Auto-Renewable Subscription" であることを確認
  if (payload.type !== 'Auto-Renewable Subscription') {
    return { ok: false, code: 'not_subscription', status: -1 };
  }

  // offerType: 1=Introductory (無料トライアル含む), 2=Promotional, 3=Code
  // offerDiscountType: 'FREE_TRIAL' があればトライアル中
  const isTrial =
    payload.offerType === 1 ||
    payload.offerDiscountType === 'FREE_TRIAL';

  return {
    ok: true,
    productId: payload.productId,
    expiresMs: payload.expiresDate, // ms (signedTransactionInfo)
    transactionId: payload.transactionId,
    originalTransactionId: payload.originalTransactionId,
    appAccountToken: payload.appAccountToken || null, // SECURITY: ユーザー所有検証用
    isTrial,
  };
}

// ─────────────────────────────────────────────
// メインハンドラー
// ─────────────────────────────────────────────
module.exports = async (req, res) => {
  // CORS
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 認証
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: '認証が必要です' });
  }
  const token = authHeader.replace('Bearer ', '');
  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData?.user) {
    return res.status(401).json({ error: '無効な認証トークンです' });
  }
  const user = authData.user;
  if (!user.email_confirmed_at) {
    return res.status(403).json({
      error: 'メール確認が完了していません',
      code: 'email_not_confirmed',
    });
  }

  // 入力バリデーション
  const { platform, productId, purchaseToken, transactionReceipt, transactionId } = req.body || {};
  if (!platform || !['android', 'ios'].includes(platform)) {
    return res.status(400).json({ error: '不正な platform' });
  }
  if (!productId || typeof productId !== 'string') {
    return res.status(400).json({ error: '不正な productId' });
  }

  // [M4 レートリミット] 同一ユーザーの 5分間で 10回以上の verify は弾く
  // SECURITY (Issue #5): 旧実装は iap_purchases.verified_at を upsert で更新するため
  // 同じ purchaseToken 連打でカウントが伸びず実質ザル。専用テーブル iap_verify_attempts を使用
  try {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { count: recentVerifyCount } = await supabaseAdmin
      .from('iap_verify_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('attempted_at', fiveMinAgo);
    if ((recentVerifyCount || 0) >= 10) {
      return res.status(429).json({
        error: 'リクエストが多すぎます。少し待ってからお試しください。',
        code: 'rate_limit_exceeded',
      });
    }
    // 試行を必ず記録（成功/失敗どちらでもカウント対象。fail-closed で正しい挙動）
    await supabaseAdmin.from('iap_verify_attempts').insert({
      user_id: user.id,
      platform,
      ok: false, // 後で成功時に true に更新せず単純カウント方式
    });
  } catch (e) {
    // レートリミットチェック失敗は通す（正常運用優先）
    console.warn('[iap.verify] rate-limit check failed:', e.message);
  }

  try {
    if (platform === 'android') {
      if (!purchaseToken || typeof purchaseToken !== 'string') {
        return res.status(400).json({ error: 'purchaseToken が必要です' });
      }

      // 1. 二重利用チェック（同じ purchaseToken を別ユーザーが申告するのを防止）
      const { data: existingUse } = await supabaseAdmin
        .from('iap_purchases')
        .select('user_id')
        .eq('platform', 'android')
        .eq('purchase_token', purchaseToken)
        .maybeSingle();
      if (existingUse && existingUse.user_id !== user.id) {
        console.warn('[iap.verify] purchaseToken already used by another user');
        return res.status(409).json({ error: '既に別のアカウントで使用済みのレシートです' });
      }

      // 1.5. PayPal 重複課金防止
      // Web で既に PayPal 契約中のユーザーが Android で再課金しようとすると二重課金になる
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('payment_provider, subscription_status, paypal_subscription_id')
        .eq('id', user.id)
        .maybeSingle();
      if (
        existingProfile?.payment_provider === 'paypal' &&
        ['active', 'trialing'].includes(existingProfile.subscription_status) &&
        existingProfile.paypal_subscription_id
      ) {
        return res.status(409).json({
          error: 'すでにWeb版で課金中です。Android版で課金する前に、Web版の解約をお願いします。',
          code: 'paypal_subscription_active',
        });
      }

      // 2. Google Play Developer API で検証
      const sub = await fetchPlaySubscription(purchaseToken);
      // sub.subscriptionState の値:
      //   SUBSCRIPTION_STATE_ACTIVE / IN_GRACE_PERIOD / ON_HOLD / PAUSED /
      //   CANCELED / EXPIRED / PENDING / UNSPECIFIED
      const state = sub.subscriptionState;
      const validStates = ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'];
      if (!validStates.includes(state)) {
        return res.status(400).json({
          error: 'サブスクリプションが有効状態ではありません',
          code: 'invalid_subscription_state',
          state,
        });
      }

      // 3. 期限取得 + Trial 判定
      const lineItem = sub.lineItems?.[0];
      const expiryTime = lineItem?.expiryTime; // ISO8601
      if (!expiryTime) {
        return res.status(400).json({ error: '有効期限が取得できませんでした' });
      }

      // 7日無料トライアル中か判定
      // offerDetails.offerId に offer ID（free-trial-7d 等）が入る、トライアル中はそれが存在
      // テスト環境差異を吸収するため複数経路で確認
      const offerId = lineItem?.offerDetails?.offerId;
      const offerTags = lineItem?.offerDetails?.offerTags || [];
      const isTrialOffer =
        Boolean(offerId) || // offerId 存在＝base plan ではなく特別オファー
        offerTags.some((t) => /trial|free/i.test(t));

      // paymentState フォールバック（v2 では存在しない場合があるが、たまに入る）
      const paymentState = sub.acknowledgementState; // ACKNOWLEDGED / PENDING
      const isTrial = isTrialOffer;

      // 4. profile 更新
      // - トライアル中: subscription_status='trialing', trial_ends_at=expiry
      // - 本契約中:    subscription_status='active',   subscription_ends_at=expiry
      const profileUpdates = {
        plan: 'premium',
        payment_provider: 'google_play',
        google_play_purchase_token: purchaseToken,
        google_play_product_id: productId,
        updated_at: new Date().toISOString(),
      };
      if (isTrial) {
        profileUpdates.subscription_status = 'trialing';
        profileUpdates.trial_ends_at = expiryTime;
        // subscription_ends_at は本契約成立後（RTDN SUBSCRIPTION_RENEWED 受信時）にセット
      } else {
        profileUpdates.subscription_status = 'active';
        profileUpdates.subscription_ends_at = expiryTime;
        profileUpdates.trial_ends_at = null; // 本契約に移行したら trial_ends_at をクリア
      }

      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update(profileUpdates)
        .eq('id', user.id);

      if (updateError) {
        console.error('[iap.verify] profile update failed:', updateError.message);
        return res.status(500).json({ error: 'プロフィール更新に失敗しました' });
      }

      // 5. iap_purchases に記録（重複検出用・冪等）
      await supabaseAdmin
        .from('iap_purchases')
        .upsert(
          {
            user_id: user.id,
            platform: 'android',
            product_id: productId,
            purchase_token: purchaseToken,
            order_id: sub.latestOrderId || null,
            verified_at: new Date().toISOString(),
          },
          { onConflict: 'platform,purchase_token', ignoreDuplicates: false },
        );

      // Issue #12: pending RTDN events の reconcile（先着 webhook を消化）
      try {
        await supabaseAdmin
          .from('iap_pending_events')
          .update({ reconciled_at: new Date().toISOString() })
          .eq('platform', 'android')
          .eq('purchase_token', purchaseToken)
          .is('reconciled_at', null);
      } catch (e) {
        console.warn('[iap.verify] pending reconcile failed:', e.message);
      }

      // 6. acknowledge: subscriptionsv2 取得時点で Google が自動 ack 済み + クライアント
      // finishTransaction でも ack される。サーバー側の追加 acknowledge は不要（v1 SKU base API は 404 を量産する）。

      return res.status(200).json({
        ok: true,
        plan: 'premium',
        expiresAt: expiryTime,
        state,
        isTrial,
        // クライアントが trial 中か判別するため。trackEvent('subscribe_complete') ではなく
        // 'trial_start' を撃つ判断に使える。
      });
    }

    // ─── iOS App Store ───
    if (platform === 'ios') {
      // expo-iap は iOS で transactionId (StoreKit 2) を返す
      // 旧仕様の transactionReceipt 文字列にも対応（フォールバック互換）
      const iosTxId = transactionId || transactionReceipt;
      if (!iosTxId || typeof iosTxId !== 'string') {
        return res.status(400).json({ error: 'transactionId が必要です' });
      }

      // 二重利用チェック（originalTransactionId は検証後に確定するので、
      // ここでは transactionId で軽くチェック）
      const { data: existingUse } = await supabaseAdmin
        .from('iap_purchases')
        .select('user_id')
        .eq('platform', 'ios')
        .eq('order_id', iosTxId)
        .maybeSingle();
      if (existingUse && existingUse.user_id !== user.id) {
        return res.status(409).json({ error: '既に別のアカウントで使用済みのレシートです' });
      }

      // PayPal 重複課金防止
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('payment_provider, subscription_status, paypal_subscription_id')
        .eq('id', user.id)
        .maybeSingle();
      if (
        existingProfile?.payment_provider === 'paypal' &&
        ['active', 'trialing'].includes(existingProfile.subscription_status) &&
        existingProfile.paypal_subscription_id
      ) {
        return res.status(409).json({
          error: 'すでにWeb版で課金中です。iOS版で課金する前に、Web版の解約をお願いします。',
          code: 'paypal_subscription_active',
        });
      }

      // App Store Server API で検証
      const verified = await verifyAppleTransaction(iosTxId);
      if (!verified.ok) {
        return res.status(400).json({
          error: 'レシート検証に失敗しました',
          code: verified.code,
          status: verified.status,
        });
      }

      // SECURITY (Issue #4): appAccountToken が設定されている場合、現ユーザーIDと一致確認
      // クライアントは購入時に user.id を appAccountToken として渡す
      if (verified.appAccountToken) {
        const claimedToken = String(verified.appAccountToken).toLowerCase();
        const currentUserId = String(user.id).toLowerCase();
        if (claimedToken !== currentUserId) {
          return res.status(403).json({
            error: '購入情報がログインユーザーと一致しません',
            code: 'app_account_token_mismatch',
          });
        }
      }

      // 期限切れなら active 認定しない
      if (verified.expiresMs <= Date.now()) {
        return res.status(400).json({
          error: '有効期限切れのレシートです',
          code: 'expired_receipt',
        });
      }

      // productId 一致確認（クライアント宣言と Apple 検証結果）
      if (verified.productId !== productId) {
        return res.status(400).json({
          error: '商品IDが一致しません',
          code: 'product_id_mismatch',
        });
      }

      const expiryTime = new Date(verified.expiresMs).toISOString();

      // profile 更新（trial / 本契約で分岐）
      const profileUpdates = {
        plan: 'premium',
        payment_provider: 'apple',
        apple_original_transaction_id: verified.originalTransactionId,
        apple_product_id: verified.productId,
        updated_at: new Date().toISOString(),
      };
      if (verified.isTrial) {
        profileUpdates.subscription_status = 'trialing';
        profileUpdates.trial_ends_at = expiryTime;
      } else {
        profileUpdates.subscription_status = 'active';
        profileUpdates.subscription_ends_at = expiryTime;
        profileUpdates.trial_ends_at = null;
      }

      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update(profileUpdates)
        .eq('id', user.id);

      if (updateError) {
        console.error('[iap.verify] profile update failed:', updateError.message);
        return res.status(500).json({ error: 'プロフィール更新に失敗しました' });
      }

      // iap_purchases に記録
      await supabaseAdmin
        .from('iap_purchases')
        .upsert(
          {
            user_id: user.id,
            platform: 'ios',
            product_id: productId,
            // iOS は originalTransactionId を主識別子に（リカバリ・更新時もこれが共通）
            purchase_token: verified.originalTransactionId,
            order_id: verified.transactionId,
            verified_at: new Date().toISOString(),
          },
          { onConflict: 'platform,purchase_token', ignoreDuplicates: false },
        );

      // Issue #12: pending ASN events の reconcile
      try {
        await supabaseAdmin
          .from('iap_pending_events')
          .update({ reconciled_at: new Date().toISOString() })
          .eq('platform', 'ios')
          .eq('purchase_token', verified.originalTransactionId)
          .is('reconciled_at', null);
      } catch (e) {
        console.warn('[iap.verify] pending reconcile failed:', e.message);
      }

      return res.status(200).json({
        ok: true,
        plan: 'premium',
        expiresAt: expiryTime,
        isTrial: verified.isTrial,
      });
    }

    return res.status(400).json({ error: '未対応の platform' });
  } catch (e) {
    console.error('[iap.verify] error:', e.message, e.stack);
    captureServerException(e, {
      context: 'iap.verify-receipt',
      route: '/api/iap/verify-receipt',
      userId: user && user.id,
      extra: { platform, productId },
    });
    await flushSentry();
    return res.status(500).json({ error: 'レシート検証に失敗しました' });
  }
};
