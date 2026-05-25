// ============================================================
// ペイウォールプロンプトバナー
// ============================================================
// 最適タイミングで表示される訴求バナー
// - 押し付けがましくない（ディスミス可能・小さめ）
// - コンテキストに応じた文言（スマートペイウォールから供給）
// - urgency に応じて色調・強調を変える

import { useEffect, useMemo, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { FontSize, BorderRadius, Spacing, Shadow } from '../constants/theme';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';
import { useSmartPaywall } from '../hooks/useSmartPaywall';

export function PaywallPromptBanner() {
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { prompt, dismissPrompt, acceptPrompt } = useSmartPaywall();

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    if (!prompt) return;
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 320,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, [prompt]);

  if (!prompt) return null;

  const urgencyColor =
    prompt.urgency === 'high'
      ? colors.error
      : prompt.urgency === 'medium'
        ? colors.primary
        : colors.primaryDark;

  const handlePress = () => {
    acceptPrompt();
    router.push('/paywall');
  };

  return (
    <Animated.View
      style={[
        s.container,
        {
          opacity,
          transform: [{ translateY }],
          borderLeftColor: urgencyColor,
        },
      ]}
    >
      {/* コンテンツ */}
      <Pressable style={s.content} onPress={handlePress} accessibilityRole="button">
        <Text style={s.headline} numberOfLines={1}>
          {prompt.headline}
        </Text>
        <Text style={s.message} numberOfLines={2}>
          {prompt.message}
        </Text>
        <View style={[s.cta, { backgroundColor: urgencyColor }]}>
          <Text style={s.ctaText}>{prompt.ctaText}</Text>
          <Text style={s.ctaArrow}>›</Text>
        </View>
      </Pressable>

      {/* 閉じるボタン */}
      <Pressable
        style={s.closeBtn}
        onPress={dismissPrompt}
        hitSlop={10}
        accessibilityLabel="閉じる"
      >
        <Text style={s.closeBtnText}>×</Text>
      </Pressable>
    </Animated.View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      backgroundColor: C.card,
      marginHorizontal: Spacing.lg,
      marginVertical: Spacing.md,
      borderRadius: BorderRadius.lg,
      borderLeftWidth: 4,
      ...Shadow.sm,
      overflow: 'hidden',
    },
    content: {
      flex: 1,
      padding: Spacing.md,
      paddingRight: 8,
    },
    headline: {
      fontSize: FontSize.subhead,
      fontWeight: '800',
      color: C.text,
      marginBottom: 4,
    },
    message: {
      fontSize: FontSize.caption,
      color: C.textSecondary,
      lineHeight: 18,
      marginBottom: 10,
    },
    cta: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: BorderRadius.full,
      gap: 4,
    },
    ctaText: {
      fontSize: FontSize.caption,
      fontWeight: '800',
      color: C.white,
    },
    ctaArrow: {
      fontSize: FontSize.subhead,
      fontWeight: '800',
      color: C.white,
      lineHeight: 16,
    },
    closeBtn: {
      paddingHorizontal: 12,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'flex-start',
    },
    closeBtnText: {
      fontSize: 22,
      fontWeight: '300',
      color: C.textTertiary,
      lineHeight: 22,
    },
  });
}
