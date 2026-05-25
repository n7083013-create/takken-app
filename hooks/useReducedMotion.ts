// ============================================================
// useReducedMotion / useAnimationEnabled
// プラットフォーム共通: OS の reduceMotion + アプリの animationLevel を統合判定
// ============================================================

import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { useSettingsStore } from '../store/useSettingsStore';

/**
 * OS レベルの「視差効果を減らす」設定を購読
 * - iOS: reduceMotionEnabled
 * - Android: 動作を最小化
 * - Web: prefers-reduced-motion
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => {
        if (mounted) setReduced(!!v);
      })
      .catch(() => {});

    const sub = AccessibilityInfo.addEventListener?.(
      'reduceMotionChanged',
      (v: boolean) => {
        if (mounted) setReduced(!!v);
      },
    );
    return () => {
      mounted = false;
      // RN >= 0.65 returns subscription with .remove()
      sub?.remove?.();
    };
  }, []);

  return reduced;
}

/**
 * 「アニメーションを再生するか」を統合判定
 * - settings.animationLevel === 'off' なら false
 * - OS reduceMotion 有効なら false
 * - それ以外は true
 */
export function useAnimationEnabled(): boolean {
  const animLevel = useSettingsStore((s) => s.settings.animationLevel) ?? 'full';
  const reduced = useReducedMotion();
  if (animLevel === 'off') return false;
  if (reduced) return false;
  return true;
}

/**
 * 'full' | 'subtle' | 'off' を統合（OS reduceMotion 尊重で最低でも 'subtle' に降格）
 * - OS reduceMotion 有効 + animationLevel='full' → 'subtle' に降格
 * - animationLevel='off' → 'off'
 */
export function useEffectiveAnimationLevel(): 'full' | 'subtle' | 'off' {
  const level = (useSettingsStore((s) => s.settings.animationLevel) ?? 'full') as
    | 'full'
    | 'subtle'
    | 'off';
  const reduced = useReducedMotion();
  if (level === 'off') return 'off';
  if (reduced) return level === 'full' ? 'subtle' : level;
  return level;
}
