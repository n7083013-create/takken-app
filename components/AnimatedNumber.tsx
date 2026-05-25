// ============================================================
// AnimatedNumber
// 数値を 0 → target にイージング (cubic-bezier easeOutExpo, 600ms) で
// カウントアップ表示する Text。
// - 過剰な setState を避けるため worklet で計算し、JS thread への戻しは
//   16ms (≒60fps) スロットルでフレームスキップに耐える
// - animationLevel='off' / OS reduceMotion → 即時 target
// ============================================================

import React, { useEffect, useRef, useState } from 'react';
import { Text, TextProps, TextStyle, StyleProp } from 'react-native';
import {
  useSharedValue,
  withTiming,
  Easing,
  useAnimatedReaction,
  runOnJS,
  cancelAnimation,
} from 'react-native-reanimated';
import { useAnimationEnabled } from '../hooks/useReducedMotion';

interface AnimatedNumberProps extends Omit<TextProps, 'children'> {
  value: number;
  /** 表示用フォーマッタ。デフォルトは Math.round */
  format?: (n: number) => string;
  /** アニメ時間 ms (default 600) */
  duration?: number;
  /** 接尾辞 (例: '%') */
  suffix?: string;
  /** 接頭辞 (例: '¥') */
  prefix?: string;
  style?: StyleProp<TextStyle>;
}

export function AnimatedNumber({
  value,
  format,
  duration = 600,
  suffix = '',
  prefix = '',
  style,
  ...rest
}: AnimatedNumberProps) {
  const animationEnabled = useAnimationEnabled();
  const sv = useSharedValue(value);
  const [display, setDisplay] = useState(value);
  const lastUpdateMsRef = useRef(0);

  useEffect(() => {
    if (!animationEnabled) {
      cancelAnimation(sv);
      sv.value = value;
      setDisplay(value);
      return;
    }
    sv.value = withTiming(value, {
      duration,
      // easeOutExpo 近似
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    });
  }, [value, animationEnabled, duration, sv]);

  useAnimatedReaction(
    () => sv.value,
    (cur) => {
      'worklet';
      // 16ms スロットルで JS に戻す
      const now = Date.now();
      if (now - lastUpdateMsRef.current < 16) return;
      lastUpdateMsRef.current = now;
      runOnJS(setDisplay)(cur);
    },
    [sv],
  );

  // ターゲット到達時の最終値を保証
  useEffect(() => {
    if (!animationEnabled) return;
    const t = setTimeout(() => setDisplay(value), duration + 20);
    return () => clearTimeout(t);
  }, [value, animationEnabled, duration]);

  const text = (format ? format(display) : String(Math.round(display)));
  return (
    <Text style={style} {...rest}>
      {prefix}
      {text}
      {suffix}
    </Text>
  );
}
