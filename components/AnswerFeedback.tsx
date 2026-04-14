// ============================================================
// 正解/不正解フィードバック（中毒性のあるマイクロインタラクション）
// ============================================================
// - 正解時: 紙吹雪エフェクト + ハプティック + コンボカウンター
// - 不正解時: 穏やかな振動 + 励ましメッセージ
// - ストリーク到達時: 特別な祝福アニメーション

import { useEffect, useRef, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { FontSize, BorderRadius, Spacing } from '../constants/theme';
import { useThemeColors, ThemeColors } from '../hooks/useThemeColors';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ─── Confetti Particle ───
const CONFETTI_COLORS = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96E6A1', '#FFA07A', '#DDA0DD', '#87CEEB'];
const CONFETTI_COUNT = 18;

interface ConfettiProps {
  active: boolean;
}

function ConfettiOverlay({ active }: ConfettiProps) {
  const particles = useRef(
    Array.from({ length: CONFETTI_COUNT }, () => ({
      anim: new Animated.Value(0),
      x: Math.random() * SCREEN_W,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      size: 6 + Math.random() * 6,
      rotation: Math.random() * 360,
      delay: Math.random() * 200,
    })),
  ).current;

  useEffect(() => {
    if (!active) return;
    particles.forEach((p) => {
      p.anim.setValue(0);
      Animated.timing(p.anim, {
        toValue: 1,
        duration: 800 + Math.random() * 400,
        delay: p.delay,
        useNativeDriver: true,
      }).start();
    });
  }, [active]);

  if (!active) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: p.x,
            top: -10,
            width: p.size,
            height: p.size * 0.6,
            backgroundColor: p.color,
            borderRadius: 2,
            opacity: p.anim.interpolate({
              inputRange: [0, 0.2, 0.8, 1],
              outputRange: [0, 1, 1, 0],
            }),
            transform: [
              {
                translateY: p.anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, SCREEN_H * 0.5 + Math.random() * 100],
                }),
              },
              {
                translateX: p.anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, (Math.random() - 0.5) * 80],
                }),
              },
              {
                rotate: p.anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [`${p.rotation}deg`, `${p.rotation + 360 + Math.random() * 360}deg`],
                }),
              },
            ],
          }}
        />
      ))}
    </View>
  );
}

// ─── コンボカウンター表示 ───
interface ComboProps {
  combo: number;
}

function ComboDisplay({ combo }: ComboProps) {
  const colors = useThemeColors();
  const s = useMemo(() => comboStyles(colors), [colors]);
  const scaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (combo < 2) return;
    scaleAnim.setValue(0);
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 4,
      tension: 200,
      useNativeDriver: true,
    }).start();
  }, [combo]);

  if (combo < 2) return null;

  const comboLabel =
    combo >= 10 ? '🔥 PERFECT' :
    combo >= 7 ? '⚡ AMAZING' :
    combo >= 5 ? '✨ GREAT' :
    combo >= 3 ? '👏 GOOD' : '';

  const comboColor =
    combo >= 10 ? '#FF4500' :
    combo >= 7 ? '#FF6B00' :
    combo >= 5 ? '#FFB800' :
    '#4CAF50';

  return (
    <Animated.View
      style={[
        s.comboContainer,
        {
          transform: [
            {
              scale: scaleAnim.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [0.3, 1.15, 1],
              }),
            },
          ],
          opacity: scaleAnim,
        },
      ]}
    >
      <Text style={[s.comboCount, { color: comboColor }]}>{combo}</Text>
      <Text style={[s.comboLabel, { color: comboColor }]}>{comboLabel}</Text>
      <Text style={s.comboSub}>連続正解</Text>
    </Animated.View>
  );
}

function comboStyles(C: ThemeColors) {
  return StyleSheet.create({
    comboContainer: {
      position: 'absolute',
      top: 60,
      right: 20,
      alignItems: 'center',
      zIndex: 100,
    },
    comboCount: {
      fontSize: 36,
      fontWeight: '900',
    },
    comboLabel: {
      fontSize: FontSize.footnote,
      fontWeight: '800',
      marginTop: -2,
    },
    comboSub: {
      fontSize: FontSize.caption2,
      fontWeight: '600',
      color: C.textTertiary,
    },
  });
}

// ─── メインフィードバックコンポーネント ───
export interface AnswerFeedbackRef {
  triggerCorrect: () => void;
  triggerWrong: () => void;
  getCombo: () => number;
  resetCombo: () => void;
}

interface FeedbackProps {
  /** 外部からcomboを管理したい場合 */
  combo?: number;
  showCombo?: boolean;
}

export function useAnswerFeedback() {
  const [showConfetti, setShowConfetti] = useState(false);
  const [combo, setCombo] = useState(0);
  const flashAnim = useRef(new Animated.Value(0)).current;

  const triggerCorrect = () => {
    setCombo((c) => c + 1);
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 1200);

    // ハプティック（iOS/Android）
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    // 画面フラッシュ
    flashAnim.setValue(1);
    Animated.timing(flashAnim, {
      toValue: 0,
      duration: 400,
      useNativeDriver: true,
    }).start();
  };

  const triggerWrong = () => {
    setCombo(0);

    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }

    flashAnim.setValue(1);
    Animated.timing(flashAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const resetCombo = () => setCombo(0);

  const FeedbackOverlay = useMemo(
    () =>
      function Overlay() {
        return (
          <>
            <ConfettiOverlay active={showConfetti} />
            <ComboDisplay combo={combo} />
            {/* 正解フラッシュ（緑） */}
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: combo > 0 ? 'rgba(76, 175, 80, 0.12)' : 'rgba(229, 57, 53, 0.10)',
                  opacity: flashAnim,
                },
              ]}
            />
          </>
        );
      },
    [showConfetti, combo, flashAnim],
  );

  return { triggerCorrect, triggerWrong, combo, resetCombo, FeedbackOverlay };
}

// ─── ストリーク到達祝福 ───
const STREAK_MILESTONES: Record<number, { emoji: string; title: string; sub: string }> = {
  3: { emoji: '🔥', title: '3日連続！', sub: '習慣が始まっています' },
  5: { emoji: '⚡', title: '5日連続！', sub: '素晴らしい継続力です' },
  7: { emoji: '🏆', title: '1週間連続！', sub: '学習が習慣になりました' },
  10: { emoji: '💎', title: '10日連続！', sub: '合格に一歩近づいています' },
  14: { emoji: '🌟', title: '2週間連続！', sub: '驚異的な継続力！' },
  21: { emoji: '👑', title: '3週間連続！', sub: 'あなたは学習の達人です' },
  30: { emoji: '🎖️', title: '1ヶ月連続！', sub: '伝説的な記録です！' },
  50: { emoji: '🏅', title: '50日連続！', sub: '合格は目前です！' },
  100: { emoji: '💯', title: '100日連続！', sub: '殿堂入り！' },
};

interface StreakCelebrationProps {
  streak: number;
  visible: boolean;
  onDismiss: () => void;
}

export function StreakCelebration({ streak, visible, onDismiss }: StreakCelebrationProps) {
  const colors = useThemeColors();
  const milestone = STREAK_MILESTONES[streak];
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible && milestone) {
      scaleAnim.setValue(0);
      opacityAnim.setValue(0);
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, friction: 5, tension: 100, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      // 自動消去
      const timer = setTimeout(onDismiss, 3000);
      return () => clearTimeout(timer);
    }
  }, [visible, milestone]);

  if (!visible || !milestone) return null;

  return (
    <Animated.View
      style={[
        streakStyles.overlay,
        { opacity: opacityAnim },
      ]}
      pointerEvents="box-none"
    >
      <ConfettiOverlay active={visible} />
      <Animated.View
        style={[
          streakStyles.card,
          {
            backgroundColor: colors.card,
            transform: [
              {
                scale: scaleAnim.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [0.3, 1.1, 1],
                }),
              },
            ],
          },
        ]}
      >
        <Text style={streakStyles.emoji}>{milestone.emoji}</Text>
        <Text style={[streakStyles.title, { color: colors.text }]}>{milestone.title}</Text>
        <Text style={[streakStyles.sub, { color: colors.textSecondary }]}>{milestone.sub}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const streakStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 1000,
  },
  card: {
    paddingHorizontal: 48,
    paddingVertical: 36,
    borderRadius: BorderRadius.xxl,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 10,
  },
  emoji: {
    fontSize: 56,
    marginBottom: 12,
  },
  title: {
    fontSize: FontSize.title1,
    fontWeight: '900',
    textAlign: 'center',
  },
  sub: {
    fontSize: FontSize.subhead,
    fontWeight: '500',
    marginTop: 6,
    textAlign: 'center',
  },
});
