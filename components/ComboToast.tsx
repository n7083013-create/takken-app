// ============================================================
// コンボトースト（集中を妨げない控えめな連続正解通知）
// 画面右上に一瞬だけ表示 → フェードアウト
// 3連続以上で表示。設定で OFF 可能。
// ============================================================

import { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { FontSize, BorderRadius, Shadow } from '../constants/theme';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';
import { shouldShowAnimation } from '../services/haptics';

interface ComboToastProps {
  /** 現在のコンボ数（3未満は表示されない） */
  combo: number;
}

/** コンボに応じた文言・絵文字 */
function getComboLabel(combo: number): { text: string; emoji: string; color?: string } | null {
  if (combo < 3) return null;
  if (combo < 5) return { text: `${combo}連続正解`, emoji: '🔥' };
  if (combo < 10) return { text: `${combo}連続正解！`, emoji: '🔥' };
  if (combo < 20) return { text: `${combo}連続正解！`, emoji: '⚡' };
  return { text: `${combo}連続正解！`, emoji: '👑' };
}

export function ComboToast({ combo }: ComboToastProps) {
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-8)).current;
  const scale = useRef(new Animated.Value(0.92)).current;

  const label = getComboLabel(combo);
  const showAnim = shouldShowAnimation('subtle');

  useEffect(() => {
    if (!label || !showAnim) return;

    // 表示
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 6,
        tension: 100,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // 約1.2秒後にフェードアウト
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 240,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: -8,
            duration: 240,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ]).start();
      }, 1200);
    });
  }, [combo]);  // コンボ数が変わるたびに再発火

  if (!label || !showAnim) return null;

  return (
    <Animated.View
      style={[
        s.container,
        {
          opacity,
          transform: [{ translateY }, { scale }],
        },
      ]}
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${combo}連続正解`}
    >
      <Text style={s.emoji}>{label.emoji}</Text>
      <Text style={s.text}>{label.text}</Text>
    </Animated.View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    container: {
      position: 'absolute',
      top: 12,
      right: 12,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.primary,
      borderRadius: BorderRadius.full,
      paddingHorizontal: 12,
      paddingVertical: 6,
      gap: 4,
      ...Shadow.md,
      zIndex: 100,
    },
    emoji: {
      fontSize: 14,
    },
    text: {
      fontSize: FontSize.caption,
      fontWeight: '800',
      color: C.white,
    },
  });
}
