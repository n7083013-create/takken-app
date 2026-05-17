// ============================================================
// 弱点ヒートマップ画面
// カテゴリ × サブカテゴリの正答率マトリックスを可視化
// ============================================================

import { useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Animated,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import {
  FontSize,
  LineHeight,
  Spacing,
  BorderRadius,
  Shadow,
  LetterSpacing,
} from '../constants/theme';
import { useThemeColors, useIsDark, type ThemeColors } from '../hooks/useThemeColors';
import { useHeatmap, HeatmapCell, HeatmapStatus } from '../hooks/useHeatmap';
import { CATEGORY_LABELS, type Category } from '../types';
import { WebBackButton } from '../components/WebBackButton';

/** ステータスごとのセル色（ライト/ダーク両対応） */
function statusColors(status: HeatmapStatus, C: ThemeColors, isDark: boolean) {
  switch (status) {
    case 'strong':
      // 緑系（80%以上）
      return {
        bg: isDark ? '#0F3D24' : '#D7F2DF',
        border: isDark ? '#1F8F47' : '#34A853',
        text: isDark ? '#6FE38C' : '#0F6E2C',
      };
    case 'standard':
      // 黄系（50-80%）
      return {
        bg: isDark ? '#3A2E08' : '#FFF1C9',
        border: isDark ? '#C99100' : '#E8860C',
        text: isDark ? '#FFD262' : '#8A4F00',
      };
    case 'weak':
      // 赤系（50%未満）
      return {
        bg: isDark ? '#3A1213' : '#FCE0E0',
        border: isDark ? '#FF5454' : '#D93025',
        text: isDark ? '#FF8A85' : '#A01B14',
      };
    case 'unstarted':
    default:
      // 灰系（未着手）
      return {
        bg: isDark ? '#1F2120' : '#EFEFEC',
        border: C.borderLight,
        text: C.textTertiary,
      };
  }
}

const STATUS_LABEL: Record<HeatmapStatus, string> = {
  strong: '得意',
  standard: '標準',
  weak: '弱点',
  unstarted: '未着手',
};

/** セル内に表示する達成率テキスト
 *  [新仕様 2026-05] 旧「正答率(解いた問題中の正答率)」だと1問正解で100%表示となり誤誘導。
 *  新「達成率(3連正解した問題 / 全問題)」で母数を全問題に揃え、過大評価を防止。 */
function cellPctLabel(cell: HeatmapCell): string {
  if (cell.attemptedCount === 0) return '—';
  return `${Math.round(cell.masteryRate * 100)}%`;
}

/** アニメーション付きセル: マウント時に fade-in */
function HeatmapCellView({
  cell,
  category,
  delay,
  cellSize,
  onPress,
  C,
  isDark,
}: {
  cell: HeatmapCell;
  category: Category;
  delay: number;
  cellSize: number;
  onPress: () => void;
  C: ThemeColors;
  isDark: boolean;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 320,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 320,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY, delay]);

  const colors = statusColors(cell.status, C, isDark);
  const pctLabel = cellPctLabel(cell);
  const a11yLabel =
    cell.status === 'unstarted'
      ? `${cell.label}（未着手・${cell.total}問）`
      : `${cell.label}（${STATUS_LABEL[cell.status]}・達成率${pctLabel}・${cell.masteredCount}/${cell.total}問達成）`;

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityHint="タップでこのサブカテゴリの問題を表示"
        style={[
          styles.cell,
          {
            width: cellSize,
            minHeight: cellSize,
            backgroundColor: colors.bg,
            borderColor: colors.border,
          },
        ]}
      >
        <Text
          style={[styles.cellIcon]}
          numberOfLines={1}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {cell.icon}
        </Text>
        <Text
          style={[styles.cellLabel, { color: colors.text }]}
          numberOfLines={2}
        >
          {cell.label}
        </Text>
        <Text style={[styles.cellPct, { color: colors.text }]}>{pctLabel}</Text>
        <Text
          style={[styles.cellCount, { color: colors.text, opacity: 0.75 }]}
          numberOfLines={1}
        >
          {cell.masteredCount}/{cell.total} 達成
        </Text>
        {cell.dueCount > 0 && (
          <View
            style={[styles.dueDot, { backgroundColor: C.accent }]}
            accessibilityLabel={`復習期限${cell.dueCount}問`}
          />
        )}
      </Pressable>
    </Animated.View>
  );
}

export default function HeatmapScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const isDark = useIsDark();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const data = useHeatmap();

  // レスポンシブ: ウィンドウ幅でセル数を決定
  const { width } = useWindowDimensions();
  // iPhone (small): 3 columns, Tablet/Web: 4-6 columns
  const columns = useMemo(() => {
    if (width >= 1100) return 6;
    if (width >= 900) return 5;
    if (width >= 700) return 4;
    if (width >= 480) return 4;
    return 3;
  }, [width]);

  const handleCellPress = (category: Category, _cell: HeatmapCell) => {
    // 既存の questions タブは category パラメータをサポート
    // サブカテゴリの自動展開は QuestionsScreen 側で対応
    router.push({ pathname: '/(tabs)/questions', params: { category } });
  };

  const handleStartDrill = () => {
    router.push('/weak-drill');
  };

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen
        options={{
          title: '弱点ヒートマップ',
          headerBackTitle: '戻る',
        }}
      />
      <WebBackButton />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* ── ヘッダー ── */}
        <View style={s.header}>
          <Text style={s.title}>弱点ヒートマップ</Text>
          <Text style={s.subtitle}>
            カテゴリ × サブカテゴリの達成率を一目で確認
          </Text>
        </View>

        {/* ── サマリーカード ── */}
        <View style={[s.summaryCard, Shadow.sm]}>
          <View style={s.summaryRow}>
            <SummaryItem
              label="得意"
              count={data.strongCount}
              color={statusColors('strong', colors, isDark).border}
              C={colors}
            />
            <SummaryItem
              label="標準"
              count={data.standardCount}
              color={statusColors('standard', colors, isDark).border}
              C={colors}
            />
            <SummaryItem
              label="弱点"
              count={data.weakCount}
              color={statusColors('weak', colors, isDark).border}
              C={colors}
            />
            <SummaryItem
              label="未着手"
              count={data.unstartedCount}
              color={statusColors('unstarted', colors, isDark).border}
              C={colors}
            />
          </View>
        </View>

        {/* ── 凡例 ── */}
        <View style={s.legendRow} accessibilityLabel="凡例">
          <LegendDot label="得意" color={statusColors('strong', colors, isDark).border} C={colors} />
          <LegendDot label="標準" color={statusColors('standard', colors, isDark).border} C={colors} />
          <LegendDot label="弱点" color={statusColors('weak', colors, isDark).border} C={colors} />
          <LegendDot label="未着手" color={statusColors('unstarted', colors, isDark).border} C={colors} />
        </View>

        {/* ── 判定基準の説明 (達成率ベース) ── */}
        <View style={s.legendNote}>
          <Text style={s.legendNoteText}>
            ※ 表示は「達成率」= 3回連続正解した問題 ÷ サブカテゴリ全問題数。{'\n'}
            70%以上で「得意」、30%以上で「標準」、30%未満で「弱点」と判定。{'\n'}
            1問正解で100%になる誤誘導を防ぐため、母数は全問題数で固定です。
          </Text>
        </View>

        {/* ── 弱点ドリル CTA ── */}
        {data.weakCount > 0 && (
          <Pressable
            style={[s.drillCta, Shadow.md]}
            onPress={handleStartDrill}
            accessibilityRole="button"
            accessibilityLabel={`弱点${data.weakCount}サブカテゴリを集中ドリル`}
          >
            <Text style={s.drillCtaIcon}>💪</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.drillCtaTitle}>弱点ドリルを開始</Text>
              <Text style={s.drillCtaSub}>
                赤セル {data.weakCount}個 を集中攻撃して合格に近づく
              </Text>
            </View>
            <Text style={s.drillCtaArrow}>→</Text>
          </Pressable>
        )}

        {/* ── マトリックス ── */}
        {data.rows.map((row, rowIdx) => {
          if (row.cells.length === 0) return null;
          return (
            <View key={row.category} style={s.rowSection}>
              <View style={s.rowHeader}>
                <View style={[s.rowAccent, { backgroundColor: row.color }]} />
                <Text style={s.rowIcon}>{row.icon}</Text>
                <Text style={s.rowTitle}>{row.label}</Text>
                <Text style={s.rowMeta}>
                  {row.cells.length}サブカテゴリ
                </Text>
              </View>
              <View style={s.grid}>
                {row.cells.map((cell, cellIdx) => {
                  // セル幅: コンテナ幅 - padding(xl×2) を columns で分割
                  const containerPadding = Spacing.xl * 2;
                  const gap = 8;
                  const cellSize =
                    (Math.min(width, 1200) - containerPadding - gap * (columns - 1)) / columns;
                  // 入場アニメ delay: 行ごと + セルごとに少しずつ
                  const delay = Math.min(rowIdx * 80 + cellIdx * 25, 600);
                  return (
                    <HeatmapCellView
                      key={cell.subKey}
                      cell={cell}
                      category={row.category}
                      delay={delay}
                      cellSize={cellSize}
                      onPress={() => handleCellPress(row.category, cell)}
                      C={colors}
                      isDark={isDark}
                    />
                  );
                })}
              </View>
            </View>
          );
        })}

        {/* ── 弱点 Top3 詳細 ── */}
        {data.weakTop3.length > 0 && (
          <View style={[s.weakListCard, Shadow.sm]}>
            <Text style={s.weakListTitle}>苦手なサブカテゴリ Top {data.weakTop3.length}</Text>
            {data.weakTop3.map((item, i) => (
              <Pressable
                key={`${item.category}-${item.cell.subKey}`}
                style={s.weakListRow}
                onPress={() => handleCellPress(item.category, item.cell)}
                accessibilityRole="button"
                accessibilityLabel={`${item.cell.label} 達成率${Math.round(item.cell.masteryRate * 100)}%`}
              >
                <Text style={s.weakListRank}>{i + 1}</Text>
                <Text style={s.weakListIcon}>{item.cell.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.weakListLabel}>{item.cell.label}</Text>
                  <Text style={s.weakListSub}>
                    {CATEGORY_LABELS[item.category]} ・ {item.cell.masteredCount}/{item.cell.total}問達成
                  </Text>
                </View>
                <Text style={[s.weakListPct, { color: statusColors('weak', colors, isDark).text }]}>
                  {Math.round(item.cell.masteryRate * 100)}%
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryItem({
  label,
  count,
  color,
  C,
}: {
  label: string;
  count: number;
  color: string;
  C: ThemeColors;
}) {
  return (
    <View style={styles.summaryItem}>
      <View style={[styles.summaryDot, { backgroundColor: color }]} />
      <Text style={[styles.summaryLabel, { color: C.textSecondary }]}>{label}</Text>
      <Text style={[styles.summaryCount, { color: C.text }]}>{count}</Text>
    </View>
  );
}

function LegendDot({
  label,
  color,
  C,
}: {
  label: string;
  color: string;
  C: ThemeColors;
}) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[styles.legendLabel, { color: C.textSecondary }]}>{label}</Text>
    </View>
  );
}

// ─── 共通スタイル（テーマ非依存）───
const styles = StyleSheet.create({
  cell: {
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  cellIcon: {
    fontSize: 16,
    marginBottom: 2,
  },
  cellLabel: {
    fontSize: FontSize.caption2,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 14,
    marginBottom: 2,
  },
  cellPct: {
    fontSize: FontSize.subhead,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  cellCount: {
    fontSize: 9,
    fontWeight: '600',
    marginTop: 1,
  },
  dueDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: FontSize.caption2,
    fontWeight: '600',
    marginBottom: 2,
  },
  summaryCount: {
    fontSize: FontSize.title3,
    fontWeight: '900',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: FontSize.caption2,
    fontWeight: '600',
  },
});

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.background },
    scroll: {
      paddingHorizontal: Spacing.xl,
      paddingTop: Spacing.lg,
      paddingBottom: 40,
      // Web: 中央揃え（最大幅 1200）
      ...(Platform.OS === 'web' ? { maxWidth: 1200, width: '100%', alignSelf: 'center' as const } : {}),
    },

    header: {
      marginBottom: Spacing.lg,
    },
    title: {
      fontSize: FontSize.title1,
      fontWeight: '900',
      color: C.text,
      letterSpacing: LetterSpacing.tight,
    },
    subtitle: {
      fontSize: FontSize.subhead,
      color: C.textSecondary,
      marginTop: 4,
      lineHeight: LineHeight.subhead,
    },

    summaryCard: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      padding: Spacing.lg,
      marginBottom: Spacing.md,
    },
    summaryRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
    },

    legendRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      paddingVertical: Spacing.sm,
      marginBottom: Spacing.xs,
    },
    legendNote: {
      marginBottom: Spacing.lg,
      paddingHorizontal: Spacing.xs,
    },
    legendNoteText: {
      fontSize: 11,
      color: C.textTertiary,
      lineHeight: 16,
    },

    drillCta: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.primary,
      borderRadius: BorderRadius.lg,
      padding: Spacing.lg,
      gap: 12,
      marginBottom: Spacing.xl,
    },
    drillCtaIcon: { fontSize: 32 },
    drillCtaTitle: {
      fontSize: FontSize.callout,
      fontWeight: '800',
      color: C.white,
    },
    drillCtaSub: {
      fontSize: FontSize.caption,
      color: 'rgba(255,255,255,0.85)',
      marginTop: 2,
    },
    drillCtaArrow: {
      fontSize: 24,
      color: C.white,
      fontWeight: '300',
    },

    rowSection: {
      marginBottom: Spacing.xl,
    },
    rowHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: Spacing.md,
    },
    rowAccent: {
      width: 4,
      height: 20,
      borderRadius: 2,
    },
    rowIcon: { fontSize: 18 },
    rowTitle: {
      fontSize: FontSize.headline,
      fontWeight: '800',
      color: C.text,
      flex: 1,
    },
    rowMeta: {
      fontSize: FontSize.caption,
      color: C.textTertiary,
      fontWeight: '600',
    },

    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },

    weakListCard: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      padding: Spacing.lg,
      marginTop: Spacing.lg,
    },
    weakListTitle: {
      fontSize: FontSize.subhead,
      fontWeight: '800',
      color: C.text,
      marginBottom: Spacing.sm,
    },
    weakListRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: 0.5,
      borderBottomColor: C.borderLight,
    },
    weakListRank: {
      fontSize: FontSize.subhead,
      fontWeight: '800',
      color: C.textTertiary,
      width: 20,
      textAlign: 'center',
    },
    weakListIcon: { fontSize: 18 },
    weakListLabel: {
      fontSize: FontSize.subhead,
      fontWeight: '700',
      color: C.text,
    },
    weakListSub: {
      fontSize: FontSize.caption,
      color: C.textSecondary,
      marginTop: 2,
    },
    weakListPct: {
      fontSize: FontSize.headline,
      fontWeight: '900',
    },
  });
}
