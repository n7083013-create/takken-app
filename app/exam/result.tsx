import { useEffect, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { Shadow } from '../../constants/theme';
import { useThemeColors, ThemeColors } from '../../hooks/useThemeColors';
import { useExamStore, scoreExam, getExamQuestions } from '../../store/useExamStore';
import { useProgressStore } from '../../store/useProgressStore';
import { CATEGORY_LABELS, Category, SUBCATEGORIES } from '../../types';
import { useAchievementChecker } from '../../hooks/useAchievementChecker';
import { judgeGrade, GRADE_THRESHOLDS, PASS_LINE } from '../../constants/exam';
import { useAnimationEnabled } from '../../hooks/useReducedMotion';
import { StaggeredFadeIn } from '../../components/StaggeredFadeIn';
import { AnimatedNumber } from '../../components/AnimatedNumber';
import { PressableScale } from '../../components/PressableScale';
import { WebBackButton } from '../../components/WebBackButton';
import { trackEvent } from '../../services/analytics';

export default function ExamResultScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const current = useExamStore((s) => s.current);
  const recordAnswer = useProgressStore((s) => s.recordAnswer);
  const checkAchievements = useAchievementChecker();

  // Auto-record answers into SM-2 progress on result display
  useEffect(() => {
    if (!current || !current.submitted) return;
    const questions = getExamQuestions(current);
    let correctCount = 0;
    questions.forEach((q) => {
      const ans = current.answers[q.id];
      const correct = ans === q.correctIndex;
      if (correct) correctCount++;
      recordAnswer(q.id, q.category, correct);
    });
    // 実績チェック（模試スコア付き）
    setTimeout(() => checkAchievements({ examScore: correctCount }), 100);
    // [Phase 1.3] 模試合格 = 満足度・継続予測の最重要シグナル
    // → Google Ads / GA4 で「広告経由ユーザーの教材適合度」が分析可能に
    if (correctCount >= PASS_LINE) {
      trackEvent('exam_passed', { value: correctCount, currency: 'JPY' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  if (!current || !current.submitted) {
    return (
      <SafeAreaView style={s.safe}>
        <Text style={s.empty}>結果がありません</Text>
      </SafeAreaView>
    );
  }

  const result = scoreExam(current);
  const questions = getExamQuestions(current);
  const grade = judgeGrade(result.correct);
  const gradeInfo = GRADE_THRESHOLDS[grade];

  // ── grade badge スプリング演出 ──
  const animationEnabled = useAnimationEnabled();
  const gradeScale = useSharedValue(animationEnabled ? 0.4 : 1);
  const gradeRotate = useSharedValue(animationEnabled ? -12 : 0);

  useEffect(() => {
    if (!animationEnabled) {
      gradeScale.value = 1;
      gradeRotate.value = 0;
      return;
    }
    gradeScale.value = withSequence(
      withTiming(0.4, { duration: 0 }),
      withSpring(1, { stiffness: 180, damping: 9, mass: 0.7 }),
    );
    gradeRotate.value = withSequence(
      withTiming(-12, { duration: 0 }),
      withSpring(0, { stiffness: 160, damping: 12 }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, animationEnabled]);

  const gradeBadgeAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: gradeScale.value },
      { rotate: `${gradeRotate.value}deg` },
    ],
  }));

  // 弱点 top 3 サブカテゴリを抽出
  // この模試で出題された問題を、サブカテゴリ単位に正答率で集計
  const weakSubcats = useMemo(() => {
    type Bucket = { cat: Category; key: string; label: string; icon: string; total: number; correct: number };
    const buckets = new Map<string, Bucket>();
    for (const q of questions) {
      const subs = SUBCATEGORIES[q.category] ?? [];
      const sub = subs.find((sc) => q.tags.some((t) => sc.matchTags.includes(t)));
      if (!sub) continue;
      const key = `${q.category}:${sub.key}`;
      let b = buckets.get(key);
      if (!b) {
        b = { cat: q.category, key: sub.key, label: sub.label, icon: sub.icon, total: 0, correct: 0 };
        buckets.set(key, b);
      }
      b.total += 1;
      if (current.answers[q.id] === q.correctIndex) b.correct += 1;
    }
    return Array.from(buckets.values())
      .filter((b) => b.total > 0)
      .map((b) => ({ ...b, accuracy: b.correct / b.total }))
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 3);
  }, [questions, current]);

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen options={{ title: '試験結果', headerBackTitle: '戻る' }} />
      <WebBackButton />
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={[s.hero, result.passed ? s.heroPass : s.heroFail, Shadow.lg]}>
          <Text style={s.heroLabel}>{result.passed ? '🎉 合格ライン突破' : '📚 もう一歩'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' }}>
            <AnimatedNumber
              value={result.correct}
              style={s.heroScore as any}
              duration={700}
            />
            <Text style={s.heroTotal}> / {result.total}</Text>
          </View>
          <Text style={s.heroBorder}>合格ライン: {PASS_LINE}点</Text>
          <Animated.View style={[s.gradeBadge, gradeBadgeAnimStyle]}>
            <Text style={s.gradeLabel}>{gradeInfo.label}</Text>
          </Animated.View>
          <Text style={s.gradeDesc}>{gradeInfo.description}</Text>
        </View>

        <View style={[s.card, Shadow.sm]}>
          <Text style={s.cardTitle}>科目別成績</Text>
          {(Object.keys(result.byCategory) as Category[]).map((cat) => {
            const cs = result.byCategory[cat];
            const pct = cs.total > 0 ? Math.round((cs.correct / cs.total) * 100) : 0;
            return (
              <View key={cat} style={s.catRow}>
                <Text style={s.catLabel}>{CATEGORY_LABELS[cat]}</Text>
                <View style={s.catBar}>
                  <View style={[s.catBarFill, { width: `${pct}%` }]} />
                </View>
                <Text style={s.catScore}>
                  {cs.correct}/{cs.total}
                </Text>
              </View>
            );
          })}
        </View>

        {weakSubcats.length > 0 && (
          <View style={[s.card, Shadow.sm]}>
            <Text style={s.cardTitle}>📉 弱点サブカテゴリ Top {weakSubcats.length}</Text>
            {weakSubcats.map((b, i) => (
              <StaggeredFadeIn key={`${b.cat}-${b.key}`} index={i} style={s.weakRow}>
                <Text style={s.weakRank}>#{i + 1}</Text>
                <Text style={s.weakIcon}>{b.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.weakLabel}>{b.label}</Text>
                  <Text style={s.weakSub}>
                    {CATEGORY_LABELS[b.cat]} ・ {b.correct}/{b.total}問 ({Math.round(b.accuracy * 100)}%)
                  </Text>
                </View>
              </StaggeredFadeIn>
            ))}
            <PressableScale
              style={s.nextStudyBtn}
              onPress={() => router.push('/weak-drill')}
              accessibilityRole="button"
              accessibilityLabel="弱点を集中学習する"
            >
              <Text style={s.nextStudyText}>→ 弱点を集中学習する</Text>
            </PressableScale>
          </View>
        )}

        <View style={[s.card, Shadow.sm]}>
          <Text style={s.cardTitle}>問題別 結果</Text>
          {questions.map((q, i) => {
            const ans = current.answers[q.id];
            const correct = ans === q.correctIndex;
            return (
              <Pressable
                key={q.id}
                style={s.qRow}
                onPress={() => router.push(`/question/${q.id}`)}
              >
                <Text style={[s.qIdx, correct ? s.qOk : s.qNg]}>
                  {correct ? '○' : '✗'} {i + 1}
                </Text>
                <Text style={s.qText} numberOfLines={3}>
                  {q.text}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          style={[s.primaryBtn, Shadow.md]}
          onPress={() => router.replace('/exam')}
        >
          <Text style={s.primaryBtnText}>模擬試験ホームに戻る</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.background },
    scroll: { padding: 20, paddingBottom: 40 },
    empty: { textAlign: 'center', marginTop: 40, color: C.textSecondary },
    hero: {
      padding: 28,
      borderRadius: 20,
      alignItems: 'center',
      marginBottom: 20,
    },
    heroPass: { backgroundColor: C.primary },
    heroFail: { backgroundColor: C.accentDark },
    heroLabel: { color: C.white, fontSize: 14, fontWeight: '700', marginBottom: 8 },
    heroScore: { color: C.white, fontSize: 56, fontWeight: '800' },
    heroTotal: { fontSize: 24, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
    heroBorder: { color: 'rgba(255,255,255,0.9)', fontSize: 12, marginTop: 4 },
    card: {
      backgroundColor: C.card,
      borderRadius: 16,
      padding: 18,
      marginBottom: 16,
    },
    cardTitle: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 12 },
    catRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    catLabel: { width: 90, fontSize: 13, color: C.text },
    catBar: {
      flex: 1,
      height: 8,
      backgroundColor: C.border,
      borderRadius: 4,
      marginHorizontal: 10,
      overflow: 'hidden',
    },
    catBarFill: { height: '100%', backgroundColor: C.primary },
    catScore: { width: 50, textAlign: 'right', fontSize: 13, fontWeight: '700', color: C.text },
    qRow: {
      flexDirection: 'row',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
      alignItems: 'center',
    },
    qIdx: { width: 44, fontSize: 13, fontWeight: '800' },
    qOk: { color: C.success },
    qNg: { color: C.error },
    qText: { flex: 1, fontSize: 12, color: C.textSecondary },
    primaryBtn: {
      backgroundColor: C.primary,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 12,
    },
    primaryBtnText: { color: C.white, fontSize: 15, fontWeight: '800' },

    // B3: 合格判定バッジ
    gradeBadge: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 24,
      backgroundColor: C.successSurface,
      marginTop: 12,
      marginBottom: 8,
    },
    gradeLabel: { fontSize: 16, fontWeight: '900', color: C.success, textAlign: 'center', letterSpacing: 0.5 },
    gradeDesc: { fontSize: 13, color: C.textSecondary, textAlign: 'center', marginTop: 4 },

    // B3: 弱点 Top N
    weakRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: C.borderLight,
    },
    weakRank: { fontSize: 14, fontWeight: '800', color: C.error, width: 28 },
    weakIcon: { fontSize: 22, marginRight: 10 },
    weakLabel: { fontSize: 15, fontWeight: '700', color: C.text },
    weakSub: { fontSize: 12, color: C.textSecondary, marginTop: 2 },

    // B3: 次の学習 CTA
    nextStudyBtn: {
      backgroundColor: C.accent,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 12,
    },
    nextStudyText: { color: C.white, fontSize: 15, fontWeight: '800' },
  });
}
