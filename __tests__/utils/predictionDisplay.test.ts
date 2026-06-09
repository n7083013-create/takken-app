// ============================================================
// 予測ハブ 表示ヘルパー (utils/predictionDisplay) ユニットテスト
// ============================================================
// Phase2 UI の薄い変換層を純粋関数として検証する (RN 非依存)。

import {
  questionsToNextConfidence,
  distributePointsLostToSubcategories,
  recoverablePoints,
  type SubcategoryStat,
} from '../../utils/predictionDisplay';

describe('questionsToNextConfidence (あと◯問で精度↑)', () => {
  it('high は 0 (これ以上の精度向上メッセージは不要)', () => {
    expect(questionsToNextConfidence(200, 'high')).toBe(0);
  });

  it('low (n_eff=0) は medium 閾値(30)まで n_eff を埋める問題数 = 30/0.5 = 60', () => {
    expect(questionsToNextConfidence(0, 'low')).toBe(60);
  });

  it('medium (n_eff=40) は high 閾値(80)まで (80-40)/0.5 = 80 問', () => {
    expect(questionsToNextConfidence(40, 'medium')).toBe(80);
  });

  it('閾値に肉薄していても最低 1 問は返す (0 問で精度↑にならない)', () => {
    expect(questionsToNextConfidence(29.9, 'low')).toBe(1);
  });
});

describe('distributePointsLostToSubcategories (失点をサブカテゴリへ按分)', () => {
  const subs: SubcategoryStat[] = [
    { label: '借地借家', categoryLabel: '権利関係', missWeight: 6 },
    { label: '抵当権', categoryLabel: '権利関係', missWeight: 3 },
    { label: '意思表示', categoryLabel: '権利関係', missWeight: 1 },
  ];

  it('科目失点を missWeight 比で按分する (合計が科目失点に概ね一致)', () => {
    const rows = distributePointsLostToSubcategories(5, subs);
    const sum = rows.reduce((s, r) => s + r.pointsLost, 0);
    expect(sum).toBeCloseTo(5, 1);
    // 借地借家(6/10) が最大の失点
    expect(rows[0].label).toBe('借地借家');
    expect(rows[0].pointsLost).toBeCloseTo(3, 1);
  });

  it('失点降順に並ぶ', () => {
    const rows = distributePointsLostToSubcategories(5, subs);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].pointsLost).toBeGreaterThanOrEqual(rows[i].pointsLost);
    }
  });

  it('missWeight 合計 0 (全マスター/未着手) はスキップ (空配列)', () => {
    const allMastered: SubcategoryStat[] = [
      { label: 'x', categoryLabel: 'c', missWeight: 0 },
      { label: 'y', categoryLabel: 'c', missWeight: 0 },
    ];
    expect(distributePointsLostToSubcategories(5, allMastered)).toEqual([]);
  });

  it('科目失点 0 なら空配列', () => {
    expect(distributePointsLostToSubcategories(0, subs)).toEqual([]);
  });

  it('0.1 点未満の極小行はノイズとして落とす', () => {
    const skewed: SubcategoryStat[] = [
      { label: 'big', categoryLabel: 'c', missWeight: 1000 },
      { label: 'tiny', categoryLabel: 'c', missWeight: 1 },
    ];
    const rows = distributePointsLostToSubcategories(1, skewed);
    expect(rows.find((r) => r.label === 'tiny')).toBeUndefined();
  });
});

describe('recoverablePoints (上位N件克服で +◯点)', () => {
  it('上位 N 件の失点合計を返す', () => {
    const rows = [
      { label: 'a', categoryLabel: 'c', pointsLost: 3.2 },
      { label: 'b', categoryLabel: 'c', pointsLost: 2.1 },
      { label: 'c', categoryLabel: 'c', pointsLost: 1.0 },
    ];
    expect(recoverablePoints(rows, 2)).toBeCloseTo(5.3, 1);
  });

  it('N が件数を超えても全件合計で安全', () => {
    const rows = [{ label: 'a', categoryLabel: 'c', pointsLost: 1.5 }];
    expect(recoverablePoints(rows, 5)).toBeCloseTo(1.5, 1);
  });
});
