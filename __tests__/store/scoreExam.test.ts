// ============================================================
// scoreExam 回帰テスト (模試採点ロジックの中核)
// ============================================================
//
// 「模試合格=本試験合格」を支える合否判定。これまで無テストだった中核を固定する。
// 守りたい性質:
// 1. 全問正解で correct === total、passed は correct >= PASS_LINE(36)
// 2. PASS_LINE 境界(36正解=合格 / 35正解=不合格)
// 3. 空セッションで 0除算/例外なし(total 0・passed false)
// 4. 範囲外/未回答の選択は不正解扱い(correct に加算されない)
// 5. questionMap 未収載の qid は採点をスキップするが total には questionIds.length が反映される
//
// questionMap は ALL_QUESTIONS から構築されるため '../data' をモックして決定的にする。

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../services/errorLogger', () => ({
  logError: jest.fn(),
}));

jest.mock('../../services/cloudSync', () => ({
  pullFromCloud: jest.fn(() => Promise.resolve(null)),
  pushProgressToCloud: jest.fn(() => Promise.resolve()),
  pushStatsToCloud: jest.fn(() => Promise.resolve()),
  mergeProgress: jest.fn((a: unknown) => a),
  markDirty: jest.fn(),
  resetSyncState: jest.fn(),
}));

// 制御された問題バンク(correctIndex は全問 2 固定 → 「2=正解 / 0=不正解」で操作)
const TAKKEN_CATEGORIES = ['kenri', 'takkengyoho', 'horei_seigen', 'tax_other'];
const mockQuestions = Array.from({ length: 40 }, (_, i) => ({
  id: `q${i}`,
  category: TAKKEN_CATEGORIES[i % TAKKEN_CATEGORIES.length],
  correctIndex: 2,
}));

jest.mock('../../data', () => ({
  ALL_QUESTIONS: mockQuestions,
  getExamByYear: () => [],
  getMockPresetByNumber: () => [],
  getRandomMockExam: () => [],
}));

import { scoreExam } from '../../store/useExamStore';
import { PASS_LINE } from '../../constants/exam';

/** 先頭 n 問のセッション。先頭 correctCount 問だけ正解(2)、残りは不正解(0)。 */
function mkSession(n: number, correctCount: number) {
  const questionIds = mockQuestions.slice(0, n).map((q) => q.id);
  const answers: Record<string, number> = {};
  questionIds.forEach((id, i) => {
    answers[id] = i < correctCount ? 2 : 0;
  });
  return {
    id: 'test',
    startedAt: '2026-05-29T00:00:00.000Z',
    questionIds,
    answers,
    flagged: [],
    remainingSec: 0,
    submitted: true,
  };
}

const sum = (rec: Record<string, { total: number; correct: number }>, k: 'total' | 'correct') =>
  Object.values(rec).reduce((acc, v) => acc + v[k], 0);

describe('scoreExam (takken 模試採点)', () => {
  it('PASS_LINE は 36 (本試験 50問の合格ライン水準)', () => {
    expect(PASS_LINE).toBe(36);
  });

  it('全問正解で correct===total、passed=true', () => {
    const r = scoreExam(mkSession(40, 40) as never);
    expect(r.total).toBe(40);
    expect(r.correct).toBe(40);
    expect(r.passed).toBe(true);
    expect(sum(r.byCategory, 'total')).toBe(40);
    expect(sum(r.byCategory, 'correct')).toBe(40);
  });

  it('PASS_LINE 境界: 36正解=合格 / 35正解=不合格', () => {
    const pass = scoreExam(mkSession(40, 36) as never);
    expect(pass.correct).toBe(36);
    expect(pass.passed).toBe(true);

    const fail = scoreExam(mkSession(40, 35) as never);
    expect(fail.correct).toBe(35);
    expect(fail.passed).toBe(false);
  });

  it('空セッションは total 0・correct 0・passed false(0除算/例外なし)', () => {
    const r = scoreExam(mkSession(0, 0) as never);
    expect(r.total).toBe(0);
    expect(r.correct).toBe(0);
    expect(r.passed).toBe(false);
    expect(sum(r.byCategory, 'total')).toBe(0);
  });

  it('未回答/誤答は correct に加算されない', () => {
    const allWrong = scoreExam(mkSession(10, 0) as never);
    expect(allWrong.correct).toBe(0);
    expect(allWrong.passed).toBe(false);

    const r = scoreExam({
      id: 't', startedAt: '2026-05-29T00:00:00.000Z',
      questionIds: ['q0', 'q1', 'q2'], answers: {}, flagged: [], remainingSec: 0, submitted: true,
    } as never);
    expect(r.total).toBe(3);
    expect(r.correct).toBe(0);
  });

  it('未収載 qid はスキップ。total は questionIds.length を反映(byCategory 合計を上回りうる)', () => {
    const r = scoreExam({
      id: 't', startedAt: '2026-05-29T00:00:00.000Z',
      questionIds: ['q0', 'UNKNOWN', 'q1'],
      answers: { q0: 2, q1: 2, UNKNOWN: 2 },
      flagged: [], remainingSec: 0, submitted: true,
    } as never);
    expect(r.total).toBe(3);
    expect(r.correct).toBe(2);
    expect(sum(r.byCategory, 'total')).toBe(2);
  });
});
