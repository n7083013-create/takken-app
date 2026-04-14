import { useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Shadow } from '../constants/theme';
import { useThemeColors, ThemeColors } from '../hooks/useThemeColors';
import { CATEGORY_LABELS, CATEGORY_ICONS, CATEGORY_COLORS, Category } from '../types';
import { useProgressStore } from '../store/useProgressStore';
import { useSettingsStore } from '../store/useSettingsStore';
import {
  analyzeOverall,
  getRecommendedQuestions,
  buildStudyPlan,
  TARGET_SCORES,
} from '../services/aiAnalysis';
import { getQuestionById } from '../data';

export default function AIAnalysisScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const stats = useProgressStore((s) => s.stats);
  const progress = useProgressStore((s) => s.progress);
  const isPro = useSettingsStore((s) => s.isPro());

  if (!isPro) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <Stack.Screen options={{ title: 'AI学習分析' }} />
        <View style={{ flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 56, marginBottom: 16 }}>🤖</Text>
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 8 }}>
            AI分析はSTANDARD会員限定
          </Text>
          <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginBottom: 24, lineHeight: 20 }}>
            合格予測・苦手分析・おすすめ問題で{'\n'}最短ルートで合格点を狙えます
          </Text>
          <Pressable
            style={{ backgroundColor: colors.primary, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 }}
            onPress={() => router.push('/paywall')}
          >
            <Text style={{ color: colors.white, fontSize: 15, fontWeight: '800' }}>STANDARDプランを見る</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const overall = analyzeOverall(stats, progress);
  const recommended = getRecommendedQuestions(progress, 10);
  const plan = buildStudyPlan(undefined, progress);

  const probColor =
    overall.passProbability >= 80 ? colors.success
      : overall.passProbability >= 50 ? '#F59E0B'
        : colors.error;

  return (
    <>
      <Stack.Screen options={{ title: 'AI学習分析', headerShown: true }} />
      <SafeAreaView style={s.safe} edges={['bottom']}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

          {/* ── 合格予測ヒーロー ── */}
          <View style={[s.heroCard, Shadow.md]}>
            <Text style={s.heroLabel}>本番予想得点</Text>
            <View style={s.heroScoreRow}>
              <Text style={[s.heroScore, { color: probColor }]}>
                {overall.predictedTotal}
              </Text>
              <Text style={s.heroScoreUnit}>/ 50点</Text>
            </View>
            <Text style={s.heroTarget}>目標 {overall.targetTotal}点（合格安全圏）</Text>

            <View style={s.probBar}>
              <View style={[s.probFill, { width: `${overall.passProbability}%`, backgroundColor: probColor }]} />
            </View>
            <Text style={[s.probText, { color: probColor }]}>
              合格確率 {overall.passProbability}%
            </Text>

            <View style={s.recommendBox}>
              <Text style={s.recommendIcon}>💡</Text>
              <Text style={s.recommendText}>{overall.recommendation}</Text>
            </View>
          </View>

          {/* ── 今日のおすすめ問題 ── */}
          <Text style={s.sectionTitle}>🎯 今日のおすすめ10問</Text>
          <Text style={s.sectionDesc}>AIが弱点を分析して厳選しました</Text>
          <View style={[s.recoCard, Shadow.sm]}>
            {recommended.map((r, idx) => {
              const q = getQuestionById(r.questionId);
              if (!q) return null;
              const color = CATEGORY_COLORS[r.category];
              return (
                <Pressable
                  key={r.questionId}
                  style={[s.recoItem, idx < recommended.length - 1 && s.recoItemBorder]}
                  onPress={() => router.push(`/question/${r.questionId}`)}
                >
                  <View style={[s.recoNum, { backgroundColor: color + '18' }]}>
                    <Text style={[s.recoNumText, { color }]}>{idx + 1}</Text>
                  </View>
                  <View style={s.recoBody}>
                    <Text style={s.recoCat}>
                      {CATEGORY_ICONS[r.category]} {CATEGORY_LABELS[r.category]}
                    </Text>
                    <Text style={s.recoText} numberOfLines={2}>
                      {q.text}
                    </Text>
                  </View>
                  <View style={[s.recoBadge, { backgroundColor: getReasonColor(r.reason, colors) + '22' }]}>
                    <Text style={[s.recoBadgeText, { color: getReasonColor(r.reason, colors) }]}>
                      {r.reason}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* ── 科目別予想得点 ── */}
          <Text style={s.sectionTitle}>📊 科目別予想得点</Text>
          {overall.categories.map((c) => {
            const color = CATEGORY_COLORS[c.category];
            const target = TARGET_SCORES[c.category];
            const fillPct = (c.predictedScore / target.total) * 100;
            const targetPct = (target.target / target.total) * 100;
            const statusColor =
              c.status === 'safe' ? colors.success
                : c.status === 'warning' ? '#F59E0B'
                  : colors.error;
            return (
              <View key={c.category} style={[s.catCard, Shadow.sm]}>
                <View style={s.catHeader}>
                  <View style={s.catLeft}>
                    <Text style={s.catIconText}>{CATEGORY_ICONS[c.category]}</Text>
                    <View>
                      <Text style={s.catName}>{CATEGORY_LABELS[c.category]}</Text>
                      <Text style={s.catSub}>カバー率 {Math.round(c.coverage * 100)}%</Text>
                    </View>
                  </View>
                  <View style={s.catScoreWrap}>
                    <Text style={[s.catScore, { color }]}>{c.predictedScore}</Text>
                    <Text style={s.catScoreSlash}>/ {target.total}</Text>
                  </View>
                </View>
                <View style={s.catTrackWrap}>
                  <View style={s.catTrack}>
                    <View style={[s.catFill, { width: `${fillPct}%`, backgroundColor: color }]} />
                    <View style={[s.catTargetLine, { left: `${targetPct}%` }]} />
                  </View>
                  <Text style={s.catTargetLabel}>目標 {target.target}点</Text>
                </View>
                <View style={[s.catStatus, { backgroundColor: statusColor + '14' }]}>
                  <Text style={[s.catStatusText, { color: statusColor }]}>{c.message}</Text>
                </View>
              </View>
            );
          })}

          {/* ── 学習プラン ── */}
          <Text style={s.sectionTitle}>📅 推奨学習プラン</Text>
          <View style={[s.planCard, Shadow.sm]}>
            <View style={s.planRow}>
              <View style={s.planItem}>
                <Text style={s.planValue}>{plan.dailyQuestions}</Text>
                <Text style={s.planLabel}>4択 / 日</Text>
              </View>
              <View style={s.planDivider} />
              <View style={s.planItem}>
                <Text style={s.planValue}>{plan.dailyQuizzes}</Text>
                <Text style={s.planLabel}>○✗ / 日</Text>
              </View>
              <View style={s.planDivider} />
              <View style={s.planItem}>
                <Text style={s.planValue}>{plan.estimatedDailyMinutes}<Text style={s.planUnit}>分</Text></Text>
                <Text style={s.planLabel}>所要時間</Text>
              </View>
            </View>
            <View style={s.planMessage}>
              <Text style={s.planMessageText}>{plan.message}</Text>
            </View>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

function getReasonColor(reason: string, C: ThemeColors): string {
  switch (reason) {
    case '苦手': return C.error;
    case '不安定': return '#F59E0B';
    case '復習推奨': return '#1565C0';
    case '未解答': return C.textSecondary;
    case '定着中': return C.success;
    default: return C.textSecondary;
  }
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.background },
    scroll: { padding: 20 },

    // Hero
    heroCard: {
      backgroundColor: C.card,
      borderRadius: 22,
      padding: 24,
      marginBottom: 24,
      alignItems: 'center',
    },
    heroLabel: { fontSize: 13, color: C.textSecondary, fontWeight: '600' },
    heroScoreRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 6 },
    heroScore: { fontSize: 64, fontWeight: '800', letterSpacing: -2 },
    heroScoreUnit: { fontSize: 18, color: C.textSecondary, fontWeight: '600', marginLeft: 4 },
    heroTarget: { fontSize: 12, color: C.textTertiary, marginTop: 2 },
    probBar: {
      width: '100%',
      height: 10,
      backgroundColor: '#F3F4F6',
      borderRadius: 5,
      overflow: 'hidden',
      marginTop: 18,
    },
    probFill: { height: '100%', borderRadius: 5 },
    probText: { fontSize: 14, fontWeight: '700', marginTop: 8 },
    recommendBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: C.primary + '10',
      borderRadius: 12,
      padding: 14,
      marginTop: 18,
      width: '100%',
    },
    recommendIcon: { fontSize: 22 },
    recommendText: { flex: 1, fontSize: 13, color: C.text, lineHeight: 18, fontWeight: '500' },

    // Section
    sectionTitle: { fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 4, letterSpacing: -0.3 },
    sectionDesc: { fontSize: 12, color: C.textSecondary, marginBottom: 12 },

    // Recommended
    recoCard: { backgroundColor: C.card, borderRadius: 16, marginBottom: 24 },
    recoItem: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
    recoItemBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
    recoNum: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    recoNumText: { fontSize: 14, fontWeight: '800' },
    recoBody: { flex: 1 },
    recoCat: { fontSize: 11, color: C.textSecondary, fontWeight: '600', marginBottom: 2 },
    recoText: { fontSize: 13, color: C.text, lineHeight: 18 },
    recoBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    recoBadgeText: { fontSize: 11, fontWeight: '700' },

    // Category
    catCard: { backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 10 },
    catHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    catLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    catIconText: { fontSize: 24 },
    catName: { fontSize: 15, fontWeight: '700', color: C.text },
    catSub: { fontSize: 11, color: C.textSecondary, marginTop: 1 },
    catScoreWrap: { flexDirection: 'row', alignItems: 'baseline' },
    catScore: { fontSize: 26, fontWeight: '800' },
    catScoreSlash: { fontSize: 13, color: C.textSecondary, marginLeft: 2 },
    catTrackWrap: { marginTop: 12 },
    catTrack: { height: 8, backgroundColor: '#F3F4F6', borderRadius: 4, overflow: 'visible', position: 'relative' },
    catFill: { height: '100%', borderRadius: 4 },
    catTargetLine: { position: 'absolute', top: -3, width: 2, height: 14, backgroundColor: C.text },
    catTargetLabel: { fontSize: 10, color: C.textTertiary, marginTop: 6, fontWeight: '600' },
    catStatus: { marginTop: 10, padding: 8, borderRadius: 8 },
    catStatusText: { fontSize: 12, fontWeight: '700', textAlign: 'center' },

    // Plan
    planCard: { backgroundColor: C.card, borderRadius: 16, padding: 18, marginBottom: 24 },
    planRow: { flexDirection: 'row', alignItems: 'center' },
    planItem: { flex: 1, alignItems: 'center' },
    planDivider: { width: 1, height: 40, backgroundColor: C.border },
    planValue: { fontSize: 28, fontWeight: '800', color: C.primary },
    planUnit: { fontSize: 14, color: C.textSecondary, fontWeight: '600' },
    planLabel: { fontSize: 11, color: C.textSecondary, fontWeight: '600', marginTop: 2 },
    planMessage: {
      marginTop: 14,
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: C.border,
      alignItems: 'center',
    },
    planMessageText: { fontSize: 12, color: C.text, fontWeight: '500' },
  });
}
