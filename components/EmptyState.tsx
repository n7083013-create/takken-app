// ============================================================
// EmptyState - 汎用の空状態コンポーネント
// リスト・キューが空のとき、親切なメッセージを表示する
// ============================================================

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { FontSize, LineHeight, Spacing, BorderRadius, Shadow } from '../constants/theme';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';

type EmptyStateProps = {
  icon: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ icon, title, subtitle, actionLabel, onAction }: EmptyStateProps) {
  const colors = useThemeColors();
  const s = styles(colors);

  return (
    <View style={s.container}>
      <Text style={s.icon}>{icon}</Text>
      <Text style={s.title}>{title}</Text>
      {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable
          style={[s.actionBtn, Shadow.sm]}
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={s.actionBtnText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function styles(C: ThemeColors) {
  return StyleSheet.create({
    container: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Spacing.xxxl,
      paddingHorizontal: Spacing.xxl,
    },
    icon: {
      fontSize: 48,
      marginBottom: Spacing.lg,
    },
    title: {
      fontSize: FontSize.body,
      fontWeight: '700',
      color: C.text,
      textAlign: 'center',
      marginBottom: Spacing.sm,
    },
    subtitle: {
      fontSize: FontSize.footnote,
      color: C.textSecondary,
      textAlign: 'center',
      lineHeight: LineHeight.footnote,
      maxWidth: 260,
    },
    actionBtn: {
      marginTop: Spacing.xl,
      backgroundColor: C.primary,
      paddingHorizontal: Spacing.xxl,
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.lg,
    },
    actionBtnText: {
      fontSize: FontSize.subhead,
      fontWeight: '700',
      color: C.white,
    },
  });
}
