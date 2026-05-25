// ============================================================
// 予測スコア・合格確率・試験日予測
// ============================================================
// - 忘却曲線を考慮した科目別予測スコア
// - 合格確率（予測点数から統計的に算出）
// - 試験日予測（現在のペースで勉強を続けた場合の予測点数）
// - 信頼度（解答数に応じてデータ信頼度を評価）

import { useMemo } from 'react';
import { CATEGORIES, EXAM_ALLOCATION, PASS_LINE, EXAM_TOTAL, daysUntilTakkenExam } from '../constants/exam';
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
  /** 最も弱い科目（合格への影響が大きい順） */
  weakestCategory: Category | null;
  /** 予測の95%信頼区間: 下限/上限点数 */
  predictionInterval: { lower: number; upper: number };
  /** 1日あたりの実測成長率 (点/日) — 直近30日の実データから算出 */
  growthPerDay: number;
  /** 直近7日のモメンタム判定 */
  momentum: 'rising' | 'stable' | 'falling' | 'insufficient';
}

/**
 * ロジスティック関数で予測点数 → 合格確率 に変換
 * 合格ライン(35) 付近で滑らかに 0-100% を補間する
 *
 * 使う曲線:  P = 1 / (1 + exp(-k * (score - PASS_LINE)))
 * k=0.35 で、合格ライン±6点で 10%↔90% になる滑らかな曲線
 */
function scoreToProb(score: number): number {
  const k = 0.35;
  const raw = 1 / (1 + Math.exp(-k * (score - PASS_LINE)));
  return Math.round(raw * 100);
}

/**
 * データ信頼度を算出
 * - 50問以上解答: high
 * - 20問以上: medium
 * - それ以下: low
 */
function calcConfidence(totalAttempted: number): 'low' | 'medium' | 'high' {
  if (totalAttempted >= 50) return 'high';
  if (totalAttempted >= 20) return 'medium';
  return 'low';
}

/**
 * 二項分布の標準誤差を計算 (Wilson score interval の簡易版)
 * Variance ≈ p(1-p)/n. 標準誤差 = sqrt(variance)
 */
function binomialStdError(accuracy: number, attempts: number): number {
  if (attempts === 0) return 0.5; // 完全不確実
  return Math.sqrt((accuracy * (1 - accuracy)) / attempts);
}

/**
 * 個人別の実測成長率を算出（点/日）
 * - lastAttemptAt が古い問題と新しい問題の正答率差を計算
 * - データ不足時はデフォルト値を返す
 */
function calcGrowthPerDay(
  progress: Record<string, { attempts: number; correctCount: number; lastAttemptAt?: string | null }>,
  totalAttempted: number,
): number {
  if (totalAttempted < 10) return 0.05; // データ不足時は楽観的デフォルト

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

  if (recentTotal === 0 || oldTotal === 0) return 0.03;

  const recentRate = recentCorrect / recentTotal;
  const oldRate = oldCorrect / oldTotal;

  // 1日あたりの正答率改善 → 50問配点を掛けて点数換算
  // (recentRate - oldRate) は 1週間の改善幅, /7 で 1日あたり, *50 で 50問換算
  const dailyImprovement = ((recentRate - oldRate) / 7) * EXAM_TOTAL;

  // 現実的な範囲にクランプ (1日 -0.05〜+0.15点)
  return Math.max(-0.05, Math.min(0.15, dailyImprovement));
}

/**
 * 直近7日のモメンタム判定
 * 直近の正答率と過去全体の正答率を比較
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

  const recentRate = recentCorrect / recentTotal;
  const oldRate = oldCorrect / oldTotal;
  const delta = recentRate - oldRate;

  if (delta > 0.05) return 'rising';
  if (delta < -0.05) return 'falling';
  return 'stable';
}

/**
 * 忘却曲線を考慮した科目別予測得点
 * - 復習期限切れの問題は記憶の減衰を反映（Ebbinghaus decay）
 * - 未解答の問題は正答率0%として計算
 * - 信頼区間 (95% CI) も算出
 * -> 「今受験したら何点取れるか」を確率分布で予測
 */
export function useExamPrediction(): ExamPrediction {
  const progress = useProgressStore((s) => s.progress);
  const totalQuestions = useProgressStore((s) => s.stats.totalQuestions);

  return useMemo(() => {
    const now = Date.now();
    let totalAttempted = 0;
    let totalVariance = 0; // 信頼区間用: 各カテゴリの分散を集約
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
          const overdueDays = (now - reviewDue) / (1000 * 60 * 60 * 24);
          const stability = Math.max(prog.interval, 1);
          const retention = Math.exp(-overdueDays / stability);
          retentionSum += rawAccuracy * retention;
        } else {
          retentionSum += rawAccuracy;
        }
      }
      totalAttempted += attempted;
      const accuracy = retentionSum / catQuestions.length;
      const predicted = Math.round(allocation * accuracy * 10) / 10;

      // [信頼区間] このカテゴリの予測点数の分散を計算
      // Var(np) = n^2 * Var(p) ≈ allocation^2 * p(1-p)/attempts
      const stdErr = binomialStdError(accuracy, Math.max(attempted, 1));
      const categoryVariance = (allocation * stdErr) ** 2;
      totalVariance += categoryVariance;

      return { category: cat, allocation, accuracy, predicted, attempted };
    });
    const totalPredicted = perCategory.reduce((sum, c) => sum + c.predicted, 0);
    const hasData = totalQuestions > 0;
    const roundedTotal = Math.round(totalPredicted);

    // 合格確率
    const passProbability = hasData ? scoreToProb(totalPredicted) : 0;

    // 信頼度
    const confidence = calcConfidence(totalAttempted);

    // 試験日までの日数（試験翌日から次回にカウントダウン）
    const daysUntilExam = daysUntilTakkenExam();

    // [改善] 個人別実測成長率
    const growthPerDay = hasData ? calcGrowthPerDay(progress, totalAttempted) : 0.05;

    // 試験日時点の予測点数（個人別成長率を反映）
    let predictedAtExam: number | null = null;
    if (daysUntilExam !== null && hasData) {
      const projected = totalPredicted + daysUntilExam * growthPerDay;
      // 現実的な上限: EXAM_TOTAL の 96% (50問中48問満点が現実的上限)
      predictedAtExam = Math.round(Math.min(Math.max(projected, 0), EXAM_TOTAL * 0.96));
    }

    // [改善] 95%信頼区間 (±1.96 × 標準偏差)
    const totalStdDev = Math.sqrt(totalVariance);
    const ciMargin = 1.96 * totalStdDev;
    const predictionInterval = {
      lower: Math.max(0, Math.round(totalPredicted - ciMargin)),
      upper: Math.min(EXAM_TOTAL, Math.round(totalPredicted + ciMargin)),
    };

    // [改善] 直近7日のモメンタム判定
    const momentum = hasData ? calcMomentum(progress) : 'insufficient';

    // 合格までの不足点数
    const pointsToPass = Math.max(0, PASS_LINE - roundedTotal);

    // 最も弱い科目（不足点数/配点の比率で判定）
    let weakestCategory: Category | null = null;
    let maxGap = 0;
    for (const c of perCategory) {
      if (c.attempted === 0) continue;
      const gap = (c.allocation - c.predicted) / c.allocation;
      if (gap > maxGap) {
        maxGap = gap;
        weakestCategory = c.category;
      }
    }

    return {
      perCategory,
      totalPredicted: roundedTotal,
      hasData,
      passProbability,
      confidence,
      daysUntilExam,
      predictedAtExam,
      pointsToPass,
      weakestCategory,
      predictionInterval,
      growthPerDay,
      momentum,
    };
  }, [progress, totalQuestions]);
}
