// ============================================================
// 直近7日間バーチャート（学習アクティビティ）
// ローリング表示で継続感を演出。目標ライン・ベストデイ・平均表示付き。
// ============================================================

import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { FontSize, Spacing, BorderRadius } from '../constants/theme';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';
import { useAnimationEnabled } from '../hooks/useReducedMotion';

/** 単一バーのアニメ用コンポーネント */
function AnimatedBar({
  targetHeight,
  isToday,
  baseStyle,
  todayBorderColor,
}: {
  targetHeight: number;
  isToday: boolean;
  baseStyle: ViewStyle;
  todayBorderColor: string;
}) {
  const animationEnabled = useAnimationEnabled();
  const height = useSharedValue(animationEnabled ? 0 : targetHeight);
  const todayPulse = useSharedValue(1);

  useEffect(() => {
    if (!animationEnabled) {
      height.value = targetHeight;
      return;
    }
    height.value = withTiming(targetHeight, {
      duration: 300,
      easing: Easing.out(Easing.cubic),
    });
  }, [targetHeight, animationEnabled, height]);

  useEffect(() => {
    if (!animationEnabled || !isToday) {
      cancelAnimation(todayPulse);
      todayPulse.value = 1;
      return;
    }
    todayPulse.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(todayPulse);
  }, [isToday, animationEnabled, todayPulse]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
    transform: [{ scaleY: todayPulse.value }],
  }));

  return (
    <Animated.View
      style={[
        baseStyle,
        animatedStyle,
        isToday && {
          borderWidth: 2,
          borderColor: todayBorderColor,
        },
      ]}
    />
  );
}

interface StudyHeatmapProps {
  dailyLog: Record<string, number>;
  streak?: number;
  dailyGoal?: number;
}

const DAYS = 7;
const BAR_MAX_HEIGHT = 100;

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

function getDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDateLabel(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function StudyHeatmap({ dailyLog, streak = 0, dailyGoal = 20 }: StudyHeatmapProps) {
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const { bars, average, bestIdx, todayCount } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result: { date: Date; count: number; label: string; dayName: string; isToday: boolean }[] = [];

    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = getDateKey(d);
      const count = dailyLog[key] ?? 0;
      result.push({
        date: d,
        count,
        label: formatDateLabel(d),
        dayName: DAY_NAMES[d.getDay()],
        isToday: i === 0,
      });
    }

    const counts = result.map((b) => b.count);
    const total = counts.reduce((a, b) => a + b, 0);
    const avg = Math.round(total / DAYS);
    const maxCount = Math.max(...counts);
    const bestIndex = maxCount > 0 ? counts.indexOf(maxCount) : -1;

    return {
      bars: result,
      average: avg,
      bestIdx: bestIndex,
      todayCount: result[result.length - 1].count,
    };
  }, [dailyLog]);

  // Calculate max value for scaling (at least dailyGoal so goal line is visible)
  const maxVal = useMemo(() => {
    const maxCount = Math.max(...bars.map((b) => b.count));
    return Math.max(maxCount, dailyGoal, 1);
  }, [bars, dailyGoal]);

  const goalLineBottom = Math.min((dailyGoal / maxVal) * BAR_MAX_HEIGHT, BAR_MAX_HEIGHT);

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.headerRow}>
        <Text style={s.headerTitle} numberOfLines={1}>直近7日間の学習</Text>
        {streak > 0 && (
          <View style={s.streakBadge}>
            <Text style={s.streakText} numberOfLines={1}>🔥 {streak}日連続</Text>
          </View>
        )}
      </View>

      {/* Chart area */}
      <View style={s.chartArea}>
        {/* Goal line */}
        {dailyGoal > 0 && (
          <View style={[s.goalLine, { bottom: goalLineBottom }]}>
            <View style={s.goalDash} />
            <Text style={s.goalLabel}>目標 {dailyGoal}問</Text>
          </View>
        )}

        {/* Bars */}
        <View style={s.barsRow}>
          {bars.map((bar, idx) => {
            const barHeight = maxVal > 0
              ? Math.max(bar.count > 0 ? 4 : 0, (bar.count / maxVal) * BAR_MAX_HEIGHT)
              : 0;
            const isBest = idx === bestIdx && bar.count > 0;
            const metGoal = bar.count >= dailyGoal;

            return (
              <View key={bar.label} style={s.barColumn}>
                {/* Count label above bar */}
                {bar.count > 0 && (
                  <Text style={[s.barCount, isBest && s.barCountBest]} numberOfLines={1}>
                    {bar.count}
                  </Text>
                )}
                {/* Best day crown */}
                {isBest && bars.filter((b) => b.count > 0).length > 1 && (
                  <Text style={s.crown}>👑</Text>
                )}
                {/* Bar */}
                <View style={s.barTrack}>
                  <AnimatedBar
                    targetHeight={barHeight}
                    isToday={bar.isToday}
                    todayBorderColor={colors.primary}
                    baseStyle={{
                      width: '100%',
                      borderRadius: BorderRadius.sm,
                      backgroundColor: metGoal
                        ? colors.primary
                        : bar.count > 0
                          ? colors.primary + 'AA'
                          : colors.borderLight,
                    }}
                  />
                </View>
                {/* Day label */}
                <Text style={[s.dayLabel, bar.isToday && s.dayLabelToday]} numberOfLines={1}>
                  {bar.isToday ? '今日' : bar.dayName}
                </Text>
                <Text style={[s.dateLabel, bar.isToday && s.dateLabelToday]} numberOfLines={1}>
                  {bar.label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Stats row */}
      <View style={s.statsRow}>
        <View style={s.statItem}>
          <Text style={s.statEmoji}>🔥</Text>
          <Text style={s.statValue}>{streak}日</Text>
          <Text style={s.statLabel}>連続</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statItem}>
          <Text style={s.statEmoji}>📊</Text>
          <Text style={s.statValue}>{average}問</Text>
          <Text style={s.statLabel}>7日平均</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statItem}>
          <Text style={s.statEmoji}>📝</Text>
          <Text style={s.statValue}>{todayCount}問</Text>
          <Text style={s.statLabel}>今日</Text>
        </View>
      </View>
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    container: {
      paddingVertical: Spacing.md,
    },

    // Header
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: Spacing.md,
    },
    headerTitle: {
      fontSize: FontSize.subhead,
      fontWeight: '700',
      color: C.text,
      flexShrink: 1,
    },
    streakBadge: {
      backgroundColor: C.primarySurface,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: BorderRadius.full,
      flexShrink: 0,
      marginLeft: 8,
    },
    streakText: {
      fontSize: FontSize.caption,
      fontWeight: '700',
      color: C.primary,
    },

    // Chart
    chartArea: {
      height: BAR_MAX_HEIGHT + 40,
      justifyContent: 'flex-end',
      position: 'relative',
    },
    goalLine: {
      position: 'absolute',
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      zIndex: 1,
    },
    goalDash: {
      flex: 1,
      height: 1,
      borderStyle: 'dashed',
      borderWidth: 1,
      borderColor: C.textTertiary + '60',
    },
    goalLabel: {
      fontSize: 9,
      color: C.textTertiary,
      fontWeight: '600',
      marginLeft: 6,
    },

    // Bars
    barsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      paddingHorizontal: 4,
    },
    barColumn: {
      flex: 1,
      alignItems: 'center',
      // [Bugfix] 横方向の余裕を確保: 曜日「今日」+日付「12/31」など長めのテキストが
      // 隣の列と接近して被って見えるのを防止 (48 → 56)
      maxWidth: 56,
    },
    barCount: {
      fontSize: 11,
      fontWeight: '700',
      color: C.textSecondary,
      // [Bugfix] 棒と数字の距離を確保 (2px → 4px) 数字が棒に密着して被って見える問題を解消
      marginBottom: 4,
    },
    barCountBest: {
      color: C.primary,
      fontWeight: '800',
    },
    crown: {
      fontSize: 12,
      marginBottom: 2,
    },
    barTrack: {
      width: 28,
      height: BAR_MAX_HEIGHT,
      justifyContent: 'flex-end',
      borderRadius: BorderRadius.sm,
      overflow: 'hidden',
    },
    barFill: {
      width: '100%',
      borderRadius: BorderRadius.sm,
    },
    barToday: {
      borderWidth: 2,
      borderColor: C.primary,
    },
    dayLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: C.textSecondary,
      marginTop: 6,
      // [Bugfix] 「今日」「日」など長さの違うラベルが折り返さないように
      lineHeight: 14,
    },
    dayLabelToday: {
      color: C.primary,
      fontWeight: '800',
    },
    dateLabel: {
      fontSize: 9,
      color: C.textTertiary,
      // [Bugfix] 曜日ラベルと日付ラベルが密着して被って見える問題を解消 (1px → 3px)
      marginTop: 3,
      lineHeight: 12,
    },
    dateLabelToday: {
      color: C.primary,
    },

    // Stats
    statsRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
      marginTop: Spacing.lg,
      paddingTop: Spacing.md,
      borderTopWidth: 0.5,
      borderTopColor: C.borderLight,
    },
    statItem: {
      alignItems: 'center',
      flex: 1,
    },
    statDivider: {
      width: 1,
      height: 30,
      backgroundColor: C.borderLight,
    },
    statEmoji: {
      fontSize: 16,
      marginBottom: 4,
    },
    statValue: {
      fontSize: FontSize.headline,
      fontWeight: '800',
      color: C.text,
    },
    statLabel: {
      fontSize: FontSize.caption2,
      color: C.textTertiary,
      fontWeight: '500',
      marginTop: 2,
    },
  });
}
