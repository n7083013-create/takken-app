// ============================================================
// 学習タイマー（カスタムポモドーロ）
// 自由に時間設定・直近履歴からワンタップ・セッション記録
//
// 状態はすべて useTimerStore (グローバル) に集約。
// 画面を離れても進行は止まらず、フローティング表示が出る。
// カウントのドライブ (1秒 tick) は app/_layout.tsx のルート ticker に一本化。
// ============================================================

import { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Shadow, FontSize, Spacing, BorderRadius } from '../constants/theme';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';
import { useTimerStore } from '../store/useTimerStore';
import { WebBackButton } from '../components/WebBackButton';

const FOCUS_PRESETS = [5, 10, 15, 25, 30, 45, 60];
const BREAK_PRESETS = [3, 5, 10, 15];

export default function StudyTimerScreen() {
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);

  // グローバルストアの現在状態を購読 (再入場時も走行中なら継続表示される)
  const mode = useTimerStore((st) => st.mode);
  const status = useTimerStore((st) => st.status);
  const focusMin = useTimerStore((st) => st.focusMin);
  const breakMin = useTimerStore((st) => st.breakMin);
  const remainingSec = useTimerStore((st) => st.remainingSec);
  const completedSessions = useTimerStore((st) => st.completedSessions);
  const totalFocusMin = useTimerStore((st) => st.totalFocusMin);
  const recentMinutes = useTimerStore((st) => st.recentMinutes);
  const todayLogs = useTimerStore((st) => st.todayLogs);

  const setFocusMin = useTimerStore((st) => st.setFocusMin);
  const setBreakMin = useTimerStore((st) => st.setBreakMin);
  const start = useTimerStore((st) => st.start);
  const pause = useTimerStore((st) => st.pause);
  const resume = useTimerStore((st) => st.resume);
  const reset = useTimerStore((st) => st.reset);
  const skip = useTimerStore((st) => st.skip);

  // 入力欄の文字列はこの画面のローカル UI 状態 (確定値は store の focusMin/breakMin)
  const [focusInput, setFocusInput] = useState(String(focusMin));
  const [breakInput, setBreakInput] = useState(String(breakMin));

  const applyFocusInput = (text: string) => {
    setFocusInput(text);
    const num = parseInt(text, 10);
    if (!isNaN(num) && num >= 1 && num <= 120) setFocusMin(num);
  };
  const applyBreakInput = (text: string) => {
    setBreakInput(text);
    const num = parseInt(text, 10);
    if (!isNaN(num) && num >= 1 && num <= 60) setBreakMin(num);
  };
  const selectFocusPreset = (min: number) => {
    setFocusMin(min);
    setFocusInput(String(min));
  };
  const selectBreakPreset = (min: number) => {
    setBreakMin(min);
    setBreakInput(String(min));
  };

  // Display
  const minutes = Math.floor(remainingSec / 60);
  const seconds = remainingSec % 60;
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const totalDuration = mode === 'focus' ? focusMin * 60 : breakMin * 60;
  const progressPct = totalDuration > 0 ? ((totalDuration - remainingSec) / totalDuration) * 100 : 0;
  const todayTotal = todayLogs.reduce((sum, l) => sum + l.focusMin, 0);

  // Unique recent that aren't in presets (for extra quick buttons)
  const uniqueRecent = recentMinutes.filter((m) => !FOCUS_PRESETS.includes(m));

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <WebBackButton />
      <ScrollView contentContainerStyle={s.content}>
        {/* Mode indicator */}
        <View style={[s.modePill, mode === 'focus' ? s.modeFocus : s.modeBreak]}>
          <Text style={s.modeText}>
            {mode === 'focus' ? '🎯 集中タイム' : '☕ 休憩タイム'}
          </Text>
        </View>

        {/* Timer circle */}
        <View style={s.timerContainer}>
          <View style={[s.timerCircle, mode === 'focus' ? s.circleFocus : s.circleBreak]}>
            <View style={[s.timerRing, { borderColor: mode === 'focus' ? colors.primary + '30' : '#F59E0B30' }]}>
              <Text style={[s.timerText, mode === 'break' && { color: '#B45309' }]}>
                {timeStr}
              </Text>
              <Text style={s.timerLabel}>
                {status === 'idle' ? 'スタート待ち' : status === 'paused' ? '一時停止中' : mode === 'focus' ? '集中しましょう' : 'リラックス'}
              </Text>
            </View>
          </View>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${progressPct}%`, backgroundColor: mode === 'focus' ? colors.primary : '#F59E0B' }]} />
          </View>
        </View>

        {/* Time settings (idle only) */}
        {status === 'idle' && (
          <View style={s.setupSection}>
            {/* ── 集中時間 ── */}
            <Text style={s.setupLabel}>🎯 集中時間</Text>
            <View style={s.inputRow}>
              <TextInput
                style={s.timeInput}
                value={focusInput}
                onChangeText={applyFocusInput}
                keyboardType="number-pad"
                maxLength={3}
                selectTextOnFocus
                accessibilityLabel="集中時間（分）"
              />
              <Text style={s.inputUnit}>分</Text>
            </View>
            <View style={s.presetRow}>
              {uniqueRecent.map((min) => (
                <Pressable key={`recent-${min}`} style={[s.presetChip, focusMin === min && s.presetChipActive]} onPress={() => selectFocusPreset(min)} accessibilityRole="button">
                  <Text style={s.presetRecent}>🕐</Text>
                  <Text style={[s.presetChipText, focusMin === min && s.presetChipTextActive]}>{min}分</Text>
                </Pressable>
              ))}
              {FOCUS_PRESETS.map((min) => (
                <Pressable key={min} style={[s.presetChip, focusMin === min && s.presetChipActive]} onPress={() => selectFocusPreset(min)} accessibilityRole="button">
                  <Text style={[s.presetChipText, focusMin === min && s.presetChipTextActive]}>{min}分</Text>
                </Pressable>
              ))}
            </View>

            {/* ── 休憩時間 ── */}
            <Text style={[s.setupLabel, { marginTop: 16 }]}>☕ 休憩時間</Text>
            <View style={s.inputRow}>
              <TextInput
                style={[s.timeInput, s.timeInputBreak]}
                value={breakInput}
                onChangeText={applyBreakInput}
                keyboardType="number-pad"
                maxLength={2}
                selectTextOnFocus
                accessibilityLabel="休憩時間（分）"
              />
              <Text style={s.inputUnit}>分</Text>
            </View>
            <View style={s.presetRow}>
              {BREAK_PRESETS.map((min) => (
                <Pressable key={`b-${min}`} style={[s.presetChip, breakMin === min && s.presetChipBreakActive]} onPress={() => selectBreakPreset(min)} accessibilityRole="button">
                  <Text style={[s.presetChipText, breakMin === min && s.presetChipTextActive]}>{min}分</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Controls */}
        <View style={s.controls}>
          {status === 'idle' && (
            <Pressable style={[s.mainBtn, mode === 'focus' ? s.btnFocus : s.btnBreak]} onPress={start} accessibilityRole="button">
              <Text style={s.mainBtnText}>▶ スタート</Text>
            </Pressable>
          )}
          {status === 'running' && (
            <Pressable style={[s.mainBtn, s.btnPause]} onPress={pause} accessibilityRole="button">
              <Text style={s.mainBtnText}>⏸ 一時停止</Text>
            </Pressable>
          )}
          {status === 'paused' && (
            <View style={s.pauseControls}>
              <Pressable style={[s.mainBtn, mode === 'focus' ? s.btnFocus : s.btnBreak]} onPress={resume} accessibilityRole="button">
                <Text style={s.mainBtnText}>▶ 再開</Text>
              </Pressable>
              <Pressable style={s.subBtn} onPress={reset} accessibilityRole="button">
                <Text style={s.subBtnText}>リセット</Text>
              </Pressable>
            </View>
          )}
          {status !== 'idle' && (
            <Pressable style={s.skipBtn} onPress={skip} accessibilityRole="button">
              <Text style={s.skipBtnText}>
                {mode === 'focus' ? '休憩にスキップ ›' : '次の集中へ ›'}
              </Text>
            </Pressable>
          )}
        </View>

        {/* Session stats */}
        <View style={[s.statsCard, Shadow.sm]}>
          <View style={s.statsRow}>
            <View style={s.statItem}>
              <Text style={s.statValue}>{completedSessions}</Text>
              <Text style={s.statLabel}>完了</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={[s.statValue, { color: colors.primary }]}>{totalFocusMin}</Text>
              <Text style={s.statLabel}>集中（分）</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={[s.statValue, { color: '#F59E0B' }]}>{todayTotal}</Text>
              <Text style={s.statLabel}>今日の合計</Text>
            </View>
          </View>
        </View>

        {/* Today's log */}
        {todayLogs.length > 0 && (
          <View style={s.logCard}>
            <Text style={s.logTitle}>今日の記録</Text>
            {todayLogs.map((log, i) => {
              const t = new Date(log.completedAt);
              const hh = String(t.getHours()).padStart(2, '0');
              const mm = String(t.getMinutes()).padStart(2, '0');
              return (
                <View key={i} style={s.logRow}>
                  <Text style={s.logTime}>{hh}:{mm}</Text>
                  <Text style={s.logDuration}>{log.focusMin}分 集中</Text>
                  <Text style={s.logCheck}>✓</Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) { return StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: C.borderLight,
  },
  backBtn: { width: 60 },
  backText: { fontSize: FontSize.body, color: C.primary, fontWeight: '600' },
  headerTitle: { fontSize: FontSize.headline, fontWeight: '700', color: C.text },

  content: { alignItems: 'center', paddingHorizontal: Spacing.xl, paddingTop: 20, paddingBottom: 40 },

  // Mode pill
  modePill: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: BorderRadius.full },
  modeFocus: { backgroundColor: C.primarySurface },
  modeBreak: { backgroundColor: '#FEF3C7' },
  modeText: { fontSize: FontSize.subhead, fontWeight: '700', color: C.text },

  // Timer
  timerContainer: { alignItems: 'center', marginTop: 24, marginBottom: 16 },
  timerCircle: { width: 220, height: 220, borderRadius: 110, alignItems: 'center', justifyContent: 'center' },
  circleFocus: { backgroundColor: C.primarySurface },
  circleBreak: { backgroundColor: '#FEF3C7' },
  timerRing: {
    width: 200, height: 200, borderRadius: 100, borderWidth: 4,
    alignItems: 'center', justifyContent: 'center', backgroundColor: C.card,
  },
  timerText: { fontSize: 48, fontWeight: '200', color: C.primary, fontVariant: ['tabular-nums'], letterSpacing: 2 },
  timerLabel: { fontSize: FontSize.caption, color: C.textTertiary, marginTop: 4, fontWeight: '500' },
  progressTrack: { width: 180, height: 4, backgroundColor: C.borderLight, borderRadius: 2, overflow: 'hidden', marginTop: 12 },
  progressFill: { height: '100%', borderRadius: 2 },

  // Setup (time adjustment)
  setupSection: { width: '100%', alignItems: 'center', marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  timeInput: {
    width: 80, height: 50, borderRadius: 12, backgroundColor: C.card,
    borderWidth: 2, borderColor: C.primary, textAlign: 'center',
    fontSize: 28, fontWeight: '800', color: C.primary,
  },
  timeInputBreak: { borderColor: '#F59E0B', color: '#B45309' },
  inputUnit: { fontSize: 16, fontWeight: '700', color: C.textSecondary },

  presetRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  presetChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: BorderRadius.full,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
  },
  presetChipActive: { backgroundColor: C.primary, borderColor: C.primary },
  presetChipBreakActive: { backgroundColor: '#F59E0B', borderColor: '#F59E0B' },
  presetChipText: { fontSize: 13, fontWeight: '700', color: C.textSecondary },
  presetChipTextActive: { color: C.white },
  presetRecent: { fontSize: 11 },
  setupLabel: { fontSize: 13, fontWeight: '700', color: C.textSecondary, marginBottom: 8, alignSelf: 'flex-start' },

  // Controls
  controls: { alignItems: 'center', gap: 12, marginBottom: 20 },
  mainBtn: {
    paddingHorizontal: 48, paddingVertical: 16, borderRadius: BorderRadius.full,
    minWidth: 200, alignItems: 'center',
  },
  btnFocus: { backgroundColor: C.primary },
  btnBreak: { backgroundColor: '#F59E0B' },
  btnPause: { backgroundColor: C.textSecondary },
  mainBtnText: { fontSize: FontSize.headline, fontWeight: '700', color: C.white },
  pauseControls: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  subBtn: {
    paddingHorizontal: 24, paddingVertical: 16, borderRadius: BorderRadius.full,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
  },
  subBtnText: { fontSize: FontSize.subhead, fontWeight: '600', color: C.textSecondary },
  skipBtn: { paddingVertical: 8 },
  skipBtnText: { fontSize: FontSize.footnote, color: C.textTertiary, fontWeight: '500' },

  // Stats
  statsCard: { width: '100%', backgroundColor: C.card, borderRadius: BorderRadius.xl, padding: Spacing.lg, marginBottom: 16 },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  statItem: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: FontSize.title2, fontWeight: '800', color: C.text },
  statLabel: { fontSize: FontSize.caption2, color: C.textTertiary, fontWeight: '500', marginTop: 2 },
  statDivider: { width: 1, height: 30, backgroundColor: C.borderLight },

  // Today's log
  logCard: {
    width: '100%', backgroundColor: C.card, borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  logTitle: { fontSize: FontSize.footnote, fontWeight: '700', color: C.textSecondary, marginBottom: 10 },
  logRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
    borderBottomWidth: 0.5, borderBottomColor: C.borderLight,
  },
  logTime: { fontSize: FontSize.caption, color: C.textTertiary, width: 50, fontWeight: '600', fontVariant: ['tabular-nums'] },
  logDuration: { fontSize: FontSize.subhead, color: C.text, fontWeight: '600', flex: 1 },
  logCheck: { fontSize: 14, color: C.primary, fontWeight: '700' },
}); }
