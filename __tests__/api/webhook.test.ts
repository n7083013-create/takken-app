// ============================================================
// PayPal Webhook ハンドラ統合テスト (takken / 本番 takkenkanzen.com の Web課金経路)
// ============================================================
//
// 金銭処理の中核。本番コードは一切変更せず、Supabase / 署名検証をモックして
// イベント → profiles 更新ペイロードのマッピングを実ハンドラで検証する。
// 守りたい性質:
// 1. POST 以外 → 405
// 2. 署名検証失敗 → 401(不正 webhook を弾く)
// 3. ACTIVATED → plan:'premium' + status:'active' を書き込む
// 4. CANCELLED → status:'canceled'(plan は据え置き=期間終了まで standard 維持)
// 5. EXPIRED/SUSPENDED → plan:'free' + status:'canceled'
// 6. PAYMENT 失敗 → status:'past_due'
// 7. 冪等性: 既に期待状態なら update を呼ばない

process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
process.env.PAYPAL_WEBHOOK_ID = 'wh-test';

// mock 接頭辞: jest.mock ファクトリ内から参照可能(外部変数参照制限の例外)
let mockCurrentProfile: Record<string, unknown> | null = null;
let mockUpdateCalls: Array<{ table: string; payload: Record<string, unknown> }> = [];

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: mockCurrentProfile, error: null }),
        }),
      }),
      update: (payload: Record<string, unknown>) => {
        mockUpdateCalls.push({ table, payload });
        return { eq: () => Promise.resolve({ error: null }) };
      },
      upsert: () => Promise.resolve({ error: null }),
    }),
  }),
}));

jest.mock('../../api/_paypal-utils', () => ({ verifyWebhookSignature: jest.fn() }));
jest.mock('../../api/_email-utils', () => ({ hashEmail: () => 'emailhash' }));
jest.mock('../../api/_sentry', () => ({
  captureServerException: jest.fn(),
  flushSentry: () => Promise.resolve(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { verifyWebhookSignature } = require('../../api/_paypal-utils');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const handler = require('../../api/paypal/webhook');

function mockRes() {
  const res: { statusCode: number; body: unknown; status: (c: number) => typeof res; json: (b: unknown) => typeof res } = {
    statusCode: 0,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
  return res;
}

async function callWebhook(
  event: unknown,
  opts: { method?: string; signatureOk?: boolean } = {},
) {
  const { method = 'POST', signatureOk = true } = opts;
  verifyWebhookSignature.mockResolvedValue({ ok: signatureOk, reason: 'mock' });
  const res = mockRes();
  await handler({ method, headers: {}, body: event }, res);
  return res;
}

const RESOURCE = {
  id: 'I-SUB-123',
  custom_id: 'user-123',
  subscriber: { payer_id: 'PAYER1', email_address: 'u@example.com' },
  billing_info: { next_billing_time: '2026-07-01T00:00:00Z' },
};

beforeEach(() => {
  mockUpdateCalls = [];
  // 既定: 更新が必ず走るよう、期待値と異なる初期状態にしておく
  mockCurrentProfile = {
    plan: 'free',
    subscription_status: 'none',
    paypal_subscription_id: null,
    trial_ends_at: null,
    subscription_ends_at: null,
  };
});

describe('takken PayPal webhook ハンドラ', () => {
  it('POST 以外は 405', async () => {
    const res = await callWebhook({}, { method: 'GET' });
    expect(res.statusCode).toBe(405);
  });

  it('署名検証失敗は 401', async () => {
    const res = await callWebhook(
      { event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: RESOURCE },
      { signatureOk: false },
    );
    expect(res.statusCode).toBe(401);
    expect(mockUpdateCalls).toHaveLength(0); // 検証失敗時は DB を触らない
  });

  it('ACTIVATED → plan:standard + status:active を書き込む', async () => {
    const res = await callWebhook({ event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: RESOURCE });
    expect(res.statusCode).toBe(200);
    const profileUpdate = mockUpdateCalls.find((c) => c.table === 'profiles');
    expect(profileUpdate?.payload.plan).toBe('premium');
    expect(profileUpdate?.payload.subscription_status).toBe('active');
    expect(profileUpdate?.payload.paypal_subscription_id).toBe('I-SUB-123');
  });

  it('CANCELLED → status:canceled(plan は据え置き)', async () => {
    mockCurrentProfile = { plan: 'premium', subscription_status: 'active' };
    const res = await callWebhook({ event_type: 'BILLING.SUBSCRIPTION.CANCELLED', resource: RESOURCE });
    expect(res.statusCode).toBe(200);
    const profileUpdate = mockUpdateCalls.find((c) => c.table === 'profiles');
    expect(profileUpdate?.payload.subscription_status).toBe('canceled');
    expect(profileUpdate?.payload).not.toHaveProperty('plan'); // 期間終了まで standard を維持
  });

  it('EXPIRED → plan:free + status:canceled', async () => {
    mockCurrentProfile = { plan: 'premium', subscription_status: 'active' };
    const res = await callWebhook({ event_type: 'BILLING.SUBSCRIPTION.EXPIRED', resource: RESOURCE });
    expect(res.statusCode).toBe(200);
    const profileUpdate = mockUpdateCalls.find((c) => c.table === 'profiles');
    expect(profileUpdate?.payload.plan).toBe('free');
    expect(profileUpdate?.payload.subscription_status).toBe('canceled');
  });

  it('課金失敗(PAYMENT.SALE.DENIED) → status:past_due', async () => {
    mockCurrentProfile = { plan: 'premium', subscription_status: 'active' };
    const res = await callWebhook({ event_type: 'PAYMENT.SALE.DENIED', resource: RESOURCE });
    expect(res.statusCode).toBe(200);
    const profileUpdate = mockUpdateCalls.find((c) => c.table === 'profiles');
    expect(profileUpdate?.payload.subscription_status).toBe('past_due');
  });

  it('冪等性: 既に canceled なら update を呼ばない', async () => {
    mockCurrentProfile = { plan: 'premium', subscription_status: 'canceled' };
    const res = await callWebhook({ event_type: 'BILLING.SUBSCRIPTION.CANCELLED', resource: RESOURCE });
    expect(res.statusCode).toBe(200);
    expect(mockUpdateCalls.find((c) => c.table === 'profiles')).toBeUndefined();
  });
});
