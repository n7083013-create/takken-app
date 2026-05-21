// ============================================================
// 日目標達成時の祝福アニメ（1日1回のみ表示）
// 紙吹雪なしのシンプルで上品な演出。集中力を阻害しない。
// animationLevel=off の場合は静かな通知に切り替え
// ============================================================

import { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Pressable, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontSize, Spacing, BorderRadius, Shadow } from '../constants/theme';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';
import { shouldShowAnimation, getAnimationLevel, hapticSuccess } from '../services/haptics';

interface DailyGoalCelebrationProps {
  visible: boolean;
  dailyGoal: number;
  answered: number;
  onDismiss: () => void;
}

export function DailyGoalCelebration({
  visible,
  dailyGoal,
  answered,
  onDismiss,
}: DailyGoalCelebrationProps) {
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.85)).current;

  const level = getAnimationLevel();
  const showFull = shouldShowAnimation('full');

  useEffect(() => {
    if (!visible) return;

    hapticSuccess();

    // [2026-05-22] オーナー指摘「消えるの早すぎる」への対応。
    // 旧: 3.5秒で自動 close → 内容 (達成・ストリーク・タッケン君メッセージ) を読み切れない
    // 新: タップで閉じる only (Duolingo / Apple Activity / Headspace 標準)
    //     ユーザーが自分のペースで読み、能動的に閉じる
    //
    // フォールバック: 完全放置時の永続表示を防ぐため 60 秒で自動 close (実用上ほぼ発火しない)
    const fallbackClose = setTimeout(() => {
      onDismiss();
    }, 60000);

    if (showFull) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 240,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 6,
          tension: 80,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // OFF / subtle: フェードのみ
      opacity.setValue(1);
      scale.setValue(1);
    }

    return () => clearTimeout(fallbackClose);
  }, [visible, showFull]);

  if (!visible) return null;

  // OFFの場合は表示しない（バイブだけ）
  if (level === 'off') {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <SafeAreaView style={s.overlay}>
        <Pressable style={s.overlayPress} onPress={onDismiss}>
          <Animated.View
            style={[
              s.card,
              {
                opacity,
                transform: [{ scale }],
              },
            ]}
          >
            <Text style={s.emoji}>🎯</Text>
            <Text style={s.title}>今日の目標達成！</Text>
            <Text style={s.subtitle}>
              {answered}問解きました
            </Text>
            <View style={s.badge}>
              <Text style={s.badgeText}>+1 ストリーク</Text>
            </View>
            {/* [Quick Win C] 「明日も続けたくなる」演出
                世界基準: Duolingo / Headspace の習慣化メッセージ */}
            <View style={s.tomorrowBox}>
              <Text style={s.tomorrowEmoji}>🐕</Text>
              <Text style={s.tomorrowText}>
                <Text style={s.tomorrowBold}>明日も同じ時間に待ってる！</Text>
                {'\n'}1日5分でも続けると、合格はもっと近づくよ
              </Text>
            </View>
            <Text style={s.hint}>👆 タップして閉じる</Text>
          </Animated.View>
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.55)',
    },
    overlayPress: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Spacing.xl,
    },
    card: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.xl,
      paddingVertical: Spacing.xxl,
      paddingHorizontal: Spacing.xxxl,
      alignItems: 'center',
      width: '100%',
      maxWidth: 360,
      ...Shadow.lg,
    },
    emoji: {
      fontSize: 56,
      marginBottom: 8,
    },
    title: {
      fontSize: FontSize.title2,
      fontWeight: '800',
      color: C.text,
      marginBottom: 6,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: FontSize.subhead,
      color: C.textSecondary,
      marginBottom: Spacing.lg,
    },
    badge: {
      backgroundColor: C.primary,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: BorderRadius.full,
      marginBottom: Spacing.md,
    },
    badgeText: {
      fontSize: FontSize.caption,
      fontWeight: '800',
      color: C.white,
    },
    hint: {
      fontSize: FontSize.caption,
      color: C.textSecondary,
      marginTop: 8,
      fontWeight: '600',
    },
    // [Quick Win C] 「明日も続けたくなる」演出
    tomorrowBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.primarySurface,
      borderRadius: BorderRadius.md,
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginTop: Spacing.md,
      marginBottom: Spacing.sm,
      gap: 10,
    },
    tomorrowEmoji: {
      fontSize: 32,
    },
    tomorrowText: {
      flex: 1,
      fontSize: FontSize.footnote,
      color: C.text,
      lineHeight: 18,
    },
    tomorrowBold: {
      fontWeight: '800',
      color: C.primary,
    },
  });
}
