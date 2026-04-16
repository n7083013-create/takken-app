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
} from '../services/cloudSync';
import { logError } from '../services/errorLogger';

const STORAGE_KEY = '@takken_progress';

// SM-2 アルゴリズム定数
const INITIAL_EASE_FACTOR = 2.5;
const MIN_EASE_FACTOR = 1.3;

interface QuickQuizStats {
  total: number;
  correct: number;
  categoryStats: Record<Category, { total: number; correct: number }>;
}

interface ProgressState {
  progress: Record<string, QuestionProgress>;
  stats: StudyStats;
  quickQuizStats: QuickQuizStats;

  // Actions
  /** confidence: 'high'=簡単, 'low'=普通(default), 'none'=難しい */
  recordAnswer(questionId: string, category: Category, isCorrect: boolean, confidence?: ConfidenceLevel): void;
  recordQuickQuizAnswer(quizId: string, category: Category, isCorrect: boolean): void;
  toggleBookmark(questionId: string): void;
  getProgress(questionId: string): QuestionProgress | undefined;
  getWeakQuestions(): string[];
  getDueForReview(): string[];
  getBookmarkedQuestions(): string[];
  getCategoryAccuracy(category: Category): number;
  getTodayAnswered(): number;
  getTodayCorrect(): number;
  getDailyLog(): Record<string, number>;
  getStreakFreezeCount(): number;
  /** インターリーブ学習: カテゴリ混合で最適な問題を選出 */
  getInterleavedQuestions(count: number): string[];
  /** 就寝前復習: 最も忘れやすい問題を選出 */
  getPreSleepReview(count: number): string[];
  /** 弱点自動ドリル: 最弱サブカテゴリから問題を選出 */
  getWeakAreaDrill(count: number): string[];
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
    // ベース間隔（標準SM-2）
    let baseInterval: number;
    if (correctStreak === 0) {
      baseInterval = 1;
    } else if (correctStreak === 1) {
      baseInterval = 6;
    } else {
      baseInterval = Math.round(currentInterval * currentEaseFactor);
    }

    if (confidence === 'high') {
      // 簡単 → 間隔を伸ばす、easeFactor大きく上昇
      interval = Math.round(baseInterval * 1.3);
      easeFactor = Math.min(3.0, currentEaseFactor + 0.05);
    } else if (confidence === 'none') {
      // 難しい → 間隔を縮める、easeFactor減少
      interval = Math.max(1, Math.round(baseInterval * 0.5));
      easeFactor = Math.max(MIN_EASE_FACTOR, currentEaseFactor - 0.10);
    } else {
      // 普通（デフォルト） → 標準SM-2
      interval = baseInterval;
      easeFactor = Math.min(3.0, currentEaseFactor + 0.02);
    }
  } else {
    // 不正解: interval リセット、easeFactor 減少
    interval = 1;
    easeFactor = Math.max(MIN_EASE_FACTOR, currentEaseFactor - 0.2);
  }

  return { interval, easeFactor };
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

  const lastDate = new Date(lastStudyAt);
  const today = new Date();
  lastDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

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
  syncError: null,

  clearSyncError() {
    set({ syncError: null });
  },

  recordQuickQuizAnswer(quizId: string, category: Category, isCorrect: boolean) {
    const state = get();
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
    };

    set({ quickQuizStats: updatedQuickQuizStats });
    get().saveProgress();
  },

  recordAnswer(questionId: string, category: Category, isCorrect: boolean, confidence: ConfidenceLevel = 'low') {
    const state = get();
    const existing = state.progress[questionId];
    const now = new Date().toISOString();

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

    // 非同期で保存
    get().saveProgress();
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

    get().saveProgress();
  },

  getProgress(questionId: string): QuestionProgress | undefined {
    return get().progress[questionId];
  },

  getWeakQuestions(): string[] {
    const { progress } = get();
    return Object.values(progress)
      .filter((p) => p.attempts > 0 && p.correctCount / p.attempts < 0.5)
      .map((p) => p.questionId);
  },

  getDueForReview(): string[] {
    const { progress } = get();
    const now = new Date().toISOString();
    return Object.values(progress)
      .filter((p) => p.attempts > 0 && p.nextReviewAt <= now)
      .map((p) => p.questionId);
  },

  getBookmarkedQuestions(): string[] {
    const { progress } = get();
    return Object.values(progress)
      .filter((p) => p.bookmarked)
      .map((p) => p.questionId);
  },

  getCategoryAccuracy(category: Category): number {
    const catStats = get().stats.categoryStats[category];
    if (catStats.total === 0) return 0;
    return catStats.correct / catStats.total;
  },

  getTodayAnswered(): number {
    const { progress } = get();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();
    // 今日の解答のみをカウント（lastAttemptAt が今日の場合）
    // 注: この方法は最終回答日しか見えないため概算
    // 正確には解答ログが必要だが、statsのtotalQuestionsと合わせて使用
    return Object.values(progress).filter((p) => {
      if (!p.lastAttemptAt || p.attempts === 0) return false;
      const attemptDate = new Date(p.lastAttemptAt);
      attemptDate.setHours(0, 0, 0, 0);
      return attemptDate.getTime() >= today.getTime();
    }).length;
  },

  getTodayCorrect(): number {
    const { progress } = get();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Object.values(progress).filter((p) => {
      if (!p.lastAttemptAt || p.attempts === 0) return false;
      const attemptDate = new Date(p.lastAttemptAt);
      attemptDate.setHours(0, 0, 0, 0);
      return attemptDate.getTime() >= today.getTime() && p.correctCount > 0;
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

    for (const { cat, count: needed } of catCounts) {
      const catQuestions = ALL_QUESTIONS.filter((q) => q.category === cat);
      const scored = catQuestions.map((q) => {
        const p = progress[q.id];
        let priority = 0;
        if (!p || p.attempts === 0) { priority = 2; } // 未解答
        else if (p.nextReviewAt <= now) { priority = 4; } // 復習期限切れ
        else if (p.lastConfidence === 'low') { priority = 3; } // 低確信正解
        else if (p.correctCount / p.attempts < 0.5) { priority = 3; } // 苦手
        else { priority = 1; } // 通常
        return { id: q.id, priority, rand: Math.random() };
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
      .filter((p) => p.attempts > 0)
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
  getWeakAreaDrill(count: number): string[] {
    const { progress, stats } = get();

    // 各サブカテゴリの正答率を計算
    type SubcatScore = { cat: Category; key: string; tags: string[]; accuracy: number; total: number };
    const subcatScores: SubcatScore[] = [];

    for (const cat of ['kenri', 'takkengyoho', 'horei_seigen', 'tax_other'] as Category[]) {
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
      const questions = ALL_QUESTIONS.filter(
        (q) => q.category === sc.cat && q.tags.some((t: string) => sc.tags.includes(t)),
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
        // 統計は lastStudyAt が新しい方を採用
        const useRemoteStats =
          remote.stats &&
          (!state.stats.lastStudyAt ||
            (remote.stats.lastStudyAt &&
              new Date(remote.stats.lastStudyAt) > new Date(state.stats.lastStudyAt)));
        set({
          progress: merged,
          stats: useRemoteStats ? remote.stats! : state.stats,
        });
        await get().saveProgress();
      }
      // ローカル → クラウド push
      const cur = get();
      await Promise.all([
        pushProgressToCloud(userId, cur.progress),
        pushStatsToCloud(userId, cur.stats, cur.quickQuizStats),
      ]);
      // push 成功 → エラーをクリア
      set({ syncError: null });
    } catch (e) {
      logError(e, { context: 'progress.syncWithCloud' });
      set({ syncError: 'クラウド同期に失敗しました。次回起動時に再試行します。' });
    }
  },

  async saveProgress() {
    try {
      const { progress, stats, quickQuizStats } = get();
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ progress, stats, quickQuizStats }));
    } catch (e) {
      logError(e, { context: 'progress.save' });
    }
  },
}));
