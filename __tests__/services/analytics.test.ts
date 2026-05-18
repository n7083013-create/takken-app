// ============================================================
// services/analytics テスト
// 重点:
//  - hashEmailForEnhancedConversions: Google 正規化 + SHA-256 の正確性
//  - getAdAttribution: localStorage 取得 / expires_at 期限切れ判定
//  - updateConsent: Consent Mode v2 更新
//  - trackEvent: gtag 呼び出し + Google Ads コンバージョン送信
//  - trackEventWithUserData: Enhanced Conversions 付きイベント送信
// ============================================================

// React Native の Platform を Web 想定でモック (テストはWebコードパスを通す)
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

import {
  hashEmailForEnhancedConversions,
  getAdAttribution,
  updateConsent,
  trackEvent,
  trackEventWithUserData,
  isAnalyticsExcluded,
  setAnalyticsExcluded,
  syncAnalyticsExclusionForUser,
} from '../../services/analytics';

// グローバル window / localStorage / gtag をモック
type GtagMock = jest.Mock & { _calls: any[][] };

let mockLocalStorage: Record<string, string>;
let mockGtag: GtagMock;

beforeEach(() => {
  mockLocalStorage = {};
  mockGtag = jest.fn() as any;
  mockGtag._calls = [];

  (global as any).window = {
    gtag: mockGtag,
    localStorage: {
      getItem: jest.fn((key: string) => mockLocalStorage[key] ?? null),
      setItem: jest.fn((key: string, value: string) => {
        mockLocalStorage[key] = value;
      }),
      removeItem: jest.fn((key: string) => {
        delete mockLocalStorage[key];
      }),
    },
    crypto: {
      subtle: (globalThis.crypto as Crypto).subtle,
    },
  };
});

afterEach(() => {
  delete (global as any).window;
});

// ============================================================
// hashEmailForEnhancedConversions (Google 仕様: lowercase + trim → SHA-256)
// ============================================================
describe('hashEmailForEnhancedConversions', () => {
  it('email を SHA-256 hex (64文字) で返す', async () => {
    const hash = await hashEmailForEnhancedConversions('test@example.com');
    expect(hash).not.toBeNull();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('Google 指定の正規化 (lowercase + trim) を適用する', async () => {
    // 同じ email を別の見た目で渡しても同じハッシュになることを検証
    const h1 = await hashEmailForEnhancedConversions('Test@Example.com');
    const h2 = await hashEmailForEnhancedConversions(' test@example.com ');
    const h3 = await hashEmailForEnhancedConversions('test@example.com');
    expect(h1).toBe(h3);
    expect(h2).toBe(h3);
  });

  it('既知のテストベクトル (SHA-256 of "test@example.com")', async () => {
    // 検算用: echo -n "test@example.com" | shasum -a 256 と一致
    const hash = await hashEmailForEnhancedConversions('test@example.com');
    expect(hash).toBe('973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b');
  });

  it('異なる email は異なるハッシュを返す', async () => {
    const a = await hashEmailForEnhancedConversions('alice@example.com');
    const b = await hashEmailForEnhancedConversions('bob@example.com');
    expect(a).not.toBe(b);
  });

  it('window が undefined なら null を返す (Native 環境想定)', async () => {
    const originalWindow = (global as any).window;
    delete (global as any).window;
    const hash = await hashEmailForEnhancedConversions('test@example.com');
    expect(hash).toBeNull();
    (global as any).window = originalWindow;
  });
});

// ============================================================
// getAdAttribution (localStorage から広告アトリビューション取得)
// ============================================================
describe('getAdAttribution', () => {
  it('localStorage に保存された attribution を返す', () => {
    const data = {
      gclid: 'test-gclid-123',
      utm_source: 'google',
      utm_campaign: 'spring2026',
    };
    mockLocalStorage['takken_ad_attribution'] = JSON.stringify({
      data,
      expires_at: Date.now() + 86400000, // 1日後
    });
    const result = getAdAttribution();
    expect(result).toEqual(data);
  });

  it('localStorage に何もなければ null を返す', () => {
    expect(getAdAttribution()).toBeNull();
  });

  it('expires_at が過去なら null を返し、エントリを削除する', () => {
    mockLocalStorage['takken_ad_attribution'] = JSON.stringify({
      data: { gclid: 'expired' },
      expires_at: Date.now() - 1000, // 1秒前
    });
    expect(getAdAttribution()).toBeNull();
    // 自動削除されること
    expect(mockLocalStorage['takken_ad_attribution']).toBeUndefined();
  });

  it('JSON 不正なら null を返す (例外は投げない)', () => {
    mockLocalStorage['takken_ad_attribution'] = 'invalid json';
    expect(getAdAttribution()).toBeNull();
  });

  it('wbraid / gbraid / UTM フィールドも全部取得できる', () => {
    const data = {
      gclid: 'g',
      wbraid: 'w',
      gbraid: 'b',
      utm_source: 'src',
      utm_medium: 'med',
      utm_campaign: 'cmp',
      utm_term: 'trm',
      utm_content: 'cnt',
      captured_at: '2026-05-18T12:00:00Z',
      landing_page: '/lp',
    };
    mockLocalStorage['takken_ad_attribution'] = JSON.stringify({
      data,
      expires_at: Date.now() + 86400000,
    });
    expect(getAdAttribution()).toEqual(data);
  });
});

// ============================================================
// updateConsent (Consent Mode v2)
// ============================================================
describe('updateConsent', () => {
  it('gtag に consent update を送信する', () => {
    updateConsent({
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'denied',
      analytics_storage: 'granted',
    });
    expect(mockGtag).toHaveBeenCalledWith('consent', 'update', {
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'denied',
      analytics_storage: 'granted',
    });
  });

  it('gtag が undefined でも例外を投げない', () => {
    (global as any).window = { localStorage: (global as any).window.localStorage };
    expect(() => updateConsent({ ad_storage: 'granted' })).not.toThrow();
  });

  it('部分的な更新も可能', () => {
    updateConsent({ ad_storage: 'denied' });
    expect(mockGtag).toHaveBeenCalledWith('consent', 'update', {
      ad_storage: 'denied',
    });
  });
});

// ============================================================
// trackEvent (基本 + Google Ads コンバージョン)
// ============================================================
describe('trackEvent', () => {
  it('gtag に event を送信する', () => {
    trackEvent('page_view', { value: 100 });
    expect(mockGtag).toHaveBeenCalledWith('event', 'page_view', { value: 100 });
  });

  it('sign_up イベントは Google Ads コンバージョンも送信する', () => {
    trackEvent('sign_up', { currency: 'JPY' });
    // gtag を2回呼ぶ (event + conversion)
    expect(mockGtag).toHaveBeenCalledTimes(2);
    const conversionCall = mockGtag.mock.calls.find(
      (c) => c[0] === 'event' && c[1] === 'conversion',
    );
    expect(conversionCall).toBeDefined();
    expect(conversionCall![2].send_to).toBe('AW-18116818716/P5JmCL6mraIcEJzu4r5D');
    expect(conversionCall![2].value).toBe(1); // sign_up はデフォルト ¥1
    expect(conversionCall![2].currency).toBe('JPY');
  });

  it('subscribe_complete イベントは ¥980 がデフォルト', () => {
    trackEvent('subscribe_complete', { value: 980, currency: 'JPY' });
    const conversionCall = mockGtag.mock.calls.find(
      (c) => c[0] === 'event' && c[1] === 'conversion',
    );
    expect(conversionCall![2].send_to).toBe('AW-18116818716/WSNpCIvslaIcEJzu4r5D');
    expect(conversionCall![2].value).toBe(980);
  });

  it('login イベントは Google Ads コンバージョンに含まれない', () => {
    trackEvent('login');
    const conversionCalls = mockGtag.mock.calls.filter(
      (c) => c[0] === 'event' && c[1] === 'conversion',
    );
    expect(conversionCalls.length).toBe(0);
  });

  it('gtag が undefined でも例外を投げない', () => {
    (global as any).window = {};
    expect(() => trackEvent('sign_up')).not.toThrow();
  });
});

// ============================================================
// trackEventWithUserData (Enhanced Conversions)
// ============================================================
describe('trackEventWithUserData', () => {
  it('email を SHA-256 ハッシュ化して user_data として gtag に set する', async () => {
    await trackEventWithUserData('sign_up', 'test@example.com', { currency: 'JPY' });
    // user_data 設定の呼び出しを検索
    const userDataCall = mockGtag.mock.calls.find(
      (c) => c[0] === 'set' && c[1] === 'user_data',
    );
    expect(userDataCall).toBeDefined();
    expect(userDataCall![2].sha256_email_address).toMatch(/^[0-9a-f]{64}$/);
    // 同時に event も発火される
    const eventCall = mockGtag.mock.calls.find(
      (c) => c[0] === 'event' && c[1] === 'sign_up',
    );
    expect(eventCall).toBeDefined();
  });

  it('email が null の場合は通常イベントとして発火する', async () => {
    await trackEventWithUserData('sign_up', null, { currency: 'JPY' });
    const userDataCall = mockGtag.mock.calls.find(
      (c) => c[0] === 'set' && c[1] === 'user_data',
    );
    expect(userDataCall).toBeUndefined();
    // 通常 event は発火する
    const eventCall = mockGtag.mock.calls.find(
      (c) => c[0] === 'event' && c[1] === 'sign_up',
    );
    expect(eventCall).toBeDefined();
  });

  it('gtag が undefined でも例外を投げない (event は発火しない)', async () => {
    (global as any).window = {};
    await expect(
      trackEventWithUserData('sign_up', 'test@example.com'),
    ).resolves.toBeUndefined();
  });
});

// ============================================================
// 計測除外 (管理者・テスト用)
// ============================================================
describe('Analytics Exclusion (管理者の自己コンバージョン汚染を防止)', () => {
  describe('isAnalyticsExcluded / setAnalyticsExcluded', () => {
    it('初期状態は false', () => {
      expect(isAnalyticsExcluded()).toBe(false);
    });

    it('setAnalyticsExcluded(true) で true になり、localStorage に保存される', () => {
      setAnalyticsExcluded(true);
      expect(isAnalyticsExcluded()).toBe(true);
      expect(mockLocalStorage['takken_analytics_excluded']).toBe('1');
    });

    it('setAnalyticsExcluded(false) で false に戻り、localStorage から削除される', () => {
      setAnalyticsExcluded(true);
      setAnalyticsExcluded(false);
      expect(isAnalyticsExcluded()).toBe(false);
      expect(mockLocalStorage['takken_analytics_excluded']).toBeUndefined();
    });
  });

  describe('syncAnalyticsExclusionForUser (auth store からの呼び出し想定)', () => {
    const originalEnv = process.env.EXPO_PUBLIC_ADMIN_EMAILS;

    afterEach(() => {
      process.env.EXPO_PUBLIC_ADMIN_EMAILS = originalEnv;
    });

    it('admin email でログイン中なら excluded=true になる', () => {
      process.env.EXPO_PUBLIC_ADMIN_EMAILS = 'admin@example.com,taira@2023kakeru.com';
      syncAnalyticsExclusionForUser('taira@2023kakeru.com');
      expect(isAnalyticsExcluded()).toBe(true);
    });

    it('admin email の大文字小文字 + 前後空白を正規化する', () => {
      process.env.EXPO_PUBLIC_ADMIN_EMAILS = 'Admin@Example.com';
      syncAnalyticsExclusionForUser(' admin@example.com ');
      expect(isAnalyticsExcluded()).toBe(true);
    });

    it('非 admin email では excluded=false になる', () => {
      process.env.EXPO_PUBLIC_ADMIN_EMAILS = 'admin@example.com';
      setAnalyticsExcluded(true); // 前回の状態を残す
      syncAnalyticsExclusionForUser('user@example.com');
      expect(isAnalyticsExcluded()).toBe(false);
    });

    it('email が null (ログアウト) なら excluded=false に解除', () => {
      setAnalyticsExcluded(true);
      syncAnalyticsExclusionForUser(null);
      expect(isAnalyticsExcluded()).toBe(false);
    });

    it('EXPO_PUBLIC_ADMIN_EMAILS 未設定なら常に excluded=false', () => {
      process.env.EXPO_PUBLIC_ADMIN_EMAILS = '';
      syncAnalyticsExclusionForUser('taira@2023kakeru.com');
      expect(isAnalyticsExcluded()).toBe(false);
    });
  });

  describe('trackEvent / trackEventWithUserData が excluded 時に skip', () => {
    it('isAnalyticsExcluded=true なら trackEvent は gtag を呼ばない', () => {
      setAnalyticsExcluded(true);
      trackEvent('sign_up', { currency: 'JPY' });
      expect(mockGtag).not.toHaveBeenCalled();
    });

    it('isAnalyticsExcluded=true なら trackEventWithUserData も gtag を呼ばない', async () => {
      setAnalyticsExcluded(true);
      await trackEventWithUserData('sign_up', 'test@example.com');
      expect(mockGtag).not.toHaveBeenCalled();
    });

    it('isAnalyticsExcluded=false (デフォルト) なら通常通り発火する', () => {
      trackEvent('sign_up');
      expect(mockGtag).toHaveBeenCalled();
    });
  });
});
