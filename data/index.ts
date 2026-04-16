import { kenriQuestions } from './modules/takken/questions/kenri';
import { takkengyohoQuestions } from './modules/takken/questions/takkengyoho';
import { horeiSeigenQuestions } from './modules/takken/questions/horei_seigen';
import { taxOtherQuestions } from './modules/takken/questions/tax_other';
import { takkenGlossary } from './modules/takken/glossary';
import { kenriQuickQuizzes } from './modules/takken/quick-quiz/kenri';
import { takkengyohoQuickQuizzes } from './modules/takken/quick-quiz/takkengyoho';
import { horeiSeigenQuickQuizzes } from './modules/takken/quick-quiz/horei_seigen';
import { taxOtherQuickQuizzes } from './modules/takken/quick-quiz/tax_other';
import { Question, GlossaryTerm, QuickQuiz, ExamModuleId, Category } from '../types';
import { EXAM_ALLOCATION } from '../constants/exam';

export const ALL_QUICK_QUIZZES: QuickQuiz[] = [
  ...kenriQuickQuizzes,
  ...takkengyohoQuickQuizzes,
  ...horeiSeigenQuickQuizzes,
  ...taxOtherQuickQuizzes,
];

export const ALL_QUESTIONS: Question[] = [
  ...kenriQuestions,
  ...takkengyohoQuestions,
  ...horeiSeigenQuestions,
  ...taxOtherQuestions,
];

export const ALL_GLOSSARY: GlossaryTerm[] = [
  ...takkenGlossary,
];

// ===== O(1)ルックアップ用のMap/Set（起動時に1回だけ構築）=====

const QUESTION_MAP = new Map<string, Question>(
  ALL_QUESTIONS.map((q) => [q.id, q]),
);

const GLOSSARY_SLUG_MAP = new Map<string, GlossaryTerm>(
  ALL_GLOSSARY.map((g) => [g.slug, g]),
);

// カテゴリ別に事前グルーピング
const QUESTIONS_BY_CATEGORY = new Map<string, Question[]>();
ALL_QUESTIONS.forEach((q) => {
  const key = `${q.moduleId}:${q.category}`;
  const arr = QUESTIONS_BY_CATEGORY.get(key);
  if (arr) arr.push(q);
  else QUESTIONS_BY_CATEGORY.set(key, [q]);
});

// カテゴリ統計（1回だけ計算）
const CATEGORY_STATS_CACHE = new Map<ExamModuleId, Array<{ category: Category; total: number }>>();

const FREE_QUESTION_ID_SET = new Set(
  ALL_QUESTIONS.slice(0, 30).map((q) => q.id),
);
const FREE_QUICK_QUIZ_ID_SET = new Set(
  ALL_QUICK_QUIZZES.slice(0, 50).map((q) => q.id),
);

// 後方互換
export const FREE_QUESTION_IDS = [...FREE_QUESTION_ID_SET];

// 年度別に問題をグルーピング
const QUESTIONS_BY_YEAR = new Map<number, Question[]>();
ALL_QUESTIONS.forEach((q) => {
  if (q.sourceExamYear) {
    const arr = QUESTIONS_BY_YEAR.get(q.sourceExamYear);
    if (arr) arr.push(q);
    else QUESTIONS_BY_YEAR.set(q.sourceExamYear, [q]);
  }
});

// ===== Helper functions（全てO(1) or キャッシュ済み）=====

export function getQuestionById(id: string): Question | undefined {
  return QUESTION_MAP.get(id);
}

export function getQuestionsByModule(moduleId: ExamModuleId): Question[] {
  return ALL_QUESTIONS.filter((q) => q.moduleId === moduleId);
}

export function getQuestionsByCategory(moduleId: ExamModuleId, category: Category): Question[] {
  return QUESTIONS_BY_CATEGORY.get(`${moduleId}:${category}`) ?? [];
}

export function getGlossaryBySlug(slug: string): GlossaryTerm | undefined {
  return GLOSSARY_SLUG_MAP.get(slug);
}

export function getGlossaryByTags(tags: string[]): GlossaryTerm[] {
  if (tags.length === 0) return [];
  const tagSet = new Set(tags);
  return ALL_GLOSSARY.filter((g) =>
    tagSet.has(g.slug) ||
    tagSet.has(g.term) ||
    g.relatedTerms.some((rt) => tagSet.has(rt)),
  );
}

export function getCategoryStats(moduleId: ExamModuleId): Array<{ category: Category; total: number }> {
  const cached = CATEGORY_STATS_CACHE.get(moduleId);
  if (cached) return cached;
  const categories: Category[] = ['kenri', 'takkengyoho', 'horei_seigen', 'tax_other'];
  const result = categories.map((category) => ({
    category,
    total: (QUESTIONS_BY_CATEGORY.get(`${moduleId}:${category}`) ?? []).length,
  }));
  CATEGORY_STATS_CACHE.set(moduleId, result);
  return result;
}

export function isQuestionFree(questionId: string): boolean {
  return FREE_QUESTION_ID_SET.has(questionId);
}

export function isQuickQuizFree(quizId: string): boolean {
  return FREE_QUICK_QUIZ_ID_SET.has(quizId);
}

/** 利用可能な年度一覧（新しい順） */
export function getAvailableExamYears(): number[] {
  return [...QUESTIONS_BY_YEAR.keys()].sort((a, b) => b - a);
}

/** 指定年度の問題を本試験と同じ配分で取得（50問） */
export function getExamByYear(year: number): Question[] {
  const yearQuestions = QUESTIONS_BY_YEAR.get(year) ?? [];
  // 本試験と同じ科目配分で出題順にソート
  const result: Question[] = [];
  const categories: Category[] = ['kenri', 'horei_seigen', 'takkengyoho', 'tax_other'];
  for (const cat of categories) {
    const catQuestions = yearQuestions.filter(q => q.category === cat);
    result.push(...catQuestions);
  }
  return result.slice(0, 50);
}

/** 年度を和暦表示に変換 */
export function toWareki(year: number): string {
  if (year >= 2019) return `令和${year - 2018}年度`;
  return `平成${year - 1988}年度`;
}
