// ============================================================
// 管理者レビュー画面（needsReview の問題を 1 問ずつ精査）
// /admin/review
// ============================================================
// ADMIN_EMAILS に登録された管理者のみアクセス可能。
// 認可は API 側（POST /api/admin/stats { mode: 'mark_reviewed' }）で実施。
// 静的データ（needsReview=true）は書き換えず、DB の question_review_log に
// 記録のみ行う。次回リリース時に集計してデータファイルを更新する想定。

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Shadow,
  FontSize,
  Spacing,
  BorderRadius,
  LetterSpacing,
} from '../../constants/theme';
import { useThemeColors, type ThemeColors } from '../../hooks/useThemeColors';
import { Input } from '../../components/ui/Input';
import { useAuthStore } from '../../store/useAuthStore';
import { API_BASE_URL } from '../../constants/config';
import { ALL_QUESTIONS } from '../../data';
import {
  CATEGORY_LABELS,
  CATEGORY_ICONS,
  type Category,
  type Question,
} from '../../types';
import { captureSentryException } from '../../services/sentry';

// セッション保存用キー: 中断・再開を可能にする
const SESSION_KEY = '@takken_review_session';

// レビュー対象カテゴリ（'all' は全て）
type FilterCategory = Category | 'all';

interface ReviewSession {
  reviewedOkIds: string[]; // ローカルでこのセッション中に OK を押した ID
  flaggedIds: string[];    // ⚠️ 修正必要を押した ID
  skippedIds: string[];    // ⏭ スキップした ID
  noteByQuestionId: Record<string, string>;
  filter: FilterCategory;
  cursor: number;
  updatedAt: string;
}

const EMPTY_SESSION: ReviewSession = {
  reviewedOkIds: [],
  flaggedIds: [],
  skippedIds: [],
  noteByQuestionId: {},
  filter: 'all',
  cursor: 0,
  updatedAt: new Date().toISOString(),
};

const FILTERS: { key: FilterCategory; label: string }[] = [
  { key: 'all', label: '全て' },
  { key: 'kenri', label: CATEGORY_LABELS.kenri },
  { key: 'takkengyoho', label: CATEGORY_LABELS.takkengyoho },
  { key: 'horei_seigen', label: CATEGORY_LABELS.horei_seigen },
  { key: 'tax_other', label: CATEGORY_LABELS.tax_other },
];

export default function AdminReviewScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const session = useAuthStore((st) => st.session);
  const user = useAuthStore((st) => st.user);

  const [sessionState, setSessionState] = useState<ReviewSession>(EMPTY_SESSION);
  const [serverReviewedOkIds, setServerReviewedOkIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  // 全 needsReview=true の問題（静的データから抽出）
  const allNeedsReview = useMemo(
    () => ALL_QUESTIONS.filter((q) => q.needsReview === true),
    [],
  );

  // フィルタ適用後の対象問題
  const filteredQuestions = useMemo(() => {
    const base =
      sessionState.filter === 'all'
        ? allNeedsReview
        : allNeedsReview.filter((q) => q.category === sessionState.filter);
    return base;
  }, [allNeedsReview, sessionState.filter]);

  // すでにレビュー済み（サーバ＋ローカルセッション）の問題ID集合
  const reviewedSet = useMemo(() => {
    const set = new Set<string>();
    serverReviewedOkIds.forEach((id) => set.add(id));
    sessionState.reviewedOkIds.forEach((id) => set.add(id));
    return set;
  }, [serverReviewedOkIds, sessionState.reviewedOkIds]);

  // 未レビュー問題（カーソル位置の問題を表示）
  const pendingQuestions = useMemo(
    () => filteredQuestions.filter((q) => !reviewedSet.has(q.id)),
    [filteredQuestions, reviewedSet],
  );

  const currentIndex = Math.min(sessionState.cursor, Math.max(0, pendingQuestions.length - 1));
  const currentQuestion: Question | null = pendingQuestions[currentIndex] ?? null;

  // ────────── ローカルセッションの読み込み ──────────
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SESSION_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<ReviewSession>;
          setSessionState({
            ...EMPTY_SESSION,
            ...parsed,
            reviewedOkIds: parsed.reviewedOkIds || [],
            flaggedIds: parsed.flaggedIds || [],
            skippedIds: parsed.skippedIds || [],
            noteByQuestionId: parsed.noteByQuestionId || {},
          });
        }
      } catch (e) {
        // セッション読み込みは致命的ではない
      }
    })();
  }, []);

  // ────────── サーバからレビュー済み一覧取得 ──────────
  const fetchSummary = useCallback(async () => {
    if (!session?.access_token) {
      setError('ログインが必要です');
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/stats`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ mode: 'review_summary' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'サマリー取得失敗');
      } else {
        setServerReviewedOkIds(Array.isArray(data?.reviewed_ok_ids) ? data.reviewed_ok_ids : []);
      }
    } catch (e: any) {
      captureSentryException(e, { context: 'admin/review.fetchSummary' });
      setError(e?.message || '通信エラー');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // ────────── セッション永続化 ──────────
  const persistSession = useCallback(async (next: ReviewSession) => {
    try {
      await AsyncStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ ...next, updatedAt: new Date().toISOString() }),
      );
    } catch {
      // 永続化失敗は致命的ではない
    }
  }, []);

  const updateSession = useCallback(
    (mutator: (prev: ReviewSession) => ReviewSession) => {
      setSessionState((prev) => {
        const next = mutator(prev);
        persistSession(next);
        return next;
      });
    },
    [persistSession],
  );

  // ────────── アクションハンドラ ──────────
  const submitReview = useCallback(
    async (questionId: string, status: 'ok' | 'flagged', note?: string) => {
      if (!session?.access_token) {
        setError('ログインが切れています');
        return false;
      }
      setSubmitting(true);
      try {
        const res = await fetch(`${API_BASE_URL}/admin/stats`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ mode: 'mark_reviewed', questionId, status, note }),
        });
        const data = await res.json();
        if (!res.ok) {
          const msg = data?.error || '記録に失敗しました';
          if (Platform.OS === 'web') {
            // Alert は web で動かない環境があるため state エラーで表示
            setError(msg);
          } else {
            Alert.alert('エラー', msg);
          }
          return false;
        }
        return true;
      } catch (e: any) {
        captureSentryException(e, {
          context: 'admin/review.submit',
          extra: { questionId, status },
        });
        setError(e?.message || '通信エラー');
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [session],
  );

  const handleOk = useCallback(async () => {
    if (!currentQuestion) return;
    const qid = currentQuestion.id;
    const ok = await submitReview(qid, 'ok');
    if (!ok) return;
    updateSession((prev) => ({
      ...prev,
      reviewedOkIds: prev.reviewedOkIds.includes(qid)
        ? prev.reviewedOkIds
        : [...prev.reviewedOkIds, qid],
      // OK にした問題はもう pending から消えるので、cursor は維持で OK
    }));
    setNoteDraft('');
  }, [currentQuestion, submitReview, updateSession]);

  const handleFlag = useCallback(async () => {
    if (!currentQuestion) return;
    const qid = currentQuestion.id;
    const note = noteDraft.trim();
    const ok = await submitReview(qid, 'flagged', note || undefined);
    if (!ok) return;
    updateSession((prev) => ({
      ...prev,
      flaggedIds: prev.flaggedIds.includes(qid) ? prev.flaggedIds : [...prev.flaggedIds, qid],
      noteByQuestionId: note ? { ...prev.noteByQuestionId, [qid]: note } : prev.noteByQuestionId,
      // flagged はサーバに残っても一旦 OK 扱いにはしない → pending には残るが
      // skippedIds に入れて画面上は次へ進める
      skippedIds: prev.skippedIds.includes(qid) ? prev.skippedIds : [...prev.skippedIds, qid],
      cursor: prev.cursor + 1,
    }));
    setNoteDraft('');
  }, [currentQuestion, noteDraft, submitReview, updateSession]);

  const handleSkip = useCallback(() => {
    if (!currentQuestion) return;
    const qid = currentQuestion.id;
    updateSession((prev) => ({
      ...prev,
      skippedIds: prev.skippedIds.includes(qid) ? prev.skippedIds : [...prev.skippedIds, qid],
      cursor: prev.cursor + 1,
    }));
    setNoteDraft('');
  }, [currentQuestion, updateSession]);

  const handleResetSession = useCallback(async () => {
    await AsyncStorage.removeItem(SESSION_KEY);
    setSessionState(EMPTY_SESSION);
    setNoteDraft('');
    fetchSummary();
  }, [fetchSummary]);

  // ────────── 描画 ──────────
  if (!user) {
    return (
      <SafeAreaView style={s.safe}>
        <Stack.Screen options={{ title: '問題レビュー' }} />
        <View style={s.errorBox}>
          <Text style={s.errorText}>ログインしてください</Text>
          <Pressable onPress={() => router.replace('/auth/login')} style={s.btn}>
            <Text style={s.btnText}>ログイン</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <Stack.Screen options={{ title: '問題レビュー' }} />
        <View style={s.loadingBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={s.loadingText}>レビュー状況を取得中...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !currentQuestion) {
    return (
      <SafeAreaView style={s.safe}>
        <Stack.Screen options={{ title: '問題レビュー' }} />
        <View style={s.errorBox}>
          <Text style={s.errorText}>{error}</Text>
          <Pressable onPress={fetchSummary} style={s.btn}>
            <Text style={s.btnText}>再試行</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const totalForFilter = filteredQuestions.length;
  const reviewedForFilterCount = filteredQuestions.filter((q) => reviewedSet.has(q.id)).length;
  const remaining = totalForFilter - reviewedForFilterCount;

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen
        options={{
          title: '🔎 問題レビュー',
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.text,
        }}
      />
      <ScrollView contentContainerStyle={s.scroll}>
        {/* ヘッダー: 進捗 */}
        <View style={[s.heroCard, Shadow.md]}>
          <Text style={s.heroLabel}>レビュー進捗</Text>
          <Text style={s.heroValue}>
            {reviewedForFilterCount}
            <Text style={s.heroValueSlash}> / {totalForFilter}</Text>
          </Text>
          <Text style={s.heroSub}>
            残り {remaining} 問（needsReview=true 全 {allNeedsReview.length} 問中）
          </Text>
        </View>

        {/* カテゴリフィルタ */}
        <View style={s.filterRow}>
          {FILTERS.map((f) => {
            const active = sessionState.filter === f.key;
            return (
              <Pressable
                key={f.key}
                style={[s.filterChip, active && s.filterChipActive]}
                onPress={() =>
                  updateSession((prev) => ({ ...prev, filter: f.key, cursor: 0 }))
                }
              >
                <Text style={[s.filterChipText, active && s.filterChipTextActive]}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {error ? (
          <View style={s.inlineError}>
            <Text style={s.inlineErrorText}>{error}</Text>
          </View>
        ) : null}

        {/* 問題カード */}
        {!currentQuestion ? (
          <View style={[s.section, Shadow.sm]}>
            <Text style={s.sectionTitle}>🎉 全問レビュー完了</Text>
            <Text style={s.bodyText}>
              選択中のフィルタに該当する未レビュー問題はありません。
              {'\n'}
              他のカテゴリに切り替えて続行できます。
            </Text>
            <Pressable style={s.refreshBtn} onPress={fetchSummary}>
              <Text style={s.refreshBtnText}>🔄 サーバ最新状況を再取得</Text>
            </Pressable>
          </View>
        ) : (
          <QuestionCard
            colors={colors}
            question={currentQuestion}
            indexLabel={`${currentIndex + 1} / ${pendingQuestions.length}`}
          />
        )}

        {/* メモ欄 */}
        {currentQuestion && (
          <View style={[s.section, Shadow.sm]}>
            <Text style={s.sectionTitle}>📝 メモ（任意・⚠️ 修正必要のとき送信されます）</Text>
            <Input
              variant="multiline"
              placeholder="例: 民法XXX条の改正で正解が変わる可能性"
              value={noteDraft}
              onChangeText={setNoteDraft}
              rows={4}
              maxLength={1000}
              disabled={submitting}
              accessibilityLabel="レビューメモ"
            />
          </View>
        )}

        {/* アクションボタン */}
        {currentQuestion && (
          <View style={s.actionRow}>
            <Pressable
              style={[s.actionBtn, s.actionOk, submitting && s.actionBtnDisabled]}
              onPress={handleOk}
              disabled={submitting}
            >
              <Text style={s.actionOkText}>✅ OK（needsReview=false）</Text>
            </Pressable>
            <Pressable
              style={[s.actionBtn, s.actionFlag, submitting && s.actionBtnDisabled]}
              onPress={handleFlag}
              disabled={submitting}
            >
              <Text style={s.actionFlagText}>⚠️ 修正必要</Text>
            </Pressable>
            <Pressable
              style={[s.actionBtn, s.actionSkip, submitting && s.actionBtnDisabled]}
              onPress={handleSkip}
              disabled={submitting}
            >
              <Text style={s.actionSkipText}>⏭ スキップ</Text>
            </Pressable>
          </View>
        )}

        {/* セッション操作 */}
        <View style={[s.section, Shadow.sm]}>
          <Text style={s.sectionTitle}>📦 セッション情報</Text>
          <Text style={s.bodyText}>
            このセッションで OK: {sessionState.reviewedOkIds.length} 問{'\n'}
            Flagged: {sessionState.flaggedIds.length} 問 / Skip:{' '}
            {sessionState.skippedIds.length} 問
          </Text>
          <Pressable style={s.dangerBtn} onPress={handleResetSession}>
            <Text style={s.dangerBtnText}>セッションをリセット（DB は保持）</Text>
          </Pressable>
        </View>

        <Text style={s.footer}>
          このページは管理者のみアクセス可能です。{'\n'}
          ⚠️ Flagged は次回リリース時に静的データを修正してから needsReview=false にします。
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ============================================================
// 問題カード
// ============================================================
function QuestionCard({
  colors,
  question,
  indexLabel,
}: {
  colors: ThemeColors;
  question: Question;
  indexLabel: string;
}) {
  const s = useMemo(() => makeStyles(colors), [colors]);
  const correct = question.correctIndex;
  return (
    <View style={[s.section, Shadow.sm]}>
      <View style={s.qHeader}>
        <Text style={s.qIndex}>{indexLabel}</Text>
        <Text style={s.qCategory}>
          {CATEGORY_ICONS[question.category]} {CATEGORY_LABELS[question.category]}
        </Text>
      </View>
      <Text style={s.qId}>{question.id}</Text>

      <Text style={s.qText}>{question.text}</Text>

      {question.statements && question.statements.length > 0 && (
        <View style={s.statementBox}>
          {question.statements.map((stmt, i) => {
            const ans =
              question.statementAnswers && question.statementAnswers[i] !== undefined
                ? question.statementAnswers[i]
                  ? '○'
                  : '×'
                : '?';
            const labels = ['ア', 'イ', 'ウ', 'エ', 'オ'];
            return (
              <Text key={i} style={s.statementText}>
                {labels[i] || `(${i + 1})`} ({ans}) {stmt}
              </Text>
            );
          })}
        </View>
      )}

      <View style={s.choicesBox}>
        {question.choices.map((c, i) => (
          <View
            key={i}
            style={[s.choiceRow, i === correct && s.choiceRowCorrect]}
          >
            <Text style={[s.choiceMarker, i === correct && s.choiceMarkerCorrect]}>
              {i === correct ? '✅' : ` ${i + 1}`}
            </Text>
            <Text style={[s.choiceText, i === correct && s.choiceTextCorrect]}>
              {c}
            </Text>
          </View>
        ))}
      </View>

      <View style={s.divider} />

      <Text style={s.explainTitle}>💡 解説</Text>
      <Text style={s.explainText}>{question.explanation}</Text>

      {question.choiceExplanations && (
        <>
          <Text style={[s.explainTitle, { marginTop: 12 }]}>選択肢別解説</Text>
          {question.choiceExplanations.map((ce, i) => (
            <Text key={i} style={s.choiceExplainText}>
              {i + 1}. {ce}
            </Text>
          ))}
        </>
      )}

      {question.coreEssence && (
        <View style={s.essenceBox}>
          <Text style={s.essenceLabel}>1行エッセンス</Text>
          <Text style={s.essenceText}>{question.coreEssence}</Text>
        </View>
      )}

      <View style={s.metaRow}>
        {question.sourceExamYear && (
          <Text style={s.metaText}>出題年: {question.sourceExamYear}</Text>
        )}
        {question.lawEffectiveFrom && (
          <Text style={s.metaText}>法令施行: {question.lawEffectiveFrom}</Text>
        )}
        {question.reviewReason && (
          <Text style={[s.metaText, { color: colors.error }]}>
            事由: {question.reviewReason}
          </Text>
        )}
      </View>
    </View>
  );
}

// ============================================================
// スタイル
// ============================================================
function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.background },
    scroll: { padding: Spacing.lg, paddingBottom: 60 },

    loadingBox: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 80,
    },
    loadingText: {
      marginTop: 12,
      color: C.textSecondary,
      fontSize: FontSize.subhead,
    },
    errorBox: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 80,
      paddingHorizontal: Spacing.xl,
    },
    errorText: {
      color: C.error,
      fontSize: FontSize.subhead,
      textAlign: 'center',
      marginBottom: 16,
    },
    inlineError: {
      backgroundColor: C.error + '22',
      padding: Spacing.md,
      borderRadius: BorderRadius.md,
      marginBottom: Spacing.md,
    },
    inlineErrorText: {
      color: C.error,
      fontSize: FontSize.caption,
    },
    btn: {
      backgroundColor: C.primary,
      paddingHorizontal: 28,
      paddingVertical: 12,
      borderRadius: BorderRadius.full,
    },
    btnText: { color: C.white, fontWeight: '800', fontSize: FontSize.subhead },

    heroCard: {
      backgroundColor: C.primary,
      borderRadius: BorderRadius.xl,
      padding: 24,
      marginBottom: Spacing.lg,
      alignItems: 'center',
    },
    heroLabel: {
      fontSize: FontSize.caption,
      fontWeight: '700',
      color: 'rgba(255,255,255,0.85)',
      letterSpacing: LetterSpacing.wide,
      marginBottom: 8,
    },
    heroValue: {
      fontSize: 44,
      fontWeight: '900',
      color: C.white,
      letterSpacing: -1,
    },
    heroValueSlash: {
      fontSize: 22,
      fontWeight: '700',
      color: 'rgba(255,255,255,0.85)',
    },
    heroSub: {
      fontSize: FontSize.caption,
      color: 'rgba(255,255,255,0.85)',
      marginTop: 4,
    },

    filterRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginBottom: Spacing.md,
    },
    filterChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: BorderRadius.full,
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.borderLight,
      marginRight: 8,
      marginBottom: 8,
    },
    filterChipActive: {
      backgroundColor: C.primary,
      borderColor: C.primary,
    },
    filterChipText: {
      fontSize: FontSize.caption,
      fontWeight: '700',
      color: C.textSecondary,
    },
    filterChipTextActive: {
      color: C.white,
    },

    section: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      padding: Spacing.lg,
      marginBottom: Spacing.md,
    },
    sectionTitle: {
      fontSize: FontSize.subhead,
      fontWeight: '800',
      color: C.text,
      marginBottom: 12,
    },
    bodyText: {
      fontSize: FontSize.subhead,
      color: C.textSecondary,
      lineHeight: 22,
    },

    qHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    qIndex: {
      fontSize: FontSize.caption,
      color: C.textTertiary,
      fontWeight: '700',
    },
    qCategory: {
      fontSize: FontSize.caption,
      color: C.primary,
      fontWeight: '800',
    },
    qId: {
      fontSize: FontSize.caption2,
      color: C.textTertiary,
      marginBottom: 8,
    },
    qText: {
      fontSize: FontSize.subhead,
      color: C.text,
      lineHeight: 24,
      marginBottom: 12,
    },

    statementBox: {
      backgroundColor: C.background,
      borderRadius: BorderRadius.md,
      padding: Spacing.md,
      marginBottom: 12,
    },
    statementText: {
      fontSize: FontSize.caption,
      color: C.text,
      lineHeight: 20,
      marginBottom: 4,
    },

    choicesBox: { marginVertical: 8 },
    choiceRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: BorderRadius.md,
      marginBottom: 4,
    },
    choiceRowCorrect: {
      backgroundColor: C.primary + '15',
    },
    choiceMarker: {
      fontSize: FontSize.subhead,
      fontWeight: '900',
      color: C.textSecondary,
      width: 28,
    },
    choiceMarkerCorrect: { color: C.primary },
    choiceText: {
      flex: 1,
      fontSize: FontSize.caption,
      color: C.text,
      lineHeight: 20,
    },
    choiceTextCorrect: {
      fontWeight: '700',
      color: C.text,
    },

    divider: {
      height: 1,
      backgroundColor: C.borderLight,
      marginVertical: 12,
    },

    explainTitle: {
      fontSize: FontSize.caption,
      fontWeight: '800',
      color: C.text,
      marginBottom: 4,
    },
    explainText: {
      fontSize: FontSize.caption,
      color: C.textSecondary,
      lineHeight: 20,
    },
    choiceExplainText: {
      fontSize: FontSize.caption2,
      color: C.textSecondary,
      lineHeight: 18,
      marginTop: 2,
    },

    essenceBox: {
      marginTop: 12,
      padding: 12,
      borderRadius: BorderRadius.md,
      backgroundColor: C.accent + '15',
    },
    essenceLabel: {
      fontSize: FontSize.caption2,
      fontWeight: '700',
      color: C.accent,
      letterSpacing: LetterSpacing.wide,
    },
    essenceText: {
      fontSize: FontSize.caption,
      color: C.text,
      marginTop: 2,
      fontWeight: '700',
    },

    metaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: 12,
    },
    metaText: {
      fontSize: FontSize.caption2,
      color: C.textTertiary,
      marginRight: 12,
    },

    actionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginBottom: Spacing.md,
    },
    actionBtn: {
      flex: 1,
      minWidth: 120,
      paddingVertical: 14,
      borderRadius: BorderRadius.full,
      alignItems: 'center',
      marginRight: 8,
      marginBottom: 8,
    },
    actionBtnDisabled: { opacity: 0.5 },
    actionOk: { backgroundColor: C.primary },
    actionOkText: { color: C.white, fontWeight: '900', fontSize: FontSize.caption },
    actionFlag: { backgroundColor: C.error },
    actionFlagText: { color: C.white, fontWeight: '900', fontSize: FontSize.caption },
    actionSkip: {
      backgroundColor: C.card,
      borderWidth: 2,
      borderColor: C.borderLight,
    },
    actionSkipText: { color: C.textSecondary, fontWeight: '900', fontSize: FontSize.caption },

    refreshBtn: {
      backgroundColor: C.card,
      borderWidth: 2,
      borderColor: C.primary,
      borderRadius: BorderRadius.full,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: Spacing.md,
    },
    refreshBtnText: {
      color: C.primary,
      fontWeight: '800',
      fontSize: FontSize.caption,
    },

    dangerBtn: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: C.error,
      borderRadius: BorderRadius.full,
      paddingVertical: 10,
      alignItems: 'center',
      marginTop: Spacing.md,
    },
    dangerBtnText: {
      color: C.error,
      fontWeight: '700',
      fontSize: FontSize.caption2,
    },

    footer: {
      fontSize: FontSize.caption2,
      color: C.textTertiary,
      textAlign: 'center',
      marginTop: 24,
      lineHeight: 18,
    },
  });
}
