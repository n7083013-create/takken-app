// ============================================================
// 1分チャレンジ - 60秒で3問に挑戦するウルトラショートセッション
// ============================================================

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontSize, LineHeight, Spacing, BorderRadius, Shadow } from '../constants/theme';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';
import { useProgressStore } from '../store/useProgressStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useAchievementChecker } from '../hooks/useAchievementChecker';
import { useAnswerFeedback } from '../components/AnswerFeedback';
import { AIChatModal } from '../components/AIChatModal';
import { ALL_QUESTIONS, getQuestionById } from '../data';
import type { Question, Category } from '../types';

const TOTAL_QUESTIONS = 3;
const TIME_LIMIT_SEC = 60;
const CHOICE_LABELS = ['A', 'B', 'C', 'D'] as const;
const FEEDBACK_DELAY_MS = 1000;

type Phase = 'playing' | 'result';

interface AnswerRecord {
  questionId: string;
  selectedIndex: number;
  isCorrect: boolean;
}

export default function MicroChallengeScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const checkAchievement = useAchievementChecker();

  const { triggerCorrect, triggerWrong, FeedbackOverlay } = useAnswerFeedback();
  const isPro = useSettingsStore((st) => st.isPro());

  const recordAnswer = useProgressStore((st) => st.recordAnswer);
  const getInterleavedQuestions = useProgressStore((st) => st.getInterleavedQuestions);

  // Pick 3 questions
  const questions = useMemo<Question[]>(() => {
    const ids = getInterleavedQuestions(TOTAL_QUESTIONS);
    const resolved: Question[] = [];
    for (const id of ids) {
      const q = getQuestionById(id);
      if (q) resolved.push(q);
    }
    if (resolved.length >= TOTAL_QUESTIONS) return resolved.slice(0, TOTAL_QUESTIONS);

    // Fallback: random 3 from ALL_QUESTIONS
    const shuffled = [...ALL_QUESTIONS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, TOTAL_QUESTIONS);
  }, []);

  const [phase, setPhase] = useState<Phase>('playing');
  const [currentIdx, setCurrentIdx] = useState(0);
  const [remainingSec, setRemainingSec] = useState(TIME_LIMIT_SEC);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [aiVisible, setAiVisible] = useState(false);
  const [timerPaused, setTimerPaused] = useState(false);
  const pausedAtRef = useRef<number | null>(null);
  const startTimeRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Animated timer bar
  const timerAnim = useRef(new Animated.Value(1)).current;

  // Start countdown
  useEffect(() => {
    if (phase !== 'playing') return;

    if (!timerPaused) {
      // アニメーションは残り秒数に基づいて再開
      timerAnim.stopAnimation((currentValue) => {
        Animated.timing(timerAnim, {
          toValue: 0,
          duration: remainingSec * 1000,
          useNativeDriver: false,
        }).start();
      });

      timerRef.current = setInterval(() => {
        setRemainingSec((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, timerPaused]);

  // AI表示中はタイマー一時停止
  const openAI = useCallback(() => {
    setTimerPaused(true);
    timerAnim.stopAnimation();
    if (timerRef.current) clearInterval(timerRef.current);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    setAiVisible(true);
  }, [timerAnim]);

  const closeAI = useCallback(() => {
    setAiVisible(false);
    setTimerPaused(false);
    // フィードバック表示中なら次の問題へ進む
    if (showFeedback) {
      setShowFeedback(false);
      setSelectedIndex(null);
      if (currentIdx + 1 >= TOTAL_QUESTIONS) {
        if (timerRef.current) clearInterval(timerRef.current);
        timerAnim.stopAnimation();
        setPhase('result');
        checkAchievement();
      } else {
        setCurrentIdx((prev) => prev + 1);
      }
    }
  }, [showFeedback, currentIdx, timerAnim, checkAchievement]);

  // Time up check
  useEffect(() => {
    if (remainingSec <= 0 && phase === 'playing') {
      finishChallenge();
    }
  }, [remainingSec, phase]);

  const finishChallenge = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    timerAnim.stopAnimation();
    setPhase('result');
    checkAchievement();
  }, [checkAchievement, timerAnim]);

  const handleSelectAnswer = useCallback(
    (choiceIdx: number) => {
      if (showFeedback || phase !== 'playing') return;

      const q = questions[currentIdx];
      const isCorrect = choiceIdx === q.correctIndex;

      if (isCorrect) {
        triggerCorrect();
      } else {
        triggerWrong();
      }

      setSelectedIndex(choiceIdx);
      setShowFeedback(true);

      // Record to store
      recordAnswer(q.id, q.category, isCorrect);

      const newAnswer: AnswerRecord = {
        questionId: q.id,
        selectedIndex: choiceIdx,
        isCorrect,
      };
      const updated = [...answers, newAnswer];
      setAnswers(updated);

      // Auto-advance after feedback（AIを開かなかった場合）
      feedbackTimerRef.current = setTimeout(() => {
        if (aiVisible) return; // AI開いてたらスキップ
        setShowFeedback(false);
        setSelectedIndex(null);

        if (currentIdx + 1 >= TOTAL_QUESTIONS) {
          // All answered
          if (timerRef.current) clearInterval(timerRef.current);
          timerAnim.stopAnimation();
          setPhase('result');
          checkAchievement();
        } else {
          setCurrentIdx((prev) => prev + 1);
        }
      }, FEEDBACK_DELAY_MS + 500); // AI開く余裕を少し追加
    },
    [showFeedback, phase, currentIdx, questions, answers, recordAnswer, checkAchievement, timerAnim, aiVisible],
  );

  const handleRetry = useCallback(() => {
    // Reload the screen by replacing
    router.replace('/micro-challenge');
  }, [router]);

  const handleGoBack = useCallback(() => {
    router.back();
  }, [router]);

  // Result stats
  const correctCount = answers.filter((a) => a.isCorrect).length;
  const elapsedSec = Math.round((Date.now() - startTimeRef.current) / 1000);

  // Current question
  const currentQuestion = questions[currentIdx];

  if (phase === 'result') {
    return (
      <SafeAreaView style={s.safe}>
        <FeedbackOverlay />
        <View style={s.header}>
          <Pressable onPress={handleGoBack} style={s.backBtn} accessibilityRole="button" accessibilityLabel="戻る">
            <Text style={s.backText}>‹ 戻る</Text>
          </Pressable>
          <Text style={s.headerTitle}>⚡ 1分チャレンジ</Text>
          <View style={{ width: 60 }} />
        </View>

        <View style={s.resultContainer}>
          <Text style={s.resultEmoji}>
            {correctCount === TOTAL_QUESTIONS ? '🎉' : correctCount >= 2 ? '👏' : '💪'}
          </Text>
          <Text style={s.resultScore}>
            {correctCount}/{TOTAL_QUESTIONS}
          </Text>
          <Text style={s.resultLabel}>正解</Text>

          <View style={[s.resultCard, Shadow.sm]}>
            <View style={s.resultRow}>
              <Text style={s.resultItemLabel}>所要時間</Text>
              <Text style={s.resultItemValue}>
                {Math.min(elapsedSec, TIME_LIMIT_SEC)}秒
              </Text>
            </View>
            <View style={s.resultDivider} />
            <View style={s.resultRow}>
              <Text style={s.resultItemLabel}>正答率</Text>
              <Text style={s.resultItemValue}>
                {answers.length > 0
                  ? Math.round((correctCount / answers.length) * 100)
                  : 0}
                %
              </Text>
            </View>
          </View>

          {/* Answer details */}
          <View style={s.answersDetail}>
            {answers.map((a, idx) => {
              const q = getQuestionById(a.questionId);
              return (
                <View key={a.questionId} style={s.answerItem}>
                  <Text style={s.answerIcon}>
                    {a.isCorrect ? '✅' : '❌'}
                  </Text>
                  <Text style={s.answerText} numberOfLines={1}>
                    Q{idx + 1}. {q?.text ?? ''}
                  </Text>
                </View>
              );
            })}
          </View>

          <View style={s.resultButtons}>
            <Pressable
              style={[s.retryBtn, { backgroundColor: colors.primary }]}
              onPress={handleRetry}
              accessibilityRole="button"
              accessibilityLabel="もう1回チャレンジする"
            >
              <Text style={s.retryBtnText}>⚡ もう1回</Text>
            </Pressable>
            <Pressable style={s.goBackBtn} onPress={handleGoBack} accessibilityRole="button" accessibilityLabel="戻る">
              <Text style={s.goBackBtnText}>戻る</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <FeedbackOverlay />
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={handleGoBack} style={s.backBtn} accessibilityRole="button" accessibilityLabel="戻る">
          <Text style={s.backText}>‹ 戻る</Text>
        </Pressable>
        <Text style={s.headerTitle}>⚡ 1分チャレンジ</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Timer bar */}
      <View style={s.timerBarTrack}>
        <Animated.View
          style={[
            s.timerBarFill,
            {
              backgroundColor:
                remainingSec <= 10 ? colors.error : colors.primary,
              width: timerAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>

      {/* Timer + progress */}
      <View style={s.statusRow}>
        <Text
          style={[
            s.timerText,
            remainingSec <= 10 && { color: colors.error },
          ]}
        >
          {remainingSec}秒
        </Text>
        <View style={s.progressDots}>
          {Array.from({ length: TOTAL_QUESTIONS }).map((_, i) => (
            <View
              key={i}
              style={[
                s.dot,
                i < answers.length
                  ? answers[i].isCorrect
                    ? s.dotCorrect
                    : s.dotWrong
                  : i === currentIdx
                    ? s.dotCurrent
                    : s.dotPending,
              ]}
            />
          ))}
        </View>
        <Text style={s.questionCount}>
          {currentIdx + 1}/{TOTAL_QUESTIONS}
        </Text>
      </View>

      {/* Question */}
      <View style={s.questionArea}>
        <Text style={s.questionText} numberOfLines={6}>
          {currentQuestion.text}
        </Text>
      </View>

      {/* Choices */}
      <View style={s.choicesContainer}>
        {currentQuestion.choices.map((choice, idx) => {
          const isSelected = selectedIndex === idx;
          const isCorrectChoice = idx === currentQuestion.correctIndex;
          let choiceStyle = s.choiceDefault;
          let choiceTextStyle = s.choiceTextDefault;

          if (showFeedback) {
            if (isCorrectChoice) {
              choiceStyle = s.choiceCorrect;
              choiceTextStyle = s.choiceTextCorrect;
            } else if (isSelected && !isCorrectChoice) {
              choiceStyle = s.choiceWrong;
              choiceTextStyle = s.choiceTextWrong;
            }
          } else if (isSelected) {
            choiceStyle = s.choiceSelected;
          }

          return (
            <Pressable
              key={idx}
              style={[s.choiceBtn, choiceStyle]}
              onPress={() => handleSelectAnswer(idx)}
              disabled={showFeedback}
              accessibilityRole="button"
              accessibilityLabel={`選択肢${CHOICE_LABELS[idx]}: ${choice}`}
            >
              <Text style={[s.choiceLabel, showFeedback && isCorrectChoice && s.choiceLabelCorrect]}>
                {CHOICE_LABELS[idx]}
              </Text>
              <Text
                style={[s.choiceText, choiceTextStyle]}
                numberOfLines={2}
              >
                {choice}
              </Text>
            </Pressable>
          );
        })}

        {/* AI質問ボタン（フィードバック表示中のみ） */}
        {showFeedback && isPro && (
          <Pressable style={s.aiQuickBtn} onPress={openAI} accessibilityRole="button" accessibilityLabel="AIに質問する（タイマー停止）">
            <Text style={s.aiQuickIcon}>🤖</Text>
            <Text style={s.aiQuickText}>AIに聞く</Text>
            <Text style={s.aiQuickSub}>⏸ タイマー停止</Text>
          </Pressable>
        )}
      </View>

      {/* タイマー一時停止表示 */}
      {timerPaused && !aiVisible && (
        <View style={s.pausedBanner}>
          <Text style={s.pausedText}>⏸ 一時停止中</Text>
        </View>
      )}

      {/* AIチャットモーダル */}
      <AIChatModal
        visible={aiVisible}
        onClose={closeAI}
        questionText={currentQuestion.text}
        choices={currentQuestion.choices}
        correctIndex={currentQuestion.correctIndex}
        selectedIndex={selectedIndex}
        category={currentQuestion.category}
        explanation={currentQuestion.explanation}
        isCorrect={selectedIndex === currentQuestion.correctIndex}
      />
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
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
    headerTitle: {
      fontSize: FontSize.headline,
      fontWeight: '700',
      color: C.text,
    },

    // Timer bar
    timerBarTrack: {
      height: 4,
      backgroundColor: C.borderLight,
      overflow: 'hidden',
    },
    timerBarFill: {
      height: '100%',
    },

    // Status row
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm,
    },
    timerText: {
      fontSize: FontSize.title3,
      fontWeight: '800',
      color: C.primary,
      fontVariant: ['tabular-nums'],
      minWidth: 50,
    },
    progressDots: {
      flexDirection: 'row',
      gap: 8,
    },
    dot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    dotPending: {
      backgroundColor: C.borderLight,
    },
    dotCurrent: {
      backgroundColor: C.primary,
    },
    dotCorrect: {
      backgroundColor: C.success,
    },
    dotWrong: {
      backgroundColor: C.error,
    },
    questionCount: {
      fontSize: FontSize.footnote,
      fontWeight: '700',
      color: C.textSecondary,
      minWidth: 50,
      textAlign: 'right',
    },

    // Question
    questionArea: {
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.lg,
      minHeight: 100,
      justifyContent: 'center',
    },
    questionText: {
      fontSize: FontSize.body,
      fontWeight: '600',
      color: C.text,
      lineHeight: LineHeight.body,
    },

    // Choices
    choicesContainer: {
      flex: 1,
      paddingHorizontal: Spacing.lg,
      gap: Spacing.sm,
    },
    choiceBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.lg,
      borderRadius: BorderRadius.md,
      borderWidth: 1.5,
      borderColor: C.border,
      backgroundColor: C.card,
    },
    choiceDefault: {},
    choiceSelected: {
      borderColor: C.primary,
      backgroundColor: C.primarySurface,
    },
    choiceCorrect: {
      borderColor: C.success,
      backgroundColor: C.successSurface,
    },
    choiceWrong: {
      borderColor: C.error,
      backgroundColor: C.errorSurface,
    },
    choiceLabel: {
      fontSize: FontSize.footnote,
      fontWeight: '800',
      color: C.textTertiary,
      width: 24,
    },
    choiceLabelCorrect: {
      color: C.success,
    },
    choiceText: {
      flex: 1,
      fontSize: FontSize.subhead,
      color: C.text,
      lineHeight: LineHeight.subhead,
    },
    choiceTextDefault: {},
    choiceTextCorrect: {
      color: C.success,
      fontWeight: '600',
    },
    choiceTextWrong: {
      color: C.error,
    },

    // Result screen
    resultContainer: {
      flex: 1,
      alignItems: 'center',
      paddingHorizontal: Spacing.xl,
      paddingTop: 32,
    },
    resultEmoji: {
      fontSize: 56,
    },
    resultScore: {
      fontSize: 48,
      fontWeight: '900',
      color: C.text,
      marginTop: Spacing.md,
    },
    resultLabel: {
      fontSize: FontSize.headline,
      fontWeight: '600',
      color: C.textSecondary,
      marginTop: 4,
    },
    resultCard: {
      width: '100%',
      backgroundColor: C.card,
      borderRadius: BorderRadius.xl,
      padding: Spacing.lg,
      marginTop: Spacing.xxl,
    },
    resultRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: Spacing.sm,
    },
    resultDivider: {
      height: 0.5,
      backgroundColor: C.borderLight,
    },
    resultItemLabel: {
      fontSize: FontSize.subhead,
      color: C.textSecondary,
      fontWeight: '500',
    },
    resultItemValue: {
      fontSize: FontSize.subhead,
      fontWeight: '700',
      color: C.text,
    },
    answersDetail: {
      width: '100%',
      marginTop: Spacing.lg,
      gap: Spacing.sm,
    },
    answerItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    answerIcon: {
      fontSize: 16,
    },
    answerText: {
      flex: 1,
      fontSize: FontSize.footnote,
      color: C.textSecondary,
    },
    resultButtons: {
      marginTop: Spacing.xxxl,
      width: '100%',
      alignItems: 'center',
      gap: Spacing.md,
    },
    retryBtn: {
      width: '100%',
      paddingVertical: 16,
      borderRadius: BorderRadius.full,
      alignItems: 'center',
    },
    retryBtnText: {
      fontSize: FontSize.headline,
      fontWeight: '700',
      color: C.white,
    },
    goBackBtn: {
      paddingVertical: Spacing.sm,
    },
    goBackBtnText: {
      fontSize: FontSize.subhead,
      fontWeight: '600',
      color: C.textTertiary,
    },

    // AI Quick Button
    aiQuickBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginHorizontal: Spacing.lg,
      marginTop: Spacing.sm,
      paddingVertical: 12,
      backgroundColor: C.primarySurface,
      borderRadius: BorderRadius.lg,
      borderWidth: 1.5,
      borderColor: C.primary + '40',
    },
    aiQuickIcon: { fontSize: 18 },
    aiQuickText: { fontSize: FontSize.subhead, fontWeight: '700', color: C.primary },
    aiQuickSub: { fontSize: FontSize.caption2, color: C.textTertiary, fontWeight: '500' },

    // Timer Paused Banner
    pausedBanner: {
      position: 'absolute',
      top: '50%',
      alignSelf: 'center',
      backgroundColor: 'rgba(0,0,0,0.7)',
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: BorderRadius.full,
    },
    pausedText: { fontSize: FontSize.headline, fontWeight: '700', color: '#fff' },
  });
}
