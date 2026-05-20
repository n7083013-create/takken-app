// ============================================================
// 宅建士 完全対策 - オンボーディング（初回起動時のみ表示）
// ============================================================
// 3ステップのスワイプ可能なフルスクリーンオンボーディング（離脱率最小化版）
//   1. Welcome + 価値提案（¥980 / 7日無料 / 解約自由）
//   2. 試験日の確認 + カウントダウン
//   3. 通知許可 + 完了
// AsyncStorage `@takken_onboarding_done` で表示済み管理
// 日目標・習慣スタッキングなどの詳細設定は「進捗」タブから後追い設定可能

import { useState, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Shadow, FontSize, Spacing, BorderRadius, LetterSpacing } from '../constants/theme';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';
import { useSettingsStore } from '../store/useSettingsStore';
import { getNextTakkenExamDate } from '../constants/exam';
import { requestNotificationPermission } from '../services/notifications';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ONBOARDING_KEY = '@takken_onboarding_done';
const TOTAL_STEPS = 3;

interface OnboardingProps {
  onComplete: () => void;
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const scrollRef = useRef<ScrollView>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [notifyRequesting, setNotifyRequesting] = useState(false);

  // ── Step 2: Exam date (自動計算・試験翌日から次回にカウントダウン) ──
  const examDate = useMemo(() => getNextTakkenExamDate(), []);
  const examDateStr = useMemo(
    () =>
      `${examDate.getFullYear()}年${examDate.getMonth() + 1}月${examDate.getDate()}日（日）`,
    [examDate],
  );
  const daysUntilExam = useMemo(
    () =>
      Math.max(
        0,
        Math.ceil((examDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
      ),
    [examDate],
  );

  const updateSettings = useSettingsStore((s) => s.updateSettings);

  // ── Navigation ──
  const goToStep = useCallback((step: number) => {
    scrollRef.current?.scrollTo({ x: step * SCREEN_WIDTH, animated: true });
    setCurrentStep(step);
  }, []);

  /** 試験日を保存（バリデーション: 未来日かつ Date オブジェクト有効） */
  const persistExamDate = useCallback(() => {
    if (!isNaN(examDate.getTime()) && examDate.getTime() > Date.now()) {
      updateSettings({ examDate: examDate.toISOString() });
    }
  }, [examDate, updateSettings]);

  const handleNext = useCallback(() => {
    if (currentStep === 1) {
      persistExamDate();
    }
    if (currentStep < TOTAL_STEPS - 1) {
      goToStep(currentStep + 1);
    }
  }, [currentStep, persistExamDate, goToStep]);

  const finalizeOnboarding = useCallback(async () => {
    persistExamDate();
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    onComplete();
  }, [persistExamDate, onComplete]);

  /** Step 3: 通知許可 → 完了 */
  const handleEnableNotifications = useCallback(async () => {
    if (notifyRequesting) return;
    setNotifyRequesting(true);
    try {
      await requestNotificationPermission();
    } catch {
      // 拒否されても完了に進める（後から設定で再要求可能）
    } finally {
      setNotifyRequesting(false);
      await finalizeOnboarding();
    }
  }, [notifyRequesting, finalizeOnboarding]);

  /** Step 3: 通知をスキップして完了 */
  const handleSkipNotifications = useCallback(async () => {
    await finalizeOnboarding();
  }, [finalizeOnboarding]);

  /** ヘッダの「スキップ」: オンボーディング全体をスキップ */
  const handleSkipAll = useCallback(async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    onComplete();
  }, [onComplete]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
      if (page !== currentStep && page >= 0 && page < TOTAL_STEPS) {
        if (currentStep === 1) {
          persistExamDate();
        }
        setCurrentStep(page);
      }
    },
    [currentStep, persistExamDate],
  );

  return (
    <View style={s.root}>
      <SafeAreaView style={s.safeArea}>
        {/* Skip button (steps 1-2) */}
        {currentStep < TOTAL_STEPS - 1 && (
          <Pressable
            style={s.skipBtn}
            onPress={handleSkipAll}
            accessibilityRole="button"
            accessibilityLabel="オンボーディングをスキップ"
          >
            <Text style={s.skipText}>スキップ</Text>
          </Pressable>
        )}

        {/* Swipeable pages */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScroll}
          scrollEventThrottle={16}
          bounces={false}
          style={s.scrollView}
        >
          {/* ── Step 1: Welcome + 価値提案 + [Quick Win A] 3秒インパクト ── */}
          <View style={s.page}>
            <View style={s.pageContent}>
              {/* [Quick Win A] タッケン君 (マスコット) で 3秒で印象づけ
                  世界基準: Duolingo の Duo / Headspace のオレンジ円 のような
                  「3秒で覚えてもらえる」ビジュアル */}
              <View style={s.welcomeVisual}>
                <Text style={s.welcomeMascot}>🐕</Text>
                <Text style={s.welcomeBubble}>「合格まで一緒に走ろう！」</Text>
              </View>
              <Text style={s.pageTitle}>試験まであと {daysUntilExam}日</Text>
              <Text style={s.pageSubtitle}>
                全 2,020 問の過去問×AI解説で、{'\n'}あなた専用の最短合格ルートを作成
              </Text>

              {/* 価値提案バッジ: ¥980 / 7日無料 / 解約自由 */}
              <View style={s.valueRow}>
                <View style={s.valueBadge}>
                  <Text style={s.valueBadgeNum}>¥980</Text>
                  <Text style={s.valueBadgeLabel}>全機能</Text>
                </View>
                <View style={s.valueBadge}>
                  <Text style={s.valueBadgeNum}>7日</Text>
                  <Text style={s.valueBadgeLabel}>無料体験</Text>
                </View>
                <View style={s.valueBadge}>
                  <Text style={s.valueBadgeNum}>自由</Text>
                  <Text style={s.valueBadgeLabel}>いつでも解約</Text>
                </View>
              </View>
            </View>
            <View style={s.pageFooter}>
              <Pressable
                style={s.nextBtn}
                onPress={handleNext}
                accessibilityRole="button"
                accessibilityLabel="はじめる"
              >
                <Text style={s.nextBtnText}>はじめる</Text>
              </Pressable>
              <Text style={s.swipeHint}>スワイプでも次へ進めます</Text>
            </View>
          </View>

          {/* ── Step 2: Exam date ── */}
          <View style={s.page}>
            <View style={s.pageContent}>
              <Text style={s.stepIcon}>📅</Text>
              <Text style={s.pageTitle}>次の試験日まで</Text>
              <Text style={s.pageSubtitle}>
                試験日を自動検出しました{'\n'}カウントダウンで学習ペースを管理
              </Text>

              {/* Auto-detected exam date display */}
              <View style={s.examDateCard}>
                <Text style={s.examDateLabel}>試験日</Text>
                <Text style={s.examDateValue}>{examDateStr}</Text>
                <Text style={s.examDateNote}>宅建試験は毎年10月第3日曜日</Text>
              </View>

              {/* Days until exam */}
              <View style={s.daysPreview}>
                <Text style={s.daysPreviewNum}>{daysUntilExam}</Text>
                <Text style={s.daysPreviewLabel}>日後</Text>
              </View>
            </View>
            <View style={s.pageFooter}>
              <Pressable
                style={s.nextBtn}
                onPress={handleNext}
                accessibilityRole="button"
                accessibilityLabel="次へ"
              >
                <Text style={s.nextBtnText}>次へ</Text>
              </Pressable>
            </View>
          </View>

          {/* ── Step 3: 通知許可 + 完了 ── */}
          <View style={s.page}>
            <View style={s.pageContent}>
              <Text style={s.stepIcon}>🔔</Text>
              <Text style={s.pageTitle}>毎日の学習を{'\n'}リマインドしますか？</Text>
              <Text style={s.pageSubtitle}>
                合格者の習慣を後押しする{'\n'}最適なタイミングでお知らせします
              </Text>

              <View style={s.notifyCard}>
                <View style={s.notifyRow}>
                  <Text style={s.notifyIcon}>⏰</Text>
                  <Text style={s.notifyText}>朝の通勤前・寝る前など</Text>
                </View>
                <View style={s.notifyRow}>
                  <Text style={s.notifyIcon}>🔥</Text>
                  <Text style={s.notifyText}>連続学習日数（ストリーク）を維持</Text>
                </View>
                <View style={s.notifyRow}>
                  <Text style={s.notifyIcon}>⚙️</Text>
                  <Text style={s.notifyText}>後から設定でON/OFF切替可能</Text>
                </View>
              </View>
            </View>
            <View style={s.pageFooter}>
              <Pressable
                style={[s.nextBtn, s.startBtn]}
                onPress={handleEnableNotifications}
                disabled={notifyRequesting}
                accessibilityRole="button"
                accessibilityLabel="通知を許可して学習を始める"
              >
                <Text style={s.startBtnText}>
                  {notifyRequesting ? '処理中...' : '通知を許可して始める'}
                </Text>
              </Pressable>
              <Pressable
                style={s.skipFinalBtn}
                onPress={handleSkipNotifications}
                accessibilityRole="button"
                accessibilityLabel="通知をスキップして学習を始める"
              >
                <Text style={s.skipFinalText}>あとで設定する</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>

        {/* Page indicator dots */}
        <View style={s.dotsRow}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View
              key={i}
              style={[s.dot, i === currentStep ? s.dotActive : s.dotInactive]}
            />
          ))}
        </View>
      </SafeAreaView>
    </View>
  );
}

// ── Styles ──
function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: C.background,
    },
    safeArea: {
      flex: 1,
    },

    // ─── Skip ───
    skipBtn: {
      position: 'absolute',
      top: 8,
      right: Spacing.xl,
      zIndex: 10,
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.md,
    },
    skipText: {
      fontSize: FontSize.subhead,
      fontWeight: '600',
      color: C.textSecondary,
    },

    // ─── Scroll ───
    scrollView: {
      flex: 1,
    },

    // ─── Page ───
    page: {
      width: SCREEN_WIDTH,
      flex: 1,
      justifyContent: 'space-between',
    },
    pageContent: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Spacing.xxxl,
    },
    pageFooter: {
      paddingHorizontal: Spacing.xxxl,
      paddingBottom: 20,
    },
    pageTitle: {
      fontSize: FontSize.title1,
      fontWeight: '800',
      color: C.text,
      textAlign: 'center',
      letterSpacing: LetterSpacing.tight,
      marginTop: Spacing.xl,
    },
    pageSubtitle: {
      fontSize: FontSize.body,
      fontWeight: '400',
      color: C.textSecondary,
      textAlign: 'center',
      marginTop: Spacing.md,
      lineHeight: 26,
    },

    // ─── Step icon ───
    stepIcon: {
      fontSize: 56,
      marginBottom: Spacing.sm,
    },

    // ─── Welcome visual ───
    welcomeVisual: {
      alignItems: 'center',
      marginBottom: Spacing.lg,
    },
    welcomeEmoji: {
      fontSize: 72,
    },
    welcomeEmojiRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 20,
      marginTop: 12,
    },
    welcomeEmojiSide: {
      fontSize: 36,
      opacity: 0.7,
    },
    welcomeEmojiCenter: {
      fontSize: 44,
    },

    // ─── [Quick Win A] マスコット (タッケン君) ───
    welcomeMascot: {
      fontSize: 96,
      marginBottom: 4,
    },
    welcomeBubble: {
      fontSize: FontSize.callout,
      fontWeight: '800',
      color: C.primary,
      backgroundColor: C.primarySurface,
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: BorderRadius.full,
      overflow: 'hidden',
    },

    // ─── 価値提案バッジ (¥980 / 7日無料 / 解約自由) ───
    valueRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: Spacing.xxl,
      width: '100%',
      justifyContent: 'space-between',
    },
    valueBadge: {
      flex: 1,
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.sm,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: C.border,
      ...Shadow.sm,
    },
    valueBadgeNum: {
      fontSize: FontSize.headline,
      fontWeight: '900',
      color: C.primary,
      letterSpacing: LetterSpacing.tight,
    },
    valueBadgeLabel: {
      fontSize: FontSize.caption,
      fontWeight: '600',
      color: C.textSecondary,
      marginTop: 4,
      textAlign: 'center',
    },
    swipeHint: {
      fontSize: FontSize.caption,
      color: C.textTertiary,
      textAlign: 'center',
      marginTop: 12,
    },

    // ─── Next / Start button ───
    nextBtn: {
      backgroundColor: C.primary,
      borderRadius: BorderRadius.xl,
      paddingVertical: 18,
      alignItems: 'center',
      ...Shadow.lg,
    },
    nextBtnText: {
      fontSize: FontSize.callout,
      fontWeight: '700',
      color: C.white,
    },
    startBtn: {
      backgroundColor: C.primary,
      paddingVertical: 20,
    },
    startBtnText: {
      fontSize: FontSize.headline,
      fontWeight: '800',
      color: C.white,
      letterSpacing: LetterSpacing.wide,
    },
    skipFinalBtn: {
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 6,
    },
    skipFinalText: {
      fontSize: FontSize.subhead,
      fontWeight: '600',
      color: C.textSecondary,
    },

    // ─── Dots ───
    dotsRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      paddingBottom: 16,
      gap: 8,
    },
    dot: {
      borderRadius: BorderRadius.full,
    },
    dotActive: {
      width: 24,
      height: 8,
      backgroundColor: C.primary,
    },
    dotInactive: {
      width: 8,
      height: 8,
      backgroundColor: C.borderLight,
    },

    // ─── Step 2: Exam date ───
    examDateCard: {
      marginTop: 32,
      backgroundColor: C.card,
      borderRadius: BorderRadius.xl,
      padding: Spacing.xl,
      alignItems: 'center',
      width: '100%',
      ...Shadow.sm,
    },
    examDateLabel: {
      fontSize: FontSize.caption,
      fontWeight: '600',
      color: C.textTertiary,
      letterSpacing: LetterSpacing.wide,
    },
    examDateValue: {
      fontSize: FontSize.title2,
      fontWeight: '800',
      color: C.text,
      marginTop: 6,
      letterSpacing: LetterSpacing.tight,
    },
    examDateNote: {
      fontSize: FontSize.caption,
      color: C.textTertiary,
      marginTop: 8,
    },
    daysPreview: {
      flexDirection: 'row',
      alignItems: 'baseline',
      marginTop: 20,
    },
    daysPreviewNum: {
      fontSize: 48,
      fontWeight: '900',
      color: C.primary,
      letterSpacing: -1,
    },
    daysPreviewLabel: {
      fontSize: FontSize.title3,
      fontWeight: '700',
      color: C.primary,
      marginLeft: 4,
    },

    // ─── Step 3: 通知 ───
    notifyCard: {
      width: '100%',
      marginTop: 32,
      backgroundColor: C.card,
      borderRadius: BorderRadius.xl,
      padding: Spacing.xl,
      gap: 14,
      ...Shadow.sm,
    },
    notifyRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    notifyIcon: {
      fontSize: 22,
      marginRight: 12,
    },
    notifyText: {
      fontSize: FontSize.subhead,
      fontWeight: '500',
      color: C.text,
      flex: 1,
    },
  });
}
