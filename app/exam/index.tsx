import { useEffect, useState, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { confirmAlert } from '../../services/alert';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Shadow, FontSize, Spacing, BorderRadius } from '../../constants/theme';
import { useThemeColors, ThemeColors } from '../../hooks/useThemeColors';
import { useExamStore, EXAM_COMPOSITION, scoreExam } from '../../store/useExamStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { CATEGORY_LABELS, Category } from '../../types';
import { getAvailableExamYears, toWareki, getExamByYear } from '../../data';
import { PASS_LINE } from '../../constants/exam';

export default function ExamHomeScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const current = useExamStore((s) => s.current);
  const startExam = useExamStore((s) => s.startExam);
  const resumeExam = useExamStore((s) => s.resumeExam);
  const abandonExam = useExamStore((s) => s.abandonExam);
  const isPro = useSettingsStore((s) => s.isPro());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    resumeExam().finally(() => setLoaded(true));
  }, [resumeExam]);

  const hasActive = current && !current.submitted;
  const hasResult = current && current.submitted;

  if (loaded && !isPro) {
    return (
      <SafeAreaView style={s.safe}>
        <Stack.Screen options={{ title: '模擬試験' }} />
        <View style={{ flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 56, marginBottom: 16 }}>📝</Text>
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 8 }}>
            模擬試験はPREMIUM会員限定
          </Text>
          <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginBottom: 24, lineHeight: 20 }}>
            本試験形式 50問・120分の模擬試験で{'\n'}時間配分を本番同様に練習できます
          </Text>
          <Pressable
            style={[s.primaryBtn, Shadow.md, { paddingHorizontal: 40 }]}
            onPress={() => router.push('/paywall')}
          >
            <Text style={s.primaryBtnText}>PREMIUMプランを見る</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen options={{ title: '模擬試験', headerBackTitle: '戻る' }} />
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.hero}>
          <Text style={s.heroIcon}>📝</Text>
          <Text style={s.heroTitle}>本試験形式 模擬試験</Text>
          <Text style={s.heroSub}>50問 / 120分 / {PASS_LINE}点で合格</Text>
        </View>

        <View style={[s.card, Shadow.sm]}>
          <Text style={s.cardTitle}>出題構成</Text>
          {(Object.keys(EXAM_COMPOSITION) as Category[]).map((cat) => (
            <View key={cat} style={s.row}>
              <Text style={s.rowLabel}>{CATEGORY_LABELS[cat]}</Text>
              <Text style={s.rowValue}>{EXAM_COMPOSITION[cat]}問</Text>
            </View>
          ))}
          <View style={[s.row, s.rowTotal]}>
            <Text style={[s.rowLabel, s.bold]}>合計</Text>
            <Text style={[s.rowValue, s.bold]}>50問</Text>
          </View>
        </View>

        {loaded && hasActive && (
          <Pressable
            style={[s.primaryBtn, Shadow.md]}
            onPress={() => router.push('/exam/session')}
          >
            <Text style={s.primaryBtnText}>▶ 試験を再開する</Text>
            <Text style={s.primaryBtnSub}>
              残り時間 {Math.floor(current!.remainingSec / 60)}分
            </Text>
          </Pressable>
        )}

        {loaded && hasResult && (
          <Pressable
            style={[s.primaryBtn, Shadow.md, { backgroundColor: colors.primaryDark }]}
            onPress={() => router.push('/exam/result')}
          >
            <Text style={s.primaryBtnText}>📊 前回の結果を見る</Text>
            <Text style={s.primaryBtnSub}>
              {scoreExam(current!).correct} / 50 点
            </Text>
          </Pressable>
        )}

        <Pressable
          style={[s.primaryBtn, Shadow.md, hasActive && s.secondaryBtn]}
          onPress={() => {
            if (hasActive) {
              confirmAlert(
                '新しい試験を開始',
                '進行中の試験は破棄されます。よろしいですか？',
                () => {
                  abandonExam();
                  startExam();
                  router.push('/exam/session');
                },
              );
            } else {
              startExam();
              router.push('/exam/session');
            }
          }}
        >
          <Text style={s.primaryBtnText}>
            {hasActive ? '🔄 新しい試験を開始' : '🚀 模擬試験を開始'}
          </Text>
        </Pressable>

        {/* ─── 年度別過去問 ─── */}
        <View style={[s.card, Shadow.sm, { marginTop: 8 }]}>
          <Text style={s.cardTitle}>📋 年度別 過去問チャレンジ</Text>
          <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 14, lineHeight: 18 }}>
            本試験と同じ出題比率で年度別に挑戦できます
          </Text>
          {getAvailableExamYears().slice(0, 12).map((year) => {
            const count = getExamByYear(year).length;
            return (
              <Pressable
                key={year}
                style={s.yearRow}
                accessibilityRole="button"
                accessibilityLabel={`${toWareki(year)}の過去問を解く`}
                onPress={() => {
                  if (hasActive) {
                    confirmAlert(
                      '新しい試験を開始',
                      '進行中の試験は破棄されます。よろしいですか？',
                      () => {
                        abandonExam();
                        const startYearExam = useExamStore.getState().startYearExam;
                        startYearExam(year);
                        router.push('/exam/session');
                      },
                    );
                  } else {
                    const startYearExam = useExamStore.getState().startYearExam;
                    startYearExam(year);
                    router.push('/exam/session');
                  }
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.yearLabel}>{toWareki(year)}</Text>
                  <Text style={s.yearSub}>{count}問 / 120分</Text>
                </View>
                <Text style={s.yearArrow}>{'>'}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={s.notes}>
          <Text style={s.notesTitle}>💡 受験のコツ</Text>
          <Text style={s.noteItem}>• 本番と同じ120分の時間配分を体で覚える</Text>
          <Text style={s.noteItem}>• 迷った問題は🚩マークを付けて後で見直す</Text>
          <Text style={s.noteItem}>• 終了後は不正解を必ず復習（自動で復習リストに追加）</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.background },
    scroll: { padding: 20, paddingBottom: 40 },
    hero: { alignItems: 'center', paddingVertical: 24 },
    heroIcon: { fontSize: 56, marginBottom: 8 },
    heroTitle: { fontSize: 22, fontWeight: '800', color: C.text },
    heroSub: { fontSize: 14, color: C.textSecondary, marginTop: 6 },
    card: {
      backgroundColor: C.card,
      borderRadius: 16,
      padding: 20,
      marginBottom: 20,
    },
    cardTitle: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 12 },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 8,
    },
    rowTotal: { borderTopWidth: 1, borderTopColor: C.border, marginTop: 4, paddingTop: 12 },
    rowLabel: { fontSize: 14, color: C.text },
    rowValue: { fontSize: 14, color: C.textSecondary },
    bold: { fontWeight: '800', color: C.text },
    primaryBtn: {
      backgroundColor: C.primary,
      borderRadius: 14,
      paddingVertical: 18,
      alignItems: 'center',
      marginBottom: 12,
    },
    secondaryBtn: { backgroundColor: C.textTertiary },
    primaryBtnText: { color: C.white, fontSize: 16, fontWeight: '800' },
    primaryBtnSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 4 },
    notes: {
      marginTop: 16,
      padding: 16,
      backgroundColor: C.warningSurface,
      borderRadius: 12,
    },
    notesTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8, color: C.text },
    noteItem: { fontSize: 13, color: C.textSecondary, marginBottom: 4 },
    yearRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 4,
      borderBottomWidth: 1,
      borderBottomColor: C.borderLight,
    },
    yearLabel: { fontSize: 15, fontWeight: '700', color: C.text },
    yearSub: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
    yearArrow: { fontSize: 18, color: C.textTertiary, fontWeight: '600' },
  });
}
