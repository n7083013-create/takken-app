// ============================================================
// AI 学習プラン取得サービス
// /api/study-plan へのプロキシ + AsyncStorage 24h キャッシュ
// ============================================================
//
// 設計:
//  - サーバー応答 (StudyPlan JSON) を 24時間キャッシュして無駄なAI呼出を抑制
//  - キャッシュ判定: 24時間 OR 試験日変更 OR ユーザー切替
//  - 強制再生成は forceRefresh=true で
//  - Web/Native 両対応 (AsyncStorage は React Native Web で動く)
//  - エラーは throw、UI 側で try/catch
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../store/useAuthStore';
import { useProgressStore } from '../store/useProgressStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { ALL_QUESTIONS } from '../data';
import { Category, SUBCATEGORIES } from '../types';
import { API_BASE_URL } from '../constants/config';
import { logError } from './errorLogger';

const CACHE_KEY_PREFIX = '@takken_study_plan_v1_';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24時間
const FETCH_TIMEOUT_MS = 25_000;

export type StudyPlanTaskType = 'weak' | 'review' | 'new' | 'mock';

export interface StudyPlanTask {
  title: string;
  description: string;
  questionCount: number;
  type: StudyPlanTaskType;
}

export interface StudyPlan {
  today: StudyPlanTask[];
  weekFocus: { category: string; reason: string };
  roadmap: Array<{ daysUntilExam: number; goal: string }>;
  message: string;
  generatedAt: string;
}

export interface StudyPlanResult {
  plan: StudyPlan;
  remaining: number | null;
  fromCache: boolean;
}

interface CacheEnvelope {
  plan: StudyPlan;
  cachedAt: string;
  examDateKey: string;
}

/**
 * 現在のクライアント状態を集約してサーバーに送るスナップショットを生成
 */
export function buildUserStatsSnapshot() {
  const progressStore = useProgressStore.getState();
  const settingsStore = useSettingsStore.getState();
  const stats = progressStore.stats;
  const progress = progressStore.progress;

  // カテゴリ別正答率（解いた問題の中での比率）
  const categories: Category[] = ['kenri', 'takkengyoho', 'horei_seigen', 'tax_other'];
  const categoryAccuracy = {} as Record<Category, number>;
  for (const cat of categories) {
    const c = stats.categoryStats[cat];
    categoryAccuracy[cat] = c.total > 0 ? c.correct / c.total : 0;
  }

  // 弱点サブカテゴリ（getWeakAreaDrill のロジックを流用）
  const weakSubcategories: Array<{ label: string; accuracy: number }> = [];
  for (const cat of categories) {
    for (const sc of SUBCATEGORIES[cat]) {
      const qs = ALL_QUESTIONS.filter(
        (q) => q.category === cat && q.tags.some((t) => sc.matchTags.includes(t)),
      );
      if (qs.length === 0) continue;
      let totalAcc = 0;
      let attempted = 0;
      for (const q of qs) {
        const p = progress[q.id];
        if (p && p.attempts > 0) {
          attempted++;
          totalAcc += p.correctCount / p.attempts;
        }
      }
      const accuracy = attempted > 0 ? totalAcc / attempted : 0;
      // attempted が 0 の場合は弱点扱いしない（データ不足）
      if (attempted >= 2) {
        weakSubcategories.push({ label: sc.label, accuracy });
      }
    }
  }
  weakSubcategories.sort((a, b) => a.accuracy - b.accuracy);
  const topWeaks = weakSubcategories.slice(0, 5);

  // 直近30日の学習量
  const dailyLog = stats.dailyLog ?? {};
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  let recent30dAnswered = 0;
  for (const [dateKey, count] of Object.entries(dailyLog)) {
    const [y, m, d] = dateKey.split('-').map(Number);
    const t = new Date(y, m - 1, d).getTime();
    if (t >= thirtyDaysAgo) recent30dAnswered += Number(count) || 0;
  }

  const daysUntilExam = settingsStore.getDaysUntilExam() ?? 0;
  const overallAccuracy = stats.totalQuestions > 0 ? stats.totalCorrect / stats.totalQuestions : 0;

  return {
    daysUntilExam,
    categoryAccuracy,
    weakSubcategories: topWeaks,
    recent30dAnswered,
    dailyGoal: settingsStore.settings.dailyGoal,
    streak: stats.streak,
    totalAnswered: stats.totalQuestions,
    overallAccuracy,
  };
}

function getCacheKey(userId: string): string {
  return `${CACHE_KEY_PREFIX}${userId}`;
}

function getExamDateKey(): string {
  return useSettingsStore.getState().settings.examDate ?? 'unknown';
}

/** キャッシュ取得（期限切れ・他ユーザーは無視） */
async function readCache(userId: string): Promise<StudyPlan | null> {
  try {
    const raw = await AsyncStorage.getItem(getCacheKey(userId));
    if (!raw) return null;
    const env = JSON.parse(raw) as CacheEnvelope;
    if (!env?.plan || !env?.cachedAt) return null;
    const age = Date.now() - new Date(env.cachedAt).getTime();
    if (age >= CACHE_TTL_MS || age < 0) return null;
    if (env.examDateKey !== getExamDateKey()) return null;
    return env.plan;
  } catch (e) {
    logError(e, { context: 'studyPlan.readCache' });
    return null;
  }
}

async function writeCache(userId: string, plan: StudyPlan): Promise<void> {
  try {
    const env: CacheEnvelope = {
      plan,
      cachedAt: new Date().toISOString(),
      examDateKey: getExamDateKey(),
    };
    await AsyncStorage.setItem(getCacheKey(userId), JSON.stringify(env));
  } catch (e) {
    logError(e, { context: 'studyPlan.writeCache' });
  }
}

/** キャッシュをクリア（ログアウト時など） */
export async function clearStudyPlanCache(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(getCacheKey(userId));
  } catch (e) {
    logError(e, { context: 'studyPlan.clearCache' });
  }
}

/**
 * 学習プランを取得
 * @param forceRefresh true で常にサーバー再生成（キャッシュ無視）
 */
export async function fetchStudyPlan(forceRefresh = false): Promise<StudyPlanResult> {
  const session = useAuthStore.getState().session;
  const user = useAuthStore.getState().user;
  if (!session?.access_token || !user) {
    throw new Error('ログインが必要です。');
  }

  // キャッシュ確認
  if (!forceRefresh) {
    const cached = await readCache(user.id);
    if (cached) {
      return { plan: cached, remaining: null, fromCache: true };
    }
  }

  const snapshot = buildUserStatsSnapshot();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/study-plan`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ userStatsSnapshot: snapshot }),
    });
  } catch (e: any) {
    clearTimeout(timeoutId);
    if (e?.name === 'AbortError') {
      throw new Error('AI 学習プラン生成がタイムアウトしました。もう一度お試しください。');
    }
    throw new Error('ネットワークエラー: AIサービスに接続できません。');
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error('セッションが切れました。再ログインしてください。');
    if (res.status === 429) {
      const code = data?.code;
      if (code === 'cooldown') throw new Error(data?.error || 'プラン生成は5分に1回までです。');
      if (code === 'limit_reached') throw new Error(data?.error || '本日の利用上限に達しました。');
      throw new Error(data?.error || 'リクエストが多すぎます。少し待ってからお試しください。');
    }
    throw new Error(data?.error || 'AI 学習プランの取得に失敗しました。');
  }

  const data = (await res.json()) as { plan: StudyPlan; remaining: number };
  if (!data?.plan) throw new Error('AI 応答が不完全でした。');

  await writeCache(user.id, data.plan);
  // サーバー応答に基づいてローカル AI 残回数も更新（チャットと共通カウンタ）
  if (typeof data.remaining === 'number') {
    try {
      useSettingsStore.getState().setAIRemainingFromServer(data.remaining);
    } catch (e) {
      logError(e, { context: 'studyPlan.setAIRemaining' });
    }
  }

  return { plan: data.plan, remaining: data.remaining ?? null, fromCache: false };
}

/** キャッシュのみ取得（ホームの即時表示用 — ネット遅延を避ける） */
export async function getCachedStudyPlan(userId: string): Promise<StudyPlan | null> {
  return readCache(userId);
}
