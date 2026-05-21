// ============================================================
// 解約防止フローの文言中央集権 + counter-offer ロジック
// ============================================================
//
// 世界基準 (Spotify / Netflix / NYT / Audible) の解約フロー:
//   1. 解約理由を聞く (5-6 種類)
//   2. 理由別に最適な counter-offer を提示
//   3. 受け入れ → 解約回避 / 断り → 最終確認 → 実行
//
// このモジュールは純関数で実装し、ユニットテストで挙動を保証する。
// 「文言劣化」「offer 設計の漏れ」を CI で防止。
//
// 2026-05 年額プラン追加に伴い、`getCounterOffer(reason, billingCycle)` で
// 月額 / 年額ユーザーで offer を分岐するよう拡張済み。
// 年額契約者は支払い済み期間が長いため「半額」「一時停止」の意味が変わる。

import type { BillingCycle } from '../types';

/** 宅建士アプリ固有のドメイン文脈に最適化した 6 種類の解約理由 */
export type CancellationReason =
  | 'too_expensive'    // 料金が高い
  | 'exam_done'        // 試験が終わった / 合格した
  | 'gave_up'          // 不合格で諦める / モチベ低下
  | 'no_time'          // 忙しくて使えない
  | 'features'         // 機能・問題に不満
  | 'other';           // その他

/** counter-offer の種類 (UI 分岐と分析イベント両方で使う) */
export type OfferType =
  | 'half_price_one_month'   // 1ヶ月だけ半額
  | 'pause_subscription'     // 一時停止 (次の試験まで)
  | 'free_extension_30days'  // 30日無料延長 + 応援
  | 'pause_short'            // 1-3ヶ月だけ一時停止
  | 'support_form'           // 問題報告フォーム + 30日返金
  | 'no_offer';              // オファーなし (= 即最終確認へ)

export interface ReasonChoice {
  reason: CancellationReason;
  /** ラジオボタンに表示するラベル */
  label: string;
  /** 補足説明 (短く) */
  description?: string;
  /** 絵文字 (lockup の左に表示) */
  emoji: string;
}

export interface CounterOffer {
  offerType: OfferType;
  /** ヘッダー絵文字 */
  emoji: string;
  /** 1 行目 */
  title: string;
  /** 2-3 行目 */
  subtitle: string;
  /** 「これを受け入れる」CTA */
  acceptCta: string;
  /** 「やはり解約する」リンク文言 */
  declineCta: string;
}

/**
 * 解約理由の選択肢一覧 (UI で表示する順序)。
 * 宅建士アプリの実情を反映:
 * - 試験は年に1回 (10月) → exam_done / gave_up が季節要因で頻出
 * - 試験前は too_expensive / no_time
 */
export const REASON_CHOICES: ReasonChoice[] = [
  {
    reason: 'too_expensive',
    emoji: '💰',
    label: '料金が高い',
    description: '価格に見合う価値を感じない',
  },
  {
    reason: 'exam_done',
    emoji: '🎓',
    label: '試験が終わった',
    description: '今期は受験完了 (合格・不合格問わず)',
  },
  {
    reason: 'gave_up',
    emoji: '😔',
    label: '今年は諦めた',
    description: '不合格 / モチベが続かなかった',
  },
  {
    reason: 'no_time',
    emoji: '⏰',
    label: '忙しくて使えない',
    description: '時間が取れず、もったいない',
  },
  {
    reason: 'features',
    emoji: '💡',
    label: '機能・内容に不満',
    description: '問題の質・解説・UI などへの要望',
  },
  {
    reason: 'other',
    emoji: '✏️',
    label: 'その他',
    description: '上記に当てはまらない理由',
  },
];

/**
 * 解約理由に応じた最適な counter-offer を返す。
 * 「お引き止め」ではなく「ユーザーの状況に合った代替案」を提示するのが世界基準。
 *
 * @param reason 解約理由
 * @param billingCycle 月額 / 年額。年額契約者は既に長期支払い済みなので別文言。
 *                     省略時は 'monthly' (後方互換)
 */
export function getCounterOffer(
  reason: CancellationReason,
  billingCycle: BillingCycle = 'monthly',
): CounterOffer {
  const isAnnual = billingCycle === 'annual';

  switch (reason) {
    case 'too_expensive':
      // 年額契約者は既に「月額 ¥498 相当」を払っているので「半額」が刺さらない。
      // 代わりに「残り期間は全機能使えます」「翌年は更新タイミングで考えよう」と提示。
      if (isAnnual) {
        return {
          offerType: 'no_offer',
          emoji: '💝',
          title: '年額プランは既に最大割引価格です',
          subtitle:
            '月額換算 ¥498/月 (約 49% OFF) で、これ以上の割引はありません。\n次回更新は 1 年後。それまで全機能をお使いいただけます。',
          acceptCta: '残り期間を使う',
          declineCta: 'それでも解約する',
        };
      }
      return {
        offerType: 'half_price_one_month',
        emoji: '💝',
        title: '1ヶ月だけ半額（¥490）で続けてみませんか？',
        subtitle:
          '今月だけ価格を半額にします。\n気が変わったらいつでも解約できます。',
        acceptCta: '半額で1ヶ月続ける',
        declineCta: 'それでも解約する',
      };

    case 'exam_done':
      // 年額契約者は「次の試験まで」が既に支払い済みなので、解約せず使ってもらえばよい。
      if (isAnnual) {
        return {
          offerType: 'no_offer',
          emoji: '⏸️',
          title: 'ご支払い済みの残り期間で次の試験まで使えます',
          subtitle:
            '年額プランは次回更新まで全機能ご利用可能。\n来年もう一度受験する場合、復習データもそのまま使えます。',
          acceptCta: '残り期間を活用する',
          declineCta: 'それでも解約する',
        };
      }
      return {
        offerType: 'pause_subscription',
        emoji: '⏸️',
        title: '次の試験まで一時停止しませんか？',
        subtitle:
          '解約せずに支払いだけ止められます。\n学習データはそのまま、来年すぐ再開できます。',
        acceptCta: '次の試験まで一時停止',
        declineCta: 'それでも解約する',
      };

    case 'gave_up':
      // 年額契約者は「もう払ってあるから来年まで使い続けて」と励まし。
      if (isAnnual) {
        return {
          offerType: 'no_offer',
          emoji: '🌱',
          title: 'お支払い済みの 1 年で巻き返しを',
          subtitle:
            '今年は無理でも、年額の残り期間で来年合格を目指しませんか？\nペースを落とせばよし。学習データは保存されます。',
          acceptCta: '来年に向けて続ける',
          declineCta: 'それでも解約する',
        };
      }
      return {
        offerType: 'free_extension_30days',
        emoji: '🌱',
        title: '諦めるのはまだ早いかもしれません',
        subtitle:
          '30日間無料で延長します。\nペースを落としてでも、一緒に来年合格を目指しませんか？',
        acceptCta: '30日無料延長で続ける',
        declineCta: 'それでも解約する',
      };

    case 'no_time':
      // 年額契約者は「もう払ってあるから余裕ができたら戻ってきて」
      if (isAnnual) {
        return {
          offerType: 'no_offer',
          emoji: '⏸️',
          title: '残り期間はいつでも戻れます',
          subtitle:
            '年額プランは次回更新まで有効です。\n余裕ができた時に、いつでもログインして再開できます。',
          acceptCta: 'いったん休む',
          declineCta: 'それでも解約する',
        };
      }
      return {
        offerType: 'pause_short',
        emoji: '⏸️',
        title: '1〜3ヶ月だけ一時停止できます',
        subtitle:
          '解約せずに支払いだけ止めて、\n余裕ができたら再開できます。学習データはそのまま。',
        acceptCta: '一時停止する',
        declineCta: 'それでも解約する',
      };

    case 'features':
      // 機能不満は cycle 不問 (要望ヒアリング → 改善が一番のお引き止め)
      return {
        offerType: 'support_form',
        emoji: '🛠️',
        title: '改善できることがあるかもしれません',
        subtitle:
          'ご不満な点を教えていただければ、\n優先的に対応します。30日間の返金保証もあります。',
        acceptCta: '要望を伝える',
        declineCta: 'それでも解約する',
      };

    case 'other':
    default:
      return {
        offerType: 'no_offer',
        emoji: '👋',
        title: 'ご利用ありがとうございました',
        subtitle: isAnnual
          ? '次回更新日 (年額の残り期間) まで全機能をご利用いただけます。\nまたいつでもお待ちしております。'
          : '次回更新日まで全機能を引き続きご利用いただけます。\nまたいつでもお待ちしております。',
        acceptCta: '解約をやめる',
        declineCta: '解約する',
      };
  }
}

/**
 * 最終確認画面の文言。
 * 「失うもの」を明示することで loss aversion を働かせる。
 */
export interface FinalConfirmCopy {
  title: string;
  losses: string[];
  primaryCta: string;
  secondaryCta: string;
}

export function getFinalConfirmCopy(): FinalConfirmCopy {
  return {
    title: '本当に解約しますか？',
    losses: [
      '全820問の解説アクセスが停止します',
      '本試験形式の模擬試験が使えなくなります',
      'AI 解説チャットが 1日3回までに制限されます',
      '苦手分野の AI コーチングが停止します',
    ],
    primaryCta: 'やはり続ける',
    secondaryCta: '解約を完了する',
  };
}

/**
 * 受け入れた offer を分析イベントに付与するためのラベル生成。
 * GA4 のカスタムパラメータ命名規則 (snake_case) に合わせる。
 */
export function offerEventLabel(offerType: OfferType): string {
  return offerType; // 既に snake_case の enum なのでそのまま使える
}
