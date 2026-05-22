// ============================================================
// 模試の難易度配分 (DIFFICULTY_DISTRIBUTION) リグレッションテスト
// ============================================================
//
// 2026-05-22: ユーザーから「簡単すぎ」のフィードバックを受け、
//   旧 40 / 45 / 15  → 新 20 / 45 / 35 に引き上げ。
// 誰かが安易に元の易しい配分に戻すのを防ぐ。

import { DIFFICULTY_DISTRIBUTION } from '../../constants/exam';

describe('DIFFICULTY_DISTRIBUTION - 模試の難易度配分', () => {
  test('合計が 1.0 (端数誤差は許容)', () => {
    const sum = DIFFICULTY_DISTRIBUTION[1]
      + DIFFICULTY_DISTRIBUTION[2]
      + DIFFICULTY_DISTRIBUTION[3];
    expect(sum).toBeCloseTo(1.0, 5);
  });

  test('基本 (d1) は 25% 以下 (簡単すぎ防止)', () => {
    // 旧設定の 40% に戻されたら fail
    expect(DIFFICULTY_DISTRIBUTION[1]).toBeLessThanOrEqual(0.25);
  });

  test('難 (d3) は 30% 以上 (本試験レベル維持)', () => {
    // 旧設定の 15% に戻されたら fail
    expect(DIFFICULTY_DISTRIBUTION[3]).toBeGreaterThanOrEqual(0.30);
  });

  test('標準 (d2) は 40-55% (中心はブレない)', () => {
    expect(DIFFICULTY_DISTRIBUTION[2]).toBeGreaterThanOrEqual(0.40);
    expect(DIFFICULTY_DISTRIBUTION[2]).toBeLessThanOrEqual(0.55);
  });
});
