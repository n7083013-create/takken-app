import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Shadow, FontSize, LetterSpacing, Spacing, BorderRadius } from '../../constants/theme';
import { PASS_LINE } from '../../constants/exam';
import { useThemeColors, type ThemeColors } from '../../hooks/useThemeColors';
import { useExamPrediction } from '../../hooks/useExamPrediction';
import { usePredictionHistory } from '../../hooks/usePredictionHistory';
import { PredictionCard } from '../../components/PredictionCard';
import { PaywallPromptBanner } from '../../components/PaywallPromptBanner';
import { FinalSprintCard } from '../../components/FinalSprintCard';
import { useFinalSprintMode } from '../../hooks/useFinalSprintMode';
import { CATEGORY_LABELS, CATEGORY_ICONS, CATEGORY_COLORS, Category, SUBCATEGORIES } from '../../types';
import { ALL_QUESTIONS, getCategoryStats } from '../../data';
import { useProgressStore } from '../../store/useProgressStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useQuestStore } from '../../store/useQuestStore';
import { useAchievementStore, ALL_ACHIEVEMENTS } from '../../store/useAchievementStore';
import { useExamStore } from '../../store/useExamStore';
import { useAuthStore } from '../../store/useAuthStore';
import { decideOnboardingState, ONBOARDING_KEYS } from '../../utils/onboarding';
import { markOnboardingComplete } from '../../services/cloudSync';
import { setAiQueue } from '../../utils/aiQueue';
import {
  getRecommendedQuestionsByCategory,
  getRecommendedQuestionsBySubcategory,
  getRecommendedQuestionsForOther,
} from '../../services/aiAnalysis';
import { StreakCelebration } from '../../components/AnswerFeedback';
import { DailyGoalCelebration } from '../../components/DailyGoalCelebration';
import { useSessionStore } from '../../store/useSessionStore';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { AnnouncementBanner } from '../../components/AnnouncementBanner';
import { EmailConfirmBanner } from '../../components/EmailConfirmBanner';
import { StreakPulse } from '../../components/StreakPulse';
import { AnimatedNumber } from '../../components/AnimatedNumber';
import LandingPage from '../../components/LandingPage';
import Onboarding from '../../components/Onboarding';
// 合格エンジン (出題キュー / 今日やること状態マシン) は utils/passEngine に集約。
// UI から純粋ロジックを切り離し、出題基準を単一ソース化 + jest でテスト可能にしている。
import { buildPassQueue, pickOneSmart, computeTodayAction, evaluateTodayCompletion } from '../../utils/passEngine';

const TOTAL_Q = ALL_QUESTIONS.length;
const CATEGORY_STATS = getCategoryStats('takken');


/** サブカテゴリにマッチするタグがあるか判定 */
function matchSubcat(tags: string[], matchTags: string[]): boolean {
  return tags.some((t) => matchTags.includes(t));
}

/** 認証状態に応じてLP or オンボーディング or ダッシュボードを切り替えるラッパー */
export default function HomeScreenWrapper() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const initialized = useAuthStore((s) => s.initialized);
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  // クラウド進捗 (別デバイスでログインした時の判定用)
  const progressMap = useProgressStore((s) => s.progress);
  const hasAnyProgress = Object.keys(progressMap || {}).length > 0;

  useEffect(() => {
    if (!user) return;
    // [Bugfix v2] ユーザー固有キーに変更 (Web/Native 共通: 別ユーザー切替時の干渉防止)
    // 旧キー @takken_onboarding_done もマイグレーションして引継ぎ
    // ロジック本体は utils/onboarding.ts でユニットテスト済み (Race Condition 回避)
    // [Bugfix v3] user オブジェクトではなく user.id を dep にし、参照変化による無駄な再実行を防止
    // [Bugfix v3] getCloudOnboardingDone を追加: 別デバイスでオンボーディング済みなら即スキップ
    const uid = user.id;
    (async () => {
      const decision = await decideOnboardingState({
        userId: uid,
        storageGet: (k) => AsyncStorage.getItem(k),
        storageSet: (k, v) => AsyncStorage.setItem(k, v),
        syncWithCloud: () => useProgressStore.getState().syncWithCloud(uid),
        getProgress: () => useProgressStore.getState().progress,
        getCloudOnboardingDone: () => useProgressStore.getState().cloudOnboardingDone,
      });
      setOnboardingDone(decision === 'done');
    })();
  }, [user?.id]);

  // [Native] 未ログイン時はログイン画面に直接遷移（ストアアプリの標準動線）
  // Web では LP 表示（広告・SEO 経由の新規ユーザー獲得用）
  useEffect(() => {
    if (initialized && !user && Platform.OS !== 'web') {
      router.replace('/auth/login');
    }
  }, [initialized, user, router]);

  // ストア初期化完了前はスケルトンを表示
  if (!initialized) {
    return <LoadingSkeleton />;
  }

  if (!user) {
    // Native はログイン画面遷移中、表示は一瞬のスケルトン
    if (Platform.OS !== 'web') return <LoadingSkeleton />;
    return <LandingPage />;
  }

  // オンボーディング状態を読み込み中
  if (onboardingDone === null) {
    return <LoadingSkeleton />;
  }

  // 初回起動時: オンボーディングを表示
  if (!onboardingDone) {
    return (
      <Onboarding
        onComplete={async () => {
          // [Bugfix v2] ユーザー固有キーで完了マーク (Onboarding.tsx 側の旧キーは互換性のため残す)
          // [Bugfix v3] クラウドにも即時記録（別デバイスへの再表示防止）
          if (user) {
            await AsyncStorage.setItem(ONBOARDING_KEYS.forUser(user.id), 'true').catch(() => {});
            // 非同期で cloud に書き込む (失敗してもローカルキーで救済される)
            markOnboardingComplete(user.id).catch(() => {});
          }
          setOnboardingDone(true);
        }}
      />
    );
  }

  return <HomeScreen />;
}

function HomeScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  // iOS Safari の URL バー重なり / SPA 遷移時の inset 計算ズレ対策
  const insets = useSafeAreaInsets();
  const stats = useProgressStore((s) => s.stats);
  const progress = useProgressStore((s) => s.progress);
  // [2026-05-22] 一問一答も「今日の目標」に寄与するようになったので、
  // quickQuizStats も購読し再レンダーをトリガする。
  const quickQuizStats = useProgressStore((s) => s.quickQuizStats);
  const getDueForReview = useProgressStore((s) => s.getDueForReview);
  const getWeakQuestions = useProgressStore((s) => s.getWeakQuestions);
  const isPro = useSettingsStore((s) => s.isPro());
  const getDaysUntilExam = useSettingsStore((s) => s.getDaysUntilExam);
  // 習慣スタッキング: 設定=記録タブ / 通知=_layout で継続。ホームには出さない（シンプル化）
  const isTrialActive = useSettingsStore((s) => s.isTrialActive);
  const trialDaysLeft = useSettingsStore((s) => s.trialDaysLeft);
  const startTrial = useSettingsStore((s) => s.startTrial);
  const trialActive = useMemo(() => isTrialActive(), [isTrialActive]);
  const trialDays = useMemo(() => trialDaysLeft(), [trialDaysLeft]);
  const examDays = useMemo(() => getDaysUntilExam(), [getDaysUntilExam]);
  const questMissionProgress = useQuestStore((s) => s.missionProgress);
  const questGetOverall = useQuestStore((s) => s.getOverallProgress);
  const questGetNextMission = useQuestStore((s) => s.getNextRecommendedMission);
  const questOverall = useMemo(() => questGetOverall(), [questMissionProgress]);
  const nextMission = useMemo(() => questGetNextMission(), [questMissionProgress]);
  const getTodayAnswered = useProgressStore((s) => s.getTodayAnswered);
  const dailyGoal = useSettingsStore((s) => s.settings.dailyGoal);
  const achievementNewly = useAchievementStore((s) => s.newlyUnlocked);
  const dismissAchievement = useAchievementStore((s) => s.dismissNew);
  const examHistory = useExamStore((s) => s.examHistory);
  const getLatestScore = useExamStore((s) => s.getLatestScore);
  const getBestScore = useExamStore((s) => s.getBestScore);
  const [expandedCat, setExpandedCat] = useState<Category | null>(null);
  // [最初の一手 一本化] 「もっと選んで学習」セクションの開閉。
  // 既定は閉 (決定疲労の最大要因を畳む)。一度開いたら永続化して次回も開いた状態。
  const [moreExpanded, setMoreExpanded] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem('@takken_home_more_expanded')
      .then((v) => { if (v === 'true') setMoreExpanded(true); })
      .catch(() => {});
  }, []);
  const toggleMore = useCallback(() => {
    setMoreExpanded((prev) => {
      const next = !prev;
      AsyncStorage.setItem('@takken_home_more_expanded', next ? 'true' : 'false').catch(() => {});
      return next;
    });
  }, []);
  // [2026-06-03] ストリーク祝福は「マイルストーン到達時に1回だけ」。
  // 永続フラグ(@takken_celebrated_streak)で、ログイン/再表示の度に再表示しない。
  const [streakCelebVisible, setStreakCelebVisible] = useState(false);
  useEffect(() => {
    const milestones = [3, 5, 7, 10, 14, 21, 30, 50, 100];
    let cancelled = false;
    (async () => {
      const raw = await AsyncStorage.getItem('@takken_celebrated_streak').catch(() => null);
      let last = raw ? Number(raw) : 0;
      // ストリークがリセットされたら記録もリセット（再到達で再祝福できるように）
      if (stats.streak < last) {
        last = 0;
        await AsyncStorage.setItem('@takken_celebrated_streak', '0').catch(() => {});
      }
      if (!cancelled && milestones.includes(stats.streak) && stats.streak > last) {
        setStreakCelebVisible(true);
        // [2026-06-05] 「表示を決めた瞬間」にフラグを記録する。
        // 旧実装は閉じた時(dismiss)のみ記録だったため、祝福を閉じる/3秒の
        // 自動消去の前にアプリを終了→再起動すると毎回再表示されていた
        // (ネイティブで「見た瞬間にアプリ切替/終了」すると多発)。
        await AsyncStorage.setItem('@takken_celebrated_streak', String(stats.streak)).catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stats.streak]);
  const dismissStreakCeleb = useCallback(() => {
    setStreakCelebVisible(false);
    AsyncStorage.setItem('@takken_celebrated_streak', String(stats.streak)).catch(() => {});
  }, [stats.streak]);

  // 日目標達成祝福
  const [goalCelebVisible, setGoalCelebVisible] = useState(false);
  const markCelebrated = useSessionStore((st) => st.markCelebrated);
  const isCelebrated = useSessionStore((st) => st.isCelebrated);
  const s = useMemo(() => makeStyles(colors), [colors]);

  // [2026-05-22] getTodayAnswered は 4択 + 一問一答×0.2 の float を返す。
  // 目標判定 / 進捗バーは float のまま使う (滑らかな進捗表示)。
  // 数値カードや「X/Y問」表記は丸めて整数表示する。
  // deps に stats / quickQuizStats を含めること: クラウド同期で stats.dailyLog が
  // 更新された時にも再計算する (Issue: PC で別デバイスの解答が反映されない原因)。
  const todayAnsweredRaw = useMemo(
    () => getTodayAnswered(),
    [stats, progress, quickQuizStats, getTodayAnswered],
  );
  const todayAnswered = useMemo(() => Math.round(todayAnsweredRaw), [todayAnsweredRaw]);
  const dailyGoalPct = useMemo(
    () => dailyGoal > 0 ? Math.min(100, Math.round((todayAnsweredRaw / dailyGoal) * 100)) : 0,
    [todayAnsweredRaw, dailyGoal],
  );

  // 日目標達成を検知 → 1日1回だけ祝福演出を発火。
  // [完了判定の進化] 「解いた数」だけでなく「今日の due を消化し切ったか」も条件にする
  // (やみくもに新規/ランダムを回して数だけ満たしても、復習が残っていれば祝福しない = 憲法 P6)。
  // due が無い日は純粋な積み上げ日として数ノルマのみで達成。
  useEffect(() => {
    const dueRemaining = getDueForReview().length;
    const completion = evaluateTodayCompletion({
      dueAtStartOfDay: dueRemaining, // 残 due があれば「まだ未消化」とみなす保守的判定
      dueRemaining,
      todayAnswered: todayAnsweredRaw,
      dailyGoal,
    });
    if (completion.isComplete) {
      const today = new Date().toISOString().slice(0, 10);
      const key = `daily_goal_${today}`;
      if (!isCelebrated(key)) {
        setGoalCelebVisible(true);
        markCelebrated(key);
      }
    }
  }, [dailyGoal, todayAnswered, todayAnsweredRaw, getDueForReview, isCelebrated, markCelebrated]);
  const latestExamScore = useMemo(() => getLatestScore(), [examHistory]);
  const bestExamScore = useMemo(() => getBestScore(), [examHistory]);

  /** スマート連続出題で即スタート (1タップで今日のセッションが続く)
      合格エンジン (buildPassQueue) が due→苦手→新規→残りを試験日逆算で配合し、
      科目インターリーブまで済ませたキューで source=ai 連続出題に入る。
      キューが空 (= 全マスター等) のときは単発フォールバック。 */
  const startSmartQuestion = useCallback(async () => {
    const latestProgress = useProgressStore.getState().progress;
    const ids = buildPassQueue(latestProgress, { daysUntilExam: getDaysUntilExam() });
    if (ids.length === 0) {
      const q = pickOneSmart(latestProgress);
      router.push(`/question/${q.id}`);
      return;
    }
    await setAiQueue(
      {
        getItem: (k) => AsyncStorage.getItem(k),
        setItem: (k, v) => AsyncStorage.setItem(k, v),
        removeItem: (k) => AsyncStorage.removeItem(k),
      },
      ids,
    );
    router.push(`/question/${ids[0]}?source=ai` as any);
  }, [router, getDaysUntilExam]);

  /** 統合ブロックのワンタップ集中: 最弱カテゴリの AI 推奨 10 問を連続出題で開始
      (home カテゴリ chip と同一方式: getRecommendedQuestionsByCategory → setAiQueue → source=ai) */
  const startWeakestFocus = useCallback(async (cat: Category) => {
    const latestProgress = useProgressStore.getState().progress;
    const recommended = getRecommendedQuestionsByCategory(latestProgress, cat, 10);
    if (recommended.length === 0) return;
    const ids = recommended.map((r) => r.questionId);
    await setAiQueue(
      {
        getItem: (k) => AsyncStorage.getItem(k),
        setItem: (k, v) => AsyncStorage.setItem(k, v),
        removeItem: (k) => AsyncStorage.removeItem(k),
      },
      ids,
    );
    router.push(`/question/${ids[0]}?source=ai` as any);
  }, [router]);

  // 達成率(習得率)はホームの「合格の物差し」から降格 (合格判定は予測点数に一本化・P6)。
  // 習得カバー率は記録タブで「学習の網羅度」として表示する。
  const dueCount = useMemo(() => getDueForReview().length, [getDueForReview]);
  const weakCount = useMemo(() => getWeakQuestions().length, [getWeakQuestions]);

  const examPrediction = useExamPrediction();
  const predictionHistory = usePredictionHistory(
    examPrediction.totalPredicted,
    examPrediction.passProbability,
    examPrediction.hasData,
  );
  const sprintMode = useFinalSprintMode();

  // データ0(未着手): 点を出さず「あと◯問で予測開始」。閾値はエンジンの low ティア相当(演習10問)で十分。
  const PREDICTION_MIN_QUESTIONS = 10;
  const answeredForPrediction = stats.totalQuestions;

  // 時間帯に応じた最適アクションのサジェスト
  const hourNow = new Date().getHours();
  const isEvening = hourNow >= 21 || hourNow < 5;

  // ── 単一CTA「今日やること」状態マシン ──
  // 4分岐の三項を撤廃し、純粋関数 computeTodayAction が決めた 1 つの action を描画する。
  // 表示文言と a11yLabel は action 側で単一ソース化済 (ズレ防止)。
  const weakestCategoryLabel = examPrediction.weakestCategory
    ? CATEGORY_LABELS[examPrediction.weakestCategory]
    : undefined;
  const todayAction = useMemo(
    () =>
      computeTodayAction({
        totalAnswered: stats.totalQuestions,
        examDays,
        hasMockHistory: examHistory.length > 0,
        dueCount,
        weakCount,
        isEvening,
        todayAnswered: todayAnsweredRaw,
        dailyGoal,
        weakestCategoryLabel,
      }),
    [stats.totalQuestions, examDays, examHistory.length, dueCount, weakCount, isEvening, todayAnsweredRaw, dailyGoal, weakestCategoryLabel],
  );

  // action.kind → 実際の遷移。空 / 全達成でも必ず意味ある 1 手を返す (死んだボタン厳禁)。
  const onTodayAction = useCallback(() => {
    switch (todayAction.kind) {
      case 'mockExam':
        router.push('/exam');
        return;
      case 'preSleep':
        router.push('/pre-sleep-review');
        return;
      case 'review':
        router.push('/(tabs)/review');
        return;
      case 'weakFocus':
        if (examPrediction.weakestCategory) { startWeakestFocus(examPrediction.weakestCategory); }
        else { startSmartQuestion(); }
        return;
      case 'firstQuestion':
      case 'continueGoal':
      case 'goalReachedMore':
      case 'allCaughtUp':
      default:
        startSmartQuestion();
    }
  }, [todayAction.kind, router, examPrediction.weakestCategory, startWeakestFocus, startSmartQuestion]);

  return (
    <SafeAreaView style={s.safe}>
      {/* お知らせバナー（ScrollView外で画面上部に固定表示） */}
      <AnnouncementBanner />
      {/* メール確認バナー */}
      <EmailConfirmBanner />
      {/* ストリークマイルストーン祝福 */}
      <StreakCelebration
        streak={stats.streak}
        visible={streakCelebVisible}
        onDismiss={dismissStreakCeleb}
      />
      {/* 日目標達成祝福（その日1回のみ） */}
      <DailyGoalCelebration
        visible={goalCelebVisible}
        dailyGoal={dailyGoal}
        answered={todayAnswered}
        onDismiss={() => setGoalCelebVisible(false)}
      />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Hero（コンパクト） ── */}
        {/* Native: SafeAreaView が insets.top を padding 済 → 小さい固定値で十分
           Web: iOS Safari URL バー対策で insets.top を加算 */}
        <View style={[s.hero, { paddingTop: Platform.OS === 'web' ? Math.max(10, insets.top + 4) : 10 }]}>
          <View style={s.heroTop}>
            {examDays !== null ? (
              <View>
                <Text style={s.examCountdownLabel}>試験まであと</Text>
                <View style={s.examCountdownRow}>
                  <AnimatedNumber value={examDays} style={s.examCountdownNum} duration={500} />
                  <Text style={s.examCountdownUnit}>日</Text>
                </View>
              </View>
            ) : (
              <View>
                <Text style={s.heroTitle}>宅建士 完全対策</Text>
              </View>
            )}
            {/* 連続日数: 0日でもヘッダーに常時表示。
                以前は streak>0 で隠していたが「記録が消えた」と誤解されるため常時表示に変更。 */}
            <StreakPulse streak={stats.streak} style={s.streakBadge} breathing={stats.streak > 0}>
              <View style={s.streakBadgeRow}>
                <Text style={s.streakBadgeFire}>🔥</Text>
                <Text style={s.streakBadgeNum}>{stats.streak}</Text>
                <Text style={s.streakBadgeDay}>日</Text>
              </View>
              <Text style={s.streakBadgeLabel}>連続</Text>
            </StreakPulse>
          </View>
        </View>

        {/* ── トライアルバナー ── */}
        {trialActive && (
          <View style={[s.trialBanner, Shadow.sm]}>
            <View>
              <Text style={s.trialBannerTitle}>🎁 無料トライアル中</Text>
              <Text style={s.trialBannerSub}>全機能が使えます — 残り{trialDays}日</Text>
            </View>
            {trialDays <= 3 && (
              <Pressable style={s.trialUpgradeBtn} onPress={() => router.push('/paywall')}>
                <Text style={s.trialUpgradeBtnText}>プランを見る</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* ── 新規実績通知（あれば最優先表示） ── */}
        {achievementNewly.length > 0 && (() => {
          const latestId = achievementNewly[achievementNewly.length - 1];
          const badge = ALL_ACHIEVEMENTS.find((a) => a.id === latestId);
          if (!badge) return null;
          return (
            <Pressable
              style={[s.achievementBanner, Shadow.md]}
              onPress={() => { dismissAchievement(latestId); router.push('/achievements'); }}
            >
              <Text style={s.achievementIcon}>{badge.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.achievementTitle}>実績解除！ {badge.title}</Text>
                <Text style={s.achievementDesc}>{badge.description}</Text>
              </View>
              <Text style={s.achievementClose}>✕</Text>
            </Pressable>
          );
        })()}

        {/* ── 今日やること: 開いた直後に迷わず押せる最優先アクション (単一CTA状態マシン) ── */}
        <Pressable
          style={[s.mainCTA, todayAction.tone === 'calm' && s.mainCTACalm, Shadow.lg]}
          accessibilityRole="button"
          accessibilityLabel={todayAction.a11yLabel}
          onPress={onTodayAction}
        >
          <Text style={s.mainCTALabel}>今日やること</Text>
          <View style={s.mainCTAContent}>
            <Text style={s.mainCTAIcon}>{todayAction.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.mainCTATitle}>{todayAction.title}</Text>
              <Text style={s.mainCTASub}>{todayAction.sub}</Text>
            </View>
            <Text style={s.mainCTAArrow}>→</Text>
          </View>
        </Pressable>

        {/* 弱点サマリー/予測スコア/科目別分析リンクの統合ブロックは廃止。
            弱点は「今日やること」CTA(状態⑤ startWeakestFocus)が主役で扱い、
            予測スコア詳細・科目別分析・弱点ヒートマップは記録タブに集約済 → 重複解消(P4)。 */}

        {/* ── 今日の進捗（コンパクトダッシュボード） ── */}
        <View style={[s.dashCard, Shadow.md]}>
          {/* デイリーゴール (統計3つ=達成率/累計/進捗% は記録タブに集約 → ホームは目標と合格距離の2指標に圧縮) */}
          <View style={s.dashTop}>
            <View style={s.dashGoal}>
              <View style={s.dashGoalRing}>
                <AnimatedNumber value={todayAnswered} style={s.dashGoalNum} duration={500} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} />
                <Text style={s.dashGoalDenom}>/{dailyGoal}</Text>
              </View>
              <Text style={s.dashGoalLabel}>
                {dailyGoalPct >= 100 ? '達成！' : '今日の目標'}
              </Text>
            </View>
            {/* 学習タイマー: 大きいカードをやめ「今日の目標」の隣に小さく配置 */}
            <Pressable style={s.dashTimerBtn} onPress={() => router.push('/study-timer')} accessibilityRole="button" accessibilityLabel="学習タイマーを開く">
              <Text style={s.dashTimerIcon}>⏱️</Text>
              <Text style={s.dashTimerText}>タイマー</Text>
            </Pressable>
          </View>
          {/* 進捗バー */}
          <View style={s.dashProgress}>
            <View style={[s.dashProgressFill, { width: `${dailyGoalPct}%` }]} />
          </View>

          {/* ── 合格の物差し = 本試験予測点数の 1 行プレビュー ──
              旧「合格までの距離」(達成率ベース) を廃止し、合格判定は予測点数に一本化(P6・役割分離)。
              タップ → 記録タブの予測ハブ。データ0/測定中は誠実に状態別表示。 */}
          <Pressable
            style={s.predPreview}
            onPress={() => router.push('/(tabs)/progress')}
            accessibilityRole="button"
            accessibilityLabel={
              examPrediction.hasData
                ? `本試験予測 ${examPrediction.totalPredicted}点、合格ライン${PASS_LINE}点。タップで予測の詳細を見る`
                : '予測はまだ出ていません。タップで学習記録を見る'
            }
          >
            {examPrediction.hasData ? (
              <PredictionCard prediction={examPrediction} history={predictionHistory} compact />
            ) : (
              <View>
                <Text style={s.predEmptyTitle}>📊 本試験 予測点数</Text>
                <Text style={s.predEmptyMsg}>
                  まだ予測できません — あと {Math.max(1, PREDICTION_MIN_QUESTIONS - answeredForPrediction)}問 解くと予測開始
                </Text>
                <View style={s.predDotsRow}>
                  {Array.from({ length: PREDICTION_MIN_QUESTIONS }).map((_, i) => (
                    <View
                      key={i}
                      style={[s.predDot, i < answeredForPrediction && s.predDotFilled]}
                    />
                  ))}
                </View>
              </View>
            )}
            <Text style={s.predPreviewArrow}>詳細を見る ›</Text>
          </Pressable>
        </View>

        {/* 「今日の習慣」セクションは廃止（習慣設定=記録タブ・通知=_layoutで継続）→ ホームの下スクロールを削減（P1迷い/P4シンプル） */}

        {/* クイックアクション(タイマー)は「今日の目標」隣の小ボタンへ移動(大カード廃止・P4) */}

        {/* ── クエスト学習（メインの学習パス） ── */}
        <Pressable
          style={[s.questBanner, Shadow.md]}
          accessibilityRole="button"
          accessibilityLabel="クエスト学習を開く"
          onPress={() => nextMission ? router.push(`/quest/${nextMission}`) : router.push('/quest')}
        >
          <View style={s.questBannerLeft}>
            <Text style={s.questBannerIcon}>🗺️</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.questBannerTitle}>クエスト学習</Text>
              <Text style={s.questBannerSub}>
                {questOverall.completed === 0
                  ? '基礎からステップアップ'
                  : `${questOverall.completed}/${questOverall.total}ミッション完了`}
              </Text>
            </View>
          </View>
          <View style={s.questBannerProgress}>
            <View style={s.questBannerTrack}>
              <View style={[s.questBannerFill, { width: `${questOverall.percent}%` }]} />
            </View>
            <Text style={s.questBannerPercent}>{questOverall.percent}%</Text>
          </View>
        </Pressable>

        {/* ── 模擬試験（クエスト直下に常時表示・本試験直結の主要導線） ── */}
        <Pressable
          style={[s.examCard, Shadow.sm]}
          onPress={() => router.push('/exam')}
          accessibilityRole="button"
          accessibilityLabel="模擬試験を開始"
        >
          <Text style={s.examCardIcon}>📋</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.examCardTitle}>模擬試験</Text>
            <Text style={s.examCardSub}>本番形式50問で実力チェック</Text>
          </View>
          <Text style={s.examCardArrow}>›</Text>
        </Pressable>

        {/* 直近7日の学習バーチャートは記録タブ(progress)へ移設(ホーム簡素化 P4)。 */}

        {/* ── 直前モード（試験30日前から自動表示） ── */}
        {sprintMode.isActive && <FinalSprintCard state={sprintMode} />}

        {/* ── ペイウォール訴求（折りたたみ直前へ降格） ──
            旧: 予測スコア/弱点コーチング/🤖バナーは統合ブロックに吸収済。
            弱点ヒートマップ tile は記録タブへ、実績 tile は記録タブの既存リンクへ退避。 */}
        <PaywallPromptBanner />
        {!isPro && (
          <View style={s.bannerSection}>
            <Pressable style={[s.bannerCard, s.bannerGold, Shadow.md]} onPress={() => router.push('/paywall')}>
              <Text style={s.bannerEmoji}>✨</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.bannerTitle}>PREMIUMで合格を目指す</Text>
                <Text style={s.bannerSub}>全{TOTAL_Q}問・模試・AI解説が使い放題</Text>
              </View>
              <Text style={s.bannerArrow}>›</Text>
            </Pressable>
          </View>
        )}

        {/* ── 「もっと選んで学習」(決定疲労の最大要因を折りたたみへ) ──
            既定は閉。カテゴリ別 / よく出る論点 / 学習モード / 論点別 全chip を中に格納。
            機能・ハンドラ・データはそのまま (移動のみ)。上級者・直前期向けに残す。 */}
        <Pressable
          style={[s.moreToggle, Shadow.sm]}
          onPress={toggleMore}
          accessibilityRole="button"
          accessibilityState={{ expanded: moreExpanded }}
          accessibilityLabel={moreExpanded ? 'もっと選んで学習を閉じる' : 'もっと選んで学習を開く'}
        >
          <Text style={s.moreToggleChevron}>{moreExpanded ? '▾' : '▸'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.moreToggleTitle}>もっと選んで学習</Text>
            <Text style={s.moreToggleSub}>カテゴリ・論点・模試・弱点ドリルから自分で選ぶ</Text>
          </View>
        </Pressable>

        {moreExpanded && (<>
        {/* ── [UX改善] カテゴリ別 / 論点別に解く ──
            「宅建業法だけ集中して解きたい」「固定資産税をピンポイントで」
            のような頻出ニーズに応える。
            タップ → AI推奨の弱点優先問題を10問キューに保存して、最初の問題に直行
            (= 連続出題モード。質問画面で source=ai を判定して次々と問題を出す) */}
        <Text style={s.sectionTitle}>🎯 カテゴリ別に解く</Text>
        <Text style={s.sectionDescSmall}>AIがあなたの弱点を優先してベスト問題を選びます</Text>
        <View style={s.catChipGrid}>
          {(['kenri', 'takkengyoho', 'horei_seigen', 'tax_other'] as Category[]).map((cat) => (
            <Pressable
              key={cat}
              style={[s.catChip, { borderColor: CATEGORY_COLORS[cat] }, Shadow.sm]}
              onPress={async () => {
                const progress = useProgressStore.getState().progress;
                const recommended = getRecommendedQuestionsByCategory(progress, cat, 20);
                if (recommended.length === 0) return;
                const ids = recommended.map((r) => r.questionId);
                await setAiQueue(
                  {
                    getItem: (k) => AsyncStorage.getItem(k),
                    setItem: (k, v) => AsyncStorage.setItem(k, v),
                    removeItem: (k) => AsyncStorage.removeItem(k),
                  },
                  ids,
                );
                router.push(`/question/${ids[0]}?source=ai` as any);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${CATEGORY_LABELS[cat]}の弱点問題を連続で解く`}
            >
              <Text style={s.catChipIcon}>{CATEGORY_ICONS[cat]}</Text>
              <Text style={[s.catChipText, { color: CATEGORY_COLORS[cat] }]}>{CATEGORY_LABELS[cat]}</Text>
            </Pressable>
          ))}
        </View>

        {/* 「よく出る論点」プリセットchip(緑6個)は廃止（ホーム簡素化。論点別は下の「📚 論点を選んで解く」で全論点から選べる） */}

        {/* 模擬試験カードはクエスト直下へ常時表示に昇格(折りたたみ外へ移動)。 */}

        {/* ── [UX改善] 科目別 → 全論点 chip 一覧 (タップで即連続出題)
            旧: カードタップで展開 → サブカテゴリの「正答率%」表示
                 (進捗率は記録ページに同等機能あるため重複していた)
            新: 各カテゴリ見出しの下にサブカテゴリ chip 一覧を常時表示
                 chip タップ = AI弱点優先15問の連続出題が即開始 */}
        <Text style={s.sectionTitle}>📚 論点を選んで解く</Text>
        <Text style={s.sectionDescSmall}>苦手な論点をピンポイントで集中学習</Text>
        {CATEGORY_STATS.map(({ category }) => {
          const catColor = CATEGORY_COLORS[category];
          const subcats = SUBCATEGORIES[category];

          return (
            <View key={category} style={s.catBlockWrapper}>
              {/* カテゴリ見出し (タップ = 該当カテゴリ全体の連続出題) */}
              <Pressable
                style={[s.catBlockHeader, { borderLeftColor: catColor }]}
                onPress={async () => {
                  const progressMap = useProgressStore.getState().progress;
                  const recommended = getRecommendedQuestionsByCategory(progressMap, category, 20);
                  if (recommended.length === 0) return;
                  const ids = recommended.map((r) => r.questionId);
                  await setAiQueue(
                    {
                      getItem: (k) => AsyncStorage.getItem(k),
                      setItem: (k, v) => AsyncStorage.setItem(k, v),
                      removeItem: (k) => AsyncStorage.removeItem(k),
                    },
                    ids,
                  );
                  router.push(`/question/${ids[0]}?source=ai` as any);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${CATEGORY_LABELS[category]}全体を解く`}
              >
                <Text style={s.catBlockIcon}>{CATEGORY_ICONS[category]}</Text>
                <Text style={[s.catBlockName, { color: catColor }]}>{CATEGORY_LABELS[category]}</Text>
                <Text style={[s.catBlockArrow, { color: catColor }]}>▶ 全体を解く</Text>
              </Pressable>
              {/* サブカテゴリ chip 一覧 + 末尾に「その他」chip */}
              <View style={s.subChipRow}>
                {subcats.map((sc) => {
                  const scQuestions = ALL_QUESTIONS.filter(
                    (q) => q.category === category && matchSubcat(q.tags, sc.matchTags),
                  );
                  if (scQuestions.length === 0) return null;
                  return (
                    <Pressable
                      key={sc.key}
                      style={[s.subChip, { borderColor: catColor + '50' }]}
                      onPress={async () => {
                        const progressMap = useProgressStore.getState().progress;
                        const recommended = getRecommendedQuestionsBySubcategory(
                          progressMap,
                          category,
                          sc.matchTags,
                          15,
                        );
                        if (recommended.length === 0) return;
                        const ids = recommended.map((r) => r.questionId);
                        await setAiQueue(
                          {
                            getItem: (k) => AsyncStorage.getItem(k),
                            setItem: (k, v) => AsyncStorage.setItem(k, v),
                            removeItem: (k) => AsyncStorage.removeItem(k),
                          },
                          ids,
                        );
                        router.push(`/question/${ids[0]}?source=ai` as any);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`${sc.label}を集中して解く`}
                    >
                      <Text style={s.subChipIcon}>{sc.icon}</Text>
                      <Text style={[s.subChipText, { color: catColor }]}>{sc.label}</Text>
                    </Pressable>
                  );
                })}
                {/* [Bugfix] どの subcategory にもマッチしない問題用の「その他」chip。
                    例: 権利関係に22問、宅建業法に19問、法令に15問、税・その他に12問が該当。
                    これらが chip からアクセス不能になっていたので末尾に追加。 */}
                {(() => {
                  const matchedIds = new Set<string>();
                  for (const sc of subcats) {
                    for (const q of ALL_QUESTIONS) {
                      if (q.category === category && matchSubcat(q.tags, sc.matchTags)) {
                        matchedIds.add(q.id);
                      }
                    }
                  }
                  const otherCount = ALL_QUESTIONS.filter(
                    (q) => q.category === category && !matchedIds.has(q.id),
                  ).length;
                  if (otherCount === 0) return null;
                  return (
                    <Pressable
                      key="_other"
                      style={[s.subChip, { borderColor: catColor + '50' }]}
                      onPress={async () => {
                        const progressMap = useProgressStore.getState().progress;
                        const allMatchTags = subcats.flatMap((sc) => sc.matchTags);
                        const recommended = getRecommendedQuestionsForOther(progressMap, category, allMatchTags, 15);
                        if (recommended.length === 0) return;
                        const ids = recommended.map((r) => r.questionId);
                        await setAiQueue(
                          {
                            getItem: (k) => AsyncStorage.getItem(k),
                            setItem: (k, v) => AsyncStorage.setItem(k, v),
                            removeItem: (k) => AsyncStorage.removeItem(k),
                          },
                          ids,
                        );
                        router.push(`/question/${ids[0]}?source=ai` as any);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`${CATEGORY_LABELS[category]}のその他論点を集中して解く`}
                    >
                      <Text style={s.subChipIcon}>📦</Text>
                      <Text style={[s.subChipText, { color: catColor }]}>その他</Text>
                    </Pressable>
                  );
                })()}
              </View>
            </View>
          );
        })}
        </>)}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) { return StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  scroll: { paddingBottom: 20 },

  // ─── Hero（コンパクト）— SafeAreaView が insets.top を padding 済のため小さく ───
  hero: {
    paddingHorizontal: Spacing.xl,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: C.primary,
    borderBottomLeftRadius: BorderRadius.xxl,
    borderBottomRightRadius: BorderRadius.xxl,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroTitle: {
    fontSize: FontSize.largeTitle,
    fontWeight: '800',
    color: C.white,
    letterSpacing: LetterSpacing.tight,
  },
  examCountdownLabel: {
    fontSize: FontSize.subhead,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: LetterSpacing.wide,
  },
  examCountdownRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 2,
  },
  examCountdownNum: {
    fontSize: 36,
    fontWeight: '900',
    color: C.white,
    letterSpacing: -0.5,
  },
  examCountdownUnit: {
    fontSize: FontSize.title3,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.9)',
    marginLeft: 4,
  },
  heroAppName: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'right',
    marginTop: 8,
  },
  streakBadge: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: BorderRadius.lg,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
  },
  streakBadgeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  streakBadgeFire: {
    fontSize: 20,
    marginRight: 2,
    alignSelf: 'center',
  },
  streakBadgeDay: {
    fontSize: 14,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.9)',
    marginLeft: 1,
  },
  streakBadgeNum: {
    fontSize: FontSize.title1,
    fontWeight: '900',
    color: C.white,
  },
  streakBadgeLabel: {
    fontSize: FontSize.caption2,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    marginTop: 1,
  },
  // ─── Trial Banner ───
  trialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.infoSurface,
    borderRadius: BorderRadius.lg,
    padding: 16,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
    borderWidth: 1,
    borderColor: C.primary + '30',
  },
  trialBannerTitle: { fontSize: FontSize.subhead, fontWeight: '700', color: C.primary },
  trialBannerSub: { fontSize: FontSize.caption, color: C.textSecondary, marginTop: 2 },
  trialUpgradeBtn: { backgroundColor: C.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: BorderRadius.md },
  trialUpgradeBtnText: { fontSize: FontSize.footnote, fontWeight: '700', color: C.white },

  // ─── Achievement Banner ───
  achievementBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    padding: Spacing.md,
    gap: 10,
  },
  achievementIcon: { fontSize: 28 },
  achievementTitle: { fontSize: FontSize.footnote, fontWeight: '800', color: '#92400E' },
  achievementDesc: { fontSize: FontSize.caption, color: '#B45309', marginTop: 2 },
  achievementClose: { fontSize: 16, color: '#D97706', fontWeight: '600', padding: 4 },

  // ─── Compact Dashboard ───
  dashCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
    backgroundColor: C.card,
    borderRadius: BorderRadius.xl,
    padding: 20,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  dashTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  dashTimerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  dashTimerIcon: { fontSize: 15 },
  dashTimerText: { fontSize: FontSize.footnote, fontWeight: '700', color: C.textSecondary },
  dashGoal: {
    alignItems: 'center',
  },
  dashGoalRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: C.accent,
    backgroundColor: C.warningSurface,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  dashGoalNum: {
    fontSize: FontSize.title2,
    fontWeight: '900',
    color: C.accent,
  },
  dashGoalDenom: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    color: C.textTertiary,
  },
  dashGoalLabel: {
    fontSize: FontSize.caption2,
    fontWeight: '700',
    color: C.textSecondary,
    marginTop: 6,
  },
  dashProgress: {
    height: 6,
    backgroundColor: C.borderLight,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 14,
  },
  dashProgressFill: {
    height: '100%',
    backgroundColor: C.accent,
    borderRadius: 3,
  },

  // ─── 本試験予測点数 1 行プレビュー (旧 distanceBox の位置) ───
  predPreview: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: C.borderLight,
  },
  predPreviewArrow: {
    fontSize: FontSize.caption,
    fontWeight: '700',
    color: C.primary,
    textAlign: 'right',
    marginTop: 8,
  },
  predEmptyTitle: {
    fontSize: FontSize.footnote,
    fontWeight: '700',
    color: C.text,
  },
  predEmptyMsg: {
    fontSize: FontSize.caption,
    color: C.textSecondary,
    marginTop: 6,
    fontWeight: '600',
  },
  predDotsRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 10,
  },
  predDot: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.borderLight,
  },
  predDotFilled: {
    backgroundColor: C.primary,
  },

  // ─── Main CTA (最初の一手・画面で最も目立つ特大カード) ───
  mainCTA: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
    backgroundColor: C.primary,
    borderRadius: BorderRadius.xxl,
    paddingHorizontal: 22,
    paddingVertical: 26,
  },
  // 全達成状態 (allCaughtUp) の弱トーン。ボタンは無効化せず必ず押せる。
  mainCTACalm: {
    backgroundColor: C.success,
  },
  mainCTALabel: {
    fontSize: FontSize.footnote,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: LetterSpacing.wide,
    marginBottom: 12,
  },
  mainCTAContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  mainCTAIcon: {
    fontSize: 42,
  },
  mainCTATitle: {
    fontSize: FontSize.title2,
    fontWeight: '900',
    color: C.white,
    letterSpacing: LetterSpacing.tight,
  },
  mainCTASub: {
    fontSize: FontSize.footnote,
    color: 'rgba(255,255,255,0.82)',
    marginTop: 5,
  },
  mainCTAArrow: {
    fontSize: 30,
    color: C.white,
    fontWeight: '300',
  },

  // ─── 「もっと選んで学習」折りたたみトグル ───
  moreToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: Spacing.xl,
    marginTop: 28,
    backgroundColor: C.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: C.borderLight,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  moreToggleChevron: {
    fontSize: 18,
    fontWeight: '800',
    color: C.primary,
    width: 18,
    textAlign: 'center',
  },
  moreToggleTitle: {
    fontSize: FontSize.subhead,
    fontWeight: '800',
    color: C.text,
    letterSpacing: LetterSpacing.tight,
  },
  moreToggleSub: {
    fontSize: FontSize.caption,
    color: C.textSecondary,
    marginTop: 2,
  },

  // ─── Quick Grid（4つ横並び） ───
  quickGrid: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
  },
  quickCard: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: BorderRadius.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  quickIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  quickTitle: {
    fontSize: FontSize.caption,
    fontWeight: '700',
    color: C.text,
  },

  // ─── クエスト学習バナー ───
  questBanner: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.xl,
    backgroundColor: C.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1.5,
    borderColor: C.primary + '30',
  },
  questBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  questBannerIcon: { fontSize: 28 },
  questBannerTitle: { fontSize: FontSize.subhead, fontWeight: '700', color: C.text },
  questBannerSub: { fontSize: FontSize.caption, color: C.textSecondary, marginTop: 2 },
  questBannerProgress: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  questBannerTrack: { flex: 1, height: 5, backgroundColor: C.borderLight, borderRadius: 3, overflow: 'hidden' },
  questBannerFill: { height: '100%', backgroundColor: C.primary, borderRadius: 3 },
  questBannerPercent: { fontSize: FontSize.caption, fontWeight: '700', color: C.primary },

  // ─── 本試験予測スコア ───
  scoreCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
    backgroundColor: C.card,
    borderRadius: BorderRadius.xl,
    padding: 20,
  },
  scoreHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scoreHeaderTitle: { fontSize: FontSize.subhead, fontWeight: '700', color: C.text },
  scoreTotal: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  scoreTotalNum: { fontSize: FontSize.title1, fontWeight: '900', letterSpacing: LetterSpacing.tight },
  scoreTotalDenom: { fontSize: FontSize.caption, fontWeight: '600', color: C.textSecondary, marginLeft: 2 },
  scoreGrid: { marginTop: 16, gap: 10 },
  scoreRow: { flexDirection: 'row', alignItems: 'center' },
  scoreRowDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  scoreRowLabel: { fontSize: FontSize.caption, fontWeight: '600', color: C.textSecondary, width: 80 },
  scoreRowBar: { flex: 1, marginHorizontal: 8 },
  scoreRowTrack: { height: 6, backgroundColor: C.borderLight, borderRadius: 3, overflow: 'hidden' },
  scoreRowFill: { height: '100%', borderRadius: 3 },
  scoreRowValue: { fontSize: FontSize.footnote, fontWeight: '800', width: 30, textAlign: 'right' },
  scoreRowMax: { fontSize: FontSize.caption2, fontWeight: '500', color: C.textTertiary, width: 20 },

  // ─── Section ───
  sectionTitle: {
    fontSize: FontSize.title3,
    fontWeight: '800',
    color: C.text,
    paddingHorizontal: Spacing.xl,
    marginTop: 28,
    marginBottom: 14,
    letterSpacing: LetterSpacing.tight,
  },

  // ─── [UX改善] カテゴリ別に解く / よく出る論点 ───
  sectionDescSmall: {
    fontSize: FontSize.caption,
    color: C.textSecondary,
    paddingHorizontal: Spacing.xl,
    marginTop: -6,
    marginBottom: 10,
  },
  catChipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: Spacing.xl,
  },
  catChip: {
    width: '48%',
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 2,
    paddingVertical: 16,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  catChipIcon: { fontSize: 24 },
  catChipText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subSectionLabel: {
    fontSize: FontSize.caption,
    fontWeight: '700',
    color: C.textSecondary,
    paddingHorizontal: Spacing.xl,
    marginTop: 18,
    marginBottom: 10,
  },
  topicChipRow: {
    // [Web 互換] flexWrap を確実に動かすため width 制約と alignItems を明示
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: Spacing.xl,
  },
  topicChip: {
    flexShrink: 0,
    backgroundColor: C.primarySurface ?? '#E8F5EC',
    borderWidth: 1.5,
    borderColor: C.primary,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  topicChipText: {
    fontSize: 13,
    color: C.primary,
    fontWeight: '700',
  },

  // ─── 模擬試験カード（クエスト直下） ───
  examCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    backgroundColor: C.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  examCardIcon: { fontSize: 26 },
  examCardTitle: { fontSize: FontSize.subhead, fontWeight: '700', color: C.text },
  examCardSub: { fontSize: FontSize.caption, color: C.textSecondary, marginTop: 2 },
  examCardArrow: { fontSize: 24, color: C.textTertiary, fontWeight: '300' },
  // ─── バナー群 ───
  bannerSection: { paddingHorizontal: Spacing.xl, marginTop: Spacing.xl, gap: 10 },
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: 12,
  },
  bannerGold: { backgroundColor: '#D97706' },
  bannerEmoji: { fontSize: 26 },
  bannerTitle: { fontSize: FontSize.footnote, fontWeight: '700', color: C.white },
  bannerSub: { fontSize: FontSize.caption2, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  bannerArrow: { fontSize: 24, color: C.white, fontWeight: '300' },

  // ─── Category Cards ───
  catWrapper: { marginBottom: 10 },

  // ─── [UX改善] 論点を選んで解く: 全サブカテゴリ chip 一覧 ───
  catBlockWrapper: {
    marginBottom: 18,
    paddingHorizontal: Spacing.xl,
  },
  catBlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderLeftWidth: 4,
    borderRadius: BorderRadius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    gap: 10,
  },
  catBlockIcon: { fontSize: 22 },
  catBlockName: {
    flex: 1,
    fontSize: FontSize.subhead,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  catBlockArrow: {
    fontSize: FontSize.caption,
    fontWeight: '800',
  },
  subChipRow: {
    // [Bugfix] Web (PC) で chip 列の最後の要素が右端で見切れる現象を修正。
    // 原因: 親に明示的な width 制約がないため React Native Web で flexWrap が効かない瞬間がある。
    // 修正: width: '100%' で親と同じ幅を確保 → 折り返しが確実に動く。
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 8,
  },
  subChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
    flexShrink: 0, // 各 chip は縮めず、折り返しで対応 (Web 互換性)
  },
  subChipIcon: { fontSize: 14 },
  subChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  catCard: {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.xl,
    overflow: 'hidden',
  },
  catAccent: { width: 4 },
  catBody: { flex: 1, padding: 16 },
  catTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  catLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  catIcon: { fontSize: 22 },
  catName: { fontSize: FontSize.subhead, fontWeight: '700', color: C.text },
  catDetail: { fontSize: FontSize.caption, color: C.textSecondary, marginTop: 2 },
  catRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catRate: { fontSize: FontSize.title2, fontWeight: '800' },
  catChevron: { fontSize: FontSize.body, color: C.textTertiary },
  catTrack: {
    height: 5,
    backgroundColor: C.borderLight,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 12,
  },
  catFill: { height: '100%', borderRadius: 3 },

  // ─── Subcategory ───
  subList: {
    marginHorizontal: Spacing.xl,
    marginTop: 6,
    backgroundColor: C.card,
    borderRadius: BorderRadius.lg,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 0.5,
    borderBottomColor: C.borderLight,
  },
  subIcon: { fontSize: 16, marginRight: 10, width: 22, textAlign: 'center' },
  subInfo: { flex: 1 },
  subName: { fontSize: FontSize.footnote, fontWeight: '600', color: C.text, marginBottom: 5 },
  subTrack: { height: 4, backgroundColor: C.borderLight, borderRadius: 2, overflow: 'hidden' },
  subFill: { height: '100%', borderRadius: 2 },
  subCount: { fontSize: FontSize.caption2, fontWeight: '500', color: C.textTertiary, marginLeft: 10, width: 32, textAlign: 'right' },
  subPct: { fontSize: FontSize.footnote, fontWeight: '800', width: 38, textAlign: 'right' },
}); }
