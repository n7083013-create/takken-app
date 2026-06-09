// ============================================================
// 本試験予測点数 統一エンジン (computeExamPrediction) — 純粋ロジック
// ============================================================
//
// 設計の正本: Vault/10_Projects/資格アプリ開発/2026-06-09_本試験予測点数_統一システム設計.md
//   (learning-scientist + data-analyst + designer + 憲法・全員一致の確定設計)
//
// 単一の真実源 = 本試験予測点数 PE。4指標(合格距離/科目別/弱点/模試)を
// 同じ PE の異なる断面に統一する Phase1 のコア。
//
// ⚠️ このファイルは RN / expo / zustand を import しないこと。
//    examConfig で 配点(allocation)/合格ライン/総問数/掲載問題 を注入し、
//    takken(4科目) / gas(6科目58問) の両方が同一エンジンを使う。jest(node) で直接テスト可能。
//
// モデル (科目 c ごとに真の正答率 θ_c を推定し、配点で得点化):
//   (a) ベイズ平滑化:   θ_raw = (Σ w_i·x_i + α) / (Σ w_i + α + β)   α=β=2
//                       x_i=正誤, w_i=exp(-超過日/max(interval,1)) (直近性/忘却加重)
//                       母数は「演習済み」ベース (未演習を 0% で罰しない)
//   (b) 難易度較正:     難易度別 θ を 0.20·d1 + 0.45·d2 + 0.35·d3 で本試験分布に再重み
//   (c) 楽観バイアス:   θ_calib = γ0 + γ1·θ  (初期 γ0=0, γ1=0.90 = 練習は本番より甘いので一律10%引き)
//   (d) 模試ブレンド:   θ_c = (1−λ_c)·θ_calib + λ_c·θ_mock_c
//                       λ_c = N_mock_c/(N_mock_c+20), θ_mock_c=模試科目別正答率(直近性加重 ρ=0.85)
//   得点化:             PE = Σ allocation_c·θ_c   (科目別 期待得点 PE_c=allocation_c·θ_c も返す)
//   信頼区間:           Var = Σ allocation_c²·[ θ(1−θ)/n_eff_c + (1−cov_c)²·σ_prior² ]
//                       n_eff_c = Σw_i(練習)·0.5 + N_mock_c·2,  cov_c = 演習済/掲載
//                       PE ± 1.96·√Var  (未演習が多いほど広い = 誠実)

// ── モデル定数 (data-analyst 式) ────────────────────────────────────
/** ベイズ平滑化の擬似観測 (α=β=2 で少数科目は 50% に寄る) */
const BAYES_ALPHA = 2;
const BAYES_BETA = 2;

/** 本試験の難易度分布 (易20% / 標準45% / 難35%) — 難易度較正の再重み */
const DIFFICULTY_WEIGHTS: Record<1 | 2 | 3, number> = { 1: 0.2, 2: 0.45, 3: 0.35 };

/** 楽観バイアス補正 θ_calib = γ0 + γ1·θ。練習は本番より甘いので一律10%引き。
 *  TODO(Phase1.5): 模試5件以上で個人ごとの (γ0,γ1) を回帰学習する。今は固定。 */
const GAMMA0 = 0;
const GAMMA1 = 0.9;

/** 模試ブレンドの収束定数 λ_c = N_mock_c/(N_mock_c+K)。K問解くと模試と練習が半々。 */
const MOCK_BLEND_K = 20;

/** 模試の直近性加重 (新しい回ほど重い・幾何減衰) */
const MOCK_RECENCY_RHO = 0.85;

/** カバレッジ未達ぶんの事前分散 σ_prior² (未演習科目の不確実性) */
const PRIOR_VARIANCE = 0.25 ** 2; // σ=0.25 (正答率の標準偏差として保守的)

/** n_eff の重み: 練習1問は模試1問より情報が薄い (甘い/単発)。模試を厚く効かせる。 */
const PRACTICE_NEFF_WEIGHT = 0.5;
const MOCK_NEFF_WEIGHT = 2;

/** confidence 閾値 (n_eff ベース) */
const CONFIDENCE_LOW_MAX = 30;
const CONFIDENCE_HIGH_MIN = 80;

/** growthPerDay (実測成長) の現実的クランプ (点/日) */
const GROWTH_MIN = -0.05;
const GROWTH_MAX = 0.15;
/** 実測成長を信頼するのに必要な最小演習数 (これ未満は 0 = 「伸びるはず」を断定しない) */
const GROWTH_MIN_SAMPLES = 10;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// ── 入出力型 ───────────────────────────────────────────────────────

/** エンジンが必要とする 1 問の最小情報 (掲載問題から抽出して渡す) */
export interface PredictionQuestion<C extends string> {
  id: string;
  category: C;
  difficulty: 1 | 2 | 3;
}

/** エンジンが必要とする 1 問の進捗の最小情報 (QuestionProgress の部分集合) */
export interface PredictionProgress {
  attempts: number;
  correctCount: number;
  /** SM-2: 次の復習までの日数 (忘却加重 w_i の安定度に使う) */
  interval: number;
  /** 次の復習予定 (ISO)。超過していれば忘却で割引 */
  nextReviewAt: string;
  /** 最終解答日時 (ISO)。実測成長率の算出に使う */
  lastAttemptAt?: string | null;
  /** ユーザー手動マスターは予測に含めない (任意・gas には無い) */
  mastered?: boolean;
}

/** 模試 1 回分の最小情報 (ExamResult の部分集合) */
export interface PredictionMockResult<C extends string> {
  date: string;
  byCategory: Record<C, { total: number; correct: number }>;
}

export interface ExamPredictionConfig<C extends string> {
  /** 科目軸 (得点化・配点の単位) */
  categories: readonly C[];
  /** 本試験の科目別配点 */
  allocation: Record<C, number>;
  /** 合格ライン (問) */
  passLine: number;
  /** 本試験の総問数 */
  examTotal: number;
  /** 掲載問題 (id/category/difficulty)。カバレッジ(cov)と難易度較正に使う */
  questions: ReadonlyArray<PredictionQuestion<C>>;
  /** 試験日までの残り日数 (未設定/算出不能なら null) */
  daysUntilExam: number | null;
  /** 計算の基準時刻 (テスト用に注入可能。既定 Date.now()) */
  now?: number;
}

export interface CategoryPrediction<C extends string> {
  category: C;
  allocation: number;
  /** 推定真の正答率 θ_c (0-1) */
  accuracy: number;
  /** 科目別 期待得点 PE_c = allocation_c·θ_c */
  predicted: number;
  /** 演習済みの掲載問題数 (この科目で attempts>0 の問題数) */
  attempted: number;
  /** 失点 = allocation_c·(1−θ_c)。Phase2 の失点ランキング用 */
  pointsLost: number;
  /** カバレッジ = 演習済 / 掲載 (0-1)。低いほど不確実 */
  coverage: number;
  /** この科目の模試累計解答数 N_mock_c (λ の算出に使用) */
  mockAttempts: number;
}

export interface ExamPredictionResult<C extends string> {
  perCategory: CategoryPrediction<C>[];
  /** 本試験予測点数 PE (四捨五入) */
  totalPredicted: number;
  /** PE の生値 (丸め前。passProbability 等の内部計算用に保持) */
  totalPredictedRaw: number;
  hasData: boolean;
  /** 合格確率 (0-100) */
  passProbability: number;
  /** 信頼度: low=データ薄(レンジ表示推奨) / medium / high */
  confidence: 'low' | 'medium' | 'high';
  /** 試験日までの残り日数 (未設定なら null) */
  daysUntilExam: number | null;
  /** 試験当日の見込み点 (中心線にのみ成長を反映。未設定/データ無は null) */
  predictedAtExam: number | null;
  /** 合格ラインまでの不足点 (合格圏内なら 0) */
  pointsToPass: number;
  /** 最も合格を下げている科目 = 失点最大 (演習データが無ければ null) */
  weakestCategory: C | null;
  /** 95% 信頼区間 (PE ± 1.96·√Var) */
  predictionInterval: { lower: number; upper: number };
  /** 1日あたり実測成長率 (点/日)。データ<10問は 0 (楽観を断定しない) */
  growthPerDay: number;
  /** 予測の不確実性 (√Var)。レンジ幅の根拠 */
  uncertainty: number;
  /** 総有効標本数 n_eff (信頼度/区間の母数) */
  effectiveSampleSize: number;
}

// ── 内部ヘルパー ───────────────────────────────────────────────────

/** 1 問の忘却/直近性加重 w_i = exp(-超過日/max(interval,1))。未超過は 1。 */
function forgettingWeight(p: PredictionProgress, now: number): number {
  const reviewDue = new Date(p.nextReviewAt).getTime();
  if (Number.isNaN(reviewDue) || now <= reviewDue) return 1;
  const overdueDays = (now - reviewDue) / MS_PER_DAY;
  const stability = Math.max(p.interval, 1);
  return Math.exp(-overdueDays / stability);
}

/** ロジスティック: 予測点 → 合格確率。合格ライン付近で滑らかに 0-100%。
 *  k=0.35 で 合格ライン±6点 ≒ 10%↔90%。 */
function scoreToProb(score: number, passLine: number): number {
  const raw = 1 / (1 + Math.exp(-0.35 * (score - passLine)));
  return Math.round(raw * 100);
}

/**
 * 個人別の実測成長率 (点/日)。直近7日 vs それ以前の正答率差を 1日・総問数換算。
 * データ<10問は 0 (= 「これから伸びるはず」を断定せず楽観是正)。
 */
function computeGrowthPerDay<C extends string>(
  questions: ReadonlyArray<PredictionQuestion<C>>,
  progressById: (id: string) => PredictionProgress | undefined,
  totalAttempted: number,
  examTotal: number,
  now: number,
): number {
  if (totalAttempted < GROWTH_MIN_SAMPLES) return 0;
  const sevenDaysAgo = now - 7 * MS_PER_DAY;
  let recentCorrect = 0;
  let recentTotal = 0;
  let oldCorrect = 0;
  let oldTotal = 0;
  for (const q of questions) {
    const p = progressById(q.id);
    if (!p || p.attempts === 0 || !p.lastAttemptAt) continue;
    const ts = new Date(p.lastAttemptAt).getTime();
    if (Number.isNaN(ts)) continue;
    if (ts >= sevenDaysAgo) {
      recentCorrect += p.correctCount;
      recentTotal += p.attempts;
    } else {
      oldCorrect += p.correctCount;
      oldTotal += p.attempts;
    }
  }
  // 直近 or 過去のいずれかが無ければ成長を主張しない (中道・誠実)
  if (recentTotal === 0 || oldTotal === 0) return 0;
  const recentRate = recentCorrect / recentTotal;
  const oldRate = oldCorrect / oldTotal;
  const dailyImprovement = ((recentRate - oldRate) / 7) * examTotal;
  return Math.max(GROWTH_MIN, Math.min(GROWTH_MAX, dailyImprovement));
}

/**
 * 模試履歴から科目別の正答率 θ_mock_c と累計解答数 N_mock_c を直近性加重で集計。
 * 新しい回ほど重い (幾何減衰 ρ)。N_mock_c は λ 用に「素の累計問題数」を別途数える。
 */
function aggregateMock<C extends string>(
  categories: readonly C[],
  examHistory: ReadonlyArray<PredictionMockResult<C>>,
): Record<C, { rate: number | null; n: number }> {
  const out = {} as Record<C, { rate: number | null; n: number }>;
  // 直近性加重: 新しい回から rho^0, rho^1, ... を割り当てるため日付降順に並べる
  const sorted = [...examHistory].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  for (const cat of categories) {
    let weightedCorrect = 0;
    let weightedTotal = 0;
    let rawTotal = 0; // N_mock_c (素の累計 = λ 用)
    sorted.forEach((result, idx) => {
      const bc = result.byCategory?.[cat];
      if (!bc || bc.total === 0) return;
      const w = Math.pow(MOCK_RECENCY_RHO, idx);
      weightedCorrect += w * bc.correct;
      weightedTotal += w * bc.total;
      rawTotal += bc.total;
    });
    out[cat] = {
      rate: weightedTotal > 0 ? weightedCorrect / weightedTotal : null,
      n: rawTotal,
    };
  }
  return out;
}

// ── メインエンジン ─────────────────────────────────────────────────

/**
 * 本試験予測点数 PE を算出する純粋関数。
 * progress(練習) と examHistory(模試実測) を data-analyst の式でブレンドし、
 * 配点(config.allocation)で得点化する。takken/gas 共通。
 */
export function computeExamPrediction<C extends string>(
  progress: Record<string, PredictionProgress>,
  examHistory: ReadonlyArray<PredictionMockResult<C>>,
  config: ExamPredictionConfig<C>,
): ExamPredictionResult<C> {
  const now = config.now ?? Date.now();
  const progressById = (id: string) => progress[id];

  // マスター済みは予測の母数から外す (ユーザーが卒業宣言した問題)
  const isCounted = (p: PredictionProgress | undefined): p is PredictionProgress =>
    !!p && p.attempts > 0 && p.mastered !== true;

  const mockByCat = aggregateMock(config.categories, examHistory);

  // 科目別に掲載問題を引くためのインデックス
  const questionsByCat = new Map<C, PredictionQuestion<C>[]>();
  for (const cat of config.categories) questionsByCat.set(cat, []);
  for (const q of config.questions) {
    const arr = questionsByCat.get(q.category);
    if (arr) arr.push(q);
  }

  let totalAttempted = 0;
  let totalVariance = 0;
  let totalEffN = 0;

  const perCategory: CategoryPrediction<C>[] = config.categories.map((cat) => {
    const allocation = config.allocation[cat] ?? 0;
    const catQuestions = questionsByCat.get(cat) ?? [];
    const publishedCount = catQuestions.length;

    // ── (a)+(b) 難易度別に重み付き正答率を集計 → ベイズ平滑化 → 本試験分布で再重み ──
    const byDifficulty: Record<1 | 2 | 3, { wCorrect: number; wTotal: number; sumW: number }> = {
      1: { wCorrect: 0, wTotal: 0, sumW: 0 },
      2: { wCorrect: 0, wTotal: 0, sumW: 0 },
      3: { wCorrect: 0, wTotal: 0, sumW: 0 },
    };
    let attempted = 0;
    let practiceWeightSum = 0; // Σw_i (練習) — n_eff 用

    for (const q of catQuestions) {
      const p = progressById(q.id);
      if (!isCounted(p)) continue;
      attempted++;
      const w = forgettingWeight(p, now);
      const acc = p.correctCount / p.attempts; // この問題の正答率 (0-1)
      const bucket = byDifficulty[q.difficulty];
      bucket.wCorrect += w * acc;
      bucket.wTotal += w;
      bucket.sumW += w;
      practiceWeightSum += w;
    }

    // 難易度別 θ をベイズ平滑化 (演習が無い難易度は事前 0.5 = α/(α+β))。
    // 不確実性(カバレッジ)は後段の coverage 項で吸収する。
    const thetaByDifficulty = ([1, 2, 3] as const).map((d) => {
      const b = byDifficulty[d];
      return (b.wCorrect + BAYES_ALPHA) / (b.wTotal + BAYES_ALPHA + BAYES_BETA);
    });
    // (b) 本試験難易度分布で再重み
    const thetaCalibInput =
      DIFFICULTY_WEIGHTS[1] * thetaByDifficulty[0] +
      DIFFICULTY_WEIGHTS[2] * thetaByDifficulty[1] +
      DIFFICULTY_WEIGHTS[3] * thetaByDifficulty[2];

    // (c) 楽観バイアス補正
    const thetaCalib = GAMMA0 + GAMMA1 * thetaCalibInput;

    // (d) 模試ブレンド
    const mock = mockByCat[cat];
    const nMock = mock.n;
    const lambda = nMock > 0 ? nMock / (nMock + MOCK_BLEND_K) : 0;
    const thetaMock = mock.rate; // null なら模試なし
    const theta =
      lambda > 0 && thetaMock !== null
        ? (1 - lambda) * thetaCalib + lambda * thetaMock
        : thetaCalib;

    const predicted = allocation * theta;
    const pointsLost = allocation * (1 - theta);
    const coverage = publishedCount > 0 ? Math.min(1, attempted / publishedCount) : 0;

    // ── 信頼区間用の分散 ──
    // n_eff_c = Σw_i(練習)·0.5 + N_mock_c·2  (模試を厚く効かせる)
    const nEff = practiceWeightSum * PRACTICE_NEFF_WEIGHT + nMock * MOCK_NEFF_WEIGHT;
    const binomialVar = nEff > 0 ? (theta * (1 - theta)) / nEff : 0.25; // 標本ゼロは最大不確実
    const coverageVar = (1 - coverage) ** 2 * PRIOR_VARIANCE;
    const categoryVar = allocation ** 2 * (binomialVar + coverageVar);

    totalAttempted += attempted;
    totalVariance += categoryVar;
    totalEffN += nEff;

    return {
      category: cat,
      allocation,
      accuracy: theta,
      predicted: Math.round(predicted * 10) / 10,
      attempted,
      pointsLost: Math.round(pointsLost * 10) / 10,
      coverage,
      mockAttempts: nMock,
    };
  });

  const totalPredictedRaw = perCategory.reduce((sum, c) => sum + c.allocation * c.accuracy, 0);
  const totalPredicted = Math.round(totalPredictedRaw);
  const hasMock = examHistory.length > 0;
  const hasData = totalAttempted > 0 || hasMock;

  const passProbability = hasData ? scoreToProb(totalPredictedRaw, config.passLine) : 0;

  // 信頼度: n_eff ベース。low はレンジ表示(Phase2)用。
  let confidence: 'low' | 'medium' | 'high';
  if (totalEffN >= CONFIDENCE_HIGH_MIN) confidence = 'high';
  else if (totalEffN >= CONFIDENCE_LOW_MAX) confidence = 'medium';
  else confidence = 'low';

  // 実測成長率 (データ<10問は 0)
  const growthPerDay = hasData
    ? computeGrowthPerDay(config.questions, progressById, totalAttempted, config.examTotal, now)
    : 0;

  // 試験当日の見込み (中心線にのみ成長を反映)。成長の不確実性は区間に別途加算する。
  const daysUntilExam = config.daysUntilExam;
  let predictedAtExam: number | null = null;
  if (daysUntilExam !== null && hasData) {
    const projected = totalPredictedRaw + daysUntilExam * growthPerDay;
    predictedAtExam = Math.round(Math.min(Math.max(projected, 0), config.examTotal));
  }

  // ── 95% 信頼区間 ──
  // 成長外挿の不確実性も加算 (遠い試験日ほど予測が揺れる)。
  // 成長率の標準誤差を growthPerDay の絶対値の半分と仮置きし、日数で線形に拡大。
  const growthUncertainty =
    daysUntilExam !== null ? Math.abs(growthPerDay) * 0.5 * daysUntilExam : 0;
  const uncertainty = Math.sqrt(totalVariance + growthUncertainty ** 2);
  const ciMargin = 1.96 * uncertainty;
  // 中心線は当日見込みがあればそれ、無ければ現時点 PE
  const center = predictedAtExam ?? totalPredictedRaw;
  const predictionInterval = {
    lower: Math.max(0, Math.round(center - ciMargin)),
    upper: Math.min(config.examTotal, Math.round(center + ciMargin)),
  };

  const pointsToPass = Math.max(0, config.passLine - totalPredicted);

  // 最も合格を下げている科目 = 失点 (allocation·(1−θ)) 最大。演習データのある科目を優先。
  let weakestCategory: C | null = null;
  let maxLoss = -1;
  for (const c of perCategory) {
    if (c.allocation === 0) continue;
    // 演習も模試も無い科目は「弱点」と断定しない (情報が無い)
    if (c.attempted === 0 && c.mockAttempts === 0) continue;
    if (c.pointsLost > maxLoss) {
      maxLoss = c.pointsLost;
      weakestCategory = c.category;
    }
  }
  if (!hasData) weakestCategory = null;

  return {
    perCategory,
    totalPredicted,
    totalPredictedRaw,
    hasData,
    passProbability,
    confidence,
    daysUntilExam,
    predictedAtExam,
    pointsToPass,
    weakestCategory,
    predictionInterval,
    growthPerDay,
    uncertainty,
    effectiveSampleSize: totalEffN,
  };
}
