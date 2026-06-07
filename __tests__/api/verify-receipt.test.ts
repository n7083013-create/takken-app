// ============================================================
// verify-receipt API テスト
// 重点: 認証・入力バリデーション・レートリミット・platform 分岐
// ============================================================

// 環境変数を必須項目だけ偽装
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'sa@test.iam';
process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\nFAKE\\n-----END PRIVATE KEY-----\\n';
process.env.APPLE_ISSUER_ID = 'issuer-id';
process.env.APPLE_KEY_ID = 'key-id';
process.env.APPLE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\nFAKE\\n-----END PRIVATE KEY-----\\n';

// Sentry mock
jest.mock('../../api/_sentry', () => ({
  captureServerException: jest.fn(),
  flushSentry: jest.fn(() => Promise.resolve()),
}));

// Supabase admin クライアントのチェーン可能なモック
// 各テストで挙動を差し替えるための保持変数
let supaBehavior = {
  authUser: { id: 'user-1', email_confirmed_at: '2025-01-01' } as any,
  authError: null as any,
  rateLimitCount: 0,
  iapPurchasesExisting: null as any, // 既存 purchaseToken 使用ユーザー
  profilesExisting: null as any,     // 既存 profile (PayPal 等)
  profileUpdateError: null as any,
};

function createSupabaseAdminMock() {
  const chain = (table: string): any => {
    const ops: any = {
      // select() return chain that supports .eq().eq().maybeSingle() / .gte() / etc.
      select: jest.fn((_cols?: string, opts?: any) => {
        const isCount = opts && opts.count === 'exact' && opts.head;
        const c: any = {
          eq: jest.fn(() => c),
          gte: jest.fn(() => {
            // count 用: gte が最後に呼ばれたら count を返す
            if (isCount) {
              return Promise.resolve({ count: supaBehavior.rateLimitCount, error: null });
            }
            return c;
          }),
          maybeSingle: jest.fn(() => {
            if (table === 'iap_purchases') {
              return Promise.resolve({ data: supaBehavior.iapPurchasesExisting, error: null });
            }
            if (table === 'profiles') {
              return Promise.resolve({ data: supaBehavior.profilesExisting, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          }),
        };
        return c;
      }),
      insert: jest.fn(() => Promise.resolve({ error: null })),
      update: jest.fn(() => {
        const c: any = {
          eq: jest.fn(() => {
            if (table === 'profiles') {
              return Promise.resolve({ error: supaBehavior.profileUpdateError });
            }
            // pending events update
            return {
              eq: jest.fn(() => ({
                is: jest.fn(() => Promise.resolve({ error: null })),
              })),
            };
          }),
        };
        return c;
      }),
      upsert: jest.fn(() => Promise.resolve({ error: null })),
    };
    return ops;
  };

  return {
    auth: {
      getUser: jest.fn(async (_token: string) => ({
        data: supaBehavior.authError ? null : { user: supaBehavior.authUser },
        error: supaBehavior.authError,
      })),
    },
    from: jest.fn((table: string) => chain(table)),
  };
}

const supabaseAdminMock = createSupabaseAdminMock();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => supabaseAdminMock),
}));

jest.mock('google-auth-library', () => ({
  JWT: jest.fn().mockImplementation(() => ({
    authorize: jest.fn(async () => ({ access_token: 'fake-google-token' })),
  })),
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'fake-apple-jwt'),
}));

// グローバル fetch（Play API / Apple API 用）
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

// ============================================================
// テスト用 req/res ヘルパー
// ============================================================

function makeReq(opts: { method?: string; auth?: string; body?: any; origin?: string } = {}) {
  return {
    method: opts.method ?? 'POST',
    headers: {
      authorization: opts.auth,
      origin: opts.origin,
    },
    body: opts.body ?? {},
  };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as any,
    headers: {} as Record<string, string>,
  };
  res.status = jest.fn(function (this: any, code: number) {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn(function (this: any, payload: any) {
    res.body = payload;
    return res;
  });
  res.end = jest.fn(function (this: any) {
    return res;
  });
  res.setHeader = jest.fn(function (this: any, k: string, v: string) {
    res.headers[k] = v;
    return res;
  });
  return res;
}

// ============================================================
// テスト本体
// ============================================================

describe('verify-receipt API', () => {
  let handler: any;
  const origConsoleError = console.error;
  const origConsoleWarn = console.warn;

  beforeAll(() => {
    handler = require('../../api/iap/verify-receipt.js');
    // Quiet expected errors/warnings during negative-path tests
    console.error = jest.fn();
    console.warn = jest.fn();
  });

  afterAll(() => {
    console.error = origConsoleError;
    console.warn = origConsoleWarn;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    supaBehavior = {
      authUser: { id: 'user-1', email_confirmed_at: '2025-01-01' },
      authError: null,
      rateLimitCount: 0,
      iapPurchasesExisting: null,
      profilesExisting: null,
      profileUpdateError: null,
    };
  });

  // ----------------------------------------------------------
  // CORS / Method
  // ----------------------------------------------------------
  describe('CORS / HTTP Method', () => {
    it('OPTIONS は 200 を返す', async () => {
      const req = makeReq({ method: 'OPTIONS' });
      const res = makeRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('GET は 405 Method not allowed', async () => {
      const req = makeReq({ method: 'GET' });
      const res = makeRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(405);
    });
  });

  // ----------------------------------------------------------
  // 認証
  // ----------------------------------------------------------
  describe('認証', () => {
    it('Authorization ヘッダ無しは 401', async () => {
      const req = makeReq({ method: 'POST' });
      const res = makeRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.body.error).toBe('認証が必要です');
    });

    it('Bearer 形式以外は 401', async () => {
      const req = makeReq({ method: 'POST', auth: 'Basic abc' });
      const res = makeRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('無効なトークンは 401', async () => {
      supaBehavior.authError = { message: 'invalid' };
      supaBehavior.authUser = null;
      const req = makeReq({ method: 'POST', auth: 'Bearer bad' });
      const res = makeRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('email 未確認は 403', async () => {
      supaBehavior.authUser = { id: 'user-1', email_confirmed_at: null };
      const req = makeReq({ method: 'POST', auth: 'Bearer ok', body: {} });
      const res = makeRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.body.code).toBe('email_not_confirmed');
    });
  });

  // ----------------------------------------------------------
  // 入力バリデーション
  // ----------------------------------------------------------
  describe('入力バリデーション', () => {
    it('platform 未指定は 400', async () => {
      const req = makeReq({ method: 'POST', auth: 'Bearer ok', body: {} });
      const res = makeRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.body.error).toBe('不正な platform');
    });

    it('platform=windows などは 400', async () => {
      const req = makeReq({
        method: 'POST',
        auth: 'Bearer ok',
        body: { platform: 'windows', productId: 'p' },
      });
      const res = makeRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('productId 未指定は 400', async () => {
      const req = makeReq({
        method: 'POST',
        auth: 'Bearer ok',
        body: { platform: 'android' },
      });
      const res = makeRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.body.error).toBe('不正な productId');
    });

    it('productId が string 以外は 400', async () => {
      const req = makeReq({
        method: 'POST',
        auth: 'Bearer ok',
        body: { platform: 'android', productId: 123 },
      });
      const res = makeRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  // ----------------------------------------------------------
  // レートリミット (iap_verify_attempts)
  // ----------------------------------------------------------
  describe('レートリミット', () => {
    it('5分内に 10 回以上で 429', async () => {
      supaBehavior.rateLimitCount = 10;
      const req = makeReq({
        method: 'POST',
        auth: 'Bearer ok',
        body: {
          platform: 'android',
          productId: 'premium_monthly',
          purchaseToken: 'tok',
        },
      });
      const res = makeRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.body.code).toBe('rate_limit_exceeded');
    });

    it('9 回ならまだ通る（プラットフォーム処理に進む）', async () => {
      supaBehavior.rateLimitCount = 9;
      // 後続の Play API 呼び出しでエラーにする（レート以外で止まる確認）
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'play api fail',
        json: async () => ({}),
      });
      const req = makeReq({
        method: 'POST',
        auth: 'Bearer ok',
        body: {
          platform: 'android',
          productId: 'premium_monthly',
          purchaseToken: 'tok',
        },
      });
      const res = makeRes();
      await handler(req, res);
      // 429 では無いこと
      expect(res.status).not.toHaveBeenCalledWith(429);
    });
  });

  // ----------------------------------------------------------
  // platform=android 二重利用検出
  // ----------------------------------------------------------
  describe('Android 二重利用検出', () => {
    it('別ユーザーで同じ purchaseToken が使われていれば 409', async () => {
      supaBehavior.iapPurchasesExisting = { user_id: 'OTHER-USER' };
      const req = makeReq({
        method: 'POST',
        auth: 'Bearer ok',
        body: {
          platform: 'android',
          productId: 'premium_monthly',
          purchaseToken: 'tok',
        },
      });
      const res = makeRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(409);
    });

    it('PayPal 契約中ユーザーが Android で課金しようとすると 409', async () => {
      supaBehavior.profilesExisting = {
        payment_provider: 'paypal',
        subscription_status: 'active',
        paypal_subscription_id: 'I-xxx',
      };
      const req = makeReq({
        method: 'POST',
        auth: 'Bearer ok',
        body: {
          platform: 'android',
          productId: 'premium_monthly',
          purchaseToken: 'tok',
        },
      });
      const res = makeRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.body.code).toBe('paypal_subscription_active');
    });
  });

  // ----------------------------------------------------------
  // platform=android purchaseToken 必須
  // ----------------------------------------------------------
  describe('Android 入力', () => {
    it('purchaseToken なしは 400', async () => {
      const req = makeReq({
        method: 'POST',
        auth: 'Bearer ok',
        body: { platform: 'android', productId: 'premium_monthly' },
      });
      const res = makeRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  // ----------------------------------------------------------
  // platform=ios 入力
  // ----------------------------------------------------------
  describe('iOS 入力', () => {
    it('transactionId/transactionReceipt なしは 400', async () => {
      const req = makeReq({
        method: 'POST',
        auth: 'Bearer ok',
        body: { platform: 'ios', productId: 'premium_monthly' },
      });
      const res = makeRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('別ユーザーで同 transactionId が使われていれば 409', async () => {
      supaBehavior.iapPurchasesExisting = { user_id: 'OTHER-USER' };
      const req = makeReq({
        method: 'POST',
        auth: 'Bearer ok',
        body: {
          platform: 'ios',
          productId: 'premium_monthly',
          transactionId: 'tx-1',
        },
      });
      const res = makeRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(409);
    });
  });

  // ----------------------------------------------------------
  // 通常時の Android 成功フロー（fetch をモック）
  // ----------------------------------------------------------
  describe('Android 検証フロー', () => {
    it('Play API でエラー時は 500', async () => {
      // fetchPlaySubscription のレスポンスを 500 にしてエラーパスへ
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'failed',
      });
      const req = makeReq({
        method: 'POST',
        auth: 'Bearer ok',
        body: {
          platform: 'android',
          productId: 'premium_monthly',
          purchaseToken: 'tok',
        },
      });
      const res = makeRes();
      await handler(req, res);
      // catch ブロックで 500 を返す想定
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('SUBSCRIPTION_STATE_ACTIVE で正常応答', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
          lineItems: [{
            expiryTime: '2030-01-01T00:00:00Z',
            offerDetails: { offerId: 'free-trial-7d', offerTags: ['trial'] },
          }],
          latestOrderId: 'order-1',
          acknowledgementState: 'ACKNOWLEDGED',
        }),
      });
      const req = makeReq({
        method: 'POST',
        auth: 'Bearer ok',
        body: {
          platform: 'android',
          productId: 'premium_monthly',
          purchaseToken: 'tok',
        },
      });
      const res = makeRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.plan).toBe('premium');
      expect(res.body.isTrial).toBe(true);
    });

    it('SUBSCRIPTION_STATE_EXPIRED は 400', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED',
          lineItems: [],
        }),
      });
      const req = makeReq({
        method: 'POST',
        auth: 'Bearer ok',
        body: {
          platform: 'android',
          productId: 'premium_monthly',
          purchaseToken: 'tok',
        },
      });
      const res = makeRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.body.code).toBe('invalid_subscription_state');
    });

    it('expiryTime 無しは 400', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
          lineItems: [{}],
        }),
      });
      const req = makeReq({
        method: 'POST',
        auth: 'Bearer ok',
        body: {
          platform: 'android',
          productId: 'premium_monthly',
          purchaseToken: 'tok',
        },
      });
      const res = makeRes();
      await handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
