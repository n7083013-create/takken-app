// ============================================================
// クロスデバイス同期マージ (mergeStats / mergeDailyLog /
// mergeCategoryStats / mergeQuickQuizStats) のリグレッションテスト
// ============================================================
//
// 背景:
// 旧実装は Last-Write-Wins (lastStudyAt 比較) で stats を採用していたため、
// PC のクロックが数秒進んでいるだけで「PC が最新」と判定され、モバイル更新が
// 永久に反映されないバグがあった (2026-05-23 ユーザー報告)。
//
// このテストはフィールドごとの保守的マージが期待通り動くことを保証する。
//
// 注意:
// - 累積カウンタは MAX (片方デバイスだけの記録を失わない)
// - dailyLog は日付ごとに MAX
// - lastStudyAt 系は新しい方
// - 二重カウントよりも「反映されない」リスクを最小化する設計

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../services/cloudSync', () => ({
  pullFromCloud: jest.fn(() => Promise.resolve(null)),
  pushProgressToCloud: jest.fn(() => Promise.resolve()),
  pushStatsToCloud: jest.fn(() => Promise.resolve()),
  mergeProgress: jest.fn((a: unknown) => a),
  markDirty: jest.fn(),
  resetSyncState: jest.fn(),
}));

jest.mock('../../services/errorLogger', () => ({
  logError: jest.fn(),
}));

jest.mock('../../services/notifications', () => ({
  refreshNotificationsAfterAnswer: jest.fn(() => Promise.resolve()),
}));

import {
  mergeStats,
  mergeDailyLog,
  mergeCategoryStats,
  mergeQuickQuizStats,
  type QuickQuizStats,
} from '../../store/useProgressStore';
import type { StudyStats } from '../../types';

const baseStats: StudyStats = {
  totalQuestions: 0,
  totalCorrect: 0,
  totalStudyTime: 0,
  streak: 0,
  longestStreak: 0,
  lastStudyAt: undefined,
  categoryStats: {
    kenri: { total: 0, correct: 0 },
    takkengyoho: { total: 0, correct: 0 },
    horei_seigen: { total: 0, correct: 0 },
    tax_other: { total: 0, correct: 0 },
  },
  dailyLog: {},
};

function makeStats(over: Partial<StudyStats> = {}): StudyStats {
  return { ...baseStats, ...over };
}

const baseQQ: QuickQuizStats = {
  total: 0,
  correct: 0,
  categoryStats: {
    kenri: { total: 0, correct: 0 },
    takkengyoho: { total: 0, correct: 0 },
    horei_seigen: { total: 0, correct: 0 },
    tax_other: { total: 0, correct: 0 },
  },
};

function makeQQ(over: Partial<QuickQuizStats> = {}): QuickQuizStats {
  return { ...baseQQ, ...over };
}

// ----------------------------------------------------------------
// mergeDailyLog
// ----------------------------------------------------------------

describe('mergeDailyLog - 日付ごとの MAX マージ', () => {
  test('両方空 → 空', () => {
    expect(mergeDailyLog({}, {})).toEqual({});
  });

  test('片方だけ値あり → そのまま採用', () => {
    expect(mergeDailyLog({ '2026-05-22': 5 }, {})).toEqual({ '2026-05-22': 5 });
    expect(mergeDailyLog({}, { '2026-05-22': 3 })).toEqual({ '2026-05-22': 3 });
  });

  test('同じ日に両方値あり → 大きい方を採用', () => {
    expect(
      mergeDailyLog({ '2026-05-22': 5 }, { '2026-05-22': 3 }),
    ).toEqual({ '2026-05-22': 5 });
    expect(
      mergeDailyLog({ '2026-05-22': 2 }, { '2026-05-22': 7 }),
    ).toEqual({ '2026-05-22': 7 });
  });

  test('異なる日付のキー → 両方残す', () => {
    const result = mergeDailyLog(
      { '2026-05-20': 4, '2026-05-21': 1 },
      { '2026-05-21': 6, '2026-05-22': 8 },
    );
    expect(result).toEqual({
      '2026-05-20': 4,
      '2026-05-21': 6, // MAX(1, 6)
      '2026-05-22': 8,
    });
  });

  test('undefined を渡しても空オブジェクトとして扱う', () => {
    expect(mergeDailyLog(undefined, { '2026-05-22': 3 })).toEqual({ '2026-05-22': 3 });
    expect(mergeDailyLog({ '2026-05-22': 3 }, undefined)).toEqual({ '2026-05-22': 3 });
  });

  test('0 と 5 は MAX で 5 を採用', () => {
    expect(mergeDailyLog({ '2026-05-22': 0 }, { '2026-05-22': 5 })).toEqual({ '2026-05-22': 5 });
  });
});

// ----------------------------------------------------------------
// mergeCategoryStats
// ----------------------------------------------------------------

describe('mergeCategoryStats - カテゴリごとの MAX マージ', () => {
  const empty = { kenri: { total: 0, correct: 0 }, takkengyoho: { total: 0, correct: 0 }, horei_seigen: { total: 0, correct: 0 }, tax_other: { total: 0, correct: 0 } };

  test('両方空 → 空', () => {
    expect(mergeCategoryStats(empty, empty)).toEqual(empty);
  });

  test('累積値は MAX (片方デバイスのみで解いた分を失わない)', () => {
    const a = { ...empty, kenri: { total: 10, correct: 7 } };
    const b = { ...empty, kenri: { total: 5, correct: 3 } };
    const result = mergeCategoryStats(a, b);
    expect(result.kenri).toEqual({ total: 10, correct: 7 });
  });

  test('異なるカテゴリで値あり → 両方反映', () => {
    const a = { ...empty, kenri: { total: 10, correct: 7 } };
    const b = { ...empty, takkengyoho: { total: 8, correct: 5 } };
    const result = mergeCategoryStats(a, b);
    expect(result.kenri).toEqual({ total: 10, correct: 7 });
    expect(result.takkengyoho).toEqual({ total: 8, correct: 5 });
  });

  test('正答数と総数で別個に MAX を取る', () => {
    // total は a が大きい、correct は b が大きいケース (再インストール直後の歪み)
    const a = { ...empty, kenri: { total: 20, correct: 10 } };
    const b = { ...empty, kenri: { total: 15, correct: 13 } };
    const result = mergeCategoryStats(a, b);
    expect(result.kenri).toEqual({ total: 20, correct: 13 });
  });
});

// ----------------------------------------------------------------
// mergeStats (統合)
// ----------------------------------------------------------------

describe('mergeStats - クロスデバイス stats マージ', () => {
  test('累積カウンタは MAX', () => {
    const local = makeStats({ totalQuestions: 100, totalCorrect: 70, totalStudyTime: 3600 });
    const remote = makeStats({ totalQuestions: 80, totalCorrect: 75, totalStudyTime: 4200 });
    const merged = mergeStats(local, remote);
    expect(merged.totalQuestions).toBe(100);
    expect(merged.totalCorrect).toBe(75);
    expect(merged.totalStudyTime).toBe(4200);
  });

  test('streak / longestStreak は MAX', () => {
    const local = makeStats({ streak: 5, longestStreak: 10 });
    const remote = makeStats({ streak: 7, longestStreak: 8 });
    const merged = mergeStats(local, remote);
    expect(merged.streak).toBe(7);
    expect(merged.longestStreak).toBe(10);
  });

  test('lastStudyAt は新しい方を採用', () => {
    const local = makeStats({ lastStudyAt: '2026-05-20T10:00:00Z' });
    const remote = makeStats({ lastStudyAt: '2026-05-22T15:30:00Z' });
    const merged = mergeStats(local, remote);
    expect(merged.lastStudyAt).toBe('2026-05-22T15:30:00Z');
  });

  test('lastStudyAt: ローカルが新しければローカル維持', () => {
    const local = makeStats({ lastStudyAt: '2026-05-22T15:30:00Z' });
    const remote = makeStats({ lastStudyAt: '2026-05-20T10:00:00Z' });
    const merged = mergeStats(local, remote);
    expect(merged.lastStudyAt).toBe('2026-05-22T15:30:00Z');
  });

  test('lastStudyAt: 片方 undefined ならもう片方を採用', () => {
    const local = makeStats({ lastStudyAt: undefined });
    const remote = makeStats({ lastStudyAt: '2026-05-22T15:30:00Z' });
    const merged = mergeStats(local, remote);
    expect(merged.lastStudyAt).toBe('2026-05-22T15:30:00Z');
  });

  test('dailyLog は日付ごとに MAX マージ', () => {
    const local = makeStats({ dailyLog: { '2026-05-22': 5, '2026-05-23': 3 } });
    const remote = makeStats({ dailyLog: { '2026-05-22': 2, '2026-05-23': 8 } });
    const merged = mergeStats(local, remote);
    expect(merged.dailyLog).toEqual({ '2026-05-22': 5, '2026-05-23': 8 });
  });

  test('categoryStats はカテゴリごとに MAX', () => {
    const local = makeStats({
      categoryStats: {
        ...baseStats.categoryStats,
        kenri: { total: 20, correct: 10 },
      },
    });
    const remote = makeStats({
      categoryStats: {
        ...baseStats.categoryStats,
        kenri: { total: 25, correct: 15 },
      },
    });
    const merged = mergeStats(local, remote);
    expect(merged.categoryStats.kenri).toEqual({ total: 25, correct: 15 });
  });

  test('streakFreezeCount は MAX (片方デバイスで取得した分を失わない)', () => {
    const local = makeStats({ streakFreezeCount: 1 });
    const remote = makeStats({ streakFreezeCount: 2 });
    const merged = mergeStats(local, remote);
    expect(merged.streakFreezeCount).toBe(2);
  });

  test('streakFreezeUsedAt / RefilledAt は新しい lastStudyAt 側を採用', () => {
    const local = makeStats({
      lastStudyAt: '2026-05-20T10:00:00Z',
      streakFreezeUsedAt: '2026-05-19',
      streakFreezeRefilledAt: '2026-05-15T00:00:00Z',
    });
    const remote = makeStats({
      lastStudyAt: '2026-05-22T15:00:00Z',
      streakFreezeUsedAt: '2026-05-21',
      streakFreezeRefilledAt: '2026-05-22T00:00:00Z',
    });
    const merged = mergeStats(local, remote);
    expect(merged.streakFreezeUsedAt).toBe('2026-05-21');
    expect(merged.streakFreezeRefilledAt).toBe('2026-05-22T00:00:00Z');
  });

  // ─── 回帰: ユーザー報告のシナリオ ────────────────────
  test('回帰: PC が後に更新 → モバイルの dailyLog 加算が失われない', () => {
    // モバイルが先に解答 → cloud に push
    const cloudFromMobile = makeStats({
      totalQuestions: 5,
      totalCorrect: 3,
      lastStudyAt: '2026-05-23T10:00:00Z',
      dailyLog: { '2026-05-23': 5 },
    });
    // PC が直後に解答 → PC のローカルは「自分の数値 + lastStudyAt 進む」
    const pcLocal = makeStats({
      totalQuestions: 2,        // PC 単独で解いた数 (cloud pull 前)
      totalCorrect: 1,
      lastStudyAt: '2026-05-23T10:05:00Z', // 5分遅い
      dailyLog: { '2026-05-23': 2 },
    });
    // syncWithCloud: PC が pull したとき、モバイルの 5 問が失われないか
    const merged = mergeStats(pcLocal, cloudFromMobile);
    expect(merged.totalQuestions).toBe(5); // MAX(2,5)
    expect(merged.dailyLog?.['2026-05-23']).toBe(5); // MAX(2,5) ← 旧 LWW では PC が新しいので 2 になっていた
  });

  test('回帰: PC のクロックが進んでいてもモバイル更新が反映される', () => {
    // PC は時計が 1 時間進んでいる
    const pcLocal = makeStats({
      totalQuestions: 3,
      lastStudyAt: '2026-05-23T11:30:00Z', // 実際は 10:30 だが PC は 11:30 と認識
      dailyLog: { '2026-05-23': 3 },
    });
    const cloudFromMobile = makeStats({
      totalQuestions: 10,
      lastStudyAt: '2026-05-23T10:45:00Z',
      dailyLog: { '2026-05-23': 10 },
    });
    const merged = mergeStats(pcLocal, cloudFromMobile);
    // 旧 LWW: PC が「新しい」と判定され → モバイル更新無視 → totalQuestions=3
    // 新 merge: MAX で 10 が採用される
    expect(merged.totalQuestions).toBe(10);
    expect(merged.dailyLog?.['2026-05-23']).toBe(10);
  });
});

// ----------------------------------------------------------------
// mergeQuickQuizStats
// ----------------------------------------------------------------

describe('mergeQuickQuizStats - 一問一答 stats マージ', () => {
  test('remote が null ならローカルそのまま', () => {
    const local = makeQQ({ total: 10, correct: 8 });
    const merged = mergeQuickQuizStats(local, null);
    expect(merged.total).toBe(10);
    expect(merged.correct).toBe(8);
  });

  test('累積 total / correct は MAX', () => {
    const local = makeQQ({ total: 10, correct: 7 });
    const remote = makeQQ({ total: 15, correct: 9 });
    const merged = mergeQuickQuizStats(local, remote);
    expect(merged.total).toBe(15);
    expect(merged.correct).toBe(9);
  });

  test('todayCount は今日の日付の値だけ MAX (古い todayDate は無視)', () => {
    const today = new Date().toISOString().slice(0, 10);
    const local = makeQQ({ todayCount: 3, todayDate: today });
    const remote = makeQQ({ todayCount: 5, todayDate: today });
    const merged = mergeQuickQuizStats(local, remote);
    expect(merged.todayCount).toBe(5);
    expect(merged.todayDate).toBe(today);
  });

  test('todayDate が古い片方は todayCount に寄与しない', () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const local = makeQQ({ todayCount: 99, todayDate: yesterday }); // 昨日のデータ
    const remote = makeQQ({ todayCount: 4, todayDate: today });
    const merged = mergeQuickQuizStats(local, remote);
    expect(merged.todayCount).toBe(4); // 昨日の 99 は無効、今日の 4 のみ
    expect(merged.todayDate).toBe(today);
  });

  test('両方とも今日でない → todayCount = 0 にリセット', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const local = makeQQ({ todayCount: 5, todayDate: yesterday });
    const remote = makeQQ({ todayCount: 3, todayDate: yesterday });
    const merged = mergeQuickQuizStats(local, remote);
    expect(merged.todayCount).toBe(0);
  });

  test('categoryStats は per-category, per-field で MAX', () => {
    const local = makeQQ({
      categoryStats: {
        kenri: { total: 5, correct: 3 },
        takkengyoho: { total: 2, correct: 1 },
        horei_seigen: { total: 0, correct: 0 },
        tax_other: { total: 0, correct: 0 },
      },
    });
    const remote = makeQQ({
      categoryStats: {
        kenri: { total: 4, correct: 4 }, // total が小 / correct が大
        takkengyoho: { total: 6, correct: 2 }, // total が大
        horei_seigen: { total: 3, correct: 2 },
        tax_other: { total: 0, correct: 0 },
      },
    });
    const merged = mergeQuickQuizStats(local, remote);
    expect(merged.categoryStats.kenri).toEqual({ total: 5, correct: 4 });
    expect(merged.categoryStats.takkengyoho).toEqual({ total: 6, correct: 2 });
    expect(merged.categoryStats.horei_seigen).toEqual({ total: 3, correct: 2 });
  });

  test('回帰: モバイル今日 5問 / PC 今日 2問 → PC sync 後に 5問 (モバイルが失われない)', () => {
    const today = new Date().toISOString().slice(0, 10);
    const pcLocal = makeQQ({ total: 2, correct: 1, todayCount: 2, todayDate: today });
    const cloudFromMobile = makeQQ({ total: 5, correct: 4, todayCount: 5, todayDate: today });
    const merged = mergeQuickQuizStats(pcLocal, cloudFromMobile);
    expect(merged.total).toBe(5);
    expect(merged.todayCount).toBe(5);
  });
});
