// ============================================================
// 弱点コーチングカード
// ============================================================
// 予測スコアから最弱科目を検出 → ワンタップで集中ドリル開始
// - 具体的な不足点数と解く問題数を提示
// - 20問以上解答後に表示（データ信頼度確保）
// - カテゴリ別サブカテゴリの深掘りも可能

import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { FontSize, Spacing, BorderRadius, Shadow } from '../constants/theme';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';
import { CATEGORY_LABELS, CATEGORY_COLORS, CATEGORY_ICONS, type Category } from '../types';
import { EXAM_ALLOCATION, PASS_LINE } from '../constants/exam';
import type { ExamPrediction } from '../hooks/useExamPrediction';

interface WeaknessCoachingCardProps {
  prediction: ExamPrediction;
}

export function WeaknessCoachingCard({ prediction }: WeaknessCoachingCardProps) {
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();

  // データ信頼度が低い or 合格圏内なら表示しない（不要な訴求を避ける）
  if (!prediction.hasData) return null;
  if (prediction.confidence === 'low') return null;
  if (!prediction.weakestCategory) return null;

  const cat = prediction.weakestCategory;
  const catPred = prediction.perCategory.find((c) => c.category === cat);
  if (!catPred || catPred.attempted < 5) return null;

  const catColor = CATEGORY_COLORS[cat];
  const allocation = EXAM_ALLOCATION[cat];
  const gap = Math.round((allocation - catPred.predicted) * 10) / 10;
  const accuracy = Math.round(catPred.accuracy * 100);

  /** 推奨時間: 1問あたり90秒×10問 */
  const recommendedMinutes = 15;

  // 合格まであと○点
  const scoreGap = prediction.pointsToPass;
  const canReachByCategoryAlone = gap >= scoreGap;

  const handleStart = () => {
    // 弱点ドリルに弱点カテゴリ情報を渡す
    router.push({
      pathname: '/weak-drill',
      params: { category: cat },
    });
  };

  return (
    <View style={[s.card, Shadow.sm, { borderLeftColor: catColor }]}>
      <View style={s.header}>
        <Text style={s.badge}>💪 今日の推奨アクション</Text>
      </View>

      <View style={s.content}>
        <Text style={s.icon}>{CATEGORY_ICONS[cat]}</Text>
        <View style={s.textArea}>
          <Text style={s.title}>
            <Text style={{ color: catColor }}>{CATEGORY_LABELS[cat]}</Text> を集中強化
          </Text>
          <Text style={s.desc}>
            現在 <Text style={s.descBold}>{accuracy}%</Text> 正答（{catPred.predicted.toFixed(1)}/{allocation}点）。あと{gap.toFixed(1)}点伸ばせます
          </Text>
          {scoreGap > 0 && canReachByCategoryAlone && (
            <Text style={s.hint}>
              ⚡ この科目だけで合格ラインに届きます
            </Text>
          )}
          {scoreGap > 0 && !canReachByCategoryAlone && (
            <Text style={s.hint}>
              合格ラインまであと{scoreGap}点
            </Text>
          )}
        </View>
      </View>

      <Pressable
        style={[s.cta, { backgroundColor: catColor }]}
        onPress={handleStart}
        accessibilityRole="button"
        accessibilityLabel={`${CATEGORY_LABELS[cat]}の弱点ドリルを開始`}
      >
        <Text style={s.ctaText}>10問集中ドリルを開始（約{recommendedMinutes}分）</Text>
        <Text style={s.ctaArrow}>›</Text>
      </Pressable>
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
      borderLeftWidth: 4,
    },
    header: {
      marginBottom: 10,
    },
    badge: {
      fontSize: FontSize.caption2,
      fontWeight: '800',
      color: C.textSecondary,
      letterSpacing: 1,
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: Spacing.md,
    },
    icon: {
      fontSize: 36,
    },
    textArea: {
      flex: 1,
    },
    title: {
      fontSize: FontSize.subhead,
      fontWeight: '800',
      color: C.text,
      marginBottom: 4,
    },
    desc: {
      fontSize: FontSize.caption,
      color: C.textSecondary,
      lineHeight: 18,
    },
    descBold: {
      fontWeight: '800',
      color: C.text,
    },
    hint: {
      fontSize: FontSize.caption2,
      color: C.primary,
      marginTop: 4,
      fontWeight: '700',
    },
    cta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      borderRadius: BorderRadius.md,
      gap: 4,
    },
    ctaText: {
      fontSize: FontSize.caption,
      fontWeight: '800',
      color: C.white,
    },
    ctaArrow: {
      fontSize: 16,
      color: C.white,
      fontWeight: '800',
    },
  });
}
