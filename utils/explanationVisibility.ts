// ============================================================
// 解説表示の可否判定ヘルパー (各問題画面で共通利用)
// ============================================================

import type { Question } from '../types';

/**
 * 個数問題・組み合わせ問題では各選択肢 (1つ/2つ/3つ/4つ) の解説を非表示にする。
 * これらの問題は判定対象がア〜エの statements にあり、
 * 数字選択肢に解説を付けると冗長で「ごちゃごちゃ」する (ユーザー報告 2026-05)。
 *
 * 通常の 4 択問題 (standard) では従来通り表示する。
 */
export function isCountOrCombinationQuestion(q: Pick<Question, 'questionFormat'>): boolean {
  return q.questionFormat === 'count' || q.questionFormat === 'combination';
}

/**
 * 解答後の choiceExplanations を選択肢の下に表示すべきか判定。
 * 個数/組み合わせ問題は statementExplanations で説明完結するため非表示。
 */
export function shouldShowChoiceExplanation(
  q: Pick<Question, 'questionFormat' | 'choiceExplanations'>,
  answered: boolean,
  choiceIndex: number,
): string | null {
  if (!answered) return null;
  if (isCountOrCombinationQuestion(q)) return null;
  if (!q.choiceExplanations || !q.choiceExplanations[choiceIndex]) return null;
  const text = q.choiceExplanations[choiceIndex];
  return text && text.trim().length > 0 ? text : null;
}

/**
 * statement (ア/イ/ウ/エ) の直下に表示する個別解説を取得。
 * 解答後のみ、データがあれば返す。
 */
export function getStatementExplanation(
  q: Pick<Question, 'statementExplanations'>,
  answered: boolean,
  statementIndex: number,
): string | null {
  if (!answered) return null;
  if (!q.statementExplanations || !q.statementExplanations[statementIndex]) return null;
  const text = q.statementExplanations[statementIndex];
  return text && text.trim().length > 0 ? text : null;
}
