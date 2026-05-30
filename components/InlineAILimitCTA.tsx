// ============================================================
// InlineAILimitCTA
// ============================================================
//
// AI 解説チャット欄の下部に表示する「上限到達 + アップグレード CTA」。
// 入力欄が disabled になった瞬間に表示される (push 遷移ではない)。
//
// 旧: 「本日のAI質問回数の上限に達しました」というテキストのみ → 行動先がない。
// 新: 使用回数 (X/Y) を可視化 + 「7日間無料でAIを使い倒す」CTA を併設
//     (文言は paywallCopy.ts の daily_limit_ai_chat。Premiumは実質無制限=Fair Use表現)。
//
// 共通利用: question/[id].tsx, quest/[missionId].tsx, (tabs)/quick-quiz.tsx

import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { FontSize, Spacing, BorderRadius } from '../constants/theme';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';
import { getLimitCopy } from '../utils/paywallCopy';

interface InlineAILimitCTAProps {
  usedToday: number;
  limit: number;
  onUpgrade: () => void;
}

export function InlineAILimitCTA({
  usedToday,
  limit,
  onUpgrade,
}: InlineAILimitCTAProps) {
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const copy = useMemo(
    () => getLimitCopy({ kind: 'daily_limit_ai_chat', usedToday, limit }),
    [usedToday, limit],
  );

  return (
    <View style={s.box}>
      <View style={s.left}>
        <Text style={s.emoji}>{copy.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1}>
            {copy.title}
          </Text>
          <Text style={s.subtitle} numberOfLines={2}>
            {copy.subtitle}
          </Text>
        </View>
      </View>
      <Pressable
        style={s.cta}
        onPress={onUpgrade}
        accessibilityRole="button"
        accessibilityLabel={copy.primaryCta}
      >
        <Text style={s.ctaText} numberOfLines={1}>
          {copy.primaryCta}
        </Text>
      </Pressable>
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    box: {
      backgroundColor: C.warningSurface,
      borderTopWidth: 1,
      borderTopColor: C.border,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      gap: Spacing.sm,
    },
    left: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.sm,
    },
    emoji: {
      fontSize: 20,
      lineHeight: 24,
    },
    title: {
      fontSize: FontSize.footnote,
      fontWeight: '700',
      color: C.text,
      marginBottom: 2,
    },
    subtitle: {
      fontSize: FontSize.caption,
      color: C.textSecondary,
      lineHeight: 16,
    },
    cta: {
      backgroundColor: C.primary,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.full,
      alignSelf: 'stretch',
      alignItems: 'center',
    },
    ctaText: {
      color: C.white,
      fontSize: FontSize.footnote,
      fontWeight: '800',
    },
  });
}
