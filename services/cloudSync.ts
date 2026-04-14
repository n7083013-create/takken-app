// ============================================================
// クラウド同期
// ローカル進捗 ⇄ Supabase question_progress / study_stats
// 戦略: Last-Write-Wins (updated_at 比較)
// ============================================================

import { supabase, isSupabaseConfigured } from './supabase';
import { logError } from './errorLogger';
import type { QuestionProgress, StudyStats } from '../types';

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
    const [progRes, statsRes] = await Promise.all([
      supabase.from('question_progress').select('*').eq('user_id', userId),
      supabase.from('study_stats').select('*').eq('user_id', userId).maybeSingle(),
    ]);

    if (progRes.error) throw progRes.error;
    if (statsRes.error) throw statsRes.error;

    const progress: Record<string, QuestionProgress> = {};
    (progRes.data ?? []).forEach((row: any) => {
      progress[row.question_id] = {
        questionId: row.question_id,
        attempts: row.attempts,
        correctCount: row.correct_count,
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
    const rows = Object.values(progress).map((p) => ({
      user_id: userId,
      question_id: p.questionId,
      attempts: p.attempts,
      correct_count: p.correctCount,
      last_attempt_at: p.lastAttemptAt,
      bookmarked: p.bookmarked,
      next_review_at: p.nextReviewAt,
      ease_factor: p.easeFactor,
      interval_days: p.interval,
      updated_at: new Date().toISOString(),
    }));
    if (rows.length === 0) return true;
    const { error } = await supabase.from('question_progress').upsert(rows);
    if (error) throw error;
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
 * マージ戦略: lastAttemptAt の新しい方を採用
 */
export function mergeProgress(
  local: Record<string, QuestionProgress>,
  remote: Record<string, QuestionProgress>,
): Record<string, QuestionProgress> {
  const merged = { ...local };
  Object.keys(remote).forEach((qid) => {
    const r = remote[qid];
    const l = merged[qid];
    if (!l || new Date(r.lastAttemptAt) > new Date(l.lastAttemptAt)) {
      merged[qid] = r;
    }
  });
  return merged;
}
