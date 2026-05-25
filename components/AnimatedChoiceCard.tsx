// ============================================================
// AnimatedChoiceCard
// 選択肢タップ時の正解/不正解バウンス・シェイク演出を担う薄いラッパー
// - 正解: 0.9 → 1.05 → 1.0 のバウンス + 緑グロー
// - 不正解: 10px 往復シェイク (4回) + 赤フラッシュ
// - animationLevel='off' / OS reduceMotion → 演出なしで通常 Pressable
// ============================================================

import React, { useEffect } from 'react';
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
  withSequence,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { useAnimationEnabled } from '../hooks/useReducedMotion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type ChoiceFeedbackState = 'idle' | 'correct' | 'wrong';

interface AnimatedChoiceCardProps extends PressableProps {
  /** この選択肢が現在どの状態か。'correct' | 'wrong' に変わった瞬間にアニメ発火 */
  feedback: ChoiceFeedbackState;
  /** 正解色 (緑グロー用) */
  correctColor?: string;
  /** 不正解色 (赤フラッシュ用) */
  wrongColor?: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * feedback prop が 'correct' / 'wrong' になった瞬間に演出を発火する。
 * 'idle' に戻れば視覚効果は静的に戻る。
 */
export function AnimatedChoiceCard({
  feedback,
  correctColor = '#4CAF50',
  wrongColor = '#E53935',
  style,
  children,
  onPressIn,
  onPressOut,
  ...rest
}: AnimatedChoiceCardProps) {
  const animationEnabled = useAnimationEnabled();
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const glow = useSharedValue(0); // 0 = none, 1 = correct glow, -1 = wrong flash
  const pressScale = useSharedValue(1);

  useEffect(() => {
    if (!animationEnabled) return;
    if (feedback === 'correct') {
      // 0.9 → 1.05 → 1.0 のバウンス
      scale.value = withSequence(
        withTiming(0.9, { duration: 80, easing: Easing.out(Easing.quad) }),
        withTiming(1.05, { duration: 120, easing: Easing.out(Easing.quad) }),
        withSpring(1, { stiffness: 220, damping: 14 }),
      );
      glow.value = withSequence(
        withTiming(1, { duration: 200 }),
        withTiming(0.4, { duration: 600 }),
      );
    } else if (feedback === 'wrong') {
      // 10px の往復シェイク (4回) + 赤フラッシュ
      translateX.value = withSequence(
        withTiming(-10, { duration: 50 }),
        withTiming(10, { duration: 50 }),
        withTiming(-8, { duration: 50 }),
        withTiming(8, { duration: 50 }),
        withTiming(-4, { duration: 50 }),
        withTiming(0, { duration: 50 }),
      );
      glow.value = withSequence(
        withTiming(-1, { duration: 100 }),
        withTiming(-0.3, { duration: 400 }),
      );
    } else {
      // idle: ニュートラルへ
      glow.value = withTiming(0, { duration: 200 });
      translateX.value = withTiming(0, { duration: 100 });
    }
  }, [feedback, animationEnabled, scale, translateX, glow]);

  const animatedStyle = useAnimatedStyle(() => {
    if (!animationEnabled) return {};
    return {
      transform: [
        { translateX: translateX.value },
        { scale: scale.value * pressScale.value },
      ],
    };
  });

  const glowStyle = useAnimatedStyle(() => {
    if (!animationEnabled) return { opacity: 0 };
    const v = glow.value;
    return {
      opacity: Math.abs(v) * 0.35,
      backgroundColor: v >= 0 ? correctColor : wrongColor,
    };
  });

  if (!animationEnabled) {
    return (
      <Pressable style={style} {...rest}>
        {children}
      </Pressable>
    );
  }

  return (
    <View style={{ position: 'relative' }}>
      {/* グロー / フラッシュ層 (背面・pointerEvents none) */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            left: -2,
            right: -2,
            top: -2,
            bottom: -2,
            borderRadius: 16,
          },
          glowStyle,
        ]}
      />
      <AnimatedPressable
        style={[style, animatedStyle]}
        onPressIn={(e) => {
          if (feedback === 'idle') {
            pressScale.value = withTiming(0.97, { duration: 80 });
          }
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          pressScale.value = withSpring(1, { stiffness: 240, damping: 18 });
          onPressOut?.(e);
        }}
        {...rest}
      >
        {children as any}
      </AnimatedPressable>
    </View>
  );
}
