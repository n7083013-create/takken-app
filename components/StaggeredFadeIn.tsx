// ============================================================
// StaggeredFadeIn
// 子要素を index に応じて 80ms ずつ stagger で fade-in + slide-up
// 弱点 Top リスト等で使う
// - animationLevel='off' / OS reduceMotion → 静的描画
// ============================================================

import React, { useEffect } from 'react';
import { StyleProp, ViewStyle, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useAnimationEnabled } from '../hooks/useReducedMotion';

interface StaggeredFadeInProps {
  /** 0 ベースの index。表示順。 */
  index: number;
  /** 要素ごとのディレイ ms (default 80) */
  staggerMs?: number;
  /** アニメ時間 ms (default 320) */
  duration?: number;
  /** 初期 Y offset (default 12) */
  offsetY?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function StaggeredFadeIn({
  index,
  staggerMs = 80,
  duration = 320,
  offsetY = 12,
  children,
  style,
}: StaggeredFadeInProps) {
  const animationEnabled = useAnimationEnabled();
  const opacity = useSharedValue(animationEnabled ? 0 : 1);
  const ty = useSharedValue(animationEnabled ? offsetY : 0);

  useEffect(() => {
    if (!animationEnabled) {
      opacity.value = 1;
      ty.value = 0;
      return;
    }
    const delay = Math.max(0, index) * staggerMs;
    opacity.value = withDelay(
      delay,
      withTiming(1, { duration, easing: Easing.out(Easing.cubic) }),
    );
    ty.value = withDelay(
      delay,
      withTiming(0, { duration, easing: Easing.out(Easing.cubic) }),
    );
  }, [animationEnabled, index, staggerMs, duration, opacity, ty]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: ty.value }],
  }));

  if (!animationEnabled) {
    return <View style={style}>{children}</View>;
  }

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
