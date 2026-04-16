// ============================================================
// 法改正バッジコンポーネント
// 問題に関連する法改正がある場合にインラインで表示
// タップで展開し、各改正の詳細を確認できる
// ============================================================

import { useState, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';
import { getRelatedAmendments } from '../data/lawAmendments';
import { useThemeColors, ThemeColors } from '../hooks/useThemeColors';
import { FontSize, LineHeight, BorderRadius, Spacing } from '../constants/theme';
import type { LawAmendment } from '../types';

// Android で LayoutAnimation を有効化
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Props {
  tags: string[];
}

/** 試験影響度に応じた色設定を返す */
function getImpactStyle(
  impact: LawAmendment['examImpact'],
  colors: ThemeColors,
): { bg: string; text: string; label: string } {
  switch (impact) {
    case 'high':
      return { bg: colors.error + '18', text: colors.error, label: '重要度: 高' };
    case 'medium':
      return { bg: colors.warning + '18', text: '#B8860B', label: '重要度: 中' };
    case 'low':
    default:
      return { bg: colors.borderLight, text: colors.textTertiary, label: '重要度: 低' };
  }
}

export function LawAmendmentBadge({ tags }: Props) {
  const [expanded, setExpanded] = useState(false);
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const amendments = useMemo(() => getRelatedAmendments(tags), [tags]);

  if (amendments.length === 0) return null;

  const hasHighImpact = amendments.some((a) => a.examImpact === 'high');

  const toggleExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  };

  return (
    <View style={s.container}>
      {/* Collapsed: pill badge */}
      <Pressable
        style={[s.pill, hasHighImpact && s.pillHighImpact]}
        onPress={toggleExpanded}
        accessibilityRole="button"
        accessibilityLabel={`法改正あり（${amendments.length}件）。タップで${expanded ? '閉じる' : '詳細を表示'}`}
        accessibilityState={{ expanded }}
      >
        <Text style={s.pillIcon}>{'⚖️'}</Text>
        <Text style={[s.pillText, hasHighImpact && s.pillTextHighImpact]}>
          法改正あり
        </Text>
        <Text style={[s.pillCount, hasHighImpact && s.pillCountHighImpact]}>
          {amendments.length}
        </Text>
        <Text style={[s.pillArrow, hasHighImpact && s.pillArrowHighImpact]}>
          {expanded ? '▲' : '▼'}
        </Text>
      </Pressable>

      {/* Expanded: amendment details */}
      {expanded && (
        <View style={s.detailsContainer}>
          {amendments.map((amendment) => {
            const impact = getImpactStyle(amendment.examImpact, colors);
            return (
              <View key={amendment.id} style={s.amendCard}>
                <View style={s.amendHeader}>
                  <Text style={s.amendName} numberOfLines={2}>
                    {amendment.lawName}
                  </Text>
                  <View style={[s.impactBadge, { backgroundColor: impact.bg }]}>
                    <Text style={[s.impactText, { color: impact.text }]}>
                      {impact.label}
                    </Text>
                  </View>
                </View>
                <Text style={s.amendDate}>
                  施行日: {new Date(amendment.effectiveDate).toLocaleDateString('ja-JP')}
                </Text>
                <Text style={s.amendSummary}>{amendment.summary}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    container: {
      marginBottom: Spacing.md,
    },

    // ─── Pill Badge (collapsed) ───
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: C.warningSurface,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: BorderRadius.full,
      gap: 5,
      borderWidth: 1,
      borderColor: C.warning + '30',
    },
    pillHighImpact: {
      backgroundColor: C.warningSurface,
      borderColor: C.warning + '50',
    },
    pillIcon: {
      fontSize: 13,
    },
    pillText: {
      fontSize: FontSize.caption,
      fontWeight: '700',
      color: '#9A7B00',
    },
    pillTextHighImpact: {
      color: '#8B6914',
    },
    pillCount: {
      fontSize: FontSize.caption2,
      fontWeight: '800',
      color: '#9A7B00',
      backgroundColor: C.warning + '20',
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: BorderRadius.sm,
      overflow: 'hidden',
    },
    pillCountHighImpact: {
      color: '#8B6914',
      backgroundColor: C.warning + '30',
    },
    pillArrow: {
      fontSize: 8,
      color: '#9A7B00',
    },
    pillArrowHighImpact: {
      color: '#8B6914',
    },

    // ─── Details (expanded) ───
    detailsContainer: {
      marginTop: Spacing.sm,
      gap: Spacing.sm,
    },
    amendCard: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      padding: Spacing.lg,
      borderWidth: 1,
      borderColor: C.border,
    },
    amendHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 6,
      gap: Spacing.sm,
    },
    amendName: {
      fontSize: FontSize.subhead,
      fontWeight: '700',
      color: C.text,
      flex: 1,
    },
    impactBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: BorderRadius.sm,
    },
    impactText: {
      fontSize: FontSize.caption2,
      fontWeight: '700',
    },
    amendDate: {
      fontSize: FontSize.caption,
      color: C.textTertiary,
      marginBottom: 6,
    },
    amendSummary: {
      fontSize: FontSize.footnote,
      color: C.textSecondary,
      lineHeight: LineHeight.footnote,
    },
  });
}
