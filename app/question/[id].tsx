import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Animated,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { Shadow, FontSize, LineHeight, LetterSpacing, Spacing, BorderRadius, DifficultyLabel, DifficultyColor } from '../../constants/theme';
import { useThemeColors, ThemeColors } from '../../hooks/useThemeColors';
import { CATEGORY_LABELS, CATEGORY_COLORS, Category, ConfidenceLevel, AIChatMessage } from '../../types';
import { getQuestionById, getGlossaryByTags, getGlossaryBySlug, ALL_QUESTIONS } from '../../data';
import { useProgressStore } from '../../store/useProgressStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { ReportModal } from '../../components/ReportModal';
import { HighlightedText } from '../../components/HighlightedText';
import { canAccess } from '../../services/accessControl';
import { askAI } from '../../services/claude';
import { useAchievementChecker } from '../../hooks/useAchievementChecker';
import { useAnswerFeedback } from '../../components/AnswerFeedback';
import { LawAmendmentBadge } from '../../components/LawAmendmentBadge';

const LABELS = ['A', 'B', 'C', 'D'] as const;
const STMT_LABELS = ['ア', 'イ', 'ウ', 'エ'] as const;
type State = 'idle' | 'correct' | 'wrong';

/** Fisher-Yates シャッフル（選択肢の順番をランダム化） */
function shuffleIndices(length: number): number[] {
  const arr = Array.from({ length }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function QuestionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const nav = useNavigation();
  const recordAnswer = useProgressStore((s) => s.recordAnswer);
  const toggleBookmark = useProgressStore((s) => s.toggleBookmark);
  const getProgress = useProgressStore((s) => s.getProgress);
  const checkAchievements = useAchievementChecker();
  const { triggerCorrect, triggerWrong, FeedbackOverlay } = useAnswerFeedback();

  // ★ 現在の問題IDをReact stateで管理（router.replaceを使わない）
  const [currentId, setCurrentId] = useState(id);

  const q = getQuestionById(currentId);
  const prog = q ? getProgress(q.id) : undefined;
  // 選択肢シャッフル: 表示位置→元のindex のマッピング
  // 個数問題・組み合わせ問題は選択肢をシャッフルしない
  const isSpecialFormat = q?.questionFormat === 'count' || q?.questionFormat === 'combination';
  const [shuffledMap, setShuffledMap] = useState(() => q ? (isSpecialFormat ? [0, 1, 2, 3] : shuffleIndices(q.choices.length)) : [0, 1, 2, 3]);
  const [selected, setSelected] = useState<number | null>(null); // 元のindex
  const [state, setState] = useState<State>('idle');
  const [showModal, setShowModal] = useState(false);
  const [modalTerm, setModalTerm] = useState<{ term: string; definition: string; relatedTerms: string[] } | null>(null);
  const explainAnimRef = useRef(new Animated.Value(0));
  const [reportVisible, setReportVisible] = useState(false);

  // AI Chat state (fullscreen)
  const [aiVisible, setAiVisible] = useState(false);
  const [aiTargetChoice, setAiTargetChoice] = useState<number | null>(null);
  const [aiMessages, setAiMessages] = useState<AIChatMessage[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const aiScrollRef = useRef<ScrollView>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  const canAI = useSettingsStore((st) => st.canUseAI());
  const isPro = useSettingsStore((st) => st.isPro());
  const incrementAIQuery = useSettingsStore((st) => st.incrementAIQuery);

  const colors = useThemeColors();
  const { width: screenWidth } = useWindowDimensions();
  const isWideScreen = screenWidth >= 768;
  const s = useMemo(() => makeStyles(colors, isWideScreen), [colors, isWideScreen]);

  useEffect(() => {
    if (!q) return;
    nav.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={() => setReportVisible(true)} style={{ paddingHorizontal: 8 }} accessibilityRole="button" accessibilityLabel="問題を報告する">
            <Text style={{ fontSize: 20 }}>⚠️</Text>
          </Pressable>
          <Pressable onPress={() => toggleBookmark(q.id)} style={{ paddingHorizontal: 16 }} accessibilityRole="button" accessibilityLabel={prog?.bookmarked ? 'ブックマークを解除' : 'ブックマークに追加'}>
            <Text style={{ fontSize: 22 }}>{prog?.bookmarked ? '🔖' : '📑'}</Text>
          </Pressable>
        </View>
      ),
    });
  }, [nav, q, prog?.bookmarked]);

  // 確信度選択前の一時保存（recordAnswerは確信度選択後に呼ぶ）
  const [pendingAnswer, setPendingAnswer] = useState<{ questionId: string; category: Category; isCorrect: boolean } | null>(null);

  const handleSelect = useCallback((idx: number) => {
    if (state !== 'idle' || !q) return;
    setSelected(idx);
    const ok = idx === q.correctIndex;
    setState(ok ? 'correct' : 'wrong');
    // recordAnswerは確信度選択後に呼ぶ（SM-2精度向上）
    setPendingAnswer({ questionId: q.id, category: q.category, isCorrect: ok });
    // 🎯 中毒性フィードバック（紙吹雪+ハプティック+コンボ）
    if (ok) triggerCorrect(); else triggerWrong();
    Animated.timing(explainAnimRef.current, { toValue: 1, duration: 350, useNativeDriver: true }).start();
  }, [state, q, triggerCorrect, triggerWrong]);

  const openGlossary = useCallback((tag: string) => {
    const m = getGlossaryByTags([tag]);
    if (m.length > 0) {
      setModalTerm({ term: m[0].term, definition: m[0].definition, relatedTerms: m[0].relatedTerms });
      setShowModal(true);
    }
  }, []);

  const nextQ = useCallback(() => {
    if (!q) return;
    const i = ALL_QUESTIONS.findIndex((x) => x.id === q.id);
    const next = ALL_QUESTIONS[(i + 1) % ALL_QUESTIONS.length];
    // ★ ナビゲーションではなくstateで問題を切り替え（戻るボタンを壊さない）
    setCurrentId(next.id);
    setSelected(null);
    setState('idle');
    setPendingAnswer(null);
    const nextIsSpecial = next.questionFormat === 'count' || next.questionFormat === 'combination';
    setShuffledMap(nextIsSpecial ? [0, 1, 2, 3] : shuffleIndices(next.choices.length));
    explainAnimRef.current = new Animated.Value(0);
    setAiMessages([]);
    setAiTargetChoice(null);
    setAiInput('');
    // スクロールを先頭に戻す
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
  }, [q]);

  /** 確信度を選んで記録 → 次の問題へ進む */
  const handleConfidenceAndNext = useCallback((confidence: ConfidenceLevel) => {
    if (pendingAnswer) {
      recordAnswer(pendingAnswer.questionId, pendingAnswer.category, pendingAnswer.isCorrect, confidence);
      setPendingAnswer(null);
      setTimeout(() => checkAchievements(), 0);
    }
    nextQ();
  }, [pendingAnswer, recordAnswer, checkAchievements, nextQ]);

  const openAI = useCallback((_prefill?: string, choiceIdx?: number) => {
    if (!aiVisible) setAiMessages([]);
    setAiInput('');
    setAiTargetChoice(choiceIdx ?? null);
    setAiVisible(true);
  }, [aiVisible]);

  const askAboutChoice = useCallback((choiceIdx: number) => {
    if (!q) return;
    const label = LABELS[choiceIdx];
    openAI(`選択肢${label}「${q.choices[choiceIdx]}」について詳しく教えて`, choiceIdx);
  }, [q, openAI]);

  const sendAIMessage = useCallback(async () => {
    if (!q || !aiInput.trim() || aiLoading || !canAI) return;

    const userMsg = aiInput.trim();
    setAiInput('');
    setAiMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setAiLoading(true);
    incrementAIQuery();

    try {
      const context = buildAIContext(q, selected, state);
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
  }, [q, aiInput, aiLoading, canAI, aiMessages, selected, state]);

  if (!q) {
    return (
      <View style={s.safe}><Text style={s.errorText}>問題が見つかりません</Text></View>
    );
  }

  // フリーミアム制御
  if (!canAccess(isPro, 'question', q.id)) {
    return (
      <View style={[s.safe, s.lockContainer]}>
        <Text style={s.lockEmoji}>🔒</Text>
        <Text style={s.lockTitle}>PREMIUM会員限定</Text>
        <Text style={s.lockDesc}>
          この問題はPREMIUMプランでご利用いただけます。{'\n'}
          無料プランでは最初の30問をご利用いただけます。
        </Text>
        <Pressable
          style={[s.lockBtn, Shadow.md]}
          onPress={() => router.push('/paywall')}
        >
          <Text style={s.lockBtnText}>プランを見る</Text>
        </Pressable>
      </View>
    );
  }

  const catColor = CATEGORY_COLORS[q.category];
  const answered = state !== 'idle';

  /** AI チャット UI（モーダル内 or サイドパネル共通） */
  const renderAIChat = () => (
    <>
      {/* Header */}
      <View style={s.aiHeader}>
        <Text style={s.aiHeaderTitle}>🤖 AI解説アシスタント</Text>
        <Pressable onPress={() => setAiVisible(false)} hitSlop={12}>
          <Text style={s.aiClose}>✕</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          ref={aiScrollRef}
          style={s.aiChat}
          contentContainerStyle={s.aiChatContent}
          onContentSizeChange={() => {
            if (aiMessages.length > 0) aiScrollRef.current?.scrollToEnd({ animated: true });
          }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Context Card */}
          {aiTargetChoice !== null ? (
            <View style={s.aiContextCard}>
              <View style={s.aiContextHeader}>
                <Text style={s.aiContextTitle}>📋 選択肢{LABELS[aiTargetChoice]}について質問中</Text>
              </View>
              <View style={s.aiContextBody}>
                <View style={[s.aiContextChoice, aiTargetChoice === q.correctIndex ? s.aiContextChoiceCorrect : s.aiContextChoiceWrong]}>
                  <Text style={[s.aiContextChoiceLabel, aiTargetChoice === q.correctIndex ? s.aiContextChoiceLabelCorrect : s.aiContextChoiceLabelWrong]}>{LABELS[aiTargetChoice]}</Text>
                  <Text style={s.aiContextChoiceText}>{q.choices[aiTargetChoice]}</Text>
                  <Text style={{ fontSize: 12 }}>{aiTargetChoice === q.correctIndex ? ' ✓' : ' ✗'}</Text>
                </View>
                {q.choiceExplanations?.[aiTargetChoice] && (
                  <Text style={s.aiContextExplText}>{q.choiceExplanations[aiTargetChoice]}</Text>
                )}
              </View>
            </View>
          ) : (
            <View style={s.aiContextCard}>
              <View style={s.aiContextHeader}>
                <Text style={s.aiContextTitle}>📋 問題について質問中</Text>
              </View>
              <View style={s.aiContextBody}>
                <Text style={s.aiContextQuestion} numberOfLines={3}>{q.text}</Text>
              </View>
            </View>
          )}

          {/* Suggestions */}
          {aiMessages.length === 0 && (
            <View style={s.aiSuggestions}>
              {[
                'この問題をわかりやすく解説して',
                '具体例を使って説明して',
                '関連する条文を教えて',
              ].map((sug) => (
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
        {!canAI && (
          <Text style={s.aiLimitText}>本日のAI質問回数の上限に達しました</Text>
        )}
      </KeyboardAvoidingView>
    </>
  );

  return (
    <View style={s.splitContainer}>
    <FeedbackOverlay />
    <ScrollView ref={scrollViewRef} style={[s.safe, isWideScreen && s.splitMain]} contentContainerStyle={s.scroll}>
      {/* Meta */}
      <View style={s.metaRow}>
        <View style={[s.metaPill, { backgroundColor: catColor + '14' }]}>
          <Text style={[s.metaPillText, { color: catColor }]}>{CATEGORY_LABELS[q.category]}</Text>
        </View>
        <View style={[s.metaPill, { backgroundColor: DifficultyColor[q.difficulty] + '14' }]}>
          <Text style={[s.metaPillText, { color: DifficultyColor[q.difficulty] }]}>{DifficultyLabel[q.difficulty]}</Text>
        </View>
      </View>

      {/* Question */}
      <View style={[s.questionBox, Shadow.sm]}>
        <HighlightedText
          text={q.text}
          style={s.questionText}
          onTermPress={(term) => {
            setModalTerm({ term: term.term, definition: term.definition, relatedTerms: term.relatedTerms });
            setShowModal(true);
          }}
        />
      </View>

      {/* Law Amendment Badge */}
      <LawAmendmentBadge tags={q.tags} />

      {/* Statements（個数問題・組み合わせ問題のア〜エ記述） */}
      {q.statements && q.statements.length > 0 && (
        <View style={s.statementsBox}>
          {q.statements.map((stmt, i) => {
            const stmtCorrect = q.statementAnswers?.[i];
            const showResult = answered && stmtCorrect !== undefined;
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
                  {answered && q.statementExplanations?.[i] && (
                    <Text style={s.statementExpl}>{q.statementExplanations[i]}</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Choices (シャッフル済み) */}
      <View style={s.choiceList}>
        {shuffledMap.map((origIdx, displayIdx) => {
          const choice = q.choices[origIdx];
          const isCorrect = origIdx === q.correctIndex;
          const isSelected = origIdx === selected;

          const isCorrectAnswer = answered && isCorrect;
          const isWrongAnswer = answered && isSelected && !isCorrect;
          const cardExtra = isCorrectAnswer
            ? { borderColor: colors.success, backgroundColor: colors.successSurface }
            : isWrongAnswer
              ? { borderColor: colors.error, backgroundColor: colors.errorSurface }
              : { borderColor: answered ? colors.border : 'transparent' };
          const labelBg = isCorrectAnswer ? colors.success : isWrongAnswer ? colors.error : colors.borderLight;
          const labelColor = isCorrectAnswer || isWrongAnswer ? colors.white : colors.textSecondary;

          const choiceExpl = answered && q.choiceExplanations ? q.choiceExplanations[origIdx] : null;

          return (
            <View key={origIdx}>
              <Pressable
                style={[s.choiceCard, cardExtra, Shadow.sm]}
                onPress={() => handleSelect(origIdx)}
                disabled={answered}
                accessibilityRole="button"
                accessibilityLabel={`選択肢${LABELS[displayIdx]}: ${choice}`}
              >
                <View style={[s.choiceLabel, { backgroundColor: labelBg }]}>
                  <Text style={[s.choiceLabelText, { color: labelColor }]}>{LABELS[displayIdx]}</Text>
                </View>
                <Text style={s.choiceText}>{choice}</Text>
                {answered && isCorrect && <Text style={s.checkMark}>✓</Text>}
                {isWrongAnswer && <Text style={s.crossMark}>✗</Text>}
              </Pressable>
              {/* Per-choice explanation */}
              {choiceExpl && (
                <View style={[s.choiceExplBox, isCorrectAnswer ? s.choiceExplCorrect : isWrongAnswer ? s.choiceExplWrong : s.choiceExplNeutral]}>
                  <Text style={s.choiceExplText}>{choiceExpl}</Text>
                  {isPro && (
                    <Pressable style={s.choiceAiBtn} onPress={() => askAboutChoice(origIdx)} accessibilityRole="button" accessibilityLabel={`選択肢${LABELS[displayIdx]}についてAIに聞く`}>
                      <Text style={s.choiceAiBtnText}>🤖 AIに聞く</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* Overall Explanation */}
      {answered && (
        <Animated.View style={[s.explainCard, Shadow.lg, { opacity: explainAnimRef.current, transform: [{ translateY: explainAnimRef.current.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
          <View style={s.explainHeader}>
            <View style={[s.explainBadge, { backgroundColor: state === 'correct' ? colors.successSurface : colors.errorSurface }]}>
              <Text style={s.explainBadgeIcon}>{state === 'correct' ? '⭕' : '❌'}</Text>
              <Text style={[s.explainBadgeText, { color: state === 'correct' ? colors.success : colors.error }]}>
                {state === 'correct' ? '正解！' : '不正解'}
              </Text>
            </View>
          </View>

          <Text style={s.explainLabel}>解説</Text>
          <Text style={s.explainText}>{q.explanation}</Text>

          {/* AI Button */}
          {isPro && (
            <Pressable style={[s.aiBtn, Shadow.sm]} onPress={() => openAI()} accessibilityRole="button" accessibilityLabel="AIに質問する">
              <Text style={s.aiBtnIcon}>🤖</Text>
              <View>
                <Text style={s.aiBtnText}>AIに質問する</Text>
                <Text style={s.aiBtnSub}>解説でわからない部分を聞こう</Text>
              </View>
            </Pressable>
          )}

          {/* 難易度セレクター（次の問題へ進むボタンを兼ねる） */}
          <View style={s.confidenceSection}>
            <View style={s.confidenceRow}>
              <Pressable
                style={[s.confidenceBtn, s.confidenceNone]}
                onPress={() => handleConfidenceAndNext('none')}
                accessibilityRole="button"
                accessibilityLabel="難しいと評価"
              >
                <Text style={s.confidenceNoneText}>難しい</Text>
              </Pressable>
              <Pressable
                style={[s.confidenceBtn, s.confidenceDefault]}
                onPress={() => handleConfidenceAndNext('low')}
                accessibilityRole="button"
                accessibilityLabel="普通と評価"
              >
                <Text style={s.confidenceDefaultText}>普通 →</Text>
              </Pressable>
              <Pressable
                style={[s.confidenceBtn, s.confidenceHigh]}
                onPress={() => handleConfidenceAndNext('high')}
                accessibilityRole="button"
                accessibilityLabel="簡単と評価"
              >
                <Text style={s.confidenceHighText}>簡単</Text>
              </Pressable>
            </View>
          </View>

          <Pressable
            style={s.exitBtn}
            accessibilityRole="button"
            accessibilityLabel="終了してホームに戻る"
            onPress={() => {
              // 未記録の場合はデフォルトで記録
              if (pendingAnswer) {
                recordAnswer(pendingAnswer.questionId, pendingAnswer.category, pendingAnswer.isCorrect);
                setPendingAnswer(null);
              }
              if (router.canDismiss()) {
                router.dismissAll();
              } else {
                router.replace('/');
              }
            }}
          >
            <Text style={s.exitBtnText}>✕ 終了してホームに戻る</Text>
          </Pressable>
        </Animated.View>
      )}

      {/* Glossary Modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <Pressable style={s.overlay} onPress={() => setShowModal(false)}>
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            {modalTerm && (
              <>
                <Text style={s.sheetTitle}>{modalTerm.term}</Text>
                <View style={s.sheetDivider} />
                <Text style={s.sheetDef}>{modalTerm.definition}</Text>
              </>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* AI Modal (スマホ用 - ワイド画面ではサイドパネルを使用) */}
      {!isWideScreen && (
        <Modal visible={aiVisible} animationType="slide" onRequestClose={() => setAiVisible(false)}>
          <SafeAreaView style={s.aiSafe}>
            {renderAIChat()}
          </SafeAreaView>
        </Modal>
      )}

      <ReportModal
        visible={reportVisible}
        questionId={q.id}
        onClose={() => setReportVisible(false)}
      />

      <View style={{ height: 60 }} />
    </ScrollView>

    {/* AI Side Panel（PC/タブレット用 - 問題の横に常時表示） */}
    {isWideScreen && aiVisible && (
      <View style={s.splitSide}>
        {renderAIChat()}
      </View>
    )}
    </View>
  );
}

/** AI に渡す問題コンテキストを構築 */
function buildAIContext(
  q: NonNullable<ReturnType<typeof getQuestionById>>,
  selected: number | null,
  state: State,
): string {
  const format = q.questionFormat ?? 'standard';
  const lines = [
    `【宅建試験問題${format === 'count' ? '（個数問題）' : format === 'combination' ? '（組み合わせ問題）' : ''}】`,
    `カテゴリ: ${CATEGORY_LABELS[q.category]}`,
    `問題: ${q.text}`,
  ];
  if (q.statements && q.statements.length > 0) {
    lines.push('', '記述:');
    q.statements.forEach((stmt, i) => {
      const label = ['ア', 'イ', 'ウ', 'エ'][i];
      const correct = q.statementAnswers?.[i];
      lines.push(`${label}. ${stmt}${correct !== undefined ? (correct ? ' → 正しい' : ' → 誤り') : ''}`);
    });
  }
  lines.push(
    '',
    ...q.choices.map((c, i) => `${LABELS[i]}. ${c}${i === q.correctIndex ? ' ← 正解' : ''}`),
    '',
    `ユーザーの回答: ${selected !== null ? LABELS[selected] : '未回答'} (${state === 'correct' ? '正解' : '不正解'})`,
    '',
    `解説: ${q.explanation}`,
  );
  if (q.choiceExplanations) {
    lines.push('', '各選択肢の解説:');
    q.choiceExplanations.forEach((e, i) => lines.push(`${LABELS[i]}: ${e}`));
  }
  return lines.join('\n');
}

function makeStyles(C: ThemeColors, isWide = false) {
  return StyleSheet.create({
    // ─── Split Layout (PC/タブレット) ───
    splitContainer: { flex: 1, flexDirection: isWide ? 'row' : 'column', backgroundColor: C.background },
    splitMain: { flex: 1, maxWidth: isWide ? '60%' : '100%' },
    splitSide: { width: isWide ? '40%' : '100%', borderLeftWidth: 1, borderLeftColor: C.border, backgroundColor: C.background },

    safe: { flex: 1, backgroundColor: C.background },
    scroll: { padding: Spacing.xl },
    errorText: {
      fontSize: FontSize.body,
      color: C.textTertiary,
      textAlign: 'center',
      marginTop: 100,
    },

    // ─── Lock Screen ───
    lockContainer: { padding: Spacing.xxl, justifyContent: 'center', alignItems: 'center' },
    lockEmoji: { fontSize: 48, marginBottom: Spacing.lg },
    lockTitle: { fontSize: FontSize.headline, fontWeight: '800', color: C.text, marginBottom: Spacing.sm },
    lockDesc: { fontSize: FontSize.footnote, color: C.textSecondary, textAlign: 'center', marginBottom: Spacing.xxl, lineHeight: LineHeight.footnote },
    lockBtn: { backgroundColor: C.primary, paddingHorizontal: 32, paddingVertical: 14, borderRadius: BorderRadius.md },
    lockBtnText: { color: C.white, fontSize: FontSize.subhead, fontWeight: '700' },

    // ─── Meta ───
    metaRow: { flexDirection: 'row', gap: 8, marginBottom: Spacing.lg },
    metaPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: BorderRadius.sm },
    metaPillText: { fontSize: FontSize.footnote, fontWeight: '700', letterSpacing: LetterSpacing.wide },

    // ─── Question ───
    questionBox: { backgroundColor: C.card, borderRadius: BorderRadius.xl, padding: Spacing.xxl, marginBottom: Spacing.xl, borderLeftWidth: 4, borderLeftColor: C.primary },
    questionText: { fontSize: FontSize.callout, fontWeight: '600', color: C.text, lineHeight: LineHeight.callout },

    // ─── Statements（個数・組み合わせ問題） ───
    statementsBox: { backgroundColor: C.card, borderRadius: BorderRadius.lg, padding: Spacing.lg, marginBottom: Spacing.xl, gap: 2 },
    statementRow: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 8, borderRadius: BorderRadius.md, borderLeftWidth: 3, borderLeftColor: 'transparent' },
    statementCorrect: { backgroundColor: C.success + '08', borderLeftColor: C.success },
    statementWrong: { backgroundColor: C.error + '08', borderLeftColor: C.error },
    statementLabel: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.borderLight, alignItems: 'center', justifyContent: 'center', marginRight: 12, marginTop: 2 },
    statementLabelText: { fontSize: FontSize.footnote, fontWeight: '800', color: C.textSecondary },
    statementText: { fontSize: FontSize.subhead, color: C.text, lineHeight: LineHeight.subhead },
    statementResult: { fontSize: FontSize.caption, fontWeight: '700', marginTop: 4 },
    statementExpl: { fontSize: FontSize.caption, color: C.textSecondary, marginTop: 4, lineHeight: LineHeight.caption },

    // ─── Choices ───
    choiceList: { gap: 4 },
    choiceCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: BorderRadius.lg, padding: Spacing.lg, borderWidth: 2, borderColor: 'transparent' },
    choiceLabel: { width: 34, height: 34, borderRadius: BorderRadius.sm, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
    choiceLabelText: { fontSize: FontSize.subhead, fontWeight: '800' },
    choiceText: { flex: 1, fontSize: FontSize.subhead, color: C.text, lineHeight: LineHeight.subhead },
    checkMark: { fontSize: 20, color: C.success, fontWeight: '800', marginLeft: 8 },
    crossMark: { fontSize: 20, color: C.error, fontWeight: '800', marginLeft: 8 },

    // ─── Per-choice Explanation ───
    choiceExplBox: { marginLeft: 48, marginRight: 8, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: BorderRadius.md, borderLeftWidth: 3 },
    choiceExplCorrect: { backgroundColor: C.successSurface, borderLeftColor: C.success },
    choiceExplWrong: { backgroundColor: C.errorSurface, borderLeftColor: C.error },
    choiceExplNeutral: { backgroundColor: C.background, borderLeftColor: C.border },
    choiceExplText: { fontSize: FontSize.footnote, color: C.textSecondary, lineHeight: LineHeight.footnote },
    choiceAiBtn: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 10, paddingVertical: 5, borderRadius: BorderRadius.sm, backgroundColor: C.infoSurface, borderWidth: 1, borderColor: C.border },
    choiceAiBtnText: { fontSize: FontSize.caption2, fontWeight: '700', color: C.primary },

    // ─── Explanation ───
    explainCard: { marginTop: Spacing.xxl, backgroundColor: C.card, borderRadius: BorderRadius.xl, padding: Spacing.xxl },
    explainHeader: { marginBottom: 14 },
    explainBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 7, borderRadius: BorderRadius.md, gap: 6 },
    explainBadgeIcon: { fontSize: 18 },
    explainBadgeText: { fontSize: FontSize.body, fontWeight: '800' },
    explainLabel: { fontSize: FontSize.footnote, fontWeight: '700', color: C.textTertiary, marginBottom: 6, letterSpacing: LetterSpacing.wide },
    explainText: { fontSize: FontSize.subhead, color: C.textSecondary, lineHeight: LineHeight.body },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
    tag: { backgroundColor: C.primarySurface, paddingHorizontal: 12, paddingVertical: 5, borderRadius: BorderRadius.full },
    tagText: { fontSize: FontSize.footnote, color: C.primary, fontWeight: '600' },

    // ─── AI Open Button ───
    aiBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20, backgroundColor: C.infoSurface, borderRadius: BorderRadius.lg, padding: 16, borderWidth: 1, borderColor: C.border },
    aiBtnIcon: { fontSize: 28 },
    aiBtnText: { fontSize: FontSize.subhead, fontWeight: '700', color: C.primary },
    aiBtnSub: { fontSize: FontSize.caption2, color: C.textTertiary, marginTop: 2 },

    nextBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: Spacing.xxl, backgroundColor: C.primary, paddingVertical: Spacing.lg, borderRadius: BorderRadius.lg, gap: 8 },
    nextBtnText: { fontSize: FontSize.body, fontWeight: '700', color: C.white },
    nextBtnArrow: { fontSize: FontSize.headline, fontWeight: '700', color: C.white },

    // ─── Difficulty Selector（難しい / 普通 / 簡単）───
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

    exitBtn: { alignItems: 'center', marginTop: 16, marginBottom: 20, paddingVertical: 16, backgroundColor: C.card, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: C.border },
    exitBtnText: { fontSize: FontSize.subhead, fontWeight: '600', color: C.textSecondary },

    // ─── Glossary Modal ───
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: C.card, borderTopLeftRadius: BorderRadius.xxl, borderTopRightRadius: BorderRadius.xxl, padding: Spacing.xxl, paddingBottom: 40, maxHeight: '55%' },
    sheetHandle: { width: 40, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.xl },
    sheetTitle: { fontSize: FontSize.title3, fontWeight: '800', color: C.text },
    sheetDivider: { width: 40, height: 3, backgroundColor: C.primarySurface, borderRadius: 2, marginVertical: 14 },
    sheetDef: { fontSize: FontSize.subhead, color: C.textSecondary, lineHeight: LineHeight.body },
    relatedRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: Spacing.lg, gap: 6 },
    relatedLabel: { fontSize: FontSize.footnote, color: C.textTertiary },
    relatedChip: { fontSize: FontSize.footnote, color: C.primary, backgroundColor: C.primarySurface, paddingHorizontal: 10, paddingVertical: 3, borderRadius: BorderRadius.sm },

    // ─── AI Fullscreen ───
    aiSafe: {
      flex: 1,
      backgroundColor: C.background,
    },
    aiHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 12,
      backgroundColor: C.card,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    aiHeaderTitle: {
      fontSize: FontSize.headline,
      fontWeight: '800',
      color: C.text,
    },
    aiClose: {
      fontSize: 22,
      color: C.textTertiary,
      padding: 4,
    },
    aiChat: {
      flex: 1,
    },
    aiChatContent: {
      padding: 16,
      paddingBottom: 10,
    },

    // ─── AI Context Card ───
    aiContextCard: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.xl,
      marginBottom: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: C.border,
    },
    aiContextHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: C.primarySurface,
    },
    aiContextTitle: {
      fontSize: FontSize.subhead,
      fontWeight: '700',
      color: C.primaryDark,
    },
    aiContextBody: {
      padding: 16,
    },
    aiContextQuestion: {
      fontSize: FontSize.subhead,
      fontWeight: '600',
      color: C.text,
      lineHeight: LineHeight.subhead,
      marginBottom: 12,
    },
    aiContextChoice: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: BorderRadius.sm,
      backgroundColor: C.background,
    },
    aiContextChoiceCorrect: {
      backgroundColor: C.successSurface,
    },
    aiContextChoiceWrong: {
      backgroundColor: C.errorSurface,
    },
    aiContextChoiceLabel: {
      fontSize: FontSize.footnote,
      fontWeight: '800',
      color: C.textTertiary,
      marginRight: 8,
      width: 18,
    },
    aiContextChoiceLabelCorrect: {
      color: C.success,
    },
    aiContextChoiceLabelWrong: {
      color: C.error,
    },
    aiContextChoiceText: {
      flex: 1,
      fontSize: FontSize.footnote,
      color: C.textSecondary,
      lineHeight: LineHeight.footnote,
    },
    aiContextExplText: {
      fontSize: FontSize.subhead,
      color: C.textSecondary,
      lineHeight: LineHeight.subhead,
      marginTop: 10,
    },

    // ─── AI Chat Elements ───
    aiSuggestions: {
      gap: 10,
      marginBottom: 16,
    },
    aiSuggestionChip: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: C.border,
    },
    aiSuggestionText: {
      fontSize: FontSize.subhead,
      color: C.primary,
      fontWeight: '600',
    },
    aiMsg: {
      maxWidth: '85%',
      borderRadius: BorderRadius.lg,
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginBottom: 12,
    },
    aiMsgUser: {
      alignSelf: 'flex-end',
      backgroundColor: C.primary,
    },
    aiMsgAssistant: {
      alignSelf: 'flex-start',
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.border,
    },
    aiMsgText: {
      fontSize: FontSize.subhead,
      color: C.text,
      lineHeight: LineHeight.body,
    },
    aiMsgTextUser: { color: C.white },
    aiInputRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 12,
      borderTopWidth: 1,
      borderTopColor: C.border,
      backgroundColor: C.card,
    },
    aiInput: {
      flex: 1,
      backgroundColor: C.background,
      borderRadius: BorderRadius.lg,
      paddingHorizontal: 18,
      paddingVertical: 14,
      fontSize: FontSize.body,
      color: C.text,
      minHeight: 52,
      maxHeight: 140,
      borderWidth: 1,
      borderColor: C.border,
      lineHeight: LineHeight.body,
    },
    aiSendBtn: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    aiSendBtnDisabled: { backgroundColor: C.borderLight },
    aiSendIcon: {
      fontSize: 20,
      fontWeight: '800',
      color: C.white,
    },
    aiLimitText: {
      textAlign: 'center',
      fontSize: FontSize.caption2,
      color: C.error,
      paddingBottom: 12,
      backgroundColor: C.card,
    },
  });
}
