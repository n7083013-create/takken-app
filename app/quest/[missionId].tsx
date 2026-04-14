// ============================================================
// クエスト学習 - ミッションセッション画面
// ============================================================

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack, useNavigation } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Shadow,
  FontSize,
  LineHeight,
  LetterSpacing,
  Spacing,
  BorderRadius,
  DifficultyLabel,
  DifficultyColor,
} from '../../constants/theme';
import { useThemeColors, ThemeColors } from '../../hooks/useThemeColors';
import { CATEGORY_LABELS, CATEGORY_COLORS } from '../../types';
import { getQuestQuestions, getQuestMission } from '../../data/quests';
import { getQuestionById } from '../../data';
import { useProgressStore } from '../../store/useProgressStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useQuestStore } from '../../store/useQuestStore';
import { askAI } from '../../services/claude';
import { useAchievementChecker } from '../../hooks/useAchievementChecker';

type AIChatMessage = { role: 'user' | 'assistant'; content: string };

const LABELS = ['A', 'B', 'C', 'D'] as const;
const STMT_LABELS = ['ア', 'イ', 'ウ', 'エ'] as const;

/** Fisher-Yates シャッフル */
function shuffleIndices(length: number): number[] {
  const arr = Array.from({ length }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

type AnswerState = 'idle' | 'correct' | 'wrong';

export default function QuestSessionScreen() {
  const { missionId } = useLocalSearchParams<{ missionId: string }>();
  const router = useRouter();
  const nav = useNavigation();
  const colors = useThemeColors();
  const { width: screenWidth } = useWindowDimensions();
  const isWideScreen = screenWidth >= 768;
  const s = useMemo(() => makeStyles(colors, isWideScreen), [colors, isWideScreen]);

  const recordAnswer = useProgressStore((st) => st.recordAnswer);
  const recordMissionResult = useQuestStore((st) => st.recordMissionResult);
  const checkAchievements = useAchievementChecker();
  const canAI = useSettingsStore((st) => st.canUseAI());
  const isPro = useSettingsStore((st) => st.isPro());
  const incrementAIQuery = useSettingsStore((st) => st.incrementAIQuery);

  const mission = useMemo(() => getQuestMission(missionId), [missionId]);
  const questionIds = useMemo(() => getQuestQuestions(missionId), [missionId]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answerState, setAnswerState] = useState<AnswerState>('idle');
  const [shuffledMap, setShuffledMap] = useState<number[]>([0, 1, 2, 3]);
  const [isFinished, setIsFinished] = useState(false);

  // AI Chat state
  const [aiVisible, setAiVisible] = useState(false);
  const [aiTargetChoice, setAiTargetChoice] = useState<number | null>(null);
  const [aiMessages, setAiMessages] = useState<AIChatMessage[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const aiScrollRef = useRef<ScrollView>(null);

  const totalQuestions = questionIds.length;
  const currentQuestion = useMemo(
    () => (questionIds[currentIndex] ? getQuestionById(questionIds[currentIndex]) : null),
    [questionIds, currentIndex],
  );

  // 問題が変わったらシャッフル（個数・組み合わせ問題はシャッフルしない）
  useEffect(() => {
    if (currentQuestion) {
      const isSpecial = currentQuestion.questionFormat === 'count' || currentQuestion.questionFormat === 'combination';
      setShuffledMap(isSpecial ? [0, 1, 2, 3] : shuffleIndices(currentQuestion.choices.length));
      setSelected(null);
      setAnswerState('idle');
    }
  }, [currentIndex, currentQuestion?.id]);

  const catColor = mission ? CATEGORY_COLORS[mission.category] : colors.primary;

  const handleSelect = useCallback(
    (origIdx: number) => {
      if (answerState !== 'idle' || !currentQuestion) return;
      setSelected(origIdx);

      const isCorrect = origIdx === currentQuestion.correctIndex;
      setAnswerState(isCorrect ? 'correct' : 'wrong');
      if (isCorrect) setCorrectCount((c) => c + 1);

      // 進捗に記録
      recordAnswer(currentQuestion.id, currentQuestion.category, isCorrect);
    },
    [answerState, currentQuestion, recordAnswer],
  );

  const openAI = useCallback((prefill?: string, choiceIdx?: number) => {
    if (!aiVisible) setAiMessages([]);
    setAiInput(prefill ?? '');
    setAiTargetChoice(choiceIdx ?? null);
    setAiVisible(true);
  }, [aiVisible]);

  const askAboutChoice = useCallback((choiceIdx: number) => {
    if (!currentQuestion) return;
    openAI(`選択肢${LABELS[choiceIdx]}「${currentQuestion.choices[choiceIdx]}」について詳しく教えて`, choiceIdx);
  }, [currentQuestion, openAI]);

  const sendAIMessage = useCallback(async () => {
    if (!currentQuestion || !aiInput.trim() || aiLoading || !canAI) return;
    const userMsg = aiInput.trim();
    setAiInput('');
    setAiMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setAiLoading(true);
    incrementAIQuery();
    try {
      const context = buildQuestAIContext(currentQuestion, selected, answerState);
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
  }, [currentQuestion, aiInput, aiLoading, canAI, aiMessages, selected, answerState]);

  const handleNext = useCallback(() => {
    if (currentIndex + 1 >= totalQuestions) {
      // ミッション完了
      const finalCorrect = correctCount + (answerState === 'correct' ? 0 : 0); // already counted
      const score = totalQuestions > 0 ? correctCount / totalQuestions : 0;
      recordMissionResult(missionId, score);
      setIsFinished(true);
      // 実績チェック（クエスト完了を反映）
      setTimeout(() => checkAchievements(), 100);
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }, [currentIndex, totalQuestions, correctCount, answerState, missionId, recordMissionResult]);

  // ミッション定義がない場合
  if (!mission) {
    return (
      <SafeAreaView style={s.safe}>
        <Stack.Screen options={{ title: 'クエスト' }} />
        <View style={s.emptyWrap}>
          <Text style={s.emptyIcon}>❓</Text>
          <Text style={s.emptyText}>ミッションが見つかりません</Text>
        </View>
      </SafeAreaView>
    );
  }

  // 問題が足りない場合
  if (totalQuestions === 0) {
    return (
      <SafeAreaView style={s.safe}>
        <Stack.Screen options={{ title: mission.title, headerTintColor: colors.primary }} />
        <View style={s.emptyWrap}>
          <Text style={s.emptyIcon}>📭</Text>
          <Text style={s.emptyText}>この分野の問題がまだありません</Text>
          <Pressable style={[s.backBtn, Shadow.sm]} onPress={() => router.back()}>
            <Text style={s.backBtnText}>戻る</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── 結果画面 ──
  if (isFinished) {
    const score = totalQuestions > 0 ? correctCount / totalQuestions : 0;
    const passed = score >= mission.passingRate;

    return (
      <SafeAreaView style={s.safe}>
        <Stack.Screen options={{ title: mission.title, headerTintColor: colors.primary }} />
        <ScrollView contentContainerStyle={s.resultScroll}>
          <View style={[s.resultCard, Shadow.lg]}>
            <Text style={s.resultEmoji}>{passed ? '🎉' : '💪'}</Text>
            <Text style={s.resultTitle}>
              {passed ? 'ミッションクリア！' : 'もう少し！'}
            </Text>
            <Text style={s.resultSubtitle}>{mission.title}</Text>

            <View style={s.resultScoreBox}>
              <Text style={[s.resultScore, { color: passed ? catColor : colors.error }]}>
                {Math.round(score * 100)}%
              </Text>
              <Text style={s.resultScoreLabel}>
                {correctCount}/{totalQuestions}問正解
              </Text>
            </View>

            <View style={s.resultBar}>
              <View style={s.resultBarTrack}>
                <View
                  style={[
                    s.resultBarFill,
                    {
                      width: `${Math.round(score * 100)}%`,
                      backgroundColor: passed ? catColor : colors.error,
                    },
                  ]}
                />
                {/* 合格ラインマーカー */}
                <View
                  style={[
                    s.resultPassLine,
                    { left: `${Math.round(mission.passingRate * 100)}%` },
                  ]}
                />
              </View>
              <Text style={s.resultPassText}>
                合格ライン {Math.round(mission.passingRate * 100)}%
              </Text>
            </View>

            {passed ? (
              <Text style={[s.resultMessage, { color: catColor }]}>
                素晴らしい！次のミッションが解放されました
              </Text>
            ) : (
              <Text style={[s.resultMessage, { color: colors.error }]}>
                {Math.round(mission.passingRate * 100)}%以上で合格です。もう一度チャレンジ！
              </Text>
            )}
          </View>

          <View style={s.resultActions}>
            {!passed && (
              <Pressable
                style={[s.retryBtn, Shadow.md, { backgroundColor: catColor }]}
                onPress={() => {
                  // リトライ
                  setCurrentIndex(0);
                  setCorrectCount(0);
                  setSelected(null);
                  setAnswerState('idle');
                  setIsFinished(false);
                }}
              >
                <Text style={s.retryBtnText}>もう一度挑戦</Text>
              </Pressable>
            )}
            <Pressable
              style={[s.mapBtn, Shadow.sm]}
              onPress={() => router.back()}
            >
              <Text style={[s.mapBtnText, { color: catColor }]}>
                クエストマップに戻る
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── 問題画面 ──
  if (!currentQuestion) {
    return (
      <SafeAreaView style={s.safe}>
        <Stack.Screen options={{ title: mission.title }} />
        <View style={s.emptyWrap}>
          <Text style={s.emptyText}>問題を読み込み中...</Text>
        </View>
      </SafeAreaView>
    );
  }

  /** AI チャット UI（モーダル内 or サイドパネル共通） */
  const renderQuestAIChat = () => (
    <>
      <View style={s.aiHeader}>
        <Text style={s.aiHeaderTitle}>🤖 AI解説アシスタント</Text>
        <Pressable onPress={() => setAiVisible(false)} hitSlop={12}>
          <Text style={s.aiClose}>✕</Text>
        </Pressable>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          ref={aiScrollRef}
          style={s.aiChat}
          contentContainerStyle={s.aiChatContent}
          onContentSizeChange={() => { if (aiMessages.length > 0) aiScrollRef.current?.scrollToEnd({ animated: true }); }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.aiContextCard}>
            <View style={s.aiContextHeader}>
              <Text style={s.aiContextTitle}>
                {aiTargetChoice !== null ? `📋 選択肢${LABELS[aiTargetChoice]}について質問中` : '📋 問題について質問中'}
              </Text>
            </View>
            <View style={s.aiContextBody}>
              <Text style={s.aiContextQuestion} numberOfLines={3}>{currentQuestion.text}</Text>
            </View>
          </View>
          {aiMessages.length === 0 && (
            <View style={s.aiSuggestions}>
              {['この問題をもっと簡単に説明して', '具体例を使って説明して', '関連する条文を教えて'].map((sug) => (
                <Pressable key={sug} style={s.aiSuggestionChip} onPress={() => setAiInput(sug)}>
                  <Text style={s.aiSuggestionText}>{sug}</Text>
                </Pressable>
              ))}
            </View>
          )}
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
          >
            <Text style={s.aiSendIcon}>↑</Text>
          </Pressable>
        </View>
        {!canAI && (
          <Text style={s.aiLimitText}>本日のAI質問回数の上限に達しました</Text>
        )}
      </KeyboardAvoidingView>
    </>
  );

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen
        options={{
          title: mission.title,
          headerTintColor: colors.primary,
        }}
      />

      <View style={s.splitContainer}>
      {/* メインコンテンツ */}
      <View style={[{ flex: 1 }, isWideScreen && s.splitMain]}>
      {/* プログレスバー */}
      <View style={s.progressWrap}>
        <View style={s.progressTrack}>
          <View
            style={[
              s.progressFill,
              {
                width: `${((currentIndex + 1) / totalQuestions) * 100}%`,
                backgroundColor: catColor,
              },
            ]}
          />
        </View>
        <Text style={s.progressText}>
          {currentIndex + 1}/{totalQuestions}
        </Text>
      </View>

      <ScrollView contentContainerStyle={s.questionScroll}>
        {/* 問題文 */}
        <View style={[s.questionCard, Shadow.md]}>
          <View style={s.questionMeta}>
            <View style={[s.diffBadge, { backgroundColor: DifficultyColor[currentQuestion.difficulty] + '14' }]}>
              <Text style={[s.diffBadgeText, { color: DifficultyColor[currentQuestion.difficulty] }]}>
                {DifficultyLabel[currentQuestion.difficulty]}
              </Text>
            </View>
          </View>
          <Text style={s.questionText}>{currentQuestion.text}</Text>
        </View>

        {/* Statements（個数問題・組み合わせ問題のア〜エ記述） */}
        {currentQuestion.statements && currentQuestion.statements.length > 0 && (
          <View style={s.statementsBox}>
            {currentQuestion.statements.map((stmt, i) => {
              const stmtCorrect = currentQuestion.statementAnswers?.[i];
              const showResult = answerState !== 'idle' && stmtCorrect !== undefined;
              return (
                <View key={i} style={[
                  s.statementRow,
                  showResult && (stmtCorrect ? s.statementCorrect : s.statementWrong),
                ]}>
                  <View style={[s.statementLabel, showResult && { backgroundColor: stmtCorrect ? colors.success + '20' : colors.error + '20' }]}>
                    <Text style={[s.statementLabelText, showResult && { color: stmtCorrect ? colors.success : colors.error }]}>{STMT_LABELS[i]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.statementText}>{stmt}</Text>
                    {showResult && (
                      <Text style={[s.statementResult, { color: stmtCorrect ? colors.success : colors.error }]}>
                        {stmtCorrect ? '○ 正しい' : '✗ 誤り'}
                      </Text>
                    )}
                    {answerState !== 'idle' && currentQuestion.statementExplanations?.[i] && (
                      <Text style={s.statementExpl}>{currentQuestion.statementExplanations[i]}</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* 選択肢 */}
        <View style={s.choicesWrap}>
          {shuffledMap.map((origIdx, displayIdx) => {
            const choice = currentQuestion.choices[origIdx];
            const isSelected = selected === origIdx;
            const isCorrectChoice = origIdx === currentQuestion.correctIndex;
            const answered = answerState !== 'idle';

            const isCorrectAnswer = answered && isCorrectChoice;
            const isWrongAnswer = answered && isSelected && !isCorrectChoice;

            return (
              <View key={`${displayIdx}-${origIdx}`}>
                <Pressable
                  style={[
                    s.choiceCard,
                    isCorrectAnswer && s.choiceCorrect,
                    isWrongAnswer && s.choiceWrong,
                    Shadow.sm,
                  ]}
                  onPress={() => handleSelect(origIdx)}
                  disabled={answered}
                >
                  <View style={[s.choiceLabelWrap, answered && isCorrectChoice && s.choiceLabelWrapCorrect, answered && isSelected && !isCorrectChoice && s.choiceLabelWrapWrong]}>
                    <Text style={[s.choiceLabelText, answered && isCorrectChoice && s.choiceLabelTextCorrect, answered && isSelected && !isCorrectChoice && s.choiceLabelTextWrong]}>
                      {LABELS[displayIdx]}
                    </Text>
                  </View>
                  <Text style={[s.choiceText, answered && isCorrectChoice && { color: colors.success, fontWeight: '700' }, answered && isSelected && !isCorrectChoice && { color: colors.error }]}>
                    {choice}
                  </Text>
                </Pressable>
                {/* 選択肢別解説 */}
                {answered && currentQuestion.choiceExplanations?.[origIdx] && (
                  <View style={[s.choiceExplBox, isCorrectAnswer ? s.choiceExplCorrect : isWrongAnswer ? s.choiceExplWrong : s.choiceExplNeutral]}>
                    <Text style={s.choiceExplText}>{currentQuestion.choiceExplanations[origIdx]}</Text>
                    {isPro && (
                      <Pressable style={s.choiceAiBtn} onPress={() => askAboutChoice(origIdx)}>
                        <Text style={s.choiceAiBtnText}>🤖 AIに聞く</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* 解説（回答後） */}
        {answerState !== 'idle' && (
          <View style={[s.explanationCard, Shadow.sm]}>
            <Text style={s.explanationLabel}>
              {answerState === 'correct' ? '✅ 正解！' : '❌ 不正解'}
            </Text>
            <Text style={s.explanationText}>{currentQuestion.explanation}</Text>
            {isPro && (
              <Pressable style={[s.aiBtn, Shadow.sm]} onPress={() => openAI()}>
                <Text style={s.aiBtnIcon}>🤖</Text>
                <View>
                  <Text style={s.aiBtnText}>AIに質問する</Text>
                  <Text style={s.aiBtnSub}>解説でわからない部分を聞こう</Text>
                </View>
              </Pressable>
            )}
          </View>
        )}

        {/* 次へボタン */}
        {answerState !== 'idle' && (
          <>
            <Pressable
              style={[s.nextBtn, Shadow.md, { backgroundColor: catColor }]}
              onPress={handleNext}
            >
              <Text style={s.nextBtnText}>
                {currentIndex + 1 >= totalQuestions ? '結果を見る' : '次の問題へ'}
              </Text>
            </Pressable>
            <Pressable
              style={s.exitBtn}
              onPress={() => {
                if (router.canDismiss()) {
                  router.dismissAll();
                } else {
                  router.replace('/');
                }
              }}
            >
              <Text style={s.exitBtnText}>✕ 終了してホームに戻る</Text>
            </Pressable>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* AI Modal (スマホ用) */}
      {!isWideScreen && (
        <Modal visible={aiVisible} animationType="slide" onRequestClose={() => setAiVisible(false)}>
          <SafeAreaView style={s.aiSafe}>
            {renderQuestAIChat()}
          </SafeAreaView>
        </Modal>
      )}
      </View>

      {/* AI Side Panel（PC/タブレット用） */}
      {isWideScreen && aiVisible && (
        <View style={s.splitSide}>
          {renderQuestAIChat()}
        </View>
      )}
      </View>
    </SafeAreaView>
  );
}

/** AI に渡すクエスト問題コンテキストを構築 */
function buildQuestAIContext(
  q: NonNullable<ReturnType<typeof getQuestionById>>,
  selected: number | null,
  state: AnswerState,
): string {
  const lines = [
    `【宅建試験問題】`,
    `カテゴリ: ${CATEGORY_LABELS[q.category]}`,
    `問題: ${q.text}`,
    '',
    ...q.choices.map((c, i) => `${LABELS[i]}. ${c}${i === q.correctIndex ? ' ← 正解' : ''}`),
    '',
    `ユーザーの回答: ${selected !== null ? LABELS[selected] : '未回答'} (${state === 'correct' ? '正解' : '不正解'})`,
    '',
    `解説: ${q.explanation}`,
  ];
  if (q.choiceExplanations) {
    lines.push('', '各選択肢の解説:');
    q.choiceExplanations.forEach((e, i) => lines.push(`${LABELS[i]}: ${e}`));
  }
  return lines.join('\n');
}

function makeStyles(C: ThemeColors, isWide = false) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.background },

    // ─── Split Layout (PC/タブレット) ───
    splitContainer: { flex: 1, flexDirection: isWide ? 'row' : 'column' },
    splitMain: { flex: 1, maxWidth: isWide ? '60%' : '100%' },
    splitSide: { width: isWide ? '40%' : '100%', borderLeftWidth: 1, borderLeftColor: C.border, backgroundColor: C.background },

    // ─── Empty ───
    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
    emptyIcon: { fontSize: 48, marginBottom: 12 },
    emptyText: { fontSize: FontSize.body, color: C.textTertiary, textAlign: 'center' },
    backBtn: {
      marginTop: 20,
      backgroundColor: C.card,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: BorderRadius.md,
    },
    backBtnText: { fontSize: FontSize.subhead, fontWeight: '600', color: C.primary },

    // ─── Progress Bar ───
    progressWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.xl,
      paddingVertical: 10,
      gap: 10,
    },
    progressTrack: {
      flex: 1,
      height: 6,
      backgroundColor: C.borderLight,
      borderRadius: 3,
      overflow: 'hidden',
    },
    progressFill: { height: '100%', borderRadius: 3 },
    progressText: {
      fontSize: FontSize.caption,
      fontWeight: '700',
      color: C.textSecondary,
    },

    // ─── Question ───
    questionScroll: { paddingHorizontal: Spacing.xl, paddingBottom: 40 },
    questionCard: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.xl,
      padding: 20,
      marginBottom: 16,
    },
    questionMeta: {
      flexDirection: 'row',
      marginBottom: 12,
    },
    questionText: {
      fontSize: FontSize.callout,
      fontWeight: '600',
      color: C.text,
      lineHeight: LineHeight.callout,
    },

    // ─── Statements（個数・組み合わせ問題） ───
    statementsBox: { backgroundColor: C.card, borderRadius: BorderRadius.md, padding: 14, marginBottom: 12, gap: 2 },
    statementRow: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 6, borderRadius: BorderRadius.sm, borderLeftWidth: 3, borderLeftColor: 'transparent' },
    statementCorrect: { backgroundColor: C.success + '08', borderLeftColor: C.success },
    statementWrong: { backgroundColor: C.error + '08', borderLeftColor: C.error },
    statementLabel: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.borderLight, alignItems: 'center', justifyContent: 'center', marginRight: 10, marginTop: 2 },
    statementLabelText: { fontSize: FontSize.caption, fontWeight: '800', color: C.textSecondary },
    statementText: { fontSize: FontSize.subhead, color: C.text, lineHeight: LineHeight.subhead },
    statementResult: { fontSize: FontSize.caption2, fontWeight: '700', marginTop: 3 },
    statementExpl: { fontSize: FontSize.caption2, color: C.textSecondary, marginTop: 3, lineHeight: 16 },

    // ─── Choices ───
    choicesWrap: { gap: 8, marginBottom: 16 },
    choiceCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.card,
      borderRadius: BorderRadius.md,
      padding: 14,
      gap: 12,
      borderWidth: 1.5,
      borderColor: C.border,
    },
    choiceCorrect: {
      backgroundColor: C.successSurface,
      borderColor: C.success,
    },
    choiceWrong: {
      backgroundColor: C.errorSurface,
      borderColor: C.error,
    },
    choiceLabelWrap: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: C.borderLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    choiceLabelWrapCorrect: { backgroundColor: C.success },
    choiceLabelWrapWrong: { backgroundColor: C.error },
    choiceLabelText: {
      fontSize: FontSize.footnote,
      fontWeight: '800',
      color: C.textSecondary,
    },
    choiceLabelTextCorrect: { color: C.white },
    choiceLabelTextWrong: { color: C.white },
    choiceLabel: {},
    choiceLabelCorrect: {},
    choiceLabelWrong: {},
    choiceText: {
      flex: 1,
      fontSize: FontSize.subhead,
      color: C.text,
      lineHeight: LineHeight.subhead,
    },

    // ─── Per-choice Explanation ───
    choiceExplBox: { marginLeft: 44, marginRight: 8, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: BorderRadius.md, borderLeftWidth: 3 },
    choiceExplCorrect: { backgroundColor: C.successSurface, borderLeftColor: C.success },
    choiceExplWrong: { backgroundColor: C.errorSurface, borderLeftColor: C.error },
    choiceExplNeutral: { backgroundColor: C.background, borderLeftColor: C.border },
    choiceExplText: { fontSize: FontSize.footnote, color: C.textSecondary, lineHeight: LineHeight.footnote },
    choiceAiBtn: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 10, paddingVertical: 5, borderRadius: BorderRadius.sm, backgroundColor: C.infoSurface, borderWidth: 1, borderColor: C.border },
    choiceAiBtnText: { fontSize: FontSize.caption2, fontWeight: '700', color: C.primary },

    // ─── Explanation ───
    explanationCard: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      padding: 18,
      marginBottom: 16,
    },
    explanationLabel: {
      fontSize: FontSize.subhead,
      fontWeight: '700',
      color: C.text,
      marginBottom: 10,
    },
    explanationText: {
      fontSize: FontSize.footnote,
      color: C.textSecondary,
      lineHeight: LineHeight.footnote,
    },

    // ─── AI Open Button ───
    aiBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, backgroundColor: C.infoSurface, borderRadius: BorderRadius.lg, padding: 14, borderWidth: 1, borderColor: C.border },
    aiBtnIcon: { fontSize: 24 },
    aiBtnText: { fontSize: FontSize.subhead, fontWeight: '700', color: C.primary },
    aiBtnSub: { fontSize: FontSize.caption2, color: C.textTertiary, marginTop: 1 },

    // ─── Next Button ───
    nextBtn: {
      borderRadius: BorderRadius.lg,
      paddingVertical: 16,
      alignItems: 'center',
      marginBottom: 16,
    },
    nextBtnText: {
      fontSize: FontSize.subhead,
      fontWeight: '700',
      color: C.white,
    },

    // ─── Exit Button ───
    exitBtn: { alignItems: 'center', marginTop: 12, marginBottom: 8, paddingVertical: 14, backgroundColor: C.card, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: C.border },
    exitBtnText: { fontSize: FontSize.subhead, fontWeight: '600', color: C.textSecondary },

    // ─── Difficulty Badge ───
    diffBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: BorderRadius.sm,
    },
    diffBadgeText: {
      fontSize: FontSize.caption2,
      fontWeight: '700',
    },

    // ─── Result ───
    resultScroll: { padding: Spacing.xl, paddingTop: 40 },
    resultCard: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.xxl,
      padding: 30,
      alignItems: 'center',
    },
    resultEmoji: { fontSize: 56, marginBottom: 12 },
    resultTitle: {
      fontSize: FontSize.title2,
      fontWeight: '800',
      color: C.text,
      letterSpacing: LetterSpacing.tight,
    },
    resultSubtitle: {
      fontSize: FontSize.subhead,
      color: C.textSecondary,
      marginTop: 4,
    },
    resultScoreBox: {
      alignItems: 'center',
      marginTop: 24,
    },
    resultScore: {
      fontSize: 48,
      fontWeight: '900',
      letterSpacing: LetterSpacing.tight,
    },
    resultScoreLabel: {
      fontSize: FontSize.footnote,
      color: C.textSecondary,
      marginTop: 4,
    },
    resultBar: {
      width: '100%',
      marginTop: 24,
    },
    resultBarTrack: {
      height: 10,
      backgroundColor: C.borderLight,
      borderRadius: 5,
      overflow: 'hidden',
      position: 'relative',
    },
    resultBarFill: {
      height: '100%',
      borderRadius: 5,
    },
    resultPassLine: {
      position: 'absolute',
      top: -4,
      width: 2,
      height: 18,
      backgroundColor: C.text,
      borderRadius: 1,
    },
    resultPassText: {
      fontSize: FontSize.caption2,
      color: C.textTertiary,
      textAlign: 'center',
      marginTop: 6,
    },
    resultMessage: {
      fontSize: FontSize.footnote,
      fontWeight: '700',
      marginTop: 20,
      textAlign: 'center',
      lineHeight: LineHeight.footnote,
    },
    resultActions: {
      marginTop: 24,
      gap: 12,
    },
    retryBtn: {
      borderRadius: BorderRadius.lg,
      paddingVertical: 16,
      alignItems: 'center',
    },
    retryBtnText: {
      fontSize: FontSize.subhead,
      fontWeight: '700',
      color: C.white,
    },
    mapBtn: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      paddingVertical: 16,
      alignItems: 'center',
    },
    mapBtnText: {
      fontSize: FontSize.subhead,
      fontWeight: '700',
    },

    // ─── AI Fullscreen ───
    aiSafe: { flex: 1, backgroundColor: C.background },
    aiHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
    aiHeaderTitle: { fontSize: FontSize.headline, fontWeight: '800', color: C.text },
    aiClose: { fontSize: 22, color: C.textTertiary, padding: 4 },
    aiChat: { flex: 1 },
    aiChatContent: { padding: 16, paddingBottom: 10 },
    aiContextCard: { backgroundColor: C.card, borderRadius: BorderRadius.xl, marginBottom: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
    aiContextHeader: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.primarySurface },
    aiContextTitle: { fontSize: FontSize.subhead, fontWeight: '700', color: C.primaryDark },
    aiContextBody: { padding: 16 },
    aiContextQuestion: { fontSize: FontSize.subhead, fontWeight: '600', color: C.text, lineHeight: LineHeight.subhead },
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
  });
}
