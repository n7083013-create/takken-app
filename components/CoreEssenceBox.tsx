// ============================================================
// 1行エッセンス表示ボックス
// ============================================================
// 問題画面の解説冒頭に表示される「論点の核心」
// - 覚え方ではなく、試験で問われる法的事実の1文要約
// - 直前復習・見直しで最強の武器
// - coreEssence がない問題では非表示

import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FontSize, BorderRadius, Spacing } from '../constants/theme';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';

interface CoreEssenceBoxProps {
  essence?: string;
}

export function CoreEssenceBox({ essence }: CoreEssenceBoxProps) {
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);

  if (!essence || essence.trim().length === 0) return null;

  return (
    <View style={s.box}>
      <View style={s.labelRow}>
        <Text style={s.icon}>🎯</Text>
        <Text style={s.label}>この問題のコア</Text>
      </View>
      <Text style={s.essence}>{essence}</Text>
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    box: {
      backgroundColor: C.primarySurface,
      borderLeftWidth: 3,
      borderLeftColor: C.primary,
      borderRadius: BorderRadius.md,
      padding: Spacing.md,
      marginBottom: Spacing.md,
    },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginBottom: 6,
    },
    icon: {
      fontSize: 14,
    },
    label: {
      fontSize: FontSize.caption2,
      fontWeight: '800',
      color: C.primary,
      letterSpacing: 0.5,
    },
    essence: {
      fontSize: FontSize.subhead,
      fontWeight: '700',
      color: C.text,
      lineHeight: 22,
    },
  });
}
