// ============================================================
// サブスクリプションプランの表示ラベル決定ヘルパー
// progress.tsx 等から使う。テスト可能なよう React 非依存の純関数で実装。
// ============================================================

import type { SubscriptionPlan } from '../types';

interface PlanLabelInput {
  plan: SubscriptionPlan;
  isTrial: boolean;
  trialDaysLeft: number;
}

/**
 * 現状の運用は LP どおり 2 プラン (無料 / Premium)。
 * `unlimited` (Premium+) は実装はあるが運用していないため、Premium 扱いで表示する。
 * トライアル中は「無料トライアル（残り○日）」を優先表示。
 *
 * @example
 *   planLabel({ plan: 'standard', isTrial: false, trialDaysLeft: 0 })
 *   // => 'Premium プラン'
 *   planLabel({ plan: 'free', isTrial: true, trialDaysLeft: 3 })
 *   // => '無料トライアル（残り3日）'
 */
export function planLabel({ plan, isTrial, trialDaysLeft }: PlanLabelInput): string {
  if (isTrial) {
    return `無料トライアル（残り${trialDaysLeft}日）`;
  }
  // standard と unlimited は LP の「Premium」として一括表示
  if (plan === 'standard' || plan === 'unlimited') {
    return 'Premium プラン';
  }
  return '無料プラン';
}
