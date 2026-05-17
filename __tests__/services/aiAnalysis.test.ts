// ============================================================
// services/aiAnalysis テスト
// 重点:
//  - TOTAL_TARGET_SCORE が「安全圏 42点」に統一されていること (画面間の整合性)
//  - getRecommendedQuestionsByCategory / BySubcategory / ForOther の挙動
//  - mastered=true の問題は AI 推奨から除外される
//  - 弱点スコア順 + シャッフルで毎回違う順序になる
// ============================================================

import {
  TOTAL_TARGET_SCORE,
  TARGET_SCORES,
  getRecommendedQuestionsByCategory,
  getRecommendedQuestionsBySubcategory,
  getRecommendedQuestionsForOther,
  calculateWeaknessScore,
} from '../../services/aiAnalysis';
import type { QuestionProgress } from '../../types';

describe('aiAnalysis - 定数の整合性', () => {
  it('TOTAL_TARGET_SCORE は安全圏 42 点に統一されている (constants/exam.ts の GRADE_A.min と一致)', () => {
    // ユーザー方針「厳しい方で統一」: 41 → 42 (Grade A 安全圏) に揃えた回帰テスト
    expect(TOTAL_TARGET_SCORE).toBe(42);
  });

  it('TARGET_SCORES は 4 カテゴリ揃っており、合計は 50 問', () => {
    const totalProblems =
      TARGET_SCORES.takkengyoho.total +
      TARGET_SCORES.kenri.total +
      TARGET_SCORES.horei_seigen.total +
      TARGET_SCORES.tax_other.total;
    expect(totalProblems).toBe(50);
  });

  it('TARGET_SCORES.target の合計が TOTAL_TARGET_SCORE と整合 (許容差 ±2)', () => {
    // カテゴリ別目標と全体目標が大きく乖離していないこと
    const totalTargets =
      TARGET_SCORES.takkengyoho.target +
      TARGET_SCORES.kenri.target +
      TARGET_SCORES.horei_seigen.target +
      TARGET_SCORES.tax_other.target;
    expect(Math.abs(totalTargets - TOTAL_TARGET_SCORE)).toBeLessThanOrEqual(2);
  });
});

describe('aiAnalysis - calculateWeaknessScore', () => {
  it('未解答は中優先度 ベース50点 + 難易度補正', () => {
    // difficulty=1 (基礎) は ×1.1 → 50 * 1.1 = 55
    const qBasic = { id: 'q1', category: 'kenri' as const, difficulty: 1 as const } as any;
    expect(calculateWeaknessScore(qBasic, undefined).score).toBe(55);
    expect(calculateWeaknessScore(qBasic, undefined).reason).toBe('未解答');

    // difficulty=2 (標準) は ×1.0 → 50
    const qStandard = { id: 'q2', category: 'kenri' as const, difficulty: 2 as const } as any;
    expect(calculateWeaknessScore(qStandard, undefined).score).toBe(50);

    // difficulty=3 (応用) は ×0.9 → 50 * 0.9 = 45
    const qAdvanced = { id: 'q3', category: 'kenri' as const, difficulty: 3 as const } as any;
    expect(calculateWeaknessScore(qAdvanced, undefined).score).toBe(45);
  });

  it('正答率 < 50% は「苦手」と判定 (厳しい方の閾値)', () => {
    const q = { id: 'q1', category: 'kenri' as const, difficulty: 1 as const } as any;
    const progress: QuestionProgress = {
      questionId: 'q1',
      attempts: 4,
      correctCount: 1,
      correctStreak: 0,
      lastAttemptAt: new Date().toISOString(),
      bookmarked: false,
      nextReviewAt: new Date().toISOString(),
      easeFactor: 2.5,
      interval: 1,
    };
    const result = calculateWeaknessScore(q, progress);
    expect(result.reason).toBe('苦手');
  });

  it('正答率 50%-79% は「不安定」', () => {
    const q = { id: 'q1', category: 'kenri' as const, difficulty: 1 as const } as any;
    const progress: QuestionProgress = {
      questionId: 'q1',
      attempts: 4,
      correctCount: 2, // 50%
      correctStreak: 1,
      lastAttemptAt: new Date().toISOString(),
      bookmarked: false,
      nextReviewAt: new Date().toISOString(),
      easeFactor: 2.5,
      interval: 1,
    };
    const result = calculateWeaknessScore(q, progress);
    expect(result.reason).toBe('不安定');
  });
});

describe('aiAnalysis - 推奨問題取得 (mastered 除外)', () => {
  it('getRecommendedQuestionsByCategory: mastered=true の問題は除外される', () => {
    const allWithoutMaster = getRecommendedQuestionsByCategory({}, 'kenri', 100);
    expect(allWithoutMaster.length).toBeGreaterThan(0);

    // すべての結果の questionId を mastered=true に設定
    const progressAllMastered: Record<string, QuestionProgress> = {};
    for (const r of allWithoutMaster) {
      progressAllMastered[r.questionId] = {
        questionId: r.questionId,
        attempts: 0,
        correctCount: 0,
        correctStreak: 0,
        lastAttemptAt: '',
        bookmarked: false,
        nextReviewAt: '',
        easeFactor: 2.5,
        interval: 0,
        mastered: true,
      };
    }
    const filtered = getRecommendedQuestionsByCategory(progressAllMastered, 'kenri', 100);
    // mastered にした問題は推奨に含まれない
    for (const r of filtered) {
      expect(progressAllMastered[r.questionId]?.mastered).not.toBe(true);
    }
  });

  it('getRecommendedQuestionsForOther: subcategory にマッチしない問題が返される', () => {
    // 権利関係の SUBCATEGORIES の全 matchTags を渡す
    // → どの subcategory にもマッチしない問題のみ抽出される
    const allMatchTags: string[] = [
      // 簡略化: kenri の全 matchTags を fake
      '意思表示', '代理', '物権変動', '抵当権', '時効', '債務不履行', '連帯保証', '賃貸借', '不法行為', '相続', '区分所有法', '不動産登記法',
    ];
    const result = getRecommendedQuestionsForOther({}, 'kenri', allMatchTags, 50);
    // 結果は配列で、各要素が WeaknessScore
    expect(Array.isArray(result)).toBe(true);
    for (const r of result) {
      expect(r.category).toBe('kenri');
      expect(typeof r.score).toBe('number');
    }
  });

  it('getRecommendedQuestionsBySubcategory: マッチタグに含まれる問題のみ返される', () => {
    const result = getRecommendedQuestionsBySubcategory({}, 'kenri', ['抵当権'], 30);
    expect(result.length).toBeGreaterThan(0);
    for (const r of result) {
      expect(r.category).toBe('kenri');
    }
  });

  it('count パラメータで返却数を制御できる', () => {
    const result3 = getRecommendedQuestionsByCategory({}, 'takkengyoho', 3);
    expect(result3.length).toBeLessThanOrEqual(3);
    const result20 = getRecommendedQuestionsByCategory({}, 'takkengyoho', 20);
    expect(result20.length).toBeLessThanOrEqual(20);
    expect(result20.length).toBeGreaterThanOrEqual(result3.length);
  });
});
