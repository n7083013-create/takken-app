// ============================================================
// 学習ヒートマップ（GitHub風カレンダー）
// 日別学習アクティビティを15週間分表示
// ============================================================

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { FontSize, Spacing, BorderRadius } from '../constants/theme';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';

interface StudyHeatmapProps {
  dailyLog: Record<string, number>;
}

const CELL_SIZE = 12;
const CELL_GAP = 2;
const WEEKS = 15;
const DAYS_IN_WEEK = 7;

const DAY_LABELS: Record<number, string> = {
  1: '月',
  3: '水',
  5: '金',
};

const MONTH_LABELS = [
  '1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月',
];

function getDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getIntensity(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count <= 5) return 1;
  if (count <= 15) return 2;
  if (count <= 30) return 3;
  return 4;
}

function getColorForIntensity(intensity: 0 | 1 | 2 | 3 | 4, primary: string, borderLight: string): string {
  switch (intensity) {
    case 0: return borderLight;
    case 1: return `${primary}15`;
    case 2: return `${primary}40`;
    case 3: return `${primary}80`;
    case 4: return primary;
  }
}

export function StudyHeatmap({ dailyLog }: StudyHeatmapProps) {
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);

  // Build grid: 7 rows × 15 columns, right-aligned to today
  const { grid, monthLabels, todayCount, totalStudyDays, currentMonthCount } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find the start date: go back (WEEKS * 7 - 1) days from today,
    // then align to the start of that week (Sunday = column start)
    const todayDow = today.getDay(); // 0=Sun
    const totalDays = WEEKS * DAYS_IN_WEEK;
    const endOffset = DAYS_IN_WEEK - 1 - todayDow; // days until end of this week (Saturday)
    // We want the grid to end on Saturday of the current week
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - (totalDays - 1) + endOffset);

    // Actually, let's right-align to today more simply:
    // The last column's last filled cell is today.
    // Column = week index, Row = day of week (0=Sun..6=Sat)
    // Last cell that is today: col = WEEKS-1, row = todayDow
    // Start date = today - ((WEEKS - 1) * 7 + todayDow)
    const start = new Date(today);
    start.setDate(start.getDate() - ((WEEKS - 1) * 7 + todayDow));

    const cells: { date: Date; count: number; key: string }[][] = [];
    const months: { label: string; col: number }[] = [];
    let lastMonth = -1;
    let studyDays = 0;
    let monthCount = 0;
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    let todayVal = 0;
    const todayKey = getDateKey(today);

    for (let week = 0; week < WEEKS; week++) {
      const col: { date: Date; count: number; key: string }[] = [];
      for (let day = 0; day < DAYS_IN_WEEK; day++) {
        const d = new Date(start);
        d.setDate(d.getDate() + week * 7 + day);
        const key = getDateKey(d);
        const count = dailyLog[key] ?? 0;

        // Track if this is a future date
        const isFuture = d.getTime() > today.getTime();

        col.push({ date: d, count: isFuture ? -1 : count, key });

        if (!isFuture && count > 0) {
          studyDays++;
        }

        if (!isFuture && d.getMonth() === currentMonth && d.getFullYear() === currentYear && count > 0) {
          monthCount += count;
        }

        if (key === todayKey) {
          todayVal = count;
        }

        // Month label at the first day of each new month in the grid
        if (day === 0 && d.getMonth() !== lastMonth) {
          lastMonth = d.getMonth();
          months.push({ label: MONTH_LABELS[d.getMonth()], col: week });
        }
      }
      cells.push(col);
    }

    return {
      grid: cells,
      monthLabels: months,
      todayCount: todayVal,
      totalStudyDays: studyDays,
      currentMonthCount: monthCount,
    };
  }, [dailyLog]);

  const gridWidth = WEEKS * (CELL_SIZE + CELL_GAP);
  const dayLabelWidth = 20;

  return (
    <View style={s.container}>
      {/* Month labels */}
      <View style={[s.monthRow, { marginLeft: dayLabelWidth }]}>
        {monthLabels.map((m, i) => (
          <Text
            key={`${m.label}-${m.col}-${i}`}
            style={[
              s.monthLabel,
              { left: m.col * (CELL_SIZE + CELL_GAP) },
            ]}
          >
            {m.label}
          </Text>
        ))}
      </View>

      {/* Grid area: day labels + cells */}
      <View style={s.gridArea}>
        {/* Day labels */}
        <View style={[s.dayLabels, { width: dayLabelWidth }]}>
          {Array.from({ length: 7 }).map((_, dayIdx) => (
            <View
              key={dayIdx}
              style={{
                height: CELL_SIZE,
                marginBottom: CELL_GAP,
                justifyContent: 'center',
              }}
            >
              {DAY_LABELS[dayIdx] ? (
                <Text style={s.dayLabel}>{DAY_LABELS[dayIdx]}</Text>
              ) : null}
            </View>
          ))}
        </View>

        {/* Heatmap grid */}
        <View style={s.gridContainer}>
          {grid.map((weekCols, weekIdx) => (
            <View key={weekIdx} style={s.weekColumn}>
              {weekCols.map((cell, dayIdx) => {
                const isFuture = cell.count === -1;
                const intensity = isFuture ? 0 : getIntensity(cell.count);
                const bgColor = isFuture
                  ? 'transparent'
                  : getColorForIntensity(intensity, colors.primary, colors.borderLight);
                return (
                  <View
                    key={cell.key}
                    style={[
                      s.cell,
                      {
                        backgroundColor: bgColor,
                        opacity: isFuture ? 0.3 : 1,
                      },
                    ]}
                  />
                );
              })}
            </View>
          ))}
        </View>
      </View>

      {/* Stats row */}
      <View style={s.statsRow}>
        <View style={s.statItem}>
          <Text style={s.statValue}>{totalStudyDays}</Text>
          <Text style={s.statLabel}>学習日数</Text>
        </View>
        <View style={s.statItem}>
          <Text style={s.statValue}>{currentMonthCount}</Text>
          <Text style={s.statLabel}>今月の問題数</Text>
        </View>
        <View style={s.statItem}>
          <Text style={s.statValue}>{todayCount}</Text>
          <Text style={s.statLabel}>今日</Text>
        </View>
      </View>

      {/* Legend */}
      <View style={s.legendRow}>
        <Text style={s.legendLabel}>少</Text>
        {([0, 1, 2, 3, 4] as const).map((intensity) => (
          <View
            key={intensity}
            style={[
              s.legendCell,
              {
                backgroundColor: getColorForIntensity(
                  intensity,
                  colors.primary,
                  colors.borderLight,
                ),
              },
            ]}
          />
        ))}
        <Text style={s.legendLabel}>多</Text>
      </View>
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    container: {
      paddingVertical: Spacing.md,
    },
    monthRow: {
      height: 16,
      position: 'relative',
      marginBottom: 4,
    },
    monthLabel: {
      position: 'absolute',
      fontSize: 10,
      color: C.textTertiary,
      fontWeight: '500',
    },
    gridArea: {
      flexDirection: 'row',
    },
    dayLabels: {
      justifyContent: 'flex-start',
    },
    dayLabel: {
      fontSize: 9,
      color: C.textTertiary,
      fontWeight: '500',
    },
    gridContainer: {
      flexDirection: 'row',
    },
    weekColumn: {
      marginRight: CELL_GAP,
    },
    cell: {
      width: CELL_SIZE,
      height: CELL_SIZE,
      borderRadius: 2,
      marginBottom: CELL_GAP,
    },
    statsRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginTop: Spacing.md,
      paddingTop: Spacing.sm,
      borderTopWidth: 0.5,
      borderTopColor: C.borderLight,
    },
    statItem: {
      alignItems: 'center',
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
    legendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      marginTop: Spacing.sm,
    },
    legendLabel: {
      fontSize: 10,
      color: C.textTertiary,
      fontWeight: '500',
    },
    legendCell: {
      width: CELL_SIZE,
      height: CELL_SIZE,
      borderRadius: 2,
    },
  });
}
