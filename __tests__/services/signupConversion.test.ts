// ============================================================
// services/signupConversion テスト
// 重点 (広告費の無駄・P-MAX 誤学習に直結するため最重要):
//  - isNewOAuthSignup: OAuth(google/apple) かつ新規(created_at 直近)のみ true
//    → email 登録・既存ユーザー再ログインは false (二重計上 / 誤計上の防止)
//  - trackSignUpConversionOnce: ユーザーごとに「1回だけ」発火 (二重発火しない)
// ============================================================

// React Native の Platform を Web 想定でモック (Web コードパスを通す)
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

// analytics は依存を切ってスパイ化 (signupConversion 単体の挙動を検証)
jest.mock('../../services/analytics', () => ({
  trackEventWithUserData: jest.fn().mockResolvedValue(undefined),
}));

import { trackEventWithUserData } from '../../services/analytics';
import {
  isNewOAuthSignup,
  trackSignUpConversionOnce,
  NEW_SIGNUP_WINDOW_MS,
  type MinimalAuthUser,
} from '../../services/signupConversion';

const NOW = 1_780_000_000_000; // 固定の現在時刻 (テスト決定性のため注入)
const iso = (ms: number) => new Date(ms).toISOString();

const googleUser = (overrides: Partial<MinimalAuthUser> = {}): MinimalAuthUser => ({
  id: 'user-1',
  email: 'newbie@gmail.com',
  created_at: iso(NOW), // 今まさに作成
  app_metadata: { provider: 'google' },
  ...overrides,
});

// ============================================================
// isNewOAuthSignup
// ============================================================
describe('isNewOAuthSignup', () => {
  it('google provider + 作成直後 → true (新規OAuthサインアップ)', () => {
    expect(isNewOAuthSignup(googleUser(), NOW)).toBe(true);
  });

  it('apple provider + 数分前作成 → true', () => {
    const u = googleUser({ app_metadata: { provider: 'apple' }, created_at: iso(NOW - 3 * 60 * 1000) });
    expect(isNewOAuthSignup(u, NOW)).toBe(true);
  });

  it('email provider → false (login.tsx が発火するので二重計上を防ぐ)', () => {
    const u = googleUser({ app_metadata: { provider: 'email' } });
    expect(isNewOAuthSignup(u, NOW)).toBe(false);
  });

  it('provider 不明/欠落 → false', () => {
    expect(isNewOAuthSignup(googleUser({ app_metadata: null }), NOW)).toBe(false);
    expect(isNewOAuthSignup(googleUser({ app_metadata: {} }), NOW)).toBe(false);
  });

  it('既存ユーザーの再ログイン (created_at が窓の外=古い) → false', () => {
    const u = googleUser({ created_at: iso(NOW - (NEW_SIGNUP_WINDOW_MS + 60 * 1000)) });
    expect(isNewOAuthSignup(u, NOW)).toBe(false);
  });

  it('窓の境界: ちょうど窓内/窓外', () => {
    expect(isNewOAuthSignup(googleUser({ created_at: iso(NOW - (NEW_SIGNUP_WINDOW_MS - 1000)) }), NOW)).toBe(true);
    expect(isNewOAuthSignup(googleUser({ created_at: iso(NOW - (NEW_SIGNUP_WINDOW_MS + 1000)) }), NOW)).toBe(false);
  });

  it('時計ズレで created_at が少し未来でも窓内なら true', () => {
    const u = googleUser({ created_at: iso(NOW + 2 * 60 * 1000) }); // 2分未来
    expect(isNewOAuthSignup(u, NOW)).toBe(true);
  });

  it('created_at 欠落 / id 欠落 / null → false', () => {
    expect(isNewOAuthSignup(googleUser({ created_at: undefined }), NOW)).toBe(false);
    expect(isNewOAuthSignup(googleUser({ id: '' }), NOW)).toBe(false);
    expect(isNewOAuthSignup(null, NOW)).toBe(false);
    expect(isNewOAuthSignup(undefined, NOW)).toBe(false);
  });

  it('created_at が不正な文字列 → false (クラッシュしない)', () => {
    expect(isNewOAuthSignup(googleUser({ created_at: 'not-a-date' }), NOW)).toBe(false);
  });
});

// ============================================================
// trackSignUpConversionOnce (二重発火しないことが最重要)
// ============================================================
describe('trackSignUpConversionOnce', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    (trackEventWithUserData as jest.Mock).mockClear();
    store = {};
    (global as any).window = {
      localStorage: {
        getItem: (k: string) => (k in store ? store[k] : null),
        setItem: (k: string, v: string) => { store[k] = v; },
        removeItem: (k: string) => { delete store[k]; },
      },
    };
  });

  afterEach(() => {
    delete (global as any).window;
  });

  it('初回は発火し true を返す + sign_up を email 付きで送る', async () => {
    const ok = await trackSignUpConversionOnce('user-1', 'newbie@gmail.com');
    expect(ok).toBe(true);
    expect(trackEventWithUserData).toHaveBeenCalledTimes(1);
    expect(trackEventWithUserData).toHaveBeenCalledWith('sign_up', 'newbie@gmail.com', { currency: 'JPY' });
  });

  it('同一ユーザーの2回目以降は発火しない (二重計上防止)', async () => {
    await trackSignUpConversionOnce('user-1', 'newbie@gmail.com');
    const second = await trackSignUpConversionOnce('user-1', 'newbie@gmail.com');
    const third = await trackSignUpConversionOnce('user-1', 'newbie@gmail.com');
    expect(second).toBe(false);
    expect(third).toBe(false);
    expect(trackEventWithUserData).toHaveBeenCalledTimes(1); // 終始1回だけ
  });

  it('別ユーザーはそれぞれ1回ずつ発火する', async () => {
    await trackSignUpConversionOnce('user-1', 'a@gmail.com');
    await trackSignUpConversionOnce('user-2', 'b@gmail.com');
    expect(trackEventWithUserData).toHaveBeenCalledTimes(2);
  });

  it('userId が無ければ発火しない', async () => {
    const ok = await trackSignUpConversionOnce(null, 'x@gmail.com');
    expect(ok).toBe(false);
    expect(trackEventWithUserData).not.toHaveBeenCalled();
  });

  it('email が null でも発火する (Enhanced Conversions 無しの通常 sign_up)', async () => {
    const ok = await trackSignUpConversionOnce('user-9', null);
    expect(ok).toBe(true);
    expect(trackEventWithUserData).toHaveBeenCalledWith('sign_up', null, { currency: 'JPY' });
  });
});
