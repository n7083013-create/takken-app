import { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Shadow, FontSize, LineHeight, LetterSpacing, Spacing, BorderRadius } from '../../constants/theme';
import { useThemeColors, ThemeColors } from '../../hooks/useThemeColors';
import {
  CATEGORY_LABELS,
  CATEGORY_ICONS,
  CATEGORY_COLORS,
  Category,
  QuickQuiz,
} from '../../types';
import { useProgressStore } from '../../store/useProgressStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { ALL_QUICK_QUIZZES, getGlossaryBySlug } from '../../data';
import { HighlightedText } from '../../components/HighlightedText';
import { askAI } from '../../services/claude';
import { useAchievementChecker } from '../../hooks/useAchievementChecker';
import { useAnswerFeedback } from '../../components/AnswerFeedback';

type AIChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const CATEGORIES: Category[] = ['kenri', 'takkengyoho', 'horei_seigen', 'tax_other'];

type AnswerState = 'unanswered' | 'correct' | 'incorrect';

export default function QuickQuizScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const quickQuizStats = useProgressStore((s) => s.quickQuizStats);
  const recordQuickQuizAnswer = useProgressStore((s) => s.recordQuickQuizAnswer);
  const checkAchievements = useAchievementChecker();
  const { triggerCorrect, triggerWrong, FeedbackOverlay } = useAnswerFeedback();

  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answerState, setAnswerState] = useState<AnswerState>('unanswered');
  const [sessionTotal, setSessionTotal] = useState(0);
  const [sessionCorrect, setSessionCorrect] = useState(0);

  // AI Chat state (fullscreen)
  const isPro = useSettingsStore((st) => st.isPro());
  const canAI = useSettingsStore((st) => st.canUseAI());
  const incrementAIQuery = useSettingsStore((st) => st.incrementAIQuery);
  const [aiVisible, setAiVisible] = useState(false);
  const [aiMessages, setAiMessages] = useState<AIChatMessage[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const aiScrollRef = useRef<ScrollView>(null);

  // Glossary modal
  const [glossaryVisible, setGlossaryVisible] = useState(false);
  const [glossaryTerm, setGlossaryTerm] = useState<{ term: string; definition: string; relatedTerms: string[] } | null>(null);

  const filteredQuizzes = useMemo(
    () => selectedCategory ? ALL_QUICK_QUIZZES.filter((q) => q.category === selectedCategory) : ALL_QUICK_QUIZZES,
    [selectedCategory],
  );

  const currentQuiz: QuickQuiz | undefined = filteredQuizzes[currentIndex];

  const accuracyRate = useMemo(
    () => quickQuizStats.total > 0 ? Math.round((quickQuizStats.correct / quickQuizStats.total) * 100) : 0,
    [quickQuizStats.total, quickQuizStats.correct],
  );

  const sessionAccuracy = useMemo(
    () => sessionTotal > 0 ? Math.round((sessionCorrect / sessionTotal) * 100) : 0,
    [sessionTotal, sessionCorrect],
  );

  const handleAnswer = useCallback((userAnswer: boolean) => {
    if (!currentQuiz || answerState !== 'unanswered') return;

    const isCorrect = userAnswer === currentQuiz.isCorrect;
    if (isCorrect) {
      triggerCorrect();
    } else {
      triggerWrong();
    }
    setAnswerState(isCorrect ? 'correct' : 'incorrect');
    setSessionTotal((prev) => prev + 1);
    if (isCorrect) setSessionCorrect((prev) => prev + 1);

    recordQuickQuizAnswer(currentQuiz.id, currentQuiz.category, isCorrect);
    setTimeout(() => checkAchievements(), 0);
  }, [currentQuiz, answerState, recordQuickQuizAnswer, checkAchievements]);

  const handleNext = useCallback(() => {
    if (currentIndex < filteredQuizzes.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setCurrentIndex(0);
    }
    setAnswerState('unanswered');
  }, [currentIndex, filteredQuizzes.length]);

  const handleCategoryChange = useCallback((cat: Category | null) => {
    setSelectedCategory(cat);
    setCurrentIndex(0);
    setAnswerState('unanswered');
  }, []);

  const openAI = useCallback(() => {
    if (!aiVisible) setAiMessages([]);
    setAiInput('');
    setAiVisible(true);
  }, [aiVisible]);

  const sendAIMessage = useCallback(async () => {
    if (!currentQuiz || !aiInput.trim() || aiLoading || !canAI) return;

    const userMsg = aiInput.trim();
    setAiInput('');
    setAiMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setAiLoading(true);
    incrementAIQuery();

    try {
      const context = [
        '【宅建試験 一問一答】',
        `カテゴリ: ${CATEGORY_LABELS[currentQuiz.category]}`,
        `問題文: ${currentQuiz.statement}`,
        `正解: ${currentQuiz.isCorrect ? '○（正しい）' : '✗（誤り）'}`,
        `解説: ${currentQuiz.explanation}`,
      ].join('\n');
      const history = [...aiMessages, { role: 'user' as const, content: userMsg }];
      const reply = await askAI(context, history);
      setAiMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (e: any) {
      setAiMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `エラーが発生しました: ${e.message || 'AIサービスに接続できません'}` },
      ]);
    } finally {
      setAiLoading(false);
      setTimeout(() => aiScrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [currentQuiz, aiInput, aiLoading, canAI, aiMessages]);

  return (
    <SafeAreaView style={s.safe}>
      <FeedbackOverlay />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Header ── */}
        <View style={s.header}>
          <View>
            <Text style={s.title}>一問一答</Text>
            <Text style={s.subtitle}>
              {filteredQuizzes.length > 0
                ? `${currentIndex + 1} / ${filteredQuizzes.length}問`
                : '○✗で素早く実力チェック'}
            </Text>
          </View>
        </View>

        {/* ── Quick Stats ── */}
        <View style={s.statsRow}>
          <View style={[s.statCard, Shadow.md]}>
            <Text style={s.statEmoji}>📊</Text>
            <Text style={s.statValue}>{quickQuizStats.total}</Text>
            <Text style={s.statLabel}>累計回答</Text>
          </View>
          <View style={[s.statCard, Shadow.md]}>
            <Text style={s.statEmoji}>🎯</Text>
            <Text style={[s.statValue, { color: colors.primary }]}>{accuracyRate}%</Text>
            <Text style={s.statLabel}>累計正答率</Text>
          </View>
          <View style={[s.statCard, Shadow.md]}>
            <Text style={s.statEmoji}>⚡</Text>
            <Text style={[s.statValue, { color: colors.accent }]}>{sessionTotal}</Text>
            <Text style={s.statLabel}>今回の回答</Text>
          </View>
        </View>

        {/* ── Category Filters ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filterRow}
        >
          <Pressable
            style={[s.chip, !selectedCategory && s.chipActive]}
            onPress={() => handleCategoryChange(null)}
            accessibilityRole="tab"
            accessibilityLabel="すべてのカテゴリを表示"
          >
            <Text style={[s.chipText, !selectedCategory && s.chipTextActive]}>すべて</Text>
          </Pressable>
          {CATEGORIES.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <Pressable
                key={cat}
                style={[
                  s.chip,
                  active && { backgroundColor: CATEGORY_COLORS[cat], borderColor: CATEGORY_COLORS[cat] },
                ]}
                onPress={() => handleCategoryChange(active ? null : cat)}
                accessibilityRole="tab"
                accessibilityLabel={`${CATEGORY_LABELS[cat]}カテゴリを${active ? '解除' : '選択'}`}
              >
                <Text style={[s.chipText, active && s.chipTextActive]}>
                  {CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ── Quiz Card Area ── */}
        {filteredQuizzes.length === 0 ? (
          <View style={s.emptyContainer}>
            <View style={[s.emptyCard, Shadow.lg]}>
              <Text style={s.emptyEmoji}>📚</Text>
              <Text style={s.emptyTitle}>問題を準備中...</Text>
              <Text style={s.emptyDesc}>
                一問一答の問題データは{'\n'}近日追加予定です
              </Text>
              <View style={s.emptyDivider} />
              <Text style={s.emptyHint}>
                ○✗形式で素早く知識を確認できます
              </Text>
            </View>
          </View>
        ) : (
          <>
            {/* ── Session Progress Bar ── */}
            {sessionTotal > 0 && (
              <View style={[s.sessionBar, Shadow.sm]}>
                <View style={s.sessionBarHeader}>
                  <Text style={s.sessionBarLabel}>今回のセッション</Text>
                  <Text style={s.sessionBarValue}>
                    {sessionCorrect}/{sessionTotal} ({sessionAccuracy}%)
                  </Text>
                </View>
                <View style={s.sessionTrack}>
                  <View
                    style={[
                      s.sessionFill,
                      { width: `${sessionAccuracy}%` },
                    ]}
                  />
                </View>
              </View>
            )}

            {/* ── Statement Card ── */}
            <View style={[s.quizCard, Shadow.lg, answerState === 'correct' && s.quizCardCorrect, answerState === 'incorrect' && s.quizCardIncorrect]}>
              {/* Category Badge */}
              {currentQuiz && (
                <View style={[s.quizCatBadge, { backgroundColor: CATEGORY_COLORS[currentQuiz.category] + '14' }]}>
                  <Text style={[s.quizCatText, { color: CATEGORY_COLORS[currentQuiz.category] }]}>
                    {CATEGORY_ICONS[currentQuiz.category]} {CATEGORY_LABELS[currentQuiz.category]}
                  </Text>
                </View>
              )}

              {/* Question Number */}
              <Text style={s.quizNumber}>Q.{currentIndex + 1}</Text>

              {/* Statement */}
              {currentQuiz ? (
                <HighlightedText
                  text={currentQuiz.statement}
                  style={s.quizStatement}
                  onTermPress={(term) => {
                    setGlossaryTerm({ term: term.term, definition: term.definition, relatedTerms: term.relatedTerms });
                    setGlossaryVisible(true);
                  }}
                />
              ) : (
                <Text style={s.quizStatement}>{''}</Text>
              )}

              {/* Answer Feedback */}
              {answerState !== 'unanswered' && currentQuiz && (
                <View style={[s.feedbackBox, answerState === 'correct' ? s.feedbackCorrect : s.feedbackIncorrect]}>
                  <View style={s.feedbackHeader}>
                    <Text style={s.feedbackIcon}>
                      {answerState === 'correct' ? '🎉' : '😥'}
                    </Text>
                    <Text style={[s.feedbackTitle, answerState === 'correct' ? s.feedbackTitleCorrect : s.feedbackTitleIncorrect]}>
                      {answerState === 'correct' ? '正解！' : '不正解...'}
                    </Text>
                  </View>
                  <Text style={s.feedbackAnswer}>
                    正しい答え: {currentQuiz.isCorrect ? '○（正しい）' : '✗（誤り）'}
                  </Text>
                  <Text style={s.feedbackExplanation}>
                    {currentQuiz.explanation}
                  </Text>
                  {isPro && (
                    <Pressable style={s.feedbackAiBtn} onPress={openAI} accessibilityRole="button" accessibilityLabel="AIに質問する">
                      <Text style={s.feedbackAiBtnText}>🤖 AIに質問する</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>

            {/* ── Answer Buttons ── */}
            {answerState === 'unanswered' ? (
              <View style={s.answerRow}>
                <Pressable
                  style={[s.answerBtn, s.answerBtnCorrect, Shadow.md]}
                  onPress={() => handleAnswer(true)}
                  accessibilityRole="button"
                  accessibilityLabel="正しいと回答"
                >
                  <Text style={s.answerBtnIcon}>○</Text>
                  <Text style={s.answerBtnLabel}>正しい</Text>
                </Pressable>
                <Pressable
                  style={[s.answerBtn, s.answerBtnIncorrect, Shadow.md]}
                  onPress={() => handleAnswer(false)}
                  accessibilityRole="button"
                  accessibilityLabel="誤りと回答"
                >
                  <Text style={s.answerBtnIcon}>✗</Text>
                  <Text style={s.answerBtnLabel}>誤り</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Pressable style={[s.nextBtn, Shadow.md]} onPress={handleNext} accessibilityRole="button" accessibilityLabel={currentIndex < filteredQuizzes.length - 1 ? '次の問題へ' : '最初に戻る'}>
                  <Text style={s.nextBtnText}>
                    {currentIndex < filteredQuizzes.length - 1 ? '次の問題へ →' : '最初に戻る ↻'}
                  </Text>
                </Pressable>
                <Pressable
                  style={s.exitBtn}
                  onPress={() => router.navigate('/')}
                  accessibilityRole="button"
                  accessibilityLabel="終了してホームに戻る"
                >
                  <Text style={s.exitBtnText}>✕ 終了してホームに戻る</Text>
                </Pressable>
              </>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* AI Fullscreen Modal */}
      <Modal visible={aiVisible} animationType="slide" onRequestClose={() => setAiVisible(false)}>
        <SafeAreaView style={s.aiSafe}>
          {/* Header */}
          <View style={s.aiHeader}>
            <Text style={s.aiHeaderTitle}>🤖 AI解説アシスタント</Text>
            <Pressable onPress={() => setAiVisible(false)} hitSlop={12} accessibilityRole="button" accessibilityLabel="AIチャットを閉じる">
              <Text style={s.aiClose}>✕</Text>
            </Pressable>
          </View>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            {/* Chat + Context */}
            <ScrollView
              ref={aiScrollRef}
              style={s.aiChat}
              contentContainerStyle={s.aiChatContent}
              onContentSizeChange={() => {
                if (aiMessages.length > 0) aiScrollRef.current?.scrollToEnd({ animated: true });
              }}
              keyboardShouldPersistTaps="handled"
            >
              {/* Embedded Quiz Context */}
              {currentQuiz && (
                <View style={s.aiContextCard}>
                  <View style={s.aiContextHeader}>
                    <Text style={s.aiContextTitle}>📋 問題について質問中</Text>
                  </View>
                  <View style={s.aiContextBody}>
                    <HighlightedText
                      text={currentQuiz.statement}
                      style={s.aiContextQuestion}
                      onTermPress={(term) => {
                        setGlossaryTerm({ term: term.term, definition: term.definition, relatedTerms: term.relatedTerms });
                        setGlossaryVisible(true);
                      }}
                    />
                    <View style={s.aiContextAnswer}>
                      <Text style={s.aiContextAnswerLabel}>正しい答え:</Text>
                      <Text style={s.aiContextAnswerValue}>{currentQuiz.isCorrect ? '○（正しい）' : '✗（誤り）'}</Text>
                    </View>
                    <Text style={s.aiContextExplText}>{currentQuiz.explanation}</Text>
                  </View>
                </View>
              )}

              {/* Suggestions */}
              {aiMessages.length === 0 && (
                <View style={s.aiSuggestions}>
                  {['もっとわかりやすく説明して', 'なぜこの答えになるの？', '具体例を使って教えて'].map((sug) => (
                    <Pressable key={sug} style={s.aiSuggestionChip} onPress={() => setAiInput(sug)}>
                      <Text style={s.aiSuggestionText}>{sug}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              {/* Messages */}
              {aiMessages.map((msg, i) => (
                <View key={i} style={[s.aiMsg, msg.role === 'user' ? s.aiMsgUser : s.aiMsgAssistant]}>
                  <Text style={[s.aiMsgText, msg.role === 'user' && s.aiMsgTextUser]}>{msg.content}</Text>
                </View>
              ))}
              {aiLoading && (
                <View style={[s.aiMsg, s.aiMsgAssistant]}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              )}
            </ScrollView>

            {/* Input */}
            <View style={s.aiInputRow}>
              <TextInput
                style={s.aiInput}
                placeholder="質問を入力..."
                placeholderTextColor={colors.textDisabled}
                value={aiInput}
                onChangeText={setAiInput}
                multiline
                maxLength={500}
                editable={!aiLoading}
              />
              <Pressable
                style={[s.aiSendBtn, (!aiInput.trim() || aiLoading || !canAI) && s.aiSendBtnDisabled]}
                onPress={sendAIMessage}
                disabled={!aiInput.trim() || aiLoading || !canAI}
                accessibilityRole="button"
                accessibilityLabel="AI質問を送信"
              >
                <Text style={s.aiSendIcon}>↑</Text>
              </Pressable>
            </View>
            {!canAI && <Text style={s.aiLimitText}>本日のAI質問回数の上限に達しました</Text>}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Glossary Modal */}
      <Modal visible={glossaryVisible} transparent animationType="slide" onRequestClose={() => setGlossaryVisible(false)}>
        <Pressable style={s.glossaryOverlay} onPress={() => setGlossaryVisible(false)}>
          <View style={s.glossarySheet}>
            <View style={s.glossaryHandle} />
            {glossaryTerm && (
              <>
                <Text style={s.glossaryTitle}>{glossaryTerm.term}</Text>
                <View style={s.glossaryDivider} />
                <Text style={s.glossaryDef}>{glossaryTerm.definition}</Text>
              </>
            )}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) { return StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  scroll: { paddingBottom: 20 },

  // ─── Header ───
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  title: {
    fontSize: FontSize.title1,
    fontWeight: '800',
    color: C.text,
    letterSpacing: LetterSpacing.tight,
  },
  subtitle: {
    fontSize: FontSize.footnote,
    color: C.textSecondary,
    marginTop: 3,
  },

  // ─── Stats Row ───
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: BorderRadius.xl,
    paddingVertical: 14,
    alignItems: 'center',
  },
  statEmoji: { fontSize: 18, marginBottom: 4 },
  statValue: {
    fontSize: FontSize.title2,
    fontWeight: '800',
    color: C.text,
    letterSpacing: LetterSpacing.tight,
  },
  statLabel: {
    fontSize: FontSize.caption2,
    color: C.textSecondary,
    marginTop: 3,
    fontWeight: '500',
    letterSpacing: LetterSpacing.wide,
  },

  // ─── Filters ───
  filterRow: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.lg, gap: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  chipActive: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: {
    fontSize: FontSize.footnote,
    fontWeight: '600',
    color: C.textSecondary,
  },
  chipTextActive: { color: C.white },

  // ─── Empty State ───
  emptyContainer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: 40,
    alignItems: 'center',
  },
  emptyCard: {
    backgroundColor: C.card,
    borderRadius: BorderRadius.xxl,
    padding: 40,
    alignItems: 'center',
    width: '100%',
  },
  emptyEmoji: { fontSize: 56, marginBottom: Spacing.lg },
  emptyTitle: {
    fontSize: FontSize.title3,
    fontWeight: '800',
    color: C.text,
    marginBottom: Spacing.sm,
  },
  emptyDesc: {
    fontSize: FontSize.subhead,
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: LineHeight.subhead,
  },
  emptyDivider: {
    width: 60,
    height: 3,
    backgroundColor: C.primary,
    borderRadius: 2,
    marginVertical: Spacing.xl,
  },
  emptyHint: {
    fontSize: FontSize.footnote,
    color: C.textTertiary,
    textAlign: 'center',
  },

  // ─── Session Progress ───
  sessionBar: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    backgroundColor: C.card,
    borderRadius: BorderRadius.lg,
    padding: 14,
  },
  sessionBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sessionBarLabel: {
    fontSize: FontSize.footnote,
    fontWeight: '600',
    color: C.textSecondary,
  },
  sessionBarValue: {
    fontSize: FontSize.footnote,
    fontWeight: '700',
    color: C.primary,
  },
  sessionTrack: {
    height: 6,
    backgroundColor: C.primarySurface,
    borderRadius: 3,
    overflow: 'hidden',
  },
  sessionFill: {
    height: '100%',
    backgroundColor: C.primary,
    borderRadius: 3,
  },

  // ─── Quiz Card ───
  quizCard: {
    marginHorizontal: Spacing.xl,
    backgroundColor: C.card,
    borderRadius: BorderRadius.xxl,
    padding: Spacing.xxl,
    minHeight: 240,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  quizCardCorrect: {
    borderColor: C.success,
    backgroundColor: C.successSurface,
  },
  quizCardIncorrect: {
    borderColor: C.error,
    backgroundColor: C.errorSurface,
  },
  quizCatBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.md,
  },
  quizCatText: {
    fontSize: FontSize.footnote,
    fontWeight: '700',
  },
  quizNumber: {
    fontSize: FontSize.headline,
    fontWeight: '800',
    color: C.primary,
    marginBottom: Spacing.md,
  },
  quizStatement: {
    fontSize: FontSize.callout,
    fontWeight: '600',
    color: C.text,
    lineHeight: LineHeight.callout,
  },

  // ─── Feedback ───
  feedbackBox: {
    marginTop: Spacing.xl,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
  },
  feedbackCorrect: {
    backgroundColor: C.successSurface,
  },
  feedbackIncorrect: {
    backgroundColor: C.errorSurface,
  },
  feedbackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  feedbackIcon: { fontSize: 22 },
  feedbackTitle: {
    fontSize: FontSize.headline,
    fontWeight: '800',
  },
  feedbackTitleCorrect: { color: C.success },
  feedbackTitleIncorrect: { color: C.error },
  feedbackAnswer: {
    fontSize: FontSize.subhead,
    fontWeight: '600',
    color: C.textSecondary,
    marginBottom: 6,
  },
  feedbackExplanation: {
    fontSize: FontSize.subhead,
    color: C.text,
    lineHeight: LineHeight.body,
  },

  // ─── Answer Buttons ───
  answerRow: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.xxl,
  },
  answerBtn: {
    flex: 1,
    borderRadius: BorderRadius.xxl,
    paddingVertical: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  answerBtnCorrect: {
    backgroundColor: C.primary,
  },
  answerBtnIncorrect: {
    backgroundColor: C.error,
  },
  answerBtnIcon: {
    fontSize: 36,
    fontWeight: '800',
    color: C.white,
  },
  answerBtnLabel: {
    fontSize: FontSize.subhead,
    fontWeight: '700',
    color: C.white,
    marginTop: 4,
  },

  // ─── Feedback AI Button ───
  feedbackAiBtn: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: BorderRadius.md,
    backgroundColor: C.infoSurface,
    borderWidth: 1,
    borderColor: C.border,
  },
  feedbackAiBtnText: {
    fontSize: FontSize.footnote,
    fontWeight: '700',
    color: C.primary,
  },

  // ─── Next Button ───
  nextBtn: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.xxl,
    backgroundColor: C.primary,
    borderRadius: BorderRadius.xxl,
    paddingVertical: 18,
    alignItems: 'center',
  },
  nextBtnText: {
    fontSize: FontSize.headline,
    fontWeight: '700',
    color: C.white,
  },

  // ─── Exit Button ───
  exitBtn: { alignItems: 'center', marginTop: 12, paddingVertical: 14, backgroundColor: C.card, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: C.border },
  exitBtnText: { fontSize: FontSize.subhead, fontWeight: '600', color: C.textSecondary },

  // ─── AI Fullscreen ───
  aiSafe: { flex: 1, backgroundColor: C.background },
  aiHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
  aiHeaderTitle: { fontSize: FontSize.headline, fontWeight: '800', color: C.text },
  aiClose: { fontSize: 22, color: C.textTertiary, padding: 4 },
  aiChat: { flex: 1 },
  aiChatContent: { padding: 16, paddingBottom: 10 },

  // ─── AI Context Card ───
  aiContextCard: { backgroundColor: C.card, borderRadius: BorderRadius.xl, marginBottom: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  aiContextHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.primarySurface },
  aiContextTitle: { fontSize: FontSize.subhead, fontWeight: '700', color: C.primaryDark },
  aiContextBody: { padding: 16 },
  aiContextPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: BorderRadius.sm },
  aiContextPillText: { fontSize: FontSize.caption2, fontWeight: '700' },
  aiContextQuestion: { fontSize: FontSize.subhead, fontWeight: '600', color: C.text, lineHeight: LineHeight.subhead, marginBottom: 12 },
  aiContextAnswer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  aiContextAnswerLabel: { fontSize: FontSize.footnote, fontWeight: '600', color: C.textTertiary },
  aiContextAnswerValue: { fontSize: FontSize.footnote, fontWeight: '700', color: C.text },
  aiContextExplWrap: { paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border },
  aiContextExplLabel: { fontSize: FontSize.caption2, fontWeight: '700', color: C.textTertiary, marginBottom: 4, letterSpacing: LetterSpacing.wide },
  aiContextExplText: { fontSize: FontSize.footnote, color: C.textSecondary, lineHeight: LineHeight.footnote },

  // ─── AI Chat Elements ───
  aiSuggestions: { gap: 10, marginBottom: 16 },
  aiSuggestionChip: { backgroundColor: C.card, borderRadius: BorderRadius.lg, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: C.border },
  aiSuggestionText: { fontSize: FontSize.subhead, color: C.primary, fontWeight: '600' },
  aiMsg: { maxWidth: '85%', borderRadius: BorderRadius.lg, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 12 },
  aiMsgUser: { alignSelf: 'flex-end', backgroundColor: C.primary },
  aiMsgAssistant: { alignSelf: 'flex-start', backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  aiMsgText: { fontSize: FontSize.subhead, color: C.text, lineHeight: LineHeight.body },
  aiMsgTextUser: { color: C.white },
  aiInputRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, paddingVertical: 14, gap: 12, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.card },
  aiInput: { flex: 1, backgroundColor: C.background, borderRadius: BorderRadius.lg, paddingHorizontal: 18, paddingVertical: 14, fontSize: FontSize.body, color: C.text, minHeight: 52, maxHeight: 140, borderWidth: 1, borderColor: C.border, lineHeight: LineHeight.body },
  aiSendBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  aiSendBtnDisabled: { backgroundColor: C.borderLight },
  aiSendIcon: { fontSize: 20, fontWeight: '800', color: C.white },
  aiLimitText: { textAlign: 'center', fontSize: FontSize.caption2, color: C.error, paddingBottom: 12, backgroundColor: C.card },

  // ─── Glossary Modal ───
  glossaryOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  glossarySheet: { backgroundColor: C.card, borderTopLeftRadius: BorderRadius.xxl, borderTopRightRadius: BorderRadius.xxl, padding: Spacing.xxl, paddingBottom: 40, maxHeight: '55%' },
  glossaryHandle: { width: 40, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.xl },
  glossaryTitle: { fontSize: FontSize.title3, fontWeight: '800', color: C.text },
  glossaryDivider: { width: 40, height: 3, backgroundColor: C.primarySurface, borderRadius: 2, marginVertical: 14 },
  glossaryDef: { fontSize: FontSize.subhead, color: C.textSecondary, lineHeight: LineHeight.body },
  glossaryRelatedRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: Spacing.lg, gap: 6 },
  glossaryRelatedLabel: { fontSize: FontSize.footnote, color: C.textTertiary },
  glossaryRelatedChip: { fontSize: FontSize.footnote, color: C.primary, backgroundColor: C.primarySurface, paddingHorizontal: 10, paddingVertical: 3, borderRadius: BorderRadius.sm },
}); }
