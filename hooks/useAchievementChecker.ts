// ============================================================
// 実績チェック Hook
// 問題解答・模試結果・クエスト完了時に呼び出し
// ============================================================

import { useCallback } from 'react';
import { useProgressStore } from '../store/useProgressStore';
import { useAchievementStore, type CheckParams } from '../store/useAchievementStore';
import { useQuestStore } from '../store/useQuestStore';
import type { AchievementId } from '../types';

/**
 * 実績チェックを実行するコールバックを返す
 * オプションで模試スコアやカテゴリ制覇を渡せる
 */
export function useAchievementChecker() {
  const stats = useProgressStore((s) => s.stats);
  const quickQuizStats = useProgressStore((s) => s.quickQuizStats);
  const checkAndUnlock = useAchievementStore((s) => s.checkAndUnlock);
  const questGetOverall = useQuestStore((s) => s.getOverallProgress);

  const check = useCallback((extra?: {
    examScore?: number;
    categoryMastered?: CheckParams['categoryMastered'];
  }): AchievementId[] => {
    const questOverall = questGetOverall();
    const accuracy = stats.totalQuestions > 0
      ? stats.totalCorrect / stats.totalQuestions
      : 0;

    const params: CheckParams = {
      streak: stats.streak,
      totalAnswers: stats.totalQuestions,
      accuracy,
      quickQuizTotal: quickQuizStats.total,
      questCompleted: questOverall.completed,
      questTotal: questOverall.total,
      ...extra,
    };

    return checkAndUnlock(params);
  }, [stats, quickQuizStats, checkAndUnlock, questGetOverall]);

  return check;
}
