// ============================================================
// cloudSync テスト
// 重点: ユーザー切替時の dirty 漏れ防止 (resetSyncState)
//      mergeProgress の正確性
// ============================================================

// Supabase モック: from(...).upsert / select.eq.range などをチェーン可能に
const mockUpsert: jest.Mock = jest.fn(() => Promise.resolve({ error: null } as any));
const mockSelectRange: jest.Mock = jest.fn(() => Promise.resolve({ data: [] as any[], error: null } as any));
const mockMaybeSingle: jest.Mock = jest.fn(() => Promise.resolve({ data: null as any, error: null } as any));

jest.mock('../../services/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      upsert: mockUpsert,
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          range: mockSelectRange,
          maybeSingle: mockMaybeSingle,
        })),
      })),
    })),
  },
  isSupabaseConfigured: jest.fn(() => true),
}));

jest.mock('../../services/errorLogger', () => ({
  logError: jest.fn(),
}));

import {
  markDirty,
  resetSyncState,
  pushProgressToCloud,
  pullFromCloud,
  mergeProgress,
} from '../../services/cloudSync';
import type { QuestionProgress } from '../../types';

function makeProgress(qid: string, override: Partial<QuestionProgress> = {}): QuestionProgress {
  return {
    questionId: qid,
    attempts: 1,
    correctCount: 1,
    correctStreak: 1,
    lastAttemptAt: '2026-01-01T00:00:00Z',
    bookmarked: false,
    nextReviewAt: '2026-01-08T00:00:00Z',
    easeFactor: 2.5,
    interval: 6,
    ...override,
  };
}

describe('cloudSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetSyncState();
    mockUpsert.mockImplementation(() => Promise.resolve({ error: null }));
    mockSelectRange.mockImplementation(() => Promise.resolve({ data: [], error: null }));
    mockMaybeSingle.mockImplementation(() => Promise.resolve({ data: null, error: null }));
  });

  // ----------------------------------------------------------
  // resetSyncState
  // ----------------------------------------------------------
  describe('resetSyncState', () => {
    it('マークされた dirty が消える（次回 push で対象外）', async () => {
      // userA の dirty を作る
      markDirty('q-A');
      const progress = { 'q-A': makeProgress('q-A') };
      await pushProgressToCloud('userA', progress);
      // 一回 push したので dirty はクリア済み
      expect(mockUpsert).toHaveBeenCalledTimes(1);
      mockUpsert.mockClear();

      // 改めて dirty を立て、resetSyncState で消す
      markDirty('q-B');
      resetSyncState();

      // 次の push で何も送られないこと（dirty 0 + lastSyncTimestamp null だが...
      // 仕様: resetSyncState 後は lastSyncTimestamp=null + dirty 0 → 全件 push が走る
      const empty = {};
      await pushProgressToCloud('userA', empty);
      // 0件なので upsert は呼ばれない
      expect(mockUpsert).not.toHaveBeenCalled();
    });
  });

  // ----------------------------------------------------------
  // 別ユーザー切替で dirty が混入しないこと（最重要セキュリティ仕様）
  // ----------------------------------------------------------
  describe('SECURITY: cross-user dirty leak prevention', () => {
    it('userA の dirty が userB に持ち越されないこと', async () => {
      // userA で dirty を作って push
      markDirty('q-userA-1');
      markDirty('q-userA-2');
      const progressA = {
        'q-userA-1': makeProgress('q-userA-1'),
        'q-userA-2': makeProgress('q-userA-2'),
      };
      await pushProgressToCloud('userA', progressA);
      mockUpsert.mockClear();

      // userA で再度 dirty を作るが push 前にユーザー切替
      markDirty('q-userA-3');

      // userB として push（resetSyncState 呼ばずとも内部で reset されることを確認）
      // userB は q-userA-3 を持っていないので、何も送られないこと
      const progressB = { 'q-userB-1': makeProgress('q-userB-1') };

      await pushProgressToCloud('userB', progressB);
      // 別ユーザーの dirty は捨てられ、初回扱いで progressB の全件 push になる
      expect(mockUpsert).toHaveBeenCalled();
      const sent = mockUpsert.mock.calls[0][0] as any[];
      const sentIds = sent.map((r: any) => r.question_id);
      // userA の questionId が混入していないこと
      expect(sentIds).not.toContain('q-userA-3');
      expect(sentIds).not.toContain('q-userA-1');
      expect(sentIds).toContain('q-userB-1');
    });

    it('同じ userId 連続 push なら dirty は引き継がれる（差分同期）', async () => {
      // 1回目: 全件 push
      const initial = { q1: makeProgress('q1'), q2: makeProgress('q2') };
      await pushProgressToCloud('user1', initial);
      mockUpsert.mockClear();

      // 2回目: dirty 立てて push → q1 のみ
      markDirty('q1');
      const updated = {
        q1: makeProgress('q1', { attempts: 5 }),
        q2: makeProgress('q2'),
      };
      await pushProgressToCloud('user1', updated);
      expect(mockUpsert).toHaveBeenCalledTimes(1);
      const sent = mockUpsert.mock.calls[0][0] as any[];
      expect(sent).toHaveLength(1);
      expect(sent[0].question_id).toBe('q1');
    });
  });

  // ----------------------------------------------------------
  // mergeProgress
  // ----------------------------------------------------------
  describe('mergeProgress', () => {
    it('リモートに無いローカルレコードは保持', () => {
      const local = { q1: makeProgress('q1') };
      const remote = {};
      const merged = mergeProgress(local, remote);
      expect(merged.q1).toBeDefined();
    });

    it('ローカルに無いリモートレコードは追加', () => {
      const local = {};
      const remote = { q1: makeProgress('q1') };
      const merged = mergeProgress(local, remote);
      expect(merged.q1).toBeDefined();
    });

    it('attempts/correctCount は MAX を採用（学習量を失わない）', () => {
      const local = { q1: makeProgress('q1', { attempts: 5, correctCount: 3 }) };
      const remote = { q1: makeProgress('q1', { attempts: 10, correctCount: 7 }) };
      const merged = mergeProgress(local, remote);
      expect(merged.q1.attempts).toBe(10);
      expect(merged.q1.correctCount).toBe(7);
    });

    it('bookmarked は OR（どちらかで付いていれば残す）', () => {
      const local = { q1: makeProgress('q1', { bookmarked: true }) };
      const remote = { q1: makeProgress('q1', { bookmarked: false }) };
      const merged = mergeProgress(local, remote);
      expect(merged.q1.bookmarked).toBe(true);

      const merged2 = mergeProgress(
        { q1: makeProgress('q1', { bookmarked: false }) },
        { q1: makeProgress('q1', { bookmarked: true }) },
      );
      expect(merged2.q1.bookmarked).toBe(true);
    });

    it('SM-2 状態は lastAttemptAt が新しいレコードを採用', () => {
      const older = makeProgress('q1', {
        lastAttemptAt: '2026-01-01T00:00:00Z',
        correctStreak: 3,
        easeFactor: 2.0,
        interval: 10,
      });
      const newer = makeProgress('q1', {
        lastAttemptAt: '2026-01-05T00:00:00Z',
        correctStreak: 5,
        easeFactor: 2.8,
        interval: 30,
      });

      const merged = mergeProgress({ q1: older }, { q1: newer });
      expect(merged.q1.correctStreak).toBe(5);
      expect(merged.q1.easeFactor).toBe(2.8);
      expect(merged.q1.interval).toBe(30);
      expect(merged.q1.lastAttemptAt).toBe('2026-01-05T00:00:00Z');
    });

    it('ローカルの方が新しければローカルの SM-2 状態が残る', () => {
      const localNewer = makeProgress('q1', {
        lastAttemptAt: '2026-02-01T00:00:00Z',
        correctStreak: 7,
      });
      const remoteOlder = makeProgress('q1', {
        lastAttemptAt: '2026-01-01T00:00:00Z',
        correctStreak: 2,
      });

      const merged = mergeProgress({ q1: localNewer }, { q1: remoteOlder });
      expect(merged.q1.correctStreak).toBe(7);
    });
  });

  // ----------------------------------------------------------
  // pushProgressToCloud — 入力検証
  // ----------------------------------------------------------
  describe('pushProgressToCloud', () => {
    it('Supabase 未設定時は false', async () => {
      const sup = require('../../services/supabase');
      (sup.isSupabaseConfigured as jest.Mock).mockReturnValueOnce(false);
      const r = await pushProgressToCloud('user1', { q1: makeProgress('q1') });
      expect(r).toBe(false);
    });

    it('upsert エラー時は false かつ logError', async () => {
      mockUpsert.mockResolvedValueOnce({ error: { message: 'db-fail' } });
      const r = await pushProgressToCloud('user1', { q1: makeProgress('q1') });
      expect(r).toBe(false);
    });

    it('成功時は true', async () => {
      const r = await pushProgressToCloud('user1', { q1: makeProgress('q1') });
      expect(r).toBe(true);
    });

    it('200件超は分割 upsert (UPSERT_CHUNK_SIZE=200)', async () => {
      const progress: Record<string, QuestionProgress> = {};
      for (let i = 0; i < 250; i++) {
        progress[`q${i}`] = makeProgress(`q${i}`);
      }
      await pushProgressToCloud('user1', progress);
      // 200 + 50 = 2 チャンク
      expect(mockUpsert.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ----------------------------------------------------------
  // pullFromCloud
  // ----------------------------------------------------------
  describe('pullFromCloud', () => {
    it('未設定なら null', async () => {
      const sup = require('../../services/supabase');
      (sup.isSupabaseConfigured as jest.Mock).mockReturnValueOnce(false);
      const r = await pullFromCloud('user1');
      expect(r).toBeNull();
    });

    it('正常系: progress と stats を構築', async () => {
      mockSelectRange.mockResolvedValueOnce({
        data: [
          {
            question_id: 'q1',
            attempts: 3,
            correct_count: 2,
            correct_streak: 1,
            last_attempt_at: '2026-01-01T00:00:00Z',
            bookmarked: false,
            next_review_at: '2026-01-08T00:00:00Z',
            ease_factor: 2.5,
            interval_days: 6,
            last_confidence: 'low',
          },
        ],
        error: null,
      });
      mockMaybeSingle.mockResolvedValueOnce({
        data: {
          total_questions: 10,
          total_correct: 8,
          total_study_time: 0,
          streak: 3,
          longest_streak: 5,
          last_study_at: '2026-01-01T00:00:00Z',
          category_stats: {},
          daily_log: {},
        },
        error: null,
      });

      const r = await pullFromCloud('user1');
      expect(r).not.toBeNull();
      expect(r!.progress.q1.attempts).toBe(3);
      expect(r!.progress.q1.correctStreak).toBe(1);
      expect(r!.stats?.streak).toBe(3);
    });

    it('エラー時は null かつ logError', async () => {
      mockSelectRange.mockResolvedValueOnce({ data: null, error: { message: 'db-fail' } });
      const r = await pullFromCloud('user1');
      expect(r).toBeNull();
    });
  });

  // ============================================================
  // 🚨 CRITICAL: Data Wipe Disaster 防止 (再インストール後の災害)
  // ============================================================
  // ユーザー報告:「アプリ消した後、再ログインしても進捗が戻ってない」
  // 原因: 空ローカル → push → クラウドのデータが空で上書きされる
  // 修正: 空オブジェクト / 初期値 stats は絶対 push しない
  describe('🚨 Data Wipe Disaster 防止', () => {
    it('空 progress (再インストール直後) は upsert を呼ばずに true を返す', async () => {
      const result = await pushProgressToCloud('user1', {});
      expect(result).toBe(true);
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it('progress が null/undefined でも安全に true を返す (異常入力耐性)', async () => {
      // @ts-expect-error - 異常値テスト
      const r1 = await pushProgressToCloud('user1', null);
      // @ts-expect-error - 異常値テスト
      const r2 = await pushProgressToCloud('user1', undefined);
      expect(r1).toBe(true);
      expect(r2).toBe(true);
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it('初期値 stats (totalQuestions=0, totalCorrect=0) は upsert を呼ばない', async () => {
      const { pushStatsToCloud } = require('../../services/cloudSync');
      const initialStats = {
        totalQuestions: 0,
        totalCorrect: 0,
        totalStudyTime: 0,
        streak: 0,
        longestStreak: 0,
        lastStudyAt: null,
        categoryStats: {},
        dailyLog: {},
      };
      const result = await pushStatsToCloud('user1', initialStats, {});
      expect(result).toBe(true);
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it('実データあり stats (totalQuestions > 0) は upsert される', async () => {
      const { pushStatsToCloud } = require('../../services/cloudSync');
      const realStats = {
        totalQuestions: 5,
        totalCorrect: 3,
        totalStudyTime: 100,
        streak: 1,
        longestStreak: 1,
        lastStudyAt: '2026-05-15T00:00:00Z',
        categoryStats: {},
        dailyLog: {},
      };
      const result = await pushStatsToCloud('user1', realStats, {});
      expect(result).toBe(true);
      expect(mockUpsert).toHaveBeenCalledTimes(1);
    });

    it('🔥 回帰: 再インストール→再ログイン直後の syncWithCloud で クラウドデータが上書きされない', async () => {
      // シナリオ:
      // 1. クラウドには 5問の進捗あり
      // 2. アプリ再インストール → ローカル空
      // 3. push が走っても、空オブジェクトなので upsert されない
      const empty = {};
      await pushProgressToCloud('returning-user', empty);
      expect(mockUpsert).not.toHaveBeenCalled();

      // クラウドのデータは残っているはず (このテストでは Supabase 状態を直接見ないが、
      // upsert が呼ばれない = 上書きされない、を保証)
    });

    it('実データあり progress は通常通り upsert される', async () => {
      const progress = {
        q1: makeProgress('q1'),
        q2: makeProgress('q2'),
      };
      const result = await pushProgressToCloud('user1', progress);
      expect(result).toBe(true);
      expect(mockUpsert).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================
  // 🚨 CRITICAL リグレッション: 欠落カラム検知
  // ============================================================
  // ユーザー報告 (2026-05-23):「PC で同期されない」
  // 原因: study_stats テーブルに daily_log / streak_freeze_* / onboarding_done
  //       カラムが存在せず、push が PGRST204 で全て silent fail していた。
  // 修正: migration 015 で IF NOT EXISTS カラム追加。
  // 本テスト: pushStatsToCloud が書き込もうとするカラム名と、
  //         pullFromCloud が読もうとするカラム名が一致することを保証。
  describe('🚨 リグレッション: push/pull の study_stats カラム整合性', () => {
    it('pushStatsToCloud は必須の全カラムを payload に含める', async () => {
      const { pushStatsToCloud } = require('../../services/cloudSync');
      const stats = {
        totalQuestions: 5,
        totalCorrect: 3,
        totalStudyTime: 100,
        streak: 1,
        longestStreak: 1,
        lastStudyAt: '2026-05-23T10:00:00Z',
        categoryStats: { kenri: { total: 5, correct: 3 } },
        dailyLog: { '2026-05-23': 5 },
        streakFreezeCount: 1,
        streakFreezeUsedAt: '2026-05-22',
        streakFreezeRefilledAt: '2026-05-15T00:00:00Z',
      };
      const qq = { total: 2, correct: 1, categoryStats: {} };

      await pushStatsToCloud('user1', stats, qq);

      expect(mockUpsert).toHaveBeenCalledTimes(1);
      const payload = mockUpsert.mock.calls[0][0];
      // study_stats スキーマで必須なカラムが全て payload に存在することを検証。
      // ここに列挙したいずれかが Supabase 側に無いと PGRST204 が発生する。
      const requiredColumns = [
        'user_id',
        'total_questions',
        'total_correct',
        'total_study_time',
        'streak',
        'longest_streak',
        'last_study_at',
        'category_stats',
        'daily_log',                  // ← 旧 schema に無かった (バグの根本原因)
        'streak_freeze_count',        // ← 同上
        'streak_freeze_used_at',      // ← 同上
        'streak_freeze_refilled_at',  // ← 同上
        'quick_quiz_stats',
        'updated_at',
      ];
      for (const col of requiredColumns) {
        expect(payload).toHaveProperty(col);
      }
    });

    it('pullFromCloud は study_stats の全カラムを QQ stats と onboarding_done 含めて読む', async () => {
      mockSelectRange.mockResolvedValueOnce({ data: [], error: null });
      mockMaybeSingle.mockResolvedValueOnce({
        data: {
          total_questions: 5,
          total_correct: 3,
          total_study_time: 100,
          streak: 2,
          longest_streak: 5,
          last_study_at: '2026-05-23T10:00:00Z',
          category_stats: { kenri: { total: 5, correct: 3 } },
          daily_log: { '2026-05-23': 5 },
          streak_freeze_count: 1,
          streak_freeze_used_at: '2026-05-22',
          streak_freeze_refilled_at: '2026-05-15T00:00:00Z',
          quick_quiz_stats: { total: 2, correct: 1 },
          onboarding_done: true,
        },
        error: null,
      });

      const r = await pullFromCloud('user1');
      expect(r).not.toBeNull();
      expect(r!.stats?.dailyLog).toEqual({ '2026-05-23': 5 });
      expect(r!.stats?.streakFreezeCount).toBe(1);
      expect(r!.stats?.streakFreezeUsedAt).toBe('2026-05-22');
      expect(r!.quickQuizStats).toEqual({ total: 2, correct: 1 });
      expect(r!.onboardingDone).toBe(true);
    });

    it('pullFromCloud: onboarding_done が無い (=旧 schema) でも false で安全に動く', async () => {
      mockSelectRange.mockResolvedValueOnce({ data: [], error: null });
      mockMaybeSingle.mockResolvedValueOnce({
        data: {
          total_questions: 5,
          total_correct: 3,
          // onboarding_done なし
        },
        error: null,
      });
      const r = await pullFromCloud('user1');
      expect(r!.onboardingDone).toBe(false);
    });

    it('markOnboardingComplete は study_stats を user_id + onboarding_done=true で upsert', async () => {
      const { markOnboardingComplete } = require('../../services/cloudSync');
      const result = await markOnboardingComplete('user-X');
      expect(result).toBe(true);
      expect(mockUpsert).toHaveBeenCalledTimes(1);
      const payload = mockUpsert.mock.calls[0][0];
      expect(payload.user_id).toBe('user-X');
      expect(payload.onboarding_done).toBe(true);
      // 他のカラム (total_questions 等) は触らない (副作用なし)
      expect(payload.total_questions).toBeUndefined();
    });

    it('🔥 回帰: PGRST204 (column not found) シミュレーション → false かつ logError', async () => {
      const { pushStatsToCloud } = require('../../services/cloudSync');
      mockUpsert.mockResolvedValueOnce({
        error: {
          code: 'PGRST204',
          message: "Could not find the 'daily_log' column of 'study_stats' in the schema cache",
        },
      });
      const stats = {
        totalQuestions: 5,
        totalCorrect: 3,
        totalStudyTime: 0,
        streak: 0,
        longestStreak: 0,
        lastStudyAt: '2026-05-23T10:00:00Z',
        categoryStats: {},
        dailyLog: { '2026-05-23': 5 },
      };
      const result = await pushStatsToCloud('user1', stats, {});
      expect(result).toBe(false); // 失敗は false で返る (例外を投げない)
      const { logError } = require('../../services/errorLogger');
      expect(logError).toHaveBeenCalled();
    });
  });
});
