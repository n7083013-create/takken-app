import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { FontSize, LineHeight, Spacing, BorderRadius, Shadow } from '../constants/theme';
import { useThemeColors, ThemeColors } from '../hooks/useThemeColors';
import { useProgressStore } from '../store/useProgressStore';
import { CATEGORY_LABELS, CATEGORY_COLORS, type Category, type ConfidenceLevel } from '../types';
import { getQuestionById } from '../data';
import { useAchievementChecker } from '../hooks/useAchievementChecker';

const LABELS = ['A', 'B', 'C', 'D'] as const;
const QUESTION_COUNT = 5;

/** Fisher-Yates shuffle */
function shuffleIndices(length: number): number[] {
  const arr = Array.from({ length }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

interface AnswerRecord {
  questionId: string;
  isCorrect: boolean;
  confidence: ConfidenceLevel;
  category: Category;
}

export default function PreSleepReviewScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const recordAnswer = useProgressStore((st) => st.recordAnswer);
  const checkAchievements = useAchievementChecker();

  // Load questions on mount
  const [questionIds, setQuestionIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [confidence, setConfidence] = useState<ConfidenceLevel | null>(null);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [shuffledMap, setShuffledMap] = useState<number[]>([0, 1, 2, 3]);
  const [showSummary, setShowSummary] = useState(false);
  const explainAnim = useRef(new Animated.Value(0));
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    let ids = useProgressStore.getState().getPreSleepReview(QUESTION_COUNT);
    if (ids.length === 0) {
      ids = useProgressStore.getState().getDueForReview().slice(0, QUESTION_COUNT);
    }
    setQuestionIds(ids);
    if (ids.length > 0) {
      const q = getQuestionById(ids[0]);
      if (q) {
        const isSpecial = q.questionFormat === 'count' || q.questionFormat === 'combination';
        setShuffledMap(isSpecial ? [0, 1, 2, 3] : shuffleIndices(q.choices.length));
      }
    }
  }, []);

  const currentQuestion = questionIds.length > 0 ? getQuestionById(questionIds[currentIndex]) : undefined;

  const handleSelect = useCallback((origIdx: number) => {
    if (answered || !currentQuestion) return;
    setSelected(origIdx);
    setAnswered(true);
    Animated.timing(explainAnim.current, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [answered, currentQuestion]);

  const handleConfidence = useCallback((conf: ConfidenceLevel) => {
    if (!currentQuestion || selected === null) return;
    setConfidence(conf);
    const isCorrect = selected === currentQuestion.correctIndex;
    recordAnswer(currentQuestion.id, currentQuestion.category, isCorrect, conf);
    setTimeout(() => checkAchievements(), 0);
    setAnswers((prev) => [
      ...prev,
      {
        questionId: currentQuestion.id,
        isCorrect,
        confidence: conf,
        category: currentQuestion.category,
      },
    ]);
  }, [currentQuestion, selected, recordAnswer, checkAchievements]);

  const handleNext = useCallback(() => {
    const nextIdx = currentIndex + 1;
    if (nextIdx >= questionIds.length) {
      setShowSummary(true);
      return;
    }
    setCurrentIndex(nextIdx);
    setSelected(null);
    setAnswered(false);
    setConfidence(null);
    explainAnim.current = new Animated.Value(0);
    const q = getQuestionById(questionIds[nextIdx]);
    if (q) {
      const isSpecial = q.questionFormat === 'count' || q.questionFormat === 'combination';
      setShuffledMap(isSpecial ? [0, 1, 2, 3] : shuffleIndices(q.choices.length));
    }
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [currentIndex, questionIds]);

  const handleGoHome = useCallback(() => {
    if (router.canDismiss()) {
      router.dismissAll();
    }
    router.push('/');
  }, [router]);

  // ─── Empty State ───
  if (questionIds.length === 0) {
    return (
      <SafeAreaView style={s.safe}>
        <Stack.Screen options={{ title: '就寝前復習', headerBackTitle: '戻る' }} />
        <View style={s.emptyContainer}>
          <Text style={s.emptyEmoji}>🌙</Text>
          <Text style={s.emptyTitle}>復習する問題がありません</Text>
          <Text style={s.emptyDesc}>問題を解いてから復習しましょう</Text>
          <Pressable style={[s.homeBtn, Shadow.md]} onPress={handleGoHome} accessibilityRole="button" accessibilityLabel="ホームに戻る">
            <Text style={s.homeBtnText}>ホームに戻る</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Summary ───
  if (showSummary) {
    const correctCount = answers.filter((a) => a.isCorrect).length;
    const lowConfidenceQs = answers.filter((a) => a.confidence === 'low');
    return (
      <SafeAreaView style={s.safe}>
        <Stack.Screen options={{ title: '就寝前復習', headerShown: false }} />
        <ScrollView contentContainerStyle={s.summaryScroll}>
          <Text style={s.summaryMoon}>🌙</Text>
          <Text style={s.summaryTitle}>就寝前復習 完了</Text>
          <View style={[s.scoreCard, Shadow.md]}>
            <Text style={s.scoreLabel}>スコア</Text>
            <Text style={s.scoreValue}>
              {correctCount} / {answers.length}
            </Text>
            <Text style={s.scorePercent}>
              {Math.round((correctCount / answers.length) * 100)}%
            </Text>
          </View>

          {lowConfidenceQs.length > 0 && (
            <View style={[s.lowConfCard, Shadow.sm]}>
              <Text style={s.lowConfTitle}>難しいと感じた問題</Text>
              {lowConfidenceQs.map((a) => {
                const q = getQuestionById(a.questionId);
                return (
                  <View key={a.questionId} style={s.lowConfRow}>
                    <View style={[s.lowConfDot, { backgroundColor: CATEGORY_COLORS[a.category] }]} />
                    <Text style={s.lowConfText} numberOfLines={1}>
                      {q ? q.text : a.questionId}
                    </Text>
                    <Text style={s.lowConfResult}>{a.isCorrect ? '○' : '✗'}</Text>
                  </View>
                );
              })}
            </View>
          )}

          <Text style={s.calmMessage}>
            お疲れさまでした。ぐっすり眠って記憶を定着させましょう 🌙
          </Text>

          <Pressable style={[s.homeBtn, Shadow.md]} onPress={handleGoHome} accessibilityRole="button" accessibilityLabel="ホームに戻る">
            <Text style={s.homeBtnText}>ホームに戻る</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── Question View ───
  const q = currentQuestion!;
  const catColor = CATEGORY_COLORS[q.category];
  const isCorrect = selected === q.correctIndex;

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen options={{ title: '就寝前復習', headerShown: false }} />
      <ScrollView ref={scrollRef} contentContainerStyle={s.scroll}>
        {/* Header */}
        <View style={s.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="戻る">
            <Text style={s.backArrow}>←</Text>
          </Pressable>
          <View style={s.headerCenter}>
            <Text style={s.headerTitle}>🌙 就寝前復習</Text>
            <Text style={s.headerSubtitle}>
              睡眠中の記憶固定を最大化する{QUESTION_COUNT}問
            </Text>
          </View>
          <View style={{ width: 32 }} />
        </View>

        {/* Progress */}
        <View style={s.progressRow}>
          <Text style={s.progressText}>
            問 {currentIndex + 1} / {questionIds.length}
          </Text>
          <View style={s.progressBarBg}>
            <View
              style={[
                s.progressBarFill,
                { width: `${((currentIndex + (answered ? 1 : 0)) / questionIds.length) * 100}%` },
              ]}
            />
          </View>
        </View>

        {/* Category pill */}
        <View style={s.metaRow}>
          <View style={[s.metaPill, { backgroundColor: catColor + '14' }]}>
            <Text style={[s.metaPillText, { color: catColor }]}>
              {CATEGORY_LABELS[q.category]}
            </Text>
          </View>
        </View>

        {/* Question */}
        <View style={[s.questionBox, Shadow.sm]}>
          <Text style={s.questionText}>{q.text}</Text>
        </View>

        {/* Choices */}
        <View style={s.choiceList}>
          {shuffledMap.map((origIdx, displayIdx) => {
            const choice = q.choices[origIdx];
            const isCorrectChoice = origIdx === q.correctIndex;
            const isSelected = origIdx === selected;

            const isCorrectAnswer = answered && isCorrectChoice;
            const isWrongAnswer = answered && isSelected && !isCorrectChoice;
            const cardExtra = isCorrectAnswer
              ? { borderColor: colors.success, backgroundColor: colors.successSurface }
              : isWrongAnswer
                ? { borderColor: colors.error, backgroundColor: colors.errorSurface }
                : { borderColor: answered ? colors.border : 'transparent' };
            const labelBg = isCorrectAnswer
              ? colors.success
              : isWrongAnswer
                ? colors.error
                : colors.borderLight;
            const labelColor = isCorrectAnswer || isWrongAnswer ? colors.white : colors.textSecondary;

            return (
              <Pressable
                key={origIdx}
                style={[s.choiceCard, cardExtra, Shadow.sm]}
                onPress={() => handleSelect(origIdx)}
                disabled={answered}
                accessibilityRole="button"
                accessibilityLabel={`選択肢${LABELS[displayIdx]}: ${choice}`}
              >
                <View style={[s.choiceLabel, { backgroundColor: labelBg }]}>
                  <Text style={[s.choiceLabelText, { color: labelColor }]}>
                    {LABELS[displayIdx]}
                  </Text>
                </View>
                <Text style={s.choiceText}>{choice}</Text>
                {answered && isCorrectChoice && <Text style={s.checkMark}>✓</Text>}
                {isWrongAnswer && <Text style={s.crossMark}>✗</Text>}
              </Pressable>
            );
          })}
        </View>

        {/* Explanation + Confidence */}
        {answered && (
          <Animated.View
            style={[
              s.explainCard,
              Shadow.lg,
              {
                opacity: explainAnim.current,
                transform: [
                  {
                    translateY: explainAnim.current.interpolate({
                      inputRange: [0, 1],
                      outputRange: [20, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={s.explainHeader}>
              <View
                style={[
                  s.explainBadge,
                  { backgroundColor: isCorrect ? colors.successSurface : colors.errorSurface },
                ]}
              >
                <Text style={s.explainBadgeIcon}>{isCorrect ? '⭕' : '❌'}</Text>
                <Text
                  style={[
                    s.explainBadgeText,
                    { color: isCorrect ? colors.success : colors.error },
                  ]}
                >
                  {isCorrect ? '正解！' : '不正解'}
                </Text>
              </View>
            </View>

            <Text style={s.explainLabel}>解説</Text>
            <Text style={s.explainText}>{q.explanation}</Text>

            {/* Difficulty Selector（選択で次へ進む） */}
            {!confidence && (
              <View style={s.confidenceSection}>
                <View style={s.confidenceRow}>
                  <Pressable
                    style={[s.confidenceBtn, s.confidenceNone]}
                    onPress={() => handleConfidence('none')}
                    accessibilityRole="button"
                    accessibilityLabel="難しいと評価"
                  >
                    <Text style={s.confidenceNoneText}>難しい</Text>
                  </Pressable>
                  <Pressable
                    style={[s.confidenceBtn, s.confidenceDefault]}
                    onPress={() => handleConfidence('low')}
                    accessibilityRole="button"
                    accessibilityLabel="普通と評価"
                  >
                    <Text style={s.confidenceDefaultText}>普通 →</Text>
                  </Pressable>
                  <Pressable
                    style={[s.confidenceBtn, s.confidenceHigh]}
                    onPress={() => handleConfidence('high')}
                    accessibilityRole="button"
                    accessibilityLabel="簡単と評価"
                  >
                    <Text style={s.confidenceHighText}>簡単</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Show "次へ" only after confidence selected */}
            {confidence && (
              <Pressable style={[s.nextBtn, Shadow.md]} onPress={handleNext} accessibilityRole="button" accessibilityLabel={currentIndex + 1 >= questionIds.length ? '結果を見る' : '次の問題へ'}>
                <Text style={s.nextBtnText}>
                  {currentIndex + 1 >= questionIds.length ? '結果を見る' : '次へ'}
                </Text>
                <Text style={s.nextBtnArrow}>→</Text>
              </Pressable>
            )}
          </Animated.View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───
function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.card },
    scroll: { padding: Spacing.xl },

    // ─── Empty State ───
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: Spacing.xxl,
    },
    emptyEmoji: { fontSize: 48, marginBottom: Spacing.lg },
    emptyTitle: {
      fontSize: FontSize.headline,
      fontWeight: '800',
      color: C.text,
      marginBottom: Spacing.sm,
    },
    emptyDesc: {
      fontSize: FontSize.subhead,
      color: C.textSecondary,
      marginBottom: Spacing.xxl,
    },

    // ─── Header ───
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: Spacing.lg,
    },
    backArrow: {
      fontSize: FontSize.title2,
      color: C.text,
      paddingRight: Spacing.sm,
    },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: {
      fontSize: FontSize.title3,
      fontWeight: '800',
      color: C.text,
    },
    headerSubtitle: {
      fontSize: FontSize.caption,
      color: C.textTertiary,
      marginTop: 2,
    },

    // ─── Progress ───
    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: Spacing.lg,
      gap: Spacing.sm,
    },
    progressText: {
      fontSize: FontSize.footnote,
      fontWeight: '700',
      color: C.textSecondary,
      minWidth: 55,
    },
    progressBarBg: {
      flex: 1,
      height: 6,
      backgroundColor: C.borderLight,
      borderRadius: BorderRadius.full,
      overflow: 'hidden',
    },
    progressBarFill: {
      height: '100%',
      backgroundColor: C.primary,
      borderRadius: BorderRadius.full,
    },

    // ─── Meta ───
    metaRow: { flexDirection: 'row', gap: 8, marginBottom: Spacing.lg },
    metaPill: {
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: BorderRadius.sm,
    },
    metaPillText: { fontSize: FontSize.footnote, fontWeight: '700' },

    // ─── Question ───
    questionBox: {
      backgroundColor: C.background,
      borderRadius: BorderRadius.xl,
      padding: Spacing.xxl,
      marginBottom: Spacing.xl,
      borderLeftWidth: 4,
      borderLeftColor: C.primary,
    },
    questionText: {
      fontSize: FontSize.callout,
      fontWeight: '600',
      color: C.text,
      lineHeight: LineHeight.callout,
    },

    // ─── Choices ───
    choiceList: { gap: 4 },
    choiceCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.background,
      borderRadius: BorderRadius.lg,
      padding: Spacing.lg,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    choiceLabel: {
      width: 34,
      height: 34,
      borderRadius: BorderRadius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    choiceLabelText: { fontSize: FontSize.subhead, fontWeight: '800' },
    choiceText: {
      flex: 1,
      fontSize: FontSize.subhead,
      color: C.text,
      lineHeight: LineHeight.subhead,
    },
    checkMark: { fontSize: 20, color: C.success, fontWeight: '800', marginLeft: 8 },
    crossMark: { fontSize: 20, color: C.error, fontWeight: '800', marginLeft: 8 },

    // ─── Explanation ───
    explainCard: {
      marginTop: Spacing.xxl,
      backgroundColor: C.background,
      borderRadius: BorderRadius.xl,
      padding: Spacing.xxl,
    },
    explainHeader: { marginBottom: 14 },
    explainBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: BorderRadius.md,
      gap: 6,
    },
    explainBadgeIcon: { fontSize: 18 },
    explainBadgeText: { fontSize: FontSize.body, fontWeight: '800' },
    explainLabel: {
      fontSize: FontSize.footnote,
      fontWeight: '700',
      color: C.textTertiary,
      marginBottom: 6,
    },
    explainText: {
      fontSize: FontSize.subhead,
      color: C.textSecondary,
      lineHeight: LineHeight.body,
    },

    // ─── Difficulty Selector ───
    confidenceSection: {
      marginTop: Spacing.xl,
      paddingTop: Spacing.lg,
      borderTopWidth: 1,
      borderTopColor: C.border,
    },
    confidenceRow: {
      flexDirection: 'row',
      gap: 8,
    },
    confidenceBtn: {
      paddingVertical: 14,
      borderRadius: BorderRadius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
    },
    confidenceNone: {
      flex: 0.8,
      backgroundColor: C.errorSurface,
      borderColor: C.error + '60',
    },
    confidenceNoneText: { fontSize: FontSize.footnote, fontWeight: '700', color: C.error },
    confidenceDefault: {
      flex: 1.4,
      backgroundColor: C.primary,
      borderColor: C.primary,
    },
    confidenceDefaultText: { fontSize: FontSize.body, fontWeight: '800', color: C.white },
    confidenceHigh: {
      flex: 0.8,
      backgroundColor: C.successSurface,
      borderColor: C.success + '60',
    },
    confidenceHighText: { fontSize: FontSize.footnote, fontWeight: '700', color: C.success },

    // ─── Next Button ───
    nextBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: Spacing.xl,
      backgroundColor: C.primary,
      paddingVertical: Spacing.lg,
      borderRadius: BorderRadius.lg,
      gap: 8,
    },
    nextBtnText: { fontSize: FontSize.body, fontWeight: '700', color: C.white },
    nextBtnArrow: { fontSize: FontSize.headline, fontWeight: '700', color: C.white },

    // ─── Home Button ───
    homeBtn: {
      alignSelf: 'center',
      backgroundColor: C.primary,
      paddingHorizontal: 32,
      paddingVertical: 14,
      borderRadius: BorderRadius.lg,
      marginTop: Spacing.xxl,
    },
    homeBtnText: { fontSize: FontSize.body, fontWeight: '700', color: C.white },

    // ─── Summary ───
    summaryScroll: {
      padding: Spacing.xxl,
      alignItems: 'center',
      paddingTop: Spacing.xxxxl,
    },
    summaryMoon: { fontSize: 56, marginBottom: Spacing.lg },
    summaryTitle: {
      fontSize: FontSize.title1,
      fontWeight: '800',
      color: C.text,
      marginBottom: Spacing.xxl,
    },
    scoreCard: {
      backgroundColor: C.background,
      borderRadius: BorderRadius.xl,
      padding: Spacing.xxl,
      alignItems: 'center',
      width: '100%',
      marginBottom: Spacing.xl,
    },
    scoreLabel: {
      fontSize: FontSize.footnote,
      fontWeight: '700',
      color: C.textTertiary,
      marginBottom: Spacing.xs,
    },
    scoreValue: {
      fontSize: FontSize.largeTitle,
      fontWeight: '800',
      color: C.primary,
    },
    scorePercent: {
      fontSize: FontSize.headline,
      fontWeight: '700',
      color: C.textSecondary,
      marginTop: Spacing.xs,
    },

    lowConfCard: {
      backgroundColor: C.warningSurface,
      borderRadius: BorderRadius.lg,
      padding: Spacing.lg,
      width: '100%',
      marginBottom: Spacing.xl,
    },
    lowConfTitle: {
      fontSize: FontSize.subhead,
      fontWeight: '700',
      color: C.text,
      marginBottom: Spacing.md,
    },
    lowConfRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      gap: Spacing.sm,
    },
    lowConfDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    lowConfText: {
      flex: 1,
      fontSize: FontSize.footnote,
      color: C.textSecondary,
    },
    lowConfResult: {
      fontSize: FontSize.subhead,
      fontWeight: '800',
      color: C.textSecondary,
    },

    calmMessage: {
      fontSize: FontSize.subhead,
      color: C.textSecondary,
      textAlign: 'center',
      lineHeight: LineHeight.body,
      marginTop: Spacing.lg,
      paddingHorizontal: Spacing.lg,
    },
  });
}
