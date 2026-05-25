// ============================================================
// PressableScale
// 押下時に scale(0.96) → spring で scale(1) に戻る触り心地の良いラッパー
// - settings.animationLevel='off' / OS reduceMotion 有効時は plain Pressable
// - Reanimated v3+ の useSharedValue + useAnimatedStyle (worklet)
// - 既存 Pressable と同じ props を透過する
// ============================================================

import React, { forwardRef } from 'react';
import {
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
  View,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useAnimationEnabled } from '../hooks/useReducedMotion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PressableScaleProps extends PressableProps {
  /** 縮むスケール (default 0.96) */
  pressedScale?: number;
  /** spring の硬さ (default 240) */
  stiffness?: number;
  /** spring の減衰 (default 18) */
  damping?: number;
  /** 子要素 */
  children?: React.ReactNode;
  /** style: 関数形式は受け付けず、配列/オブジェクトのみサポート */
  style?: StyleProp<ViewStyle>;
}

/**
 * 主要な Pressable の代わりに使う。spring ベースの press feedback。
 *
 * 注意: style は ViewStyle のみ。Pressable の `({pressed}) => ...` 形式は
 * 内部 scale と競合するため非サポート。代わりに親要素で表現してください。
 */
export const PressableScale = forwardRef<View, PressableScaleProps>(
  function PressableScale(
    {
      pressedScale = 0.96,
      stiffness = 240,
      damping = 18,
      onPressIn,
      onPressOut,
      style,
      children,
      ...rest
    },
    ref,
  ) {
    const animationEnabled = useAnimationEnabled();
    const scale = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
    }));

    if (!animationEnabled) {
      // アニメ無効: 通常 Pressable で描画（早期 return）
      return (
        <Pressable ref={ref} style={style} {...rest}>
          {children}
        </Pressable>
      );
    }

    return (
      <AnimatedPressable
        ref={ref as React.Ref<any>}
        style={[style, animatedStyle]}
        onPressIn={(e) => {
          scale.value = withTiming(pressedScale, { duration: 80 });
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          scale.value = withSpring(1, { stiffness, damping, mass: 0.6 });
          onPressOut?.(e);
        }}
        {...rest}
      >
        {children as any}
      </AnimatedPressable>
    );
  },
);
