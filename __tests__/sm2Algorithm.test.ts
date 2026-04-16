// ============================================================
// SM-2 アルゴリズム & 進捗ストア テスト
// ============================================================
//
// このテストは以下を検証する:
// 1. calculateSM2 の間隔計算ロジック（SM-2 標準 + 確信度拡張）
// 2. correctStreak が累計 correctCount ではなく連続正答数であること（回帰テスト）
// 3. useProgressStore.recordAnswer の統合テスト

import { calculateSM2 } from '../store/useProgressStore';

// --- Zustand ストアのテストに必要なモック ---

// AsyncStorage モック
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

// cloudSync モック
jest.mock('../services/cloudSync', () => ({
  pullFromCloud: jest.fn(() => Promise.resolve(null)),
  pushProgressToCloud: jest.fn(() => Promise.resolve()),
  pushStatsToCloud: jest.fn(() => Promise.resolve()),
  mergeProgress: jest.fn((a: unknown) => a),
}));

// errorLogger モック
jest.mock('../services/errorLogger', () => ({
  logError: jest.fn(),
}));

// ============================================================
// 1. calculateSM2 単体テスト
// ============================================================

describe('calculateSM2 - SM-2 アルゴリズム', () => {
  const DEFAULT_EASE = 2.5;

  // ----------------------------------------------------------
  // テスト 1: 初回正解 (streak=0) → interval=1
  // ----------------------------------------------------------
  describe('初回正解 (correctStreak=0)', () => {
    it('interval が 1 になること', () => {
      const result = calculateSM2(true, 0, DEFAULT_EASE, 0, 'low');
      expect(result.interval).toBe(1);
    });

    it('easeFactor が微増すること (標準confidence)', () => {
      const result = calculateSM2(true, 0, DEFAULT_EASE, 0, 'low');
      expect(result.easeFactor).toBeCloseTo(DEFAULT_EASE + 0.02, 5);
    });
  });

  // ----------------------------------------------------------
  // テスト 2: 2回目連続正解 (streak=1) → interval=6
  // ----------------------------------------------------------
  describe('2回目連続正解 (correctStreak=1)', () => {
    it('interval が 6 になること', () => {
      const result = calculateSM2(true, 1, DEFAULT_EASE, 1, 'low');
      expect(result.interval).toBe(6);
    });
  });

  // ----------------------------------------------------------
  // テスト 3: 3回目以降連続正解 → interval = round(currentInterval * easeFactor)
  // ----------------------------------------------------------
  describe('3回目以降連続正解 (correctStreak>=2)', () => {
    it('interval が currentInterval * easeFactor で計算されること', () => {
      const currentInterval = 6;
      const ease = 2.5;
      const result = calculateSM2(true, currentInterval, ease, 2, 'low');
      expect(result.interval).toBe(Math.round(currentInterval * ease)); // 15
    });

    it('streak=3, interval=15, ease=2.52 のケース', () => {
      const currentInterval = 15;
      const ease = 2.52;
      const result = calculateSM2(true, currentInterval, ease, 3, 'low');
      expect(result.interval).toBe(Math.round(currentInterval * ease)); // 38
    });

    it('高い streak でも正しく乗算されること', () => {
      const currentInterval = 100;
      const ease = 2.0;
      const result = calculateSM2(true, currentInterval, ease, 10, 'low');
      expect(result.interval).toBe(200);
    });
  });

  // ----------------------------------------------------------
  // テスト 4: 不正解 → interval=1, easeFactor -0.2
  // ----------------------------------------------------------
  describe('不正解', () => {
    it('interval が 1 にリセットされること', () => {
      const result = calculateSM2(false, 60, DEFAULT_EASE, 5, 'low');
      expect(result.interval).toBe(1);
    });

    it('easeFactor が 0.2 減少すること', () => {
      const result = calculateSM2(false, 60, DEFAULT_EASE, 5, 'low');
      expect(result.easeFactor).toBeCloseTo(DEFAULT_EASE - 0.2, 5);
    });

    it('confidence に関わらず interval=1 になること', () => {
      const resultHigh = calculateSM2(false, 60, DEFAULT_EASE, 5, 'high');
      const resultNone = calculateSM2(false, 60, DEFAULT_EASE, 5, 'none');
      expect(resultHigh.interval).toBe(1);
      expect(resultNone.interval).toBe(1);
    });
  });

  // ----------------------------------------------------------
  // テスト 5: confidence='high' → 1.3x interval, +0.05 easeFactor
  // ----------------------------------------------------------
  describe('高確信度 (confidence=high)', () => {
    it('interval が 1.3 倍になること (streak=0)', () => {
      const result = calculateSM2(true, 0, DEFAULT_EASE, 0, 'high');
      // baseInterval=1, * 1.3 = 1.3, round = 1
      expect(result.interval).toBe(Math.round(1 * 1.3));
    });

    it('interval が 1.3 倍になること (streak=1)', () => {
      const result = calculateSM2(true, 1, DEFAULT_EASE, 1, 'high');
      // baseInterval=6, * 1.3 = 7.8, round = 8
      expect(result.interval).toBe(Math.round(6 * 1.3));
    });

    it('interval が 1.3 倍になること (streak>=2)', () => {
      const currentInterval = 10;
      const ease = 2.5;
      const result = calculateSM2(true, currentInterval, ease, 2, 'high');
      const baseInterval = Math.round(currentInterval * ease); // 25
      expect(result.interval).toBe(Math.round(baseInterval * 1.3)); // 33
    });

    it('easeFactor が +0.05 されること', () => {
      const result = calculateSM2(true, 0, DEFAULT_EASE, 0, 'high');
      expect(result.easeFactor).toBeCloseTo(Math.min(3.0, DEFAULT_EASE + 0.05), 5);
    });
  });

  // ----------------------------------------------------------
  // テスト 6: confidence='none' (難しい) → 0.5x interval, -0.10 easeFactor
  // ----------------------------------------------------------
  describe('低確信度 (confidence=none / 難しい)', () => {
    it('interval が 0.5 倍になること (streak=0)', () => {
      const result = calculateSM2(true, 0, DEFAULT_EASE, 0, 'none');
      // baseInterval=1, * 0.5 = 0.5, round = 1 (max(1, ...))
      expect(result.interval).toBe(Math.max(1, Math.round(1 * 0.5)));
    });

    it('interval が 0.5 倍になること (streak=1)', () => {
      const result = calculateSM2(true, 1, DEFAULT_EASE, 1, 'none');
      // baseInterval=6, * 0.5 = 3
      expect(result.interval).toBe(Math.max(1, Math.round(6 * 0.5)));
    });

    it('interval が 0.5 倍になること (streak>=2)', () => {
      const currentInterval = 20;
      const ease = 2.5;
      const result = calculateSM2(true, currentInterval, ease, 3, 'none');
      const baseInterval = Math.round(currentInterval * ease); // 50
      expect(result.interval).toBe(Math.max(1, Math.round(baseInterval * 0.5))); // 25
    });

    it('interval の下限が 1 であること', () => {
      const result = calculateSM2(true, 0, 1.3, 0, 'none');
      // baseInterval=1, * 0.5 = 0.5, round = 1 (max(1, 1))
      expect(result.interval).toBeGreaterThanOrEqual(1);
    });

    it('easeFactor が -0.10 されること', () => {
      const result = calculateSM2(true, 0, DEFAULT_EASE, 0, 'none');
      expect(result.easeFactor).toBeCloseTo(DEFAULT_EASE - 0.10, 5);
    });
  });

  // ----------------------------------------------------------
  // テスト 7: easeFactor の上限 (3.0) と下限 (1.3)
  // ----------------------------------------------------------
  describe('easeFactor 境界値', () => {
    it('easeFactor の下限は 1.3 であること (不正解で減少)', () => {
      // ease=1.3 (最小値) のまま不正解 → 1.3 - 0.2 = 1.1 → clamp to 1.3
      const result = calculateSM2(false, 10, 1.3, 3, 'low');
      expect(result.easeFactor).toBe(1.3);
    });

    it('easeFactor の下限は 1.3 であること (none confidence で減少)', () => {
      const result = calculateSM2(true, 0, 1.35, 0, 'none');
      // 1.35 - 0.10 = 1.25 → clamp to 1.3
      expect(result.easeFactor).toBe(1.3);
    });

    it('easeFactor の上限は 3.0 であること (high confidence で増加)', () => {
      // ease=2.99 のまま high confidence → 2.99 + 0.05 = 3.04 → clamp to 3.0
      const result = calculateSM2(true, 0, 2.99, 0, 'high');
      expect(result.easeFactor).toBe(3.0);
    });

    it('easeFactor が既に 3.0 なら増加しないこと', () => {
      const result = calculateSM2(true, 0, 3.0, 0, 'high');
      expect(result.easeFactor).toBe(3.0);
    });

    it('easeFactor の上限は low confidence でも 3.0 であること', () => {
      const result = calculateSM2(true, 0, 2.99, 0, 'low');
      // 2.99 + 0.02 = 3.01 → clamp to 3.0
      expect(result.easeFactor).toBe(3.0);
    });

    it('不正解で easeFactor が下限未満にならないこと（連続不正解シナリオ）', () => {
      let ease = 2.5;
      // 連続不正解をシミュレーション: 各回 -0.2 ずつ減少
      for (let i = 0; i < 20; i++) {
        const result = calculateSM2(false, 1, ease, 0, 'low');
        ease = result.easeFactor;
        expect(ease).toBeGreaterThanOrEqual(1.3);
      }
      expect(ease).toBe(1.3);
    });
  });

  // ----------------------------------------------------------
  // テスト 8: 回帰テスト - correctStreak は連続正答数であり累計ではない
  // ----------------------------------------------------------
  describe('[回帰テスト] correctStreak は連続正答数（累計 correctCount ではない）', () => {
    it('streak=0 (不正解直後) と streak=5 (5連続正解) で interval が異なること', () => {
      // streak=0: 初回扱い → interval=1
      const afterReset = calculateSM2(true, 1, 2.5, 0, 'low');
      // streak=5: interval = currentInterval * ease
      const afterStreak = calculateSM2(true, 30, 2.5, 5, 'low');

      expect(afterReset.interval).toBe(1);
      expect(afterStreak.interval).toBe(Math.round(30 * 2.5)); // 75
      expect(afterStreak.interval).toBeGreaterThan(afterReset.interval);
    });

    it('累計 correctCount=10 でも streak=0 なら interval=1 であること', () => {
      // バグのシナリオ: 累計10問正解しているが、直前に不正解でstreak=0
      // 旧バグでは correctCount(=10) を渡していたため streak>=2 扱いで大きな interval になった
      const result = calculateSM2(true, 1, 2.5, 0, 'low');
      expect(result.interval).toBe(1);
      // 旧バグだと interval = round(1 * 2.5) = 3 や round(1 * 2.5 * ...) のような値になっていた
    });

    it('累計 correctCount=100 でも streak=1 なら interval=6 であること', () => {
      // streak=1 は「直前1回だけ正解」を意味する
      const result = calculateSM2(true, 1, 2.5, 1, 'low');
      expect(result.interval).toBe(6);
    });

    it('streak が大きな値（旧バグで累計が渡されたケース）だと不適切に長い interval になる', () => {
      // このテストは「累計を渡すとどうなるか」を示す（やってはいけない例）
      const buggyResult = calculateSM2(true, 30, 2.5, 50, 'low');
      const correctResult = calculateSM2(true, 30, 2.5, 3, 'low');

      // 両方とも streak >= 2 なので同じ計算式だが、
      // 重要なのは streak=0 や streak=1 で正しく分岐すること
      expect(buggyResult.interval).toBe(correctResult.interval);
      // streak >= 2 では同じ計算 (interval * ease) になるのが正しい
      expect(correctResult.interval).toBe(Math.round(30 * 2.5));
    });
  });

  // ----------------------------------------------------------
  // テスト 9: ストリークリセット後の再構築
  // ----------------------------------------------------------
  describe('ストリークリセット → 再構築シナリオ', () => {
    it('正解3回 → 不正解 → 正解 で streak が正しくリセット・再構築されること', () => {
      let interval = 0;
      let ease = 2.5;
      let streak = 0;

      // 1回目正解: streak=0 → interval=1
      let r = calculateSM2(true, interval, ease, streak, 'low');
      expect(r.interval).toBe(1);
      interval = r.interval;
      ease = r.easeFactor;
      streak = 1; // recordAnswer が +1 する

      // 2回目正解: streak=1 → interval=6
      r = calculateSM2(true, interval, ease, streak, 'low');
      expect(r.interval).toBe(6);
      interval = r.interval;
      ease = r.easeFactor;
      streak = 2;

      // 3回目正解: streak=2 → interval = round(6 * ease)
      r = calculateSM2(true, interval, ease, streak, 'low');
      const thirdInterval = Math.round(6 * ease);
      expect(r.interval).toBe(thirdInterval);
      interval = r.interval;
      ease = r.easeFactor;
      streak = 3;

      // 不正解! → interval=1, streak リセット
      r = calculateSM2(false, interval, ease, streak, 'low');
      expect(r.interval).toBe(1);
      interval = r.interval;
      ease = r.easeFactor;
      streak = 0; // リセット

      // 再度1回目正解: streak=0 → interval=1（リセット後の再スタート）
      r = calculateSM2(true, interval, ease, streak, 'low');
      expect(r.interval).toBe(1);

      // 再度2回目正解: streak=1 → interval=6
      interval = r.interval;
      ease = r.easeFactor;
      streak = 1;
      r = calculateSM2(true, interval, ease, streak, 'low');
      expect(r.interval).toBe(6);
    });
  });

  // ----------------------------------------------------------
  // デフォルト confidence のテスト
  // ----------------------------------------------------------
  describe('デフォルト confidence', () => {
    it('confidence 省略時は "low" (普通) 扱いになること', () => {
      // confidence パラメータなし
      const result = calculateSM2(true, 0, DEFAULT_EASE, 0);
      const resultExplicit = calculateSM2(true, 0, DEFAULT_EASE, 0, 'low');
      expect(result.interval).toBe(resultExplicit.interval);
      expect(result.easeFactor).toBe(resultExplicit.easeFactor);
    });
  });
});

// ============================================================
// 2. useProgressStore 統合テスト
// ============================================================

describe('useProgressStore - recordAnswer 統合テスト', () => {
  // Zustand v5 のストアを直接インポートしてテスト
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useProgressStore } = require('../store/useProgressStore');

  beforeEach(() => {
    // ストアを初期状態にリセット
    useProgressStore.getState().resetProgress();
  });

  // ----------------------------------------------------------
  // テスト 10: recordAnswer が correctStreak を正しく更新するか
  // ----------------------------------------------------------
  describe('correctStreak の更新', () => {
    it('初回正解で correctStreak=1 になること', () => {
      const store = useProgressStore.getState();
      store.recordAnswer('q001', 'kenri', true, 'low');
      const progress = useProgressStore.getState().progress['q001'];
      expect(progress).toBeDefined();
      expect(progress.correctStreak).toBe(1);
    });

    it('2回連続正解で correctStreak=2 になること', () => {
      const store = useProgressStore.getState();
      store.recordAnswer('q001', 'kenri', true, 'low');
      useProgressStore.getState().recordAnswer('q001', 'kenri', true, 'low');
      const progress = useProgressStore.getState().progress['q001'];
      expect(progress.correctStreak).toBe(2);
    });

    it('正解 → 不正解 で correctStreak=0 にリセットされること', () => {
      const store = useProgressStore.getState();
      store.recordAnswer('q001', 'kenri', true, 'low');
      expect(useProgressStore.getState().progress['q001'].correctStreak).toBe(1);

      useProgressStore.getState().recordAnswer('q001', 'kenri', false, 'low');
      expect(useProgressStore.getState().progress['q001'].correctStreak).toBe(0);
    });

    it('正解3回 → 不正解 → 正解 で correctStreak が 0→1 に戻ること', () => {
      const store = useProgressStore.getState();
      store.recordAnswer('q001', 'kenri', true, 'low');
      useProgressStore.getState().recordAnswer('q001', 'kenri', true, 'low');
      useProgressStore.getState().recordAnswer('q001', 'kenri', true, 'low');
      expect(useProgressStore.getState().progress['q001'].correctStreak).toBe(3);

      useProgressStore.getState().recordAnswer('q001', 'kenri', false, 'low');
      expect(useProgressStore.getState().progress['q001'].correctStreak).toBe(0);

      useProgressStore.getState().recordAnswer('q001', 'kenri', true, 'low');
      expect(useProgressStore.getState().progress['q001'].correctStreak).toBe(1);
    });

    it('correctCount（累計）と correctStreak（連続）が独立していること', () => {
      const store = useProgressStore.getState();
      // 正解, 正解, 不正解, 正解
      store.recordAnswer('q001', 'kenri', true, 'low');
      useProgressStore.getState().recordAnswer('q001', 'kenri', true, 'low');
      useProgressStore.getState().recordAnswer('q001', 'kenri', false, 'low');
      useProgressStore.getState().recordAnswer('q001', 'kenri', true, 'low');

      const progress = useProgressStore.getState().progress['q001'];
      expect(progress.correctCount).toBe(3);   // 累計: 3回正解
      expect(progress.correctStreak).toBe(1);   // 連続: 不正解後の1回のみ
      expect(progress.attempts).toBe(4);        // 全4回解答
    });
  });

  describe('interval と easeFactor の更新', () => {
    it('初回正解後の interval が設定されること', () => {
      useProgressStore.getState().recordAnswer('q001', 'kenri', true, 'low');
      const progress = useProgressStore.getState().progress['q001'];
      // recordAnswer で correctStreak=1 として calculateSM2 に渡される
      // correctStreak=1 → interval=6
      expect(progress.interval).toBe(6);
    });

    it('不正解後の interval が 1 になること', () => {
      useProgressStore.getState().recordAnswer('q001', 'kenri', false, 'low');
      const progress = useProgressStore.getState().progress['q001'];
      expect(progress.interval).toBe(1);
    });

    it('easeFactor が初期値 2.5 から変動すること', () => {
      useProgressStore.getState().recordAnswer('q001', 'kenri', true, 'low');
      const progress = useProgressStore.getState().progress['q001'];
      // correctStreak=1, low confidence → ease + 0.02 = 2.52
      expect(progress.easeFactor).toBeCloseTo(2.52, 5);
    });

    it('high confidence で interval が大きくなること', () => {
      useProgressStore.getState().recordAnswer('q001', 'kenri', true, 'high');
      const progress = useProgressStore.getState().progress['q001'];
      // correctStreak=1 → baseInterval=6, * 1.3 = 7.8 → round = 8
      expect(progress.interval).toBe(8);
    });

    it('none confidence で interval が小さくなること', () => {
      useProgressStore.getState().recordAnswer('q001', 'kenri', true, 'none');
      const progress = useProgressStore.getState().progress['q001'];
      // correctStreak=1 → baseInterval=6, * 0.5 = 3
      expect(progress.interval).toBe(3);
    });
  });

  describe('nextReviewAt の設定', () => {
    it('nextReviewAt が interval 日後に設定されること', () => {
      const before = new Date();
      useProgressStore.getState().recordAnswer('q001', 'kenri', true, 'low');
      const after = new Date();

      const progress = useProgressStore.getState().progress['q001'];
      const reviewDate = new Date(progress.nextReviewAt);

      // interval=6 (streak=1) なので 6 日後あたり
      const expectedMin = new Date(before);
      expectedMin.setDate(expectedMin.getDate() + progress.interval);
      const expectedMax = new Date(after);
      expectedMax.setDate(expectedMax.getDate() + progress.interval);

      expect(reviewDate.getTime()).toBeGreaterThanOrEqual(expectedMin.getTime() - 1000);
      expect(reviewDate.getTime()).toBeLessThanOrEqual(expectedMax.getTime() + 1000);
    });
  });

  describe('stats の更新', () => {
    it('totalQuestions がインクリメントされること', () => {
      useProgressStore.getState().recordAnswer('q001', 'kenri', true, 'low');
      expect(useProgressStore.getState().stats.totalQuestions).toBe(1);

      useProgressStore.getState().recordAnswer('q002', 'kenri', false, 'low');
      expect(useProgressStore.getState().stats.totalQuestions).toBe(2);
    });

    it('totalCorrect が正解時のみインクリメントされること', () => {
      useProgressStore.getState().recordAnswer('q001', 'kenri', true, 'low');
      expect(useProgressStore.getState().stats.totalCorrect).toBe(1);

      useProgressStore.getState().recordAnswer('q002', 'kenri', false, 'low');
      expect(useProgressStore.getState().stats.totalCorrect).toBe(1); // 不正解なので変わらない
    });

    it('categoryStats が正しく更新されること', () => {
      useProgressStore.getState().recordAnswer('q001', 'kenri', true, 'low');
      useProgressStore.getState().recordAnswer('q002', 'takkengyoho', false, 'low');

      const stats = useProgressStore.getState().stats;
      expect(stats.categoryStats.kenri).toEqual({ total: 1, correct: 1 });
      expect(stats.categoryStats.takkengyoho).toEqual({ total: 1, correct: 0 });
    });
  });

  describe('lastConfidence の記録', () => {
    it('確信度が progress に記録されること', () => {
      useProgressStore.getState().recordAnswer('q001', 'kenri', true, 'high');
      expect(useProgressStore.getState().progress['q001'].lastConfidence).toBe('high');

      useProgressStore.getState().recordAnswer('q001', 'kenri', true, 'none');
      expect(useProgressStore.getState().progress['q001'].lastConfidence).toBe('none');
    });
  });
});
