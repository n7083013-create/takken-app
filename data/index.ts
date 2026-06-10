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

/** 本試験の科目配分 (権利14・法令制限8・業法20[5問免除含む実データ準拠]・税その他8 = 50問) */
export const EXAM_YEAR_COMPOSITION: { category: Category; count: number }[] = [
  { category: 'kenri', count: 14 },
  { category: 'horei_seigen', count: 8 },
  { category: 'takkengyoho', count: 20 },
  { category: 'tax_other', count: 8 },
];

/** 指定年度の問題を本試験と同じ配分で取得（50問） */
export function getExamByYear(year: number): Question[] {
  const yearQuestions = QUESTIONS_BY_YEAR.get(year) ?? [];
  // ⚠️ [Bugfix 2026-06-10] 旧実装はカテゴリ連結後に slice(0,50) しており、問題数の多い年度
  //   (2024=141問: 権利45/業法49/法令17/税30) で「権利45+法令5・業法と税0問」という
  //   本試験と乖離した模試になっていた。各カテゴリを本試験配分で頭打ちにする。
  //   データ順で先頭から取る = 決定的なので「模擬N」は毎回同じセット(プリセットの意味を保つ)。
  //   配分を満たせない年度は 50問未満を返し、getMockPresetYears の「ちょうど50問」条件で除外される。
  const result: Question[] = [];
  for (const { category, count } of EXAM_YEAR_COMPOSITION) {
    result.push(...yearQuestions.filter((q) => q.category === category).slice(0, count));
  }
  return result;
}

/** 年度を和暦表示に変換 */
export function toWareki(year: number): string {
  if (year >= 2019) return `令和${year - 2018}年度`;
  return `平成${year - 1988}年度`;
}

// ============================================================
// 模擬試験プリセット (年度を抽象化したラベル)
// 顧客視点では「○○年度の問題」ではなく「模擬1」「模擬2」として提示する。
// 内部的には sourceExamYear ベースのデータをそのまま使う。
// ============================================================

/**
 * 模擬試験プリセットに使える年度のみを返す(新しい順)。
 * 「本試験形式 50問」を満たすため、50問に満たない年度は除外する。
 *
 * ⚠️ 背景(バグ C-1 の修正):
 *   一部年度は問題が 50問に満たない(例: 2023=15 / 2022=19 / 2021=33 / 2020=42)。
 *   これらをプリセットにすると、セッションUIの「/50」や合格ライン 36点(PASS_LINE)が
 *   実問題数と乖離し、数学的に合格不能 + 表示矛盾になる。
 *   → 50問揃う年度だけをプリセット化する(除外年度の問題は通常モード/ランダム模擬に残る)。
 */
export function getMockPresetYears(): number[] {
  // getExamByYear は本試験の科目配分でソート後 50問に切り出す。
  // その結果が 50問に満たない年度(科目別の不足含む)は本試験形式を満たさないため除外。
  return getAvailableExamYears().filter(
    (year) => getExamByYear(year).length >= 50,
  );
}

/** 利用可能な模擬試験プリセットの総数(50問揃う年度のみ) */
export function getMockPresetCount(): number {
  return getMockPresetYears().length;
}

/**
 * 模擬試験プリセット番号 (1始まり) → 50問
 * 1 = 最新年度ベース (法改正対応最新)、2 = その前、...
 * UI には年度を露出せず「模擬1」「模擬2」として表示する想定。
 * 50問揃う年度のみが対象(getMockPresetYears)。
 */
export function getMockPresetByNumber(n: number): Question[] {
  const years = getMockPresetYears(); // 新しい順・50問揃う年度のみ
  if (n < 1 || n > years.length) return [];
  const year = years[n - 1];
  return getExamByYear(year);
}

/**
 * 全模擬を解き終えたユーザー向けのランダム模擬試験。
 * 全問題プールから本試験と同じ配分で 50問を抽出してシャッフル返却。
 * 配分: 権利関係 14・法令制限 8・税価格 3・宅建業法 20・5問免除 5
 */
export function getRandomMockExam(): Question[] {
  const all = ALL_QUESTIONS;
  const composition: { category: Category; count: number }[] = [
    { category: 'kenri', count: 14 },
    { category: 'horei_seigen', count: 8 },
    { category: 'tax_other', count: 3 },
    { category: 'takkengyoho', count: 25 }, // 業法20 + 5問免除5 を tax_other 以外でカバー
  ];
  const pickRandom = <T,>(arr: T[], n: number): T[] => {
    const copy = [...arr];
    const out: T[] = [];
    for (let i = 0; i < n && copy.length > 0; i++) {
      const idx = Math.floor(Math.random() * copy.length);
      out.push(copy.splice(idx, 1)[0]);
    }
    return out;
  };
  const result: Question[] = [];
  for (const { category, count } of composition) {
    const pool = all.filter((q) => q.category === category);
    result.push(...pickRandom(pool, count));
  }
  return result.slice(0, 50);
}
