// ============================================================
// 学習タイマー（カスタムポモドーロ）
// 自由に時間設定・直近履歴からワンタップ・セッション記録
// ============================================================

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Vibration,
  AppState,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Shadow, FontSize, LineHeight, Spacing, BorderRadius } from '../constants/theme';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';
import { useSettingsStore } from '../store/useSettingsStore';
import { logError } from '../services/errorLogger';

type TimerMode = 'focus' | 'break';
type TimerState = 'idle' | 'running' | 'paused';

interface SessionLog {
  focusMin: number;
  completedAt: string; // ISO
}

const STORAGE_KEY_RECENT = '@timer_recent_minutes';
const STORAGE_KEY_LOGS = '@timer_session_logs';

const FOCUS_PRESETS = [5, 10, 15, 25, 30, 45, 60];
const BREAK_PRESETS = [3, 5, 10, 15];
const SESSIONS_FOR_LONG_BREAK = 4;

export default function StudyTimerScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const vibrationEnabled = useSettingsStore((st) => st.settings.vibrationEnabled);

  // Timer state
  const [mode, setMode] = useState<TimerMode>('focus');
  const [timerState, setTimerState] = useState<TimerState>('idle');
  const [focusMin, setFocusMin] = useState(25);
  const [breakMin, setBreakMin] = useState(5);
  const [remainingSec, setRemainingSec] = useState(25 * 60);
  const [completedSessions, setCompletedSessions] = useState(0);
  const [totalFocusMin, setTotalFocusMin] = useState(0);

  // Recent & logs
  const [recentMinutes, setRecentMinutes] = useState<number[]>([]);
  const [todayLogs, setTodayLogs] = useState<SessionLog[]>([]);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bgTimeRef = useRef<number | null>(null);

  // Load recent minutes and today's logs
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY_RECENT);
        if (raw) {
          const parsed = JSON.parse(raw) as number[];
          setRecentMinutes(parsed);
          if (parsed.length > 0) {
            setFocusMin(parsed[0]);
            setRemainingSec(parsed[0] * 60);
          }
        }
      } catch (e) {
        logError(e, { context: 'timer.loadRecent' });
      }
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY_LOGS);
        if (raw) {
          const all = JSON.parse(raw) as SessionLog[];
          const today = new Date().toISOString().slice(0, 10);
          setTodayLogs(all.filter((l) => l.completedAt.slice(0, 10) === today));
        }
      } catch (e) {
        logError(e, { context: 'timer.loadLogs' });
      }
    })();
  }, []);

  // Save recent minutes
  const saveRecent = useCallback(async (min: number) => {
    const updated = [min, ...recentMinutes.filter((m) => m !== min)].slice(0, 5);
    setRecentMinutes(updated);
    await AsyncStorage.setItem(STORAGE_KEY_RECENT, JSON.stringify(updated));
  }, [recentMinutes]);

  // Save session log
  const saveLog = useCallback(async (min: number) => {
    const log: SessionLog = { focusMin: min, completedAt: new Date().toISOString() };
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY_LOGS);
      const all: SessionLog[] = raw ? JSON.parse(raw) : [];
      // Keep last 100 logs
      const updated = [log, ...all].slice(0, 100);
      await AsyncStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(updated));
      const today = new Date().toISOString().slice(0, 10);
      setTodayLogs(updated.filter((l) => l.completedAt.slice(0, 10) === today));
    } catch (e) {
      logError(e, { context: 'timer.saveLog' });
    }
  }, []);

  // Background time correction
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && bgTimeRef.current && timerState === 'running') {
        const elapsed = Math.floor((Date.now() - bgTimeRef.current) / 1000);
        setRemainingSec((prev) => Math.max(0, prev - elapsed));
        bgTimeRef.current = null;
      } else if (state === 'background' && timerState === 'running') {
        bgTimeRef.current = Date.now();
      }
    });
    return () => sub.remove();
  }, [timerState]);

  // Countdown
  useEffect(() => {
    if (timerState === 'running') {
      intervalRef.current = setInterval(() => {
        setRemainingSec((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!);
            handleTimerComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [timerState]);

  const handleTimerComplete = useCallback(() => {
    if (vibrationEnabled) Vibration.vibrate([0, 500, 200, 500]);

    if (mode === 'focus') {
      const newSessions = completedSessions + 1;
      setCompletedSessions(newSessions);
      setTotalFocusMin((prev) => prev + focusMin);
      saveLog(focusMin);
      setMode('break');
      setRemainingSec(breakMin * 60);
      setTimerState('idle');
    } else {
      setMode('focus');
      setRemainingSec(focusMin * 60);
      setTimerState('idle');
    }
  }, [mode, completedSessions, vibrationEnabled, focusMin, breakMin, saveLog]);

  const startTimer = () => {
    saveRecent(focusMin);
    setTimerState('running');
  };
  const pauseTimer = () => setTimerState('paused');
  const resumeTimer = () => setTimerState('running');
  const resetTimer = () => {
    setTimerState('idle');
    setMode('focus');
    setRemainingSec(focusMin * 60);
  };
  const skipToNext = () => {
    setTimerState('idle');
    if (mode === 'focus') {
      setMode('break');
      setRemainingSec(breakMin * 60);
    } else {
      setMode('focus');
      setRemainingSec(focusMin * 60);
    }
  };

  // Time input
  const [focusInput, setFocusInput] = useState(String(focusMin));
  const [breakInput, setBreakInput] = useState(String(breakMin));

  const applyFocusInput = (text: string) => {
    setFocusInput(text);
    const num = parseInt(text, 10);
    if (!isNaN(num) && num >= 1 && num <= 120) {
      setFocusMin(num);
      if (mode === 'focus') setRemainingSec(num * 60);
    }
  };
  const applyBreakInput = (text: string) => {
    setBreakInput(text);
    const num = parseInt(text, 10);
    if (!isNaN(num) && num >= 1 && num <= 60) {
      setBreakMin(num);
      if (mode === 'break') setRemainingSec(num * 60);
    }
  };
  const selectFocusPreset = (min: number) => {
    setFocusMin(min);
    setFocusInput(String(min));
    if (mode === 'focus') setRemainingSec(min * 60);
  };
  const selectBreakPreset = (min: number) => {
    setBreakMin(min);
    setBreakInput(String(min));
    if (mode === 'break') setRemainingSec(min * 60);
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
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn} accessibilityRole="button">
          <Text style={s.backText}>‹ 戻る</Text>
        </Pressable>
        <Text style={s.headerTitle}>学習タイマー</Text>
        <View style={{ width: 60 }} />
      </View>

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
                {timerState === 'idle' ? 'スタート待ち' : timerState === 'paused' ? '一時停止中' : mode === 'focus' ? '集中しましょう' : 'リラックス'}
              </Text>
            </View>
          </View>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${progressPct}%`, backgroundColor: mode === 'focus' ? colors.primary : '#F59E0B' }]} />
          </View>
        </View>

        {/* Time settings (idle only) */}
        {timerState === 'idle' && (
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
          {timerState === 'idle' && (
            <Pressable style={[s.mainBtn, mode === 'focus' ? s.btnFocus : s.btnBreak]} onPress={startTimer} accessibilityRole="button">
              <Text style={s.mainBtnText}>▶ スタート</Text>
            </Pressable>
          )}
          {timerState === 'running' && (
            <Pressable style={[s.mainBtn, s.btnPause]} onPress={pauseTimer} accessibilityRole="button">
              <Text style={s.mainBtnText}>⏸ 一時停止</Text>
            </Pressable>
          )}
          {timerState === 'paused' && (
            <View style={s.pauseControls}>
              <Pressable style={[s.mainBtn, mode === 'focus' ? s.btnFocus : s.btnBreak]} onPress={resumeTimer} accessibilityRole="button">
                <Text style={s.mainBtnText}>▶ 再開</Text>
              </Pressable>
              <Pressable style={s.subBtn} onPress={resetTimer} accessibilityRole="button">
                <Text style={s.subBtnText}>リセット</Text>
              </Pressable>
            </View>
          )}
          {timerState !== 'idle' && (
            <Pressable style={s.skipBtn} onPress={skipToNext} accessibilityRole="button">
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
