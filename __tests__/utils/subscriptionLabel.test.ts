// ============================================================
// utils/subscriptionLabel.ts (planLabel) テスト
// ============================================================
//
// 仕様:
// 1. トライアル中は「無料トライアル（残り○日）」を最優先表示
// 2. standard プランは "Premium プラン"
// 3. unlimited プランも "Premium プラン" (LP は 2 プラン構成)
// 4. free プランは "無料プラン"
// 5. 残り日数が 0 でもトライアル中なら "残り0日" を表示する
//
// このヘルパーは progress 画面のプラン表示に使う。
// LP は無料 / Premium の 2 プラン構成だが、内部実装には unlimited (Premium+) が
// 残っているため、両方を "Premium" として扱うことが重要。

import { planLabel } from '../../utils/subscriptionLabel';

describe('planLabel - サブスクリプション表示ラベル', () => {
  // ----------------------------------------------------------
  // 性質 1: トライアル中の優先表示
  // ----------------------------------------------------------

  describe('トライアル中', () => {
    test('free プランかつトライアル中は「無料トライアル（残り○日）」', () => {
      expect(planLabel({ plan: 'free', isTrial: true, trialDaysLeft: 7 })).toBe(
        '無料トライアル（残り7日）',
      );
    });

    test('standard プランでもトライアル中ならトライアル表示が優先', () => {
      // edge case: 実運用では発生しにくいが、isTrial が true なら無条件で
      // トライアル文言を出すべき (Premium 表示と矛盾しても日数を見せる)
      expect(planLabel({ plan: 'standard', isTrial: true, trialDaysLeft: 1 })).toBe(
        '無料トライアル（残り1日）',
      );
    });

    test('残り 0 日のトライアルは「残り0日」と表示', () => {
      expect(planLabel({ plan: 'free', isTrial: true, trialDaysLeft: 0 })).toBe(
        '無料トライアル（残り0日）',
      );
    });

    test('残り日数が 30 日でも正しく表示', () => {
      expect(planLabel({ plan: 'free', isTrial: true, trialDaysLeft: 30 })).toBe(
        '無料トライアル（残り30日）',
      );
    });
  });

  // ----------------------------------------------------------
  // 性質 2-3: 有料プラン (standard / unlimited) は両方 Premium
  // ----------------------------------------------------------

  describe('有料プラン', () => {
    test('standard プランは "Premium プラン" と表示', () => {
      expect(planLabel({ plan: 'standard', isTrial: false, trialDaysLeft: 0 })).toBe(
        'Premium プラン',
      );
    });

    test('unlimited プランも同じ "Premium プラン" と表示 (LP は 2 プラン構成)', () => {
      // 内部に Premium+ (unlimited) の実装はあるが、LP では Premium 一本化。
      // ユーザーに「スタンダード」「アンリミテッド」という名前を見せないこと。
      expect(planLabel({ plan: 'unlimited', isTrial: false, trialDaysLeft: 0 })).toBe(
        'Premium プラン',
      );
    });

    test('trialDaysLeft が残っていても isTrial=false なら Premium 表示', () => {
      // isTrial フラグだけがトライアル表示の条件
      expect(planLabel({ plan: 'standard', isTrial: false, trialDaysLeft: 5 })).toBe(
        'Premium プラン',
      );
    });
  });

  // ----------------------------------------------------------
  // 性質 4: 無料プラン
  // ----------------------------------------------------------

  describe('無料プラン', () => {
    test('free プランかつトライアル外は "無料プラン"', () => {
      expect(planLabel({ plan: 'free', isTrial: false, trialDaysLeft: 0 })).toBe('無料プラン');
    });

    test('trialDaysLeft が残っていても isTrial=false なら無料プラン', () => {
      expect(planLabel({ plan: 'free', isTrial: false, trialDaysLeft: 3 })).toBe('無料プラン');
    });
  });

  // ----------------------------------------------------------
  // リグレッション: 旧仕様の文言が混入していないか
  // ----------------------------------------------------------

  describe('リグレッション防止', () => {
    test('"スタンダードプラン" の表記は決して返さない', () => {
      const labels = [
        planLabel({ plan: 'standard', isTrial: false, trialDaysLeft: 0 }),
        planLabel({ plan: 'unlimited', isTrial: false, trialDaysLeft: 0 }),
      ];
      labels.forEach((label) => {
        expect(label).not.toContain('スタンダード');
      });
    });

    test('"アンリミテッド" の表記は決して返さない', () => {
      const label = planLabel({ plan: 'unlimited', isTrial: false, trialDaysLeft: 0 });
      expect(label).not.toContain('アンリミテッド');
      expect(label).not.toContain('unlimited');
    });

    test('"Premium+" の表記は決して返さない (LP 2 プラン構成)', () => {
      const labels = [
        planLabel({ plan: 'standard', isTrial: false, trialDaysLeft: 0 }),
        planLabel({ plan: 'unlimited', isTrial: false, trialDaysLeft: 0 }),
      ];
      labels.forEach((label) => {
        expect(label).not.toContain('Premium+');
        expect(label).not.toContain('プレミアム+');
      });
    });
  });
});
