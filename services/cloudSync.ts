// ============================================================
// クラウド同期
// ローカル進捗 ⇄ Supabase question_progress / study_stats
// 戦略: Last-Write-Wins (updated_at 比較)
// ============================================================

import { supabase, isSupabaseConfigured } from './supabase';
import { logError } from './errorLogger';
import type { QuestionProgress, StudyStats } from '../types';

// ── Delta sync: track which records changed since last sync ──
let lastSyncTimestamp: string | null = null;
const dirtyIds = new Set<string>();

/** Mark a question as modified so it will be included in the next push */
export function markDirty(questionId: string): void {
  dirtyIds.add(questionId);
}

const UPSERT_CHUNK_SIZE = 200;

interface PullResult {
  progress: Record<string, QuestionProgress>;
  stats: StudyStats | null;
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
        }
      : null;

    // Update sync timestamp after successful pull
    lastSyncTimestamp = new Date().toISOString();

    return { progress, stats };
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
