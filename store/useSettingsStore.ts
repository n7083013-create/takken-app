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
  TRIAL_AI_DAILY_LIMIT,
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
  cancelPlan(): void;
  startTrial(): void;
  isTrialActive(): boolean;
  trialDaysLeft(): number;
  canUseAI(): boolean;
  incrementAIQuery(): void;
  isPro(): boolean;
  isContinuingMember(): boolean; // 2年目以降
  getRenewalPrice(): number;
  getAIDailyRemaining(): number;
  getDaysUntilExam(): number | null;
  resetStore(): void;
  loadSettings(): Promise<void>;
  saveSettings(): Promise<void>;
}

/** 宅建試験：毎年10月第3日曜日 */
function getNextExamDate(): string {
  const now = new Date();
  let year = now.getFullYear();
  const calcThirdSunday = (y: number) => {
    const oct1 = new Date(y, 9, 1); // 10月1日
    const firstSunday = (7 - oct1.getDay()) % 7 + 1;
    return new Date(y, 9, firstSunday + 14); // 第3日曜
  };
  let exam = calcThirdSunday(year);
  if (exam < now) exam = calcThirdSunday(year + 1);
  return exam.toISOString();
}

const defaultSettings: UserSettings = {
  dailyGoal: 10,
  notificationsEnabled: true,
  notificationTime: '20:00',
  soundEnabled: true,
  vibrationEnabled: true,
  studyReminderDays: [0, 1, 2, 3, 4, 5, 6], // 毎日
  fontSize: 'medium',
  themeMode: 'system',
  examDate: getNextExamDate(),
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

  startTrial() {
    set((state) => ({
      subscription: {
        ...state.subscription,
        trialStartedAt: new Date().toISOString(),
      },
    }));
    get().saveSettings();
  },

  isTrialActive() {
    const sub = get().subscription;
    if (!sub.trialStartedAt) return false;
    if (sub.plan !== 'free') return false; // 有料会員はトライアル不要
    const elapsed = Date.now() - new Date(sub.trialStartedAt).getTime();
    return elapsed < 7 * 24 * 60 * 60 * 1000; // 7日間
  },

  trialDaysLeft() {
    const sub = get().subscription;
    if (!sub.trialStartedAt) return 0;
    const elapsed = Date.now() - new Date(sub.trialStartedAt).getTime();
    const remaining = 7 * 24 * 60 * 60 * 1000 - elapsed;
    return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
  },

  isPro() {
    const sub = get().subscription;
    // トライアル中はPro扱い
    if (get().isTrialActive()) return true;
    if (sub.plan === 'free') return false;
    if (sub.expiresAt && new Date(sub.expiresAt) < new Date()) return false;
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

    const isTrial = get().isTrialActive();
    const monthlyLimit = isTrial ? 300 : AI_QUERY_LIMITS[checked.plan];
    const dailyLimit = isTrial ? TRIAL_AI_DAILY_LIMIT : AI_DAILY_LIMITS[checked.plan];
    return (
      checked.aiQueriesUsed < monthlyLimit &&
      checked.aiQueriesUsedToday < dailyLimit
    );
  },

  incrementAIQuery() {
    set((state) => {
      let checked = checkAndResetQueries(state.subscription);
      const today = getDayKey();
      if (checked.aiQueriesDayKey !== today) {
        checked = { ...checked, aiQueriesDayKey: today, aiQueriesUsedToday: 0 };
      }
      return {
        subscription: {
          ...checked,
          aiQueriesUsed: checked.aiQueriesUsed + 1,
          aiQueriesUsedToday: checked.aiQueriesUsedToday + 1,
        },
      };
    });
    get().saveSettings();
  },

  getAIDailyRemaining() {
    const { subscription } = get();
    const today = getDayKey();
    const usedToday = subscription.aiQueriesDayKey === today ? subscription.aiQueriesUsedToday : 0;
    const isTrial = get().isTrialActive();
    const limit = isTrial ? TRIAL_AI_DAILY_LIMIT : AI_DAILY_LIMITS[subscription.plan];
    return Math.max(0, limit - usedToday);
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
      if (!res.ok) return;
      const data = await res.json();
      // サーバーの状態でローカルを上書き（改ざん防止）
      set({
        subscription: {
          ...get().subscription,
          plan: data.plan || 'free',
          subscriptionStatus: data.subscriptionStatus || 'none',
          expiresAt: data.subscriptionEndsAt || data.trialEndsAt || undefined,
        },
      });
      get().saveSettings();
    } catch (e) {
      // ネットワークエラー時はローカル状態を維持（オフライン対応）
      logError(e, { context: 'verifySubscription' });
    }
  },

  getDaysUntilExam() {
    const { examDate } = get().settings;
    if (!examDate) return null;
    const diff = new Date(examDate).getTime() - Date.now();
    if (diff < 0) return null;
    return Math.ceil(diff / (24 * 60 * 60 * 1000));
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
