// ============================================================
// 予測スコア・合格確率・試験日予測 (本試験予測点数 統一システム)
// ============================================================
// 中核ロジックは utils/examPrediction.ts の共通エンジン computeExamPrediction に集約。
// このフックは RN/zustand の配線 (progress + 模試履歴 + 試験日 + 掲載問題) を組み立てて
// エンジンに渡し、結果を既存 consumer 互換の形で返す薄いラッパー。
//
// 設計の正本: Vault/.../2026-06-09_本試験予測点数_統一システム設計.md
//   - 模試 (examHistory.byCategory) を予測に統合 (旧実装の最大の欠陥を解消)
//   - 母数を「演習済み + カバレッジ項」に変更 (未演習を 0% で罰さない)
//   - 難易度較正 / 楽観バイアス補正 / 直近性加重を導入
//   - growthPerDay は実測のみ (データ<10問は 0 = 楽観を断定しない)

import { useMemo } from 'react';
import { CATEGORIES, EXAM_ALLOCATION, PASS_LINE, EXAM_TOTAL, daysUntilTakkenExam } from '../constants/exam';
import { ALL_QUESTIONS } from '../data';
import { useProgressStore } from '../store/useProgressStore';
import { useExamStore } from '../store/useExamStore';
import type { Category, Question } from '../types';
import { computeExamPrediction, type PredictionQuestion } from '../utils/examPrediction';

export interface CategoryPrediction {
  category: Category;
  allocation: number;
  accuracy: number;
  predicted: number;
  attempted: number;
  /** 失点 = allocation·(1−正答率)。弱点(失点)ランキング用 [Phase2] */
  pointsLost: number;
  /** カバレッジ = 演習済/掲載 (0-1) */
  coverage: number;
}

export interface ExamPrediction {
  perCategory: CategoryPrediction[];
  totalPredicted: number;
  hasData: boolean;
  /** 合格確率 (0-100) */
  passProbability: number;
  /** 信頼度: low=データ少, medium=中, high=信頼できる */
  confidence: 'low' | 'medium' | 'high';
  /** 試験日までの日数（不明なら null） */
  daysUntilExam: number | null;
  /** 試験日時点の予測点数（現在のペースを継続した場合） */
  predictedAtExam: number | null;
  /** 合格ラインまでの不足点数（合格圏内なら0） */
  pointsToPass: number;
  /** 最も弱い科目（合格への影響が大きい順＝失点最大） */
  weakestCategory: Category | null;
  /** 予測の95%信頼区間: 下限/上限点数 */
  predictionInterval: { lower: number; upper: number };
  /** 1日あたりの実測成長率 (点/日) — 実データから算出 (データ<10問は0) */
  growthPerDay: number;
  /** 直近7日のモメンタム判定 */
  momentum: 'rising' | 'stable' | 'falling' | 'insufficient';
}

/** 掲載問題をエンジンが必要とする最小形に射影 (module 内で1度だけ) */
const PREDICTION_QUESTIONS: PredictionQuestion<Category>[] = ALL_QUESTIONS.map((q: Question) => ({
  id: q.id,
  category: q.category,
  difficulty: q.difficulty,
}));

/**
 * 直近7日のモメンタム判定 (UI のモメンタムバッジ用に維持)。
 * 直近の正答率と過去全体の正答率を比較する。予測本体とは独立。
 */
function calcMomentum(
  progress: Record<string, { attempts: number; correctCount: number; lastAttemptAt?: string | null }>,
): 'rising' | 'stable' | 'falling' | 'insufficient' {
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  let recentCorrect = 0;
  let recentTotal = 0;
  let oldCorrect = 0;
  let oldTotal = 0;
  for (const p of Object.values(progress)) {
    if (p.attempts === 0 || !p.lastAttemptAt) continue;
    const ts = new Date(p.lastAttemptAt).getTime();
    if (ts >= sevenDaysAgo) {
      recentCorrect += p.correctCount;
      recentTotal += p.attempts;
    } else {
      oldCorrect += p.correctCount;
      oldTotal += p.attempts;
    }
  }
  if (recentTotal < 10 || oldTotal < 10) return 'insufficient';
  const delta = recentCorrect / recentTotal - oldCorrect / oldTotal;
  if (delta > 0.05) return 'rising';
  if (delta < -0.05) return 'falling';
  return 'stable';
}

/**
 * 「今受験したら何点取れるか」を模試実測で較正した確率分布で予測する。
 * 中身は共通エンジン computeExamPrediction(progress, examHistory, config)。
 */
export function useExamPrediction(): ExamPrediction {
  const progress = useProgressStore((s) => s.progress);
  const examHistory = useExamStore((s) => s.examHistory);

  return useMemo(() => {
    const result = computeExamPrediction(progress, examHistory, {
      categories: CATEGORIES,
      allocation: EXAM_ALLOCATION,
      passLine: PASS_LINE,
      examTotal: EXAM_TOTAL,
      questions: PREDICTION_QUESTIONS,
      daysUntilExam: daysUntilTakkenExam(),
    });

    return {
      perCategory: result.perCategory.map((c) => ({
        category: c.category,
        allocation: c.allocation,
        accuracy: c.accuracy,
        predicted: c.predicted,
        attempted: c.attempted,
        pointsLost: c.pointsLost,
        coverage: c.coverage,
      })),
      totalPredicted: result.totalPredicted,
      hasData: result.hasData,
      passProbability: result.passProbability,
      confidence: result.confidence,
      daysUntilExam: result.daysUntilExam,
      predictedAtExam: result.predictedAtExam,
      pointsToPass: result.pointsToPass,
      weakestCategory: result.weakestCategory,
      predictionInterval: result.predictionInterval,
      growthPerDay: result.growthPerDay,
      momentum: calcMomentum(progress),
    };
  }, [progress, examHistory]);
}
