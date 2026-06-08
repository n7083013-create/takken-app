// ============================================================
// FloatingTimer — タイマー画面以外で常時表示される小さなフローティング表示
//
// RootLayout の Stack と同階層に absolute オーバーレイとして描画され、
// どの画面の上にも残り時間 (mm:ss) を「右上」に出す (解答に被らない隅)。
//   - 本体タップ  → /study-timer へ (完全停止「■ 終了」はそこで行う)
//   - 「–」タップ → 右上の小さなドットに畳む (hidden=true)。タイマーは動き続ける
//   - ドットタップ→ 元のピルに戻す (hidden=false)
// 「畳む」は完全に消さず必ずドットを残す = 「戻せない」を無くし、
//   かつ「動いてるのに見えない」誤解も防ぐ (憲法P6 誠実)。
//
// 表示条件: status !== 'idle' && 現在ルートが /study-timer でない。
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
  const hidden = useTimerStore((s) => s.hidden); // = 最小化(ドットに畳んだ)状態
  const setHidden = useTimerStore((s) => s.setHidden);

  const s = useMemo(() => makeStyles(colors), [colors]);

  // タイマー画面そのものでは出さない (二重表示防止)。idle 時も出さない。
  const onTimerScreen = pathname === '/study-timer' || pathname?.endsWith('/study-timer');
  if (status === 'idle' || onTimerScreen) return null;

  const paused = status === 'paused';
  // 解答に被らない「右上」の隅に控えめに浮かべる
  const top = insets.top + 8;

  // 最小化中: 小さなドットだけ。タップで元のピルに戻す(=再表示)
  if (hidden) {
    return (
      <View style={[s.anchor, { top }]} pointerEvents="box-none">
        <Pressable
          onPress={() => setHidden(false)}
          style={({ pressed }) => [
            s.dot,
            mode === 'focus' ? s.dotFocus : s.dotBreak,
            Shadow.sm,
            pressed && s.pressed,
          ]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`学習タイマー作動中 残り${fmt(remainingSec)} タップで表示`}
        >
          <Text style={s.dotIcon}>{icon(mode, paused)}</Text>
        </Pressable>
      </View>
    );
  }

  // 通常: 右上にピル。本体タップ=タイマー画面へ / 「–」で最小化(ドットに畳む)
  return (
    <View style={[s.anchor, { top }]} pointerEvents="box-none">
      <Pressable
        style={({ pressed }) => [
          s.pill,
          mode === 'focus' ? s.pillFocus : s.pillBreak,
          Shadow.md,
          pressed && s.pressed,
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
          accessibilityLabel="タイマー表示を畳む（タイマーは動き続けます）"
          style={s.closeBtn}
        >
          <Text style={s.close}>–</Text>
        </Pressable>
      </Pressable>
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    anchor: {
      position: 'absolute',
      right: 12,
      alignItems: 'flex-end',
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
    pressed: { opacity: 0.85 },
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
    close: { fontSize: 18, fontWeight: '700', color: C.textTertiary, lineHeight: 20 },
    // 最小化ドット
    dot: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    dotFocus: { backgroundColor: C.card, borderColor: C.primary + '55' },
    dotBreak: { backgroundColor: C.card, borderColor: '#F59E0B66' },
    dotIcon: { fontSize: 18 },
  });
}
