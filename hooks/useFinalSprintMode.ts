// ============================================================
// 直前モード（Final Sprint Mode）
// ============================================================
// 試験まで30日以内で自動ON
// - 頻出問題フィルター
// - 毎日50問模試の推奨
// - カウントダウン強調表示
// - 弱点優先の復習ミックス

import { useMemo } from 'react';
import { useProgressStore } from '../store/useProgressStore';
import { useExamPrediction } from './useExamPrediction';
import { PASS_LINE, daysUntilTakkenExam } from '../constants/exam';

export interface FinalSprintState {
  /** 直前モード中かどうか（試験30日以内） */
  isActive: boolean;
  /** 試験まで残り日数 */
  daysUntilExam: number | null;
  /** 緊急度レベル */
  urgency: 'none' | 'low' | 'medium' | 'high' | 'critical';
  /** 今日の推奨学習量 */
  recommendedQuestionsToday: number;
  /** 今日の推奨学習分数 */
  recommendedMinutesToday: number;
  /** 試験日予測が合格圏内か */
  onTrackToPass: boolean;
  /** ラインからの差分 */
  scoreGap: number;
  /** モチベーションメッセージ */
  motivationMessage: string;
  /** 今日のミッション文言 */
  todayMissionText: string;
}

/**
 * 直前モードの状態を算出
 * - 試験30日以内のみ有効
 * - 日数と合格状態から緊急度を判定
 */
export function useFinalSprintMode(): FinalSprintState {
  const todayAnswered = useProgressStore((s) => s.getTodayAnswered());
  const prediction = useExamPrediction();

  return useMemo(() => {
    // 宅建試験日は毎年10月第3日曜日で固定（試験翌日から次回にカウントダウン）
    const daysUntilExam = daysUntilTakkenExam();

    // 30日超 or 試験日過ぎ → 非アクティブ
    if (daysUntilExam === null || daysUntilExam > 30) {
      return {
        isActive: false,
        daysUntilExam,
        urgency: 'none',
        recommendedQuestionsToday: 0,
        recommendedMinutesToday: 0,
        onTrackToPass: false,
        scoreGap: 0,
        motivationMessage: '',
        todayMissionText: '',
      };
    }

    // 緊急度判定
    let urgency: FinalSprintState['urgency'] = 'low';
    if (daysUntilExam <= 3) urgency = 'critical';
    else if (daysUntilExam <= 7) urgency = 'high';
    else if (daysUntilExam <= 14) urgency = 'medium';
    else urgency = 'low';

    // 合格圏内かどうか
    const scoreGap = Math.max(0, PASS_LINE - prediction.totalPredicted);
    const onTrackToPass = prediction.totalPredicted >= PASS_LINE;

    // 推奨学習量: 不足点数 × 10問 ÷ 残日数 + 最低ライン
    // 基本 20問/日、合格圏外なら増量
    const baseQuestions = 20;
    const extraQuestions = Math.ceil((scoreGap * 10) / Math.max(daysUntilExam, 1));
    const recommendedQuestionsToday = Math.min(50, baseQuestions + extraQuestions);
    const recommendedMinutesToday = Math.ceil(recommendedQuestionsToday * 1.5);

    // モチベーションメッセージ
    let motivationMessage = '';
    if (urgency === 'critical') {
      motivationMessage = onTrackToPass
        ? '合格圏内！今は体調管理が最優先。毎日少しずつ維持しよう'
        : `ラストスパート！今から頑張れば、まだ逆転できる`;
    } else if (urgency === 'high') {
      motivationMessage = onTrackToPass
        ? '合格圏内をキープ！総まとめの時期です'
        : '残り1週間、弱点に集中すれば十分間に合う';
    } else if (urgency === 'medium') {
      motivationMessage = onTrackToPass
        ? 'このペースを維持しましょう'
        : '残り2週間、1日の学習量を増やして合格ラインを目指そう';
    } else {
      motivationMessage = '試験まで残り1ヶ月。計画的に仕上げていこう';
    }

    // 今日のミッション
    let todayMissionText = '';
    const remaining = Math.max(0, recommendedQuestionsToday - todayAnswered);
    if (remaining === 0) {
      todayMissionText = `✅ 今日の${recommendedQuestionsToday}問達成済み！`;
    } else {
      todayMissionText = `今日の目標まで あと ${remaining}問`;
    }

    return {
      isActive: true,
      daysUntilExam,
      urgency,
      recommendedQuestionsToday,
      recommendedMinutesToday,
      onTrackToPass,
      scoreGap,
      motivationMessage,
      todayMissionText,
    };
  }, [todayAnswered, prediction]);
}
