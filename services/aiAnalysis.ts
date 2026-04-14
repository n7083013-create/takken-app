// ============================================================
// 宅建士 完全対策 - AI学習分析サービス
// ローカル計算（無料）で弱点特定・出題優先度を自動算出
// ============================================================

import { Category, Question, QuestionProgress, StudyStats } from '../types';
import { ALL_QUESTIONS, ALL_QUICK_QUIZZES } from '../data';

// 試験本番の配点目標
export const TARGET_SCORES: Record<Category, { total: number; target: number }> = {
  takkengyoho: { total: 20, target: 19 },
  kenri: { total: 14, target: 10 },
  horei_seigen: { total: 8, target: 7 },
  tax_other: { total: 8, target: 5 },
};

export const TOTAL_TARGET_SCORE = 41; // 50問中41点 = 余裕の合格

// 各カテゴリの重要度（配点比率ベース）
const CATEGORY_WEIGHT: Record<Category, number> = {
  takkengyoho: 0.4,    // 20/50
  kenri: 0.28,         // 14/50
  horei_seigen: 0.16,  // 8/50
  tax_other: 0.16,     // 8/50
};

// ============================================================
// 弱点スコア（0-100、高いほど苦手）
// ============================================================

export interface WeaknessScore {
  questionId: string;
  category: Category;
  difficulty: 1 | 2 | 3;
  score: number;        // 0-100, 高いほど優先
  reason: string;       // 表示用の理由
}

/**
 * 個別問題の弱点スコアを計算
 * - 未解答 = 中程度の優先度（一度はやってほしい）
 * - 不正解多い = 最高優先度
 * - 直近間違えた = 高優先度
 * - 久しぶり = 復習タイミング
 */
export function calculateWeaknessScore(
  question: Question,
  progress: QuestionProgress | undefined,
): WeaknessScore {
  let score = 0;
  let reason = '';

  if (!progress || progress.attempts === 0) {
    // 未解答 → 中優先度
    score = 50;
    reason = '未解答';
  } else {
    const accuracy = progress.correctCount / progress.attempts;

    // 正答率ベース（不正解率 × 60点満点）
    score += (1 - accuracy) * 60;

    // 試行回数が少ない = 不安定 → +10
    if (progress.attempts < 3) {
      score += 10;
    }

    // 最終解答日からの経過日数（最大+20点）
    const daysSince = daysSinceDate(progress.lastAttemptAt);
    score += Math.min(daysSince * 2, 20);

    // 復習日を過ぎている → +15
    if (progress.nextReviewAt <= new Date().toISOString()) {
      score += 15;
    }

    // 理由ラベル
    if (accuracy < 0.3) reason = '苦手';
    else if (accuracy < 0.6) reason = '不安定';
    else if (daysSince > 7) reason = '復習推奨';
    else reason = '定着中';
  }

  // 難易度補正（基礎は最重要、応用は控えめ）
  if (question.difficulty === 1) score *= 1.1;
  else if (question.difficulty === 3) score *= 0.9;

  return {
    questionId: question.id,
    category: question.category,
    difficulty: question.difficulty,
    score: Math.min(100, Math.round(score)),
    reason,
  };
}

// ============================================================
// カテゴリ別弱点分析
// ============================================================

export interface CategoryAnalysis {
  category: Category;
  accuracy: number;          // 0-1
  attemptedCount: number;
  totalCount: number;
  coverage: number;          // 0-1（解答済み問題の割合）
  predictedScore: number;    // 本番予想得点
  targetScore: number;       // 目標得点
  gap: number;               // 目標との差（マイナス=不足）
  status: 'safe' | 'warning' | 'danger';
  message: string;
}

export function analyzeCategoryStrength(
  category: Category,
  stats: StudyStats,
  progress: Record<string, QuestionProgress>,
): CategoryAnalysis {
  const catStats = stats.categoryStats[category];
  const totalQuestions = ALL_QUESTIONS.filter(q => q.category === category).length;
  const attemptedQuestions = ALL_QUESTIONS.filter(
    q => q.category === category && progress[q.id] && progress[q.id].attempts > 0
  ).length;

  const accuracy = catStats.total > 0 ? catStats.correct / catStats.total : 0;
  const coverage = totalQuestions > 0 ? attemptedQuestions / totalQuestions : 0;

  const target = TARGET_SCORES[category];
  // 予想得点 = 正答率 × 出題数（カバー率も考慮）
  const reliabilityFactor = Math.min(1, coverage * 1.2 + 0.1);
  const predictedScore = Math.round(accuracy * target.total * reliabilityFactor * 10) / 10;
  const gap = predictedScore - target.target;

  let status: 'safe' | 'warning' | 'danger';
  let message: string;

  if (catStats.total < 5) {
    status = 'warning';
    message = 'まだデータ不足。最低10問は解いてみよう';
  } else if (gap >= 0) {
    status = 'safe';
    message = `目標到達！この調子で復習を継続`;
  } else if (gap >= -2) {
    status = 'warning';
    message = `あと少し。弱点を集中攻略しよう`;
  } else {
    status = 'danger';
    message = `要対策。${target.target}点目標に対し${Math.abs(gap).toFixed(1)}点不足`;
  }

  return {
    category,
    accuracy,
    attemptedCount: attemptedQuestions,
    totalCount: totalQuestions,
    coverage,
    predictedScore,
    targetScore: target.target,
    gap,
    status,
    message,
  };
}

// ============================================================
// 全体予想スコア
// ============================================================

export interface OverallAnalysis {
  predictedTotal: number;        // 本番予想得点（0-50）
  targetTotal: number;           // 41
  passProbability: number;       // 0-100%
  categories: CategoryAnalysis[];
  weakestCategory: Category;
  strongestCategory: Category;
  recommendation: string;
}

export function analyzeOverall(
  stats: StudyStats,
  progress: Record<string, QuestionProgress>,
): OverallAnalysis {
  const categories: Category[] = ['takkengyoho', 'kenri', 'horei_seigen', 'tax_other'];
  const analyses = categories.map(c => analyzeCategoryStrength(c, stats, progress));

  const predictedTotal = analyses.reduce((sum, a) => sum + a.predictedScore, 0);

  // 合格確率の算出（41点を中心としたシグモイド近似）
  const diff = predictedTotal - 35;
  const passProbability = Math.max(0, Math.min(100, Math.round(50 + diff * 6)));

  // 最弱・最強カテゴリ
  const sortedByGap = [...analyses].sort((a, b) => a.gap - b.gap);
  const weakestCategory = sortedByGap[0].category;
  const strongestCategory = sortedByGap[sortedByGap.length - 1].category;

  let recommendation: string;
  if (stats.totalQuestions < 20) {
    recommendation = 'まずは各カテゴリ10問ずつ解いて、AIに弱点を把握させよう';
  } else if (passProbability >= 80) {
    recommendation = `合格圏内！${labelOf(weakestCategory)}を仕上げて余裕の合格を狙おう`;
  } else if (passProbability >= 50) {
    recommendation = `${labelOf(weakestCategory)}が伸び代。今日のおすすめ問題を集中攻略`;
  } else {
    recommendation = `${labelOf(weakestCategory)}を優先。基礎レベルから着実に積み上げよう`;
  }

  return {
    predictedTotal: Math.round(predictedTotal * 10) / 10,
    targetTotal: TOTAL_TARGET_SCORE,
    passProbability,
    categories: analyses,
    weakestCategory,
    strongestCategory,
    recommendation,
  };
}

// ============================================================
// 今日のおすすめ問題（弱点優先で自動選出）
// ============================================================

/**
 * 弱点スコアと配点重要度から、今日解くべき問題を選出
 * @param count 取得する問題数（デフォルト10）
 */
export function getRecommendedQuestions(
  progress: Record<string, QuestionProgress>,
  count: number = 10,
): WeaknessScore[] {
  const scores = ALL_QUESTIONS.map(q => {
    const ws = calculateWeaknessScore(q, progress[q.id]);
    // カテゴリ重要度で重み付け
    ws.score = Math.round(ws.score * (0.5 + CATEGORY_WEIGHT[q.category]));
    return ws;
  });

  // スコア降順でソート
  scores.sort((a, b) => b.score - a.score);

  // カテゴリ偏らないように調整（最大同カテゴリ40%）
  const maxPerCategory = Math.ceil(count * 0.4);
  const result: WeaknessScore[] = [];
  const categoryCount: Record<Category, number> = {
    kenri: 0,
    takkengyoho: 0,
    horei_seigen: 0,
    tax_other: 0,
  };

  for (const s of scores) {
    if (result.length >= count) break;
    if (categoryCount[s.category] >= maxPerCategory) continue;
    result.push(s);
    categoryCount[s.category]++;
  }

  // 足りなければ偏り無視で追加
  if (result.length < count) {
    for (const s of scores) {
      if (result.length >= count) break;
      if (!result.includes(s)) result.push(s);
    }
  }

  return result;
}

// ============================================================
// 学習プラン（試験日までの日割り）
// ============================================================

export interface StudyPlan {
  daysUntilExam: number;
  totalUnsolvedQuestions: number;
  totalUnsolvedQuizzes: number;
  dailyQuestions: number;       // 1日あたりの4択ノルマ
  dailyQuizzes: number;         // 1日あたりの一問一答ノルマ
  estimatedDailyMinutes: number;
  message: string;
}

export function buildStudyPlan(
  examDate: Date | undefined,
  progress: Record<string, QuestionProgress>,
): StudyPlan {
  const now = new Date();
  const daysUntilExam = examDate
    ? Math.max(1, Math.ceil((examDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : 60; // デフォルト60日

  const unsolvedQuestions = ALL_QUESTIONS.filter(
    q => !progress[q.id] || progress[q.id].attempts === 0
  ).length;

  const unsolvedQuizzes = ALL_QUICK_QUIZZES.length; // 一問一答は別管理のため簡易計算

  // 全問1周 + 復習で1.5倍程度
  const targetQuestions = Math.ceil(ALL_QUESTIONS.length * 1.5);
  const dailyQuestions = Math.max(5, Math.ceil(targetQuestions / daysUntilExam));
  const dailyQuizzes = Math.max(10, Math.ceil((ALL_QUICK_QUIZZES.length * 1.2) / daysUntilExam));

  // 4択 約1.5分/問、一問一答 約15秒/問
  const estimatedDailyMinutes = Math.round(dailyQuestions * 1.5 + dailyQuizzes * 0.25);

  let message: string;
  if (daysUntilExam > 90) {
    message = '余裕あり。基礎を固めながらゆっくり進めよう';
  } else if (daysUntilExam > 30) {
    message = '計画的に進めれば十分間に合う';
  } else if (daysUntilExam > 14) {
    message = 'ラストスパート期間。弱点を集中攻略！';
  } else {
    message = '直前期。間違えた問題だけ反復しよう';
  }

  return {
    daysUntilExam,
    totalUnsolvedQuestions: unsolvedQuestions,
    totalUnsolvedQuizzes: unsolvedQuizzes,
    dailyQuestions,
    dailyQuizzes,
    estimatedDailyMinutes,
    message,
  };
}

// ============================================================
// ヘルパー
// ============================================================

function daysSinceDate(dateStr: string): number {
  const then = new Date(dateStr).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - then) / (1000 * 60 * 60 * 24)));
}

function labelOf(category: Category): string {
  const labels: Record<Category, string> = {
    kenri: '権利関係',
    takkengyoho: '宅建業法',
    horei_seigen: '法令上の制限',
    tax_other: '税・その他',
  };
  return labels[category];
}
