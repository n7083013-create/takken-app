import { useEffect, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Shadow } from '../../constants/theme';
import { useThemeColors, ThemeColors } from '../../hooks/useThemeColors';
import { useExamStore, scoreExam, getExamQuestions } from '../../store/useExamStore';
import { useProgressStore } from '../../store/useProgressStore';
import { CATEGORY_LABELS, Category } from '../../types';
import { useAchievementChecker } from '../../hooks/useAchievementChecker';

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

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen options={{ title: '試験結果', headerBackTitle: '戻る' }} />
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={[s.hero, result.passed ? s.heroPass : s.heroFail, Shadow.lg]}>
          <Text style={s.heroLabel}>{result.passed ? '🎉 合格ライン突破' : '📚 もう一歩'}</Text>
          <Text style={s.heroScore}>
            {result.correct}
            <Text style={s.heroTotal}> / {result.total}</Text>
          </Text>
          <Text style={s.heroBorder}>合格目安: 35点</Text>
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
                <Text style={s.qText} numberOfLines={2}>
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
  });
}
