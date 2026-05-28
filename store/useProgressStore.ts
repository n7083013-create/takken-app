// ============================================================
// 宅建士 完全対策 - 学習進捗ストア
// ============================================================

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Category, ConfidenceLevel, QuestionProgress, StudyStats, SUBCATEGORIES } from '../types';
import { ALL_QUESTIONS } from '../data';
import {
  pullFromCloud,
  pushProgressToCloud,
  pushStatsToCloud,
  mergeProgress,
  markDirty,
} from '../services/cloudSync';
import { logError } from '../services/errorLogger';

const STORAGE_KEY = '@takken_progress';

function isJestRuntime(): boolean {
  return typeof process !== 'undefined' && !!process.env.JEST_WORKER_ID;
}

function trackFirstQuestionAnsweredActivation(): void {
  const params = { value: 1, currency: 'JPY' };

  if (isJestRuntime()) {
    try {
      // Jest では対象テストだけが analytics を mock する。
      // mock されていないテストでは RN 依存を読まずに抜ける。
      const analytics = require('../services/analytics') as {
        trackEvent?: (eventName: string, params?: Record<string, unknown>) => void;
      };
      analytics.trackEvent?.('first_question_answered', params);
    } catch {
      // テスト環境で mock が無い場合は、計測副作用を発火しない。
    }
    return;
  }

  import('../services/analytics')
    .then((m) => m.trackEvent('first_question_answered', params))
    .catch(() => {});
}

// ── 解答後のクラウド即時プッシュ（デバウンス 1 秒） ──────────────────
// 解答するたびにクラウドへ Push することで、別デバイスが pull したとき
// 最新データが取得できる。1秒間の操作をまとめて1回の API 呼び出しに集約する。
// 循環依存を避けるため useAuthStore は動的 import (setTimeout 内=実行時) で読む。
let _cloudPushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleCloudPush(): void {
  if (isJestRuntime()) return;
  if (_cloudPushTimer) clearTimeout(_cloudPushTimer);
  _cloudPushTimer = setTimeout(() => {
    _cloudPushTimer = null;
    import('./useAuthStore')
      .then(({ useAuthStore }) => {
        const userId = useAuthStore.getState().user?.id;
        if (!userId) return;
        const cur = useProgressStore.getState();
        // 空ローカルは絶対 push しない (クラウド保護)
        if (!cur.progress || Object.keys(cur.progress).length === 0) return;
        return Promise.allSettled([
          pushProgressToCloud(userId, cur.progress),
          pushStatsToCloud(userId, cur.stats, cur.quickQuizStats),
        ]);
      })
      .catch(() => {});
  }, 1000);
}

// SM-2 アルゴリズム定数
const INITIAL_EASE_FACTOR = 2.5;
const MIN_EASE_FACTOR = 1.3;

/**
 * 「今日の目標」計算における 一問一答 の重み。
 *
 * 設計判断 (2026-05-22):
 *  - 4択問題は思考プロセスが重く 1問 = 1.0 でカウント
 *  - 一問一答は ◯× の単純判定なので 1問 = 0.2 (約 1/5 の負荷感)
 *  - これにより「一問一答を 5 問解く ≒ 4択 1問」となり達成感のスケールが揃う
 *  - 旧仕様では 一問一答が dailyGoal に 1 ミリも反映されず「解いても達成感ない」
 *    というユーザーフィードバックがあった
 */
export const QUICK_QUIZ_WEIGHT = 0.2;

export interface QuickQuizStats {
  total: number;
  correct: number;
  categoryStats: Record<Category, { total: number; correct: number }>;
  /** 今日の解答数（フリーミアム制限用・日付変更でリセット） */
  todayCount?: number;
  /** 今日の日付 YYYY-MM-DD */
  todayDate?: string;
}

interface ProgressState {
  progress: Record<string, QuestionProgress>;
  stats: StudyStats;
  quickQuizStats: QuickQuizStats;
  /** クラウド DB の study_stats.onboarding_done — クロスデバイス再表示防止用 */
  cloudOnboardingDone: boolean;

  // Actions
  /** confidence: 'high'=簡単, 'low'=普通(default), 'none'=難しい */
  recordAnswer(questionId: string, category: Category, isCorrect: boolean, confidence?: ConfidenceLevel): void;
  recordQuickQuizAnswer(quizId: string, category: Category, isCorrect: boolean): void;
  toggleBookmark(questionId: string): void;
  /** ユーザー手動: 「完全に理解した」と自己申告して復習から永久除外 */
  markAsMastered(questionId: string): void;
  /** ユーザー手動: マスター済み解除 (再び復習対象に戻す) */
  unmarkMastered(questionId: string): void;
  /** マスター済み (手動卒業) の questionId 一覧 */
  getManuallyMasteredIds(): string[];
  getProgress(questionId: string): QuestionProgress | undefined;
  getWeakQuestions(): string[];
  getDueForReview(): string[];
  getBookmarkedQuestions(): string[];
  /** [達成率用] 3回連続正解で「習得済」とみなす。間違えるとリセット。 */
  getMasteredCount(threshold?: number): number;
  getCategoryAccuracy(category: Category): number;
  getTodayAnswered(): number;
  getTodayFourChoiceCount(): number;
  getTodayCorrect(): number;
  getTodayQuickQuizCount(): number;
  getDailyLog(): Record<string, number>;
  getStreakFreezeCount(): number;
  /** インターリーブ学習: カテゴリ混合で最適な問題を選出 */
  getInterleavedQuestions(count: number): string[];
  /** 就寝前復習: 最も忘れやすい問題を選出 */
  getPreSleepReview(count: number): string[];
  /** 弱点自動ドリル: 最弱サブカテゴリから問題を選出 */
  getWeakAreaDrill(count: number, filterCategory?: Category): string[];
  resetProgress(): void;
  loadProgress(): Promise<void>;
  saveProgress(): Promise<void>;
  syncWithCloud(userId: string): Promise<void>;
  syncError: string | null;
  clearSyncError(): void;
}

const initialQuickQuizStats: QuickQuizStats = {
  total: 0,
  correct: 0,
  categoryStats: {
    kenri: { total: 0, correct: 0 },
    takkengyoho: { total: 0, correct: 0 },
    horei_seigen: { total: 0, correct: 0 },
    tax_other: { total: 0, correct: 0 },
  },
};

const initialStats: StudyStats = {
  totalQuestions: 0,
  totalCorrect: 0,
  totalStudyTime: 0,
  streak: 0,
  longestStreak: 0,
  lastStudyAt: undefined,
  categoryStats: {
    kenri: { total: 0, correct: 0 },
    takkengyoho: { total: 0, correct: 0 },
    horei_seigen: { total: 0, correct: 0 },
    tax_other: { total: 0, correct: 0 },
  },
};

/**
 * 確信度ベース SM-2 アルゴリズム（世界最先端拡張版）
 *
 * 認知科学の知見:
 * - 正解 + 高確信 → 深い記憶定着 → 長い間隔
 * - 正解 + 低確信 → 浅い記憶（まぐれ）→ 短い間隔で再テスト
 * - 不正解 → 記憶なし → リセット
 *
 * Anki の Easy/Good/Hard/Again に近いが、2段階確信度でUXを簡潔に保つ
 */
/**
 * 確信度ベース SM-2（3段階: 簡単 / 普通 / 難しい）
 *
 * confidence マッピング:
 *   'high' → 簡単: 間隔を1.3倍に伸ばす、easeFactor大きく上昇
 *   'low'  → 普通（デフォルト）: 標準SM-2
 *   'none' → 難しい: 間隔を半分に、easeFactor減少
 */
export function calculateSM2(
  isCorrect: boolean,
  currentInterval: number,
  currentEaseFactor: number,
  correctStreak: number,
  confidence: ConfidenceLevel = 'low',
): { interval: number; easeFactor: number } {
  let interval: number;
  let easeFactor: number;

  if (isCorrect) {
    // [Bugfix 2026-05] 達成済み (3連正解) に到達する瞬間のみ easeFactor を初期値に再起動
    // 旧: 過去に何度も不正解 → easeFactor が 1.3 (最低) → 3連正解しても interval=8日で
    //   すぐ復習対象に戻ってしまい「ちゃんと理解してるのに復習に残る」現象が発生。
    // 新: 「現在から3連正解 = 完全リセット」のユーザー直感に合わせ、3連目で easeFactor=2.5。
    //   到達後 (streak >= 3) の継続正解では本来の easeFactor を尊重し SM-2 を破壊しない。
    const reachingMastered = correctStreak === 2; // streak 2 → 3 の遷移瞬間のみ
    const effectiveEaseFactor = reachingMastered
      ? Math.max(currentEaseFactor, INITIAL_EASE_FACTOR)
      : currentEaseFactor;

    // ベース間隔（標準SM-2）
    let baseInterval: number;
    if (correctStreak === 0) {
      baseInterval = 1;
    } else if (correctStreak === 1) {
      baseInterval = 6;
    } else {
      baseInterval = Math.round(currentInterval * effectiveEaseFactor);
    }

    if (confidence === 'high') {
      // 簡単 → 間隔を伸ばす、easeFactor大きく上昇
      interval = Math.round(baseInterval * 1.3);
      easeFactor = Math.min(3.0, effectiveEaseFactor + 0.05);
    } else if (confidence === 'none') {
      // 難しい → 間隔を縮める、easeFactor減少
      interval = Math.max(1, Math.round(baseInterval * 0.5));
      easeFactor = Math.max(MIN_EASE_FACTOR, effectiveEaseFactor - 0.10);
    } else {
      // 普通（デフォルト） → 標準SM-2
      interval = baseInterval;
      easeFactor = Math.min(3.0, effectiveEaseFactor + 0.02);
    }
  } else {
    // 不正解: interval リセット、easeFactor 減少
    interval = 1;
    easeFactor = Math.max(MIN_EASE_FACTOR, currentEaseFactor - 0.2);
  }

  return { interval, easeFactor };
}

/**
 * 統計マージ: フィールドごとに保守的な最大値マージ
 *
 * 旧実装の Last-Write-Wins (lastStudyAt 比較) では、PC のローカルクロックが
 * 数秒進んでいるだけで「PC が新しい」と判定されてモバイルの dailyLog 更新が
 * 反映されない問題があった。
 *
 * 新戦略:
 *  - 累積カウンタ (totalQuestions/Correct, streak など) → MAX (片方デバイスだけの
 *    回答を失わない)
 *  - dailyLog → 日付ごとに MAX (PC とモバイル両方で別問題を解いた日に
 *    どちらかの記録を失わない)
 *  - categoryStats → カテゴリごとに MAX
 *  - lastStudyAt → 新しい方
 *  - streakFreeze 系 → 「より進んだ状態」優先
 *
 * 注意: 同じ問題を両デバイスで解いた場合は二重カウントになる可能性があるが、
 * 「反映されない」よりは「やや多めにカウントされる」方が UX として良い。
 */
export function mergeDailyLog(
  a: Record<string, number> | undefined,
  b: Record<string, number> | undefined,
): Record<string, number> {
  const merged: Record<string, number> = { ...(a || {}) };
  const other = b || {};
  for (const k of Object.keys(other)) {
    merged[k] = Math.max(merged[k] ?? 0, other[k] ?? 0);
  }
  return merged;
}

export function mergeCategoryStats(
  a: StudyStats['categoryStats'],
  b: StudyStats['categoryStats'],
): StudyStats['categoryStats'] {
  const cats = Object.keys({ ...a, ...b }) as Array<keyof StudyStats['categoryStats']>;
  const out = { ...a } as StudyStats['categoryStats'];
  for (const c of cats) {
    const la = a?.[c] ?? { total: 0, correct: 0 };
    const lb = b?.[c] ?? { total: 0, correct: 0 };
    out[c] = {
      total: Math.max(la.total, lb.total),
      correct: Math.max(la.correct, lb.correct),
    };
  }
  return out;
}

export function mergeStats(local: StudyStats, remote: StudyStats): StudyStats {
  const localTime = local.lastStudyAt ? new Date(local.lastStudyAt).getTime() : 0;
  const remoteTime = remote.lastStudyAt ? new Date(remote.lastStudyAt).getTime() : 0;
  return {
    totalQuestions: Math.max(local.totalQuestions, remote.totalQuestions),
    totalCorrect: Math.max(local.totalCorrect, remote.totalCorrect),
    totalStudyTime: Math.max(local.totalStudyTime, remote.totalStudyTime),
    streak: Math.max(local.streak, remote.streak),
    longestStreak: Math.max(local.longestStreak, remote.longestStreak),
    lastStudyAt: remoteTime > localTime ? remote.lastStudyAt : local.lastStudyAt,
    categoryStats: mergeCategoryStats(local.categoryStats, remote.categoryStats),
    dailyLog: mergeDailyLog(local.dailyLog, remote.dailyLog),
    streakFreezeCount: Math.max(local.streakFreezeCount ?? 0, remote.streakFreezeCount ?? 0),
    streakFreezeUsedAt: remoteTime > localTime ? remote.streakFreezeUsedAt : local.streakFreezeUsedAt,
    streakFreezeRefilledAt: remoteTime > localTime ? remote.streakFreezeRefilledAt : local.streakFreezeRefilledAt,
  };
}

export function mergeQuickQuizStats(
  local: QuickQuizStats,
  remote: QuickQuizStats | null,
): QuickQuizStats {
  if (!remote) return local;
  const todayLocal = local.todayDate;
  const todayRemote = remote.todayDate;
  const today = getDateKey();
  // todayCount は今日のものだけ MAX。日付が違うなら無視。
  let todayCount = 0;
  if (todayLocal === today) todayCount = Math.max(todayCount, local.todayCount ?? 0);
  if (todayRemote === today) todayCount = Math.max(todayCount, remote.todayCount ?? 0);
  return {
    total: Math.max(local.total, remote.total),
    correct: Math.max(local.correct, remote.correct),
    categoryStats: {
      kenri: {
        total: Math.max(local.categoryStats.kenri.total, remote.categoryStats.kenri.total),
        correct: Math.max(local.categoryStats.kenri.correct, remote.categoryStats.kenri.correct),
      },
      takkengyoho: {
        total: Math.max(local.categoryStats.takkengyoho.total, remote.categoryStats.takkengyoho.total),
        correct: Math.max(local.categoryStats.takkengyoho.correct, remote.categoryStats.takkengyoho.correct),
      },
      horei_seigen: {
        total: Math.max(local.categoryStats.horei_seigen.total, remote.categoryStats.horei_seigen.total),
        correct: Math.max(local.categoryStats.horei_seigen.correct, remote.categoryStats.horei_seigen.correct),
      },
      tax_other: {
        total: Math.max(local.categoryStats.tax_other.total, remote.categoryStats.tax_other.total),
        correct: Math.max(local.categoryStats.tax_other.correct, remote.categoryStats.tax_other.correct),
      },
    },
    todayCount,
    todayDate: today,
  };
}

/** 日付キー "YYYY-MM-DD" を取得 */
function getDateKey(date?: Date): string {
  const d = date ?? new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * ストリークフリーズの自動補充チェック（週1回、最大2個）
 */
function refillStreakFreeze(stats: StudyStats): StudyStats {
  const now = new Date();
  const lastRefill = stats.streakFreezeRefilledAt ? new Date(stats.streakFreezeRefilledAt) : null;
  const currentCount = stats.streakFreezeCount ?? 0;

  if (currentCount >= 2) return stats; // 最大2個

  if (!lastRefill || (now.getTime() - lastRefill.getTime()) >= 7 * 24 * 60 * 60 * 1000) {
    return {
      ...stats,
      streakFreezeCount: Math.min(2, currentCount + 1),
      streakFreezeRefilledAt: now.toISOString(),
    };
  }
  return stats;
}

/**
 * 連続学習日数（ストリーク）を計算する
 * ストリークフリーズ対応: 1日空いてもフリーズがあれば維持
 */
function calculateStreak(
  lastStudyAt: string | undefined,
  currentStreak: number,
  stats: StudyStats,
): { streak: number; freezeUsed: boolean; updatedStats: StudyStats } {
  let updatedStats = refillStreakFreeze(stats);

  if (!lastStudyAt) return { streak: 1, freezeUsed: false, updatedStats };

  // Issue #14: DST 切替日や夏時間導入国で setHours(0,0,0,0) 後でも 23h/25h 差になり
  // Math.floor の結果が意図と外れる事故を防ぐため、ローカル日付文字列 (YYYY-MM-DD) で比較する
  const lastDate = new Date(lastStudyAt);
  const today = new Date();
  const lastKey = getDateKey(lastDate);
  const todayKey = getDateKey(today);
  // 同日なら 0、翌日なら 1、それ以上は実日数差
  let diffDays: number;
  if (lastKey === todayKey) {
    diffDays = 0;
  } else {
    // 簡易日数差: 両方を日付の 00:00 で UTC 化して計算（時刻情報を捨てる）
    const [ly, lm, ld] = lastKey.split('-').map(Number);
    const [ty, tm, td] = todayKey.split('-').map(Number);
    const lastUtc = Date.UTC(ly, lm - 1, ld);
    const todayUtc = Date.UTC(ty, tm - 1, td);
    diffDays = Math.round((todayUtc - lastUtc) / (1000 * 60 * 60 * 24));
  }

  if (diffDays === 0) {
    return { streak: currentStreak, freezeUsed: false, updatedStats };
  } else if (diffDays === 1) {
    return { streak: currentStreak + 1, freezeUsed: false, updatedStats };
  } else if (diffDays === 2) {
    // 1日空いた → ストリークフリーズを自動使用
    const freezeCount = updatedStats.streakFreezeCount ?? 0;
    const freezeUsedToday = updatedStats.streakFreezeUsedAt === getDateKey(lastDate);
    if (freezeCount > 0 && !freezeUsedToday) {
      updatedStats = {
        ...updatedStats,
        streakFreezeCount: freezeCount - 1,
        streakFreezeUsedAt: getDateKey(new Date(lastDate.getTime() + 86400000)), // 空いた日
      };
      return { streak: currentStreak + 1, freezeUsed: true, updatedStats };
    }
    return { streak: 1, freezeUsed: false, updatedStats };
  } else {
    return { streak: 1, freezeUsed: false, updatedStats };
  }
}

export const useProgressStore = create<ProgressState>((set, get) => ({
  progress: {},
  stats: { ...initialStats },
  quickQuizStats: { ...initialQuickQuizStats },
  cloudOnboardingDone: false,
  syncError: null,

  clearSyncError() {
    set({ syncError: null });
  },

  recordQuickQuizAnswer(quizId: string, category: Category, isCorrect: boolean) {
    const state = get();
    const today = getDateKey();
    const sameDay = state.quickQuizStats.todayDate === today;
    const updatedQuickQuizStats: QuickQuizStats = {
      total: state.quickQuizStats.total + 1,
      correct: state.quickQuizStats.correct + (isCorrect ? 1 : 0),
      categoryStats: {
        ...state.quickQuizStats.categoryStats,
        [category]: {
          total: state.quickQuizStats.categoryStats[category].total + 1,
          correct: state.quickQuizStats.categoryStats[category].correct + (isCorrect ? 1 : 0),
        },
      },
      todayCount: (sameDay ? (state.quickQuizStats.todayCount ?? 0) : 0) + 1,
      todayDate: today,
    };

    set({ quickQuizStats: updatedQuickQuizStats });
    get().saveProgress();
    // クラウドに即時反映（1秒デバウンス）
    scheduleCloudPush();
  },

  /** 今日の一問一答解答数 */
  getTodayQuickQuizCount(): number {
    const { quickQuizStats } = get();
    const today = getDateKey();
    if (quickQuizStats.todayDate !== today) return 0;
    return quickQuizStats.todayCount ?? 0;
  },

  recordAnswer(questionId: string, category: Category, isCorrect: boolean, confidence: ConfidenceLevel = 'low') {
    const state = get();
    const existing = state.progress[questionId];
    const now = new Date().toISOString();
    // [Phase 1.3] アクティベーション計測: 初めて正解したタイミングで広告コンバージョン発火
    // → 「広告クリック→ユーザー学習着手」までの導線が Google Ads に可視化される
    const isFirstCorrect = isCorrect && state.stats.totalCorrect === 0;

    // 確信度ベース SM-2 計算
    const currentInterval = existing?.interval ?? 0;
    const currentEaseFactor = existing?.easeFactor ?? INITIAL_EASE_FACTOR;
    // [FIX ED1] correctStreak は「連続正答数」を使う（correctCount は累計なので不適切）
    const correctStreak = existing
      ? isCorrect
        ? (existing.correctStreak ?? 0) + 1
        : 0
      : isCorrect
        ? 1
        : 0;

    const { interval, easeFactor } = calculateSM2(
      isCorrect,
      currentInterval,
      currentEaseFactor,
      correctStreak,
      confidence,
    );

    // 次の復習日を計算
    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + interval);

    const updatedProgress: QuestionProgress = {
      questionId,
      attempts: (existing?.attempts ?? 0) + 1,
      correctCount: (existing?.correctCount ?? 0) + (isCorrect ? 1 : 0),
      correctStreak,
      lastAttemptAt: now,
      bookmarked: existing?.bookmarked ?? false,
      nextReviewAt: nextReview.toISOString(),
      easeFactor,
      interval,
      lastConfidence: confidence,
    };

    // ストリーク計算（フリーズ対応）
    const { streak: newStreak, updatedStats: streakStats } = calculateStreak(
      state.stats.lastStudyAt,
      state.stats.streak,
      state.stats,
    );

    // ヒートマップ用の日別ログ更新
    const todayKey = getDateKey();
    const dailyLog = { ...(streakStats.dailyLog ?? {}) };
    dailyLog[todayKey] = (dailyLog[todayKey] ?? 0) + 1;

    // 統計更新
    const updatedStats: StudyStats = {
      ...streakStats,
      totalQuestions: state.stats.totalQuestions + 1,
      totalCorrect: state.stats.totalCorrect + (isCorrect ? 1 : 0),
      streak: newStreak,
      longestStreak: Math.max(state.stats.longestStreak, newStreak),
      lastStudyAt: now,
      dailyLog,
      categoryStats: {
        ...state.stats.categoryStats,
        [category]: {
          total: state.stats.categoryStats[category].total + 1,
          correct: state.stats.categoryStats[category].correct + (isCorrect ? 1 : 0),
        },
      },
    };

    set({
      progress: { ...state.progress, [questionId]: updatedProgress },
      stats: updatedStats,
    });

    // Mark as dirty for delta sync
    markDirty(questionId);

    // 非同期で保存
    get().saveProgress();
    // クラウドに即時反映（1秒デバウンス）
    scheduleCloudPush();

    // [Phase 1.3] アクティベーション (初回正解) を Google Ads / GA4 に通知
    if (isFirstCorrect) {
      trackFirstQuestionAnsweredActivation();
    }

    // ストリーク維持通知 + 日次リマインダー本文を最新化
    // - 答案ごとに最終学習から 20-22h 後に再予約 → ストリーク切れ前夜の警告
    // - 日次リマインダー本文も同時に更新（dueCount, streak, weakCount を反映）
    // 循環依存を避けるため動的 import + fire-and-forget
    if (!isJestRuntime()) {
      import('../services/notifications')
        .then((m) => m.refreshNotificationsAfterAnswer())
        .catch((e) => logError(e, { context: 'progress.refreshNotifications' }));
    }
  },

  toggleBookmark(questionId: string) {
    const state = get();
    const existing = state.progress[questionId];

    if (existing) {
      set({
        progress: {
          ...state.progress,
          [questionId]: { ...existing, bookmarked: !existing.bookmarked },
        },
      });
    } else {
      // まだ解いていない問題でもブックマーク可能
      const newProgress: QuestionProgress = {
        questionId,
        attempts: 0,
        correctCount: 0,
        correctStreak: 0,
        lastAttemptAt: new Date().toISOString(),
        bookmarked: true,
        nextReviewAt: new Date().toISOString(),
        easeFactor: INITIAL_EASE_FACTOR,
        interval: 0,
      };
      set({
        progress: { ...state.progress, [questionId]: newProgress },
      });
    }

    // Mark as dirty for delta sync
    markDirty(questionId);

    get().saveProgress();
  },

  /**
   * ユーザー手動: 「完全に理解した」と自己申告して復習・苦手リストから永久除外
   * - 未解答でも markAsMastered 可能（例: 基礎的すぎる問題をスキップしたい）
   * - 解除は unmarkMastered で
   */
  markAsMastered(questionId: string) {
    const state = get();
    const existing = state.progress[questionId];

    if (existing) {
      set({
        progress: {
          ...state.progress,
          [questionId]: { ...existing, mastered: true },
        },
      });
    } else {
      const newProgress: QuestionProgress = {
        questionId,
        attempts: 0,
        correctCount: 0,
        correctStreak: 0,
        lastAttemptAt: new Date().toISOString(),
        bookmarked: false,
        nextReviewAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1年後 (実質除外)
        easeFactor: INITIAL_EASE_FACTOR,
        interval: 0,
        mastered: true,
      };
      set({
        progress: { ...state.progress, [questionId]: newProgress },
      });
    }

    markDirty(questionId);
    get().saveProgress();
  },

  /** マスター済み解除 (再び復習対象に戻す) */
  unmarkMastered(questionId: string) {
    const state = get();
    const existing = state.progress[questionId];
    if (!existing) return;
    set({
      progress: {
        ...state.progress,
        [questionId]: { ...existing, mastered: false },
      },
    });
    markDirty(questionId);
    get().saveProgress();
  },

  /** マスター済み (手動卒業) の questionId 一覧 */
  getManuallyMasteredIds(): string[] {
    const { progress } = get();
    return Object.values(progress)
      .filter((p) => p.mastered === true)
      .map((p) => p.questionId);
  },

  getProgress(questionId: string): QuestionProgress | undefined {
    return get().progress[questionId];
  },

  getWeakQuestions(): string[] {
    // [Bugfix 2026-05] 累計正答率だけで判定していたため、過去の失敗の重みが大きく
    // 「正解しても苦手リストから消えない」というユーザー報告があった。
    // 修正: 達成済み(3連正解=correctStreak >= 3)になった問題は苦手から卒業。
    // → 「達成率の判定基準」と「苦手判定」が連動して整合する。
    // → 一度間違えれば correctStreak=0 にリセットされ、累計正答率 < 50% なら再度苦手リストに戻る (健全)。
    const { progress } = get();
    return Object.values(progress)
      .filter((p) => {
        if (p.attempts === 0) return false;
        // ユーザー手動マスター済みは除外
        if (p.mastered === true) return false;
        // 達成済み(3連正解)は苦手リストから卒業
        if ((p.correctStreak ?? 0) >= 3) return false;
        // 累計正答率 < 50% で苦手判定
        return p.correctCount / p.attempts < 0.5;
      })
      .map((p) => p.questionId);
  },

  getDueForReview(): string[] {
    const { progress } = get();
    const now = new Date().toISOString();
    return Object.values(progress)
      .filter((p) => {
        if (p.attempts === 0) return false;
        // ユーザー手動マスター済みは復習対象外
        if (p.mastered === true) return false;
        return p.nextReviewAt <= now;
      })
      .map((p) => p.questionId);
  },

  getBookmarkedQuestions(): string[] {
    const { progress } = get();
    return Object.values(progress)
      .filter((p) => p.bookmarked)
      .map((p) => p.questionId);
  },

  /**
   * 「3回連続正解」で習得とみなす問題数を返す。
   * - 間違えると correctStreak が 0 にリセットされるため、未習得に戻る
   * - 真の習得度を反映するため、達成率の分子に使う
   * @param threshold 連続正解数の閾値 (デフォルト 3)
   */
  getMasteredCount(threshold = 3): number {
    const { progress } = get();
    return Object.values(progress).filter(
      (p) => (p.correctStreak ?? 0) >= threshold,
    ).length;
  },

  getCategoryAccuracy(category: Category): number {
    const catStats = get().stats.categoryStats[category];
    // 分母は「掲載問題数」（解いた数ではなく全問数）
    const totalInCategory = ALL_QUESTIONS.filter((q) => q.category === category).length;
    if (totalInCategory === 0) return 0;
    return catStats.correct / totalInCategory;
  },

  getTodayAnswered(): number {
    // Issue #16: lastAttemptAt ベースは「過去問を見直すだけ（recordAnswer 未呼び出し）」
    // でも 0 にならない/タイムゾーン境界バグがあった。dailyLog（recordAnswer 内で +1）を真値とする。
    //
    // [2026-05-22] 一問一答も今日の目標達成に寄与させる:
    //   4択: 1問あたり 1.0
    //   一問一答: 1問あたり QUICK_QUIZ_WEIGHT (0.2)
    //   → 一問一答 5問 ≒ 4択 1問
    //   返り値は float になり得る。表示側で必要なら Math.round() する。
    //
    // ⚠️ フリーミアム 4択 10問/日 の判定にはこれを使わないこと (一問一答が混ざる)。
    //    そちらは getTodayFourChoiceCount() を使う。
    const fourChoiceCount = get().getTodayFourChoiceCount();
    const quickQuizCount = get().getTodayQuickQuizCount();
    return fourChoiceCount + quickQuizCount * QUICK_QUIZ_WEIGHT;
  },

  /**
   * 今日の 4択問題の解答数 (一問一答を含まない raw count)。
   * フリーミアム制限 (10問/日) や Heatmap セル値で使う。
   */
  getTodayFourChoiceCount(): number {
    const stats = get().stats;
    const todayKey = getDateKey(new Date());
    return stats.dailyLog?.[todayKey] ?? 0;
  },

  getTodayCorrect(): number {
    // dailyLog は問題数のみで正解数は持たない → 進捗から推定（lastAttemptAt が今日のもののうち正解）
    // 厳密性は getTodayAnswered ほど重要ではない（UI 表示用途のみ）ため近似でOK
    const { progress } = get();
    const todayKey = getDateKey(new Date());
    return Object.values(progress).filter((p) => {
      if (!p.lastAttemptAt || p.attempts === 0) return false;
      return getDateKey(new Date(p.lastAttemptAt)) === todayKey && p.correctCount > 0;
    }).length;
  },

  getDailyLog(): Record<string, number> {
    return get().stats.dailyLog ?? {};
  },

  getStreakFreezeCount(): number {
    const stats = refillStreakFreeze(get().stats);
    return stats.streakFreezeCount ?? 0;
  },

  /**
   * インターリーブ学習（カテゴリ混合出題）
   * 認知科学: 同一カテゴリのブロック学習より、混合学習の方が長期記憶に40%有効
   * アルゴリズム:
   *  1. 各カテゴリから弱い順に重み付け
   *  2. 復習期限切れ → 低確信正解 → 弱点 → 未解答の優先順
   *  3. 同一カテゴリが連続しないよう並び替え
   */
  getInterleavedQuestions(count: number): string[] {
    const { progress, stats } = get();
    const now = new Date().toISOString();
    const categories: Category[] = ['kenri', 'takkengyoho', 'horei_seigen', 'tax_other'];

    // 各カテゴリの正答率を計算し、弱い順にソート
    const catAccuracy = categories.map((cat) => {
      const cs = stats.categoryStats[cat];
      return { cat, accuracy: cs.total > 0 ? cs.correct / cs.total : 0.5 };
    }).sort((a, b) => a.accuracy - b.accuracy);

    // 弱いカテゴリほど多く出題（重み配分）
    const weights = [4, 3, 2, 1]; // 最弱:4, 次弱:3, ...
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const catCounts = catAccuracy.map((c, i) => ({
      cat: c.cat,
      count: Math.max(1, Math.round((weights[i] / totalWeight) * count)),
    }));

    const result: string[] = [];

    // [2026-05-22] 「全体的にレベルを高く」のフィードバックに対応:
    //   優先度が同点なら難易度の高い問題を選ぶ (difficulty 3 > 2 > 1)
    //   弱点 → 未解答の順は維持しつつ、同列の中では難問を引き寄せる
    for (const { cat, count: needed } of catCounts) {
      // ユーザー手動マスター済みは除外
      const catQuestions = ALL_QUESTIONS.filter((q) => q.category === cat && progress[q.id]?.mastered !== true);
      const scored = catQuestions.map((q) => {
        const p = progress[q.id];
        let priority = 0;
        if (!p || p.attempts === 0) { priority = 2; } // 未解答
        else if (p.nextReviewAt <= now) { priority = 4; } // 復習期限切れ
        else if (p.lastConfidence === 'low') { priority = 3; } // 低確信正解
        else if (p.correctCount / p.attempts < 0.5 && (p.correctStreak ?? 0) < 3) { priority = 3; } // 苦手（達成済み3連正解は除外）
        else { priority = 1; } // 通常
        // 難易度ボーナス: priority 同点で d3 > d2 > d1 になる程度の小さな上乗せ
        const difficultyBoost = (q.difficulty ?? 2) * 0.1; // 0.1 / 0.2 / 0.3
        return { id: q.id, priority: priority + difficultyBoost, rand: Math.random() };
      }).sort((a, b) => b.priority - a.priority || a.rand - b.rand);

      result.push(...scored.slice(0, needed).map((s) => s.id));
    }

    // 同一カテゴリが連続しないようシャッフル（interleave）
    const questionCatMap = new Map(ALL_QUESTIONS.map((q) => [q.id, q.category]));
    const interleaved: string[] = [];
    const pools = new Map<Category, string[]>();
    for (const id of result) {
      const cat = questionCatMap.get(id) ?? 'kenri';
      if (!pools.has(cat)) pools.set(cat, []);
      pools.get(cat)!.push(id);
    }
    let lastCat: Category | null = null;
    while (interleaved.length < result.length) {
      const available = [...pools.entries()]
        .filter(([cat, ids]) => ids.length > 0 && cat !== lastCat)
        .sort((a, b) => b[1].length - a[1].length);
      if (available.length === 0) {
        // 残りは同一カテゴリしかない
        for (const [, ids] of pools) interleaved.push(...ids.splice(0));
        break;
      }
      const [cat, ids] = available[0];
      interleaved.push(ids.shift()!);
      lastCat = cat;
    }

    return interleaved.slice(0, count);
  },

  /**
   * 就寝前復習（Pre-Sleep Review）
   * 認知科学: 就寝前の復習は睡眠中の記憶固定（consolidation）を最大化
   * アルゴリズム: 「もうすぐ忘れそう」な問題を忘却曲線で選出
   *  - 復習期限が近い or やや過ぎた問題を優先
   *  - 低確信正解を優先（浅い記憶を深化）
   */
  getPreSleepReview(count: number): string[] {
    const { progress } = get();
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    const candidates = Object.values(progress)
      .filter((p) => p.attempts > 0 && p.mastered !== true)
      .map((p) => {
        const reviewTime = new Date(p.nextReviewAt).getTime();
        const timeUntilDue = reviewTime - now;
        // スコア: 期限に近いほど高い（-1日〜+2日の範囲が最適）
        let urgency = 0;
        if (timeUntilDue < -2 * oneDay) urgency = 3; // 大幅超過
        else if (timeUntilDue < 0) urgency = 5; // やや超過（最重要）
        else if (timeUntilDue < oneDay) urgency = 4; // 明日期限
        else if (timeUntilDue < 3 * oneDay) urgency = 2; // 3日以内
        else urgency = 1;

        // 低確信ボーナス
        if (p.lastConfidence === 'low') urgency += 2;
        // 低正答率ボーナス
        if (p.correctCount / p.attempts < 0.6) urgency += 1;

        return { id: p.questionId, urgency, rand: Math.random() };
      })
      .sort((a, b) => b.urgency - a.urgency || a.rand - b.rand);

    return candidates.slice(0, count).map((c) => c.id);
  },

  /**
   * 弱点自動ドリル
   * 最も正答率が低いサブカテゴリから集中出題
   */
  getWeakAreaDrill(count: number, filterCategory?: Category): string[] {
    const { progress, stats } = get();

    // 各サブカテゴリの正答率を計算
    type SubcatScore = { cat: Category; key: string; tags: string[]; accuracy: number; total: number };
    const subcatScores: SubcatScore[] = [];

    const categories = filterCategory
      ? [filterCategory]
      : (['kenri', 'takkengyoho', 'horei_seigen', 'tax_other'] as Category[]);

    for (const cat of categories) {
      const subcats = SUBCATEGORIES[cat];
      for (const sc of subcats) {
        const questions = ALL_QUESTIONS.filter(
          (q) => q.category === cat && q.tags.some((t: string) => sc.matchTags.includes(t)),
        );
        if (questions.length === 0) continue;

        let correct = 0;
        let attempted = 0;
        for (const q of questions) {
          const p = progress[q.id];
          if (p && p.attempts > 0) {
            attempted++;
            correct += p.correctCount / p.attempts;
          }
        }
        const accuracy = attempted > 0 ? correct / attempted : 0;
        subcatScores.push({ cat, key: sc.key, tags: sc.matchTags, accuracy, total: questions.length });
      }
    }

    // 最弱サブカテゴリから問題を選出
    subcatScores.sort((a, b) => a.accuracy - b.accuracy);

    const result: string[] = [];
    for (const sc of subcatScores) {
      if (result.length >= count) break;
      // ユーザー手動マスター済みは除外
      const questions = ALL_QUESTIONS.filter(
        (q) => q.category === sc.cat
          && q.tags.some((t: string) => sc.tags.includes(t))
          && progress[q.id]?.mastered !== true,
      );
      // 未正解・低正答率の問題を優先
      const scored = questions.map((q) => {
        const p = progress[q.id];
        const acc = p && p.attempts > 0 ? p.correctCount / p.attempts : 0;
        return { id: q.id, score: acc, rand: Math.random() };
      }).sort((a, b) => a.score - b.score || a.rand - b.rand);

      const needed = Math.min(count - result.length, Math.ceil(count / 3));
      result.push(...scored.slice(0, needed).map((s) => s.id));
    }

    return result.slice(0, count);
  },

  resetProgress() {
    set({
      progress: {},
      stats: { ...initialStats },
      quickQuizStats: { ...initialQuickQuizStats },
    });
    AsyncStorage.removeItem(STORAGE_KEY);
  },

  async loadProgress() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        set({
          progress: data.progress ?? {},
          stats: data.stats ?? { ...initialStats },
          quickQuizStats: data.quickQuizStats ?? { ...initialQuickQuizStats },
          cloudOnboardingDone: data.cloudOnboardingDone ?? false,
        });
      }
    } catch (e) {
      logError(e, { context: 'progress.load' });
    }
  },

  async syncWithCloud(userId: string) {
    try {
      const remote = await pullFromCloud(userId);
      const state = get();
      if (remote) {
        const merged = mergeProgress(state.progress, remote.progress);
        // [Bugfix 2026-05-23] LWW を廃止し、フィールドごとの保守的マージに変更
        // 旧実装は lastStudyAt 比較で「PC が最新」と誤判定 → モバイル更新が失われる事故が
        // 発生していた (クロック差 / PC で何か触っただけで反映停止)
        const mergedStats = remote.stats ? mergeStats(state.stats, remote.stats) : state.stats;
        const remoteQQ = remote.quickQuizStats as QuickQuizStats | null;
        const mergedQQ = mergeQuickQuizStats(state.quickQuizStats, remoteQQ);
        // onboardingDone: once true, stays true (論理 OR)
        const cloudOnboardingDone = remote.onboardingDone || state.cloudOnboardingDone;
        set({
          progress: merged,
          stats: mergedStats,
          quickQuizStats: mergedQQ,
          cloudOnboardingDone,
        });
        await get().saveProgress();
      }
      // [Bugfix CRITICAL] 空ローカルがクラウドを上書きする災害シナリオを防止
      // 旧実装の問題:
      //   1. 再インストール直後はローカルが空
      //   2. クラウドにデータあり → merge は remote 優先で復元する
      //   3. しかしバグで「空ローカル」が稀に push されて、クラウドのデータも消えていた
      //   4. クラウドが Master なので、もう戻せない (Data Wipe Disaster)
      // 新実装: ローカル進捗が完全に空のときは push しない。
      //   - 再インストール直後はまずローカルにデータが揃うのを待つ
      //   - ユーザーが実際に何か解いた瞬間に push される (markDirty + 後続 sync)
      //   - これでクラウドデータが意図せず消えることはない
      if (remote !== null) {
        const cur = get();
        const localIsEmpty = Object.keys(cur.progress || {}).length === 0;
        if (localIsEmpty) {
          // 空ローカルは絶対 push しない (クラウド保護)
          set({ syncError: null });
          return;
        }
        await Promise.all([
          pushProgressToCloud(userId, cur.progress),
          pushStatsToCloud(userId, cur.stats, cur.quickQuizStats),
        ]);
      }
      // sync 成功 → エラーをクリア
      set({ syncError: null });
    } catch (e) {
      logError(e, { context: 'progress.syncWithCloud' });
      set({ syncError: 'クラウド同期に失敗しました。次回起動時に再試行します。' });
    }
  },

  async saveProgress() {
    try {
      const { progress, stats, quickQuizStats, cloudOnboardingDone } = get();
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ progress, stats, quickQuizStats, cloudOnboardingDone }));
    } catch (e) {
      logError(e, { context: 'progress.save' });
    }
  },
}));
