// ============================================================
// 宅建士 完全対策 - 設定ストア
// ============================================================

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logError } from '../services/errorLogger';
import { API_BASE_URL } from '../constants/config';
import {
  UserSettings,
  Subscription,
  SubscriptionPlan,
  AI_QUERY_LIMITS,
  AI_DAILY_LIMITS,
  PLAN_PRICES,
} from '../types';

function getDayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const STORAGE_KEY = '@takken_settings';

interface SettingsState {
  settings: UserSettings;
  subscription: Subscription;

  // Actions
  updateSettings(partial: Partial<UserSettings>): void;
  setPlan(plan: SubscriptionPlan, expiresAt?: string): void;
  verifySubscription(accessToken: string): Promise<void>;
  /** プレミアム機能アクセス時の厳密チェック（期限切れキャッシュを使わない） */
  ensureProAccess(accessToken: string): Promise<boolean>;
  cancelPlan(): void;
  startTrial(): void;
  isTrialActive(): boolean;
  trialDaysLeft(): number;
  canUseAI(): boolean;
  /**
   * @deprecated 非推奨。サーバー側の AI 使用量カウントを正とするため、
   * `setAIRemainingFromServer(remaining)` を使ってください。
   * 既存呼び出し箇所はサーバー応答後に再同期するための無害なヒント機能として残置。
   */
  incrementAIQuery(): void;
  /** サーバー応答の `remaining` を反映して残回数を上書き */
  setAIRemainingFromServer(remaining: number): void;
  isPro(): boolean;
  isContinuingMember(): boolean; // 2年目以降
  getRenewalPrice(): number;
  getAIDailyRemaining(): number;
  /** 今日の AI 上限 (トライアル / プランに応じて切替) */
  getAIDailyLimit(): number;
  getDaysUntilExam(): number | null;
  resetStore(): void;
  loadSettings(): Promise<void>;
  saveSettings(): Promise<void>;
}

// 試験日は constants/exam.ts の getNextTakkenExamDate() で動的計算
// （ユーザー保存は後方互換のために残すが、計算自体はいつでも呼び出し可能）
import { getNextTakkenExamDate, daysUntilTakkenExam } from '../constants/exam';

const defaultSettings: UserSettings = {
  dailyGoal: 10,
  notificationsEnabled: true,
  notificationTime: '20:00',
  soundEnabled: false,        // 図書館・電車など音を出せない環境が多いためデフォOFF
  vibrationEnabled: true,
  studyReminderDays: [0, 1, 2, 3, 4, 5, 6], // 毎日
  fontSize: 'medium',
  themeMode: 'system',
  examDate: getNextTakkenExamDate().toISOString(),
  animationLevel: 'full',     // 通常演出
};

const defaultSubscription: Subscription = {
  plan: 'free',
  aiQueriesUsed: 0,
  aiQueriesResetAt: getNextResetDate(),
  aiQueriesUsedToday: 0,
  aiQueriesDayKey: getDayKey(),
  renewalCount: 0,
};

/**
 * AI質問回数のリセット日（翌月1日）を取得
 */
function getNextResetDate(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return next.toISOString();
}

/**
 * Issue #13: 時計巻き戻し検知用に観測した最大時刻を更新
 * 既存値より現在時刻が新しければ更新、過去なら維持（=巻き戻されてもベンチマークが下がらない）
 */
function bumpClockMaxSeen(prev?: string): string {
  const now = Date.now();
  const prevMs = prev ? new Date(prev).getTime() : 0;
  const max = Math.max(now, prevMs);
  return new Date(max).toISOString();
}

/**
 * AI質問回数リセットが必要かチェックし、必要ならリセットしたSubscriptionを返す
 */
function checkAndResetQueries(subscription: Subscription): Subscription {
  const now = new Date();
  const resetAt = new Date(subscription.aiQueriesResetAt);

  if (now >= resetAt) {
    return {
      ...subscription,
      aiQueriesUsed: 0,
      aiQueriesResetAt: getNextResetDate(),
    };
  }
  return subscription;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: { ...defaultSettings },
  subscription: { ...defaultSubscription },

  updateSettings(partial: Partial<UserSettings>) {
    set((state) => ({
      settings: { ...state.settings, ...partial },
    }));
    get().saveSettings();
  },

  setPlan(plan: SubscriptionPlan, expiresAt?: string) {
    set((state) => {
      const now = new Date().toISOString();
      return {
        subscription: {
          ...state.subscription,
          plan,
          expiresAt,
          aiQueriesUsed: 0,
          firstSubscribedAt: state.subscription.firstSubscribedAt ?? now,
        },
      };
    });
    get().saveSettings();
  },

  cancelPlan() {
    set((state) => ({
      subscription: {
        ...state.subscription,
        plan: 'free',
        expiresAt: undefined,
        // 連続契約期間がリセット → 再契約時は通常価格
        firstSubscribedAt: undefined,
        renewalCount: 0,
      },
    }));
    get().saveSettings();
  },

  /**
   * ⚠️ クライアント側でのトライアル開始は削除されました
   * トライアルは必ず /api/paypal/create-subscription（サーバー側）で PayPal 経由で開始します
   * この関数は後方互換のため残置（呼び出しても何もしません）
   */
  startTrial() {
    // No-op: プレミアムバイパスを防ぐため、クライアント側で trial を開始できないようにする
    // 本物のトライアルは verifySubscription() でサーバーから降ってくる
    return;
  },

  isTrialActive() {
    // [H-1 修正] 旧実装は trialStartedAt(サーバー検証フローで一度も書かれない)と
    // plan==='free'(トライアル中はサーバーが plan='standard' を返すため矛盾)に依存し
    // 常に false → 「無料トライアル中・残りN日」バナーが一切出ない不具合だった。
    // サーバー verify-subscription が返す trialEndsAt + subscriptionStatus を真値に判定する。
    const sub = get().subscription;
    if (!sub.trialEndsAt) return false;
    const now = Date.now();
    const end = new Date(sub.trialEndsAt).getTime();
    if (!Number.isFinite(end) || end <= now) return false; // トライアル無し or 終了済
    // PayPal はトライアルでも 'active' を返すため 'trialing'/'active' を許容。canceled/none/past_due は除外。
    if (sub.subscriptionStatus !== 'trialing' && sub.subscriptionStatus !== 'active') return false;
    // --- サーバー検証ゲート(isPro と同等の防御。改ざん/未検証/時計巻き戻しを弾く)---
    // ※ isPro() は呼ばない(isPro が本関数を呼ぶため循環を避ける)。
    if (!sub.lastVerifiedAt) return false;
    const maxSeen = sub.clockMaxSeen ? new Date(sub.clockMaxSeen).getTime() : 0;
    if (maxSeen > 0 && now < maxSeen - 60 * 60 * 1000) return false; // 時計巻き戻し疑い
    const sinceVerify = now - new Date(sub.lastVerifiedAt).getTime();
    if (sinceVerify < 0 || sinceVerify > 3 * 24 * 60 * 60 * 1000) return false; // 巻き戻し/検証が古い(3日超)
    return true;
  },

  trialDaysLeft() {
    // [H-1 修正] trialEndsAt(サーバー由来)から残日数を算出。
    const sub = get().subscription;
    if (!sub.trialEndsAt) return 0;
    const remaining = new Date(sub.trialEndsAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
  },

  isPro() {
    const sub = get().subscription;
    // トライアル中はPro扱い（サーバー検証 trialing ステータスが必要）
    if (get().isTrialActive()) return true;
    if (sub.plan === 'free') return false;
    if (sub.expiresAt && new Date(sub.expiresAt) < new Date()) return false;
    // [セキュリティ] サーバー検証が一度も無い場合は Pro 扱いしない
    // AsyncStorage 改ざんで plan='standard' を書き込まれた場合の防御
    if (!sub.lastVerifiedAt) return false;

    // Issue #13: 時計巻き戻し検知
    // これまでに観測した max 時刻より現在時刻が 1 時間以上前 → デバイス時計改ざん疑い
    // → fail closed で free に降格（次回起動時にサーバー検証で復帰可能）
    const now = Date.now();
    const maxSeen = sub.clockMaxSeen ? new Date(sub.clockMaxSeen).getTime() : 0;
    if (maxSeen > 0 && now < maxSeen - 60 * 60 * 1000) {
      return false;
    }

    // [セキュリティ] サーバー検証が古すぎる（3日超）場合はfree扱いに戻す
    // 短くしたのは：常時オンライン前提の SaaS であり、攻撃面を減らすため
    const sinceVerify = now - new Date(sub.lastVerifiedAt).getTime();
    const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
    if (sinceVerify > THREE_DAYS) return false;
    // sinceVerify が負（lastVerifiedAt より now が前）→ 時計巻き戻し
    if (sinceVerify < 0) return false;
    return true;
  },

  isContinuingMember() {
    const sub = get().subscription;
    if (!sub.firstSubscribedAt) return false;
    const days =
      (Date.now() - new Date(sub.firstSubscribedAt).getTime()) /
      (1000 * 60 * 60 * 24);
    return days >= 365 || sub.renewalCount >= 1;
  },

  getRenewalPrice() {
    return PLAN_PRICES.monthly;
  },

  canUseAI(): boolean {
    const { subscription } = get();
    let checked = checkAndResetQueries(subscription);

    // 日次リセット
    const today = getDayKey();
    if (checked.aiQueriesDayKey !== today) {
      checked = { ...checked, aiQueriesDayKey: today, aiQueriesUsedToday: 0 };
    }
    if (checked !== subscription) {
      set({ subscription: checked });
      get().saveSettings();
    }

    // [H-1] AI上限は常にプラン基準(= サーバー api/ai-chat.js と一致)。
    // 旧 isTrial 分岐(10/日)はサーバー(トライアル中も plan='standard'→50/日)と乖離し、
    // クライアント側で早期に「上限到達」を誤表示するため撤去。
    const monthlyLimit = AI_QUERY_LIMITS[checked.plan];
    const dailyLimit = AI_DAILY_LIMITS[checked.plan];
    return (
      checked.aiQueriesUsed < monthlyLimit &&
      checked.aiQueriesUsedToday < dailyLimit
    );
  },

  incrementAIQuery() {
    // [deprecated] 直接呼ばないでください。サーバー応答の remaining が真値。
    // 既存呼び出しの後方互換のため no-op に。
    // ローカル予測値を立てる必要があれば setAIRemainingFromServer を使用。
  },

  setAIRemainingFromServer(remaining: number) {
    set((state) => {
      let checked = checkAndResetQueries(state.subscription);
      const today = getDayKey();
      const limit = AI_DAILY_LIMITS[checked.plan]; // [H-1] プラン基準(サーバー一致)
      const used = Math.max(0, limit - remaining);
      return {
        subscription: {
          ...checked,
          aiQueriesDayKey: today,
          aiQueriesUsedToday: used,
          // 累計値はベストエフォート: 増えた分だけ加算
          aiQueriesUsed:
            checked.aiQueriesDayKey === today
              ? checked.aiQueriesUsed + Math.max(0, used - checked.aiQueriesUsedToday)
              : checked.aiQueriesUsed + used,
        },
      };
    });
    get().saveSettings();
  },

  getAIDailyRemaining() {
    const { subscription } = get();
    const today = getDayKey();
    const usedToday = subscription.aiQueriesDayKey === today ? subscription.aiQueriesUsedToday : 0;
    const limit = AI_DAILY_LIMITS[subscription.plan]; // [H-1] プラン基準(サーバー一致)
    return Math.max(0, limit - usedToday);
  },

  getAIDailyLimit() {
    const { subscription } = get();
    return AI_DAILY_LIMITS[subscription.plan]; // [H-1] プラン基準(サーバー一致)
  },

  async verifySubscription(accessToken: string) {
    try {
      const res = await fetch(`${API_BASE_URL}/verify-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      // サーバーが明示的に「認証NG」「無効」と返した場合はfreeにダウングレード
      // （4xxは正当なサーバー応答として尊重）
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        set({
          subscription: {
            ...get().subscription,
            plan: 'free',
            subscriptionStatus: 'none',
            expiresAt: undefined,
            trialEndsAt: undefined,
            lastVerifiedAt: new Date().toISOString(),
            clockMaxSeen: bumpClockMaxSeen(get().subscription.clockMaxSeen),
          },
        });
        get().saveSettings();
        return;
      }
      // 5xx サーバーエラーは一時的なのでローカル維持（ただし lastVerifiedAt は更新しない）
      if (!res.ok) return;

      const data = await res.json();
      // サーバーの状態でローカルを上書き（改ざん防止）
      set({
        subscription: {
          ...get().subscription,
          plan: data.plan || 'free',
          subscriptionStatus: data.subscriptionStatus || 'none',
          expiresAt: data.subscriptionEndsAt || data.trialEndsAt || undefined,
          trialEndsAt: data.trialEndsAt || undefined,
          lastVerifiedAt: new Date().toISOString(),
          clockMaxSeen: bumpClockMaxSeen(get().subscription.clockMaxSeen),
        },
      });
      get().saveSettings();
    } catch (e) {
      // ネットワークエラー時はローカル状態を維持（オフライン対応）
      logError(e, { context: 'verifySubscription' });
    }
  },

  /**
   * プレミアム機能アクセス時の厳密チェック
   * - 必ずサーバーに問い合わせ、成功した時だけ true を返す
   * - 失敗時（HTTP 4xx / 5xx / ネットワークエラー）は false（ブロック）
   * - プレミアム画面のマウント時に呼ぶ
   */
  async ensureProAccess(accessToken: string): Promise<boolean> {
    if (!accessToken) return false;
    try {
      const res = await fetch(`${API_BASE_URL}/verify-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
      });
      if (!res.ok) {
        // 認証エラーはダウングレード
        if (res.status === 401 || res.status === 403 || res.status === 404) {
          set({
            subscription: {
              ...get().subscription,
              plan: 'free',
              subscriptionStatus: 'none',
              expiresAt: undefined,
              lastVerifiedAt: new Date().toISOString(),
              clockMaxSeen: bumpClockMaxSeen(get().subscription.clockMaxSeen),
            },
          });
          get().saveSettings();
        }
        return false;
      }
      const data = await res.json();
      set({
        subscription: {
          ...get().subscription,
          plan: data.plan || 'free',
          subscriptionStatus: data.subscriptionStatus || 'none',
          expiresAt: data.subscriptionEndsAt || data.trialEndsAt || undefined,
          trialEndsAt: data.trialEndsAt || undefined,
          lastVerifiedAt: new Date().toISOString(),
          clockMaxSeen: bumpClockMaxSeen(get().subscription.clockMaxSeen),
        },
      });
      get().saveSettings();
      return !!data.isPro;
    } catch (e) {
      logError(e, { context: 'ensureProAccess' });
      return false;  // ⚠️ ネットワーク不通でもプレミアムは許可しない
    }
  },

  getDaysUntilExam() {
    // 宅建試験日は固定（10月第3日曜日）→ 共通関数を使用
    return daysUntilTakkenExam();
  },

  resetStore() {
    set({
      settings: { ...defaultSettings },
      subscription: { ...defaultSubscription },
    });
  },

  async loadSettings() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        set({
          settings: { ...defaultSettings, ...data.settings },
          subscription: checkAndResetQueries({
            ...defaultSubscription,
            ...data.subscription,
          }),
        });
      }
    } catch (e) {
      logError(e, { context: 'settings.load' });
    }
  },

  async saveSettings() {
    try {
      const { settings, subscription } = get();
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ settings, subscription }));
    } catch (e) {
      logError(e, { context: 'settings.save' });
    }
  },
}));
