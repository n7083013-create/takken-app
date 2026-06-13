import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Animated,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getNextInAiQueue, clearAiQueue } from '../../utils/aiQueue';
import { Shadow, FontSize, LineHeight, LetterSpacing, Spacing, BorderRadius, DifficultyLabel, DifficultyColor } from '../../constants/theme';
import { useThemeColors, ThemeColors } from '../../hooks/useThemeColors';
import { Input } from '../../components/ui/Input';
import { CATEGORY_LABELS, CATEGORY_COLORS, Category, ConfidenceLevel, AIChatMessage } from '../../types';
import { getQuestionById, getGlossaryByTags, getGlossaryBySlug, ALL_QUESTIONS } from '../../data';
import { useProgressStore } from '../../store/useProgressStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { ReportModal } from '../../components/ReportModal';
import { HighlightedText } from '../../components/HighlightedText';
import { canAccess } from '../../services/accessControl';
import { askAI } from '../../services/claude';
import { sanitizeAIQuery } from '../../services/validation';
import { useAchievementChecker } from '../../hooks/useAchievementChecker';
import { useAnswerFeedback } from '../../components/AnswerFeedback';
import { LawAmendmentBadge } from '../../components/LawAmendmentBadge';
import { CoreEssenceBox } from '../../components/CoreEssenceBox';
import { StrikeHint } from '../../components/StrikeHint';
import { useStrikethrough } from '../../hooks/useStrikethrough';
import { hapticLight } from '../../services/haptics';
import { confirmAlert } from '../../services/alert';
import { AnimatedChoiceCard } from '../../components/AnimatedChoiceCard';
import { PressableScale } from '../../components/PressableScale';
import { WebBackButton } from '../../components/WebBackButton';
import { LimitReachedScreen } from '../../components/LimitReachedScreen';
import { InlineAILimitCTA } from '../../components/InlineAILimitCTA';
import {
  shouldShowChoiceExplanation,
  getStatementExplanation,
} from '../../utils/explanationVisibility';

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
  // [UX改善] AI分析「すべてスタート」から来た場合は source=ai。連続出題モードに入る。
  const { id, source } = useLocalSearchParams<{ id: string; source?: string }>();
  const isAiMode = source === 'ai';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const nav = useNavigation();
  const recordAnswer = useProgressStore((s) => s.recordAnswer);
  const getTodayFourChoiceCount = useProgressStore((s) => s.getTodayFourChoiceCount);
  const toggleBookmark = useProgressStore((s) => s.toggleBookmark);
  const markAsMastered = useProgressStore((s) => s.markAsMastered);
  const unmarkMastered = useProgressStore((s) => s.unmarkMastered);
  const getProgress = useProgressStore((s) => s.getProgress);
  const stats = useProgressStore((s) => s.stats);
  const checkAchievements = useAchievementChecker();
  const { triggerCorrect, triggerWrong, FeedbackOverlay } = useAnswerFeedback();

  // ★ 現在の問題IDをReact stateで管理（router.replaceを使わない）
  const [currentId, setCurrentId] = useState(id);

  // 消去法: 選択肢の打ち消し線（長押しで切替・問題が変わると自動リセット）
  const { toggleStrike, isStruck } = useStrikethrough(currentId);
  // [2026-05-22] 個数/組み合わせ問題用に statement (ア〜エ) 側の打ち消し線も独立管理
  // (キーを変えることで choice 側の state と分離)
  const {
    toggleStrike: toggleStmtStrike,
    isStruck: isStmtStruck,
  } = useStrikethrough(currentId ? `${currentId}:stmt` : undefined);

  const q = getQuestionById(currentId);
  const prog = q ? getProgress(q.id) : undefined;
  // 選択肢シャッフル: 表示位置→元のindex のマッピング
  // 個数問題・組み合わせ問題は選択肢をシャッフルしない
  const isSpecialFormat = q?.questionFormat === 'count' || q?.questionFormat === 'combination';
  const [shuffledMap, setShuffledMap] = useState(() => q ? (isSpecialFormat ? [0, 1, 2, 3] : shuffleIndices(q.choices.length)) : [0, 1, 2, 3]);

  // Issue #17: 同じ問題を URL から再訪したり、ブラウザ「戻る」で戻ったときに
  // 選択肢の位置が固定されたままだと暗記化リスク。currentId が変わるたびに再シャッフル。
  useEffect(() => {
    if (!q) return;
    const special = q.questionFormat === 'count' || q.questionFormat === 'combination';
    setShuffledMap(special ? [0, 1, 2, 3] : shuffleIndices(q.choices.length));
    setSelected(null);
    setState('idle');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);
  const [selected, setSelected] = useState<number | null>(null); // 元のindex
  const [state, setState] = useState<State>('idle');
  const [showModal, setShowModal] = useState(false);
  const [modalTerm, setModalTerm] = useState<{ term: string; definition: string; relatedTerms: string[] } | null>(null);
  const explainAnimRef = useRef(new Animated.Value(0));
  const [reportVisible, setReportVisible] = useState(false);
  const [bookmarkToast, setBookmarkToast] = useState<string | null>(null);
  const bookmarkToastTimerRef = useRef<any>(null);

  const handleToggleBookmark = useCallback(() => {
    if (!q) return;
    const wasBookmarked = !!prog?.bookmarked;
    toggleBookmark(q.id);
    hapticLight();
    setBookmarkToast(wasBookmarked ? 'ブックマークを解除しました' : 'ブックマークに追加しました');
    if (bookmarkToastTimerRef.current) clearTimeout(bookmarkToastTimerRef.current);
    bookmarkToastTimerRef.current = setTimeout(() => setBookmarkToast(null), 1500);
  }, [q, prog?.bookmarked, toggleBookmark]);

  /**
   * 「✓ 完璧に理解」: この問題を復習・苦手リストから永久除外する。
   * - すでにマスター済みなら解除確認を出す。
   * - 復習中に「もうこの問題は出さないで」を実現するユーザー向け脱出口。
   */
  const handleToggleMastered = useCallback(async () => {
    if (!q) return;
    const isMastered = prog?.mastered === true;
    if (isMastered) {
      const ok = await confirmAlert(
        'マスター済みを解除しますか？',
        'この問題が再び復習対象に戻ります。',
        { okText: '解除する' },
      );
      if (ok) {
        unmarkMastered(q.id);
        hapticLight();
        setBookmarkToast('マスター済みを解除しました');
      }
    } else {
      const ok = await confirmAlert(
        'この問題を「完璧」にしますか？',
        '復習や苦手リストにこの問題は表示されなくなります。\n記録画面からいつでも解除できます。',
        { okText: 'マスター済みにする' },
      );
      if (ok) {
        markAsMastered(q.id);
        hapticLight();
        setBookmarkToast('🎓 マスター済みにしました');
      }
    }
    if (bookmarkToastTimerRef.current) clearTimeout(bookmarkToastTimerRef.current);
    bookmarkToastTimerRef.current = setTimeout(() => setBookmarkToast(null), 1800);
  }, [q, prog?.mastered, markAsMastered, unmarkMastered]);

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
  const setAIRemainingFromServer = useSettingsStore((st) => st.setAIRemainingFromServer);
  const aiDailyRemaining = useSettingsStore((st) => st.getAIDailyRemaining());
  const aiDailyLimit = useSettingsStore((st) => st.getAIDailyLimit());
  const aiUsedToday = Math.max(0, aiDailyLimit - aiDailyRemaining);

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
          <Pressable
            onPress={handleToggleMastered}
            style={{ paddingHorizontal: 8 }}
            accessibilityRole="button"
            accessibilityLabel={prog?.mastered ? 'マスター済みを解除' : 'この問題を完璧にする(復習から除外)'}
          >
            <Text style={{ fontSize: 22, opacity: prog?.mastered ? 1 : 0.45 }}>🎓</Text>
          </Pressable>
          <Pressable onPress={handleToggleBookmark} style={{ paddingHorizontal: 16 }} accessibilityRole="button" accessibilityLabel={prog?.bookmarked ? 'ブックマークを解除' : 'ブックマークに追加'}>
            <Text style={{ fontSize: 22, opacity: prog?.bookmarked ? 1 : 0.45 }}>🔖</Text>
          </Pressable>
        </View>
      ),
    });
  }, [nav, q, prog?.bookmarked, prog?.mastered, handleToggleBookmark, handleToggleMastered]);

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

  /** 共通: 指定IDの問題に切り替える (state ベース、ナビゲーション不要) */
  const switchToQuestion = useCallback((nextId: string) => {
    const next = getQuestionById(nextId);
    if (!next) return;
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
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  const nextQ = useCallback(async () => {
    if (!q) return;
    // [UX改善] AI分析モードの場合: AIキューから次の問題を取得
    if (isAiMode) {
      const nextId = await getNextInAiQueue(
        {
          getItem: (k) => AsyncStorage.getItem(k),
          setItem: (k, v) => AsyncStorage.setItem(k, v),
          removeItem: (k) => AsyncStorage.removeItem(k),
        },
        q.id,
      );
      if (nextId) {
        switchToQuestion(nextId);
        return;
      }
      // キュー完了: 記録タブ (科目別分析) に戻る
      await clearAiQueue({
        getItem: (k) => AsyncStorage.getItem(k),
        setItem: (k, v) => AsyncStorage.setItem(k, v),
        removeItem: (k) => AsyncStorage.removeItem(k),
      });
      router.replace('/(tabs)/progress' as any);
      return;
    }
    // 通常モード: ALL_QUESTIONS の次へ
    const i = ALL_QUESTIONS.findIndex((x) => x.id === q.id);
    const next = ALL_QUESTIONS[(i + 1) % ALL_QUESTIONS.length];
    switchToQuestion(next.id);
  }, [q, isAiMode, router, switchToQuestion]);

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

  // origIdx=シャッフル前のデータ添字(テキスト/正誤/解説の参照用)、displayIdx=画面表示位置(A/B/C/Dラベル用)
  const askAboutChoice = useCallback((origIdx: number, displayIdx: number) => {
    if (!q) return;
    const label = LABELS[displayIdx];
    openAI(`選択肢${label}「${q.choices[origIdx]}」について詳しく教えて`, origIdx);
  }, [q, openAI]);

  const sendAIMessage = useCallback(async () => {
    if (!q || !aiInput.trim() || aiLoading || !canAI) return;

    const userMsg = sanitizeAIQuery(aiInput.trim());
    setAiInput('');
    setAiMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setAiLoading(true);

    try {
      const context = buildAIContext(q, selected, state, shuffledMap);
      const history = [...aiMessages, { role: 'user' as const, content: userMsg }];
      const result = await askAI(context, history);
      if (result.remaining !== null) {
        setAIRemainingFromServer(result.remaining);
      }
      setAiMessages((prev) => [...prev, { role: 'assistant', content: result.text }]);
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
      <View style={[s.safe, { paddingTop: insets.top }]}>
        <WebBackButton />
        <Text style={s.errorText}>問題が見つかりません</Text>
      </View>
    );
  }

  // フリーミアム制御: 1日10問まで（未回答状態で上限に達していれば表示）
  // [UX改善 2026-05] 共通 LimitReachedScreen + paywallCopy.ts に統一。
  // Celebration ファースト (「今日の10問達成！」) + streak shield + trial-first CTA。
  //
  // [2026-05-22] 4択 freemium 制限は 4択 raw count のみで判定。
  // getTodayAnswered() は 一問一答 × 0.2 が混ざるので、ここで使うと
  // 一問一答を解いた後に 4択を制限以下なのに弾く誤判定が発生する。
  const todayAnswered = getTodayFourChoiceCount();
  if (!canAccess(isPro, 'question', todayAnswered) && state === 'idle') {
    return (
      <LimitReachedScreen
        mode={{ kind: 'daily_limit_question', streak: stats.streak }}
        onUpgrade={() => router.push('/paywall')}
        onSecondary={() => router.replace('/(tabs)' as any)}
        secondaryLabel="ホームに戻る"
      />
    );
  }

  const catColor = CATEGORY_COLORS[q.category];
  const answered = state !== 'idle';

  /** AI チャット UI（モーダル内 or サイドパネル共通） */
  const renderAIChat = () => (
    <>
      {/* Header */}
      <View style={[s.aiHeader, !isWideScreen && { paddingTop: insets.top + 12 }]}>
        <Text style={s.aiHeaderTitle} numberOfLines={1}>🤖 AI解説アシスタント</Text>
        <Pressable onPress={() => setAiVisible(false)} hitSlop={12} style={s.aiCloseBtn} accessibilityRole="button" accessibilityLabel="AIチャットを閉じる">
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
                <Text style={s.aiContextTitle}>📋 選択肢{LABELS[shuffledMap.indexOf(aiTargetChoice)]}について質問中</Text>
              </View>
              <View style={s.aiContextBody}>
                <View style={[s.aiContextChoice, aiTargetChoice === q.correctIndex ? s.aiContextChoiceCorrect : s.aiContextChoiceWrong]}>
                  <Text style={[s.aiContextChoiceLabel, aiTargetChoice === q.correctIndex ? s.aiContextChoiceLabelCorrect : s.aiContextChoiceLabelWrong]}>{LABELS[shuffledMap.indexOf(aiTargetChoice)]}</Text>
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
          <Input
            variant="multiline"
            placeholder="質問を入力..."
            value={aiInput}
            onChangeText={setAiInput}
            rows={1}
            maxLength={500}
            disabled={aiLoading}
            accessibilityLabel="AIへの質問"
            containerStyle={s.aiInputFlex}
            inputStyle={s.aiInputBody}
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
          <InlineAILimitCTA
            usedToday={aiUsedToday}
            limit={aiDailyLimit}
            onUpgrade={() => router.push('/paywall')}
          />
        )}
      </KeyboardAvoidingView>
    </>
  );

  return (
    <View style={s.splitContainer}>
    <FeedbackOverlay />
    <View style={{ paddingTop: insets.top }}>
      <WebBackButton />
    </View>
    {/* ブックマーク操作のフィードバックトースト（1.5秒表示してフェードアウト） */}
    {bookmarkToast ? (
      <View pointerEvents="none" style={s.bookmarkToast}>
        <Text style={s.bookmarkToastText}>🔖 {bookmarkToast}</Text>
      </View>
    ) : null}
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

      {/* Statements（個数問題・組み合わせ問題のア〜エ記述）
          [2026-05-22] 未回答時は長押しで打ち消し線 (消去法) 対応 */}
      {q.statements && q.statements.length > 0 && (
        <View style={s.statementsBox}>
          {q.statements.map((stmt, i) => {
            const stmtCorrect = q.statementAnswers?.[i];
            const showResult = answered && stmtCorrect !== undefined;
            const stmtStruck = !answered && isStmtStruck(i);
            return (
              <Pressable
                key={i}
                style={[
                  s.statementRow,
                  showResult && (stmtCorrect ? s.statementCorrect : s.statementWrong),
                  stmtStruck && s.statementStruck,
                ]}
                onLongPress={() => {
                  if (answered) return;
                  hapticLight();
                  toggleStmtStrike(i);
                }}
                delayLongPress={350}
                disabled={answered}
                accessibilityRole="button"
                accessibilityLabel={`${STMT_LABELS[i]}: ${stmt}${stmtStruck ? '（消去済み）' : ''}`}
                accessibilityHint={!answered ? '長押しで打ち消し線の切り替え' : undefined}
              >
                <View style={[s.statementLabel, showResult && { backgroundColor: stmtCorrect ? colors.success + '20' : colors.error + '20' }]}>
                  <Text style={[s.statementLabelText, showResult && { color: stmtCorrect ? colors.success : colors.error }]}>{STMT_LABELS[i]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.statementText, stmtStruck && s.statementTextStruck]} selectable>{stmt}</Text>
                  {showResult && (
                    <Text style={[s.statementResult, { color: stmtCorrect ? colors.success : colors.error }]}>
                      {stmtCorrect ? '○ 正しい' : '✗ 誤り'}
                    </Text>
                  )}
                  {(() => {
                    const stmtExpl = getStatementExplanation(q, answered, i);
                    return stmtExpl ? <Text style={s.statementExpl} selectable>{stmtExpl}</Text> : null;
                  })()}
                </View>
                {stmtStruck && !answered && <Text style={s.strikeMark}>✕</Text>}
              </Pressable>
            );
          })}
        </View>
      )}

      {/* 消去法ヒント（未回答時のみ・ユーザー非表示設定可能）
          [2026-05-22] 個数/組み合わせ問題ではヒント文言を「ア〜エを長押し」に変更 */}
      {!answered && (
        <StrikeHint
          target={
            q.questionFormat === 'count' || q.questionFormat === 'combination'
              ? 'statement'
              : 'choice'
          }
        />
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

          // [Bugfix 2026-05] 個数問題・組み合わせ問題では choiceExplanations を非表示。
          // ユーザー報告: 「1つ/2つ/3つ/4つ」の選択肢に解説をつけるとごちゃごちゃ。
          // 判定ロジックは utils/explanationVisibility.ts にユニットテスト付きで切り出し済み。
          const choiceExpl = shouldShowChoiceExplanation(q, answered, origIdx);

          // [2026-05-22] 個数/組み合わせ問題では選択肢 (1つ/2つ etc) ではなく
          // statements (ア〜エ) 側に打ち消し線を適用するため、こちらは無効化
          const isSpecial = q.questionFormat === 'count' || q.questionFormat === 'combination';
          const struck = !answered && !isSpecial && isStruck(origIdx);

          // Per-choice feedback state for animated bounce/shake
          const choiceFeedback: 'idle' | 'correct' | 'wrong' =
            isCorrectAnswer ? 'correct' : isWrongAnswer ? 'wrong' : 'idle';

          return (
            <View key={origIdx}>
              <AnimatedChoiceCard
                feedback={choiceFeedback}
                correctColor={colors.success}
                wrongColor={colors.error}
                style={[s.choiceCard, cardExtra, Shadow.sm, struck && s.choiceCardStruck]}
                onPress={() => handleSelect(origIdx)}
                onLongPress={() => {
                  if (answered || isSpecial) return;
                  hapticLight();
                  toggleStrike(origIdx);
                }}
                delayLongPress={350}
                disabled={answered}
                accessibilityRole="button"
                accessibilityLabel={`選択肢${LABELS[displayIdx]}: ${choice}${struck ? '(消去済み)' : ''}`}
                accessibilityHint={!answered && !isSpecial ? '長押しで打ち消し線の切り替え' : undefined}
              >
                <View style={[s.choiceLabel, { backgroundColor: labelBg }, struck && s.choiceLabelStruck]}>
                  <Text style={[s.choiceLabelText, { color: labelColor }, struck && s.choiceLabelTextStruck]}>{LABELS[displayIdx]}</Text>
                </View>
                <Text style={[s.choiceText, struck && s.choiceTextStruck]} selectable={answered}>{choice}</Text>
                {answered && isCorrect && <Text style={s.checkMark}>✓</Text>}
                {isWrongAnswer && <Text style={s.crossMark}>✗</Text>}
                {struck && !answered && <Text style={s.strikeMark}>✕</Text>}
              </AnimatedChoiceCard>
              {/* Per-choice explanation */}
              {choiceExpl && (
                <View style={[s.choiceExplBox, isCorrectAnswer ? s.choiceExplCorrect : isWrongAnswer ? s.choiceExplWrong : s.choiceExplNeutral]}>
                  <Text style={s.choiceExplText} selectable>{choiceExpl}</Text>
                  <Pressable style={s.choiceAiBtn} onPress={() => askAboutChoice(origIdx, displayIdx)} accessibilityRole="button" accessibilityLabel={`選択肢${LABELS[displayIdx]}についてAIに聞く`}>
                    <Text style={s.choiceAiBtnText}>🤖 AIに聞く</Text>
                  </Pressable>
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

          {/* 1行エッセンス（論点の核心） */}
          <CoreEssenceBox essence={q.coreEssence} />

          <Text style={s.explainLabel}>解説</Text>
          <Text style={s.explainText} selectable>{q.explanation}</Text>

          {/* AI Button */}
          {/* [2026-06-XX] 無料も1日3回までAI質問可(案A)。回数ゲートはモーダル内 canUseAI()+InlineAILimitCTA。 */}
          <Pressable style={[s.aiBtn, Shadow.sm]} onPress={() => openAI()} accessibilityRole="button" accessibilityLabel="AIに質問する">
            <Text style={s.aiBtnIcon}>🤖</Text>
            <View>
              <Text style={s.aiBtnText}>AIに質問する</Text>
              <Text style={s.aiBtnSub}>解説でわからない部分を聞こう</Text>
            </View>
          </Pressable>

          {/* [UX改善] 難易度セレクター
              - 不正解時: 自動的に「難しい」(confidence='none') として記録し、
                「次の問題へ」ボタン1つだけを表示。ユーザーに難易度を選ばせない。
                他モード (quick-quiz / micro-challenge) との挙動統一。
              - 正解時: 「難しい / 普通 / 簡単」の3択で自己評価。SM-2 の精度向上に使う。
          */}
          <View style={s.confidenceSection}>
            {state === 'wrong' ? (
              <PressableScale
                style={[s.confidenceBtn, s.confidenceDefault, { width: '100%' }]}
                onPress={() => handleConfidenceAndNext('none')}
                accessibilityRole="button"
                accessibilityLabel="次の問題に進む（復習リストに追加されました）"
              >
                <Text style={s.confidenceDefaultText}>復習リストに追加 → 次の問題</Text>
              </PressableScale>
            ) : (
              <View style={s.confidenceRow}>
                <PressableScale
                  style={[s.confidenceBtn, s.confidenceNone]}
                  onPress={() => handleConfidenceAndNext('none')}
                  accessibilityRole="button"
                  accessibilityLabel="難しいと評価"
                >
                  <Text style={s.confidenceNoneText}>難しい</Text>
                </PressableScale>
                <PressableScale
                  style={[s.confidenceBtn, s.confidenceDefault]}
                  onPress={() => handleConfidenceAndNext('low')}
                  accessibilityRole="button"
                  accessibilityLabel="普通と評価"
                >
                  <Text style={s.confidenceDefaultText}>普通 →</Text>
                </PressableScale>
                <PressableScale
                  style={[s.confidenceBtn, s.confidenceHigh]}
                  onPress={() => handleConfidenceAndNext('high')}
                  accessibilityRole="button"
                  accessibilityLabel="簡単と評価"
                >
                  <Text style={s.confidenceHighText}>簡単</Text>
                </PressableScale>
              </View>
            )}
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
  shuffledMap: number[],
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
    ...shuffledMap.map((origIdx, i) => `${LABELS[i]}. ${q.choices[origIdx]}${origIdx === q.correctIndex ? ' ← 正解' : ''}`),
    '',
    `ユーザーの回答: ${selected !== null ? LABELS[shuffledMap.indexOf(selected)] : '未回答'} (${state === 'correct' ? '正解' : '不正解'})`,
    '',
    `解説: ${q.explanation}`,
  );
  if (q.choiceExplanations) {
    lines.push('', '各選択肢の解説:');
    const expls = q.choiceExplanations;
    shuffledMap.forEach((origIdx, i) => lines.push(`${LABELS[i]}: ${expls[origIdx]}`));
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

    // ─── ブックマーク操作のフィードバックトースト ───
    bookmarkToast: {
      position: 'absolute',
      top: 12,
      alignSelf: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: BorderRadius.lg,
      backgroundColor: C.text,
      zIndex: 1000,
      ...Shadow.md,
    },
    bookmarkToastText: {
      fontSize: FontSize.subhead,
      color: C.background,
      fontWeight: '600',
    },
    errorText: {
      fontSize: FontSize.body,
      color: C.textTertiary,
      textAlign: 'center',
      marginTop: 100,
    },

    // [2026-05] 旧 Lock Screen スタイル (lockContainer / lockEmoji / lockTitle / lockDesc / lockBtn)
    // は components/LimitReachedScreen.tsx + utils/paywallCopy.ts に移行のため削除済み。

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
    // [2026-05-22] 個数/組み合わせ問題で長押し消去された statement
    statementStruck: { backgroundColor: C.borderLight + '40', opacity: 0.55 },
    statementTextStruck: { textDecorationLine: 'line-through', color: C.textTertiary },
    statementLabel: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.borderLight, alignItems: 'center', justifyContent: 'center', marginRight: 12, marginTop: 2 },
    statementLabelText: { fontSize: FontSize.footnote, fontWeight: '800', color: C.textSecondary },
    statementText: { fontSize: FontSize.subhead, color: C.text, lineHeight: LineHeight.subhead },
    statementResult: { fontSize: FontSize.caption, fontWeight: '700', marginTop: 4 },
    statementExpl: { fontSize: FontSize.caption, color: C.textSecondary, marginTop: 4, lineHeight: LineHeight.caption },

    // ─── Choices (モダン化) ───
    choiceList: { gap: 8 },
    choiceCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.card,
      borderRadius: BorderRadius.xl,
      padding: Spacing.lg,
      borderWidth: 1.5,
      borderColor: C.borderLight,
      // @ts-ignore
      transition: 'all 0.15s ease',
      // @ts-ignore
      cursor: 'pointer',
    },
    choiceLabel: {
      width: 36,
      height: 36,
      borderRadius: BorderRadius.md,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    choiceLabelText: {
      fontSize: FontSize.subhead,
      fontWeight: '900',
      letterSpacing: 0.5,
    },
    choiceText: {
      flex: 1,
      fontSize: FontSize.subhead,
      color: C.text,
      lineHeight: LineHeight.subhead,
      fontWeight: '500',
    },
    checkMark: { fontSize: 20, color: C.success, fontWeight: '800', marginLeft: 8 },
    crossMark: { fontSize: 20, color: C.error, fontWeight: '800', marginLeft: 8 },

    // ─── 消去法（打ち消し線） ───
    choiceCardStruck: {
      backgroundColor: C.background,
      opacity: 0.55,
    },
    choiceLabelStruck: {
      backgroundColor: C.textTertiary,
    },
    choiceLabelTextStruck: {
      color: C.card,
    },
    choiceTextStruck: {
      textDecorationLine: 'line-through',
      color: C.textTertiary,
    },
    strikeMark: {
      fontSize: 16,
      color: C.textTertiary,
      fontWeight: '800',
      marginLeft: 8,
    },

    // ─── Per-choice Explanation ───
    choiceExplBox: { marginLeft: 48, marginRight: 8, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: BorderRadius.md, borderLeftWidth: 3 },
    choiceExplCorrect: { backgroundColor: C.successSurface, borderLeftColor: C.success },
    choiceExplWrong: { backgroundColor: C.errorSurface, borderLeftColor: C.error },
    choiceExplNeutral: { backgroundColor: C.background, borderLeftColor: C.border },
    choiceExplText: { fontSize: FontSize.footnote, color: C.textSecondary, lineHeight: LineHeight.footnote },
    choiceAiBtn: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 10, paddingVertical: 5, borderRadius: BorderRadius.sm, backgroundColor: C.infoSurface, borderWidth: 1, borderColor: C.border },
    choiceAiBtnText: { fontSize: FontSize.caption2, fontWeight: '700', color: C.primary },

    // ─── Explanation ───
    explainCard: {
      marginTop: Spacing.xxl,
      backgroundColor: C.card,
      borderRadius: BorderRadius.xl,
      padding: Spacing.xxl,
      borderWidth: 1,
      borderColor: C.borderLight,
    },
    explainHeader: { marginBottom: 14 },
    explainBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 7, borderRadius: BorderRadius.full, gap: 6 },
    explainBadgeIcon: { fontSize: 18 },
    explainBadgeText: { fontSize: FontSize.body, fontWeight: '800', letterSpacing: 0.3 },
    explainLabel: { fontSize: FontSize.caption2, fontWeight: '800', color: C.textTertiary, marginBottom: 8, letterSpacing: 1.5, textTransform: 'uppercase' },
    explainText: { fontSize: FontSize.subhead, color: C.textSecondary, lineHeight: LineHeight.body, fontWeight: '500' },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 20 },
    tag: {
      backgroundColor: C.primarySurface,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      borderColor: C.primary + '30',
    },
    tagText: { fontSize: FontSize.footnote, color: C.primary, fontWeight: '700' },

    // ─── AI Open Button ───
    aiBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginTop: 20,
      backgroundColor: C.infoSurface,
      borderRadius: BorderRadius.xl,
      padding: 18,
      borderWidth: 1.5,
      borderColor: C.primary + '30',
      // @ts-ignore
      transition: 'all 0.2s ease',
      // @ts-ignore
      cursor: 'pointer',
    },
    aiBtnIcon: { fontSize: 28 },
    aiBtnText: { fontSize: FontSize.subhead, fontWeight: '800', color: C.primary, letterSpacing: 0.2 },
    aiBtnSub: { fontSize: FontSize.caption2, color: C.textSecondary, marginTop: 3, fontWeight: '500' },

    nextBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: Spacing.xxl,
      backgroundColor: C.primary,
      paddingVertical: 18,
      borderRadius: BorderRadius.full,
      gap: 8,
      // @ts-ignore
      transition: 'all 0.2s ease',
      // @ts-ignore
      cursor: 'pointer',
    },
    nextBtnText: { fontSize: FontSize.callout, fontWeight: '800', color: C.white, letterSpacing: 0.3 },
    nextBtnArrow: { fontSize: FontSize.headline, fontWeight: '900', color: C.white },

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
      zIndex: 10,
    },
    aiHeaderTitle: {
      flex: 1,
      fontSize: FontSize.headline,
      fontWeight: '800',
      color: C.text,
    },
    // ✕ ボタン: 文字に被らずタップ可能な 44pt タップ領域を確保
    aiCloseBtn: {
      minWidth: 44,
      minHeight: 44,
      marginLeft: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    aiClose: {
      fontSize: 22,
      color: C.textTertiary,
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
    aiInputFlex: { flex: 1 },
    aiInputBody: { maxHeight: 140 },
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
    // [2026-05] aiLimitText は InlineAILimitCTA に置換のため削除済み。
  });
}
