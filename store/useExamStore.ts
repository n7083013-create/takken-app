// ============================================================
// 宅建士 完全対策 - 模擬試験ストア
// 本試験形式: 50問 / 120分 (権利14 + 宅建業法20 + 法令8 + 税その他8)
// ============================================================

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Question, Category, ExamResult, SUBCATEGORIES } from '../types';
import { ALL_QUESTIONS, getExamByYear, getMockPresetByNumber, getRandomMockExam } from '../data';
import { logError } from '../services/errorLogger';
import {
  pullExamHistoryFromCloud,
  pushExamResultToCloud,
  mergeExamHistory,
} from '../services/cloudSync';
import { EXAM_ALLOCATION, PASS_LINE, DIFFICULTY_DISTRIBUTION } from '../constants/exam';

const STORAGE_KEY = '@takken_exam_session';
const HISTORY_KEY = '@takken_exam_history';

// O(1) lookup map — avoids repeated ALL_QUESTIONS.find() in hot paths
const questionMap = new Map(ALL_QUESTIONS.map((q) => [q.id, q]));

export const EXAM_DURATION_SEC = 120 * 60; // 120分
/** @deprecated EXAM_ALLOCATION from constants/exam を使用してください */
export const EXAM_COMPOSITION = EXAM_ALLOCATION;

export interface ExamSession {
  id: string;
  startedAt: string;
  endedAt?: string;
  questionIds: string[];
  answers: Record<string, number>; // questionId -> chosen index
  flagged: string[];               // marked for review
  remainingSec: number;
  submitted: boolean;
}

interface ExamState {
  current: ExamSession | null;
  examHistory: ExamResult[];

  startExam(): ExamSession;
  /**
   * 弱点模試: 本試験配分（14/20/8/8）と難易度分布は維持しつつ、
   * 各カテゴリ内で苦手サブカテゴリの問題を優先して選出する
   * @param weakQuestionIds 苦手とされる問題ID集合（progressStore から渡す）
   */
  startWeaknessExam(weakQuestionIds: string[]): ExamSession;
  startYearExam(year: number): ExamSession;
  /** 模擬試験プリセット (1始まり) を開始。「模擬1」「模擬2」等のラベルで提示する用。 */
  startMockPreset(presetNumber: number): ExamSession;
  /** ランダムシャッフル模擬を開始。全模擬を解いた人向け。 */
  startRandomMock(): ExamSession;
  answerQuestion(qid: string, choiceIndex: number): void;
  toggleFlag(qid: string): void;
  tickTimer(deltaSec: number): void;
  submitExam(): ExamSession;
  resumeExam(): Promise<ExamSession | null>;
  abandonExam(): void;
  saveSession(): Promise<void>;
  loadHistory(): Promise<void>;
  saveHistory(): Promise<void>;
  syncWithCloud(userId: string): Promise<void>;  // [Phase 2] クラウド同期
  pushNewResult(userId: string, result: ExamResult): Promise<void>;  // [Phase 2] 即時 push
  getExamHistory(): ExamResult[];
  getBestScore(): number;
  getLatestScore(): number | null;
  getScoreTrend(): number[];
  /** 直近 N 回の模試で出題された問題IDを返す（重複出題回避用） */
  getRecentQuestionIds(lastN?: number): Set<string>;
  /** 問題ストック不足を検出: 不足している (category, difficulty) を返す */
  checkStockSufficiency(): Array<{ category: Category; difficulty: 1 | 2 | 3; have: number; need: number }>;
  resetStore(): void;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 各カテゴリで必要な難易度別配分を算出。
 * 端数は最大配分の難易度（d2: 標準）に寄せる。
 */
function difficultyQuotaFor(needed: number): Record<1 | 2 | 3, number> {
  const q1 = Math.round(needed * DIFFICULTY_DISTRIBUTION[1]);
  const q3 = Math.round(needed * DIFFICULTY_DISTRIBUTION[3]);
  const q2 = needed - q1 - q3;
  return { 1: q1, 2: q2, 3: q3 };
}

/**
 * プールから quota 件をランダム抽出。プールが足りない場合は不足分を
 * 隣接難易度から補充して "全体の問題数" を維持する（本試験50問は厳守）。
 */
function pickFromPool(
  pool: Question[],
  quota: number,
  exclude: Set<string>,
  weight?: (q: Question) => number,
): Question[] {
  const available = pool.filter((q) => !exclude.has(q.id));
  if (available.length === 0) return [];
  if (weight) {
    // weight が大きいほど選ばれやすい（弱点優先）。同点はランダム。
    const ranked = available
      .map((q) => ({ q, score: weight(q) + Math.random() * 0.001 }))
      .sort((a, b) => b.score - a.score);
    return ranked.slice(0, Math.min(quota, ranked.length)).map((r) => r.q);
  }
  return shuffle(available).slice(0, Math.min(quota, available.length));
}

/**
 * 本試験配分（14/20/8/8）と難易度分布（40/45/15）を厳守して 50 問を選定。
 * - exclude: 直近の模試で出題された問題ID（重複回避）
 * - weightById: 弱点モード用の重み（高いほど優先）
 */
function pickExamQuestions(
  exclude: Set<string> = new Set(),
  weightById?: Map<string, number>,
): string[] {
  const ids: string[] = [];
  const pickedSet = new Set<string>();

  (Object.keys(EXAM_COMPOSITION) as Category[]).forEach((cat) => {
    const needed = EXAM_COMPOSITION[cat];
    const quota = difficultyQuotaFor(needed);
    const catPool = ALL_QUESTIONS.filter((q) => q.category === cat);

    let collected: Question[] = [];
    ([1, 2, 3] as const).forEach((d) => {
      const subPool = catPool.filter((q) => q.difficulty === d);
      const weight = weightById ? (q: Question) => weightById.get(q.id) ?? 0 : undefined;
      const picked = pickFromPool(subPool, quota[d], new Set([...exclude, ...pickedSet]), weight);
      picked.forEach((q) => pickedSet.add(q.id));
      collected.push(...picked);
    });

    // 不足分（在庫不足等）はカテゴリ内の残りプールで埋める（配分は厳守）
    if (collected.length < needed) {
      const remaining = catPool.filter(
        (q) => !pickedSet.has(q.id) && !exclude.has(q.id),
      );
      const fill = pickFromPool(remaining, needed - collected.length, new Set());
      fill.forEach((q) => pickedSet.add(q.id));
      collected.push(...fill);
    }

    // 直近出題から除外を試みた結果なお不足するなら、exclude を緩めて埋める
    if (collected.length < needed) {
      const fallback = catPool.filter((q) => !pickedSet.has(q.id));
      const fill = pickFromPool(fallback, needed - collected.length, new Set());
      fill.forEach((q) => pickedSet.add(q.id));
      collected.push(...fill);
    }

    ids.push(...shuffle(collected).map((q) => q.id));
  });

  return ids;
}

/**
 * 弱点模試用の重みマップを構築。
 * weakQuestionIds に含まれる問題は +10、同じサブカテゴリの兄弟問題は +3。
 */
function buildWeaknessWeights(weakIds: string[]): Map<string, number> {
  const w = new Map<string, number>();
  if (weakIds.length === 0) return w;

  const weakSet = new Set(weakIds);
  // 弱点問題のタグ集合からサブカテゴリ拡張
  const weakTags = new Set<string>();
  for (const id of weakIds) {
    const q = questionMap.get(id);
    if (!q) continue;
    q.tags.forEach((t) => weakTags.add(t));
  }

  for (const q of ALL_QUESTIONS) {
    let score = 0;
    if (weakSet.has(q.id)) score += 10;
    // サブカテゴリ単位の弱点拡張: 同じ matchTags を持つ問題に少しブースト
    const subs = SUBCATEGORIES[q.category] ?? [];
    for (const sc of subs) {
      const isWeakSubcat = sc.matchTags.some((t) => weakTags.has(t));
      const isInSubcat = q.tags.some((t) => sc.matchTags.includes(t));
      if (isWeakSubcat && isInSubcat) {
        score += 3;
        break;
      }
    }
    if (score > 0) w.set(q.id, score);
  }
  return w;
}

export const useExamStore = create<ExamState>((set, get) => ({
  current: null,
  examHistory: [],

  resetStore() {
    set({ current: null, examHistory: [] });
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    AsyncStorage.removeItem('@takken_exam_history').catch(() => {});
  },

  startExam() {
    // 直近 N 回の出題を除外して同一問題の連続出題を回避
    const exclude = get().getRecentQuestionIds();
    const session: ExamSession = {
      id: `exam_${Date.now()}`,
      startedAt: new Date().toISOString(),
      questionIds: pickExamQuestions(exclude),
      answers: {},
      flagged: [],
      remainingSec: EXAM_DURATION_SEC,
      submitted: false,
    };
    set({ current: session });
    get().saveSession();
    return session;
  },

  startWeaknessExam(weakQuestionIds: string[]) {
    const exclude = get().getRecentQuestionIds();
    const weights = buildWeaknessWeights(weakQuestionIds);
    const session: ExamSession = {
      id: `exam_weak_${Date.now()}`,
      startedAt: new Date().toISOString(),
      questionIds: pickExamQuestions(exclude, weights),
      answers: {},
      flagged: [],
      remainingSec: EXAM_DURATION_SEC,
      submitted: false,
    };
    set({ current: session });
    get().saveSession();
    return session;
  },

  startYearExam(year: number) {
    const questions = getExamByYear(year);
    const session: ExamSession = {
      id: `exam_${year}_${Date.now()}`,
      startedAt: new Date().toISOString(),
      questionIds: questions.map((q) => q.id),
      answers: {},
      flagged: [],
      remainingSec: EXAM_DURATION_SEC,
      submitted: false,
    };
    set({ current: session });
    get().saveSession();
    return session;
  },

  startMockPreset(presetNumber: number) {
    const questions = getMockPresetByNumber(presetNumber);
    const session: ExamSession = {
      id: `exam_mock${presetNumber}_${Date.now()}`,
      startedAt: new Date().toISOString(),
      questionIds: questions.map((q) => q.id),
      answers: {},
      flagged: [],
      remainingSec: EXAM_DURATION_SEC,
      submitted: false,
    };
    set({ current: session });
    get().saveSession();
    return session;
  },

  startRandomMock() {
    const questions = getRandomMockExam();
    const session: ExamSession = {
      id: `exam_random_${Date.now()}`,
      startedAt: new Date().toISOString(),
      questionIds: questions.map((q) => q.id),
      answers: {},
      flagged: [],
      remainingSec: EXAM_DURATION_SEC,
      submitted: false,
    };
    set({ current: session });
    get().saveSession();
    return session;
  },

  answerQuestion(qid, idx) {
    const cur = get().current;
    if (!cur || cur.submitted) return;
    const updated: ExamSession = {
      ...cur,
      answers: { ...cur.answers, [qid]: idx },
    };
    set({ current: updated });
    get().saveSession();
  },

  toggleFlag(qid) {
    const cur = get().current;
    if (!cur) return;
    const flagged = cur.flagged.includes(qid)
      ? cur.flagged.filter((x) => x !== qid)
      : [...cur.flagged, qid];
    set({ current: { ...cur, flagged } });
    get().saveSession();
  },

  tickTimer(_deltaSec) {
    // Issue #15: setInterval は Web タブ非アクティブで間引かれ、iOS 画面ロックで停止する。
    // deltaSec を加算する方式だと実時間とズレる（120分試験が実130分になる事故）。
    // 修正: 常に startedAt と現在時刻の差から remainingSec を算出（壁時計ベース）。
    const cur = get().current;
    if (!cur || cur.submitted) return;
    const startedAtMs = new Date(cur.startedAt).getTime();
    if (Number.isNaN(startedAtMs)) {
      // startedAt が壊れている場合は旧来のフォールバック
      const remaining = Math.max(0, cur.remainingSec - _deltaSec);
      set({ current: { ...cur, remainingSec: remaining } });
      if (remaining === 0) get().submitExam();
      return;
    }
    const elapsedSec = Math.floor((Date.now() - startedAtMs) / 1000);
    const remaining = Math.max(0, EXAM_DURATION_SEC - elapsedSec);
    if (remaining !== cur.remainingSec) {
      set({ current: { ...cur, remainingSec: remaining } });
    }
    if (remaining === 0 && !cur.submitted) {
      get().submitExam();
    }
  },

  submitExam() {
    const cur = get().current;
    if (!cur) throw new Error('No active exam');
    const submitted: ExamSession = {
      ...cur,
      endedAt: new Date().toISOString(),
      submitted: true,
    };
    set({ current: submitted });
    get().saveSession();

    // 模試結果を履歴に保存
    const result = scoreExam(submitted);
    const durationSec = EXAM_DURATION_SEC - submitted.remainingSec;
    const examResult: ExamResult = {
      id: submitted.id,
      date: submitted.endedAt!,
      score: result.correct,
      total: result.total,
      passed: result.passed,
      byCategory: result.byCategory,
      durationSec,
    };
    set((state) => ({
      examHistory: [...state.examHistory, examResult],
    }));
    get().saveHistory();

    return submitted;
  },

  async resumeExam() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const s: ExamSession = JSON.parse(raw);
      set({ current: s });
      return s;
    } catch {
      return null;
    }
  },

  abandonExam() {
    set({ current: null });
    AsyncStorage.removeItem(STORAGE_KEY);
  },

  async saveSession() {
    const cur = get().current;
    if (!cur) return;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cur));
    } catch (e) {
      logError(e, { context: 'exam.saveSession' });
    }
  },

  async loadHistory() {
    try {
      const raw = await AsyncStorage.getItem(HISTORY_KEY);
      if (raw) {
        set({ examHistory: JSON.parse(raw) });
      }
    } catch (e) {
      logError(e, { context: 'exam.loadHistory' });
    }
  },

  async saveHistory() {
    try {
      const { examHistory } = get();
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(examHistory));
    } catch (e) {
      logError(e, { context: 'exam.saveHistory' });
    }
  },

  // [Phase 2] クラウド同期: 模試履歴を append-only でクラウドに保存
  async syncWithCloud(userId: string) {
    try {
      const remote = await pullExamHistoryFromCloud(userId);
      const state = get();
      if (remote) {
        const merged = mergeExamHistory(state.examHistory, remote);
        set({ examHistory: merged });
        await get().saveHistory();
      }
      // 個別 result の push は submitExam 内で行う設計のため、ここでは行わない
      // (履歴一括 push はサーバー側でも重い + データ量も少ない)
      // ただし、新規ローカル分を push する用途で別途 pushNewResult を提供
    } catch (e) {
      logError(e, { context: 'exam.syncWithCloud' });
    }
  },

  // [Phase 2] 個別の模試結果を即時 push (submitExam 後に呼ぶ)
  async pushNewResult(userId: string, result: ExamResult) {
    try {
      await pushExamResultToCloud(userId, result);
    } catch (e) {
      logError(e, { context: 'exam.pushNewResult' });
    }
  },

  getExamHistory(): ExamResult[] {
    return get().examHistory;
  },

  getBestScore(): number {
    const { examHistory } = get();
    if (examHistory.length === 0) return 0;
    return Math.max(...examHistory.map((r) => r.score));
  },

  getLatestScore(): number | null {
    const { examHistory } = get();
    if (examHistory.length === 0) return null;
    return examHistory[examHistory.length - 1].score;
  },

  getScoreTrend(): number[] {
    return get().examHistory.map((r) => r.score);
  },

  /**
   * 直近 N 回の模試で出題された問題IDを返す。
   * ExamResult には questionIds を保存していないため、AsyncStorage 上の
   * 個別セッションは見ない（履歴にだけ依存）。代わりに現在のセッションの
   * questionIds と、最後に終了したセッション（current 含む）を併用する。
   */
  getRecentQuestionIds(_lastN: number = 1): Set<string> {
    const out = new Set<string>();
    const cur = get().current;
    if (cur && cur.submitted) {
      cur.questionIds.forEach((id) => out.add(id));
    }
    return out;
  },

  /**
   * 各カテゴリ × 難易度で必要数を満たすかチェック。
   * 不足があれば運営側に補充提案できるよう詳細を返す。
   */
  checkStockSufficiency() {
    const warnings: Array<{ category: Category; difficulty: 1 | 2 | 3; have: number; need: number }> = [];
    (Object.keys(EXAM_COMPOSITION) as Category[]).forEach((cat) => {
      const needed = EXAM_COMPOSITION[cat];
      const quota = difficultyQuotaFor(needed);
      const catPool = ALL_QUESTIONS.filter((q) => q.category === cat);
      ([1, 2, 3] as const).forEach((d) => {
        const have = catPool.filter((q) => q.difficulty === d).length;
        // 連続出題回避のため必要数の3倍を理想ストックとする
        const idealStock = Math.max(quota[d] * 3, quota[d] + 2);
        if (have < idealStock) {
          warnings.push({ category: cat, difficulty: d, have, need: idealStock });
        }
      });
    });
    return warnings;
  },
}));

// Helpers
export function scoreExam(session: ExamSession): {
  total: number;
  correct: number;
  byCategory: Record<Category, { total: number; correct: number }>;
  passed: boolean;
} {
  const byCategory: Record<Category, { total: number; correct: number }> = {
    kenri: { total: 0, correct: 0 },
    takkengyoho: { total: 0, correct: 0 },
    horei_seigen: { total: 0, correct: 0 },
    tax_other: { total: 0, correct: 0 },
  };
  let correct = 0;
  session.questionIds.forEach((qid) => {
    const q = questionMap.get(qid);
    if (!q) return;
    byCategory[q.category].total += 1;
    if (session.answers[qid] === q.correctIndex) {
      correct += 1;
      byCategory[q.category].correct += 1;
    }
  });
  return { total: session.questionIds.length, correct, byCategory, passed: correct >= PASS_LINE };
}

export function getExamQuestions(session: ExamSession): Question[] {
  return session.questionIds
    .map((id) => questionMap.get(id))
    .filter((q): q is Question => !!q);
}
