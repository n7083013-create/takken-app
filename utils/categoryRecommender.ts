// ============================================================
// 弱点カテゴリ判定 (純粋関数)
// ============================================================
//
// ユーザーが各カテゴリで蓄積した正答率から、最も「苦手」な
// カテゴリを推定する。app/(tabs)/quick-quiz.tsx のスマートスタート
// 機能などで利用される。
//
// 仕様:
// - 各カテゴリで stat.total >= 3 のもののみ評価対象
// - 正答率 (correct / total) が最も低いカテゴリを返す
// - 評価対象がない場合は null を返す
// - 同率の場合は CATEGORIES 配列順で最初に見つかったものを返す
// - データ不足/欠損/異常値に対して安全

import { Category } from '../types';
import { CATEGORIES } from '../constants/exam';

export type CategoryStatsLike = Partial<
  Record<Category, { correct: number; total: number } | undefined>
>;

/**
 * 各カテゴリの累積統計から「最も正答率が低いカテゴリ」を返す。
 * @param categoryStats カテゴリ別の正答数/総回答数
 * @param categories 評価対象のカテゴリ配列 (デフォルトは CATEGORIES)
 * @returns 弱点カテゴリ、または評価できない場合は null
 */
export function findWeakestCategory(
  categoryStats: CategoryStatsLike | null | undefined,
  categories: readonly Category[] = CATEGORIES,
): Category | null {
  if (!categoryStats) return null;
  let weakest: Category | null = null;
  let weakestRate = 1.01;
  for (const cat of categories) {
    const stat = categoryStats[cat];
    if (!stat || stat.total < 3) continue;
    const rate = stat.correct / stat.total;
    if (rate < weakestRate) {
      weakestRate = rate;
      weakest = cat;
    }
  }
  return weakest;
}
