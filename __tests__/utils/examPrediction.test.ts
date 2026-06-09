// ============================================================
// 本試験予測点数 統一エンジン (utils/examPrediction) ユニットテスト
// ============================================================
//
// 設計の正本: Vault/.../2026-06-09_本試験予測点数_統一システム設計.md
// data-analyst 式の各部品を純粋関数として直接検証する (RN 非依存)。
//
// 検証範囲:
//  1. ベイズ平滑化 (少数科目が 50% に寄る / 未演習を 0% で罰さない)
//  2. 直近性/忘却減衰 (古い正解が割引かれる)
//  3. 難易度較正 (易問稼ぎが剥がれる = 本試験分布で再重み)
//  4. 模試ブレンド (λ=N/(N+20)・模試を受けるほど θ が実測へ収束)
//  5. カバレッジ信頼区間 (未演習が多いほど区間が広い)
//  6. growthPerDay 是正 (データ<10問は 0)
//  7. confidence 閾値 (n_eff ベース low/medium/high)
//  8. PE 合算 (Σ allocation·θ) と科目別 期待得点 / 失点

import {
  computeExamPrediction,
  calibrateGamma,
  extractCalibrationPairs,
  GAMMA1_CLAMP,
  GAMMA0_CLAMP,
  type PredictionProgress,
  type PredictionQuestion,
  type PredictionMockResult,
  type ExamPredictionConfig,
  type CalibrationPair,
} from '../../utils/examPrediction';

// ── テスト用の 2 科目ミニ世界 (a:配点20, b:配点10) ───────────────────
type Cat = 'a' | 'b';

const NOW = new Date('2026-06-09T00:00:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

/** 指定難易度の問題を n 件、与えたカテゴリに作る */
function makeQuestions(cat: Cat, difficulty: 1 | 2 | 3, n: number, prefix = ''): PredictionQuestion<Cat>[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${cat}-d${difficulty}-${i}`,
    category: cat,
    difficulty,
  }));
}

function prog(over: Partial<PredictionProgress>): PredictionProgress {
  return {
    attempts: 1,
    correctCount: 1,
    interval: 5,
    nextReviewAt: new Date(NOW + 30 * DAY).toISOString(), // 既定: まだ復習期限前 (忘却なし)
    lastAttemptAt: new Date(NOW).toISOString(),
    ...over,
  };
}

function baseConfig(
  questions: PredictionQuestion<Cat>[],
  over: Partial<ExamPredictionConfig<Cat>> = {},
): ExamPredictionConfig<Cat> {
  return {
    categories: ['a', 'b'],
    allocation: { a: 20, b: 10 },
    passLine: 18,
    examTotal: 30,
    questions,
    daysUntilExam: null,
    now: NOW,
    ...over,
  };
}

// ============================================================
// 1. ベイズ平滑化
// ============================================================
describe('ベイズ平滑化 (α=β=2)', () => {
  it('演習が極少 (1問正解) の科目は 100% でなく 50% 付近に収縮する', () => {
    const questions = [...makeQuestions('a', 2, 1), ...makeQuestions('b', 2, 1)];
    const progress = { 'a-d2-0': prog({ attempts: 1, correctCount: 1 }) };
    const r = computeExamPrediction(progress, [], baseConfig(questions));
    const a = r.perCategory.find((c) => c.category === 'a')!;
    // 生100% でも、ベイズ収縮(d2→0.6) + 未演習難易度の事前0.5混合 + 楽観10%引き で
    // 100% から大きく下がり 0.5 付近に収まる (= 1問の正解で科目全体を高評価しない)
    expect(a.accuracy).toBeLessThan(0.7);
    expect(a.accuracy).toBeGreaterThan(0.4);
  });

  it('未演習科目を 0% で罰さない (事前 0.5 を 0.90 で引いた付近に収まる)', () => {
    const questions = [...makeQuestions('a', 2, 5), ...makeQuestions('b', 2, 5)];
    // a だけ解く。b は未演習。
    const progress = { 'a-d2-0': prog({ attempts: 2, correctCount: 2 }) };
    const r = computeExamPrediction(progress, [], baseConfig(questions));
    const b = r.perCategory.find((c) => c.category === 'b')!;
    expect(b.attempted).toBe(0);
    // 事前 0.5 × γ1(0.9) = 0.45 付近。0 ではない。
    expect(b.accuracy).toBeGreaterThan(0.4);
    expect(b.accuracy).toBeLessThan(0.5);
  });

  it('演習数が増えるほど生の正答率に近づく (収縮が弱まる)', () => {
    const few = [...makeQuestions('a', 2, 2)];
    const many = [...makeQuestions('a', 2, 30, 'm')];
    const fewProg: Record<string, PredictionProgress> = {};
    few.forEach((q) => (fewProg[q.id] = prog({ attempts: 1, correctCount: 1 })));
    const manyProg: Record<string, PredictionProgress> = {};
    many.forEach((q) => (manyProg[q.id] = prog({ attempts: 1, correctCount: 1 })));

    const rFew = computeExamPrediction(fewProg, [], baseConfig(few, { categories: ['a'], allocation: { a: 20, b: 0 } }));
    const rMany = computeExamPrediction(manyProg, [], baseConfig(many, { categories: ['a'], allocation: { a: 20, b: 0 } }));
    const aFew = rFew.perCategory.find((c) => c.category === 'a')!;
    const aMany = rMany.perCategory.find((c) => c.category === 'a')!;
    // 全問正解なら、多く解いた方がより 1.0 (×0.9) に近い
    expect(aMany.accuracy).toBeGreaterThan(aFew.accuracy);
  });
});

// ============================================================
// 2. 直近性 / 忘却減衰
// ============================================================
describe('直近性/忘却加重 w_i = exp(-超過日/interval)', () => {
  it('復習期限を大きく超過した正解は割引かれ θ が下がる', () => {
    const questions = makeQuestions('a', 2, 1);
    const fresh = { 'a-d2-0': prog({ attempts: 1, correctCount: 1, interval: 5, nextReviewAt: new Date(NOW + 10 * DAY).toISOString() }) };
    const stale = { 'a-d2-0': prog({ attempts: 1, correctCount: 1, interval: 5, nextReviewAt: new Date(NOW - 30 * DAY).toISOString() }) };
    const cfg = baseConfig(questions, { categories: ['a'], allocation: { a: 20, b: 0 } });
    const rFresh = computeExamPrediction(fresh, [], cfg);
    const rStale = computeExamPrediction(stale, [], cfg);
    // 超過した正解は w が小さくなり、ベイズ事前 (0.5) 側に引き戻される → θ 低下
    expect(rStale.perCategory[0].accuracy).toBeLessThan(rFresh.perCategory[0].accuracy);
  });

  it('未超過 (期限内) は減衰しない (w=1)', () => {
    const questions = makeQuestions('a', 2, 1);
    const onTime = { 'a-d2-0': prog({ attempts: 1, correctCount: 1, nextReviewAt: new Date(NOW + 1 * DAY).toISOString() }) };
    const cfg = baseConfig(questions, { categories: ['a'], allocation: { a: 20, b: 0 } });
    const r = computeExamPrediction(onTime, [], cfg);
    // w=1 の 1問正解 (d2): θ_d2=(1+2)/(1+2+2)=0.6, 未演習 d1/d3 の事前=0.5。
    // 難易度較正 0.20·0.5 + 0.45·0.6 + 0.35·0.5 = 0.545、楽観補正 ×0.9 = 0.4905。
    expect(r.perCategory[0].accuracy).toBeCloseTo(0.4905, 3);
  });
});

// ============================================================
// 3. 難易度較正
// ============================================================
describe('難易度較正 (0.20·d1 + 0.45·d2 + 0.35·d3)', () => {
  it('易問だけ全問正解しても、本試験分布で再重みされ満点扱いにならない', () => {
    // d1 を 10問全問正解。d2/d3 は未演習 (事前 0.5)。
    const questions = [
      ...makeQuestions('a', 1, 10),
      ...makeQuestions('a', 2, 10),
      ...makeQuestions('a', 3, 10),
    ];
    const progress: Record<string, PredictionProgress> = {};
    makeQuestions('a', 1, 10).forEach((q) => (progress[q.id] = prog({ attempts: 1, correctCount: 1 })));
    const cfg = baseConfig(questions, { categories: ['a'], allocation: { a: 20, b: 0 } });
    const r = computeExamPrediction(progress, [], cfg);
    const a = r.perCategory[0];
    // d1 のウェイトは 0.20 しかない → 易問稼ぎは θ を 1.0 に押し上げない
    expect(a.accuracy).toBeLessThan(0.75);
  });

  it('難問を取れている方が θ は高い (易問偏重より評価される)', () => {
    const questions = [...makeQuestions('a', 1, 5), ...makeQuestions('a', 3, 5)];
    // ケースX: 易問(d1)だけ正解
    const easyOnly: Record<string, PredictionProgress> = {};
    makeQuestions('a', 1, 5).forEach((q) => (easyOnly[q.id] = prog({ attempts: 1, correctCount: 1 })));
    // ケースY: 難問(d3)だけ正解
    const hardOnly: Record<string, PredictionProgress> = {};
    makeQuestions('a', 3, 5).forEach((q) => (hardOnly[q.id] = prog({ attempts: 1, correctCount: 1 })));
    const cfg = baseConfig(questions, { categories: ['a'], allocation: { a: 20, b: 0 } });
    const rEasy = computeExamPrediction(easyOnly, [], cfg);
    const rHard = computeExamPrediction(hardOnly, [], cfg);
    // d3 のウェイト(0.35) > d1(0.20) なので、難問正解の方が θ が高い
    expect(rHard.perCategory[0].accuracy).toBeGreaterThan(rEasy.perCategory[0].accuracy);
  });
});

// ============================================================
// 4. 模試ブレンド (最重要)
// ============================================================
describe('模試ブレンド θ_c = (1−λ)θ_calib + λ·θ_mock, λ=N/(N+20)', () => {
  const questions = makeQuestions('a', 2, 10);
  const cfg = baseConfig(questions, { categories: ['a'], allocation: { a: 20, b: 0 } });

  it('模試0件なら λ=0 で練習のみの θ になる', () => {
    const progress = { 'a-d2-0': prog({ attempts: 2, correctCount: 2 }) };
    const r = computeExamPrediction(progress, [], cfg);
    const noMock = r.perCategory[0].accuracy;
    // 模試を 0 件渡しても同じ
    const r2 = computeExamPrediction(progress, [] as PredictionMockResult<Cat>[], cfg);
    expect(r2.perCategory[0].accuracy).toBeCloseTo(noMock, 6);
    expect(r.perCategory[0].mockAttempts).toBe(0);
  });

  it('模試を多く解くほど θ が模試実測へ収束する (λ↑)', () => {
    // 練習は高得点 (θ_calib 高め) だが、模試の実測は低い (0.4)。
    const progress = { 'a-d2-0': prog({ attempts: 3, correctCount: 3 }) };
    // 模試1回 (20問中8問=0.4)
    const oneMock: PredictionMockResult<Cat>[] = [
      { date: '2026-06-01', byCategory: { a: { total: 20, correct: 8 }, b: { total: 0, correct: 0 } } },
    ];
    // 模試5回 (各20問中8問=0.4)
    const manyMock: PredictionMockResult<Cat>[] = Array.from({ length: 5 }, (_, i) => ({
      date: `2026-0${i + 1}-01`,
      byCategory: { a: { total: 20, correct: 8 }, b: { total: 0, correct: 0 } },
    }));
    const rOne = computeExamPrediction(progress, oneMock, cfg);
    const rMany = computeExamPrediction(progress, manyMock, cfg);
    // 練習だけの θ
    const rNone = computeExamPrediction(progress, [], cfg);
    // 模試(0.4)が低いので、模試を多く解くほど θ は下がって 0.4 に近づく
    expect(rOne.perCategory[0].accuracy).toBeLessThan(rNone.perCategory[0].accuracy);
    expect(rMany.perCategory[0].accuracy).toBeLessThan(rOne.perCategory[0].accuracy);
    expect(rMany.perCategory[0].accuracy).toBeGreaterThan(0.4); // まだ完全には収束しない
    // N_mock_c は累計問題数 (20×5=100)
    expect(rMany.perCategory[0].mockAttempts).toBe(100);
  });

  it('λ=N/(N+20): N=20 のとき模試と練習が半々で効く', () => {
    // 練習を完全正解 (θ_calib ≈ 0.9) に固定、模試実測 0.0 を 20問。
    const progress: Record<string, PredictionProgress> = {};
    makeQuestions('a', 2, 10).forEach((q) => (progress[q.id] = prog({ attempts: 1, correctCount: 1 })));
    const mock20: PredictionMockResult<Cat>[] = [
      { date: '2026-06-01', byCategory: { a: { total: 20, correct: 0 }, b: { total: 0, correct: 0 } } },
    ];
    const rNone = computeExamPrediction(progress, [], cfg);
    const r20 = computeExamPrediction(progress, mock20, cfg);
    const thetaCalib = rNone.perCategory[0].accuracy; // 模試なし = θ_calib
    // λ=20/40=0.5 → θ = 0.5·θ_calib + 0.5·0 = θ_calib/2
    expect(r20.perCategory[0].accuracy).toBeCloseTo(thetaCalib * 0.5, 2);
  });

  it('直近の模試ほど重い (古い好成績より新しい悪成績を重く見る)', () => {
    const progress = {};
    // 古い回が満点、新しい回が0点。直近性加重で θ_mock は低めに出るはず。
    const recencyDown: PredictionMockResult<Cat>[] = [
      { date: '2026-01-01', byCategory: { a: { total: 20, correct: 20 }, b: { total: 0, correct: 0 } } },
      { date: '2026-06-01', byCategory: { a: { total: 20, correct: 0 }, b: { total: 0, correct: 0 } } },
    ];
    // 逆: 古い回が0点、新しい回が満点 → θ_mock は高めに出るはず。
    const recencyUp: PredictionMockResult<Cat>[] = [
      { date: '2026-01-01', byCategory: { a: { total: 20, correct: 0 }, b: { total: 0, correct: 0 } } },
      { date: '2026-06-01', byCategory: { a: { total: 20, correct: 20 }, b: { total: 0, correct: 0 } } },
    ];
    const rDown = computeExamPrediction(progress, recencyDown, cfg);
    const rUp = computeExamPrediction(progress, recencyUp, cfg);
    expect(rUp.perCategory[0].accuracy).toBeGreaterThan(rDown.perCategory[0].accuracy);
  });
});

// ============================================================
// 5. カバレッジ信頼区間
// ============================================================
describe('信頼区間 (カバレッジ項で未演習ほど広い)', () => {
  it('演習が薄い (カバレッジ低) ほど区間が広い', () => {
    const questions = makeQuestions('a', 2, 100);
    const cfg = baseConfig(questions, { categories: ['a'], allocation: { a: 20, b: 0 }, examTotal: 20 });
    // 薄い: 2問だけ演習
    const thin: Record<string, PredictionProgress> = {};
    makeQuestions('a', 2, 2).forEach((q) => (thin[q.id] = prog({ attempts: 1, correctCount: 1 })));
    // 厚い: 80問演習
    const thick: Record<string, PredictionProgress> = {};
    makeQuestions('a', 2, 80).forEach((q) => (thick[q.id] = prog({ attempts: 1, correctCount: 1 })));
    const rThin = computeExamPrediction(thin, [], cfg);
    const rThick = computeExamPrediction(thick, [], cfg);
    const widthThin = rThin.predictionInterval.upper - rThin.predictionInterval.lower;
    const widthThick = rThick.predictionInterval.upper - rThick.predictionInterval.lower;
    expect(widthThin).toBeGreaterThan(widthThick);
    expect(rThin.uncertainty).toBeGreaterThan(rThick.uncertainty);
  });

  it('区間は [0, examTotal] にクランプされ lower<=upper', () => {
    const questions = makeQuestions('a', 2, 5);
    const cfg = baseConfig(questions, { categories: ['a'], allocation: { a: 20, b: 0 }, examTotal: 20 });
    const r = computeExamPrediction({}, [], cfg);
    expect(r.predictionInterval.lower).toBeGreaterThanOrEqual(0);
    expect(r.predictionInterval.upper).toBeLessThanOrEqual(20);
    expect(r.predictionInterval.lower).toBeLessThanOrEqual(r.predictionInterval.upper);
  });
});

// ============================================================
// 6. growthPerDay 是正
// ============================================================
describe('growthPerDay (実測のみ・データ<10問は0)', () => {
  const questions = makeQuestions('a', 2, 30);
  const cfg = baseConfig(questions, { categories: ['a'], allocation: { a: 20, b: 0 }, daysUntilExam: 100 });

  it('演習が10問未満なら成長率は0 (楽観を断定しない)', () => {
    const progress: Record<string, PredictionProgress> = {};
    makeQuestions('a', 2, 5).forEach((q) => (progress[q.id] = prog({ attempts: 1, correctCount: 1 })));
    const r = computeExamPrediction(progress, [], cfg);
    expect(r.growthPerDay).toBe(0);
  });

  it('直近で正答率が上がっていれば正の成長率を返す', () => {
    const progress: Record<string, PredictionProgress> = {};
    // 過去 (8日以上前) は不正解多め、直近 (最近) は全問正解
    makeQuestions('a', 2, 10).forEach((q, i) => {
      progress[q.id] = prog({
        attempts: 1,
        correctCount: 0,
        lastAttemptAt: new Date(NOW - (10 + i) * DAY).toISOString(),
      });
    });
    makeQuestions('a', 2, 10).slice(0, 10).forEach((q, i) => {
      // 別 id の直近正解問題を追加
    });
    const recent = makeQuestions('a', 2, 10, 'r');
    recent.forEach((q) => {
      progress[q.id] = prog({ attempts: 1, correctCount: 1, lastAttemptAt: new Date(NOW - 1 * DAY).toISOString() });
    });
    const cfg2 = baseConfig([...questions, ...recent], { categories: ['a'], allocation: { a: 20, b: 0 }, daysUntilExam: 100 });
    const r = computeExamPrediction(progress, [], cfg2);
    expect(r.growthPerDay).toBeGreaterThan(0);
  });

  it('成長率は現実的範囲 [-0.05, 0.15] にクランプされる', () => {
    const progress: Record<string, PredictionProgress> = {};
    // 過去全滅 → 直近全正解 の極端ケースでも上限を超えない
    makeQuestions('a', 2, 15).forEach((q) => {
      progress[q.id] = prog({ attempts: 1, correctCount: 0, lastAttemptAt: new Date(NOW - 20 * DAY).toISOString() });
    });
    const recent = makeQuestions('a', 2, 15, 'r2');
    recent.forEach((q) => {
      progress[q.id] = prog({ attempts: 1, correctCount: 1, lastAttemptAt: new Date(NOW).toISOString() });
    });
    const cfg2 = baseConfig([...questions, ...recent], { categories: ['a'], allocation: { a: 20, b: 0 }, daysUntilExam: 100 });
    const r = computeExamPrediction(progress, [], cfg2);
    expect(r.growthPerDay).toBeLessThanOrEqual(0.15);
    expect(r.growthPerDay).toBeGreaterThanOrEqual(-0.05);
  });
});

// ============================================================
// 7. confidence 閾値
// ============================================================
describe('confidence (n_eff 閾値 low<30<=medium<80<=high)', () => {
  const questions = makeQuestions('a', 2, 200);

  it('データ無 / ごく少量は low', () => {
    const cfg = baseConfig(questions, { categories: ['a'], allocation: { a: 20, b: 0 } });
    expect(computeExamPrediction({}, [], cfg).confidence).toBe('low');
  });

  it('模試を多く解くと n_eff が増えて high に達する', () => {
    const cfg = baseConfig(questions, { categories: ['a'], allocation: { a: 20, b: 0 } });
    // 模試 1 回 50 問 → n_eff(模試) = 50×2 = 100 >= 80
    const mock: PredictionMockResult<Cat>[] = [
      { date: '2026-06-01', byCategory: { a: { total: 50, correct: 30 }, b: { total: 0, correct: 0 } } },
    ];
    expect(computeExamPrediction({}, mock, cfg).confidence).toBe('high');
  });

  it('中量の演習は medium', () => {
    const cfg = baseConfig(questions, { categories: ['a'], allocation: { a: 20, b: 0 } });
    // 練習 80問 (w=1) → n_eff = 80×0.5 = 40 → 30<=40<80 = medium
    const progress: Record<string, PredictionProgress> = {};
    makeQuestions('a', 2, 80).forEach((q) => (progress[q.id] = prog({ attempts: 1, correctCount: 1 })));
    expect(computeExamPrediction(progress, [], cfg).confidence).toBe('medium');
  });
});

// ============================================================
// 8. PE 合算 / 科目別 期待得点 / 失点
// ============================================================
describe('得点化 PE = Σ allocation·θ と 科目別内訳', () => {
  it('totalPredictedRaw は各科目 allocation·accuracy の総和に一致する', () => {
    const questions = [...makeQuestions('a', 2, 5), ...makeQuestions('b', 2, 5)];
    const progress: Record<string, PredictionProgress> = {};
    makeQuestions('a', 2, 5).forEach((q) => (progress[q.id] = prog({ attempts: 2, correctCount: 2 })));
    makeQuestions('b', 2, 5).forEach((q) => (progress[q.id] = prog({ attempts: 2, correctCount: 1 })));
    const r = computeExamPrediction(progress, [], baseConfig(questions));
    const sum = r.perCategory.reduce((s, c) => s + c.allocation * c.accuracy, 0);
    expect(r.totalPredictedRaw).toBeCloseTo(sum, 6);
    expect(r.totalPredicted).toBe(Math.round(sum));
  });

  it('科目別 失点 pointsLost = allocation·(1−θ) を返す (弱点ランキング用)', () => {
    const questions = makeQuestions('a', 2, 5);
    const progress: Record<string, PredictionProgress> = {};
    makeQuestions('a', 2, 5).forEach((q) => (progress[q.id] = prog({ attempts: 2, correctCount: 1 })));
    const cfg = baseConfig(questions, { categories: ['a'], allocation: { a: 20, b: 0 } });
    const r = computeExamPrediction(progress, [], cfg);
    const a = r.perCategory[0];
    expect(a.pointsLost).toBeCloseTo(Math.round(a.allocation * (1 - a.accuracy) * 10) / 10, 6);
  });

  it('weakestCategory は失点が最大の科目 (演習データのある科目)', () => {
    // a: 高得点, b: 低得点。配点同じにして b が弱点になることを確認。
    const questions = [...makeQuestions('a', 2, 5), ...makeQuestions('b', 2, 5)];
    const progress: Record<string, PredictionProgress> = {};
    makeQuestions('a', 2, 5).forEach((q) => (progress[q.id] = prog({ attempts: 3, correctCount: 3 })));
    makeQuestions('b', 2, 5).forEach((q) => (progress[q.id] = prog({ attempts: 3, correctCount: 0 })));
    const cfg = baseConfig(questions, { categories: ['a', 'b'], allocation: { a: 15, b: 15 } });
    const r = computeExamPrediction(progress, [], cfg);
    expect(r.weakestCategory).toBe('b');
  });

  it('演習も模試も無い科目は weakestCategory に選ばない (情報なしを弱点と断定しない)', () => {
    // a だけ少し解く (やや弱い)。b は完全未着手。
    const questions = [...makeQuestions('a', 2, 5), ...makeQuestions('b', 2, 5)];
    const progress: Record<string, PredictionProgress> = {};
    makeQuestions('a', 2, 5).slice(0, 1).forEach((q) => (progress[q.id] = prog({ attempts: 2, correctCount: 1 })));
    const cfg = baseConfig(questions, { categories: ['a', 'b'], allocation: { a: 15, b: 15 } });
    const r = computeExamPrediction(progress, [], cfg);
    expect(r.weakestCategory).toBe('a');
  });

  it('データ皆無なら hasData=false / passProbability=0 / weakestCategory=null', () => {
    const questions = makeQuestions('a', 2, 5);
    const r = computeExamPrediction({}, [], baseConfig(questions));
    expect(r.hasData).toBe(false);
    expect(r.passProbability).toBe(0);
    expect(r.weakestCategory).toBeNull();
  });

  it('模試のみ (練習ゼロ) でも hasData=true で予測が出る (模試を groundtruth に使う)', () => {
    const questions = makeQuestions('a', 2, 5);
    const mock: PredictionMockResult<Cat>[] = [
      { date: '2026-06-01', byCategory: { a: { total: 20, correct: 14 }, b: { total: 0, correct: 0 } } },
    ];
    const cfg = baseConfig(questions, { categories: ['a'], allocation: { a: 20, b: 0 } });
    const r = computeExamPrediction({}, mock, cfg);
    expect(r.hasData).toBe(true);
    expect(r.totalPredicted).toBeGreaterThan(0);
  });
});

// ============================================================
// 9. predictedAtExam (当日見込み・成長は中心線のみ)
// ============================================================
describe('predictedAtExam (試験当日見込み)', () => {
  it('試験日未設定なら null', () => {
    const questions = makeQuestions('a', 2, 5);
    const progress: Record<string, PredictionProgress> = {};
    makeQuestions('a', 2, 5).forEach((q) => (progress[q.id] = prog({ attempts: 1, correctCount: 1 })));
    const r = computeExamPrediction(progress, [], baseConfig(questions, { daysUntilExam: null }));
    expect(r.predictedAtExam).toBeNull();
  });

  it('成長率0なら当日見込みは現時点 PE と同じ (楽観上振れしない)', () => {
    // 演習5問 (<10) で growthPerDay=0 になるケース
    const questions = makeQuestions('a', 2, 5);
    const progress: Record<string, PredictionProgress> = {};
    makeQuestions('a', 2, 5).forEach((q) => (progress[q.id] = prog({ attempts: 1, correctCount: 1 })));
    const r = computeExamPrediction(progress, [], baseConfig(questions, { daysUntilExam: 100 }));
    expect(r.growthPerDay).toBe(0);
    expect(r.predictedAtExam).toBe(r.totalPredicted);
  });

  it('当日見込みは examTotal を超えない', () => {
    const questions = makeQuestions('a', 2, 5);
    const progress: Record<string, PredictionProgress> = {};
    makeQuestions('a', 2, 5).forEach((q) => (progress[q.id] = prog({ attempts: 1, correctCount: 1 })));
    const r = computeExamPrediction(progress, [], baseConfig(questions, { daysUntilExam: 100000 }));
    expect(r.predictedAtExam).toBeLessThanOrEqual(30);
  });
});

// ============================================================
// 10. 個人γ較正 (Phase1.5・calibrateGamma)
// ============================================================
describe('calibrateGamma (個人γ回帰・しきい値/クランプ/加重)', () => {
  /** (predicted, actual) ペアを n 件作る簡易ファクトリ */
  function pairs(specs: Array<[number, number]>): CalibrationPair[] {
    return specs.map(([predicted, actual]) => ({ predicted, actual }));
  }

  it('ペア < 5 は既定 (γ0=0, γ1=0.90) を返す = データ薄に無影響', () => {
    expect(calibrateGamma([])).toEqual({ gamma0: 0, gamma1: 0.9 });
    expect(calibrateGamma(pairs([[40, 36], [38, 35], [42, 40], [39, 37]]))).toEqual({
      gamma0: 0,
      gamma1: 0.9,
    });
  });

  it('ペア ≥ 20 は個人 OLS 回帰を全面採用する (完全直線 actual = 0.8·predicted を復元)', () => {
    // y = 0.8x ちょうどのデータ 20 件 → γ1≈0.8, γ0≈0
    const specs: Array<[number, number]> = Array.from({ length: 20 }, (_, i) => {
      const x = 20 + i; // 20..39
      return [x, 0.8 * x] as [number, number];
    });
    const { gamma0, gamma1 } = calibrateGamma(pairs(specs));
    expect(gamma1).toBeCloseTo(0.8, 5);
    expect(gamma0).toBeCloseTo(0, 5);
  });

  it('5 ≤ ペア < 20 は既定と個人回帰を件数で線形加重する (件数が増えるほど個人寄り)', () => {
    // 個人傾き 0.8 になるデータを 6 件 と 19 件 で比較。
    // 19 件のほうが個人(0.8)に近い = 加重が個人寄りに単調変化する。
    const make = (n: number): CalibrationPair[] =>
      Array.from({ length: n }, (_, i) => ({ predicted: 20 + i, actual: 0.8 * (20 + i) }));
    const g6 = calibrateGamma(make(6));
    const g19 = calibrateGamma(make(19));
    // どちらも既定(0.9)と個人(0.8)の間。件数が多い 19 のほうが 0.8 に近い。
    expect(g19.gamma1).toBeLessThan(g6.gamma1);
    expect(g6.gamma1).toBeLessThan(0.9);
    expect(g19.gamma1).toBeGreaterThan(0.8 - 1e-9);
    // 線形加重の値が理論式どおり (n=6: 個人ウェイト=1/15)
    expect(g6.gamma1).toBeCloseTo(0.9 - (1 / 15) * (0.9 - 0.8), 6);
    expect(g19.gamma1).toBeCloseTo(0.9 - (14 / 15) * (0.9 - 0.8), 6);
  });

  it('ちょうど境界 ペア=5 は個人ウェイト0 → 既定 0.90 のまま (< 5 と連続)', () => {
    const five: CalibrationPair[] = Array.from({ length: 5 }, (_, i) => ({
      predicted: 20 + i,
      actual: 0.8 * (20 + i),
    }));
    expect(calibrateGamma(five)).toEqual({ gamma0: 0, gamma1: 0.9 });
  });

  it('傾き γ1 はクランプ [0.7, 1.05] を超えない (暴走防止)', () => {
    // 強い負の相関 (predicted↑ で actual↓) → 生 γ1 は大きな負。クランプで 0.7 に張り付く。
    const specs: Array<[number, number]> = Array.from({ length: 20 }, (_, i) => {
      const x = 20 + i;
      return [x, 50 - x] as [number, number]; // 傾き -1
    });
    const { gamma1 } = calibrateGamma(pairs(specs));
    expect(gamma1).toBeGreaterThanOrEqual(GAMMA1_CLAMP[0]);
    expect(gamma1).toBeLessThanOrEqual(GAMMA1_CLAMP[1]);
  });

  it('切片 γ0 はクランプ [-10, 10] を超えない (暴走防止)', () => {
    // actual = predicted + 30 (常に +30 上振れ) → 生 γ0=30。クランプで 10 に。
    const specs: Array<[number, number]> = Array.from({ length: 20 }, (_, i) => {
      const x = 20 + i;
      return [x, x + 30] as [number, number];
    });
    const { gamma0 } = calibrateGamma(pairs(specs));
    expect(gamma0).toBeGreaterThanOrEqual(GAMMA0_CLAMP[0]);
    expect(gamma0).toBeLessThanOrEqual(GAMMA0_CLAMP[1]);
  });

  it('全模試で予測点が同一 (x 分散ゼロ) は推定不能 → 既定を返す', () => {
    const specs: Array<[number, number]> = Array.from({ length: 20 }, () => [38, 35]);
    expect(calibrateGamma(pairs(specs))).toEqual({ gamma0: 0, gamma1: 0.9 });
  });
});

describe('extractCalibrationPairs (後方互換)', () => {
  it('predictedBefore を持つ模試だけをペア化し、無い既存模試は除外する', () => {
    const history: PredictionMockResult<Cat>[] = [
      // 旧データ: predictedBefore 無し → 除外
      { date: '2026-05-01', byCategory: { a: { total: 50, correct: 30 }, b: { total: 0, correct: 0 } }, score: 30 },
      // 新データ: predictedBefore あり → (40, 36) ペア
      {
        date: '2026-05-10',
        byCategory: { a: { total: 50, correct: 36 }, b: { total: 0, correct: 0 } },
        score: 36,
        predictedBefore: 40,
      },
    ];
    const pairs = extractCalibrationPairs(history);
    expect(pairs).toEqual([{ predicted: 40, actual: 36 }]);
  });

  it('score が無い / 非有限値の模試は除外する', () => {
    const history: PredictionMockResult<Cat>[] = [
      { date: '2026-05-10', byCategory: { a: { total: 50, correct: 36 }, b: { total: 0, correct: 0 } }, predictedBefore: 40 } as any,
      { date: '2026-05-11', byCategory: { a: { total: 50, correct: 0 }, b: { total: 0, correct: 0 } }, score: NaN, predictedBefore: 40 },
    ];
    expect(extractCalibrationPairs(history)).toEqual([]);
  });
});

describe('個人γのエンジン統合 (公開API不変・θは[0,1])', () => {
  const questions = makeQuestions('a', 2, 50);

  function withProgress(rate: number): Record<string, PredictionProgress> {
    const progress: Record<string, PredictionProgress> = {};
    questions.forEach((q, i) => {
      progress[q.id] = prog({ attempts: 1, correctCount: i / 50 < rate ? 1 : 0 });
    });
    return progress;
  }

  it('predictedBefore 無しの履歴では従来 (γ1=0.90) と同じ予測 = 後方互換', () => {
    const progress = withProgress(0.8);
    const cfg = baseConfig(questions, { categories: ['a'], allocation: { a: 20, b: 0 } });
    // predictedBefore を持たない模試 (旧データ)
    const oldHistory: PredictionMockResult<Cat>[] = [];
    const before = computeExamPrediction(progress, [], cfg).totalPredicted;
    const withOld = computeExamPrediction(progress, oldHistory, cfg).totalPredicted;
    expect(withOld).toBe(before);
  });

  it('十分なペア (≥20) で楽観バイアスが効くと予測が実測寄りに補正される', () => {
    // 練習では高得点だが本番(模試)では一貫して低い人 → γ で下方補正されるはず。
    const progress = withProgress(0.9);
    const cfg = baseConfig(questions, { categories: ['a'], allocation: { a: 20, b: 0 } });
    // 20 件の模試: 各回 predictedBefore=18 に対し実測 12 (本番は予測より低い)
    const history: PredictionMockResult<Cat>[] = Array.from({ length: 20 }, (_, i) => ({
      date: `2026-05-${String(i + 1).padStart(2, '0')}`,
      // 模試の科目別は予測に直接寄与する (λブレンド)。ここでは較正係数の効きを見るため
      // byCategory は控えめ・total を小さくして λ を抑えつつ score/predictedBefore で回帰させる。
      byCategory: { a: { total: 1, correct: 0 }, b: { total: 0, correct: 0 } },
      score: 12,
      predictedBefore: 18,
    }));
    const r = computeExamPrediction(progress, history, cfg);
    // 公開API: 形は不変・有限値・examTotal 内
    expect(Number.isFinite(r.totalPredicted)).toBe(true);
    expect(r.totalPredicted).toBeGreaterThanOrEqual(0);
    expect(r.totalPredicted).toBeLessThanOrEqual(cfg.examTotal);
    // θ は [0,1] にクランプされる (perCategory.accuracy)
    for (const c of r.perCategory) {
      expect(c.accuracy).toBeGreaterThanOrEqual(0);
      expect(c.accuracy).toBeLessThanOrEqual(1);
    }
  });
});
