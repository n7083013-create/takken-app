// ============================================================
// 直前モードカード（試験30日前から自動表示）
// ============================================================
// - カウントダウンが大きく表示される
// - 緊急度に応じて色調変化（赤・オレンジ・青）
// - 今日の推奨学習量・進捗
// - ワンタップで模試・苦手克服開始

import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { FontSize, Spacing, BorderRadius, Shadow, LetterSpacing } from '../constants/theme';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';
import type { FinalSprintState } from '../hooks/useFinalSprintMode';

interface FinalSprintCardProps {
  state: FinalSprintState;
}

export function FinalSprintCard({ state }: FinalSprintCardProps) {
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();

  if (!state.isActive || state.daysUntilExam === null) return null;

  // 緊急度別の色
  const urgencyColors = {
    critical: colors.error,
    high: colors.accent,
    medium: colors.primary,
    low: colors.primaryDark,
    none: colors.textTertiary,
  };
  const urgencyColor = urgencyColors[state.urgency];

  const urgencyLabels = {
    critical: '🚨 ラストスパート',
    high: '⚡ 直前1週間',
    medium: '📝 直前2週間',
    low: '📚 直前1ヶ月',
    none: '',
  };

  return (
    <View style={[s.card, Shadow.md, { borderLeftColor: urgencyColor, borderLeftWidth: 4 }]}>
      {/* ヘッダー: カウントダウン */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={[s.badge, { color: urgencyColor }]}>
            {urgencyLabels[state.urgency]}
          </Text>
          <View style={s.countdownRow}>
            <Text style={[s.countdownNum, { color: urgencyColor }]}>
              {state.daysUntilExam}
            </Text>
            <Text style={s.countdownUnit}>日</Text>
          </View>
          <Text style={s.countdownLabel}>試験まで</Text>
        </View>
        <View style={s.headerRight}>
          <Text style={[
            s.statusBadge,
            { backgroundColor: state.onTrackToPass ? colors.primarySurface : colors.errorSurface },
          ]}>
            <Text style={[
              s.statusBadgeText,
              { color: state.onTrackToPass ? colors.primary : colors.error },
            ]}>
              {state.onTrackToPass ? '✓ 合格圏内' : `あと${state.scoreGap}点`}
            </Text>
          </Text>
        </View>
      </View>

      {/* モチベーションメッセージ */}
      <Text style={s.motivation}>{state.motivationMessage}</Text>

      {/* 今日のミッション */}
      <View style={s.missionBox}>
        <Text style={s.missionLabel}>💪 今日のミッション</Text>
        <Text style={s.missionText}>{state.todayMissionText}</Text>
        <Text style={s.missionHint}>
          推奨学習量: {state.recommendedQuestionsToday}問 (約{state.recommendedMinutesToday}分)
        </Text>
      </View>

      {/* ワンタップアクション */}
      <View style={s.actions}>
        <Pressable
          style={[s.actionBtn, { backgroundColor: urgencyColor }]}
          onPress={() => router.push('/exam')}
          accessibilityRole="button"
          accessibilityLabel="模擬試験を開始"
        >
          <Text style={s.actionIcon}>📋</Text>
          <Text style={s.actionText}>模擬試験</Text>
        </Pressable>
        <Pressable
          style={[s.actionBtn, s.actionBtnSecondary]}
          onPress={() => router.push('/(tabs)/review')}
          accessibilityRole="button"
          accessibilityLabel="苦手克服を開始"
        >
          <Text style={s.actionIcon}>💪</Text>
          <Text style={[s.actionText, { color: urgencyColor }]}>苦手克服</Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.xl,
      padding: Spacing.lg,
      marginHorizontal: Spacing.lg,
      marginTop: Spacing.md,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: Spacing.md,
    },
    headerLeft: {
      flex: 1,
    },
    badge: {
      fontSize: FontSize.caption2,
      fontWeight: '800',
      letterSpacing: LetterSpacing.wide,
    },
    countdownRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      marginTop: 4,
    },
    countdownNum: {
      fontSize: 48,
      fontWeight: '900',
      letterSpacing: -1,
    },
    countdownUnit: {
      fontSize: FontSize.title2,
      fontWeight: '800',
      color: C.textSecondary,
      marginLeft: 4,
    },
    countdownLabel: {
      fontSize: FontSize.caption2,
      color: C.textTertiary,
      marginTop: -4,
      fontWeight: '600',
    },
    headerRight: {
      alignItems: 'flex-end',
    },
    statusBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: BorderRadius.full,
    },
    statusBadgeText: {
      fontSize: FontSize.caption,
      fontWeight: '800',
    },
    motivation: {
      fontSize: FontSize.caption,
      color: C.textSecondary,
      lineHeight: 20,
      marginBottom: Spacing.md,
    },
    missionBox: {
      backgroundColor: C.background,
      borderRadius: BorderRadius.md,
      padding: 12,
      marginBottom: Spacing.md,
    },
    missionLabel: {
      fontSize: FontSize.caption2,
      fontWeight: '800',
      color: C.textSecondary,
      marginBottom: 4,
    },
    missionText: {
      fontSize: FontSize.subhead,
      fontWeight: '800',
      color: C.text,
    },
    missionHint: {
      fontSize: FontSize.caption2,
      color: C.textTertiary,
      marginTop: 4,
    },
    actions: {
      flexDirection: 'row',
      gap: 10,
    },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      borderRadius: BorderRadius.md,
      gap: 6,
    },
    actionBtnSecondary: {
      backgroundColor: C.background,
      borderWidth: 1,
      borderColor: C.border,
    },
    actionIcon: {
      fontSize: 16,
    },
    actionText: {
      fontSize: FontSize.caption,
      fontWeight: '800',
      color: C.white,
    },
  });
}
