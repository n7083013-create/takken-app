// ============================================================
// スマートペイウォール - 最適タイミングでのアップグレード訴求
// ============================================================
// 心理学的に効果的なタイミングを自動検出し、状況に応じたメッセージを表示
// - 成功体験直後（5連続正解など）: 高揚感で決断しやすい
// - 投資感覚が出た時（30問解いた後）: sunk cost で課金に前向き
// - 試験日が近づく時: 緊急性で決断を後押し
// - 合格圏内到達時: 「もう一歩」感で最終調整需要
//
// スパム防止: 1日1回まで、連続ディスミスでクールダウン延長

import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useProgressStore } from '../store/useProgressStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useSessionStore } from '../store/useSessionStore';
import { useExamPrediction } from './useExamPrediction';
import { FREE_LIMITS } from '../types';
import { CATEGORY_LABELS } from '../types';
import { PASS_LINE } from '../constants/exam';

const STORAGE_KEY = '@takken_paywall_state';

// プロンプトの種類
export type PaywallTrigger =
  | 'combo_hot'           // 5連続正解 → 絶好調
  | 'half_free_used'      // 無料問題の半分消化
  | 'exam_near'           // 試験まで30日以内
  | 'prediction_pass'     // 予測スコアが合格圏内
  | 'weak_category'       // 弱点科目が明確化
  | 'time_invested'       // 学習開始から7日以上経過
  | null;

export interface PaywallPromptData {
  trigger: PaywallTrigger;
  headline: string;
  message: string;
  ctaText: string;
  /** 夜間・朝の緊急度訴求フラグ */
  urgency?: 'low' | 'medium' | 'high';
}

interface PaywallState {
  lastShownAt?: string;        // ISO timestamp
  lastTrigger?: PaywallTrigger;
  dismissCount: number;        // 連続ディスミス回数
  shownTriggers: PaywallTrigger[];  // 今日表示したトリガー
  shownDate: string;           // 今日の日付 YYYY-MM-DD
  /** prediction_pass は一度だけ表示 */
  hasShownPredictionPass: boolean;
}

const defaultState: PaywallState = {
  dismissCount: 0,
  shownTriggers: [],
  shownDate: '',
  hasShownPredictionPass: false,
};

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function loadState(): Promise<PaywallState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw);
    // 日付が変わってたら表示履歴リセット
    const today = getTodayKey();
    if (parsed.shownDate !== today) {
      return { ...parsed, shownTriggers: [], shownDate: today };
    }
    return parsed;
  } catch {
    return defaultState;
  }
}

async function saveState(state: PaywallState): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

/** クールダウン判定 */
function canShow(state: PaywallState, trigger: PaywallTrigger): boolean {
  if (!trigger) return false;

  // 1日1回まで（prediction_pass は生涯1回）
  const today = getTodayKey();
  if (state.shownDate === today && state.shownTriggers.includes(trigger)) return false;
  if (trigger === 'prediction_pass' && state.hasShownPredictionPass) return false;

  // 連続ディスミス >= 3 なら 48時間クールダウン
  if (state.dismissCount >= 3 && state.lastShownAt) {
    const elapsed = Date.now() - new Date(state.lastShownAt).getTime();
    if (elapsed < 48 * 60 * 60 * 1000) return false;
  }

  return true;
}

/**
 * スマートペイウォールフック
 * 現在のアプリ状態から最適なトリガーを検出
 */
export function useSmartPaywall(): {
  prompt: PaywallPromptData | null;
  dismissPrompt: () => void;
  acceptPrompt: () => void;
  resetDismissCount: () => void;
} {
  const [state, setState] = useState<PaywallState>(defaultState);
  const [trigger, setTrigger] = useState<PaywallTrigger>(null);

  const isPro = useSettingsStore((s) => s.isPro);
  const settings = useSettingsStore((s) => s.settings);
  const totalAnswered = useProgressStore((s) => s.stats.totalQuestions);
  const firstStudyAt = useProgressStore((s) => s.stats.lastStudyAt);  // 代替: 初回学習日
  const combo = useSessionStore((s) => s.combo);
  const prediction = useExamPrediction();

  // 状態ロード
  useEffect(() => {
    loadState().then(setState);
  }, []);

  // トリガー検出
  useEffect(() => {
    // プレミアムは表示しない
    if (isPro()) {
      setTrigger(null);
      return;
    }

    // 優先度順に判定

    // ① 予測スコアが合格圏内（1回限定・最高の売り時）
    if (
      prediction.hasData &&
      prediction.totalPredicted >= PASS_LINE &&
      canShow(state, 'prediction_pass')
    ) {
      setTrigger('prediction_pass');
      return;
    }

    // ② 試験まで30日切った + 無料ユーザー
    if (
      prediction.daysUntilExam !== null &&
      prediction.daysUntilExam <= 30 &&
      prediction.daysUntilExam > 0 &&
      canShow(state, 'exam_near')
    ) {
      setTrigger('exam_near');
      return;
    }

    // ③ 5連続正解（絶好調・高揚感）
    if (combo >= 5 && canShow(state, 'combo_hot')) {
      setTrigger('combo_hot');
      return;
    }

    // ④ 1日の無料枠の半分消化（未課金のみ）
    // 日次制限は1日10問 → 5問解いたら訴求
    const dailyHalf = Math.floor(FREE_LIMITS.questionsPerDay / 2);
    // totalAnswered は累計なので、日次消化のサジェストには不向き。
    // 別画面で「本日の残り」表示するロジックを使う想定
    // ここではコンボ・試験近接を優先するためスキップ
    if (false && dailyHalf > 0) {
      setTrigger('half_free_used');
      return;
    }

    // ⑤ 弱点科目が明確化
    if (
      prediction.weakestCategory &&
      prediction.pointsToPass > 0 &&
      totalAnswered >= 20 &&
      canShow(state, 'weak_category')
    ) {
      setTrigger('weak_category');
      return;
    }

    // ⑥ 7日以上使った（投資感）
    // lastStudyAt を開始日代わりに使う（実装簡易化）
    if (firstStudyAt) {
      const daysUsed = (Date.now() - new Date(firstStudyAt).getTime()) / (24 * 60 * 60 * 1000);
      if (daysUsed >= 7 && canShow(state, 'time_invested')) {
        setTrigger('time_invested');
        return;
      }
    }

    setTrigger(null);
  }, [isPro, totalAnswered, combo, prediction, firstStudyAt, state]);

  // トリガーからプロンプトデータ生成
  const prompt = useMemo<PaywallPromptData | null>(() => {
    if (!trigger) return null;

    switch (trigger) {
      case 'prediction_pass':
        return {
          trigger,
          headline: '🎯 合格圏内到達！',
          message: 'このまま模擬試験で最終調整しませんか？全機能アンロックで本番対策を万全に',
          ctaText: '模擬試験を解禁',
          urgency: 'high',
        };

      case 'exam_near': {
        const days = prediction.daysUntilExam ?? 30;
        return {
          trigger,
          headline: `⏰ 試験まで残り${days}日`,
          message: `今がラストスパート！全問題＋模擬試験で合格率を最大化しよう`,
          ctaText: '最後の追い込みを始める',
          urgency: 'high',
        };
      }

      case 'combo_hot':
        return {
          trigger,
          headline: '🔥 絶好調ですね！',
          message: `${combo}問連続正解中。全問題にアクセスしてこの勢いを加速させませんか？`,
          ctaText: '全問題を解禁',
          urgency: 'medium',
        };

      case 'half_free_used': {
        return {
          trigger,
          headline: '📚 快調な学習ペース！',
          message: `無料枠（1日10問）の半分を消化。全問題＋模擬試験で合格力を本格的に伸ばそう`,
          ctaText: '全問題を解禁',
          urgency: 'medium',
        };
      }

      case 'weak_category': {
        const catName = prediction.weakestCategory
          ? CATEGORY_LABELS[prediction.weakestCategory]
          : '苦手分野';
        return {
          trigger,
          headline: `💪 ${catName}の弱点が見つかりました`,
          message: `弱点克服には全問題へのアクセスが必要。今なら ¥980/月 で完全攻略できます`,
          ctaText: '弱点を克服する',
          urgency: 'medium',
        };
      }

      case 'time_invested':
        return {
          trigger,
          headline: '📖 継続できていますね！',
          message: '真剣に取り組むあなたへ。全機能で合格までの最短ルートを歩もう',
          ctaText: '全機能を解禁',
          urgency: 'low',
        };

      default:
        return null;
    }
  }, [trigger, combo, prediction, totalAnswered]);

  // ディスミス
  const dismissPrompt = useCallback(() => {
    if (!trigger) return;
    const today = getTodayKey();
    const newState: PaywallState = {
      ...state,
      shownTriggers: [...state.shownTriggers, trigger],
      shownDate: today,
      dismissCount: state.dismissCount + 1,
      lastShownAt: new Date().toISOString(),
      lastTrigger: trigger,
      hasShownPredictionPass: state.hasShownPredictionPass || trigger === 'prediction_pass',
    };
    setState(newState);
    saveState(newState);
    setTrigger(null);
  }, [trigger, state]);

  // 承諾（ペイウォールへ遷移時）
  const acceptPrompt = useCallback(() => {
    if (!trigger) return;
    const today = getTodayKey();
    const newState: PaywallState = {
      ...state,
      shownTriggers: [...state.shownTriggers, trigger],
      shownDate: today,
      dismissCount: 0,  // 承諾時は0に戻す
      lastShownAt: new Date().toISOString(),
      lastTrigger: trigger,
      hasShownPredictionPass: state.hasShownPredictionPass || trigger === 'prediction_pass',
    };
    setState(newState);
    saveState(newState);
    setTrigger(null);
  }, [trigger, state]);

  // ディスミスカウントリセット（他所から呼びたい時用）
  const resetDismissCount = useCallback(() => {
    const newState = { ...state, dismissCount: 0 };
    setState(newState);
    saveState(newState);
  }, [state]);

  return {
    prompt,
    dismissPrompt,
    acceptPrompt,
    resetDismissCount,
  };
}
