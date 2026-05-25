// ============================================================
// StreakPulse
// ストリーク数値の脈動 + 増加時のバウンス演出を担う薄いラッパー
// - 通常: 1.0 ↔ 1.03 の永続パルス (呼吸感)
// - streak が 1 増えた瞬間: 1 → 1.4 → 1 のバウンス
// - animationLevel='off' / OS reduceMotion → 静的描画 (early return)
// ============================================================

import React, { useEffect, useRef } from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withRepeat,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { useAnimationEnabled } from '../hooks/useReducedMotion';

interface StreakPulseProps {
  /** ストリーク日数。増加検知に使う */
  streak: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 永続パルスを有効にするか (default true) */
  breathing?: boolean;
}

export function StreakPulse({
  streak,
  children,
  style,
  breathing = true,
}: StreakPulseProps) {
  const animationEnabled = useAnimationEnabled();
  const scale = useSharedValue(1);
  const prevStreakRef = useRef(streak);

  // 永続パルス
  useEffect(() => {
    if (!animationEnabled || !breathing) {
      cancelAnimation(scale);
      scale.value = 1;
      return;
    }
    // 増加バウンス中は中断したくないので、loop は緩やかに上書き
    scale.value = withRepeat(
      withSequence(
        withTiming(1.03, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.0, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    return () => {
      cancelAnimation(scale);
    };
  }, [animationEnabled, breathing, scale]);

  // 増加時のバウンス
  useEffect(() => {
    if (!animationEnabled) {
      prevStreakRef.current = streak;
      return;
    }
    if (streak > prevStreakRef.current) {
      // 1 → 1.4 → 1
      scale.value = withSequence(
        withTiming(1.4, { duration: 180, easing: Easing.out(Easing.quad) }),
        withTiming(1.0, { duration: 220, easing: Easing.inOut(Easing.quad) }),
      );
      // バウンス後にパルスを再開
      if (breathing) {
        const t = setTimeout(() => {
          scale.value = withRepeat(
            withSequence(
              withTiming(1.03, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
              withTiming(1.0, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
            ),
            -1,
            false,
          );
        }, 450);
        prevStreakRef.current = streak;
        return () => clearTimeout(t);
      }
    }
    prevStreakRef.current = streak;
  }, [streak, animationEnabled, breathing, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  if (!animationEnabled) {
    return <View style={style}>{children}</View>;
  }

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
