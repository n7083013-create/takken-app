// ============================================================
// ペイウォール文言の中央集権ヘルパー
// ============================================================
//
// 世界基準のフリーミアム UX (Duolingo / Spotify / Headspace / Linear など)
// で採用されている 5 つの原則を実装する:
//
// 1. Celebration first: 上限到達時はまず「達成お祝い」を出す (否定文言禁止)
// 2. Trial-first CTA:   全画面で「7日間無料」を主訴求に統一
// 3. Loss aversion:     具体的な「失っているもの」を提示
// 4. Streak shield:     連続学習日数があれば盾として活用
// 5. One CTA per screen: 主 CTA は 1 つに絞る (Hick's law)
//
// 文言は React 非依存の純関数で実装し、ユニットテストで保証する。

/** ロック画面のモード */
export type LimitMode =
  | { kind: 'daily_limit_question'; streak: number }
  | { kind: 'daily_limit_quickquiz'; streak: number }
  | { kind: 'feature_locked_exam' }
  | { kind: 'feature_locked_ai_analysis' }
  | { kind: 'daily_limit_ai_chat'; usedToday: number; limit: number };

export interface LimitCopy {
  /** 主要絵文字 (大きく表示) */
  emoji: string;
  /** 1 行目: 大見出し (達成感 or 機能名) */
  title: string;
  /** 2-3 行目: 具体的な価値訴求 + 数字を入れる */
  subtitle: string;
  /** 主 CTA テキスト (常にトライアル文言を含める) */
  primaryCta: string;
  /** 副次的に表示する説明 (連続学習日数のシールド等)。null なら非表示 */
  streakShield?: string | null;
}

/**
 * モードに応じた表示文言を返す。
 * @param mode ロック発生のコンテキスト
 */
export function getLimitCopy(mode: LimitMode): LimitCopy {
  switch (mode.kind) {
    // ----------------------------------------------------------
    // 4 択問題: 1日10問達成 (Celebration mode)
    // ----------------------------------------------------------
    case 'daily_limit_question':
      return {
        emoji: '🎉',
        title: '今日の10問達成！',
        subtitle: '本試験まで残り問題が820問。\n7日間無料で全問題＋模試＋AI解説まで一気に解禁。',
        primaryCta: '7日間無料で全問解き放題',
        streakShield: streakShieldText(mode.streak),
      };

    // ----------------------------------------------------------
    // 一問一答: 1日20問達成 (Celebration mode)
    // ----------------------------------------------------------
    case 'daily_limit_quickquiz':
      return {
        emoji: '🎉',
        title: '今日の20問達成！',
        subtitle: '一問一答は全600問。\n7日間無料で残りも一気に攻略しよう。',
        primaryCta: '7日間無料で全問解き放題',
        streakShield: streakShieldText(mode.streak),
      };

    // ----------------------------------------------------------
    // 模擬試験: 完全ロック (Locked mode)
    // ----------------------------------------------------------
    case 'feature_locked_exam':
      return {
        emoji: '📝',
        title: '本試験形式 50問・120分',
        subtitle: '時間配分の練習は合格率を最も左右する要素。\n7日間無料で何回でも模試を受けられる。',
        primaryCta: '7日間無料で模試を受ける',
      };

    // ----------------------------------------------------------
    // AI 分析: 完全ロック (Locked mode)
    // ----------------------------------------------------------
    case 'feature_locked_ai_analysis':
      return {
        emoji: '🤖',
        title: 'AI 合格予測 × 弱点分析',
        subtitle: 'あなたに最適な学習ルートを AI が組み立てる。\n7日間無料で合格予測スコアまで確認できる。',
        primaryCta: '7日間無料でAI分析を試す',
      };

    // ----------------------------------------------------------
    // AI チャット: 1日3回上限 (inline CTA 想定)
    // ----------------------------------------------------------
    case 'daily_limit_ai_chat':
      return {
        emoji: '🤖',
        title: `本日のAI質問 ${mode.usedToday}/${mode.limit} 使い切り`,
        subtitle: '7日間無料で 1日 100 回まで質問できる。',
        primaryCta: '7日間無料で100回/日に',
      };

    default: {
      // すべてのケースを網羅していることを TypeScript に保証させる
      const _exhaustive: never = mode;
      void _exhaustive;
      return {
        emoji: '✨',
        title: 'PREMIUM プラン',
        subtitle: '',
        primaryCta: '7日間無料で始める',
      };
    }
  }
}

/**
 * 連続学習日数を「失う恐れ」として可視化する文言。
 * 0-1 日は表示価値が低いので null を返す。
 * 3 日以上で強めの sunk-cost 訴求。
 */
export function streakShieldText(streak: number): string | null {
  if (streak < 2) return null;
  if (streak >= 30) return `🔥 ${streak}日連続学習中 — 偉業を絶やさない`;
  if (streak >= 7) return `🔥 ${streak}日連続学習中 — この勢いを止めない`;
  if (streak >= 3) return `🔥 ${streak}日連続学習中`;
  return `🔥 ${streak}日連続学習中`;
}
