// ============================================================
// utils/categoryRecommender.ts (弱点カテゴリ判定) テスト
// ============================================================
//
// app/(tabs)/quick-quiz.tsx のスマートスタート機能で使用される
// findWeakestCategory が仕様通り動くことを検証する。
//
// 仕様:
// - 各カテゴリで stat.total >= 3 のもののみ評価対象
// - 正答率 (correct/total) が最も低いカテゴリを返す
// - データが3問未満しかないカテゴリ、または全く無いカテゴリは無視
// - 評価対象がない場合は null を返す
// - 同率の場合は CATEGORIES 配列順で最初に見つかったものを返す

import { findWeakestCategory, CategoryStatsLike } from '../../utils/categoryRecommender';

describe('findWeakestCategory - 弱点カテゴリ判定', () => {
  // ----------------------------------------------------------
  // 基本動作
  // ----------------------------------------------------------

  test('categoryStats が null なら null を返す', () => {
    expect(findWeakestCategory(null)).toBeNull();
  });

  test('categoryStats が undefined なら null を返す', () => {
    expect(findWeakestCategory(undefined)).toBeNull();
  });

  test('categoryStats が空オブジェクトなら null を返す', () => {
    expect(findWeakestCategory({})).toBeNull();
  });

  // ----------------------------------------------------------
  // データ少量除外 (stat.total < 3)
  // ----------------------------------------------------------

  test('すべてのカテゴリが 3問未満なら null を返す', () => {
    const stats: CategoryStatsLike = {
      kenri: { correct: 0, total: 2 },
      takkengyoho: { correct: 1, total: 1 },
      horei_seigen: { correct: 0, total: 0 },
      tax_other: { correct: 1, total: 2 },
    };
    expect(findWeakestCategory(stats)).toBeNull();
  });

  test('total が 3 未満のカテゴリは正答率が低くても評価対象にならない', () => {
    // takkengyoho は total=2 (正答率 0%) だが除外される
    // kenri は total=10 (正答率 50%) で評価対象
    const stats: CategoryStatsLike = {
      kenri: { correct: 5, total: 10 }, // 50%
      takkengyoho: { correct: 0, total: 2 }, // 0% だが除外
    };
    expect(findWeakestCategory(stats)).toBe('kenri');
  });

  test('境界値: total=3 は評価対象に含まれる', () => {
    const stats: CategoryStatsLike = {
      kenri: { correct: 0, total: 3 }, // 0%, 評価対象
    };
    expect(findWeakestCategory(stats)).toBe('kenri');
  });

  test('境界値: total=2 は評価対象に含まれない', () => {
    const stats: CategoryStatsLike = {
      kenri: { correct: 0, total: 2 }, // 0% だが除外
    };
    expect(findWeakestCategory(stats)).toBeNull();
  });

  // ----------------------------------------------------------
  // 最低正答率カテゴリの選択
  // ----------------------------------------------------------

  test('最も正答率の低いカテゴリを返す', () => {
    const stats: CategoryStatsLike = {
      kenri: { correct: 8, total: 10 }, // 80%
      takkengyoho: { correct: 3, total: 10 }, // 30% ← 最弱
      horei_seigen: { correct: 5, total: 10 }, // 50%
      tax_other: { correct: 7, total: 10 }, // 70%
    };
    expect(findWeakestCategory(stats)).toBe('takkengyoho');
  });

  test('正答率0%のカテゴリが選ばれる', () => {
    const stats: CategoryStatsLike = {
      kenri: { correct: 1, total: 5 }, // 20%
      takkengyoho: { correct: 0, total: 3 }, // 0% ← 最弱
    };
    expect(findWeakestCategory(stats)).toBe('takkengyoho');
  });

  test('正答率100%だけのカテゴリだと、最初に見つかったものが選ばれる', () => {
    const stats: CategoryStatsLike = {
      kenri: { correct: 10, total: 10 }, // 100%
      takkengyoho: { correct: 5, total: 5 }, // 100%
    };
    expect(findWeakestCategory(stats)).toBe('kenri');
  });

  // ----------------------------------------------------------
  // 同率の場合
  // ----------------------------------------------------------

  test('同率の場合、CATEGORIES 配列順で最初のものが選ばれる', () => {
    const stats: CategoryStatsLike = {
      kenri: { correct: 5, total: 10 }, // 50%
      takkengyoho: { correct: 5, total: 10 }, // 50% (同率)
      horei_seigen: { correct: 5, total: 10 }, // 50% (同率)
    };
    // CATEGORIES = ['kenri', 'takkengyoho', 'horei_seigen', 'tax_other']
    expect(findWeakestCategory(stats)).toBe('kenri');
  });

  // ----------------------------------------------------------
  // 一部のカテゴリのみデータがある場合
  // ----------------------------------------------------------

  test('1カテゴリのみデータがある場合、そのカテゴリが返る', () => {
    const stats: CategoryStatsLike = {
      horei_seigen: { correct: 2, total: 5 }, // 40%
    };
    expect(findWeakestCategory(stats)).toBe('horei_seigen');
  });

  test('複数カテゴリで、一部のみ評価対象（3問以上）の場合', () => {
    const stats: CategoryStatsLike = {
      kenri: { correct: 1, total: 2 }, // 除外（total<3）
      takkengyoho: { correct: 8, total: 10 }, // 80%
      horei_seigen: { correct: 3, total: 10 }, // 30% ← 最弱
      tax_other: { correct: 0, total: 1 }, // 除外（total<3）
    };
    expect(findWeakestCategory(stats)).toBe('horei_seigen');
  });

  // ----------------------------------------------------------
  // 異常値耐性
  // ----------------------------------------------------------

  test('correct > total のような不正値でも例外を起こさない', () => {
    const stats: CategoryStatsLike = {
      kenri: { correct: 100, total: 3 },
    };
    // 100/3 = 33.3 > 1.01 なので weakest にならない
    expect(findWeakestCategory(stats)).toBeNull();
  });

  test('total=0 のカテゴリは安全に除外される（ゼロ除算回避）', () => {
    const stats: CategoryStatsLike = {
      kenri: { correct: 0, total: 0 }, // 除外
      takkengyoho: { correct: 3, total: 10 }, // 30%
    };
    expect(findWeakestCategory(stats)).toBe('takkengyoho');
  });

  // ----------------------------------------------------------
  // カスタム categories 引数
  // ----------------------------------------------------------

  test('categories 引数で評価順を変更できる', () => {
    const stats: CategoryStatsLike = {
      kenri: { correct: 5, total: 10 }, // 50%
      takkengyoho: { correct: 5, total: 10 }, // 50% (同率)
    };
    // 順序を逆にすると takkengyoho が先に見つかる
    expect(findWeakestCategory(stats, ['takkengyoho', 'kenri'])).toBe('takkengyoho');
  });
});
