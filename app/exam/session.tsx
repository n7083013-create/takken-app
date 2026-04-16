import { useEffect, useState, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { confirmAlert } from '../../services/alert';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Shadow } from '../../constants/theme';
import { useThemeColors, ThemeColors } from '../../hooks/useThemeColors';
import { useExamStore, getExamQuestions } from '../../store/useExamStore';
import { CATEGORY_LABELS } from '../../types';

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function ExamSessionScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const current = useExamStore((s) => s.current);
  const answerQuestion = useExamStore((s) => s.answerQuestion);
  const toggleFlag = useExamStore((s) => s.toggleFlag);
  const tickTimer = useExamStore((s) => s.tickTimer);
  const submitExam = useExamStore((s) => s.submitExam);
  const [index, setIndex] = useState(0);
  const [showNav, setShowNav] = useState(false);

  const questions = useMemo(() => (current ? getExamQuestions(current) : []), [current]);

  // Timer
  useEffect(() => {
    if (!current || current.submitted) return;
    const t = setInterval(() => tickTimer(1), 1000);
    return () => clearInterval(t);
  }, [current?.submitted, tickTimer]);

  useEffect(() => {
    if (current?.submitted) {
      router.replace('/exam/result');
    }
  }, [current?.submitted, router]);

  if (!current || questions.length === 0) {
    return (
      <SafeAreaView style={s.safe}>
        <Text style={s.empty}>試験セッションが見つかりません</Text>
      </SafeAreaView>
    );
  }

  const q = questions[index];
  const chosen = current.answers[q.id];
  const isFlagged = current.flagged.includes(q.id);
  const answeredCount = Object.keys(current.answers).length;

  const handleSubmit = () => {
    confirmAlert(
      '試験を終了',
      `${answeredCount}/50 問回答済み。採点しますか？`,
      () => submitExam(),
    );
  };

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen
        options={{
          title: `${index + 1} / ${questions.length}`,
          headerBackTitle: '戻る',
        }}
      />

      {/* Timer header */}
      <View style={[s.timerBar, current.remainingSec < 600 && s.timerBarWarn]}>
        <Text style={s.timerText}>⏱ {formatTime(current.remainingSec)}</Text>
        <Text style={s.answeredText}>回答 {answeredCount}/50</Text>
        <Pressable onPress={() => setShowNav(!showNav)} accessibilityRole="button" accessibilityLabel={showNav ? '問題一覧を閉じる' : '問題一覧を表示'}>
          <Text style={s.navBtn}>{showNav ? '閉じる' : '一覧'}</Text>
        </Pressable>
      </View>

      {showNav ? (
        <ScrollView contentContainerStyle={s.gridScroll}>
          <View style={s.grid}>
            {questions.map((qq, i) => {
              const ans = current.answers[qq.id] !== undefined;
              const flag = current.flagged.includes(qq.id);
              return (
                <Pressable
                  key={qq.id}
                  style={[
                    s.gridCell,
                    ans && s.gridCellAnswered,
                    flag && s.gridCellFlagged,
                    i === index && s.gridCellCurrent,
                  ]}
                  onPress={() => {
                    setIndex(i);
                    setShowNav(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`問題${i + 1}${ans ? ' 回答済み' : ' 未回答'}${flag ? ' マーク付き' : ''}`}
                >
                  <Text style={s.gridCellText}>{i + 1}</Text>
                  {flag && <Text style={s.gridFlag}>🚩</Text>}
                </Pressable>
              );
            })}
          </View>
          <Pressable style={[s.submitBtn, Shadow.md]} onPress={handleSubmit} accessibilityRole="button" accessibilityLabel="試験を終了して採点する">
            <Text style={s.submitBtnText}>試験を終了して採点</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <>
          <ScrollView contentContainerStyle={s.scroll}>
            <View style={s.meta}>
              <Text style={s.metaCat}>{CATEGORY_LABELS[q.category]}</Text>
              <Pressable onPress={() => toggleFlag(q.id)} accessibilityRole="button" accessibilityLabel={isFlagged ? 'マークを解除' : '問題をマークする'}>
                <Text style={s.flagBtn}>{isFlagged ? '🚩 マーク済み' : '🏳 マーク'}</Text>
              </Pressable>
            </View>
            <Text style={s.qText}>{q.text}</Text>

            {/* Statements（個数・組み合わせ問題） */}
            {q.statements && q.statements.length > 0 && (
              <View style={s.statementsBox}>
                {q.statements.map((stmt, si) => (
                  <View key={si} style={s.statementRow}>
                    <Text style={s.statementLabel}>{['ア', 'イ', 'ウ', 'エ'][si]}</Text>
                    <Text style={s.statementText}>{stmt}</Text>
                  </View>
                ))}
              </View>
            )}

            {q.choices.map((c, i) => (
              <Pressable
                key={i}
                style={[s.choice, chosen === i && s.choiceSelected]}
                onPress={() => answerQuestion(q.id, i)}
                accessibilityRole="button"
                accessibilityLabel={`選択肢${i + 1}: ${c}`}
              >
                <Text style={[s.choiceNum, chosen === i && s.choiceNumSelected]}>
                  {i + 1}
                </Text>
                <Text style={[s.choiceText, chosen === i && s.choiceTextSelected]}>{c}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={s.footer}>
            <Pressable
              style={[s.navFooterBtn, index === 0 && s.navFooterBtnDisabled]}
              disabled={index === 0}
              onPress={() => setIndex(index - 1)}
              accessibilityRole="button"
              accessibilityLabel="前の問題へ"
            >
              <Text style={s.navFooterText}>‹ 前</Text>
            </Pressable>
            {index < questions.length - 1 ? (
              <Pressable style={s.navFooterBtn} onPress={() => setIndex(index + 1)} accessibilityRole="button" accessibilityLabel="次の問題へ">
                <Text style={s.navFooterText}>次 ›</Text>
              </Pressable>
            ) : (
              <Pressable style={[s.navFooterBtn, s.submitFooterBtn]} onPress={handleSubmit} accessibilityRole="button" accessibilityLabel="試験を終了する">
                <Text style={[s.navFooterText, { color: colors.white }]}>終了</Text>
              </Pressable>
            )}
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.background },
    empty: { textAlign: 'center', marginTop: 40, color: C.textSecondary },
    timerBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: C.primaryDark,
    },
    timerBarWarn: { backgroundColor: C.error },
    timerText: { color: C.white, fontSize: 16, fontWeight: '800' },
    answeredText: { color: 'rgba(255,255,255,0.9)', fontSize: 13 },
    navBtn: {
      color: C.white,
      fontSize: 13,
      fontWeight: '700',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: C.white,
      borderRadius: 6,
    },
    scroll: { padding: 20, paddingBottom: 40 },
    meta: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    metaCat: {
      fontSize: 12,
      fontWeight: '700',
      color: C.primary,
      backgroundColor: C.successSurface,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    flagBtn: { fontSize: 13, color: C.accent, fontWeight: '700' },
    qText: { fontSize: 16, lineHeight: 26, color: C.text, marginBottom: 20 },
    statementsBox: { backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 16, gap: 8 },
    statementRow: { flexDirection: 'row', paddingVertical: 4 },
    statementLabel: { fontSize: 14, fontWeight: '800', color: C.textSecondary, width: 24 },
    statementText: { flex: 1, fontSize: 14, color: C.text, lineHeight: 22 },
    choice: {
      flexDirection: 'row',
      backgroundColor: C.card,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      borderWidth: 2,
      borderColor: C.border,
    },
    choiceSelected: { borderColor: C.primary, backgroundColor: C.successSurface },
    choiceNum: {
      fontSize: 14,
      fontWeight: '800',
      color: C.textSecondary,
      marginRight: 12,
      width: 20,
    },
    choiceNumSelected: { color: C.primary },
    choiceText: { flex: 1, fontSize: 14, lineHeight: 22, color: C.text },
    choiceTextSelected: { color: C.text, fontWeight: '600' },
    footer: {
      flexDirection: 'row',
      padding: 12,
      gap: 10,
      borderTopWidth: 1,
      borderTopColor: C.border,
      backgroundColor: C.card,
    },
    navFooterBtn: {
      flex: 1,
      backgroundColor: C.background,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
    },
    navFooterBtnDisabled: { opacity: 0.3 },
    submitFooterBtn: { backgroundColor: C.error },
    navFooterText: { fontSize: 15, fontWeight: '700', color: C.text },
    gridScroll: { padding: 20 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    gridCell: {
      width: 48,
      height: 48,
      borderRadius: 8,
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    gridCellAnswered: { backgroundColor: C.successSurface, borderColor: C.primary },
    gridCellFlagged: { borderColor: C.accent, borderWidth: 2 },
    gridCellCurrent: { backgroundColor: C.primary },
    gridCellText: { fontSize: 13, fontWeight: '700', color: C.text },
    gridFlag: { position: 'absolute', top: -4, right: -4, fontSize: 10 },
    submitBtn: {
      marginTop: 24,
      backgroundColor: C.error,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
    },
    submitBtnText: { color: C.white, fontSize: 16, fontWeight: '800' },
  });
}
