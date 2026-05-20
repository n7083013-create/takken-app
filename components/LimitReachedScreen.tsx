// ============================================================
// LimitReachedScreen
// ============================================================
//
// 無料枠の上限到達 or プレミアム機能ロック時に表示する統一画面。
// 世界基準のフリーミアム UX 原則を体現する:
//   1. Celebration first — 否定文言ではなく達成のお祝いから入る
//   2. Trial-first CTA   — 「7日間無料」を主訴求に統一
//   3. Streak shield     — 連続学習日数があれば sunk-cost として可視化
//   4. One primary CTA   — 副 CTA は subtle に (Hick's law)
//
// 使い方:
//   <LimitReachedScreen
//     mode={{ kind: 'daily_limit_question', streak: stats.streak }}
//     onUpgrade={() => router.push('/paywall')}
//     onSecondary={() => router.back()}   // optional
//     secondaryLabel="ホームに戻る"        // optional
//   />

import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  FontSize,
  LineHeight,
  Spacing,
  BorderRadius,
  Shadow,
} from '../constants/theme';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';
import { WebBackButton } from './WebBackButton';
import { getLimitCopy, type LimitMode } from '../utils/paywallCopy';

interface LimitReachedScreenProps {
  mode: LimitMode;
  onUpgrade: () => void;
  /** 副 CTA (省略可)。主CTA より目立たないスタイルで描画 */
  onSecondary?: () => void;
  secondaryLabel?: string;
}

export function LimitReachedScreen({
  mode,
  onUpgrade,
  onSecondary,
  secondaryLabel,
}: LimitReachedScreenProps) {
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const copy = useMemo(() => getLimitCopy(mode), [mode]);

  return (
    <SafeAreaView style={s.safe}>
      <WebBackButton />
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero: 絵文字 + 達成タイトル */}
        <View style={s.hero}>
          <Text style={s.emoji} accessibilityRole="text">
            {copy.emoji}
          </Text>
          <Text style={s.title}>{copy.title}</Text>
          <Text style={s.subtitle}>{copy.subtitle}</Text>
        </View>

        {/* Streak shield (連続学習があるときのみ表示) */}
        {copy.streakShield && (
          <View style={[s.shieldBox, Shadow.sm]}>
            <Text style={s.shieldText}>{copy.streakShield}</Text>
          </View>
        )}

        {/* 主 CTA: 必ずトライアル文言を含む */}
        <Pressable
          style={[s.primaryBtn, Shadow.md]}
          onPress={onUpgrade}
          accessibilityRole="button"
          accessibilityLabel={copy.primaryCta}
        >
          <Text style={s.primaryBtnText}>{copy.primaryCta}</Text>
        </Pressable>

        {/* 副 CTA (任意): 主CTAより視覚的に控えめ */}
        {onSecondary && secondaryLabel && (
          <Pressable
            style={s.secondaryBtn}
            onPress={onSecondary}
            accessibilityRole="button"
            accessibilityLabel={secondaryLabel}
          >
            <Text style={s.secondaryBtnText}>{secondaryLabel}</Text>
          </Pressable>
        )}

        {/* 安心材料: 必ず明記 */}
        <Text style={s.fineprint}>
          ・トライアル中にキャンセルすれば一切料金はかかりません{'\n'}
          ・ワンタップで解約可能
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.background },
    scroll: {
      flexGrow: 1,
      padding: Spacing.xxl,
      justifyContent: 'center',
      alignItems: 'center',
    },
    hero: {
      alignItems: 'center',
      marginBottom: Spacing.xxl,
    },
    emoji: {
      fontSize: 64,
      marginBottom: Spacing.lg,
    },
    title: {
      fontSize: FontSize.title2,
      fontWeight: '800',
      color: C.text,
      textAlign: 'center',
      marginBottom: Spacing.md,
      lineHeight: LineHeight.title2,
    },
    subtitle: {
      fontSize: FontSize.footnote,
      color: C.textSecondary,
      textAlign: 'center',
      lineHeight: LineHeight.footnote,
      maxWidth: 320,
    },
    shieldBox: {
      backgroundColor: C.warningSurface ?? C.successSurface,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.full,
      marginBottom: Spacing.xl,
    },
    shieldText: {
      fontSize: FontSize.subhead,
      fontWeight: '700',
      color: C.warning ?? C.text,
    },
    primaryBtn: {
      backgroundColor: C.primary,
      paddingHorizontal: Spacing.xxl,
      paddingVertical: Spacing.lg,
      borderRadius: BorderRadius.lg,
      alignSelf: 'stretch',
      maxWidth: 360,
      alignItems: 'center',
      marginBottom: Spacing.md,
    },
    primaryBtnText: {
      color: C.white,
      fontSize: FontSize.subhead,
      fontWeight: '800',
    },
    secondaryBtn: {
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      marginBottom: Spacing.lg,
    },
    secondaryBtnText: {
      color: C.textSecondary,
      fontSize: FontSize.footnote,
      fontWeight: '600',
    },
    fineprint: {
      fontSize: FontSize.caption,
      color: C.textTertiary,
      textAlign: 'center',
      lineHeight: LineHeight.caption,
      marginTop: Spacing.lg,
      maxWidth: 320,
    },
  });
}
