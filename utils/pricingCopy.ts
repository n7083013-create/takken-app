// ============================================================
// 価格表示・割引率・月換算の純関数ヘルパー
// ============================================================
//
// 2026-05 年額プラン (¥5,980/年) 追加に伴い文言を中央集権化。
// PLAN_PRICES (types/index.ts) を SSOT としつつ、表示用テキストや
// 「○% OFF」「月換算 ¥○」などの計算をここに集約。
//
// 守る性質:
// 1. 価格表示は ¥記号 + 千の位カンマ
// 2. 月換算は小数点切り捨て (Apple/Spotify と同じ)
// 3. 割引率は四捨五入で「○% OFF」
// 4. 「年額」をデフォルトとして推す UX に必要な文言を提供

import { PLAN_PRICES, type BillingCycle } from '../types';

/** 円表示にフォーマット ("¥5,980" 等) */
export function formatYen(amount: number): string {
  return `¥${amount.toLocaleString('en-US')}`;
}

/** プランの絶対価格 ("¥980" or "¥5,980") */
export function planPriceLabel(cycle: BillingCycle): string {
  return formatYen(PLAN_PRICES[cycle]);
}

/** プラン単位表記 ("¥980/月" or "¥5,980/年") */
export function planPriceWithUnit(cycle: BillingCycle): string {
  const unit = cycle === 'monthly' ? '月' : '年';
  return `${planPriceLabel(cycle)}/${unit}`;
}

/**
 * 月換算価格。年額プランの場合 floor(annual / 12)。
 * 例: annual=¥5,980 → ¥498/月 相当
 *
 * 月額プランはそのまま (¥980)。
 */
export function monthlyEquivalent(cycle: BillingCycle): number {
  if (cycle === 'monthly') return PLAN_PRICES.monthly;
  return Math.floor(PLAN_PRICES.annual / 12);
}

/** 月換算ラベル ("¥980/月" or "¥498/月相当") */
export function monthlyEquivalentLabel(cycle: BillingCycle): string {
  const m = monthlyEquivalent(cycle);
  const suffix = cycle === 'monthly' ? '/月' : '/月相当';
  return `${formatYen(m)}${suffix}`;
}

/**
 * 年額プランの割引率 (月額×12 と比較した割引率)。
 * 例: monthly ¥980 × 12 = ¥11,760, annual ¥5,980
 *     savings = (¥11,760 - ¥5,980) / ¥11,760 ≈ 49%
 *
 * 月額プランは null (割引なし)。
 */
export function annualSavingsPercent(): number {
  const monthlyTotal = PLAN_PRICES.monthly * 12;
  const annual = PLAN_PRICES.annual;
  const ratio = (monthlyTotal - annual) / monthlyTotal;
  return Math.round(ratio * 100);
}

/** 年額プランの savings 表示 ("約 49% OFF") */
export function annualSavingsLabel(): string {
  return `約 ${annualSavingsPercent()}% OFF`;
}

/**
 * 年額プランの ¥ 換算 savings。
 * 例: ¥11,760 - ¥5,980 = ¥5,780
 */
export function annualSavingsYen(): number {
  return PLAN_PRICES.monthly * 12 - PLAN_PRICES.annual;
}

/**
 * 主 CTA 文言 (paywall ページ用)。
 * - monthly: 「7日間無料で始める」
 * - annual:  「7日間無料で始める (年額)」 ※トライアル後の自動課金額を明示するヘルパーで補足
 */
export function ctaLabel(cycle: BillingCycle): string {
  return cycle === 'monthly'
    ? '7日間無料で始める'
    : '7日間無料で始める';
}

/**
 * トライアル後の課金説明 (paywall ページ用)。
 * 月額 / 年額 で文言を切り替え、price anchoring も意識。
 */
export function postTrialDescription(cycle: BillingCycle): string {
  if (cycle === 'monthly') {
    return `8日目から月額 ${planPriceLabel('monthly')} で自動更新`;
  }
  return `8日目から年額 ${planPriceLabel('annual')} で自動更新 (${monthlyEquivalentLabel('annual')})`;
}

/**
 * 年額プランへのバッジ文言 (paywall の年額タブに表示する促進ラベル)。
 * 「人気No.1」「お得」など複数表現を ABテスト的に持ちたい場合は配列化を検討。
 */
export function annualBadgeLabel(): string {
  // [2026-05-22] バッジは1行に収まる短い文言にする (長文だと折り返して「年額」と重なる)。
  // 割引率は ¥498/月相当 サブラベルで既に伝わるため、ここは social proof に振る。
  return '人気No.1';
}

/**
 * 月額プランで使った場合の総額表示 ("¥11,760/年" → 比較用)。
 * 年額タブの price anchoring 用。
 */
export function monthlyTotalForYear(): number {
  return PLAN_PRICES.monthly * 12;
}
