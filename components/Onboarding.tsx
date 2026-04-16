// ============================================================
// 宅建士 完全対策 - オンボーディング（初回起動時のみ表示）
// ============================================================
// 4ステップのスワイプ可能なフルスクリーンオンボーディング
// AsyncStorage `@takken_onboarding_done` で表示済み管理

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

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ONBOARDING_KEY = '@takken_onboarding_done';
const TOTAL_STEPS = 4;

interface OnboardingProps {
  onComplete: () => void;
}

// ── Daily goal presets ──
const GOAL_PRESETS = [
  { value: 10, label: '10問/日', desc: 'のんびり', icon: '🌱' },
  { value: 20, label: '20問/日', desc: 'おすすめ', icon: '🎯' },
  { value: 30, label: '30問/日', desc: 'がっつり', icon: '🔥' },
] as const;

/** 指定年の10月第3日曜日を計算 */
function calcThirdSunday(year: number): Date {
  const oct1 = new Date(year, 9, 1);
  const firstSunday = ((7 - oct1.getDay()) % 7) + 1;
  return new Date(year, 9, firstSunday + 14);
}

/** 直近の宅建試験日を自動計算（過ぎていたら翌年） */
function getNextExamDate(): Date {
  const now = new Date();
  const thisYear = calcThirdSunday(now.getFullYear());
  if (thisYear.getTime() > now.getTime()) return thisYear;
  return calcThirdSunday(now.getFullYear() + 1);
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const scrollRef = useRef<ScrollView>(null);
  const [currentStep, setCurrentStep] = useState(0);

  // ── Step 2: Exam date (自動計算) ──
  const examDate = useMemo(() => getNextExamDate(), []);
  const examDateStr = useMemo(
    () =>
      `${examDate.getFullYear()}年${examDate.getMonth() + 1}月${examDate.getDate()}日（日）`,
    [examDate],
  );

  // ── Step 3: Daily goal ──
  const [selectedGoal, setSelectedGoal] = useState(20);

  const updateSettings = useSettingsStore((s) => s.updateSettings);

  // ── Navigation ──
  const goToStep = useCallback(
    (step: number) => {
      scrollRef.current?.scrollTo({ x: step * SCREEN_WIDTH, animated: true });
      setCurrentStep(step);
    },
    [],
  );

  const handleNext = useCallback(() => {
    if (currentStep === 1) {
      // Save exam date
      updateSettings({ examDate: examDate.toISOString() });
    }
    if (currentStep === 2) {
      // Save daily goal
      updateSettings({ dailyGoal: selectedGoal });
    }
    if (currentStep < TOTAL_STEPS - 1) {
      goToStep(currentStep + 1);
    }
  }, [currentStep, examDate, selectedGoal, updateSettings, goToStep]);

  const handleComplete = useCallback(async () => {
    // Save all settings one more time
    updateSettings({
      examDate: examDate.toISOString(),
      dailyGoal: selectedGoal,
    });
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    onComplete();
  }, [examDate, selectedGoal, updateSettings, onComplete]);

  const handleSkip = useCallback(async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    onComplete();
  }, [onComplete]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
      if (page !== currentStep && page >= 0 && page < TOTAL_STEPS) {
        // Save settings when swiping away from step 2 or 3
        if (currentStep === 1) {
          updateSettings({ examDate: examDate.toISOString() });
        }
        if (currentStep === 2) {
          updateSettings({ dailyGoal: selectedGoal });
        }
        setCurrentStep(page);
      }
    },
    [currentStep, examDate, selectedGoal, updateSettings],
  );

  return (
    <View style={s.root}>
      <SafeAreaView style={s.safeArea}>
        {/* Skip button (steps 1-3) */}
        {currentStep < TOTAL_STEPS - 1 && (
          <Pressable
            style={s.skipBtn}
            onPress={handleSkip}
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
          {/* ── Step 1: Welcome ── */}
          <View style={s.page}>
            <View style={s.pageContent}>
              <View style={s.welcomeVisual}>
                <Text style={s.welcomeEmoji}>🏠</Text>
                <View style={s.welcomeEmojiRow}>
                  <Text style={s.welcomeEmojiSide}>📖</Text>
                  <Text style={s.welcomeEmojiCenter}>🎓</Text>
                  <Text style={s.welcomeEmojiSide}>✨</Text>
                </View>
              </View>
              <Text style={s.pageTitle}>宅建合格への最短ルート</Text>
              <Text style={s.pageSubtitle}>
                AIが弱点を分析し、{'\n'}あなただけの学習プランを作成します
              </Text>
            </View>
            <View style={s.pageFooter}>
              <Pressable
                style={s.nextBtn}
                onPress={handleNext}
                accessibilityRole="button"
                accessibilityLabel="次へ"
              >
                <Text style={s.nextBtnText}>はじめる</Text>
              </Pressable>
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
                <Text style={s.examDateNote}>
                  宅建試験は毎年10月第3日曜日
                </Text>
              </View>

              {/* Days until exam */}
              <View style={s.daysPreview}>
                <Text style={s.daysPreviewNum}>
                  {Math.max(
                    0,
                    Math.ceil(
                      (examDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
                    ),
                  )}
                </Text>
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

          {/* ── Step 3: Daily goal ── */}
          <View style={s.page}>
            <View style={s.pageContent}>
              <Text style={s.stepIcon}>🎯</Text>
              <Text style={s.pageTitle}>1日の目標を決めよう</Text>
              <Text style={s.pageSubtitle}>
                無理なく続けることが合格の鍵
              </Text>

              <View style={s.goalList}>
                {GOAL_PRESETS.map((preset) => (
                  <Pressable
                    key={preset.value}
                    style={[
                      s.goalCard,
                      selectedGoal === preset.value && s.goalCardActive,
                    ]}
                    onPress={() => setSelectedGoal(preset.value)}
                    accessibilityRole="button"
                    accessibilityLabel={`${preset.label} ${preset.desc}`}
                    accessibilityState={{ selected: selectedGoal === preset.value }}
                  >
                    <Text style={s.goalIcon}>{preset.icon}</Text>
                    <View style={s.goalInfo}>
                      <Text
                        style={[
                          s.goalLabel,
                          selectedGoal === preset.value && s.goalLabelActive,
                        ]}
                      >
                        {preset.label}
                      </Text>
                      <Text
                        style={[
                          s.goalDesc,
                          selectedGoal === preset.value && s.goalDescActive,
                        ]}
                      >
                        {preset.desc}
                      </Text>
                    </View>
                    <View
                      style={[
                        s.goalRadio,
                        selectedGoal === preset.value && s.goalRadioActive,
                      ]}
                    >
                      {selectedGoal === preset.value && (
                        <View style={s.goalRadioDot} />
                      )}
                    </View>
                  </Pressable>
                ))}
              </View>

              {selectedGoal === 20 && (
                <View style={s.recommendBadge}>
                  <Text style={s.recommendText}>
                    多くの合格者が選んでいるペースです
                  </Text>
                </View>
              )}
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

          {/* ── Step 4: Ready ── */}
          <View style={s.page}>
            <View style={s.pageContent}>
              <View style={s.readyVisual}>
                <Text style={s.readyEmoji}>🎉</Text>
              </View>
              <Text style={s.pageTitle}>準備完了！</Text>
              <Text style={s.pageSubtitle}>
                まずは1問解いてみましょう
              </Text>

              {/* Summary */}
              <View style={s.summaryCard}>
                <View style={s.summaryRow}>
                  <Text style={s.summaryIcon}>📅</Text>
                  <Text style={s.summaryLabel}>試験日</Text>
                  <Text style={s.summaryValue}>{examDateStr}</Text>
                </View>
                <View style={s.summaryDivider} />
                <View style={s.summaryRow}>
                  <Text style={s.summaryIcon}>🎯</Text>
                  <Text style={s.summaryLabel}>日目標</Text>
                  <Text style={s.summaryValue}>{selectedGoal}問/日</Text>
                </View>
              </View>
            </View>
            <View style={s.pageFooter}>
              <Pressable
                style={[s.nextBtn, s.startBtn]}
                onPress={handleComplete}
                accessibilityRole="button"
                accessibilityLabel="学習を始める"
              >
                <Text style={s.startBtnText}>学習を始める</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>

        {/* Page indicator dots */}
        <View style={s.dotsRow}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View
              key={i}
              style={[
                s.dot,
                i === currentStep ? s.dotActive : s.dotInactive,
              ]}
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

    // ─── Step 3: Daily goal ───
    goalList: {
      width: '100%',
      marginTop: 32,
      gap: 12,
    },
    goalCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.card,
      borderRadius: BorderRadius.xl,
      padding: Spacing.lg,
      borderWidth: 2,
      borderColor: C.border,
      ...Shadow.sm,
    },
    goalCardActive: {
      borderColor: C.primary,
      backgroundColor: C.primarySurface,
    },
    goalIcon: {
      fontSize: 28,
      marginRight: 14,
    },
    goalInfo: {
      flex: 1,
    },
    goalLabel: {
      fontSize: FontSize.callout,
      fontWeight: '700',
      color: C.text,
    },
    goalLabelActive: {
      color: C.primary,
    },
    goalDesc: {
      fontSize: FontSize.caption,
      fontWeight: '500',
      color: C.textSecondary,
      marginTop: 2,
    },
    goalDescActive: {
      color: C.primary,
    },
    goalRadio: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: C.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    goalRadioActive: {
      borderColor: C.primary,
    },
    goalRadioDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: C.primary,
    },
    recommendBadge: {
      marginTop: 16,
      backgroundColor: C.primarySurface,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: BorderRadius.full,
    },
    recommendText: {
      fontSize: FontSize.caption,
      fontWeight: '600',
      color: C.primary,
    },

    // ─── Step 4: Ready ───
    readyVisual: {
      marginBottom: Spacing.md,
    },
    readyEmoji: {
      fontSize: 80,
    },
    summaryCard: {
      width: '100%',
      marginTop: 32,
      backgroundColor: C.card,
      borderRadius: BorderRadius.xl,
      padding: Spacing.xl,
      ...Shadow.md,
    },
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    summaryIcon: {
      fontSize: 20,
      marginRight: 10,
    },
    summaryLabel: {
      fontSize: FontSize.subhead,
      fontWeight: '500',
      color: C.textSecondary,
      flex: 1,
    },
    summaryValue: {
      fontSize: FontSize.subhead,
      fontWeight: '700',
      color: C.text,
    },
    summaryDivider: {
      height: 1,
      backgroundColor: C.borderLight,
      marginVertical: 14,
    },
  });
}
