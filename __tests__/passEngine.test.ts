// ============================================================
// 合格エンジン (utils/passEngine) ユニットテスト
// ============================================================
//
// 検証範囲 (Vault 2026-06-08 4エージェント相談 Phase 1.5):
//  1. capIntervalToExam: 締切逆算 SM-2 cap (近接 / 遠方 / 未設定)
//  2. calculateSM2 統合: cap が interval に効く / 未設定で従来どおり
//  3. buildPassQueue: due上限 / 新規最低保証 / 同一カテゴリ非連続 / フェーズ別ペース
//  4. selectPreSleepReview: 新規除外 / 当日苦戦問題の優先
//  5. evaluateTodayCompletion: due消化主体の完了判定

import { calculateSM2 } from '../store/useProgressStore';
import {
  capIntervalToExam,
  phaseForDays,
  classifyTiers,
  interleaveByCategory,
  buildPassQueue,
  selectPreSleepReview,
  evaluateTodayCompletion,
  computeTodayAction,
  pickOneSmart,
  NEW_FLOOR,
  DUE_CAP,
  INPUT_NEW_PACE_FLOOR,
} from '../utils/passEngine';
import { ALL_QUESTIONS } from '../data';
import type { Category, QuestionProgress } from '../types';

// calculateSM2 は useProgressStore 経由で import するため、その副作用 import を黙らせる。
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));
jest.mock('../services/cloudSync', () => ({
  pullFromCloud: jest.fn(() => Promise.resolve(null)),
  pushProgressToCloud: jest.fn(() => Promise.resolve()),
  pushStatsToCloud: jest.fn(() => Promise.resolve()),
  mergeProgress: jest.fn((a: unknown) => a),
  markDirty: jest.fn(),
}));
jest.mock('../services/notifications', () => ({
  refreshNotificationsAfterAnswer: jest.fn(() => Promise.resolve()),
}));
jest.mock('../services/errorLogger', () => ({ logError: jest.fn() }));

// ── テスト用フィクスチャヘルパー ──────────────────────────────────────
const idsByCat = (cat: Category, n: number): string[] =>
  ALL_QUESTIONS.filter((q) => q.category === cat).slice(0, n).map((q) => q.id);

const catOf = new Map(ALL_QUESTIONS.map((q) => [q.id, q.category] as const));

function mkProgress(over: Partial<QuestionProgress> & { questionId: string }): QuestionProgress {
  return {
    attempts: 1,
    correctCount: 1,
    correctStreak: 1,
    lastAttemptAt: new Date().toISOString(),
    bookmarked: false,
    nextReviewAt: new Date().toISOString(),
    easeFactor: 2.5,
    interval: 1,
    ...over,
  };
}

/** due 状態 (期限切れ) の進捗を作る */
function dueProgress(id: string, overdueDays = 1, accuracy = 0.5): QuestionProgress {
  return mkProgress({
    questionId: id,
    attempts: 2,
    correctCount: Math.round(2 * accuracy),
    correctStreak: 0,
    nextReviewAt: new Date(Date.now() - overdueDays * 86400000).toISOString(),
  });
}

const ISO = (d: Date | number) => new Date(d).toISOString();

// ============================================================
// 1. capIntervalToExam
// ============================================================
describe('capIntervalToExam - 締切逆算 cap', () => {
  it('試験日未設定 (null) は上限なし', () => {
    expect(capIntervalToExam(120, null)).toBe(120);
    expect(capIntervalToExam(120, undefined)).toBe(120);
  });

  it('試験が遠い (interval が残り日数に収まる) なら interval をそのまま返す', () => {
    // interval 30日, 試験まで100日 → 飛び越えないのでそのまま
    expect(capIntervalToExam(30, 100)).toBe(30);
  });

  it('試験が近い (interval が試験を飛び越える) なら前日までに頭打ち', () => {
    // interval 30日, 試験まで10日 → 試験前日(9日)で cap
    expect(capIntervalToExam(30, 10)).toBe(9);
  });

  it('試験当日 / 前日でも最低1日は確保する', () => {
    expect(capIntervalToExam(30, 1)).toBe(1); // 明日が試験
    expect(capIntervalToExam(30, 0)).toBe(1); // 今日が試験
  });
});

// ============================================================
// 2. calculateSM2 統合 (締切 cap が effective か)
// ============================================================
describe('calculateSM2 - 締切 cap 統合', () => {
  it('試験日未設定 (省略 / null) なら従来どおり大きな interval を返す', () => {
    // 高 streak + high confidence で 50*2.5*1.3 級の大きな interval
    const noArg = calculateSM2(true, 50, 2.5, 5, 'high');
    const explicitNull = calculateSM2(true, 50, 2.5, 5, 'high', null);
    expect(noArg.interval).toBe(explicitNull.interval);
    expect(noArg.interval).toBeGreaterThan(100);
  });

  it('試験が近いと正解しても interval が試験前日で頭打ちになる (二度と出題されない欠陥の解消)', () => {
    const near = calculateSM2(true, 50, 2.5, 5, 'high', 10);
    expect(near.interval).toBe(9); // 試験前日
  });

  it('不正解は cap の有無に関係なく interval=1 (cap は正解時の暴走だけ抑える)', () => {
    expect(calculateSM2(false, 60, 2.5, 5, 'low', 10).interval).toBe(1);
    expect(calculateSM2(false, 60, 2.5, 5, 'low', null).interval).toBe(1);
  });

  it('既存の 5 引数呼び出しと挙動が一致 (後方互換)', () => {
    const legacy = calculateSM2(true, 0, 2.5, 0, 'low');
    expect(legacy.interval).toBe(1);
  });
});

// ============================================================
// 3. phaseForDays
// ============================================================
describe('phaseForDays - フェーズ判定', () => {
  it('>45日 = インプット期', () => {
    expect(phaseForDays(100)).toBe('input');
    expect(phaseForDays(46)).toBe('input');
  });
  it('45-15日 = 定着期', () => {
    expect(phaseForDays(45)).toBe('consolidation');
    expect(phaseForDays(30)).toBe('consolidation');
    expect(phaseForDays(15)).toBe('consolidation');
  });
  it('<15日 = 直前期', () => {
    expect(phaseForDays(14)).toBe('final');
    expect(phaseForDays(0)).toBe('final');
  });
  it('試験日未設定 (null) は安全側のインプット期', () => {
    expect(phaseForDays(null)).toBe('input');
    expect(phaseForDays(undefined)).toBe('input');
  });
});

// ============================================================
// 4. interleaveByCategory
// ============================================================
describe('interleaveByCategory - 科目インターリーブ', () => {
  it('同一カテゴリが連続しないよう並べ替える', () => {
    const kenri = idsByCat('kenri', 5);
    const gyoho = idsByCat('takkengyoho', 5);
    // わざと「全部kenri → 全部gyoho」の偏った並びを渡す
    const out = interleaveByCategory([...kenri, ...gyoho]);
    expect(out).toHaveLength(10);
    let consecutive = 0;
    for (let i = 1; i < out.length; i++) {
      if (catOf.get(out[i]) === catOf.get(out[i - 1])) consecutive++;
    }
    // 2カテゴリが均等 (5/5) なら理論上 0 連続にできる
    expect(consecutive).toBe(0);
  });

  it('1カテゴリしか無い場合はそのまま返す (落とさない)', () => {
    const kenri = idsByCat('kenri', 4);
    const out = interleaveByCategory(kenri);
    expect(out.sort()).toEqual(kenri.sort());
  });

  it('要素を増減させない', () => {
    const mixed = [...idsByCat('kenri', 3), ...idsByCat('tax_other', 7)];
    const out = interleaveByCategory(mixed);
    expect(new Set(out)).toEqual(new Set(mixed));
  });
});

// ============================================================
// 5. classifyTiers
// ============================================================
describe('classifyTiers - 出題ティア分類', () => {
  it('due / weak / unseen を正しく分類する', () => {
    const due = idsByCat('kenri', 1)[0];
    const weakId = idsByCat('takkengyoho', 1)[0];
    const progress: Record<string, QuestionProgress> = {
      [due]: dueProgress(due),
      [weakId]: mkProgress({
        questionId: weakId,
        attempts: 4,
        correctCount: 1, // 25% = 苦手
        correctStreak: 0,
        nextReviewAt: ISO(Date.now() + 10 * 86400000), // まだ due ではない
      }),
    };
    const t = classifyTiers(progress);
    expect(t.due.map((q) => q.id)).toContain(due);
    expect(t.weak.map((q) => q.id)).toContain(weakId);
    // 触っていない問題は unseen
    expect(t.unseen.length).toBe(ALL_QUESTIONS.length - 2);
  });

  it('mastered は due / weak から除外される', () => {
    const id = idsByCat('kenri', 1)[0];
    const progress = {
      [id]: { ...dueProgress(id), mastered: true },
    };
    const t = classifyTiers(progress);
    expect(t.due.map((q) => q.id)).not.toContain(id);
    expect(t.weak.map((q) => q.id)).not.toContain(id);
    expect(t.unseen.map((q) => q.id)).not.toContain(id); // mastered は未解答にも入れない
  });
});

// ============================================================
// 6. buildPassQueue
// ============================================================
describe('buildPassQueue - 合格エンジン キュー構成', () => {
  it('due が DUE_CAP を超えても 1 セッションの上限を超えて出さない (繰越)', () => {
    // 直前期 (final) は DUE_CAP=30。due を 50 件作る。
    const dueIds = idsByCat('kenri', 50);
    const progress: Record<string, QuestionProgress> = {};
    dueIds.forEach((id, i) => { progress[id] = dueProgress(id, i + 1); });

    const q = buildPassQueue(progress, { daysUntilExam: 5, sessionSize: 100 });
    const dueInQueue = q.filter((id) => dueIds.includes(id));
    expect(dueInQueue.length).toBeLessThanOrEqual(DUE_CAP.final);
  });

  it('due が枠を埋めても 新規最低保証 (NEW_FLOOR) の新規が必ず入る', () => {
    // インプット期 (input) は NEW_FLOOR=5。due を大量に作り、新規が押し出されないか検証。
    const dueIds = idsByCat('kenri', 40);
    const progress: Record<string, QuestionProgress> = {};
    dueIds.forEach((id, i) => { progress[id] = dueProgress(id, i + 1); });

    // sessionSize を小さく (10) しても新規最低保証が守られること
    const q = buildPassQueue(progress, { daysUntilExam: 100, sessionSize: 10 });
    const seen = new Set(Object.keys(progress));
    const newInQueue = q.filter((id) => !seen.has(id));
    expect(newInQueue.length).toBeGreaterThanOrEqual(NEW_FLOOR.input);
  });

  it('直前期は新規をほぼ止める (NEW_FLOOR.final=0)', () => {
    const dueIds = idsByCat('kenri', 40);
    const progress: Record<string, QuestionProgress> = {};
    dueIds.forEach((id, i) => { progress[id] = dueProgress(id, i + 1); });

    const q = buildPassQueue(progress, { daysUntilExam: 3, sessionSize: 20 });
    // 直前期は due が十分あるので新規は 0 (最低保証 0 + due でサイズが埋まる)
    const seen = new Set(Object.keys(progress));
    const newInQueue = q.filter((id) => !seen.has(id));
    expect(newInQueue.length).toBe(0);
  });

  it('出力は同一カテゴリが連続しない (科目インターリーブ済)', () => {
    // 複数カテゴリの due を作る
    const progress: Record<string, QuestionProgress> = {};
    for (const cat of ['kenri', 'takkengyoho', 'horei_seigen', 'tax_other'] as Category[]) {
      idsByCat(cat, 5).forEach((id, i) => { progress[id] = dueProgress(id, i + 1); });
    }
    const q = buildPassQueue(progress, { daysUntilExam: 5, sessionSize: 20 });
    let consecutive = 0;
    for (let i = 1; i < q.length; i++) {
      if (catOf.get(q[i]) === catOf.get(q[i - 1])) consecutive++;
    }
    // 4カテゴリが均等に近いので連続はほぼ起きない。最悪でもごく僅か。
    expect(consecutive).toBeLessThanOrEqual(2);
  });

  it('新規ペース上限 — 残り日数が多いほど絞られるが、インプット期は下限8で底打ち [C-4]', () => {
    // 進捗ゼロ (全問 unseen)。due/苦手も無いので新規だけで埋まる。
    const farQueue = buildPassQueue({}, { daysUntilExam: 100000, sessionSize: 50 });
    // [C-4] 旧仕様はペース上限が最低保証(5)まで縮みコールドスタートの一巡が遅すぎた
    // → インプット期は INPUT_NEW_PACE_FLOOR(8) を下限に保証する
    expect(farQueue.length).toBe(INPUT_NEW_PACE_FLOOR);

    // 残り日数が短い → 1日に多く出してよい (セッション上限まで埋まる)
    const nearQueue = buildPassQueue({}, { daysUntilExam: 1, sessionSize: 50 });
    expect(nearQueue.length).toBeGreaterThan(INPUT_NEW_PACE_FLOOR);
  });

  it('全問 mastered でも空キューを返さない (死んだボタン防止のフォールバック)', () => {
    const progress: Record<string, QuestionProgress> = {};
    for (const q of ALL_QUESTIONS) {
      progress[q.id] = mkProgress({ questionId: q.id, mastered: true });
    }
    const q = buildPassQueue(progress, { daysUntilExam: 30, sessionSize: 10 });
    expect(q.length).toBeGreaterThan(0);
  });

  it('キューに重複 ID を含まない', () => {
    const progress: Record<string, QuestionProgress> = {};
    idsByCat('kenri', 10).forEach((id, i) => { progress[id] = dueProgress(id, i + 1); });
    const q = buildPassQueue(progress, { daysUntilExam: 20, sessionSize: 20 });
    expect(new Set(q).size).toBe(q.length);
  });
});

// ============================================================
// 7. selectPreSleepReview
// ============================================================
describe('selectPreSleepReview - 就寝前セッション (夜版)', () => {
  it('新規 (attempts==0) を除外する (寝る前に新負荷をかけない)', () => {
    const reviewed = idsByCat('kenri', 1)[0];
    const fresh = idsByCat('takkengyoho', 1)[0];
    const progress: Record<string, QuestionProgress> = {
      [reviewed]: mkProgress({ questionId: reviewed, attempts: 2, correctCount: 1 }),
      [fresh]: mkProgress({ questionId: fresh, attempts: 0, correctCount: 0 }),
    };
    const out = selectPreSleepReview(progress, { count: 5 });
    expect(out).toContain(reviewed);
    expect(out).not.toContain(fresh);
  });

  it('その日間違えた / 低確信だった問題を最優先で再露出する', () => {
    // 多数の「普通に復習対象」問題 + 1問だけ「当日の苦戦問題」
    const struggle = idsByCat('kenri', 1)[0];
    const others = idsByCat('takkengyoho', 20);
    const progress: Record<string, QuestionProgress> = {};
    // struggle は今は due ではない (期限先) のに、優先で先頭に来るべき
    progress[struggle] = mkProgress({
      questionId: struggle,
      attempts: 3,
      correctCount: 3,
      correctStreak: 3,
      lastConfidence: 'high',
      nextReviewAt: ISO(Date.now() + 30 * 86400000),
    });
    others.forEach((id) => {
      progress[id] = mkProgress({
        questionId: id,
        attempts: 2,
        correctCount: 1,
        nextReviewAt: ISO(Date.now() - 86400000), // やや超過
      });
    });
    const out = selectPreSleepReview(progress, { count: 5, todaysStruggleIds: [struggle] });
    expect(out[0]).toBe(struggle); // 当日苦戦は最優先
  });

  it('count を超えて返さない', () => {
    const progress: Record<string, QuestionProgress> = {};
    idsByCat('kenri', 20).forEach((id) => {
      progress[id] = mkProgress({ questionId: id, attempts: 2, correctCount: 1 });
    });
    expect(selectPreSleepReview(progress, { count: 5 })).toHaveLength(5);
  });

  it('mastered を除外する', () => {
    const id = idsByCat('kenri', 1)[0];
    const progress = { [id]: mkProgress({ questionId: id, attempts: 2, mastered: true }) };
    expect(selectPreSleepReview(progress, { count: 5 })).not.toContain(id);
  });
});

// ============================================================
// 8. evaluateTodayCompletion
// ============================================================
describe('evaluateTodayCompletion - 完了判定 (due消化主体)', () => {
  it('due がある日は「due消化 かつ 数ノルマ達成」で完了', () => {
    // due 残あり + 数達成 → 未完了 (やみくも回答で達成にしない)
    expect(
      evaluateTodayCompletion({ dueAtStartOfDay: 5, dueRemaining: 3, todayAnswered: 20, dailyGoal: 10 }).isComplete,
    ).toBe(false);
    // due 消化済 + 数達成 → 完了
    expect(
      evaluateTodayCompletion({ dueAtStartOfDay: 5, dueRemaining: 0, todayAnswered: 20, dailyGoal: 10 }).isComplete,
    ).toBe(true);
  });

  it('due が消化済でも数ノルマ未達なら未完了', () => {
    expect(
      evaluateTodayCompletion({ dueAtStartOfDay: 5, dueRemaining: 0, todayAnswered: 3, dailyGoal: 10 }).isComplete,
    ).toBe(false);
  });

  it('due が無い日は数ノルマ達成だけで完了 (純粋な積み上げ日)', () => {
    expect(
      evaluateTodayCompletion({ dueAtStartOfDay: 0, dueRemaining: 0, todayAnswered: 10, dailyGoal: 10 }).isComplete,
    ).toBe(true);
    expect(
      evaluateTodayCompletion({ dueAtStartOfDay: 0, dueRemaining: 0, todayAnswered: 4, dailyGoal: 10 }).isComplete,
    ).toBe(false);
  });

  it('dailyGoal=0 のときは1問でも解けば数ノルマ達成扱い', () => {
    expect(
      evaluateTodayCompletion({ dueAtStartOfDay: 0, dueRemaining: 0, todayAnswered: 1, dailyGoal: 0 }).goalMet,
    ).toBe(true);
  });
});

// ============================================================
// 9. computeTodayAction (状態マシン)
// ============================================================
describe('computeTodayAction - 単一CTA状態マシン', () => {
  const base = {
    totalAnswered: 50,
    examDays: 60 as number | null,
    hasMockHistory: true,
    dueCount: 0,
    weakCount: 0,
    isEvening: false,
    todayAnswered: 10,
    dailyGoal: 10,
  };

  it("②' [C-5] 試験30日以内+前回模試から14日経過 → 再受験CTA(mockExam)、14日未満/試験遠方は出ない", () => {
    const a = computeTodayAction({ ...base, examDays: 25, daysSinceLastMock: 14 });
    expect(a.kind).toBe('mockExam');
    const b = computeTodayAction({ ...base, examDays: 25, daysSinceLastMock: 5 });
    expect(b.kind).not.toBe('mockExam');
    const c = computeTodayAction({ ...base, examDays: 45, daysSinceLastMock: 30 });
    expect(c.kind).not.toBe('mockExam');
  });

  it('① 初日 (解答ゼロ) は最初の1問', () => {
    const a = computeTodayAction({ ...base, totalAnswered: 0 });
    expect(a.kind).toBe('firstQuestion');
  });

  it('② 試験接近(<=14日) かつ 模試未受験 は模試へ', () => {
    const a = computeTodayAction({ ...base, examDays: 10, hasMockHistory: false });
    expect(a.kind).toBe('mockExam');
  });

  it('② 模試受験済なら試験接近でも模試に飛ばさない', () => {
    const a = computeTodayAction({ ...base, examDays: 10, hasMockHistory: true, dueCount: 3 });
    expect(a.kind).not.toBe('mockExam');
  });

  it('③ due>0 かつ 夜 は就寝前復習', () => {
    const a = computeTodayAction({ ...base, dueCount: 4, isEvening: true });
    expect(a.kind).toBe('preSleep');
    expect(a.title).toContain('4');
  });

  it('④ due>0 かつ 日中 は復習', () => {
    const a = computeTodayAction({ ...base, dueCount: 4, isEvening: false });
    expect(a.kind).toBe('review');
  });

  it('夜でも due=0 なら就寝前に自動切替しない (新規ユーザーの空振り防止)', () => {
    const a = computeTodayAction({ ...base, totalAnswered: 50, dueCount: 0, isEvening: true, weakCount: 0, todayAnswered: 3 });
    expect(a.kind).not.toBe('preSleep');
  });

  it('⑤ weak>3 は弱点克服 (カテゴリ名を文言に反映)', () => {
    const a = computeTodayAction({ ...base, weakCount: 5, weakestCategoryLabel: '宅建業法' });
    expect(a.kind).toBe('weakFocus');
    expect(a.title).toContain('宅建業法');
  });

  it('⑥ ノルマ未達は今日の学習を進める (残り問題数を表示)', () => {
    const a = computeTodayAction({ ...base, todayAnswered: 3, dailyGoal: 10, weakCount: 0 });
    expect(a.kind).toBe('continueGoal');
    expect(a.title).toContain('進める');
    expect(a.sub).toContain('7'); // あと7問
  });

  it('⑦ ノルマ達成 & まだ弱点が残る はおかわり (達成を称える)', () => {
    const a = computeTodayAction({ ...base, todayAnswered: 10, dailyGoal: 10, weakCount: 2, dueCount: 0 });
    expect(a.kind).toBe('goalReachedMore');
  });

  it('⑧ 全部追いついた は弱トーンだが必ず押せる action を返す', () => {
    const a = computeTodayAction({ ...base, todayAnswered: 10, dailyGoal: 10, weakCount: 0, dueCount: 0 });
    expect(a.kind).toBe('allCaughtUp');
    expect(a.tone).toBe('calm');
  });

  it('a11yLabel は表示 title と一致する (単一ソース)', () => {
    const a = computeTodayAction(base);
    expect(a.a11yLabel).toBe(a.title);
  });

  it('合格保証 / 断定表現を含まない (景表法・憲法P6)', () => {
    const kinds = [
      computeTodayAction({ ...base, totalAnswered: 0 }),
      computeTodayAction({ ...base, dueCount: 4, isEvening: true }),
      computeTodayAction({ ...base, weakCount: 5 }),
      computeTodayAction({ ...base, todayAnswered: 10, dailyGoal: 10, weakCount: 0, dueCount: 0 }),
    ];
    const banned = ['必ず合格', '絶対', '合格保証', '保証します'];
    for (const a of kinds) {
      for (const w of banned) {
        expect(`${a.title}${a.sub}`).not.toContain(w);
      }
    }
  });
});

// ============================================================
// 10. pickOneSmart (フォールバック)
// ============================================================
describe('pickOneSmart - 単発フォールバック', () => {
  it('due があれば due から引く', () => {
    const id = idsByCat('kenri', 1)[0];
    const q = pickOneSmart({ [id]: dueProgress(id) });
    expect(q.id).toBe(id);
  });

  it('進捗ゼロでも必ず1問返す', () => {
    const q = pickOneSmart({});
    expect(q).toBeDefined();
    expect(typeof q.id).toBe('string');
  });
});
