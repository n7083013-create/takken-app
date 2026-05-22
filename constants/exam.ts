import { Category } from '../types';

/** 全4科目 */
export const CATEGORIES: Category[] = ['kenri', 'takkengyoho', 'horei_seigen', 'tax_other'];

/** 本試験の科目別配点 */
export const EXAM_ALLOCATION: Record<Category, number> = {
  kenri: 14,
  takkengyoho: 20,
  horei_seigen: 8,
  tax_other: 8,
};

/** 本試験の合計問題数 */
export const EXAM_TOTAL = 50;

/** 合格ライン（問） - 令和6年度は36問 */
export const PASS_LINE = 36;

/**
 * 模試の難易度分布（％）
 *
 * [2026-05-22 改訂] 「簡単すぎ」のユーザーフィードバックを受けて引き上げ:
 *   旧: 基本 40 / 標準 45 / 難 15 (R5/R6 本試験を緩めに反映)
 *   新: 基本 20 / 標準 45 / 難 35 (本試験より一段難しく設定し、模試合格=本試験合格を保証)
 *
 * 設計原則:
 *  - 模試で 36/50 取れるレベル = 本試験で確実に合格できる地力
 *  - 基本問題を半減させることで「簡単な問題で正解した分」が消え、実力がより正確に出る
 *  - 難問の比率を 2.3 倍にし、近年の傾向 (R5以降の複数論点・ひっかけ・判例) を厚めに反映
 */
export const DIFFICULTY_DISTRIBUTION: Record<1 | 2 | 3, number> = {
  1: 0.20,
  2: 0.45,
  3: 0.35,
};

/**
 * 合格判定グレード（50点満点ベース）
 * 本試験の合格点 35〜38点（年により変動）に合わせて4段階で表示
 */
export type ExamGrade = 'A' | 'B' | 'C' | 'D';
export interface GradeThreshold {
  min: number;
  label: string;
  description: string;
}
export const GRADE_THRESHOLDS: Record<ExamGrade, GradeThreshold> = {
  A: { min: 42, label: '◎ A 安全圏', description: '本試験でも安定して合格できる実力です' },
  B: { min: 36, label: '◯ B 合格圏', description: '合格ラインです。取りこぼしを減らしましょう' },
  C: { min: 30, label: '△ C 要努力', description: 'もう一歩。苦手分野を重点的に補強しましょう' },
  D: { min: 0,  label: '✗ D 不合格圏', description: '基本論点の理解から見直しましょう' },
};

/** スコアからグレードを判定 */
export function judgeGrade(score: number): ExamGrade {
  if (score >= GRADE_THRESHOLDS.A.min) return 'A';
  if (score >= GRADE_THRESHOLDS.B.min) return 'B';
  if (score >= GRADE_THRESHOLDS.C.min) return 'C';
  return 'D';
}

/**
 * 指定年の宅建試験日（10月第3日曜日）を計算
 * @param year 対象年（例: 2026）
 * @returns その年の試験日
 */
export function calcTakkenExamDate(year: number): Date {
  const oct1 = new Date(year, 9, 1); // 10月1日
  const firstSunday = ((7 - oct1.getDay()) % 7) + 1;  // 10月の最初の日曜
  return new Date(year, 9, firstSunday + 14);  // 第3日曜 = 最初の日曜 + 14日
}

/**
 * 直近の宅建試験日を自動取得
 * - 今日が試験日の翌日より前 → 今年の試験日
 * - 試験日の翌日以降 → 翌年の試験日（次回カウントダウン開始）
 *
 * ユーザー設定に頼らず常に正確な日付を返す
 * 宅建試験は毎年10月第3日曜日で固定のため、動的計算で十分
 */
export function getNextTakkenExamDate(): Date {
  const now = new Date();
  const thisYearExam = calcTakkenExamDate(now.getFullYear());

  // 試験日の翌日 00:00 を判定基準にする
  // → 試験当日中は「今年の試験」を表示（0日カウント or 1日カウント）
  // → 試験翌日から「来年の試験」を表示
  const dayAfterExam = new Date(thisYearExam);
  dayAfterExam.setDate(dayAfterExam.getDate() + 1);
  dayAfterExam.setHours(0, 0, 0, 0);

  if (now.getTime() < dayAfterExam.getTime()) return thisYearExam;
  return calcTakkenExamDate(now.getFullYear() + 1);
}

/**
 * 試験日までの残り日数を日付ベース（時刻無視）で算出
 * - 0 = 試験当日
 * - 1 = 明日が試験日
 * - -1 以下は null を返す（試験翌日は新しい試験日に切り替わる前提）
 */
export function daysUntilTakkenExam(): number | null {
  const now = new Date();
  const examDate = getNextTakkenExamDate();

  // 時刻を無視して日数を計算
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const exam = new Date(examDate.getFullYear(), examDate.getMonth(), examDate.getDate());

  const diffMs = exam.getTime() - today.getTime();
  const days = Math.round(diffMs / (24 * 60 * 60 * 1000));

  return days >= 0 ? days : null;
}
