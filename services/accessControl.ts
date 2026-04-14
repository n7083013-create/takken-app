// ============================================================
// アクセス制御
// フリーミアム制限のロジックを集約
// ============================================================

import { ALL_QUESTIONS, ALL_QUICK_QUIZZES } from '../data';
import { FREE_LIMITS } from '../types';

const FREE_QUESTION_IDS = new Set(
  ALL_QUESTIONS.slice(0, FREE_LIMITS.questions).map((q) => q.id),
);
const FREE_QUICK_QUIZ_IDS = new Set(
  ALL_QUICK_QUIZZES.slice(0, FREE_LIMITS.quickQuizzes).map((q) => q.id),
);

export function isQuestionFree(questionId: string): boolean {
  return FREE_QUESTION_IDS.has(questionId);
}

export function isQuickQuizFree(quizId: string): boolean {
  return FREE_QUICK_QUIZ_IDS.has(quizId);
}

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
 * @param resourceId 個別リソースID（問題ID等）
 */
export function canAccess(
  isPro: boolean,
  feature: FeatureKey,
  resourceId?: string,
): boolean {
  if (isPro) return true;
  switch (feature) {
    case 'question':
      return resourceId ? isQuestionFree(resourceId) : false;
    case 'quickQuiz':
      return resourceId ? isQuickQuizFree(resourceId) : false;
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
