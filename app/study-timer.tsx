// ============================================================
// 学習タイマー（ポモドーロ）
// 25分集中 → 5分休憩のサイクルで効率的な学習
// ============================================================

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Vibration,
  AppState,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Shadow, FontSize, LineHeight, Spacing, BorderRadius } from '../constants/theme';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';
import { useSettingsStore } from '../store/useSettingsStore';

type TimerMode = 'focus' | 'break';
type TimerState = 'idle' | 'running' | 'paused';

const FOCUS_MINUTES = 25;
const BREAK_MINUTES = 5;
const LONG_BREAK_MINUTES = 15;
const SESSIONS_BEFORE_LONG_BREAK = 4;

export default function StudyTimerScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const vibrationEnabled = useSettingsStore((st) => st.settings.vibrationEnabled);

  const [mode, setMode] = useState<TimerMode>('focus');
  const [timerState, setTimerState] = useState<TimerState>('idle');
  const [remainingSec, setRemainingSec] = useState(FOCUS_MINUTES * 60);
  const [completedSessions, setCompletedSessions] = useState(0);
  const [totalFocusMin, setTotalFocusMin] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bgTimeRef = useRef<number | null>(null);

  // バックグラウンド復帰時の時間補正
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

  // タイマーカウントダウン
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
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timerState]);

  const handleTimerComplete = useCallback(() => {
    if (vibrationEnabled) {
      Vibration.vibrate([0, 500, 200, 500]);
    }
    if (mode === 'focus') {
      const newSessions = completedSessions + 1;
      setCompletedSessions(newSessions);
      setTotalFocusMin((prev) => prev + FOCUS_MINUTES);
      // 長い休憩 or 短い休憩
      const isLongBreak = newSessions % SESSIONS_BEFORE_LONG_BREAK === 0;
      setMode('break');
      setRemainingSec((isLongBreak ? LONG_BREAK_MINUTES : BREAK_MINUTES) * 60);
      setTimerState('idle');
    } else {
      // 休憩終了 → 次の集中セッション
      setMode('focus');
      setRemainingSec(FOCUS_MINUTES * 60);
      setTimerState('idle');
    }
  }, [mode, completedSessions, vibrationEnabled]);

  const startTimer = () => setTimerState('running');
  const pauseTimer = () => setTimerState('paused');
  const resumeTimer = () => setTimerState('running');

  const resetTimer = () => {
    setTimerState('idle');
    setMode('focus');
    setRemainingSec(FOCUS_MINUTES * 60);
  };

  const skipToNext = () => {
    setTimerState('idle');
    if (mode === 'focus') {
      setMode('break');
      setRemainingSec(BREAK_MINUTES * 60);
    } else {
      setMode('focus');
      setRemainingSec(FOCUS_MINUTES * 60);
    }
  };

  // 表示用フォーマット
  const minutes = Math.floor(remainingSec / 60);
  const seconds = remainingSec % 60;
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const totalDuration = mode === 'focus' ? FOCUS_MINUTES * 60 : (
    completedSessions % SESSIONS_BEFORE_LONG_BREAK === 0 && mode === 'break'
      ? LONG_BREAK_MINUTES * 60
      : BREAK_MINUTES * 60
  );
  const progressPct = totalDuration > 0 ? ((totalDuration - remainingSec) / totalDuration) * 100 : 0;

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backText}>‹ 戻る</Text>
        </Pressable>
        <Text style={s.headerTitle}>学習タイマー</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={s.content}>
        {/* Mode indicator */}
        <View style={[s.modePill, mode === 'focus' ? s.modeFocus : s.modeBreak]}>
          <Text style={s.modeText}>
            {mode === 'focus' ? '🎯 集中タイム' : '☕ 休憩タイム'}
          </Text>
        </View>

        {/* Timer circle */}
        <View style={s.timerContainer}>
          <View style={[s.timerCircle, mode === 'focus' ? s.circleFocus : s.circleBreak]}>
            {/* Progress ring (simplified with border) */}
            <View style={[
              s.timerRing,
              {
                borderColor: mode === 'focus'
                  ? colors.primary + '30'
                  : '#F59E0B30',
              },
            ]}>
              <Text style={[s.timerText, mode === 'break' && { color: '#B45309' }]}>
                {timeStr}
              </Text>
              <Text style={s.timerLabel}>
                {timerState === 'idle' ? 'スタート待ち' : timerState === 'paused' ? '一時停止中' : mode === 'focus' ? '集中しましょう' : 'リラックス'}
              </Text>
            </View>
          </View>

          {/* Progress bar under timer */}
          <View style={s.progressTrack}>
            <View style={[
              s.progressFill,
              {
                width: `${progressPct}%`,
                backgroundColor: mode === 'focus' ? colors.primary : '#F59E0B',
              },
            ]} />
          </View>
        </View>

        {/* Controls */}
        <View style={s.controls}>
          {timerState === 'idle' && (
            <Pressable style={[s.mainBtn, mode === 'focus' ? s.btnFocus : s.btnBreak]} onPress={startTimer}>
              <Text style={s.mainBtnText}>▶ スタート</Text>
            </Pressable>
          )}
          {timerState === 'running' && (
            <Pressable style={[s.mainBtn, s.btnPause]} onPress={pauseTimer}>
              <Text style={s.mainBtnText}>⏸ 一時停止</Text>
            </Pressable>
          )}
          {timerState === 'paused' && (
            <View style={s.pauseControls}>
              <Pressable style={[s.mainBtn, mode === 'focus' ? s.btnFocus : s.btnBreak]} onPress={resumeTimer}>
                <Text style={s.mainBtnText}>▶ 再開</Text>
              </Pressable>
              <Pressable style={s.subBtn} onPress={resetTimer}>
                <Text style={s.subBtnText}>リセット</Text>
              </Pressable>
            </View>
          )}
          {timerState !== 'idle' && (
            <Pressable style={s.skipBtn} onPress={skipToNext}>
              <Text style={s.skipBtnText}>
                {mode === 'focus' ? '休憩にスキップ ›' : '次の集中セッションへ ›'}
              </Text>
            </Pressable>
          )}
        </View>

        {/* Session stats */}
        <View style={[s.statsCard, Shadow.sm]}>
          <View style={s.statsRow}>
            <View style={s.statItem}>
              <Text style={s.statValue}>{completedSessions}</Text>
              <Text style={s.statLabel}>完了セッション</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={[s.statValue, { color: colors.primary }]}>{totalFocusMin}</Text>
              <Text style={s.statLabel}>集中時間（分）</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={s.statValue}>
                {completedSessions > 0
                  ? `${SESSIONS_BEFORE_LONG_BREAK - (completedSessions % SESSIONS_BEFORE_LONG_BREAK)}`
                  : SESSIONS_BEFORE_LONG_BREAK.toString()}
              </Text>
              <Text style={s.statLabel}>長休憩まで</Text>
            </View>
          </View>
        </View>

        {/* Tips */}
        <View style={s.tipsCard}>
          <Text style={s.tipsTitle}>💡 ポモドーロ学習法</Text>
          <Text style={s.tipsText}>
            25分集中 → 5分休憩を繰り返すことで、{'\n'}
            集中力を維持しながら効率的に学習できます。{'\n'}
            4セッション後は15分の長い休憩を取りましょう。
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) { return StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: C.borderLight,
  },
  backBtn: { width: 60 },
  backText: { fontSize: FontSize.body, color: C.primary, fontWeight: '600' },
  headerTitle: { fontSize: FontSize.headline, fontWeight: '700', color: C.text },

  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: 24,
  },

  // Mode pill
  modePill: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
  },
  modeFocus: { backgroundColor: C.primarySurface },
  modeBreak: { backgroundColor: '#FEF3C7' },
  modeText: {
    fontSize: FontSize.subhead,
    fontWeight: '700',
    color: C.text,
  },

  // Timer
  timerContainer: {
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 24,
  },
  timerCircle: {
    width: 240,
    height: 240,
    borderRadius: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleFocus: { backgroundColor: C.primarySurface },
  circleBreak: { backgroundColor: '#FEF3C7' },
  timerRing: {
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.card,
  },
  timerText: {
    fontSize: 56,
    fontWeight: '200',
    color: C.primary,
    fontVariant: ['tabular-nums'],
    letterSpacing: 2,
  },
  timerLabel: {
    fontSize: FontSize.caption,
    color: C.textTertiary,
    marginTop: 4,
    fontWeight: '500',
  },
  progressTrack: {
    width: 200,
    height: 4,
    backgroundColor: C.borderLight,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 16,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },

  // Controls
  controls: {
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  mainBtn: {
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: BorderRadius.full,
    minWidth: 200,
    alignItems: 'center',
  },
  btnFocus: { backgroundColor: C.primary },
  btnBreak: { backgroundColor: '#F59E0B' },
  btnPause: { backgroundColor: C.textSecondary },
  mainBtnText: {
    fontSize: FontSize.headline,
    fontWeight: '700',
    color: C.white,
  },
  pauseControls: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  subBtn: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: BorderRadius.full,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  subBtnText: {
    fontSize: FontSize.subhead,
    fontWeight: '600',
    color: C.textSecondary,
  },
  skipBtn: {
    paddingVertical: 8,
  },
  skipBtnText: {
    fontSize: FontSize.footnote,
    color: C.textTertiary,
    fontWeight: '500',
  },

  // Stats
  statsCard: {
    width: '100%',
    backgroundColor: C.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statItem: { alignItems: 'center', flex: 1 },
  statValue: {
    fontSize: FontSize.title2,
    fontWeight: '800',
    color: C.text,
  },
  statLabel: {
    fontSize: FontSize.caption2,
    color: C.textTertiary,
    fontWeight: '500',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: C.borderLight,
  },

  // Tips
  tipsCard: {
    width: '100%',
    backgroundColor: C.infoSurface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: C.primary + '20',
  },
  tipsTitle: {
    fontSize: FontSize.footnote,
    fontWeight: '700',
    color: C.primary,
    marginBottom: 6,
  },
  tipsText: {
    fontSize: FontSize.caption,
    color: C.textSecondary,
    lineHeight: LineHeight.footnote,
  },
}); }
