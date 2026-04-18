// ============================================================
// 直近7日間バーチャート（学習アクティビティ）
// ローリング表示で継続感を演出。目標ライン・ベストデイ・平均表示付き。
// ============================================================

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FontSize, Spacing, BorderRadius } from '../constants/theme';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';

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
        <Text style={s.headerTitle}>直近7日間の学習</Text>
        {streak > 0 && (
          <View style={s.streakBadge}>
            <Text style={s.streakText}>🔥 {streak}日連続</Text>
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
                  <Text style={[s.barCount, isBest && s.barCountBest]}>
                    {bar.count}
                  </Text>
                )}
                {/* Best day crown */}
                {isBest && bars.filter((b) => b.count > 0).length > 1 && (
                  <Text style={s.crown}>👑</Text>
                )}
                {/* Bar */}
                <View style={s.barTrack}>
                  <View
                    style={[
                      s.barFill,
                      {
                        height: barHeight,
                        backgroundColor: metGoal
                          ? colors.primary
                          : bar.count > 0
                            ? colors.primary + 'AA'
                            : colors.borderLight,
                      },
                      bar.isToday && s.barToday,
                    ]}
                  />
                </View>
                {/* Day label */}
                <Text style={[s.dayLabel, bar.isToday && s.dayLabelToday]}>
                  {bar.isToday ? '今日' : bar.dayName}
                </Text>
                <Text style={[s.dateLabel, bar.isToday && s.dateLabelToday]}>
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
    },
    streakBadge: {
      backgroundColor: C.primarySurface,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: BorderRadius.full,
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
      maxWidth: 48,
    },
    barCount: {
      fontSize: 11,
      fontWeight: '700',
      color: C.textSecondary,
      marginBottom: 2,
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
    },
    dayLabelToday: {
      color: C.primary,
      fontWeight: '800',
    },
    dateLabel: {
      fontSize: 9,
      color: C.textTertiary,
      marginTop: 1,
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
