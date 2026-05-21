// ============================================================
// 消去法ヒント（閉じれば二度と表示されない）
// ============================================================
// - 問題画面の選択肢の上に「長押しで打ち消し線」を案内
// - 右側の × でディスミス → AsyncStorage に保存して永続非表示
// - どの画面でも共通で使える

import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FontSize, BorderRadius, Spacing } from '../constants/theme';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';

const DISMISSED_KEY = '@takken_strike_hint_dismissed';

/**
 * 消去法ヒント
 * - target='choice' (デフォルト): 通常 4 択用「選択肢を長押しで打ち消し線」
 * - target='statement': 個数/組み合わせ問題用「ア〜エを長押しで打ち消し線」
 */
interface StrikeHintProps {
  target?: 'choice' | 'statement';
}

export function StrikeHint({ target = 'choice' }: StrikeHintProps = {}) {
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);

  // null = ロード中（表示しない）、true/false = ロード済み
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_KEY).then((value) => {
      setDismissed(value === 'true');
    }).catch(() => setDismissed(false));
  }, []);

  const handleDismiss = async () => {
    setDismissed(true);
    try {
      await AsyncStorage.setItem(DISMISSED_KEY, 'true');
    } catch {}
  };

  if (dismissed !== false) return null;

  const hintText = target === 'statement'
    ? '💡 ア〜エを長押しで打ち消し線（消去法）'
    : '💡 選択肢を長押しで打ち消し線（消去法）';

  return (
    <View style={s.container}>
      <Text style={s.text}>{hintText}</Text>
      <Pressable
        onPress={handleDismiss}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="今後表示しない"
      >
        <Text style={s.closeBtn}>×</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: C.primarySurface,
      paddingHorizontal: Spacing.md,
      paddingVertical: 8,
      marginBottom: 6,
      borderRadius: BorderRadius.sm,
      gap: 8,
    },
    text: {
      flex: 1,
      fontSize: FontSize.caption2,
      color: C.primaryDark,
      fontWeight: '600',
    },
    closeBtn: {
      fontSize: 18,
      color: C.textTertiary,
      fontWeight: '400',
      paddingHorizontal: 6,
      lineHeight: 20,
    },
  });
}
