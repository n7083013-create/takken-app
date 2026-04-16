import { useMemo } from 'react';
import { CATEGORIES, EXAM_ALLOCATION } from '../constants/exam';
import { ALL_QUESTIONS } from '../data';
import { useProgressStore } from '../store/useProgressStore';
import type { Category, Question } from '../types';

export interface CategoryPrediction {
  category: Category;
  allocation: number;
  accuracy: number;
  predicted: number;
  attempted: number;
}

export interface ExamPrediction {
  perCategory: CategoryPrediction[];
  totalPredicted: number;
  hasData: boolean;
}

/**
 * 忘却曲線を考慮した科目別予測得点
 * - 復習期限切れの問題は記憶の減衰を反映（Ebbinghaus decay）
 * - 未解答の問題は正答率0%として計算
 * -> 「今受験したら何点取れるか」のリアルな予測
 */
export function useExamPrediction(): ExamPrediction {
  const progress = useProgressStore((s) => s.progress);
  const totalQuestions = useProgressStore((s) => s.stats.totalQuestions);

  return useMemo(() => {
    const now = Date.now();
    const perCategory: CategoryPrediction[] = CATEGORIES.map((cat) => {
      const catQuestions = ALL_QUESTIONS.filter((q: Question) => q.category === cat);
      const allocation = EXAM_ALLOCATION[cat];
      if (catQuestions.length === 0) return { category: cat, allocation, accuracy: 0, predicted: 0, attempted: 0 };

      let retentionSum = 0;
      let attempted = 0;
      for (const q of catQuestions) {
        const prog = progress[q.id];
        if (!prog || prog.attempts === 0) continue;
        attempted++;
        const rawAccuracy = prog.correctCount / prog.attempts;
        const reviewDue = new Date(prog.nextReviewAt).getTime();
        if (now > reviewDue) {
          // 復習期限切れ -> 忘却曲線で減衰
          const overdueDays = (now - reviewDue) / (1000 * 60 * 60 * 24);
          // stability = SM-2のintervalに比例（長期記憶ほど減衰が緩やか）
          const stability = Math.max(prog.interval, 1);
          // R = e^(-t/S) : 指数関数的忘却
          const retention = Math.exp(-overdueDays / stability);
          retentionSum += rawAccuracy * retention;
        } else {
          // 期限内 -> そのまま
          retentionSum += rawAccuracy;
        }
      }
      const accuracy = retentionSum / catQuestions.length;
      const predicted = Math.round(allocation * accuracy * 10) / 10;
      return { category: cat, allocation, accuracy, predicted, attempted };
    });
    const totalPredicted = perCategory.reduce((sum, c) => sum + c.predicted, 0);
    const hasData = totalQuestions > 0;
    return { perCategory, totalPredicted: Math.round(totalPredicted), hasData };
  }, [progress, totalQuestions]);
}
