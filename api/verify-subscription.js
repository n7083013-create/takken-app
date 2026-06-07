// ============================================================
// サブスクリプション検証 API
// POST /api/verify-subscription
// Supabase profiles テーブルの plan を確認してユーザーのプラン状態を返す
// 追加: Google Play 課金者は RTDN 不在時のフォールバックとして
//      Play Developer API でも最新状態を取得して整合性を保つ
// ============================================================

const { captureServerException, flushSentry } = require('./_sentry');

const PAST_DUE_GRACE_DAYS = 7;
// Play API を再ヒットする間隔（短すぎるとレート/レイテンシ悪化、長すぎると同期遅れ）
const PLAY_API_REVALIDATE_MS = 60 * 60 * 1000; // 1 時間

const ANDROID_PACKAGE_NAME = process.env.ANDROID_PACKAGE_NAME || 'com.takkenkanzen.app';

/**
 * Service Account 認証で Play Developer API のアクセストークンを取得
 */
async function getPlayApiAccessToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!email || !privateKey) return null;

  // google-auth-library を動的 import
  const { JWT } = require('google-auth-library');
  const client = new JWT({
    email,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  await client.authorize();
  return client.credentials.access_token;
}

/**
 * Play API でサブスクリプション最新状態を取得
 * @returns {Promise<{state, expiryTime, isTrial} | null>}
 */
async function fetchPlaySubscription(purchaseToken) {
  try {
    const accessToken = await getPlayApiAccessToken();
    if (!accessToken) return null;

    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
      ANDROID_PACKAGE_NAME,
    )}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      console.warn('[VerifySub] Play API fetch failed:', res.status, await res.text().catch(() => ''));
      return null;
    }
    const data = await res.json();
    const lineItem = data.lineItems?.[0];
    const offerId = lineItem?.offerDetails?.offerId;
    const offerTags = lineItem?.offerDetails?.offerTags || [];
    const isTrial = Boolean(offerId) || offerTags.some((t) => /trial|free/i.test(t));

    return {
      state: data.subscriptionState,
      expiryTime: lineItem?.expiryTime || null,
      isTrial,
    };
  } catch (e) {
    console.warn('[VerifySub] Play API error:', e.message);
    return null;
  }
}

/**
 * Play API の subscriptionState を profiles の subscription_status にマップ
 */
function mapPlayState(playState) {
  switch (playState) {
    case 'SUBSCRIPTION_STATE_ACTIVE':
      return 'active';
    case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD':
      return 'past_due';
    case 'SUBSCRIPTION_STATE_ON_HOLD':
    case 'SUBSCRIPTION_STATE_PAUSED':
      return 'past_due';
    case 'SUBSCRIPTION_STATE_CANCELED':
      return 'canceled';
    case 'SUBSCRIPTION_STATE_EXPIRED':
      return 'canceled';
    case 'SUBSCRIPTION_STATE_PENDING':
      return 'creating';
    default:
      return null;
  }
}

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

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('[VerifySub] Missing env vars:', {
      hasUrl: !!supabaseUrl,
      hasKey: !!serviceKey,
    });
    return res.status(500).json({ error: 'サーバー設定エラー' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('plan, subscription_status, trial_ends_at, subscription_ends_at, payment_provider, google_play_purchase_token, updated_at')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('[VerifySub] Profile fetch error:', profileError.message);
      return res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }

    if (!profile) {
      await supabaseAdmin.from('profiles').insert({
        id: user.id,
        email: user.email,
        plan: 'free',
      });
      return res.status(200).json({
        plan: 'free',
        isPro: false,
        subscriptionStatus: 'none',
      });
    }

    // [H4 安全網] Google Play 課金者で last update から1時間以上経過してたら
    // Play API で最新状態を取得して同期する（RTDN 不在時のフォールバック）
    let working = { ...profile };
    if (
      profile.payment_provider === 'google_play' &&
      profile.google_play_purchase_token
    ) {
      const updatedAt = profile.updated_at ? new Date(profile.updated_at).getTime() : 0;
      const stale = Date.now() - updatedAt > PLAY_API_REVALIDATE_MS;
      if (stale) {
        const playState = await fetchPlaySubscription(profile.google_play_purchase_token);
        if (playState) {
          const mappedStatus = playState.isTrial ? 'trialing' : mapPlayState(playState.state);
          if (mappedStatus && mappedStatus !== profile.subscription_status) {
            // DB と乖離 → 更新
            const updates = {
              subscription_status: mappedStatus,
              updated_at: new Date().toISOString(),
            };
            if (playState.expiryTime) {
              if (playState.isTrial) {
                updates.trial_ends_at = playState.expiryTime;
              } else {
                updates.subscription_ends_at = playState.expiryTime;
                updates.trial_ends_at = null;
              }
            }
            if (mappedStatus === 'canceled') {
              // 期間終了まで standard 維持。期限切れなら free に
              if (playState.expiryTime && new Date(playState.expiryTime) < new Date()) {
                updates.plan = 'free';
              }
            }
            const { error: syncError } = await supabaseAdmin
              .from('profiles')
              .update(updates)
              .eq('id', user.id);
            if (!syncError) {
              working = { ...profile, ...updates };
              console.log('[VerifySub] Synced from Play API:', user.id, mappedStatus);
            }
          }
        }
      }
    }

    // [統一/降格防止] 正準値は 'premium'。旧 'standard'/'unlimited' も Pro 扱いにし、
    // 命名移行期や未マイグレーション行でも課金者を絶対に free へ降格させない (P2 安全)。
    let isPro = working.plan === 'premium' || working.plan === 'standard' || working.plan === 'unlimited';

    if (working.subscription_status === 'trialing' && working.trial_ends_at) {
      isPro = new Date(working.trial_ends_at) > new Date();
    }
    if (working.subscription_status === 'active' && working.subscription_ends_at) {
      isPro = new Date(working.subscription_ends_at) > new Date();
    }
    if (working.subscription_status === 'past_due') {
      if (working.subscription_ends_at) {
        const endDate = new Date(working.subscription_ends_at);
        const graceEnd = new Date(endDate.getTime() + PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000);
        isPro = new Date() < graceEnd;
      } else {
        isPro = false;
      }
    }
    if (working.subscription_status === 'canceled') {
      // canceled は期間終了まで standard 維持（subscription_ends_at で判定）
      if (working.subscription_ends_at) {
        isPro = new Date(working.subscription_ends_at) > new Date();
      } else {
        isPro = false;
      }
    }

    res.setHeader('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');

    return res.status(200).json({
      plan: isPro ? 'premium' : 'free',
      isPro,
      subscriptionStatus: working.subscription_status,
      trialEndsAt: working.trial_ends_at,
      subscriptionEndsAt: working.subscription_ends_at,
    });
  } catch (err) {
    console.error('[VerifySub] Error:', err.message);
    captureServerException(err, {
      context: 'verify-subscription',
      route: '/api/verify-subscription',
    });
    await flushSentry();
    return res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
};
