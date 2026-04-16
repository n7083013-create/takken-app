// ============================================================
// LoadingSkeleton - ホーム画面の初期化中に表示するスケルトン
// アニメーション付きシマー効果でダッシュボードのレイアウトを模倣
// ============================================================

import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { Spacing, BorderRadius } from '../constants/theme';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';

/** シマーアニメーション付きのスケルトンブロック */
function SkeletonBlock({
  width,
  height,
  borderRadius = BorderRadius.md,
  style,
  shimmerProgress,
}: {
  width: number | `${number}%`;
  height: number | `${number}%`;
  borderRadius?: number;
  style?: object;
  shimmerProgress: { value: number };
}) {
  const colors = useThemeColors();

  const animatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      shimmerProgress.value,
      [0, 0.5, 1],
      [0.3, 0.7, 0.3],
    );
    return { opacity };
  });

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: colors.borderLight,
        },
        style,
        animatedStyle,
      ]}
    />
  );
}

export function LoadingSkeleton() {
  const colors = useThemeColors();
  const s = makeStyles(colors);
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1, // infinite
      true, // reverse
    );
  }, []);

  return (
    <SafeAreaView style={s.safe}>
      {/* Hero area */}
      <View style={s.hero}>
        <View style={s.heroTop}>
          <View>
            <SkeletonBlock width={100} height={14} borderRadius={4} shimmerProgress={shimmer} style={{ marginBottom: 8, backgroundColor: 'rgba(255,255,255,0.15)' }} />
            <SkeletonBlock width={140} height={40} borderRadius={6} shimmerProgress={shimmer} style={{ backgroundColor: 'rgba(255,255,255,0.15)' }} />
          </View>
          <SkeletonBlock width={56} height={56} borderRadius={BorderRadius.lg} shimmerProgress={shimmer} style={{ backgroundColor: 'rgba(255,255,255,0.15)' }} />
        </View>
      </View>

      {/* Dashboard card */}
      <View style={s.dashCard}>
        <View style={s.dashTop}>
          {/* Daily goal ring placeholder */}
          <View style={{ alignItems: 'center' }}>
            <SkeletonBlock width={64} height={64} borderRadius={32} shimmerProgress={shimmer} />
            <SkeletonBlock width={50} height={10} borderRadius={4} shimmerProgress={shimmer} style={{ marginTop: 8 }} />
          </View>
          {/* Stats row */}
          <View style={s.statsRow}>
            {[1, 2, 3].map((i) => (
              <View key={i} style={{ alignItems: 'center' }}>
                <SkeletonBlock width={40} height={20} borderRadius={4} shimmerProgress={shimmer} />
                <SkeletonBlock width={30} height={10} borderRadius={4} shimmerProgress={shimmer} style={{ marginTop: 6 }} />
              </View>
            ))}
          </View>
        </View>
        {/* Progress bar */}
        <SkeletonBlock width="100%" height={6} borderRadius={3} shimmerProgress={shimmer} style={{ marginTop: 14 }} />
      </View>

      {/* Main CTA */}
      <View style={s.ctaCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <SkeletonBlock width={40} height={40} borderRadius={BorderRadius.md} shimmerProgress={shimmer} style={{ backgroundColor: 'rgba(255,255,255,0.15)' }} />
          <View style={{ flex: 1 }}>
            <SkeletonBlock width="70%" height={16} borderRadius={4} shimmerProgress={shimmer} style={{ backgroundColor: 'rgba(255,255,255,0.15)' }} />
            <SkeletonBlock width="90%" height={12} borderRadius={4} shimmerProgress={shimmer} style={{ marginTop: 6, backgroundColor: 'rgba(255,255,255,0.15)' }} />
          </View>
        </View>
      </View>

      {/* Quick action grid (4 items) */}
      <View style={s.quickGrid}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={s.quickCard}>
            <SkeletonBlock width={24} height={24} borderRadius={6} shimmerProgress={shimmer} />
            <SkeletonBlock width={32} height={10} borderRadius={4} shimmerProgress={shimmer} style={{ marginTop: 6 }} />
          </View>
        ))}
      </View>

      {/* Quest banner */}
      <View style={s.questCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <SkeletonBlock width={32} height={32} borderRadius={8} shimmerProgress={shimmer} />
          <View style={{ flex: 1 }}>
            <SkeletonBlock width="50%" height={14} borderRadius={4} shimmerProgress={shimmer} />
            <SkeletonBlock width="70%" height={10} borderRadius={4} shimmerProgress={shimmer} style={{ marginTop: 6 }} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <View style={{ flex: 1 }}>
            <SkeletonBlock width="100%" height={5} borderRadius={3} shimmerProgress={shimmer} />
          </View>
          <SkeletonBlock width={30} height={12} borderRadius={4} shimmerProgress={shimmer} />
        </View>
      </View>

      {/* Section title + category cards */}
      <SkeletonBlock width={100} height={18} borderRadius={4} shimmerProgress={shimmer} style={{ marginTop: 28, marginBottom: 14, marginHorizontal: Spacing.xl }} />
      {[1, 2, 3, 4].map((i) => (
        <View key={i} style={s.catCard}>
          <SkeletonBlock width={4} height="100%" borderRadius={0} shimmerProgress={shimmer} style={{ position: 'absolute', left: 0, top: 0, bottom: 0 }} />
          <View style={{ flex: 1, padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <SkeletonBlock width={24} height={24} borderRadius={6} shimmerProgress={shimmer} />
                <View>
                  <SkeletonBlock width={80} height={14} borderRadius={4} shimmerProgress={shimmer} />
                  <SkeletonBlock width={100} height={10} borderRadius={4} shimmerProgress={shimmer} style={{ marginTop: 4 }} />
                </View>
              </View>
              <SkeletonBlock width={40} height={22} borderRadius={4} shimmerProgress={shimmer} />
            </View>
            <SkeletonBlock width="100%" height={5} borderRadius={3} shimmerProgress={shimmer} style={{ marginTop: 12 }} />
          </View>
        </View>
      ))}
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: C.background,
    },
    hero: {
      paddingHorizontal: Spacing.xl,
      paddingTop: 24,
      paddingBottom: 28,
      backgroundColor: C.primary,
      borderBottomLeftRadius: BorderRadius.xxl,
      borderBottomRightRadius: BorderRadius.xxl,
    },
    heroTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    dashCard: {
      marginHorizontal: Spacing.xl,
      marginTop: Spacing.lg,
      backgroundColor: C.card,
      borderRadius: BorderRadius.xl,
      padding: 18,
    },
    dashTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    statsRow: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'space-around',
    },
    ctaCard: {
      marginHorizontal: Spacing.xl,
      marginTop: Spacing.lg,
      backgroundColor: C.primary,
      borderRadius: BorderRadius.xl,
      padding: 20,
    },
    quickGrid: {
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: Spacing.xl,
      marginTop: Spacing.lg,
    },
    quickCard: {
      flex: 1,
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      paddingVertical: 14,
      alignItems: 'center',
    },
    questCard: {
      marginHorizontal: Spacing.xl,
      marginTop: Spacing.xl,
      backgroundColor: C.card,
      borderRadius: BorderRadius.xl,
      padding: Spacing.lg,
      borderWidth: 1.5,
      borderColor: C.borderLight,
    },
    catCard: {
      flexDirection: 'row',
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      marginHorizontal: Spacing.xl,
      marginBottom: 10,
      overflow: 'hidden',
    },
  });
}
