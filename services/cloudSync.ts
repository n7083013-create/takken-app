// ============================================================
// クラウド同期
// ローカル進捗 ⇄ Supabase question_progress / study_stats
// 戦略: Last-Write-Wins (updated_at 比較)
// ============================================================

import { supabase, isSupabaseConfigured } from './supabase';
import { logError } from './errorLogger';
import type { QuestionProgress, StudyStats, ExamResult, QuestMissionProgress } from '../types';

// ── Delta sync: track which records changed since last sync ──
// SECURITY: ユーザー切替で前ユーザーの dirty 状態が次ユーザーに混入する事故を防ぐため
//           userId と紐付けて管理する。signOut/別ユーザーログイン時に必ず resetSyncState() を呼ぶ
let lastSyncTimestamp: string | null = null;
let syncOwnerUserId: string | null = null;
const dirtyIds = new Set<string>();

/** Mark a question as modified so it will be included in the next push */
export function markDirty(questionId: string): void {
  dirtyIds.add(questionId);
}

/**
 * sync 状態を完全リセット（ログアウト/別ユーザー切替時に必須）
 * これを呼ばないと前ユーザーの dirtyIds や lastSyncTimestamp が
 * 次ユーザーのクラウドに混入する。
 */
export function resetSyncState(): void {
  lastSyncTimestamp = null;
  syncOwnerUserId = null;
  dirtyIds.clear();
}

const UPSERT_CHUNK_SIZE = 200;

interface PullResult {
  progress: Record<string, QuestionProgress>;
  stats: StudyStats | null;
  /** study_stats.quick_quiz_stats カラムのまま返す（型は store 側で解釈）*/
  quickQuizStats: unknown;
}

/**
 * クラウドからすべての学習データを取得
 */
export async function pullFromCloud(userId: string): Promise<PullResult | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    // ── Paginated fetch for question_progress ──
    const PAGE_SIZE = 1000;
    let allProgressRows: any[] = [];
    let page = 0;
    while (true) {
      const { data, error } = await supabase
        .from('question_progress')
        .select('*')
        .eq('user_id', userId)
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allProgressRows = allProgressRows.concat(data);
      if (data.length < PAGE_SIZE) break;
      page++;
    }

    // ── study_stats (single row, no pagination needed) ──
    const statsRes = await supabase
      .from('study_stats')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (statsRes.error) throw statsRes.error;

    const progress: Record<string, QuestionProgress> = {};
    allProgressRows.forEach((row: any) => {
      progress[row.question_id] = {
        questionId: row.question_id,
        attempts: row.attempts,
        correctCount: row.correct_count,
        correctStreak: row.correct_streak ?? 0,
        lastAttemptAt: row.last_attempt_at,
        bookmarked: row.bookmarked,
        nextReviewAt: row.next_review_at,
        easeFactor: Number(row.ease_factor),
        interval: row.interval_days,
        lastConfidence: row.last_confidence ?? undefined,
      };
    });

    const statsRow = statsRes.data as any;
    const stats: StudyStats | null = statsRow
      ? {
          totalQuestions: statsRow.total_questions,
          totalCorrect: statsRow.total_correct,
          totalStudyTime: statsRow.total_study_time,
          streak: statsRow.streak,
          longestStreak: statsRow.longest_streak,
          lastStudyAt: statsRow.last_study_at ?? undefined,
          categoryStats: statsRow.category_stats ?? {},
          dailyLog: statsRow.daily_log ?? {},
          streakFreezeCount: statsRow.streak_freeze_count ?? 0,
          streakFreezeUsedAt: statsRow.streak_freeze_used_at ?? undefined,
          streakFreezeRefilledAt: statsRow.streak_freeze_refilled_at ?? undefined,
        }
      : null;

    // Update sync timestamp after successful pull (owner-bound)
    lastSyncTimestamp = new Date().toISOString();
    syncOwnerUserId = userId;

    return { progress, stats, quickQuizStats: statsRow?.quick_quiz_stats ?? null };
  } catch (e) {
    logError(e, { context: 'cloudSync.pull' });
    return null;
  }
}

/**
 * ローカル進捗をクラウドに upsert
 */
export async function pushProgressToCloud(
  userId: string,
  progress: Record<string, QuestionProgress>,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  // SECURITY: 別ユーザーが所有していた dirty 状態を新ユーザーで push してはいけない
  // syncOwnerUserId が違えば dirty を捨てて初回扱い
  if (syncOwnerUserId !== null && syncOwnerUserId !== userId) {
    resetSyncState();
  }
  // [安全装置 CRITICAL] 空 progress を絶対に送信しない (Data Wipe Disaster 防止)
  // 再インストール直後など、ローカルが完全に空の状態で push が走ると、
  // クラウドにあった既存データが誤上書きされる災害シナリオを物理的に止める。
  // 「データを消したい」場合は別途 delete API を経由すべき。
  if (!progress || Object.keys(progress).length === 0) {
    return true;
  }
  try {
    // Delta sync: only push dirty records (or all on first sync)
    const values = dirtyIds.size > 0
      ? Object.values(progress).filter((p) => dirtyIds.has(p.questionId))
      : lastSyncTimestamp === null
        ? Object.values(progress)  // First sync: push everything
        : [];                       // Nothing dirty, nothing to push

    const rows = values.map((p) => ({
      user_id: userId,
      question_id: p.questionId,
      attempts: p.attempts,
      correct_count: p.correctCount,
      correct_streak: p.correctStreak ?? 0,
      last_attempt_at: p.lastAttemptAt,
      bookmarked: p.bookmarked,
      next_review_at: p.nextReviewAt,
      ease_factor: p.easeFactor,
      interval_days: p.interval,
      last_confidence: p.lastConfidence ?? null,
      updated_at: new Date().toISOString(),
    }));
    if (rows.length === 0) return true;

    // Batch upsert in chunks of UPSERT_CHUNK_SIZE to avoid oversized requests
    for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
      const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE);
      const { error } = await supabase.from('question_progress').upsert(chunk);
      if (error) throw error;
    }

    // Successful push: clear dirty set and update timestamp
    dirtyIds.clear();
    lastSyncTimestamp = new Date().toISOString();
    syncOwnerUserId = userId;
    return true;
  } catch (e) {
    logError(e, { context: 'cloudSync.pushProgress' });
    return false;
  }
}

/**
 * ローカル統計をクラウドに upsert
 */
export async function pushStatsToCloud(
  userId: string,
  stats: StudyStats,
  quickQuizStats: unknown,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  // [安全装置 CRITICAL] 初期値 (totalQuestions === 0) を絶対に push しない
  // 再インストール直後にローカル統計がデフォルト(0)で初期化されている時、
  // クラウドにあった既存統計を 0 で上書きする災害を防ぐ。
  // ユーザーが実際に問題を解いていれば totalQuestions > 0 になる。
  if (!stats || (stats.totalQuestions === 0 && stats.totalCorrect === 0)) {
    return true;
  }
  try {
    const { error } = await supabase.from('study_stats').upsert({
      user_id: userId,
      total_questions: stats.totalQuestions,
      total_correct: stats.totalCorrect,
      total_study_time: stats.totalStudyTime,
      streak: stats.streak,
      longest_streak: stats.longestStreak,
      last_study_at: stats.lastStudyAt ?? null,
      category_stats: stats.categoryStats,
      daily_log: stats.dailyLog ?? {},
      streak_freeze_count: stats.streakFreezeCount ?? 0,
      streak_freeze_used_at: stats.streakFreezeUsedAt ?? null,
      streak_freeze_refilled_at: stats.streakFreezeRefilledAt ?? null,
      quick_quiz_stats: quickQuizStats,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return true;
  } catch (e) {
    logError(e, { context: 'cloudSync.pushStats' });
    return false;
  }
}

/**
 * マージ戦略: フィールドごとの賢いマージ
 *
 * - attempts / correctCount → MAX（学習量は多い方が正しい）
 * - bookmarked → OR（どちらかで付けていれば残す）
 * - lastAttemptAt → 新しい方
 * - correctStreak / nextReviewAt / easeFactor / interval / lastConfidence
 *   → lastAttemptAt が新しいレコード側を採用（SM-2 状態は最新解答に従う）
 */
export function mergeProgress(
  local: Record<string, QuestionProgress>,
  remote: Record<string, QuestionProgress>,
): Record<string, QuestionProgress> {
  const merged = { ...local };

  Object.keys(remote).forEach((qid) => {
    const r = remote[qid];
    const l = merged[qid];

    // ローカルに存在しない問題はリモートをそのまま採用
    if (!l) {
      merged[qid] = r;
      return;
    }

    // lastAttemptAt が新しい方を「最新レコード」として SM-2 状態を採る
    const localIsNewer = new Date(l.lastAttemptAt) >= new Date(r.lastAttemptAt);
    const newer = localIsNewer ? l : r;

    merged[qid] = {
      questionId: qid,
      // 累積値: 多い方を採用（片方のデバイスだけで解いた分を失わない）
      attempts: Math.max(l.attempts, r.attempts),
      correctCount: Math.max(l.correctCount, r.correctCount),
      // ブックマーク: どちらかで付けていれば残す
      bookmarked: l.bookmarked || r.bookmarked,
      // 時系列: 新しい方
      lastAttemptAt: newer.lastAttemptAt,
      // SM-2 状態: 最新解答のレコードに従う
      correctStreak: newer.correctStreak,
      nextReviewAt: newer.nextReviewAt,
      easeFactor: newer.easeFactor,
      interval: newer.interval,
      lastConfidence: newer.lastConfidence,
    };
  });

  return merged;
}

// ============================================================
// [Phase 2] 実績 / 模試 / クエスト のクラウド同期
// ============================================================
//
// 以下の3関数群を追加。いずれも空ガード付きでデータ破壊を防止。
// テーブル: achievements_progress / exam_history / quest_progress
//   (supabase/migrations/011_engagement_sync.sql で定義)

// -------------------- 実績 (achievements) --------------------

/**
 * 実績解除状況をクラウドから取得
 * @returns { achievementId: unlockedAt } の Record、エラー時 null
 */
export async function pullAchievementsFromCloud(
  userId: string,
): Promise<Record<string, string> | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data, error } = await supabase
      .from('achievements_progress')
      .select('achievement_id, unlocked_at')
      .eq('user_id', userId);
    if (error) throw error;
    const result: Record<string, string> = {};
    (data ?? []).forEach((row: { achievement_id: string; unlocked_at: string }) => {
      result[row.achievement_id] = row.unlocked_at;
    });
    return result;
  } catch (e) {
    logError(e, { context: 'cloudSync.pullAchievements' });
    return null;
  }
}

/**
 * 解除済み実績をクラウドに upsert
 * 空オブジェクトの場合は no-op (空でクラウドを上書きする災害を防ぐ)
 */
export async function pushAchievementsToCloud(
  userId: string,
  unlocked: Record<string, string>,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  // [安全装置] 空 push 禁止
  if (!unlocked || Object.keys(unlocked).length === 0) {
    return true;
  }
  try {
    const rows = Object.entries(unlocked).map(([achievementId, unlockedAt]) => ({
      user_id: userId,
      achievement_id: achievementId,
      unlocked_at: unlockedAt,
    }));
    const { error } = await supabase.from('achievements_progress').upsert(rows);
    if (error) throw error;
    return true;
  } catch (e) {
    logError(e, { context: 'cloudSync.pushAchievements' });
    return false;
  }
}

/**
 * ローカルとクラウドの実績をマージ (両方の解除状態を保持、unlocked_at は古い方を優先)
 * = 「先に解除した記録」を残す
 */
export function mergeAchievements(
  local: Record<string, string>,
  remote: Record<string, string>,
): Record<string, string> {
  const merged: Record<string, string> = { ...local };
  Object.keys(remote).forEach((id) => {
    if (!merged[id]) {
      merged[id] = remote[id];
    } else {
      // 両方ある場合は古い方 (先に解除した記録) を残す
      merged[id] = new Date(merged[id]) < new Date(remote[id]) ? merged[id] : remote[id];
    }
  });
  return merged;
}

// -------------------- 模試 (exam_history, append-only) --------------------

/**
 * 模試の受験履歴をクラウドから取得
 */
export async function pullExamHistoryFromCloud(
  userId: string,
): Promise<ExamResult[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data, error } = await supabase
      .from('exam_history')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      id: row.id,
      date: row.date,
      score: row.score,
      total: row.total,
      passed: row.passed,
      byCategory: row.by_category,
      durationSec: row.duration_sec,
    }));
  } catch (e) {
    logError(e, { context: 'cloudSync.pullExamHistory' });
    return null;
  }
}

/**
 * 模試結果をクラウドに insert (append-only、UPDATE しない)
 * 単一レコード版。模試完了時に呼ぶ。
 */
export async function pushExamResultToCloud(
  userId: string,
  result: ExamResult,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  if (!result || !result.id) return false;
  try {
    const { error } = await supabase.from('exam_history').upsert({
      id: result.id,
      user_id: userId,
      date: result.date,
      score: result.score,
      total: result.total,
      passed: result.passed,
      by_category: result.byCategory,
      duration_sec: result.durationSec,
    });
    if (error) throw error;
    return true;
  } catch (e) {
    logError(e, { context: 'cloudSync.pushExamResult' });
    return false;
  }
}

/**
 * ローカル/リモートの模試履歴を id ベースでマージ (重複排除、append-only)
 */
export function mergeExamHistory(
  local: ExamResult[],
  remote: ExamResult[],
): ExamResult[] {
  const byId = new Map<string, ExamResult>();
  [...remote, ...local].forEach((r) => {
    if (r && r.id) byId.set(r.id, r);
  });
  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
}

// -------------------- クエスト (quest_progress) --------------------

/**
 * クエスト進捗をクラウドから取得
 */
export async function pullQuestProgressFromCloud(
  userId: string,
): Promise<Record<string, QuestMissionProgress> | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data, error } = await supabase
      .from('quest_progress')
      .select('*')
      .eq('user_id', userId);
    if (error) throw error;
    const result: Record<string, QuestMissionProgress> = {};
    (data ?? []).forEach((row: any) => {
      result[row.mission_id] = {
        missionId: row.mission_id,
        bestScore: row.best_score,
        attempts: row.attempts,
        completedAt: row.completed_at ?? undefined,
        lastAttemptAt: row.last_attempt_at ?? undefined,
      };
    });
    return result;
  } catch (e) {
    logError(e, { context: 'cloudSync.pullQuestProgress' });
    return null;
  }
}

/**
 * クエスト進捗をクラウドに upsert
 * 空オブジェクトの場合は no-op
 */
export async function pushQuestProgressToCloud(
  userId: string,
  missionProgress: Record<string, QuestMissionProgress>,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  // [安全装置] 空 push 禁止
  if (!missionProgress || Object.keys(missionProgress).length === 0) {
    return true;
  }
  try {
    const rows = Object.values(missionProgress).map((p) => ({
      user_id: userId,
      mission_id: p.missionId,
      best_score: p.bestScore,
      attempts: p.attempts,
      completed_at: p.completedAt ?? null,
      last_attempt_at: p.lastAttemptAt ?? null,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('quest_progress').upsert(rows);
    if (error) throw error;
    return true;
  } catch (e) {
    logError(e, { context: 'cloudSync.pushQuestProgress' });
    return false;
  }
}

/**
 * ローカル/リモートのクエスト進捗をマージ
 * 各ミッションごとに「より進んだ方 (bestScore + attempts が多い)」を採用
 */
export function mergeQuestProgress(
  local: Record<string, QuestMissionProgress>,
  remote: Record<string, QuestMissionProgress>,
): Record<string, QuestMissionProgress> {
  const merged: Record<string, QuestMissionProgress> = { ...local };
  Object.keys(remote).forEach((id) => {
    const l = merged[id];
    const r = remote[id];
    if (!l) {
      merged[id] = r;
      return;
    }
    merged[id] = {
      missionId: id,
      // bestScore は MAX (頑張った結果を失わない)
      bestScore: Math.max(l.bestScore, r.bestScore),
      // attempts は MAX (片方のデバイスでのみ挑戦した分も合算しない、重複の方が安全)
      attempts: Math.max(l.attempts, r.attempts),
      // completedAt: どちらかで完了していれば早い方を残す
      completedAt: l.completedAt && r.completedAt
        ? (new Date(l.completedAt) < new Date(r.completedAt) ? l.completedAt : r.completedAt)
        : (l.completedAt ?? r.completedAt),
      // lastAttemptAt: 新しい方
      lastAttemptAt: l.lastAttemptAt && r.lastAttemptAt
        ? (new Date(l.lastAttemptAt) > new Date(r.lastAttemptAt) ? l.lastAttemptAt : r.lastAttemptAt)
        : (l.lastAttemptAt ?? r.lastAttemptAt),
    };
  });
  return merged;
}
