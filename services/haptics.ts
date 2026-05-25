// ============================================================
// ハプティクスヘルパー
// 設定（vibrationEnabled）を尊重してバイブを発生させる
// 集中を妨げないよう、強度と頻度を適切に制御
// ============================================================

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { useSettingsStore } from '../store/useSettingsStore';

/**
 * バイブレーション設定が有効か判定
 * @returns 有効なら true
 */
function isVibrationEnabled(): boolean {
  // Web は expo-haptics が動かない
  if (Platform.OS === 'web') return false;
  try {
    return useSettingsStore.getState().settings.vibrationEnabled ?? true;
  } catch {
    return true;
  }
}

/**
 * 軽いタップフィードバック（正解時のデフォルト）
 * 単発の確認用・短時間
 */
export function hapticLight(): void {
  if (!isVibrationEnabled()) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/**
 * 中程度のフィードバック（コンボ・実績解除用）
 */
export function hapticMedium(): void {
  if (!isVibrationEnabled()) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

/**
 * 成功通知（日目標達成・マイルストーン用）
 */
export function hapticSuccess(): void {
  if (!isVibrationEnabled()) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/**
 * 不正解フィードバック（控えめ・負のトリガーになりすぎない強度）
 */
export function hapticError(): void {
  if (!isVibrationEnabled()) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/**
 * 警告フィードバック（ペイウォール・課金確認時）
 */
export function hapticWarning(): void {
  if (!isVibrationEnabled()) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}

/**
 * アニメーションレベル判定
 * @returns 現在の animationLevel
 */
export function getAnimationLevel(): 'full' | 'subtle' | 'off' {
  try {
    return useSettingsStore.getState().settings.animationLevel ?? 'full';
  } catch {
    return 'full';
  }
}

/**
 * 演出を表示すべきか？
 * - full: 常に表示
 * - subtle: 必要最小限のみ
 * - off: 表示しない
 */
export function shouldShowAnimation(tier: 'subtle' | 'full' = 'full'): boolean {
  const level = getAnimationLevel();
  if (level === 'off') return false;
  if (level === 'subtle' && tier === 'full') return false;
  return true;
}
