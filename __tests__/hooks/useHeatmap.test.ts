// ============================================================
// useHeatmap - classifyStatus テスト
// [新仕様 2026-05] 達成率 (3連正解問題 / 全問題) ベース判定
// 旧: accuracy (1問正解で100%) ベース → 誤誘導の懸念があった
// ============================================================

// useHeatmap → useProgressStore → cloudSync → supabase の chain で
// ES module 由来のエラーが起きるため、依存をモック
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../services/supabase', () => ({ supabase: {} }));
jest.mock('../../services/cloudSync', () => ({
  pullFromCloud: jest.fn(() => Promise.resolve(null)),
  pushProgressToCloud: jest.fn(() => Promise.resolve()),
  pushStatsToCloud: jest.fn(() => Promise.resolve()),
  mergeProgress: jest.fn((a: unknown) => a),
  markDirty: jest.fn(),
  resetSyncState: jest.fn(),
}));
jest.mock('../../services/errorLogger', () => ({ logError: jest.fn() }));
jest.mock('../../services/notifications', () => ({
  refreshNotificationsAfterAnswer: jest.fn(() => Promise.resolve()),
}));

import { classifyStatus } from '../../hooks/useHeatmap';

describe('useHeatmap - classifyStatus (達成率ベース)', () => {
  describe('未着手', () => {
    it('attempted=0 は masteryRate に関わらず unstarted', () => {
      expect(classifyStatus(0, 0)).toBe('unstarted');
      expect(classifyStatus(0, 0.5)).toBe('unstarted');
      expect(classifyStatus(0, 1.0)).toBe('unstarted');
    });
  });

  describe('着手後の判定 (達成率ベース)', () => {
    it('達成率 >= 70% で strong', () => {
      expect(classifyStatus(10, 0.7)).toBe('strong');
      expect(classifyStatus(10, 0.85)).toBe('strong');
      expect(classifyStatus(10, 1.0)).toBe('strong');
    });

    it('達成率 30%-69% で standard', () => {
      expect(classifyStatus(10, 0.3)).toBe('standard');
      expect(classifyStatus(10, 0.5)).toBe('standard');
      expect(classifyStatus(10, 0.69)).toBe('standard');
    });

    it('達成率 < 30% で weak', () => {
      expect(classifyStatus(10, 0)).toBe('weak');
      expect(classifyStatus(10, 0.1)).toBe('weak');
      expect(classifyStatus(10, 0.29)).toBe('weak');
    });
  });

  describe('[新仕様の意義] 1問正解で100%表示の誤誘導が起きない', () => {
    it('1問解いただけでは達成率が 0 → weak (旧仕様だと standard か strong だった)', () => {
      // 1問挑戦 + 1問正解だが、3連正解には届かないので masteryRate = 0
      expect(classifyStatus(1, 0)).toBe('weak');
    });

    it('全問題のうち 1問のみ達成 (例: 1/30 = 3.3%) → weak', () => {
      expect(classifyStatus(1, 1 / 30)).toBe('weak');
    });

    it('全問題のうち 10問達成 (10/30 = 33%) → standard', () => {
      expect(classifyStatus(10, 10 / 30)).toBe('standard');
    });

    it('全問題のうち 25問達成 (25/30 = 83%) → strong', () => {
      expect(classifyStatus(25, 25 / 30)).toBe('strong');
    });
  });

  describe('境界値', () => {
    it('masteryRate=0.7 ちょうどで strong (>= 70%)', () => {
      expect(classifyStatus(5, 0.7)).toBe('strong');
    });

    it('masteryRate=0.3 ちょうどで standard (>= 30%)', () => {
      expect(classifyStatus(5, 0.3)).toBe('standard');
    });

    it('masteryRate=0.299 で weak', () => {
      expect(classifyStatus(5, 0.299)).toBe('weak');
    });
  });
});
