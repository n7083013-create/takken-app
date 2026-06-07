// ============================================================
// utils/subscriptionLabel.ts (planLabel) テスト
// ============================================================
//
// 仕様 (2026-06-07 プラン値を 'premium' に統一):
// 1. トライアル中は「無料トライアル（残り○日）」を最優先表示
// 2. premium プランは "Premium プラン"
// 3. free プランは "無料プラン"
// 4. 残り日数が 0 でもトライアル中なら "残り0日" を表示する
//
// このヘルパーは progress 画面のプラン表示に使う。LP は無料 / Premium の 2 プラン構成。

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

    test('premium プランでもトライアル中ならトライアル表示が優先', () => {
      // edge case: 実運用では発生しにくいが、isTrial が true なら無条件で日数を見せる
      expect(planLabel({ plan: 'premium', isTrial: true, trialDaysLeft: 1 })).toBe(
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
  // 性質 2: 有料プラン (premium) は "Premium プラン"
  // ----------------------------------------------------------
  describe('有料プラン', () => {
    test('premium プランは "Premium プラン" と表示', () => {
      expect(planLabel({ plan: 'premium', isTrial: false, trialDaysLeft: 0 })).toBe(
        'Premium プラン',
      );
    });

    test('trialDaysLeft が残っていても isTrial=false なら Premium 表示', () => {
      // isTrial フラグだけがトライアル表示の条件
      expect(planLabel({ plan: 'premium', isTrial: false, trialDaysLeft: 5 })).toBe(
        'Premium プラン',
      );
    });
  });

  // ----------------------------------------------------------
  // 性質 3: 無料プラン
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
  // リグレッション: 内部キー名・旧プラン名を表示しない
  // ----------------------------------------------------------
  describe('リグレッション防止', () => {
    test('premium ラベルに内部名/旧名/Premium+ が混入しない', () => {
      const label = planLabel({ plan: 'premium', isTrial: false, trialDaysLeft: 0 });
      expect(label).not.toContain('スタンダード');
      expect(label).not.toContain('standard');
      expect(label).not.toContain('アンリミテッド');
      expect(label).not.toContain('unlimited');
      expect(label).not.toContain('Premium+');
      expect(label).not.toContain('プレミアム+');
    });
  });
});
