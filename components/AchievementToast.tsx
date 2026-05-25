// ============================================================
// AchievementToast
// 達成バッジ解除時に画面上部からスライドダウンするトースト
// - useAchievementStore.newlyUnlocked を購読してキューイング表示
// - 1 つあたり 1.5 秒、終わったら次をスライドアップ消失 → 次を表示
// - animationLevel='off' / OS reduceMotion → アニメ無しで簡易表示 (即時 dismiss)
// ============================================================

import React, { useEffect, useState, useMemo } from 'react';
import { Text, StyleSheet, View, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useAchievementStore,
  ALL_ACHIEVEMENTS,
} from '../store/useAchievementStore';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';
import { FontSize, BorderRadius, Spacing, Shadow } from '../constants/theme';
import { useAnimationEnabled } from '../hooks/useReducedMotion';
import { hapticSuccess } from '../services/haptics';

const VISIBLE_MS = 1500;
const SLIDE_MS = 280;

export function AchievementToast() {
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const animationEnabled = useAnimationEnabled();
  const queue = useAchievementStore((st) => st.newlyUnlocked);
  const dismissNew = useAchievementStore((st) => st.dismissNew);

  // 現在表示中の ID
  const [currentId, setCurrentId] = useState<string | null>(null);
  const translateY = useSharedValue(-120);
  const opacity = useSharedValue(0);

  // キューに新着があり、表示中が無ければ取り出す
  useEffect(() => {
    if (currentId) return;
    if (queue.length === 0) return;
    setCurrentId(queue[0]);
  }, [queue, currentId]);

  // currentId が変わったら演出開始
  useEffect(() => {
    if (!currentId) return;

    const finish = () => {
      dismissNew(currentId as any);
      setCurrentId(null);
    };

    if (!animationEnabled) {
      // アニメ無し: 即時 dismiss
      const t = setTimeout(finish, 600);
      return () => clearTimeout(t);
    }

    hapticSuccess();
    opacity.value = 1;
    translateY.value = withSequence(
      withTiming(12, { duration: SLIDE_MS, easing: Easing.out(Easing.cubic) }),
      withDelay(
        VISIBLE_MS,
        withTiming(-120, {
          duration: SLIDE_MS,
          easing: Easing.in(Easing.cubic),
        }, (done) => {
          if (done) {
            opacity.value = 0;
            runOnJS(finish)();
          }
        }),
      ),
    );

    return () => {
      // 中断時の安全側
      translateY.value = -120;
      opacity.value = 0;
    };
  }, [currentId, animationEnabled, dismissNew, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!currentId) return null;

  const badge = ALL_ACHIEVEMENTS.find((a) => a.id === currentId);
  if (!badge) return null;

  // アニメ無効: 静的に上部に出してすぐ消す
  if (!animationEnabled) {
    return (
      <SafeAreaView pointerEvents="none" style={s.safeWrap}>
        <View style={[s.toast, Shadow.lg]}>
          <Text style={s.icon}>{badge.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>実績解除！</Text>
            <Text style={s.label} numberOfLines={1}>
              {badge.title}
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView pointerEvents="none" style={s.safeWrap}>
      <Animated.View style={[s.toast, Shadow.lg, animatedStyle]}>
        <Text style={s.icon}>{badge.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>実績解除！</Text>
          <Text style={s.label} numberOfLines={1}>
            {badge.title}
          </Text>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safeWrap: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 2000,
      // SafeAreaView 自体は背景無し・pointerEvents none で操作を妨げない
      ...(Platform.OS === 'web'
        ? ({ pointerEvents: 'none' } as any)
        : {}),
    },
    toast: {
      marginHorizontal: Spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: C.card,
      borderRadius: BorderRadius.xl,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderWidth: 1.5,
      borderColor: C.primary,
    },
    icon: {
      fontSize: 32,
    },
    title: {
      fontSize: FontSize.caption,
      fontWeight: '700',
      color: C.primary,
      letterSpacing: 0.5,
    },
    label: {
      fontSize: FontSize.subhead,
      fontWeight: '800',
      color: C.text,
      marginTop: 2,
    },
  });
}
