// ============================================================
// 弱点ヒートマップ用データ集計フック
// カテゴリ × サブカテゴリのマトリックスを生成
// ============================================================

import { useMemo } from 'react';
import { useProgressStore } from '../store/useProgressStore';
import { ALL_QUESTIONS } from '../data';
import {
  Category,
  CATEGORY_LABELS,
  CATEGORY_ICONS,
  CATEGORY_COLORS,
  SUBCATEGORIES,
  Subcategory,
} from '../types';

/** ヒートマップセル: 1サブカテゴリの集計値 */
export interface HeatmapCell {
  /** サブカテゴリのキー（types/SUBCATEGORIES と一致） */
  subKey: string;
  /** 表示用ラベル */
  label: string;
  /** アイコン (emoji) */
  icon: string;
  /** マッチタグ（問題リストで使用） */
  matchTags: string[];
  /** このサブカテゴリの総問題数（掲載数） */
  total: number;
  /** 1回以上解答したユニーク問題数 */
  attemptedCount: number;
  /** [新仕様 2026-05] 達成済み問題数 (correctStreak >= 3) */
  masteredCount: number;
  /** [新仕様 2026-05] 達成率 0-1 = masteredCount / total
   *  「1問正解で100%」の誤誘導を防ぐため、母数をサブカテゴリ全問題数にする。
   *  アプリ全体の「達成率(3連正解で習得)」と整合。 */
  masteryRate: number;
  /** 累計正答率 0-1 (attempts > 0 のみ) — 内部判定用に保持 */
  accuracy: number;
  /** 直近7日間の正答率 0-1 (該当データが無い場合は -1) */
  recentAccuracy: number;
  /** SR で復習期限切れな問題数 */
  dueCount: number;
  /** 学習状態: 'unstarted' | 'weak' | 'standard' | 'strong' */
  status: HeatmapStatus;
}

export type HeatmapStatus = 'unstarted' | 'weak' | 'standard' | 'strong';

/** 1カテゴリ分の行データ */
export interface HeatmapRow {
  category: Category;
  label: string;
  icon: string;
  color: string;
  cells: HeatmapCell[];
}

/** 全体集計結果 */
export interface HeatmapData {
  rows: HeatmapRow[];
  /** 弱点（赤）セル数 */
  weakCount: number;
  /** 標準（黄）セル数 */
  standardCount: number;
  /** 得意（緑）セル数 */
  strongCount: number;
  /** 未着手（灰）セル数 */
  unstartedCount: number;
  /** 弱点 top3（最も正答率が低いサブカテゴリ） */
  weakTop3: { category: Category; cell: HeatmapCell }[];
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 状態判定 (達成率ベース)
 *
 * [新仕様 2026-05] ユーザー報告「1問しか解いてないのに100%になる」への対応。
 * 旧: accuracy (解いた問題のうちの正答率) ベース → 1問正解で100%になる誤誘導
 * 新: masteryRate (3連正解問題 / サブカテゴリ全問題) ベース
 *     → 母数が全問題なので過大評価が起きない。アプリ全体の達成率と整合。
 *
 * - 未着手 (0問): 灰
 * - 着手後の判定は「達成率」で:
 *     >= 70% → strong (緑) ← 7割以上の問題を3連正解で習得
 *     >= 30% → standard (黄) ← 一部習得済み
 *     < 30% → weak (赤) ← 大部分が未習得
 */
export function classifyStatus(attempted: number, masteryRate: number): HeatmapStatus {
  if (attempted === 0) return 'unstarted';
  if (masteryRate >= 0.7) return 'strong';
  if (masteryRate >= 0.3) return 'standard';
  return 'weak';
}

/**
 * カテゴリ × サブカテゴリ事前インデックス（ALL_QUESTIONS 走査回数を最小化）
 * モジュール起動時に1回だけ計算 → useMemo の依存変更時は progress のみ走査
 */
type SubIndex = {
  cat: Category;
  sub: Subcategory;
  questionIds: string[];
};

let CACHED_SUB_INDEX: SubIndex[] | null = null;

function buildSubIndex(): SubIndex[] {
  if (CACHED_SUB_INDEX) return CACHED_SUB_INDEX;
  const result: SubIndex[] = [];
  const categories: Category[] = ['kenri', 'takkengyoho', 'horei_seigen', 'tax_other'];
  for (const cat of categories) {
    const subcats = SUBCATEGORIES[cat];
    for (const sub of subcats) {
      const tagSet = new Set(sub.matchTags);
      const questionIds = ALL_QUESTIONS
        .filter((q) => q.category === cat && q.tags.some((t) => tagSet.has(t)))
        .map((q) => q.id);
      result.push({ cat, sub, questionIds });
    }
  }
  CACHED_SUB_INDEX = result;
  return result;
}

/**
 * useHeatmap: 進捗 × サブカテゴリ集計
 * - メモ化: progress 変更時のみ再計算
 */
export function useHeatmap(): HeatmapData {
  const progress = useProgressStore((s) => s.progress);

  return useMemo(() => {
    const subIndex = buildSubIndex();
    const now = Date.now();
    const sevenDaysAgo = now - SEVEN_DAYS_MS;

    const rows: HeatmapRow[] = [];
    const categories: Category[] = ['kenri', 'takkengyoho', 'horei_seigen', 'tax_other'];

    let weakCount = 0;
    let standardCount = 0;
    let strongCount = 0;
    let unstartedCount = 0;

    const allCellsForRanking: { category: Category; cell: HeatmapCell }[] = [];

    for (const category of categories) {
      const cells: HeatmapCell[] = [];
      const subs = subIndex.filter((s) => s.cat === category);

      for (const { sub, questionIds } of subs) {
        const total = questionIds.length;
        if (total === 0) continue;

        let attemptedCount = 0;
        let masteredCount = 0;
        let totalAcc = 0;
        let recentAccSum = 0;
        let recentCount = 0;
        let dueCount = 0;

        for (const qid of questionIds) {
          const p = progress[qid];
          if (!p || p.attempts === 0) continue;
          attemptedCount += 1;
          totalAcc += p.correctCount / p.attempts;

          // [新仕様] 達成済み (3連正解 or 手動マスター) をカウント
          if ((p.correctStreak ?? 0) >= 3 || p.mastered === true) {
            masteredCount += 1;
          }

          // 復習期限切れ判定 (マスター済みは除外)
          if (p.mastered !== true && p.nextReviewAt && new Date(p.nextReviewAt).getTime() <= now) {
            dueCount += 1;
          }

          // 直近7日: lastAttemptAt が 7日以内であれば集計対象
          if (p.lastAttemptAt) {
            const lastTs = new Date(p.lastAttemptAt).getTime();
            if (lastTs >= sevenDaysAgo) {
              recentAccSum += p.correctCount / p.attempts;
              recentCount += 1;
            }
          }
        }

        const accuracy = attemptedCount > 0 ? totalAcc / attemptedCount : 0;
        const masteryRate = total > 0 ? masteredCount / total : 0;
        const recentAccuracy = recentCount > 0 ? recentAccSum / recentCount : -1;
        const status = classifyStatus(attemptedCount, masteryRate);

        const cell: HeatmapCell = {
          subKey: sub.key,
          label: sub.label,
          icon: sub.icon,
          matchTags: sub.matchTags,
          total,
          attemptedCount,
          masteredCount,
          masteryRate,
          accuracy,
          recentAccuracy,
          dueCount,
          status,
        };

        if (status === 'weak') weakCount += 1;
        else if (status === 'standard') standardCount += 1;
        else if (status === 'strong') strongCount += 1;
        else unstartedCount += 1;

        cells.push(cell);
        allCellsForRanking.push({ category, cell });
      }

      rows.push({
        category,
        label: CATEGORY_LABELS[category],
        icon: CATEGORY_ICONS[category],
        color: CATEGORY_COLORS[category],
        cells,
      });
    }

    // 弱点 top3: 解答済み かつ 達成率が低い順 (達成率を主指標に統一)
    const weakTop3 = allCellsForRanking
      .filter((x) => x.cell.attemptedCount > 0)
      .sort((a, b) => a.cell.masteryRate - b.cell.masteryRate)
      .slice(0, 3);

    return {
      rows,
      weakCount,
      standardCount,
      strongCount,
      unstartedCount,
      weakTop3,
    };
  }, [progress]);
}
