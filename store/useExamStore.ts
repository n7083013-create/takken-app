// ============================================================
// 宅建士 完全対策 - 模擬試験ストア
// 本試験形式: 50問 / 120分 (権利14 + 宅建業法20 + 法令8 + 税その他8)
// ============================================================

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Question, Category, ExamResult } from '../types';
import { ALL_QUESTIONS, getExamByYear } from '../data';
import { logError } from '../services/errorLogger';
import { EXAM_ALLOCATION, PASS_LINE } from '../constants/exam';

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
  startYearExam(year: number): ExamSession;
  answerQuestion(qid: string, choiceIndex: number): void;
  toggleFlag(qid: string): void;
  tickTimer(deltaSec: number): void;
  submitExam(): ExamSession;
  resumeExam(): Promise<ExamSession | null>;
  abandonExam(): void;
  saveSession(): Promise<void>;
  loadHistory(): Promise<void>;
  saveHistory(): Promise<void>;
  getExamHistory(): ExamResult[];
  getBestScore(): number;
  getLatestScore(): number | null;
  getScoreTrend(): number[];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickExamQuestions(): string[] {
  const ids: string[] = [];
  (Object.keys(EXAM_COMPOSITION) as Category[]).forEach((cat) => {
    const pool = ALL_QUESTIONS.filter((q) => q.category === cat);
    const needed = EXAM_COMPOSITION[cat];
    const picked = shuffle(pool).slice(0, Math.min(needed, pool.length));
    ids.push(...picked.map((q) => q.id));
  });
  return ids;
}

export const useExamStore = create<ExamState>((set, get) => ({
  current: null,
  examHistory: [],

  startExam() {
    const session: ExamSession = {
      id: `exam_${Date.now()}`,
      startedAt: new Date().toISOString(),
      questionIds: pickExamQuestions(),
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

  tickTimer(deltaSec) {
    const cur = get().current;
    if (!cur || cur.submitted) return;
    const remaining = Math.max(0, cur.remainingSec - deltaSec);
    set({ current: { ...cur, remainingSec: remaining } });
    if (remaining === 0) {
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
