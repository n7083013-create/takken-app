// ============================================================
// PayPal create-subscription API のヘルパー関数テスト
// ============================================================
//
// 焦点 (2026-05-22 のリグレッション再発防止):
//  - resolvePlanId が requested cycle で正しい env var を選ぶ
//  - PAYPAL_PLAN_MONTHLY 設定時は PAYPAL_PLAN_ID (旧) を読まない
//  - parseBillingCycle がデフォルトで monthly に倒す
//  - parseCustomId が JSON / 旧形式 / 不正値を全て安全に処理
//
// 過去に起きた本物のバグ:
//  (a) PAYPAL_PLAN_ID に年額プラン ID が入っていて、月額選択でも annual が返っていた
//  (b) frontend の stale closure で billingCycle が常に 'annual' で送信されていた
//      (こちらは paywall 側で対処済み、ここでは API の堅牢性を検証)

// 環境変数を必須項目だけ偽装 (createClient が呼ばれてもクラッシュしないように)
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

// supabase-js は require 時点でクライアントを作るのでモック化
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: { getUser: jest.fn() },
    from: jest.fn(),
    rpc: jest.fn(),
  })),
}));

jest.mock('../../api/_paypal-utils', () => ({
  paypalFetch: jest.fn(),
}));
jest.mock('../../api/_email-utils', () => ({
  hashEmail: jest.fn(() => 'h'),
}));
jest.mock('../../api/_sentry', () => ({
  captureServerException: jest.fn(),
  flushSentry: jest.fn(() => Promise.resolve()),
}));

// resolvePlanId 等は module 読込後に export される
const handler = require('../../api/paypal/create-subscription');
const { resolvePlanId, parseBillingCycle, parseCustomId } = handler as {
  resolvePlanId: (cycle: 'monthly' | 'annual') => string | undefined;
  parseBillingCycle: (v: unknown) => 'monthly' | 'annual';
  parseCustomId: (s: unknown) => { uid?: string; cycle?: string };
};

// ============================================================
describe('resolvePlanId - billingCycle → Plan ID 解決', () => {
  const ORIG = {
    PAYPAL_PLAN_ID: process.env.PAYPAL_PLAN_ID,
    PAYPAL_PLAN_MONTHLY: process.env.PAYPAL_PLAN_MONTHLY,
    PAYPAL_PLAN_ANNUAL: process.env.PAYPAL_PLAN_ANNUAL,
  };

  afterEach(() => {
    process.env.PAYPAL_PLAN_ID = ORIG.PAYPAL_PLAN_ID;
    process.env.PAYPAL_PLAN_MONTHLY = ORIG.PAYPAL_PLAN_MONTHLY;
    process.env.PAYPAL_PLAN_ANNUAL = ORIG.PAYPAL_PLAN_ANNUAL;
  });

  test('annual 指定で PAYPAL_PLAN_ANNUAL が返る', () => {
    process.env.PAYPAL_PLAN_ANNUAL = 'P-ANNUAL-XYZ';
    process.env.PAYPAL_PLAN_MONTHLY = 'P-MONTHLY-ABC';
    expect(resolvePlanId('annual')).toBe('P-ANNUAL-XYZ');
  });

  test('monthly 指定で PAYPAL_PLAN_MONTHLY が返る', () => {
    process.env.PAYPAL_PLAN_ANNUAL = 'P-ANNUAL-XYZ';
    process.env.PAYPAL_PLAN_MONTHLY = 'P-MONTHLY-ABC';
    expect(resolvePlanId('monthly')).toBe('P-MONTHLY-ABC');
  });

  // ────────────────────────────────────────────────────────
  // 2026-05-22 の本物のバグの再発防止:
  //   PAYPAL_PLAN_ID に誤って年額 ID が入っていても、
  //   PAYPAL_PLAN_MONTHLY が優先されるべき。
  // ────────────────────────────────────────────────────────
  test('PAYPAL_PLAN_MONTHLY 設定時は PAYPAL_PLAN_ID (旧) を読まない', () => {
    process.env.PAYPAL_PLAN_MONTHLY = 'P-MONTHLY-CORRECT';
    process.env.PAYPAL_PLAN_ID = 'P-ANNUAL-WRONG-FALLBACK';
    process.env.PAYPAL_PLAN_ANNUAL = 'P-ANNUAL-XYZ';
    expect(resolvePlanId('monthly')).toBe('P-MONTHLY-CORRECT');
  });

  test('PAYPAL_PLAN_MONTHLY 未設定なら PAYPAL_PLAN_ID にフォールバック', () => {
    delete process.env.PAYPAL_PLAN_MONTHLY;
    process.env.PAYPAL_PLAN_ID = 'P-LEGACY-MONTHLY';
    expect(resolvePlanId('monthly')).toBe('P-LEGACY-MONTHLY');
  });

  test('annual と monthly で異なる Plan ID が返る (両者衝突しない)', () => {
    process.env.PAYPAL_PLAN_ANNUAL = 'P-ANNUAL-1';
    process.env.PAYPAL_PLAN_MONTHLY = 'P-MONTHLY-2';
    expect(resolvePlanId('annual')).not.toBe(resolvePlanId('monthly'));
  });

  test('env が空文字でも例外を投げない (undefined / "" を返す)', () => {
    process.env.PAYPAL_PLAN_ANNUAL = '';
    process.env.PAYPAL_PLAN_MONTHLY = '';
    delete process.env.PAYPAL_PLAN_ID;
    expect(() => resolvePlanId('annual')).not.toThrow();
    expect(() => resolvePlanId('monthly')).not.toThrow();
  });

  // 2026-05-22: 実際に踏んだバグ。`echo "X" | vercel env add` で trailing \n が入り、
  // PayPal が INVALID_PARAMETER_SYNTAX を返す現象を防ぐ防御コード。
  test('env 値の trailing whitespace / 改行を trim する', () => {
    process.env.PAYPAL_PLAN_ANNUAL = 'P-CLEAN-ANNUAL\n';
    process.env.PAYPAL_PLAN_MONTHLY = '  P-CLEAN-MONTHLY  ';
    expect(resolvePlanId('annual')).toBe('P-CLEAN-ANNUAL');
    expect(resolvePlanId('monthly')).toBe('P-CLEAN-MONTHLY');
  });

  // env の動的反映を保証 (module load 時固定だった旧実装のリグレッション防止)
  test('env を変えた直後に呼んでも反映される (関数呼び出し時に読む)', () => {
    process.env.PAYPAL_PLAN_ANNUAL = 'P-ANNUAL-OLD';
    expect(resolvePlanId('annual')).toBe('P-ANNUAL-OLD');
    process.env.PAYPAL_PLAN_ANNUAL = 'P-ANNUAL-NEW';
    expect(resolvePlanId('annual')).toBe('P-ANNUAL-NEW');
  });
});

// ============================================================
describe('parseBillingCycle - 入力値の正規化', () => {
  test("'annual' は 'annual' のまま", () => {
    expect(parseBillingCycle('annual')).toBe('annual');
  });

  test("'monthly' は 'monthly' のまま", () => {
    expect(parseBillingCycle('monthly')).toBe('monthly');
  });

  test('未指定 (undefined) はデフォルトの monthly', () => {
    expect(parseBillingCycle(undefined)).toBe('monthly');
  });

  test('null も monthly に倒す', () => {
    expect(parseBillingCycle(null)).toBe('monthly');
  });

  test('未知の文字列は安全側 (monthly) に倒す', () => {
    expect(parseBillingCycle('quarterly')).toBe('monthly');
    expect(parseBillingCycle('weekly')).toBe('monthly');
    expect(parseBillingCycle('ANNUAL')).toBe('monthly'); // 大文字小文字厳密
  });

  test('オブジェクト / 数値 / boolean も全て monthly', () => {
    expect(parseBillingCycle({})).toBe('monthly');
    expect(parseBillingCycle(123)).toBe('monthly');
    expect(parseBillingCycle(true)).toBe('monthly');
  });
});

// ============================================================
describe('parseCustomId - PayPal custom_id 復元', () => {
  test('正常な JSON は object として返る', () => {
    const r = parseCustomId(JSON.stringify({ uid: 'u-1', cycle: 'annual' }));
    expect(r.uid).toBe('u-1');
    expect(r.cycle).toBe('annual');
  });

  test('JSON でない文字列は旧形式 (uid のみ) として扱う', () => {
    const r = parseCustomId('legacy-user-uid');
    expect(r.uid).toBe('legacy-user-uid');
    expect(r.cycle).toBeUndefined();
  });

  test('null / undefined / 空文字は {} を返す', () => {
    expect(parseCustomId(null)).toEqual({});
    expect(parseCustomId(undefined)).toEqual({});
    expect(parseCustomId('')).toEqual({});
  });

  test('非文字列 (数値 / object) も {} で安全', () => {
    expect(parseCustomId(123 as unknown)).toEqual({});
    expect(parseCustomId({ foo: 'bar' } as unknown)).toEqual({});
  });

  test('cycle mismatch 検出に使える: parseBillingCycle と組合せ', () => {
    // resume フローのキー: 古い subscription の cycle と新規 request を比較
    const existing = parseCustomId(JSON.stringify({ uid: 'u', cycle: 'annual' }));
    const existingCycle = parseBillingCycle(existing.cycle);
    const requested = parseBillingCycle('monthly');
    expect(existingCycle).not.toBe(requested); // → cleanup へ
  });
});
