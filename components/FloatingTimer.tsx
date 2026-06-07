// ============================================================
// FloatingTimer — タイマー画面以外で常時表示される小さなフローティング表示
//
// RootLayout の Stack と同階層に absolute オーバーレイとして描画され、
// どの画面の上にも残り時間 (mm:ss) を出す。タップで /study-timer へ戻り、
// × で当該セッション中だけ非表示にできる (既定=表示)。
//
// 表示条件: status !== 'idle' && !hidden && 現在ルートが /study-timer でない。
// ============================================================

import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import { useTimerStore, type TimerMode } from '../store/useTimerStore';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';
import { Shadow } from '../constants/theme';

function fmt(remainingSec: number): string {
  const m = Math.floor(remainingSec / 60);
  const s = remainingSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function icon(mode: TimerMode, paused: boolean): string {
  if (paused) return '⏸';
  return mode === 'focus' ? '🎯' : '☕';
}

export function FloatingTimer() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();

  const status = useTimerStore((s) => s.status);
  const mode = useTimerStore((s) => s.mode);
  const remainingSec = useTimerStore((s) => s.remainingSec);
  const hidden = useTimerStore((s) => s.hidden);
  const setHidden = useTimerStore((s) => s.setHidden);

  const s = useMemo(() => makeStyles(colors), [colors]);

  // タイマー画面そのものでは出さない (二重表示防止)
  const onTimerScreen = pathname === '/study-timer' || pathname?.endsWith('/study-timer');
  if (status === 'idle' || hidden || onTimerScreen) return null;

  const paused = status === 'paused';
  // 下タブの少し上に控えめに浮かべる (操作を邪魔しない)
  const bottom = insets.bottom + 64;

  return (
    <View style={[s.wrap, { bottom }]} pointerEvents="box-none">
      <Pressable
        style={({ pressed }) => [
          s.pill,
          mode === 'focus' ? s.pillFocus : s.pillBreak,
          Shadow.md,
          pressed && s.pillPressed,
        ]}
        onPress={() => router.push('/study-timer')}
        accessibilityRole="button"
        accessibilityLabel={`学習タイマー 残り${fmt(remainingSec)} タップで開く`}
      >
        <Text style={s.icon}>{icon(mode, paused)}</Text>
        <Text style={s.time}>{fmt(remainingSec)}</Text>
        <Pressable
          hitSlop={10}
          onPress={() => setHidden(true)}
          accessibilityRole="button"
          accessibilityLabel="フローティング表示を閉じる"
          style={s.closeBtn}
        >
          <Text style={s.close}>×</Text>
        </Pressable>
      </Pressable>
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
      // Web で最前面に確実に重ねる
      ...(Platform.OS === 'web' ? ({ zIndex: 1000 } as object) : null),
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingLeft: 14,
      paddingRight: 8,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
    },
    pillFocus: { backgroundColor: C.card, borderColor: C.primary + '55' },
    pillBreak: { backgroundColor: C.card, borderColor: '#F59E0B66' },
    pillPressed: { opacity: 0.85 },
    icon: { fontSize: 15 },
    time: {
      fontSize: 16,
      fontWeight: '700',
      color: C.text,
      fontVariant: ['tabular-nums'],
      letterSpacing: 1,
      minWidth: 50,
      textAlign: 'center',
    },
    closeBtn: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.surface,
    },
    close: { fontSize: 16, fontWeight: '700', color: C.textTertiary, lineHeight: 18 },
  });
}
