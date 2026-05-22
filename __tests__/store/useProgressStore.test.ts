// ============================================================
// useProgressStore - calculateStreak テスト
// 連続日 / 1日空き（フリーズ）/ 2日以上空き
// 同日重複呼び出し / DST境界の扱い
// ============================================================

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

import { useProgressStore } from '../../store/useProgressStore';

// 日付ヘルパー: 当日の特定時刻、前日、N日前を ISO で生成
function isoDaysAgo(days: number, hour = 12): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

describe('useProgressStore - streak', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress();
    jest.clearAllMocks();
  });

  // ----------------------------------------------------------
  // 1日目 (lastStudyAt なし) → streak=1
  // ----------------------------------------------------------
  describe('初日 (lastStudyAt なし)', () => {
    it('初回 recordAnswer で streak=1', () => {
      useProgressStore.getState().recordAnswer('q1', 'kenri', true, 'low');
      expect(useProgressStore.getState().stats.streak).toBe(1);
    });
  });

  // ----------------------------------------------------------
  // 連続日 (前日学習 → 翌日)
  // ----------------------------------------------------------
  describe('連続学習日（前日に学習済み）', () => {
    it('前日学習なら streak が +1 される', () => {
      useProgressStore.setState((s) => ({
        stats: {
          ...s.stats,
          streak: 5,
          lastStudyAt: isoDaysAgo(1),
        },
      }));
      useProgressStore.getState().recordAnswer('q1', 'kenri', true, 'low');
      expect(useProgressStore.getState().stats.streak).toBe(6);
    });

    it('longestStreak も伸びる', () => {
      useProgressStore.setState((s) => ({
        stats: {
          ...s.stats,
          streak: 5,
          longestStreak: 5,
          lastStudyAt: isoDaysAgo(1),
        },
      }));
      useProgressStore.getState().recordAnswer('q1', 'kenri', true, 'low');
      expect(useProgressStore.getState().stats.longestStreak).toBe(6);
    });
  });

  // ----------------------------------------------------------
  // 同日重複（同じ日に複数回学習）
  // ----------------------------------------------------------
  describe('同日重複呼び出し', () => {
    it('同日2回目 recordAnswer で streak は変わらない', () => {
      useProgressStore.getState().recordAnswer('q1', 'kenri', true, 'low');
      const first = useProgressStore.getState().stats.streak;
      useProgressStore.getState().recordAnswer('q2', 'kenri', true, 'low');
      const second = useProgressStore.getState().stats.streak;
      expect(second).toBe(first);
    });

    it('同日10回呼んでも streak は1', () => {
      for (let i = 0; i < 10; i++) {
        useProgressStore.getState().recordAnswer(`q${i}`, 'kenri', true, 'low');
      }
      expect(useProgressStore.getState().stats.streak).toBe(1);
    });
  });

  // ----------------------------------------------------------
  // 1日空き（フリーズなし）→ streak=1 にリセット
  // ----------------------------------------------------------
  describe('1日空き（フリーズなし）', () => {
    it('2日前学習 + フリーズ無 → streak=1', () => {
      useProgressStore.setState((s) => ({
        stats: {
          ...s.stats,
          streak: 7,
          lastStudyAt: isoDaysAgo(2),
          streakFreezeCount: 0,
          // refillStreakFreeze の自動補充を無効化するために最近補充済みとする
          streakFreezeRefilledAt: new Date().toISOString(),
        },
      }));
      useProgressStore.getState().recordAnswer('q1', 'kenri', true, 'low');
      expect(useProgressStore.getState().stats.streak).toBe(1);
    });
  });

  // ----------------------------------------------------------
  // 1日空き（フリーズあり）→ streak 維持
  // ----------------------------------------------------------
  describe('1日空き（フリーズあり）', () => {
    it('2日前学習 + フリーズ1個 → streak が +1 される', () => {
      useProgressStore.setState((s) => ({
        stats: {
          ...s.stats,
          streak: 7,
          lastStudyAt: isoDaysAgo(2),
          streakFreezeCount: 1,
          streakFreezeRefilledAt: new Date().toISOString(),
        },
      }));
      useProgressStore.getState().recordAnswer('q1', 'kenri', true, 'low');
      expect(useProgressStore.getState().stats.streak).toBe(8);
    });

    it('フリーズ消費で streakFreezeCount が 0 になる', () => {
      useProgressStore.setState((s) => ({
        stats: {
          ...s.stats,
          streak: 5,
          lastStudyAt: isoDaysAgo(2),
          streakFreezeCount: 1,
          streakFreezeRefilledAt: new Date().toISOString(),
        },
      }));
      useProgressStore.getState().recordAnswer('q1', 'kenri', true, 'low');
      expect(useProgressStore.getState().stats.streakFreezeCount).toBe(0);
    });
  });

  // ----------------------------------------------------------
  // 3日以上空き → streak=1（フリーズあっても1個では届かない）
  // ----------------------------------------------------------
  describe('3日以上空き', () => {
    it('3日前学習 + フリーズ1 → streak=1', () => {
      useProgressStore.setState((s) => ({
        stats: {
          ...s.stats,
          streak: 30,
          lastStudyAt: isoDaysAgo(3),
          streakFreezeCount: 1,
          streakFreezeRefilledAt: new Date().toISOString(),
        },
      }));
      useProgressStore.getState().recordAnswer('q1', 'kenri', true, 'low');
      expect(useProgressStore.getState().stats.streak).toBe(1);
    });

    it('7日前学習 → streak=1', () => {
      useProgressStore.setState((s) => ({
        stats: {
          ...s.stats,
          streak: 100,
          lastStudyAt: isoDaysAgo(7),
          streakFreezeRefilledAt: new Date().toISOString(),
        },
      }));
      useProgressStore.getState().recordAnswer('q1', 'kenri', true, 'low');
      expect(useProgressStore.getState().stats.streak).toBe(1);
    });
  });

  // ----------------------------------------------------------
  // フリーズ自動補充ロジック
  // ----------------------------------------------------------
  describe('streakFreezeCount 自動補充', () => {
    it('一度も補充されていない場合は 1 個から', () => {
      useProgressStore.setState((s) => ({
        stats: {
          ...s.stats,
          streak: 0,
          lastStudyAt: undefined,
          streakFreezeCount: 0,
          streakFreezeRefilledAt: undefined,
        },
      }));
      useProgressStore.getState().recordAnswer('q1', 'kenri', true, 'low');
      // 初日 + 補充 → streakFreezeCount=1
      expect(useProgressStore.getState().stats.streakFreezeCount).toBe(1);
    });

    it('1週間経過したら +1 される（最大2）', () => {
      useProgressStore.setState((s) => ({
        stats: {
          ...s.stats,
          streak: 0,
          lastStudyAt: undefined,
          streakFreezeCount: 1,
          streakFreezeRefilledAt: isoDaysAgo(8),
        },
      }));
      useProgressStore.getState().recordAnswer('q1', 'kenri', true, 'low');
      expect(useProgressStore.getState().stats.streakFreezeCount).toBe(2);
    });

    it('上限 2 個を超えない', () => {
      useProgressStore.setState((s) => ({
        stats: {
          ...s.stats,
          streak: 0,
          lastStudyAt: undefined,
          streakFreezeCount: 2,
          streakFreezeRefilledAt: isoDaysAgo(20),
        },
      }));
      useProgressStore.getState().recordAnswer('q1', 'kenri', true, 'low');
      expect(useProgressStore.getState().stats.streakFreezeCount).toBeLessThanOrEqual(2);
    });
  });

  // ----------------------------------------------------------
  // ヒートマップ用 dailyLog
  // ----------------------------------------------------------
  describe('dailyLog 更新', () => {
    it('recordAnswer で当日キーがインクリメントされる', () => {
      useProgressStore.getState().recordAnswer('q1', 'kenri', true, 'low');
      useProgressStore.getState().recordAnswer('q2', 'kenri', false, 'low');
      const log = useProgressStore.getState().getDailyLog();
      const todayKey = (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })();
      expect(log[todayKey]).toBe(2);
    });

    it('getTodayAnswered が dailyLog の当日値を返す (4択のみ・1問=1.0)', () => {
      useProgressStore.getState().recordAnswer('q1', 'kenri', true, 'low');
      expect(useProgressStore.getState().getTodayAnswered()).toBe(1);
    });
  });

  // ----------------------------------------------------------
  // [2026-05-22] 一問一答も今日の目標達成に寄与する (重み 0.2)
  // ----------------------------------------------------------
  describe('getTodayAnswered - 一問一答の重み 0.2 加算', () => {
    it('一問一答 1問 = 0.2 として加算される', () => {
      useProgressStore.getState().recordQuickQuizAnswer('qq1', 'kenri', true);
      // 4択 0問 + 一問一答 1問 × 0.2 = 0.2
      expect(useProgressStore.getState().getTodayAnswered()).toBeCloseTo(0.2, 5);
    });

    it('一問一答 5問 で 4択 1問と同等 (= 1.0)', () => {
      for (let i = 0; i < 5; i++) {
        useProgressStore.getState().recordQuickQuizAnswer(`qq${i}`, 'kenri', true);
      }
      expect(useProgressStore.getState().getTodayAnswered()).toBeCloseTo(1.0, 5);
    });

    it('4択 + 一問一答 の合算が正しい', () => {
      // 4択 3問
      useProgressStore.getState().recordAnswer('q1', 'kenri', true, 'low');
      useProgressStore.getState().recordAnswer('q2', 'kenri', true, 'low');
      useProgressStore.getState().recordAnswer('q3', 'kenri', false, 'low');
      // 一問一答 5問
      for (let i = 0; i < 5; i++) {
        useProgressStore.getState().recordQuickQuizAnswer(`qq${i}`, 'kenri', true);
      }
      // 3 + 5 × 0.2 = 4.0
      expect(useProgressStore.getState().getTodayAnswered()).toBeCloseTo(4.0, 5);
    });

    it('一問一答 10問でdailyGoal 2 と同等の進捗 (10 × 0.2 = 2.0)', () => {
      // 「達成感のなさ」原因はここ: 旧仕様だと一問一答 10問解いても getTodayAnswered=0 だった
      for (let i = 0; i < 10; i++) {
        useProgressStore.getState().recordQuickQuizAnswer(`qq${i}`, 'kenri', true);
      }
      expect(useProgressStore.getState().getTodayAnswered()).toBeCloseTo(2.0, 5);
    });

    it('getTodayFourChoiceCount は一問一答を含まない (raw 4択)', () => {
      // フリーミアム 4択 10問/日 判定で使うので、一問一答が混ざってはいけない
      useProgressStore.getState().recordAnswer('q1', 'kenri', true, 'low');
      useProgressStore.getState().recordAnswer('q2', 'kenri', true, 'low');
      useProgressStore.getState().recordQuickQuizAnswer('qq1', 'kenri', true);
      useProgressStore.getState().recordQuickQuizAnswer('qq2', 'kenri', true);
      expect(useProgressStore.getState().getTodayFourChoiceCount()).toBe(2);
    });

    it('一問一答だけ解いても getTodayFourChoiceCount は 0', () => {
      useProgressStore.getState().recordQuickQuizAnswer('qq1', 'kenri', true);
      useProgressStore.getState().recordQuickQuizAnswer('qq2', 'kenri', true);
      expect(useProgressStore.getState().getTodayFourChoiceCount()).toBe(0);
    });
  });

  // ----------------------------------------------------------
  // resetProgress
  // ----------------------------------------------------------
  describe('resetProgress', () => {
    it('progress / stats / quickQuizStats が初期化される', () => {
      useProgressStore.getState().recordAnswer('q1', 'kenri', true, 'low');
      useProgressStore.getState().resetProgress();
      const state = useProgressStore.getState();
      expect(Object.keys(state.progress)).toHaveLength(0);
      expect(state.stats.totalQuestions).toBe(0);
      expect(state.stats.streak).toBe(0);
    });
  });

  // ----------------------------------------------------------
  // toggleBookmark
  // ----------------------------------------------------------
  describe('toggleBookmark', () => {
    it('未解答問題でもブックマーク可能', () => {
      useProgressStore.getState().toggleBookmark('q-new');
      const p = useProgressStore.getState().progress['q-new'];
      expect(p).toBeDefined();
      expect(p.bookmarked).toBe(true);
      expect(p.attempts).toBe(0);
    });

    it('再度トグルで解除', () => {
      useProgressStore.getState().toggleBookmark('q-new');
      useProgressStore.getState().toggleBookmark('q-new');
      expect(useProgressStore.getState().progress['q-new'].bookmarked).toBe(false);
    });
  });
});

// ============================================================
// [新仕様 2026-05] mastered (ユーザー手動卒業) のテスト
// ============================================================
describe('useProgressStore - mastered (手動卒業)', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress();
    jest.clearAllMocks();
  });

  it('markAsMastered: 未解答問題でも mastered フラグを立てられる', () => {
    useProgressStore.getState().markAsMastered('q-new');
    const p = useProgressStore.getState().progress['q-new'];
    expect(p).toBeDefined();
    expect(p.mastered).toBe(true);
    expect(p.attempts).toBe(0);
  });

  it('既存進捗にマスター付与: 既存データは保持されつつ mastered=true', () => {
    useProgressStore.getState().recordAnswer('q1', 'kenri', true, 'low');
    useProgressStore.getState().markAsMastered('q1');
    const p = useProgressStore.getState().progress['q1'];
    expect(p.attempts).toBeGreaterThan(0);
    expect(p.mastered).toBe(true);
  });

  it('unmarkMastered: mastered=false に戻る', () => {
    useProgressStore.getState().markAsMastered('q1');
    useProgressStore.getState().unmarkMastered('q1');
    expect(useProgressStore.getState().progress['q1'].mastered).toBe(false);
  });

  it('unmarkMastered: 存在しない questionId に対しては何もしない', () => {
    expect(() => useProgressStore.getState().unmarkMastered('q-nope')).not.toThrow();
    expect(useProgressStore.getState().progress['q-nope']).toBeUndefined();
  });

  it('getManuallyMasteredIds: mastered=true の questionId 一覧を返す', () => {
    useProgressStore.getState().markAsMastered('q1');
    useProgressStore.getState().markAsMastered('q2');
    useProgressStore.getState().markAsMastered('q3');
    useProgressStore.getState().unmarkMastered('q2');
    const ids = useProgressStore.getState().getManuallyMasteredIds();
    expect(ids).toEqual(expect.arrayContaining(['q1', 'q3']));
    expect(ids).not.toContain('q2');
    expect(ids.length).toBe(2);
  });
});

// ============================================================
// [新仕様 2026-05] getWeakQuestions の判定基準
// ============================================================
describe('useProgressStore - getWeakQuestions (苦手リスト判定)', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress();
    jest.clearAllMocks();
  });

  it('正答率 < 50% の問題は苦手リストに含まれる', () => {
    useProgressStore.getState().recordAnswer('q1', 'kenri', false);
    useProgressStore.getState().recordAnswer('q1', 'kenri', false);
    useProgressStore.getState().recordAnswer('q1', 'kenri', true);
    // 3回中 1正解 = 33.3% → 苦手
    expect(useProgressStore.getState().getWeakQuestions()).toContain('q1');
  });

  it('正答率 >= 50% は苦手リストに含まれない', () => {
    useProgressStore.getState().recordAnswer('q1', 'kenri', true);
    useProgressStore.getState().recordAnswer('q1', 'kenri', true);
    useProgressStore.getState().recordAnswer('q1', 'kenri', false);
    // 3回中 2正解 = 66.6% → 苦手ではない
    expect(useProgressStore.getState().getWeakQuestions()).not.toContain('q1');
  });

  it('未解答 (attempts=0) は苦手リストに含まれない', () => {
    useProgressStore.getState().toggleBookmark('q-new');
    expect(useProgressStore.getState().getWeakQuestions()).not.toContain('q-new');
  });

  it('[新仕様] 3連正解 (correctStreak >= 3) で苦手リストから卒業 - 累計正答率<50%でも', () => {
    // 累計正答率を 50% 未満に維持しつつ 3連正解 → 卒業させる
    useProgressStore.getState().recordAnswer('q1', 'kenri', false);
    useProgressStore.getState().recordAnswer('q1', 'kenri', false);
    useProgressStore.getState().recordAnswer('q1', 'kenri', false);
    useProgressStore.getState().recordAnswer('q1', 'kenri', false);
    useProgressStore.getState().recordAnswer('q1', 'kenri', false);
    // 5回中 0正解 = 0% → 苦手判定
    expect(useProgressStore.getState().getWeakQuestions()).toContain('q1');

    // 3連正解で卒業 (累計 3/8 = 37.5% < 50% でも streak >= 3 で卒業)
    useProgressStore.getState().recordAnswer('q1', 'kenri', true);
    useProgressStore.getState().recordAnswer('q1', 'kenri', true);
    useProgressStore.getState().recordAnswer('q1', 'kenri', true);
    expect(useProgressStore.getState().getWeakQuestions()).not.toContain('q1');
  });

  it('[新仕様] 不正解で correctStreak リセット → 累計正答率<50%なら再度苦手に戻る', () => {
    // 過去に多く間違え → 3連正解で卒業
    useProgressStore.getState().recordAnswer('q1', 'kenri', false);
    useProgressStore.getState().recordAnswer('q1', 'kenri', false);
    useProgressStore.getState().recordAnswer('q1', 'kenri', false);
    useProgressStore.getState().recordAnswer('q1', 'kenri', true);
    useProgressStore.getState().recordAnswer('q1', 'kenri', true);
    useProgressStore.getState().recordAnswer('q1', 'kenri', true);
    expect(useProgressStore.getState().getWeakQuestions()).not.toContain('q1');
    // 不正解で streak リセット
    useProgressStore.getState().recordAnswer('q1', 'kenri', false);
    // 累計 7回中 3正解 = 42.8% < 50% → 苦手に戻る
    expect(useProgressStore.getState().getWeakQuestions()).toContain('q1');
  });

  it('[新仕様] mastered=true は苦手リストから除外', () => {
    useProgressStore.getState().recordAnswer('q1', 'kenri', false);
    useProgressStore.getState().recordAnswer('q1', 'kenri', false);
    expect(useProgressStore.getState().getWeakQuestions()).toContain('q1');
    useProgressStore.getState().markAsMastered('q1');
    expect(useProgressStore.getState().getWeakQuestions()).not.toContain('q1');
  });

  it('[新仕様] mastered を解除すると元の苦手判定に戻る', () => {
    useProgressStore.getState().recordAnswer('q1', 'kenri', false);
    useProgressStore.getState().recordAnswer('q1', 'kenri', false);
    useProgressStore.getState().markAsMastered('q1');
    expect(useProgressStore.getState().getWeakQuestions()).not.toContain('q1');
    useProgressStore.getState().unmarkMastered('q1');
    expect(useProgressStore.getState().getWeakQuestions()).toContain('q1');
  });
});

// ============================================================
// [新仕様 2026-05] getDueForReview で mastered 除外
// ============================================================
describe('useProgressStore - getDueForReview (復習対象)', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress();
    jest.clearAllMocks();
  });

  it('nextReviewAt が過去の問題は復習対象に含まれる', () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    useProgressStore.setState({
      progress: {
        q1: {
          questionId: 'q1',
          attempts: 1,
          correctCount: 0,
          correctStreak: 0,
          lastAttemptAt: past,
          bookmarked: false,
          nextReviewAt: past,
          easeFactor: 2.5,
          interval: 1,
        },
      },
    });
    expect(useProgressStore.getState().getDueForReview()).toContain('q1');
  });

  it('未解答 (attempts=0) は復習対象外', () => {
    useProgressStore.getState().toggleBookmark('q-new');
    expect(useProgressStore.getState().getDueForReview()).not.toContain('q-new');
  });

  it('[新仕様] mastered=true は復習対象から除外', () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    useProgressStore.setState({
      progress: {
        q1: {
          questionId: 'q1',
          attempts: 1,
          correctCount: 1,
          correctStreak: 1,
          lastAttemptAt: past,
          bookmarked: false,
          nextReviewAt: past,
          easeFactor: 2.5,
          interval: 1,
        },
      },
    });
    expect(useProgressStore.getState().getDueForReview()).toContain('q1');
    useProgressStore.getState().markAsMastered('q1');
    expect(useProgressStore.getState().getDueForReview()).not.toContain('q1');
  });

  it('[新仕様] mastered を解除すると復習対象に戻る', () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    useProgressStore.setState({
      progress: {
        q1: {
          questionId: 'q1',
          attempts: 1,
          correctCount: 1,
          correctStreak: 1,
          lastAttemptAt: past,
          bookmarked: false,
          nextReviewAt: past,
          easeFactor: 2.5,
          interval: 1,
          mastered: true,
        },
      },
    });
    expect(useProgressStore.getState().getDueForReview()).not.toContain('q1');
    useProgressStore.getState().unmarkMastered('q1');
    expect(useProgressStore.getState().getDueForReview()).toContain('q1');
  });
});

// ============================================================
// [Phase 1.3] first_question_answered コンバージョン発火
// 初回正解 (stats.totalCorrect === 0 → 1) のタイミングのみ発火
// ============================================================
// services/analytics をモック (動的 import が呼ぶ)
jest.mock('../../services/analytics', () => ({
  trackEvent: jest.fn(),
}));

describe('useProgressStore - first_question_answered (アクティベーション計測)', () => {
  beforeEach(() => {
    useProgressStore.getState().resetProgress();
    jest.clearAllMocks();
  });

  it('初回正解時に trackEvent("first_question_answered") が発火する', async () => {
    const { trackEvent } = require('../../services/analytics');
    useProgressStore.getState().recordAnswer('q1', 'kenri', true);
    // 動的 import の resolve を待つ
    await new Promise((r) => setImmediate(r));
    expect(trackEvent).toHaveBeenCalledWith('first_question_answered', expect.objectContaining({
      value: 1,
      currency: 'JPY',
    }));
  });

  it('2回目の正解では発火しない (totalCorrect が 0 から始まらないため)', async () => {
    const { trackEvent } = require('../../services/analytics');
    useProgressStore.getState().recordAnswer('q1', 'kenri', true);
    await new Promise((r) => setImmediate(r));
    (trackEvent as jest.Mock).mockClear();
    useProgressStore.getState().recordAnswer('q2', 'kenri', true);
    await new Promise((r) => setImmediate(r));
    expect(trackEvent).not.toHaveBeenCalledWith(
      'first_question_answered',
      expect.anything(),
    );
  });

  it('不正解では発火しない', async () => {
    const { trackEvent } = require('../../services/analytics');
    useProgressStore.getState().recordAnswer('q1', 'kenri', false);
    await new Promise((r) => setImmediate(r));
    expect(trackEvent).not.toHaveBeenCalledWith(
      'first_question_answered',
      expect.anything(),
    );
  });

  it('不正解の後に初回正解 → 発火する', async () => {
    const { trackEvent } = require('../../services/analytics');
    useProgressStore.getState().recordAnswer('q1', 'kenri', false);
    useProgressStore.getState().recordAnswer('q2', 'kenri', false);
    await new Promise((r) => setImmediate(r));
    (trackEvent as jest.Mock).mockClear();
    useProgressStore.getState().recordAnswer('q3', 'kenri', true);
    await new Promise((r) => setImmediate(r));
    expect(trackEvent).toHaveBeenCalledWith(
      'first_question_answered',
      expect.objectContaining({ value: 1, currency: 'JPY' }),
    );
  });
});
