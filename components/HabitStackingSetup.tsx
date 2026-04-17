// ============================================================
// 宅建士 完全対策 - 習慣スタッキング設定コンポーネント
// ============================================================
// オンボーディング（compact=false）と設定画面（compact=true）の両方で使用

import { useMemo, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Shadow, FontSize, Spacing, BorderRadius, LetterSpacing } from '../constants/theme';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';
import type { HabitStack } from '../types';

interface HabitStackingSetupProps {
  selectedHabits: HabitStack[];
  onUpdate: (habits: HabitStack[]) => void;
  compact?: boolean;  // true = settings mode (smaller), false = onboarding mode (full page)
}

export default function HabitStackingSetup({
  selectedHabits,
  onUpdate,
  compact = false,
}: HabitStackingSetupProps) {
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors, compact), [colors, compact]);

  const toggleHabit = useCallback(
    (id: string) => {
      const updated = selectedHabits.map((h) =>
        h.id === id ? { ...h, enabled: !h.enabled } : h,
      );
      onUpdate(updated);
    },
    [selectedHabits, onUpdate],
  );

  return (
    <View style={s.container}>
      {compact && (
        <>
          <Text style={s.title}>習慣スタッキング</Text>
          <Text style={s.subtitle}>既存の習慣に学習をくっつけよう</Text>
        </>
      )}

      <View style={s.list}>
        {selectedHabits.map((habit) => {
          const active = habit.enabled;
          return (
            <Pressable
              key={habit.id}
              style={[s.card, active && s.cardActive]}
              onPress={() => toggleHabit(habit.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
              accessibilityLabel={`${habit.trigger} → ${habit.action}`}
            >
              <View style={s.cardContent}>
                <Text style={s.cardIcon}>{habit.icon}</Text>
                <View style={s.cardTexts}>
                  <Text
                    style={[s.cardTrigger, active && s.cardTriggerActive]}
                    numberOfLines={1}
                  >
                    {habit.trigger}
                  </Text>
                  <View style={s.arrowRow}>
                    <Text style={[s.arrow, active && s.arrowActive]}>→</Text>
                    <Text
                      style={[s.cardAction, active && s.cardActionActive]}
                      numberOfLines={1}
                    >
                      {habit.action}
                    </Text>
                  </View>
                </View>
                <View style={[s.checkbox, active && s.checkboxActive]}>
                  {active && <Text style={s.checkmark}>✓</Text>}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function makeStyles(C: ThemeColors, compact: boolean) {
  return StyleSheet.create({
    container: {
      width: '100%',
    },
    title: {
      fontSize: FontSize.caption,
      fontWeight: '700',
      color: C.text,
      marginTop: 14,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: FontSize.caption,
      color: C.textSecondary,
      marginBottom: 10,
    },
    list: {
      gap: compact ? 8 : 10,
      marginTop: compact ? 0 : 24,
    },
    card: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      padding: compact ? Spacing.md : Spacing.lg,
      borderWidth: 2,
      borderColor: C.border,
      ...Shadow.sm,
    },
    cardActive: {
      borderColor: C.primary,
      backgroundColor: C.primarySurface,
    },
    cardContent: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    cardIcon: {
      fontSize: compact ? 22 : 26,
      marginRight: compact ? 10 : 12,
    },
    cardTexts: {
      flex: 1,
    },
    cardTrigger: {
      fontSize: compact ? FontSize.caption : FontSize.subhead,
      fontWeight: '700',
      color: C.text,
    },
    cardTriggerActive: {
      color: C.primary,
    },
    arrowRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 3,
    },
    arrow: {
      fontSize: compact ? FontSize.caption : FontSize.footnote,
      fontWeight: '600',
      color: C.textTertiary,
      marginRight: 6,
    },
    arrowActive: {
      color: C.primary,
    },
    cardAction: {
      fontSize: compact ? FontSize.caption : FontSize.footnote,
      fontWeight: '500',
      color: C.textSecondary,
      flex: 1,
    },
    cardActionActive: {
      color: C.primaryDark,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: BorderRadius.sm,
      borderWidth: 2,
      borderColor: C.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 10,
    },
    checkboxActive: {
      borderColor: C.primary,
      backgroundColor: C.primary,
    },
    checkmark: {
      fontSize: 14,
      fontWeight: '800',
      color: C.white,
    },
  });
}
