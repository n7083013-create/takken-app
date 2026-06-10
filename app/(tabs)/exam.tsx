import { useEffect, useState, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { confirmAlert } from '../../services/alert';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Shadow, FontSize, Spacing, BorderRadius } from '../../constants/theme';
import { useThemeColors, ThemeColors } from '../../hooks/useThemeColors';
import { useExamStore, EXAM_COMPOSITION, scoreExam } from '../../store/useExamStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useProgressStore } from '../../store/useProgressStore';
import { CATEGORY_LABELS, Category } from '../../types';
import { getMockPresetCount, getMockPresetByNumber } from '../../data';
import { PASS_LINE } from '../../constants/exam';
import { LimitReachedScreen } from '../../components/LimitReachedScreen';
import { phaseForDays } from '../../utils/passEngine';

/** 範囲未学習で 50 問模試に挑むと低得点→離脱に繋がるため、初学者ガードを出す総解答数の閾値。
    本試験は 50 問なので、最低でもその程度は触れてから模試を主役にする。 */
const EXAM_READY_MIN_ANSWERED = 50;

export default function ExamHomeScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const current = useExamStore((s) => s.current);
  const startExam = useExamStore((s) => s.startExam);
  const resumeExam = useExamStore((s) => s.resumeExam);
  const abandonExam = useExamStore((s) => s.abandonExam);
  const isPro = useSettingsStore((s) => s.isPro());
  const getDaysUntilExam = useSettingsStore((s) => s.getDaysUntilExam);
  const totalAnswered = useProgressStore((st) => st.stats.totalQuestions);
  const [loaded, setLoaded] = useState(false);
  // [UX改善 2026-06-10] 無料でも出題構成・初学者ガード・模試一覧・受験のコツは閲覧可。
  // ロックは「開始」操作時に提示する (タブ全体が販売画面=第一印象悪化を防ぐ)。
  const [lockVisible, setLockVisible] = useState(false);

  useEffect(() => {
    resumeExam().finally(() => setLoaded(true));
  }, [resumeExam]);

  const hasActive = current && !current.submitted;
  const hasResult = current && current.submitted;

  // 初学者ガード: 範囲未学習(総解答数が本試験規模未満)かつ直前期でないときに基礎誘導を出す。
  // 直前期(final)は残り日数が少なく、実力把握のため模試を主役化すべきなのでガードを外す。
  const isFinalPhase = phaseForDays(getDaysUntilExam()) === 'final';
  const showBeginnerGuard = loaded && totalAnswered < EXAM_READY_MIN_ANSWERED && !isFinalPhase;

  // 固定セット模試の表示数 (UI 上限 12・実データ件数とズレた見出しを出さない)
  const presetCount = Math.min(12, getMockPresetCount());

  // 模試の開始系操作の入口で呼ぶ。無料ならロック画面を出して true を返す (Pro 判定・paywall 遷移は不変)。
  const guardStart = () => {
    if (!isPro) {
      setLockVisible(true);
      return true;
    }
    return false;
  };

  // [UX改善 2026-05→2026-06-10] 共通 LimitReachedScreen は維持しつつ、表示タイミングを
  // 「タブを開いた瞬間」から「開始ボタン押下時」へ変更 (見せ方の順序のみ変更)。
  if (loaded && !isPro && lockVisible) {
    return (
      <SafeAreaView style={s.safe}>
        <LimitReachedScreen
          mode={{ kind: 'feature_locked_exam' }}
          onUpgrade={() => router.push('/paywall')}
          onSecondary={() => {
            setLockVisible(false);
            if (showBeginnerGuard) router.push('/(tabs)');
          }}
          secondaryLabel={showBeginnerGuard ? 'まず基礎問題から始める' : '戻る'}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.hero}>
          <Text style={s.heroIcon}>📝</Text>
          <Text style={s.heroTitle}>本試験形式 模擬試験</Text>
          <Text style={s.heroSub}>50問 / 120分 / {PASS_LINE}点で合格</Text>
        </View>

        {/* 初学者ガード: まだ範囲を学んでいない人が 50 問で低得点 → 離脱するのを防ぐ。
            模試開始ボタンは残す (挑戦を禁止しない) が、まず基礎固めを強く推奨する。 */}
        {showBeginnerGuard && (
          <View style={[s.guardCard, Shadow.sm]}>
            <Text style={s.guardTitle}>💡 まず基礎を固めてから挑戦しましょう</Text>
            <Text style={s.guardText}>
              模試は本番形式50問です。今の学習量({totalAnswered}問)では実力を測りきれず、
              低い点数で落ち込みやすくなります。まずは基礎問題で土台を作るのがおすすめです。
            </Text>
            <Pressable
              style={s.guardBtn}
              onPress={() => router.push('/(tabs)')}
              accessibilityRole="button"
              accessibilityLabel="まず基礎問題から始める"
            >
              <Text style={s.guardBtnText}>📚 まず基礎問題から始める</Text>
            </Pressable>
          </View>
        )}

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
            if (guardStart()) return;
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
          <Text style={s.primaryBtnSub}>おまかせ: 本試験の科目比率で50問</Text>
        </Pressable>

        {/* ─── 模擬試験プリセット (固定セット) ─── */}
        {/* 見出しはヒーロー「本試験形式 模擬試験」との重複を避け「固定セット模試」に (P4) */}
        <View style={[s.card, Shadow.sm, { marginTop: 8 }]}>
          <Text style={s.cardTitle}>📋 固定セット模試 1〜{presetCount}</Text>
          <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 14, lineHeight: 18 }}>
            本試験と同じ出題比率の模擬試験です。順番に挑戦して合格レベルを目指しましょう。
          </Text>
          {Array.from({ length: presetCount }, (_, i) => i + 1).map((n) => {
            const count = getMockPresetByNumber(n).length;
            return (
              <Pressable
                key={`mock-${n}`}
                style={s.yearRow}
                accessibilityRole="button"
                accessibilityLabel={`模擬${n}を開始`}
                onPress={() => {
                  if (guardStart()) return;
                  const start = () => {
                    useExamStore.getState().startMockPreset(n);
                    router.push('/exam/session');
                  };
                  if (hasActive) {
                    confirmAlert(
                      '新しい試験を開始',
                      '進行中の試験は破棄されます。よろしいですか？',
                      () => { abandonExam(); start(); },
                    );
                  } else {
                    start();
                  }
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.yearLabel}>模擬 {n}</Text>
                  <Text style={s.yearSub}>{count}問 / 120分</Text>
                </View>
                <Text style={s.yearArrow}>{'>'}</Text>
              </Pressable>
            );
          })}

          {/* ランダム模擬: 全模擬を解いた人向け or やり込み用 */}
          <Pressable
            style={[s.yearRow, { marginTop: 8, borderTopWidth: 1, borderTopColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel="ランダム模擬を開始"
            onPress={() => {
              if (guardStart()) return;
              const start = () => {
                useExamStore.getState().startRandomMock();
                router.push('/exam/session');
              };
              if (hasActive) {
                confirmAlert(
                  '新しい試験を開始',
                  '進行中の試験は破棄されます。よろしいですか？',
                  () => { abandonExam(); start(); },
                );
              } else {
                start();
              }
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={s.yearLabel}>🎲 ランダム模擬</Text>
              <Text style={s.yearSub}>全問題からシャッフルで50問 / 120分</Text>
            </View>
            <Text style={s.yearArrow}>{'>'}</Text>
          </Pressable>
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
    // ─── 初学者ガード ───
    guardCard: {
      backgroundColor: C.warningSurface,
      borderRadius: 16,
      padding: 18,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: C.accent + '40',
    },
    guardTitle: { fontSize: 15, fontWeight: '800', color: C.text, marginBottom: 8 },
    guardText: { fontSize: 13, color: C.textSecondary, lineHeight: 20, marginBottom: 14 },
    guardBtn: {
      backgroundColor: C.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    guardBtnText: { color: C.white, fontSize: 15, fontWeight: '800' },
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
