// ============================================================
// useSettingsStore テスト
// 重点: isPro() のセキュリティロジック（時計巻き戻し・古い検証・clockMaxSeen）
//      verifySubscription / ensureProAccess
// ============================================================

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../services/errorLogger', () => ({
  logError: jest.fn(),
}));

jest.mock('../../constants/config', () => ({
  API_BASE_URL: 'https://api.test',
}));

import { useSettingsStore } from '../../store/useSettingsStore';
import { AI_DAILY_LIMITS, AI_QUERY_LIMITS } from '../../types';

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

// 共通: subscription を上書きするヘルパー
function setSub(partial: any) {
  useSettingsStore.setState((s) => ({
    subscription: { ...s.subscription, ...partial },
  }));
}

describe('useSettingsStore', () => {
  beforeEach(() => {
    useSettingsStore.getState().resetStore();
    jest.clearAllMocks();
  });

  // ----------------------------------------------------------
  // isPro() — セキュリティ重要ロジック
  // ----------------------------------------------------------
  describe('isPro()', () => {
    it('plan=free の場合は false', () => {
      expect(useSettingsStore.getState().isPro()).toBe(false);
    });

    it('plan=standard かつ lastVerifiedAt が無いと false（改ざん防御）', () => {
      setSub({ plan: 'standard', lastVerifiedAt: undefined });
      expect(useSettingsStore.getState().isPro()).toBe(false);
    });

    it('plan=standard + 直近検証済みなら true', () => {
      setSub({
        plan: 'standard',
        lastVerifiedAt: new Date().toISOString(),
        clockMaxSeen: new Date().toISOString(),
      });
      expect(useSettingsStore.getState().isPro()).toBe(true);
    });

    it('lastVerifiedAt が 4日前（>3日）なら false', () => {
      const fourDaysAgo = new Date(Date.now() - 4 * ONE_DAY_MS).toISOString();
      setSub({
        plan: 'standard',
        lastVerifiedAt: fourDaysAgo,
        clockMaxSeen: fourDaysAgo,
      });
      expect(useSettingsStore.getState().isPro()).toBe(false);
    });

    it('lastVerifiedAt が未来（時計巻き戻し検知）なら false', () => {
      const future = new Date(Date.now() + ONE_DAY_MS).toISOString();
      setSub({
        plan: 'standard',
        lastVerifiedAt: future,
        clockMaxSeen: new Date().toISOString(),
      });
      expect(useSettingsStore.getState().isPro()).toBe(false);
    });

    it('clockMaxSeen より now が 1時間以上前なら false（巻き戻し）', () => {
      const futureMaxSeen = new Date(Date.now() + 2 * ONE_HOUR_MS).toISOString();
      setSub({
        plan: 'standard',
        lastVerifiedAt: new Date().toISOString(),
        clockMaxSeen: futureMaxSeen,
      });
      expect(useSettingsStore.getState().isPro()).toBe(false);
    });

    it('clockMaxSeen との差が 30分（<1h）なら true（誤差許容）', () => {
      const slightlyAhead = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      setSub({
        plan: 'standard',
        lastVerifiedAt: new Date().toISOString(),
        clockMaxSeen: slightlyAhead,
      });
      expect(useSettingsStore.getState().isPro()).toBe(true);
    });

    it('expiresAt が過去なら false', () => {
      setSub({
        plan: 'standard',
        lastVerifiedAt: new Date().toISOString(),
        clockMaxSeen: new Date().toISOString(),
        expiresAt: new Date(Date.now() - ONE_DAY_MS).toISOString(),
      });
      expect(useSettingsStore.getState().isPro()).toBe(false);
    });

    it('trialing 状態（trial 中）はPro扱い', () => {
      setSub({
        plan: 'free',
        subscriptionStatus: 'trialing',
        trialStartedAt: new Date().toISOString(),
      });
      expect(useSettingsStore.getState().isPro()).toBe(true);
    });

    it('trialStartedAt が 8日前（期限切れ）なら trial 扱いしない', () => {
      setSub({
        plan: 'free',
        subscriptionStatus: 'trialing',
        trialStartedAt: new Date(Date.now() - 8 * ONE_DAY_MS).toISOString(),
      });
      expect(useSettingsStore.getState().isPro()).toBe(false);
    });
  });

  // ----------------------------------------------------------
  // setPlan / cancelPlan
  // ----------------------------------------------------------
  describe('setPlan / cancelPlan', () => {
    it('setPlan で plan が更新される', () => {
      useSettingsStore.getState().setPlan('standard');
      expect(useSettingsStore.getState().subscription.plan).toBe('standard');
    });

    it('setPlan で firstSubscribedAt が初回のみ設定される', () => {
      useSettingsStore.getState().setPlan('standard');
      const first = useSettingsStore.getState().subscription.firstSubscribedAt;
      expect(first).toBeDefined();

      // 2回目はそのまま保持
      useSettingsStore.getState().setPlan('unlimited');
      expect(useSettingsStore.getState().subscription.firstSubscribedAt).toBe(first);
    });

    it('cancelPlan で free に戻り firstSubscribedAt がクリアされる', () => {
      useSettingsStore.getState().setPlan('standard');
      useSettingsStore.getState().cancelPlan();
      const sub = useSettingsStore.getState().subscription;
      expect(sub.plan).toBe('free');
      expect(sub.firstSubscribedAt).toBeUndefined();
      expect(sub.renewalCount).toBe(0);
    });
  });

  // ----------------------------------------------------------
  // startTrial — クライアント側 noop（セキュリティ仕様）
  // ----------------------------------------------------------
  describe('startTrial (security: client cannot self-grant trial)', () => {
    it('startTrial は no-op（クライアント側で trial を始めない）', () => {
      const before = useSettingsStore.getState().subscription;
      useSettingsStore.getState().startTrial();
      const after = useSettingsStore.getState().subscription;
      expect(after).toEqual(before);
      expect(after.trialStartedAt).toBeUndefined();
    });
  });

  // ----------------------------------------------------------
  // verifySubscription
  // ----------------------------------------------------------
  describe('verifySubscription', () => {
    const origFetch = global.fetch;
    afterEach(() => { global.fetch = origFetch; });

    it('401 応答で free にダウングレード', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({}),
      }) as any;
      setSub({ plan: 'standard' });
      await useSettingsStore.getState().verifySubscription('token');
      const sub = useSettingsStore.getState().subscription;
      expect(sub.plan).toBe('free');
      expect(sub.subscriptionStatus).toBe('none');
      expect(sub.lastVerifiedAt).toBeDefined();
    });

    it('200 応答でサーバー値を反映', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          plan: 'standard',
          subscriptionStatus: 'active',
          subscriptionEndsAt: '2030-01-01T00:00:00Z',
        }),
      }) as any;
      await useSettingsStore.getState().verifySubscription('token');
      const sub = useSettingsStore.getState().subscription;
      expect(sub.plan).toBe('standard');
      expect(sub.subscriptionStatus).toBe('active');
      expect(sub.expiresAt).toBe('2030-01-01T00:00:00Z');
      expect(sub.lastVerifiedAt).toBeDefined();
    });

    it('5xx エラーはローカル維持（lastVerifiedAt は更新しない）', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({}),
      }) as any;
      setSub({ plan: 'standard', lastVerifiedAt: '2020-01-01T00:00:00Z' });
      await useSettingsStore.getState().verifySubscription('token');
      const sub = useSettingsStore.getState().subscription;
      expect(sub.plan).toBe('standard');
      expect(sub.lastVerifiedAt).toBe('2020-01-01T00:00:00Z');
    });

    it('ネットワークエラー時はローカル維持', async () => {
      global.fetch = jest.fn().mockRejectedValueOnce(new Error('network')) as any;
      setSub({ plan: 'standard', lastVerifiedAt: '2020-01-01T00:00:00Z' });
      await useSettingsStore.getState().verifySubscription('token');
      const sub = useSettingsStore.getState().subscription;
      expect(sub.plan).toBe('standard');
    });
  });

  // ----------------------------------------------------------
  // ensureProAccess — フェイルクローズド
  // ----------------------------------------------------------
  describe('ensureProAccess', () => {
    const origFetch = global.fetch;
    afterEach(() => { global.fetch = origFetch; });

    it('accessToken 無しなら false', async () => {
      const r = await useSettingsStore.getState().ensureProAccess('');
      expect(r).toBe(false);
    });

    it('ネットワーク不通なら false（fail-closed）', async () => {
      global.fetch = jest.fn().mockRejectedValueOnce(new Error('network')) as any;
      const r = await useSettingsStore.getState().ensureProAccess('token');
      expect(r).toBe(false);
    });

    it('isPro=true 応答で true', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          plan: 'standard',
          subscriptionStatus: 'active',
          isPro: true,
          subscriptionEndsAt: '2030-01-01T00:00:00Z',
        }),
      }) as any;
      const r = await useSettingsStore.getState().ensureProAccess('token');
      expect(r).toBe(true);
    });

    it('401 応答で false かつ free にダウングレード', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({}),
      }) as any;
      setSub({ plan: 'standard' });
      const r = await useSettingsStore.getState().ensureProAccess('token');
      expect(r).toBe(false);
      expect(useSettingsStore.getState().subscription.plan).toBe('free');
    });
  });

  // ----------------------------------------------------------
  // canUseAI / setAIRemainingFromServer
  // ----------------------------------------------------------
  describe('canUseAI / AI remaining', () => {
    it('初期状態（free, used=0）なら true', () => {
      expect(useSettingsStore.getState().canUseAI()).toBe(true);
    });

    it('setAIRemainingFromServer(0) なら canUseAI=false', () => {
      useSettingsStore.getState().setAIRemainingFromServer(0);
      expect(useSettingsStore.getState().canUseAI()).toBe(false);
    });

    it('getAIDailyRemaining が日付変わると初期化', () => {
      useSettingsStore.getState().setAIRemainingFromServer(0);
      // 翌日扱いに偽装
      setSub({ aiQueriesDayKey: '1999-01-01' });
      expect(useSettingsStore.getState().getAIDailyRemaining()).toBeGreaterThan(0);
    });
  });
});

// ============================================================
// 無料プラン AI質問: 1日3回 (毎日リセット) の回帰テスト
// ============================================================
//
// 2026-05-30 決定 (ユーザー判断): takken は当初コメント意図どおり「1日3回」。
//   旧実装は AI_QUERY_LIMITS.free=3 (月) が AI_DAILY_LIMITS.free=3 (日) より先に
//   効き、コピー「1日3回」に反して実質「月3回」だった不具合を解消。
//   → 月次を 93 (=3×31) に引上げ、日次3を常に唯一の拘束に。
//   ※サーバー api/ai-chat.js も FREE_DAILY_LIMIT=3 (真値) と一致させること。
//
// 守りたい性質 (無料枠のみ。Premium日次 100/50 の整合は別途ユーザー判断):
// 1. AI日次上限 free=3
// 2. AI月次上限 free=93 (=3×31 の安全上限)
// 3. 月次は日次×31以上 (31日月でも日次が唯一の拘束になる不変条件)
describe('無料プラン AI質問: 1日3回 (毎日リセット)', () => {
  it('AI日次上限: free=3', () => {
    expect(AI_DAILY_LIMITS.free).toBe(3);
  });

  it('AI月次上限: free=93', () => {
    expect(AI_QUERY_LIMITS.free).toBe(93);
  });

  it('無料の月次上限 ≥ 日次上限×31 (silent monthly cap の再発防止)', () => {
    expect(AI_QUERY_LIMITS.free).toBeGreaterThanOrEqual(AI_DAILY_LIMITS.free * 31);
  });
});
