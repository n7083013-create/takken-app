// ============================================================
// 合格エンジン (Pass Engine) — 「今日やること」の中身を生成する純粋ロジック
// ============================================================
//
// 設計意図 (Vault: 2026-06-08 4エージェント相談 / 憲法 P1 迷い除去):
//   メインCTA「今日やること」を押すだけで合格に向かう仕組みの "裏側"。
//   UI (React Native / expo) から切り離した純粋関数群にすることで:
//     - jest(node) で締切cap・キュー構成・就寝前差別化・完了判定を直接テストできる
//     - 出題基準が「単発 / 連続 / 夜 / 補助動線」でブレない単一ソースになる
//
// ⚠️ このファイルは RN / expo を import しないこと (テスト容易性とビルド分離のため)。

import { ALL_QUESTIONS } from '../data';
import type { Category, Question, QuestionProgress } from '../types';

/** 連続出題セッションの上限問題数 (1タップで今日の分が続く規模) */
export const SMART_SESSION_SIZE = 20;

// ── 学習フェーズ (試験日からの逆算で 3 分割) ──────────────────────────
// インプット期: 新規を多く回して全範囲に触れる
// 定着期: due / 苦手を厚くしつつ新規も継続
// 直前期: 新規をほぼ止め、全弱点の最終1回を確保する
export type StudyPhase = 'input' | 'consolidation' | 'final';

/** >45日 = インプット期 / 45-15日 = 定着期 / <15日 = 直前期 */
export const PHASE_INPUT_MIN_DAYS = 45;
export const PHASE_FINAL_MAX_DAYS = 15;

/** フェーズ別の新規問題 最低保証数 / セッション (due・苦手で枠を食い尽くして新規が一生出ない事故を防ぐ) */
export const NEW_FLOOR: Record<StudyPhase, number> = {
  input: 5,
  consolidation: 3,
  final: 0,
};

/** フェーズ別の due 消化上限 / セッション (溜まった due で苦行化するのを防ぐ。超過分は緊急度順で繰越) */
export const DUE_CAP: Record<StudyPhase, number> = {
  input: 20,
  consolidation: 25,
  final: 30,
};

/** 苦手枠の目安 / セッション (due の次に差し込む) */
export const WEAK_SLOT: Record<StudyPhase, number> = {
  input: 4,
  consolidation: 6,
  final: 8,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const CATEGORIES: Category[] = ['kenri', 'takkengyoho', 'horei_seigen', 'tax_other'];

/** Fisher-Yates シャッフル (元配列は破壊しない) */
export function shuffled<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** daysUntilExam からフェーズを判定。null (試験日未設定) は最も安全な「インプット期」扱い。 */
export function phaseForDays(daysUntilExam: number | null | undefined): StudyPhase {
  if (daysUntilExam == null) return 'input';
  if (daysUntilExam > PHASE_INPUT_MIN_DAYS) return 'input';
  if (daysUntilExam < PHASE_FINAL_MAX_DAYS) return 'final';
  return 'consolidation';
}

/**
 * 締切逆算 SM-2 cap。
 * 正解で interval が試験日を飛び越えると「本試験まで二度と出題されない」欠陥が起きる。
 * → interval を「試験前日までの残り日数」で頭打ちにする。
 * - 試験日未設定 (null) は従来どおり上限なし (多くのユーザーは未設定なので必ずフォールバック)。
 * - 試験前日 = daysUntilExam - 1。最低でも 1 日は確保 (当日 / 前日でも復習が回るように)。
 */
export function capIntervalToExam(
  interval: number,
  daysUntilExam: number | null | undefined,
): number {
  if (daysUntilExam == null) return interval;
  const dayBeforeExam = Math.max(1, daysUntilExam - 1);
  return Math.min(interval, dayBeforeExam);
}

// ── 出題ティアの分類 ───────────────────────────────────────────────
export interface QuestionTiers {
  due: Question[];
  weak: Question[];
  unseen: Question[];
  remaining: Question[];
}

/**
 * 出題プールを「復習期限切れ(due) / 苦手(weak) / 未解答(unseen) / 残り(remaining)」に分類。
 * 苦手・due の判定は useProgressStore.getWeakQuestions / getDueForReview と同一基準に揃える。
 */
export function classifyTiers(
  progress: Record<string, QuestionProgress>,
  nowIso: string = new Date().toISOString(),
): QuestionTiers {
  const dueIds = new Set(
    Object.values(progress)
      .filter((p) => p.attempts > 0 && p.mastered !== true && p.nextReviewAt <= nowIso)
      .map((p) => p.questionId),
  );
  const weakIds = new Set(
    Object.values(progress)
      .filter((p) => {
        if (p.attempts === 0) return false;
        if (p.mastered === true) return false;
        if ((p.correctStreak ?? 0) >= 3) return false;
        return p.correctCount / p.attempts < 0.5;
      })
      .map((p) => p.questionId),
  );
  const attemptedOrMasteredIds = new Set(
    Object.values(progress)
      .filter((p) => p.attempts > 0 || p.mastered === true)
      .map((p) => p.questionId),
  );
  const masteredIds = new Set(
    Object.values(progress).filter((p) => p.mastered === true).map((p) => p.questionId),
  );

  const due = ALL_QUESTIONS.filter((q) => dueIds.has(q.id));
  const weak = ALL_QUESTIONS.filter((q) => weakIds.has(q.id) && !dueIds.has(q.id));
  const unseen = ALL_QUESTIONS.filter((q) => !attemptedOrMasteredIds.has(q.id));
  const remaining = ALL_QUESTIONS.filter(
    (q) =>
      !masteredIds.has(q.id) &&
      !dueIds.has(q.id) &&
      !weakIds.has(q.id) &&
      attemptedOrMasteredIds.has(q.id),
  );
  return { due, weak, unseen, remaining };
}

/**
 * 同一カテゴリが連続しないよう並べ替える (科目インターリーブ)。
 * 認知科学: 混合学習はブロック学習より長期記憶に有効。
 * getInterleavedQuestions の並べ替え部と同じ「最大プール優先」戦略。
 */
export function interleaveByCategory(ids: string[]): string[] {
  const catOf = new Map(ALL_QUESTIONS.map((q) => [q.id, q.category] as const));
  const pools = new Map<Category, string[]>();
  for (const id of ids) {
    const cat = catOf.get(id) ?? 'kenri';
    if (!pools.has(cat)) pools.set(cat, []);
    pools.get(cat)!.push(id);
  }
  const out: string[] = [];
  let lastCat: Category | null = null;
  while (out.length < ids.length) {
    const available = [...pools.entries()]
      .filter(([cat, arr]) => arr.length > 0 && cat !== lastCat)
      .sort((a, b) => b[1].length - a[1].length);
    if (available.length === 0) {
      // 残りが同一カテゴリしかない → そのまま流す
      for (const [, arr] of pools) out.push(...arr.splice(0));
      break;
    }
    const [cat, arr] = available[0];
    out.push(arr.shift()!);
    lastCat = cat;
  }
  return out;
}

/** due の緊急度: 超過日数 × 低正答率。溜まった due の中で「ヤバい順」に消化させる。 */
function dueUrgency(p: QuestionProgress, now: number): number {
  const overdueDays = Math.max(0, (now - new Date(p.nextReviewAt).getTime()) / MS_PER_DAY);
  const accuracy = p.attempts > 0 ? p.correctCount / p.attempts : 0;
  // 正答率が低いほど係数大 (0.5〜1.5)。超過日数に最低 1 を足し、未超過でも 0 にならないように。
  const lowAccuracyFactor = 1.5 - accuracy;
  return (overdueDays + 1) * lowAccuracyFactor;
}

export interface BuildQueueOptions {
  daysUntilExam: number | null | undefined;
  now?: Date;
  sessionSize?: number;
}

/**
 * 合格エンジンの連続出題キュー。
 *
 * 配合方針 (Vault 合格エンジン仕様):
 *   1. フェーズを試験日から判定 (input / consolidation / final)
 *   2. due は緊急度順で DUE_CAP まで (超過分は繰り越し = 次セッションで再評価)
 *   3. 苦手を WEAK_SLOT 分
 *   4. 新規は「最低保証」と「ペース上限 = ceil(残り未出題 / 残り日数)」で出す
 *      → 直前期は新規ほぼ停止、最終日までに一周終わるペースに自動調整
 *   5. 残り (一度解いたが due/苦手でない) で埋める
 *   6. 最後に科目インターリーブして同一カテゴリ連続を避ける
 *
 * 優先ティアの選別ロジック自体は smartQuestionTiers と同じ思想を維持しつつ、
 * 「新規が枠を食われて出ない」「due が溜まって苦行化」の両事故を定数で抑える。
 */
export function buildPassQueue(
  progress: Record<string, QuestionProgress>,
  opts: BuildQueueOptions,
): string[] {
  const now = opts.now ?? new Date();
  const size = opts.sessionSize ?? SMART_SESSION_SIZE;
  const phase = phaseForDays(opts.daysUntilExam);
  const tiers = classifyTiers(progress, now.toISOString());

  // --- due: 緊急度順 → DUE_CAP で頭打ち (超過分は今回出さない=繰越) ---
  const dueRanked = [...tiers.due].sort(
    (a, b) => dueUrgency(progress[b.id], now.getTime()) - dueUrgency(progress[a.id], now.getTime()),
  );
  const dueSelected = dueRanked.slice(0, DUE_CAP[phase]);

  // --- 新規ペース上限: 最終日までに未出題を一周できる 1日あたり本数 ---
  // (試験日未設定なら在庫数 = ペース制約なし。最低保証 NEW_FLOOR だけが効く。)
  const remainingDays = opts.daysUntilExam == null ? null : Math.max(1, opts.daysUntilExam);
  const pacedNewLimit =
    remainingDays == null
      ? tiers.unseen.length
      : Math.ceil(tiers.unseen.length / remainingDays);
  // 新規は「ペース上限」と「最低保証」の大きい方を狙う (在庫で頭打ち)。
  // ⚠️ これはセッション全体を通した新規の "総数上限" であり、後段の穴埋めでも超えない
  //    (= far-exam ユーザーに新規を出しすぎない / 直前期は 0 に絞る)。
  const newTarget = Math.min(
    tiers.unseen.length,
    Math.max(NEW_FLOOR[phase], pacedNewLimit),
  );

  const ids: string[] = [];
  const seen = new Set<string>();
  // limit: このティアから今回追加してよい上限。capacity: 全体の残り空き。
  const take = (arr: string[], limit: number) => {
    let added = 0;
    for (const id of arr) {
      if (ids.length >= size || added >= limit) break;
      if (!seen.has(id)) {
        ids.push(id);
        seen.add(id);
        added++;
      }
    }
  };

  // 新規の最低保証を「先に予約」する: due が大量でも枠を確保し、新規が一生出ない事故を防ぐ。
  // 予約数は NEW_FLOOR (フェーズ別の最低保証) のみ。直前期は 0 なので新規はほぼ止まる。
  // 在庫数 / セッション半分でも頭打ち (復習が主、新規が従)。
  const reservedNew = Math.min(NEW_FLOOR[phase], newTarget, Math.floor(size / 2));
  const dueCapacity = Math.max(0, size - reservedNew);

  // 1) due (緊急度順) を「新規予約を残した capacity」まで
  take(dueSelected.map((q) => q.id), Math.min(DUE_CAP[phase], dueCapacity));
  // 2) 苦手
  take(shuffled(tiers.weak).map((q) => q.id), WEAK_SLOT[phase]);
  // 3) 新規 (最低保証 & ペース上限 = newTarget が総数上限)
  take(shuffled(tiers.unseen).map((q) => q.id), newTarget);
  // 4) 残り (一度解いた復習対象でない問題) で穴埋め
  take(shuffled(tiers.remaining).map((q) => q.id), size);
  // 5) なお空きがあれば due 繰越分 → 苦手 で埋める (新規はこれ以上増やさない = ペース厳守)
  take(dueRanked.map((q) => q.id), size);
  take(shuffled(tiers.weak).map((q) => q.id), size);
  // 全マスター等で何も無いときの最終フォールバック (死んだボタン防止)
  if (ids.length === 0) {
    take(shuffled([...ALL_QUESTIONS]).map((q) => q.id), size);
  }

  return interleaveByCategory(ids.slice(0, size));
}

/**
 * 単発のスマート問題1問 (キューが作れない時のフォールバック用)。
 * due → 苦手 → 未解答 → 残り の順で最初に在庫のあるティアから引く。
 */
export function pickOneSmart(
  progress: Record<string, QuestionProgress>,
  nowIso: string = new Date().toISOString(),
): Question {
  const t = classifyTiers(progress, nowIso);
  for (const tier of [t.due, t.weak, t.unseen, t.remaining]) {
    if (tier.length > 0) return tier[Math.floor(Math.random() * tier.length)];
  }
  return ALL_QUESTIONS[Math.floor(Math.random() * ALL_QUESTIONS.length)];
}

// ── 就寝前セッション (夜版) ─────────────────────────────────────────
export interface PreSleepOptions {
  count: number;
  now?: Date;
  /** その日間違えた / 低確信だった問題を優先再露出する (睡眠固定化に乗せる) */
  todaysStruggleIds?: Iterable<string>;
}

/**
 * 就寝前復習の選出 (夜版に差別化)。
 *  (i)  新規 (attempts==0) を除外 = 寝る前に新しい負荷をかけない
 *  (ii) その日間違えた / 低確信だった問題を最優先で再露出 (睡眠中の記憶固定に乗せる)
 *  (iii) 残りは忘却曲線で「もうすぐ忘れそう」を選ぶ (従来ロジック)
 */
export function selectPreSleepReview(
  progress: Record<string, QuestionProgress>,
  opts: PreSleepOptions,
): string[] {
  const now = (opts.now ?? new Date()).getTime();
  const struggle = new Set(opts.todaysStruggleIds ?? []);

  const candidates = Object.values(progress)
    .filter((p) => p.attempts > 0 && p.mastered !== true) // 新規除外
    .map((p) => {
      const reviewTime = new Date(p.nextReviewAt).getTime();
      const timeUntilDue = reviewTime - now;
      let urgency = 0;
      if (timeUntilDue < -2 * MS_PER_DAY) urgency = 3;
      else if (timeUntilDue < 0) urgency = 5;
      else if (timeUntilDue < MS_PER_DAY) urgency = 4;
      else if (timeUntilDue < 3 * MS_PER_DAY) urgency = 2;
      else urgency = 1;

      if (p.lastConfidence === 'low') urgency += 2;
      if (p.attempts > 0 && p.correctCount / p.attempts < 0.6) urgency += 1;
      // その日に苦戦した問題を最優先で再露出 (睡眠固定化の狙い)
      if (struggle.has(p.questionId)) urgency += 10;

      return { id: p.questionId, urgency, rand: Math.random() };
    })
    .sort((a, b) => b.urgency - a.urgency || a.rand - b.rand);

  return candidates.slice(0, opts.count).map((c) => c.id);
}

// ── 今日の完了判定 ─────────────────────────────────────────────────
export interface TodayCompletionInput {
  /** 今日 (セッション開始時点) に発生していた due の件数。0 ならノルマ的に due は無い。 */
  dueAtStartOfDay: number;
  /** 現在残っている due 件数。 */
  dueRemaining: number;
  /** 今日解いた数 (4択 + 一問一答×重み)。 */
  todayAnswered: number;
  /** 1日の目標数。 */
  dailyGoal: number;
}

export interface TodayCompletion {
  /** due を消化し切ったか (due が無かった日は true)。 */
  dueCleared: boolean;
  /** 数の目標を満たしたか。 */
  goalMet: boolean;
  /** 「今日やり切った」= due 消化を主、目標達成を従で判定。 */
  isComplete: boolean;
}

/**
 * 「今日完了」を「解いた数だけ」でなく「今日発生した due を消化したか (+ 日次の数ノルマ)」主体で判定。
 * やみくまに回答するだけで達成演出が出ないようにする (憲法 P6 誠実さ)。
 *  - due が今日あった → due を消化し切ってはじめて完了
 *  - due が無い日 → 数の目標達成で完了 (純粋な積み上げ日)
 */
export function evaluateTodayCompletion(input: TodayCompletionInput): TodayCompletion {
  const goalMet = input.dailyGoal > 0 ? input.todayAnswered >= input.dailyGoal : input.todayAnswered > 0;
  const hadDue = input.dueAtStartOfDay > 0;
  const dueCleared = !hadDue || input.dueRemaining === 0;
  // due があった日は「due 消化 かつ 数ノルマ」、無い日は数ノルマのみ。
  const isComplete = hadDue ? dueCleared && goalMet : goalMet;
  return { dueCleared, goalMet, isComplete };
}

// ── 「今日やること」状態マシン (designer 8状態) ─────────────────────
export type TodayActionKind =
  | 'firstQuestion'
  | 'mockExam'
  | 'preSleep'
  | 'review'
  | 'weakFocus'
  | 'continueGoal'
  | 'goalReachedMore'
  | 'allCaughtUp';

export type TodayActionTone = 'primary' | 'calm';

export interface TodayActionView {
  kind: TodayActionKind;
  icon: string;
  title: string;
  sub: string;
  tone: TodayActionTone;
  /** a11yLabel は表示 title と単一ソース化する (ズレ防止)。 */
  a11yLabel: string;
}

export interface TodayActionInput {
  totalAnswered: number;
  examDays: number | null;
  hasMockHistory: boolean;
  dueCount: number;
  weakCount: number;
  isEvening: boolean;
  todayAnswered: number;
  dailyGoal: number;
  /** 弱点カテゴリの表示名 (weakFocus のコピーに使う)。無ければ汎用文言。 */
  weakestCategoryLabel?: string;
}

/**
 * 単一CTA「今日やること」の状態を 1 つに決める純粋関数。
 * 判定は上から最初にマッチしたものを採用 (designer 8状態の優先順)。
 *
 * 重要な安全装置 (公開前必須):
 *  - 空 / 全達成でも必ず意味ある action を返す (死んだボタン厳禁)。
 *  - 夜の自動切替は due>0 の時だけ (新規ユーザーが夜に空振りするのを防ぐ)。
 *  - 合格保証 / 断定表現は使わない (景表法・憲法 P6)。
 */
export function computeTodayAction(input: TodayActionInput): TodayActionView {
  const make = (
    kind: TodayActionKind,
    icon: string,
    title: string,
    sub: string,
    tone: TodayActionTone = 'primary',
  ): TodayActionView => ({ kind, icon, title, sub, tone, a11yLabel: title });

  // ① 初日 (解答ゼロ) → 最初の1問
  if (input.totalAnswered === 0) {
    return make('firstQuestion', '📝', '最初の1問を解く', 'まずは1問から。ここから始めましょう');
  }

  // ② 試験接近 (0〜14日) かつ 模試未受験 → 本番形式で力試し
  if (input.examDays !== null && input.examDays >= 0 && input.examDays <= 14 && !input.hasMockHistory) {
    return make('mockExam', '📋', '本番形式で力試し(50問)', '試験が近づいています。一度通しで実力を確認しましょう');
  }

  // ③ due>0 かつ 夜 → 就寝前の復習
  if (input.dueCount > 0 && input.isEvening) {
    return make('preSleep', '🌙', `就寝前の復習(${input.dueCount}問)`, '寝る前の復習で定着を助けます');
  }

  // ④ due>0 かつ 日中 → 復習
  if (input.dueCount > 0) {
    return make('review', '⏰', `復習${input.dueCount}問を解く`, '忘れる前に解くと記憶が定着しやすくなります');
  }

  // ⑤ weak>3 → 弱点克服
  if (input.weakCount > 3) {
    const label = input.weakestCategoryLabel;
    return make(
      'weakFocus',
      '💪',
      label ? `${label}を克服する` : '弱点を克服する',
      `${input.weakCount}問の苦手を集中的に攻略します`,
    );
  }

  // ⑥ ノルマ未達 → 今日の学習を進める
  const remaining = input.dailyGoal - Math.round(input.todayAnswered);
  if (input.dailyGoal > 0 && remaining > 0) {
    return make('continueGoal', '📝', '今日の学習を進める', `今日 ${Math.round(input.todayAnswered)}/${input.dailyGoal}問 — あと${remaining}問`);
  }

  // ⑦ ノルマ達成 & まだ伸ばせる (due0 & weak<=3 だが弱点が残っている等)
  if (input.weakCount > 0) {
    return make('goalReachedMore', '✅', '今日のノルマ達成！もう少し解く', 'いいペースです。余力があればもう少しだけ');
  }

  // ⑧ 全部追いついた → 弱トーンで「やり切った」(ボタンは必ず押せる)
  return make('allCaughtUp', '🎉', '今日はやり切りました（おかわり ›）', '完璧です。気が向いたら追加で解けます', 'calm');
}
