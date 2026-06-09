// ============================================================
// 予測ハブ 表示ヘルパー (Phase2 UI) — 純粋ロジック
// ============================================================
// computeExamPrediction (Phase1 エンジン) の公開値を「画面に出す文言・数値」へ
// 変換するだけの薄い層。RN/zustand を import しない (jest で直接テスト)。
//
// 設計の正本: Vault/.../2026-06-09_本試験予測点数_統一システム設計.md (designer 断面③④)
//   - 「あと◯問で精度↑」= 次の信頼度ティアに必要な追加演習数を n_eff から逆算
//   - 失点ランキングの粒度を「サブカテゴリ」へ薄く配分 (科目失点 × サブの寄与率)

import {
  CONFIDENCE_LOW_MAX,
  CONFIDENCE_HIGH_MIN,
  PRACTICE_NEFF_WEIGHT,
} from './examPrediction';

/**
 * 次の信頼度ティアまで「あと何問 (演習) 解けば精度が上がるか」。
 *
 * n_eff(練習) ≒ 演習数 × PRACTICE_NEFF_WEIGHT(0.5) なので、
 * 必要 n_eff 増分を「新規に1回ずつ解く問題数」へ割り戻す (w_i=1 を仮定 = 直近で解いた問題)。
 * high 到達済みなら 0 (これ以上はメッセージ不要)。
 */
export function questionsToNextConfidence(
  effectiveSampleSize: number,
  confidence: 'low' | 'medium' | 'high',
): number {
  if (confidence === 'high') return 0;
  const target = confidence === 'low' ? CONFIDENCE_LOW_MAX : CONFIDENCE_HIGH_MIN;
  const neededNeff = Math.max(0, target - effectiveSampleSize);
  // 練習1問 = PRACTICE_NEFF_WEIGHT の n_eff。割り戻して切り上げ。
  return Math.max(1, Math.ceil(neededNeff / PRACTICE_NEFF_WEIGHT));
}

/** 失点ランキングの 1 行 (サブカテゴリ粒度) */
export interface PointsLostRow {
  /** サブカテゴリ表示ラベル */
  label: string;
  /** 推定失点 (点)。科目失点をサブカテゴリの寄与で按分した値 */
  pointsLost: number;
  /** 所属科目ラベル (バッジ等に使用) */
  categoryLabel: string;
}

/** サブカテゴリ集計の最小入力 (heatmap セル等から射影) */
export interface SubcategoryStat {
  label: string;
  categoryLabel: string;
  /** このサブカテゴリで「まだ取りこぼしている度合い」の重み。
   *  通常 = 掲載数 × (1 − 達成率)。0 以下は失点ゼロ扱い。 */
  missWeight: number;
}

/**
 * 科目失点 (allocation·(1−θ)) を、その科目に属するサブカテゴリへ
 * missWeight 比で按分して「サブカテゴリ別の推定失点」を作る薄い変換。
 *
 * 科目内 missWeight 合計が 0 (= 全マスター/未着手) の科目はスキップ。
 * 返り値は失点降順。0.1 点未満の行は誤差として落とす (ノイズ抑制)。
 */
export function distributePointsLostToSubcategories(
  categoryPointsLost: number,
  subStats: SubcategoryStat[],
): PointsLostRow[] {
  const totalMiss = subStats.reduce((sum, s) => sum + Math.max(0, s.missWeight), 0);
  if (totalMiss <= 0 || categoryPointsLost <= 0) return [];
  return subStats
    .map((s) => ({
      label: s.label,
      categoryLabel: s.categoryLabel,
      pointsLost: Math.round((categoryPointsLost * Math.max(0, s.missWeight)) / totalMiss * 10) / 10,
    }))
    .filter((r) => r.pointsLost >= 0.1)
    .sort((a, b) => b.pointsLost - a.pointsLost);
}

/**
 * 「上位 N 件の弱点を克服すると 予測 +◯点 → ◯点」の合計失点を返す。
 * 失点合計 (上限 = 現在予測から満点までの伸びしろ) を表示用に丸める。
 */
export function recoverablePoints(rows: PointsLostRow[], topN: number): number {
  return Math.round(rows.slice(0, topN).reduce((sum, r) => sum + r.pointsLost, 0) * 10) / 10;
}
