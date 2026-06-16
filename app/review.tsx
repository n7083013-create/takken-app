import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Animated,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebBackButton } from '../components/WebBackButton';
import {
  Shadow,
  FontSize,
  LineHeight,
  LetterSpacing,
  Spacing,
  BorderRadius,
  DifficultyLabel,
  DifficultyColor,
} from '../constants/theme';
import { useThemeColors, ThemeColors } from '../hooks/useThemeColors';
import {
  CATEGORY_LABELS,
  CATEGORY_ICONS,
  CATEGORY_COLORS,
  Category,
  ConfidenceLevel,
} from '../types';
import { getQuestionById } from '../data';
import { useProgressStore } from '../store/useProgressStore';
import { relabelChoiceRefs } from '../utils/relabelChoiceRefs';
import { useAchievementChecker } from '../hooks/useAchievementChecker';
import { useAnswerFeedback } from '../components/AnswerFeedback';
import { EmptyState } from '../components/EmptyState';
import { LawAmendmentBadge } from '../components/LawAmendmentBadge';

type ReviewMode = 'menu' | 'session';
type ReviewType = 'due' | 'weak' | 'bookmarked';
type AnswerState = 'idle' | 'correct' | 'wrong';

const LABELS = ['A', 'B', 'C', 'D'] as const;

/** Fisher-Yates シャッフル（選択肢の順番をランダム化、question/[id].tsx と同方式） */
function shuffleIndices(length: number): number[] {
  const arr = Array.from({ length }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function ReviewScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const getDueForReview = useProgressStore((s) => s.getDueForReview);
  const getWeakQuestions = useProgressStore((s) => s.getWeakQuestions);
  const getBookmarkedQuestions = useProgressStore((s) => s.getBookmarkedQuestions);
  const getProgress = useProgressStore((s) => s.getProgress);
  const recordAnswer = useProgressStore((s) => s.recordAnswer);
  const checkAchievements = useAchievementChecker();
  const { triggerCorrect, triggerWrong, FeedbackOverlay } = useAnswerFeedback();

  const [mode, setMode] = useState<ReviewMode>('menu');
  const [reviewType, setReviewType] = useState<ReviewType>('due');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answerState, setAnswerState] = useState<AnswerState>('idle');
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  const explainAnim = useRef(new Animated.Value(0)).current;

  const s = useMemo(() => makeStyles(colors), [colors]);

  const dueIds = useMemo(() => getDueForReview(), [getDueForReview]);
  const weakIds = useMemo(() => getWeakQuestions(), [getWeakQuestions]);
  const bookmarkedIds = useMemo(() => getBookmarkedQuestions(), [getBookmarkedQuestions]);

  const reviewIds = useMemo(() => {
    if (reviewType === 'due') return dueIds;
    if (reviewType === 'weak') return weakIds;
    return bookmarkedIds;
  }, [reviewType, dueIds, weakIds, bookmarkedIds]);

  const currentQuestion = useMemo(() => {
    const id = reviewIds[currentIndex];
    return id ? getQuestionById(id) : undefined;
  }, [reviewIds, currentIndex]);

  // [C-6 2026-06-10] 選択肢の表示順シャッフル (位置暗記の防止)。
  // question/[id].tsx と同じ shuffleIndices 方式: 表示位置 → 元index のマッピングを持ち、
  // 正誤判定・recordAnswer は元index (origIdx) で行う。問題切替時に再シャッフル。
  // 個数問題・組み合わせ問題 (1つ/2つ…) はシャッフルしない (question/[id] と同基準)。
  const [shuffledMap, setShuffledMap] = useState<number[]>([0, 1, 2, 3]);
  const reshuffleFor = useCallback((questionId: string | undefined) => {
    const nq = questionId ? getQuestionById(questionId) : undefined;
    if (!nq) return;
    const special = nq.questionFormat === 'count' || nq.questionFormat === 'combination';
    setShuffledMap(special ? nq.choices.map((_, i) => i) : shuffleIndices(nq.choices.length));
  }, []);

  const startSession = useCallback((type: ReviewType) => {
    const ids = type === 'due' ? dueIds : type === 'weak' ? weakIds : bookmarkedIds;
    reshuffleFor(ids[0]);
    setReviewType(type);
    setMode('session');
    setCurrentIndex(0);
    setSelected(null);
    setAnswerState('idle');
    setSessionCorrect(0);
    setSessionTotal(0);
    explainAnim.setValue(0);
  }, [dueIds, weakIds, bookmarkedIds, reshuffleFor]);

  // 記録タブの復習ハブから ?q=due|weak|bookmarked で来たら該当キューを自動オープン。
  // 在庫が無いキューはメニュー表示のまま (空セッションの完了画面で混乱させない)。
  const params = useLocalSearchParams<{ q?: string }>();
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current) return;
    const q = params.q;
    if (q !== 'due' && q !== 'weak' && q !== 'bookmarked') return;
    autoOpenedRef.current = true;
    const hasStock =
      (q === 'due' && dueIds.length > 0) ||
      (q === 'weak' && weakIds.length > 0) ||
      (q === 'bookmarked' && bookmarkedIds.length > 0);
    if (hasStock) startSession(q);
  }, [params.q, dueIds.length, weakIds.length, bookmarkedIds.length, startSession]);

  // 確信度選択前の一時保存
  const [pendingAnswer, setPendingAnswer] = useState<{ questionId: string; category: Category; isCorrect: boolean } | null>(null);

  const handleSelect = useCallback((idx: number) => {
    if (answerState !== 'idle' || !currentQuestion) return;
    setSelected(idx);
    const ok = idx === currentQuestion.correctIndex;
    setAnswerState(ok ? 'correct' : 'wrong');
    setSessionTotal((p) => p + 1);
    if (ok) setSessionCorrect((p) => p + 1);
    // recordAnswerは確信度選択後に呼ぶ
    setPendingAnswer({ questionId: currentQuestion.id, category: currentQuestion.category, isCorrect: ok });
    // 🎯 中毒性フィードバック
    if (ok) triggerCorrect(); else triggerWrong();
    Animated.timing(explainAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [answerState, currentQuestion, triggerCorrect, triggerWrong]);

  const handleNext = useCallback(() => {
    // 確信度未選択のまま進む場合はデフォルトで記録
    if (pendingAnswer) {
      recordAnswer(pendingAnswer.questionId, pendingAnswer.category, pendingAnswer.isCorrect);
      setPendingAnswer(null);
    }
    if (currentIndex < reviewIds.length - 1) {
      reshuffleFor(reviewIds[currentIndex + 1]);
      setCurrentIndex((p) => p + 1);
    } else {
      setMode('menu');
      return;
    }
    setSelected(null);
    setAnswerState('idle');
    explainAnim.setValue(0);
  }, [currentIndex, reviewIds, pendingAnswer, recordAnswer, reshuffleFor]);

  /** 確信度を選んで記録 → 次へ */
  const handleConfidenceAndNext = useCallback((confidence: ConfidenceLevel) => {
    if (pendingAnswer) {
      recordAnswer(pendingAnswer.questionId, pendingAnswer.category, pendingAnswer.isCorrect, confidence);
      setPendingAnswer(null);
      setTimeout(() => checkAchievements(), 0);
    }
    if (currentIndex < reviewIds.length - 1) {
      reshuffleFor(reviewIds[currentIndex + 1]);
      setCurrentIndex((p) => p + 1);
    } else {
      setMode('menu');
      return;
    }
    setSelected(null);
    setAnswerState('idle');
    explainAnim.setValue(0);
  }, [currentIndex, reviewIds, pendingAnswer, recordAnswer, checkAchievements, reshuffleFor]);

  const sessionAccuracy = sessionTotal > 0 ? Math.round((sessionCorrect / sessionTotal) * 100) : 0;

  // ============================================================
  // Session Mode
  // ============================================================
  if (mode === 'session') {
    if (!currentQuestion) {
      return (
        <SafeAreaView style={s.safe}>
          <Stack.Screen options={{ headerShown: false }} />
          <View style={s.doneContainer}>
            <Text style={s.doneEmoji}>🎉</Text>
            <Text style={s.doneTitle}>復習完了！</Text>
            {sessionTotal > 0 && (
              <Text style={s.doneStats}>
                {sessionCorrect}/{sessionTotal}問正解（{sessionAccuracy}%）
              </Text>
            )}
            <Text style={s.doneDesc}>
              {sessionAccuracy >= 80
                ? 'すばらしい！この調子で頑張りましょう'
                : sessionAccuracy >= 50
                  ? '良い調子です。間違えた問題は再度復習しましょう'
                  : '繰り返しが大切です。もう一度挑戦しましょう'}
            </Text>
            <Pressable style={[s.doneBtn, Shadow.md]} onPress={() => setMode('menu')} accessibilityRole="button" accessibilityLabel="メニューに戻る">
              <Text style={s.doneBtnText}>メニューに戻る</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      );
    }

    const catColor = CATEGORY_COLORS[currentQuestion.category];
    const prog = getProgress(currentQuestion.id);
    const attempts = prog?.attempts ?? 0;
    const accuracy = attempts > 0 ? Math.round(((prog?.correctCount ?? 0) / attempts) * 100) : 0;
    const isLastQuestion = currentIndex >= reviewIds.length - 1;

    return (
      <SafeAreaView style={s.safe}>
        <Stack.Screen options={{ headerShown: false }} />
        <FeedbackOverlay />
        <ScrollView contentContainerStyle={s.sessionScroll} showsVerticalScrollIndicator={false}>
          {/* Top Bar */}
          <View style={s.sessionTopBar}>
            <Pressable style={s.sessionCloseBtn} onPress={() => setMode('menu')} accessibilityRole="button" accessibilityLabel="復習セッションを閉じる">
              <Text style={s.sessionCloseBtnText}>✕</Text>
            </Pressable>
            <Text style={s.sessionProgress}>
              {currentIndex + 1}
              <Text style={s.sessionProgressLight}> / {reviewIds.length}</Text>
            </Text>
            <View style={s.sessionAccBadge}>
              <Text style={s.sessionAccText}>{sessionAccuracy}%</Text>
            </View>
          </View>

          {/* Progress Bar */}
          <View style={s.sessionTrackWrap}>
            <View style={s.sessionTrack}>
              <View style={[s.sessionFill, { width: `${((currentIndex + 1) / reviewIds.length) * 100}%` }]} />
            </View>
          </View>

          {/* Question Meta */}
          <View style={s.metaRow}>
            <View style={[s.metaPill, { backgroundColor: catColor + '14' }]}>
              <Text style={[s.metaPillText, { color: catColor }]}>
                {CATEGORY_ICONS[currentQuestion.category]} {CATEGORY_LABELS[currentQuestion.category]}
              </Text>
            </View>
            <View style={[s.metaPill, { backgroundColor: DifficultyColor[currentQuestion.difficulty] + '14' }]}>
              <Text style={[s.metaPillText, { color: DifficultyColor[currentQuestion.difficulty] }]}>
                {DifficultyLabel[currentQuestion.difficulty]}
              </Text>
            </View>
            {attempts > 0 && (
              <View style={[s.metaPill, { backgroundColor: accuracy >= 50 ? colors.success + '14' : colors.error + '14' }]}>
                <Text style={[s.metaPillText, { color: accuracy >= 50 ? colors.success : colors.error }]}>
                  過去{accuracy}%
                </Text>
              </View>
            )}
          </View>

          {/* Question */}
          <View style={[s.questionBox, Shadow.sm]}>
            <Text style={s.questionText} selectable>{currentQuestion.text}</Text>
          </View>

          {/* Law Amendment Badge */}
          <LawAmendmentBadge tags={currentQuestion.tags} />

          {/* [Bugfix 2026-05] 個数問題・組み合わせ問題の ア〜エ 本文 (statements) を表示
              これが無いとユーザーが何を判定すればよいか分からない重大バグだった。
              解答後: statementAnswers の正誤マーク (○/✕) + statementExplanations の個別解説を表示。 */}
          {currentQuestion.statements && currentQuestion.statements.length > 0 && (
            <View style={[s.statementsBox, Shadow.sm]}>
              {currentQuestion.statements.map((stmt, si) => {
                const answered = answerState !== 'idle';
                const stmtCorrect = currentQuestion.statementAnswers?.[si];
                const stmtExpl = currentQuestion.statementExplanations?.[si];
                return (
                  <View key={si} style={s.statementRow}>
                    <Text style={s.statementLabel}>{['ア', 'イ', 'ウ', 'エ'][si]}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.statementText} selectable>{stmt}</Text>
                      {answered && stmtCorrect !== undefined && (
                        <Text style={[s.statementResult, { color: stmtCorrect ? colors.success : colors.error }]}>
                          {stmtCorrect ? '○ 正しい' : '✕ 誤り'}
                        </Text>
                      )}
                      {answered && stmtExpl && (
                        <Text style={s.statementExpl} selectable>{stmtExpl}</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Choices (未回答: シャッフル / 解答後: 元データ順)。
              origIdx=元のデータ添字 / displayIdx=表示位置・A-Dラベル用。
              [2026-06-16] 解答後は元順 (恒等マップ) にして解説の「選択肢N」と番号一致。
              正誤判定・recordAnswer は origIdx 基準で不変 (並べ替えは表示のみ)。
              shuffledMap が問題切替直後でまだ前問の長さの場合は安全側で元順にフォールバック。 */}
          <View style={s.choiceList}>
            {(() => {
              const special =
                currentQuestion.questionFormat === 'count' ||
                currentQuestion.questionFormat === 'combination';
              const mapValid = shuffledMap.length === currentQuestion.choices.length;
              const displayMap =
                answerState !== 'idle' || special || !mapValid
                  ? currentQuestion.choices.map((_, i) => i)
                  : shuffledMap;
              return displayMap;
            })().map((origIdx, displayIdx) => {
              const choice = currentQuestion.choices[origIdx];
              const isCorrect = origIdx === currentQuestion.correctIndex;
              const isSelected = origIdx === selected;
              const answered = answerState !== 'idle';
              const isCorrectAnswer = answered && isCorrect;
              const isWrongAnswer = answered && isSelected && !isCorrect;
              const cardExtra = isCorrectAnswer
                ? { borderColor: colors.success, backgroundColor: colors.successSurface }
                : isWrongAnswer
                  ? { borderColor: colors.error, backgroundColor: colors.errorSurface }
                  : { borderColor: colors.border };
              const labelBg = isCorrectAnswer ? colors.success : isWrongAnswer ? colors.error : colors.borderLight;
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
                    <Text style={[s.choiceLabelText, { color: labelColor }]}>{LABELS[displayIdx]}</Text>
                  </View>
                  <Text style={s.choiceText} selectable>{choice}</Text>
                  {answered && isCorrect && <Text style={s.checkMark}>✓</Text>}
                </Pressable>
              );
            })}
          </View>

          {/* Explanation */}
          {answerState !== 'idle' && (
            <Animated.View style={[s.explainCard, Shadow.md, { opacity: explainAnim, transform: [{ translateY: explainAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }]}>
              <View style={[s.explainBadge, { backgroundColor: answerState === 'correct' ? colors.successSurface : colors.errorSurface }]}>
                <Text style={s.explainBadgeIcon}>{answerState === 'correct' ? '⭕' : '❌'}</Text>
                <Text style={[s.explainBadgeText, { color: answerState === 'correct' ? colors.success : colors.error }]}>
                  {answerState === 'correct' ? '正解！' : '不正解'}
                </Text>
              </View>
              {/* 解説は解答後のみ表示 → 表示順は常に元データ順なので恒等マップで番号一致 */}
              <Text style={s.explainText} selectable>{relabelChoiceRefs(currentQuestion.explanation, currentQuestion.choices.map((_, i) => i))}</Text>

              {/* 難易度セレクター（次へ進むボタンを兼ねる） */}
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
                    <Text style={s.confidenceDefaultText}>
                      {isLastQuestion ? '普通（結果を見る）' : '普通 →'}
                    </Text>
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
            </Animated.View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ============================================================
  // Menu Mode
  // ============================================================
  const totalReview = dueIds.length + weakIds.length;

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <WebBackButton />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>復習</Text>
          <Text style={s.subtitle}>間隔反復で記憶を定着させる</Text>
        </View>

        {/* Summary Card */}
        <View style={[s.summaryCard, Shadow.lg]}>
          <View style={s.summaryTop}>
            <Text style={s.summaryEmoji}>
              {totalReview === 0 ? '✅' : '📖'}
            </Text>
            <Text style={s.summaryTitle}>
              {totalReview === 0
                ? '復習は完了しています'
                : `${totalReview}問の復習があります`}
            </Text>
            <Text style={s.summaryDesc}>
              {totalReview === 0
                ? '素晴らしい！明日またチェックしましょう'
                : '忘れる前に解くと記憶定着率が大幅にアップします'}
            </Text>
          </View>
          {totalReview > 0 && (
            <View style={s.summaryStats}>
              <View style={s.summaryStatItem}>
                <Text style={[s.summaryStatValue, { color: colors.accent }]}>{dueIds.length}</Text>
                <Text style={s.summaryStatLabel}>復習期限</Text>
              </View>
              <View style={s.summaryDivider} />
              <View style={s.summaryStatItem}>
                <Text style={[s.summaryStatValue, { color: colors.error }]}>{weakIds.length}</Text>
                <Text style={s.summaryStatLabel}>苦手問題</Text>
              </View>
              <View style={s.summaryDivider} />
              <View style={s.summaryStatItem}>
                <Text style={[s.summaryStatValue, { color: colors.primary }]}>{bookmarkedIds.length}</Text>
                <Text style={s.summaryStatLabel}>ブックマーク</Text>
              </View>
            </View>
          )}
        </View>

        {/* Review Queues */}
        <Text style={s.sectionTitle}>復習キュー</Text>

        {/* Due for Review */}
        {dueIds.length > 0 ? (
          <Pressable
            style={[s.queueCard, Shadow.sm]}
            onPress={() => startSession('due')}
            accessibilityRole="button"
            accessibilityLabel={`今日の復習 ${dueIds.length}問`}
          >
            <View style={[s.queueIcon, { backgroundColor: colors.accent + '14' }]}>
              <Text style={s.queueIconText}>⏰</Text>
            </View>
            <View style={s.queueBody}>
              <Text style={s.queueTitle}>今日の復習</Text>
              <Text style={s.queueDesc}>
                忘却曲線に基づいて選ばれた{dueIds.length}問
              </Text>
            </View>
            <View style={s.queueRight}>
              <Text style={[s.queueCount, { color: colors.accent }]}>
                {dueIds.length}
              </Text>
              <Text style={s.queueArrow}>›</Text>
            </View>
          </Pressable>
        ) : (
          <View style={[s.emptyQueueCard, Shadow.sm]}>
            <EmptyState
              icon="✅"
              title="復習する問題はありません"
              subtitle="問題を解くとスケジュールが自動で作成されます"
            />
          </View>
        )}

        {/* Weak Questions */}
        {weakIds.length > 0 ? (
          <Pressable
            style={[s.queueCard, Shadow.sm]}
            onPress={() => startSession('weak')}
            accessibilityRole="button"
            accessibilityLabel={`苦手克服 ${weakIds.length}問`}
          >
            <View style={[s.queueIcon, { backgroundColor: colors.error + '14' }]}>
              <Text style={s.queueIconText}>💪</Text>
            </View>
            <View style={s.queueBody}>
              <Text style={s.queueTitle}>苦手克服</Text>
              <Text style={s.queueDesc}>
                正答率50%未満の{weakIds.length}問を集中攻略
              </Text>
            </View>
            <View style={s.queueRight}>
              <Text style={[s.queueCount, { color: colors.error }]}>
                {weakIds.length}
              </Text>
              <Text style={s.queueArrow}>›</Text>
            </View>
          </Pressable>
        ) : (
          <View style={[s.emptyQueueCard, Shadow.sm]}>
            <EmptyState
              icon="💪"
              title="苦手な問題はありません"
              subtitle="すべての問題で高い正答率です"
            />
          </View>
        )}

        {/* Bookmarked */}
        {bookmarkedIds.length > 0 ? (
          <Pressable
            style={[s.queueCard, Shadow.sm]}
            onPress={() => startSession('bookmarked')}
            accessibilityRole="button"
            accessibilityLabel={`ブックマーク ${bookmarkedIds.length}問`}
          >
            <View style={[s.queueIcon, { backgroundColor: colors.primary + '14' }]}>
              <Text style={s.queueIconText}>🔖</Text>
            </View>
            <View style={s.queueBody}>
              <Text style={s.queueTitle}>ブックマーク</Text>
              <Text style={s.queueDesc}>
                保存した{bookmarkedIds.length}問を復習
              </Text>
            </View>
            <View style={s.queueRight}>
              <Text style={[s.queueCount, { color: colors.primary }]}>
                {bookmarkedIds.length}
              </Text>
              <Text style={s.queueArrow}>›</Text>
            </View>
          </Pressable>
        ) : (
          <View style={[s.emptyQueueCard, Shadow.sm]}>
            <EmptyState
              icon="🔖"
              title="ブックマークはありません"
              subtitle="問題画面でブックマークを追加できます"
            />
          </View>
        )}

        {/* 就寝前モード 二次入口: 夜はホームのCTAが自動誘導するが、日中にやりたい人向けの導線。 */}
        <Pressable
          style={[s.queueCard, Shadow.sm]}
          onPress={() => router.push('/pre-sleep-review')}
          accessibilityRole="button"
          accessibilityLabel="就寝前モードで復習する"
        >
          <View style={[s.queueIcon, { backgroundColor: colors.primary + '14' }]}>
            <Text style={s.queueIconText}>🌙</Text>
          </View>
          <View style={s.queueBody}>
            <Text style={s.queueTitle}>就寝前モードで復習</Text>
            <Text style={s.queueDesc}>寝る前の5問で定着を助けます</Text>
          </View>
          <View style={s.queueRight}>
            <Text style={s.queueArrow}>›</Text>
          </View>
        </Pressable>

        {/* Science Note */}
        <View style={[s.scienceCard, Shadow.sm]}>
          <Text style={s.scienceTitle}>📊 間隔反復の効果</Text>
          <Text style={s.scienceText}>
            エビングハウスの忘却曲線によると、学習後24時間で67%の記憶が失われます。
            しかし、最適なタイミングで復習すると記憶定着率は90%以上に向上します。
          </Text>
          <View style={s.scienceDivider} />
          <Text style={s.scienceHint}>
            このアプリは科学的な間隔反復法で、あなたの正答率に基づいて最適な復習タイミングを自動計算しています。
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) { return StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  scroll: { paddingBottom: 20 },

  // ─── Header ───
  header: {
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

  // ─── Summary Card ───
  summaryCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
    backgroundColor: C.card,
    borderRadius: BorderRadius.xxl,
    overflow: 'hidden',
  },
  summaryTop: {
    padding: Spacing.xxl,
    alignItems: 'center',
  },
  summaryEmoji: { fontSize: 48, marginBottom: Spacing.md },
  summaryTitle: {
    fontSize: FontSize.title3,
    fontWeight: '800',
    color: C.text,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  summaryDesc: {
    fontSize: FontSize.footnote,
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: LineHeight.footnote,
  },
  summaryStats: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: C.borderLight,
    paddingVertical: Spacing.lg,
  },
  summaryStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryStatValue: {
    fontSize: FontSize.title2,
    fontWeight: '800',
  },
  summaryStatLabel: {
    fontSize: FontSize.caption2,
    color: C.textSecondary,
    marginTop: 3,
    fontWeight: '500',
    letterSpacing: LetterSpacing.wide,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: C.borderLight,
  },

  // ─── Section ───
  sectionTitle: {
    fontSize: FontSize.title3,
    fontWeight: '800',
    color: C.text,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.xxl,
    marginBottom: Spacing.md,
    letterSpacing: LetterSpacing.tight,
  },

  // ─── Queue Cards ───
  emptyQueueCard: {
    backgroundColor: C.card,
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.xl,
    marginBottom: 10,
    paddingVertical: Spacing.sm,
  },
  queueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.xl,
    marginBottom: 10,
    padding: Spacing.lg,
  },
  queueCardDisabled: {
    opacity: 0.55,
  },
  queueIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  queueIconText: { fontSize: 22 },
  queueBody: { flex: 1 },
  queueTitle: {
    fontSize: FontSize.subhead,
    fontWeight: '700',
    color: C.text,
  },
  queueDesc: {
    fontSize: FontSize.caption,
    color: C.textSecondary,
    marginTop: 2,
    lineHeight: LineHeight.caption,
  },
  queueRight: {
    alignItems: 'center',
    marginLeft: Spacing.sm,
  },
  queueCount: {
    fontSize: FontSize.title2,
    fontWeight: '800',
  },
  queueArrow: {
    fontSize: 20,
    color: C.textTertiary,
    marginTop: 2,
  },

  // ─── Science Card ───
  scienceCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.xxl,
    backgroundColor: C.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
  },
  scienceTitle: {
    fontSize: FontSize.subhead,
    fontWeight: '700',
    color: C.text,
    marginBottom: Spacing.sm,
  },
  scienceText: {
    fontSize: FontSize.footnote,
    color: C.textSecondary,
    lineHeight: LineHeight.footnote,
  },
  scienceDivider: {
    height: 1,
    backgroundColor: C.borderLight,
    marginVertical: Spacing.md,
  },
  scienceHint: {
    fontSize: FontSize.caption,
    color: C.textTertiary,
    lineHeight: LineHeight.caption,
  },

  // ═══════════════════════════════════════
  // Session Mode
  // ═══════════════════════════════════════
  sessionScroll: { padding: Spacing.xl, paddingTop: 0 },

  sessionTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
  },
  sessionCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.full,
    backgroundColor: C.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionCloseBtnText: {
    fontSize: FontSize.body,
    color: C.textSecondary,
    fontWeight: '600',
  },
  sessionProgress: {
    fontSize: FontSize.title3,
    fontWeight: '800',
    color: C.text,
  },
  sessionProgressLight: {
    fontWeight: '500',
    color: C.textTertiary,
  },
  sessionAccBadge: {
    backgroundColor: C.primarySurface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  sessionAccText: {
    fontSize: FontSize.footnote,
    fontWeight: '700',
    color: C.primary,
  },

  sessionTrackWrap: { marginBottom: Spacing.lg },
  sessionTrack: {
    height: 5,
    backgroundColor: C.primarySurface,
    borderRadius: 3,
    overflow: 'hidden',
  },
  sessionFill: {
    height: '100%',
    backgroundColor: C.primary,
    borderRadius: 3,
  },

  // ─── Question ───
  metaRow: { flexDirection: 'row', gap: 8, marginBottom: Spacing.md },
  metaPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  metaPillText: {
    fontSize: FontSize.caption2,
    fontWeight: '700',
    letterSpacing: LetterSpacing.wide,
  },
  questionBox: {
    backgroundColor: C.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xxl,
    marginBottom: Spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: C.accent,
  },
  questionText: {
    fontSize: FontSize.callout,
    fontWeight: '600',
    color: C.text,
    lineHeight: LineHeight.callout,
  },

  // ─── Statements (個数問題・組み合わせ問題の ア〜エ) ───
  statementsBox: {
    backgroundColor: C.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
    borderLeftWidth: 4,
    borderLeftColor: C.primary,
  },
  statementRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
  statementMark: {
    fontSize: FontSize.headline,
    fontWeight: '800',
    marginLeft: 8,
    minWidth: 24,
    textAlign: 'center',
  },
  statementResult: {
    fontSize: FontSize.footnote,
    fontWeight: '800',
    marginTop: 4,
  },
  statementExpl: {
    fontSize: FontSize.footnote,
    color: C.textSecondary,
    lineHeight: LineHeight.footnote,
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: C.borderLight,
  },

  // ─── Choices ───
  choiceList: { gap: 10 },
  choiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
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
  choiceLabelText: {
    fontSize: FontSize.subhead,
    fontWeight: '800',
  },
  choiceText: {
    flex: 1,
    fontSize: FontSize.subhead,
    color: C.text,
    lineHeight: LineHeight.subhead,
  },
  checkMark: {
    fontSize: 20,
    color: C.success,
    fontWeight: '800',
    marginLeft: 8,
  },

  // ─── Explanation ───
  explainCard: {
    marginTop: Spacing.xxl,
    backgroundColor: C.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xxl,
  },
  explainBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: BorderRadius.md,
    gap: 6,
    marginBottom: Spacing.md,
  },
  explainBadgeIcon: { fontSize: 18 },
  explainBadgeText: {
    fontSize: FontSize.body,
    fontWeight: '800',
  },
  explainText: {
    fontSize: FontSize.subhead,
    color: C.textSecondary,
    lineHeight: LineHeight.body,
  },
  nextBtn: {
    marginTop: Spacing.xl,
    backgroundColor: C.primary,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
  },
  nextBtnText: {
    fontSize: FontSize.body,
    fontWeight: '700',
    color: C.white,
  },

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
  confidenceDefaultText: { fontSize: FontSize.subhead, fontWeight: '800', color: C.white },
  confidenceHigh: {
    flex: 0.8,
    backgroundColor: C.successSurface,
    borderColor: C.success + '60',
  },
  confidenceHighText: { fontSize: FontSize.footnote, fontWeight: '700', color: C.success },

  // ─── Done Screen ───
  doneContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xxxl,
  },
  doneEmoji: { fontSize: 64, marginBottom: Spacing.lg },
  doneTitle: {
    fontSize: FontSize.title1,
    fontWeight: '800',
    color: C.text,
    marginBottom: Spacing.sm,
  },
  doneStats: {
    fontSize: FontSize.title3,
    fontWeight: '700',
    color: C.primary,
    marginBottom: Spacing.md,
  },
  doneDesc: {
    fontSize: FontSize.subhead,
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: LineHeight.subhead,
    marginBottom: Spacing.xxxl,
  },
  doneBtn: {
    backgroundColor: C.primary,
    paddingHorizontal: Spacing.xxxl,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
  },
  doneBtnText: {
    fontSize: FontSize.body,
    fontWeight: '700',
    color: C.white,
  },
}); }
