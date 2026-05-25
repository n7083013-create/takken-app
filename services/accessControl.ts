// ============================================================
// アクセス制御
// フリーミアム制限のロジックを集約（1日N問方式）
// ============================================================

import { FREE_LIMITS } from '../types';

/** 今日の日付キー "YYYY-MM-DD" */
function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 今日の解答数が日次制限を超えているか判定
 * @param todayAnsweredCount 今日の解答数
 * @param type 'question'（4択問題）or 'quickQuiz'（一問一答）
 */
export function isDailyLimitReached(
  todayAnsweredCount: number,
  type: 'question' | 'quickQuiz',
): boolean {
  const limit = type === 'question'
    ? FREE_LIMITS.questionsPerDay
    : FREE_LIMITS.quickQuizzesPerDay;
  return todayAnsweredCount >= limit;
}

/**
 * 今日の残り解答可能数
 */
export function getDailyRemaining(
  todayAnsweredCount: number,
  type: 'question' | 'quickQuiz',
): number {
  const limit = type === 'question'
    ? FREE_LIMITS.questionsPerDay
    : FREE_LIMITS.quickQuizzesPerDay;
  return Math.max(0, limit - todayAnsweredCount);
}

/** 今日のキー（進捗ストアで使う） */
export { getTodayKey };

export type FeatureKey =
  | 'question'
  | 'quickQuiz'
  | 'examMode'
  | 'aiAnalysis'
  | 'cloudSync';

/**
 * 機能アクセス可能かを判定
 * @param isPro 課金ユーザーか
 * @param feature 機能種別
 * @param todayAnsweredCount 今日の解答数（question / quickQuiz の場合に必要）
 */
export function canAccess(
  isPro: boolean,
  feature: FeatureKey,
  todayAnsweredCount?: number,
): boolean {
  if (isPro) return true;
  switch (feature) {
    case 'question':
      return (todayAnsweredCount ?? 0) < FREE_LIMITS.questionsPerDay;
    case 'quickQuiz':
      return (todayAnsweredCount ?? 0) < FREE_LIMITS.quickQuizzesPerDay;
    case 'examMode':
      return FREE_LIMITS.examMode;
    case 'aiAnalysis':
      return FREE_LIMITS.aiAnalysis;
    case 'cloudSync':
      return FREE_LIMITS.cloudSync;
    default:
      return false;
  }
}
