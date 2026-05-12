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
  ScrollView,
  Modal,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontSize, LineHeight, Spacing, BorderRadius, Shadow } from '../constants/theme';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';
import { useProgressStore } from '../store/useProgressStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useAchievementChecker } from '../hooks/useAchievementChecker';
import { useAnswerFeedback } from '../components/AnswerFeedback';
import { AIChatModal } from '../components/AIChatModal';
import { ALL_QUESTIONS, getQuestionById } from '../data';
import { WebBackButton } from '../components/WebBackButton';
import type { Question, Category } from '../types';

const TOTAL_QUESTIONS = 3;
const TIME_LIMIT_SEC = 60;
const CHOICE_LABELS = ['A', 'B', 'C', 'D'] as const;
const FEEDBACK_DELAY_MS = 1000;

/** Fisher-Yates シャッフル（選択肢位置の暗記化防止） */
function shuffleIndices(length: number): number[] {
  const arr = Array.from({ length }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

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
  // [UX] 選択肢の位置暗記を防ぐため、問題ごとにシャッフルマップを保持
  // shuffledMap[displayIdx] = originalIdx
  const [shuffledMap, setShuffledMap] = useState<number[]>([0, 1, 2, 3]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [aiVisible, setAiVisible] = useState(false);
  const [timerPaused, setTimerPaused] = useState(false);
  // [機能追加] 結果画面で問題タップ時に表示する詳細モーダル用の state
  const [reviewQuestion, setReviewQuestion] = useState<{ q: Question; answer: AnswerRecord } | null>(null);
  // [機能追加] 結果画面の AI チャットモーダル (Premium 機能)
  const [reviewAiVisible, setReviewAiVisible] = useState(false);
  const pausedAtRef = useRef<number | null>(null);
  const startTimeRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Animated timer bar
  const timerAnim = useRef(new Animated.Value(1)).current;

  // [UX] 問題が変わるたびに選択肢をシャッフル (位置暗記化防止)
  // 個数問題・組み合わせ問題は除外 (ア・イ・ウ・エの順序が論理的に固定)
  useEffect(() => {
    const q = questions[currentIdx];
    if (!q) return;
    const isSpecial = q.questionFormat === 'count' || q.questionFormat === 'combination';
    setShuffledMap(isSpecial ? [0, 1, 2, 3] : shuffleIndices(q.choices.length));
  }, [currentIdx, questions]);

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
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [router]);

  // Result stats
  const correctCount = answers.filter((a) => a.isCorrect).length;
  const elapsedSec = Math.round((Date.now() - startTimeRef.current) / 1000);

  // Current question
  const currentQuestion = questions[currentIdx];

  if (phase === 'result') {
    return (
      <SafeAreaView style={s.safe}>
        <Stack.Screen options={{ headerShown: false }} />
        <FeedbackOverlay />
        <View style={s.header}>
          <Pressable onPress={handleGoBack} style={s.backBtn} accessibilityRole="button" accessibilityLabel="戻る">
            <Text style={s.backText}>‹ 戻る</Text>
          </Pressable>
          <Text style={s.headerTitle}>⚡ 1分チャレンジ</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView
          contentContainerStyle={s.resultScrollContent}
          showsVerticalScrollIndicator={false}
        >
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

          {/* [機能追加] Answer details - 各問題をタップで解説モーダル表示 */}
          <Text style={s.answersDetailHeader}>タップで解説を見る</Text>
          <View style={s.answersDetail}>
            {answers.map((a, idx) => {
              const q = getQuestionById(a.questionId);
              if (!q) return null;
              return (
                <Pressable
                  key={a.questionId}
                  style={[s.answerItem, Shadow.sm]}
                  onPress={() => setReviewQuestion({ q, answer: a })}
                  accessibilityRole="button"
                  accessibilityLabel={`問題${idx + 1}の${a.isCorrect ? '正解' : '不正解'}の解説を見る`}
                >
                  <Text style={s.answerIcon}>
                    {a.isCorrect ? '✅' : '❌'}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.answerText}>
                      Q{idx + 1}. {q.text}
                    </Text>
                  </View>
                  <Text style={s.answerArrow}>›</Text>
                </Pressable>
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
        </ScrollView>

        {/* [機能追加] 問題詳細・解説モーダル */}
        <Modal
          visible={reviewQuestion !== null}
          animationType="slide"
          onRequestClose={() => setReviewQuestion(null)}
          transparent={false}
        >
          {reviewQuestion && (
            <SafeAreaView style={s.safe}>
              <View style={s.header}>
                <Pressable
                  onPress={() => setReviewQuestion(null)}
                  style={s.backBtn}
                  accessibilityRole="button"
                  accessibilityLabel="閉じる"
                >
                  <Text style={s.backText}>‹ 閉じる</Text>
                </Pressable>
                <Text style={s.headerTitle}>
                  {reviewQuestion.answer.isCorrect ? '✅ 正解' : '❌ 不正解'}
                </Text>
                <View style={{ width: 60 }} />
              </View>
              <ScrollView contentContainerStyle={s.reviewScroll}>
                {/* 問題文 */}
                <Text style={s.reviewQuestionText}>{reviewQuestion.q.text}</Text>

                {/* statements (個数・組み合わせ問題) */}
                {reviewQuestion.q.statements && reviewQuestion.q.statements.length > 0 && (
                  <View style={s.statementsBox}>
                    {reviewQuestion.q.statements.map((stmt, si) => (
                      <View key={si} style={s.statementRow}>
                        <Text style={s.statementLabel}>{['ア', 'イ', 'ウ', 'エ'][si]}</Text>
                        <Text style={s.statementText}>{stmt}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* 選択肢 */}
                {reviewQuestion.q.choices.map((c, i) => {
                  const isUserSelection = i === reviewQuestion.answer.selectedIndex;
                  const isCorrectChoice = i === reviewQuestion.q.correctIndex;
                  return (
                    <View
                      key={i}
                      style={[
                        s.reviewChoice,
                        isCorrectChoice && s.reviewChoiceCorrect,
                        isUserSelection && !isCorrectChoice && s.reviewChoiceWrong,
                      ]}
                    >
                      <Text style={s.reviewChoiceLabel}>{i + 1}</Text>
                      <Text style={s.reviewChoiceText}>{c}</Text>
                      {isCorrectChoice && <Text style={s.reviewBadge}>正解</Text>}
                      {isUserSelection && !isCorrectChoice && <Text style={s.reviewBadgeWrong}>あなたの選択</Text>}
                    </View>
                  );
                })}

                {/* 解説 */}
                {reviewQuestion.q.explanation && (
                  <View style={s.explanationBox}>
                    <Text style={s.explanationHeader}>💡 解説</Text>
                    <Text style={s.explanationText}>{reviewQuestion.q.explanation}</Text>
                  </View>
                )}

                {/* AI に聞くボタン (Premium) */}
                {isPro && (
                  <Pressable
                    style={s.aiAskBtn}
                    onPress={() => setReviewAiVisible(true)}
                    accessibilityRole="button"
                    accessibilityLabel="AIに質問する"
                  >
                    <Text style={s.aiAskBtnText}>🤖 さらにAIに聞く</Text>
                  </Pressable>
                )}
              </ScrollView>
              {/* 解説モーダル内の AIChatModal */}
              <AIChatModal
                visible={reviewAiVisible}
                onClose={() => setReviewAiVisible(false)}
                questionText={reviewQuestion.q.text}
                choices={reviewQuestion.q.choices}
                correctIndex={reviewQuestion.q.correctIndex}
                selectedIndex={reviewQuestion.answer.selectedIndex}
                category={reviewQuestion.q.category}
                explanation={reviewQuestion.q.explanation}
                isCorrect={reviewQuestion.answer.isCorrect}
              />
            </SafeAreaView>
          )}
        </Modal>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen options={{ headerShown: false }} />
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

      {/* 本文エリア（タイマー/ヘッダーは上に固定。長文時は問題文＋選択肢ごと自然スクロール） */}
      <ScrollView
        style={s.bodyScroll}
        contentContainerStyle={s.bodyScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Question */}
        <View style={s.questionArea}>
          <Text style={s.questionText}>{currentQuestion.text}</Text>
        </View>

        {/* [Bugfix] 個数問題・組み合わせ問題の ア〜エ の本文 (statements) を表示
            これがないと「ア〜エの記述のうち正しいものはいくつあるか」が読めない */}
        {currentQuestion.statements && currentQuestion.statements.length > 0 && (
          <View style={s.statementsBox}>
            {currentQuestion.statements.map((stmt, si) => (
              <View key={si} style={s.statementRow}>
                <Text style={s.statementLabel}>{['ア', 'イ', 'ウ', 'エ'][si]}</Text>
                <Text style={s.statementText}>{stmt}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Choices */}
        <View style={s.choicesContainer}>
        {shuffledMap.map((origIdx, displayIdx) => {
          const choice = currentQuestion.choices[origIdx];
          const isSelected = selectedIndex === origIdx;
          const isCorrectChoice = origIdx === currentQuestion.correctIndex;
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
              key={origIdx}
              style={[s.choiceBtn, choiceStyle]}
              onPress={() => handleSelectAnswer(origIdx)}
              disabled={showFeedback}
              accessibilityRole="button"
              accessibilityLabel={`選択肢${CHOICE_LABELS[displayIdx]}: ${choice}`}
            >
              <Text style={[s.choiceLabel, showFeedback && isCorrectChoice && s.choiceLabelCorrect]}>
                {CHOICE_LABELS[displayIdx]}
              </Text>
              <Text
                style={[s.choiceText, choiceTextStyle]}
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
      </ScrollView>

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

    // 本文スクロール（ヘッダー/タイマーは固定）
    bodyScroll: {
      flex: 1,
    },
    bodyScrollContent: {
      paddingBottom: Spacing.xl,
    },

    // Question
    questionArea: {
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.lg,
      minHeight: 100,
    },
    questionText: {
      fontSize: FontSize.body,
      fontWeight: '600',
      color: C.text,
      lineHeight: LineHeight.body,
    },

    // [Bugfix] Statements (個数問題・組み合わせ問題の ア〜エ 本文)
    statementsBox: {
      marginHorizontal: Spacing.lg,
      marginBottom: Spacing.md,
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      gap: Spacing.sm,
      borderWidth: 1,
      borderColor: C.borderLight,
    },
    statementRow: {
      flexDirection: 'row',
      paddingVertical: 4,
    },
    statementLabel: {
      fontSize: FontSize.subhead,
      fontWeight: '800',
      color: C.primary,
      width: 28,
    },
    statementText: {
      flex: 1,
      fontSize: FontSize.subhead,
      color: C.text,
      lineHeight: LineHeight.subhead,
    },

    // Choices
    choicesContainer: {
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
    // [機能追加] 結果画面: スクロール対応 + タップ可能アイテム
    resultScrollContent: {
      paddingBottom: Spacing.xxxl,
    },
    answersDetailHeader: {
      width: '100%',
      marginTop: Spacing.xl,
      marginBottom: Spacing.sm,
      fontSize: FontSize.footnote,
      color: C.textTertiary,
      textAlign: 'center',
      fontWeight: '600',
    },
    answersDetail: {
      width: '100%',
      gap: Spacing.sm,
    },
    answerItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      backgroundColor: C.card,
      borderRadius: BorderRadius.md,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.md,
    },
    answerIcon: {
      fontSize: 20,
    },
    answerText: {
      fontSize: FontSize.subhead,
      color: C.text,
      lineHeight: LineHeight.subhead,
    },
    answerArrow: {
      fontSize: 24,
      color: C.textTertiary,
      fontWeight: '300',
    },

    // [機能追加] 解説モーダル用スタイル
    reviewScroll: {
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.lg,
      paddingBottom: Spacing.xxxl,
    },
    reviewQuestionText: {
      fontSize: FontSize.body,
      lineHeight: LineHeight.body,
      color: C.text,
      marginBottom: Spacing.lg,
      fontWeight: '600',
    },
    reviewChoice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      backgroundColor: C.card,
      borderRadius: BorderRadius.md,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.lg,
      marginBottom: Spacing.sm,
      borderWidth: 2,
      borderColor: C.border,
    },
    reviewChoiceCorrect: {
      borderColor: C.success,
      backgroundColor: C.successSurface,
    },
    reviewChoiceWrong: {
      borderColor: C.error,
      backgroundColor: C.errorSurface,
    },
    reviewChoiceLabel: {
      fontSize: FontSize.subhead,
      fontWeight: '800',
      color: C.textSecondary,
      width: 24,
    },
    reviewChoiceText: {
      flex: 1,
      fontSize: FontSize.subhead,
      color: C.text,
      lineHeight: LineHeight.subhead,
    },
    reviewBadge: {
      fontSize: FontSize.caption,
      color: C.success,
      fontWeight: '800',
      backgroundColor: C.successSurface,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: BorderRadius.sm,
    },
    reviewBadgeWrong: {
      fontSize: FontSize.caption,
      color: C.error,
      fontWeight: '800',
      backgroundColor: C.errorSurface,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: BorderRadius.sm,
    },
    explanationBox: {
      backgroundColor: C.primarySurface,
      borderRadius: BorderRadius.lg,
      padding: Spacing.lg,
      marginTop: Spacing.lg,
      borderLeftWidth: 4,
      borderLeftColor: C.primary,
    },
    explanationHeader: {
      fontSize: FontSize.subhead,
      fontWeight: '800',
      color: C.primary,
      marginBottom: Spacing.sm,
    },
    explanationText: {
      fontSize: FontSize.subhead,
      color: C.text,
      lineHeight: LineHeight.body,
    },
    aiAskBtn: {
      marginTop: Spacing.xl,
      backgroundColor: C.primary,
      borderRadius: BorderRadius.full,
      paddingVertical: Spacing.md,
      alignItems: 'center',
    },
    aiAskBtnText: {
      color: C.white,
      fontSize: FontSize.body,
      fontWeight: '700',
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
