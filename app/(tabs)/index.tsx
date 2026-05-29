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
import { Shadow, FontSize, LineHeight, LetterSpacing, Spacing, BorderRadius } from '../../constants/theme';
import { EXAM_TOTAL, PASS_LINE } from '../../constants/exam';
import { useThemeColors, type ThemeColors } from '../../hooks/useThemeColors';
import { useExamPrediction } from '../../hooks/useExamPrediction';
import { usePredictionHistory } from '../../hooks/usePredictionHistory';
import { PredictionCard } from '../../components/PredictionCard';
import { PaywallPromptBanner } from '../../components/PaywallPromptBanner';
import { WeaknessCoachingCard } from '../../components/WeaknessCoachingCard';
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
import { infoAlert } from '../../services/alert';
import {
  getRecommendedQuestionsByCategory,
  getRecommendedQuestionsBySubcategory,
  getRecommendedQuestionsForOther,
} from '../../services/aiAnalysis';
import { StudyHeatmap } from '../../components/StudyHeatmap';
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
import type { Question, QuestionProgress, HabitStack } from '../../types';

/**
 * スマート問題選択: 復習期限切れ → 苦手 → 未解答 → ランダム
 */
function pickSmartQuestion(
  progress: Record<string, QuestionProgress>,
): Question {
  const now = new Date().toISOString();

  // 1. 復習期限切れ（SM-2 overdue、ただし手動マスター済みは除外）
  const dueIds = new Set(
    Object.values(progress)
      .filter((p) => p.attempts > 0 && p.mastered !== true && p.nextReviewAt <= now)
      .map((p) => p.questionId),
  );
  const dueQuestions = ALL_QUESTIONS.filter((q) => dueIds.has(q.id));
  if (dueQuestions.length > 0) {
    return dueQuestions[Math.floor(Math.random() * dueQuestions.length)];
  }

  // 2. 苦手（正答率 < 50%、ただし達成済み(3連正解)・手動マスター済みは除外）
  // [統一] useProgressStore.getWeakQuestions と同じロジックに揃える
  const weakIds = new Set(
    Object.values(progress)
      .filter((p) => {
        if (p.attempts === 0) return false;
        if (p.mastered === true) return false;
        if ((p.correctStreak ?? 0) >= 3) return false;
        return p.correctCount / p.attempts < 0.5;
      })
      .map((p) => p.questionId),
  );
  const weakQuestions = ALL_QUESTIONS.filter((q) => weakIds.has(q.id));
  if (weakQuestions.length > 0) {
    return weakQuestions[Math.floor(Math.random() * weakQuestions.length)];
  }

  // 3. 未解答（手動マスター済みは除外）
  const attemptedOrMasteredIds = new Set(
    Object.values(progress)
      .filter((p) => p.attempts > 0 || p.mastered === true)
      .map((p) => p.questionId),
  );
  const unseenQuestions = ALL_QUESTIONS.filter((q) => !attemptedOrMasteredIds.has(q.id));
  if (unseenQuestions.length > 0) {
    return unseenQuestions[Math.floor(Math.random() * unseenQuestions.length)];
  }

  // 4. 全部解いた → ランダム（手動マスター済みは除外）
  const masteredIds = new Set(
    Object.values(progress).filter((p) => p.mastered === true).map((p) => p.questionId),
  );
  const remaining = ALL_QUESTIONS.filter((q) => !masteredIds.has(q.id));
  const pool = remaining.length > 0 ? remaining : ALL_QUESTIONS;
  return pool[Math.floor(Math.random() * pool.length)];
}

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
  const habitStacks = useSettingsStore((s) => s.settings.habitStacks);
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
  const achievementUnlocked = useAchievementStore((s) => s.unlocked);
  const achievementNewly = useAchievementStore((s) => s.newlyUnlocked);
  const dismissAchievement = useAchievementStore((s) => s.dismissNew);
  const examHistory = useExamStore((s) => s.examHistory);
  const getLatestScore = useExamStore((s) => s.getLatestScore);
  const getBestScore = useExamStore((s) => s.getBestScore);
  const getDailyLog = useProgressStore((s) => s.getDailyLog);
  const getStreakFreezeCount = useProgressStore((s) => s.getStreakFreezeCount);
  const [expandedCat, setExpandedCat] = useState<Category | null>(null);
  const [streakCelebVisible, setStreakCelebVisible] = useState(() => {
    // ストリークマイルストーン到達時に祝福を表示
    const milestones = [3, 5, 7, 10, 14, 21, 30, 50, 100];
    return milestones.includes(stats.streak);
  });

  // 日目標達成祝福
  const [goalCelebVisible, setGoalCelebVisible] = useState(false);
  const markCelebrated = useSessionStore((st) => st.markCelebrated);
  const isCelebrated = useSessionStore((st) => st.isCelebrated);
  const s = useMemo(() => makeStyles(colors), [colors]);
  const dailyLog = useMemo(() => getDailyLog(), [stats]);
  const freezeCount = useMemo(() => getStreakFreezeCount(), [stats]);

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

  // 日目標達成を検知 → 1日1回だけ祝福演出を発火
  useEffect(() => {
    if (dailyGoal > 0 && todayAnsweredRaw >= dailyGoal) {
      const today = new Date().toISOString().slice(0, 10);
      const key = `daily_goal_${today}`;
      if (!isCelebrated(key)) {
        setGoalCelebVisible(true);
        markCelebrated(key);
      }
    }
  }, [dailyGoal, todayAnswered, isCelebrated, markCelebrated]);
  const unlockedCount = useMemo(() => Object.keys(achievementUnlocked).length, [achievementUnlocked]);
  const latestExamScore = useMemo(() => getLatestScore(), [examHistory]);
  const bestExamScore = useMemo(() => getBestScore(), [examHistory]);
  const enabledHabits = useMemo(
    () => (habitStacks ?? []).filter((h) => h.enabled),
    [habitStacks],
  );

  /** スマート問題選択で即スタート */
  const startSmartQuestion = useCallback(() => {
    const q = pickSmartQuestion(progress);
    router.push(`/question/${q.id}`);
  }, [progress, router]);

  // [UX改善 v2] 「達成率」を「真の習得度」に変更:
  //   - 3回連続正解で「習得」とみなす（間違えると0にリセット）
  //   - 単なる totalCorrect では「まぐれ正解」もカウントされてしまう
  //   - 連続3回正解 = 偶然ではなく本当に理解しているという指標
  const masteredCount = useProgressStore((s) => s.getMasteredCount)();
  const rate = useMemo(
    () => TOTAL_Q > 0 ? Math.round((Math.min(masteredCount, TOTAL_Q) / TOTAL_Q) * 100) : 0,
    [masteredCount],
  );
  const progressPct = useMemo(
    () => TOTAL_Q > 0 ? Math.round((Math.min(stats.totalQuestions, TOTAL_Q) / TOTAL_Q) * 100) : 0,
    [stats.totalQuestions],
  );
  const dueCount = useMemo(() => getDueForReview().length, [getDueForReview]);
  const weakCount = useMemo(() => getWeakQuestions().length, [getWeakQuestions]);

  const examPrediction = useExamPrediction();
  const sprintMode = useFinalSprintMode();
  const predictionHistory = usePredictionHistory(
    examPrediction.totalPredicted,
    examPrediction.passProbability,
    examPrediction.hasData,
  );

  // 時間帯に応じた最適アクションのサジェスト
  const hourNow = new Date().getHours();
  const isEvening = hourNow >= 21 || hourNow < 5;

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
        onDismiss={() => setStreakCelebVisible(false)}
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
            {stats.streak > 0 && (
              <StreakPulse streak={stats.streak} style={s.streakBadge}>
                <Text style={s.streakBadgeNum}>{stats.streak}</Text>
                <Text style={s.streakBadgeLabel}>日連続</Text>
                {freezeCount > 0 && <Text style={s.streakFreeze}>🛡️×{freezeCount}</Text>}
              </StreakPulse>
            )}
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

        {/* ── 今日やること: 開いた直後に迷わず押せる最優先アクション ── */}
        <Pressable
          style={[s.mainCTA, Shadow.lg]}
          accessibilityRole="button"
          accessibilityLabel={
            isEvening ? '就寝前復習を始める'
              : dueCount > 0 ? `復習${dueCount}問を解く`
              : weakCount > 3 ? '弱点を克服する'
              : '今日の学習を始める'
          }
          onPress={() => {
            if (isEvening) { router.push('/pre-sleep-review'); }
            else if (dueCount > 0) { router.push('/(tabs)/review'); }
            else if (weakCount > 3) { router.push('/weak-drill'); }
            else { startSmartQuestion(); }
          }}
        >
          <Text style={s.mainCTALabel}>今日やること</Text>
          <View style={s.mainCTAContent}>
            <Text style={s.mainCTAIcon}>
              {isEvening ? '🌙' : dueCount > 0 ? '⏰' : weakCount > 3 ? '💪' : '📝'}
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={s.mainCTATitle}>
                {isEvening ? '就寝前復習を始める'
                  : dueCount > 0 ? `復習${dueCount}問を解く`
                  : weakCount > 3 ? '弱点を克服する'
                  : '今日の学習を始める'}
              </Text>
              <Text style={s.mainCTASub}>
                {isEvening ? '睡眠中の記憶固定を最大化'
                  : dueCount > 0 ? '忘れる前に記憶を定着'
                  : weakCount > 3 ? `${weakCount}問の苦手問題を集中攻撃`
                  : `今日 ${todayAnswered}/${dailyGoal}問完了 — AIが最適な問題を選択`}
              </Text>
            </View>
            <Text style={s.mainCTAArrow}>→</Text>
          </View>
        </Pressable>

        {/* ── 今日の進捗（コンパクトダッシュボード） ── */}
        <View style={[s.dashCard, Shadow.md]}>
          {/* デイリーゴール + ミニ統計 */}
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
            <View style={s.dashStats}>
              <Pressable
                style={s.dashStatItem}
                onPress={() => infoAlert(
                  '達成率について',
                  '「3回連続で正解した問題」の割合です。\n間違えると0からカウントし直しになります。\nまぐれ正解ではなく「本当に理解した問題」を把握できます。',
                )}
              >
                <AnimatedNumber value={rate} style={s.dashStatNum} suffix="%" duration={600} />
                <Text style={s.dashStatLabel}>達成率 ⓘ</Text>
              </Pressable>
              <View style={s.dashStatItem}>
                <AnimatedNumber value={stats.totalQuestions} style={s.dashStatNum} duration={600} />
                <Text style={s.dashStatLabel}>累計解答</Text>
              </View>
              <View style={s.dashStatItem}>
                <AnimatedNumber value={progressPct} style={[s.dashStatNum, { color: colors.primary }]} suffix="%" duration={600} />
                <Text style={s.dashStatLabel}>進捗</Text>
              </View>
            </View>
          </View>
          {/* 進捗バー */}
          <View style={s.dashProgress}>
            <View style={[s.dashProgressFill, { width: `${dailyGoalPct}%` }]} />
          </View>

          {/* [Quick Win D] 合格距離 視覚化バー
              世界基準: Duolingo の「合格までのキロメートル」風。
              ・色: < 30%(赤) / 30-70%(黄) / 70+(緑)
              ・残り問題数を視覚化 → 「あと N問でマスター」 */}
          {(() => {
            const distanceColor = rate >= 70 ? colors.success : rate >= 30 ? '#E8860C' : colors.error;
            const remainingMastery = Math.max(0, TOTAL_Q - Math.round(TOTAL_Q * (rate / 100)));
            return (
              <View style={s.distanceBox}>
                <View style={s.distanceHeader}>
                  <Text style={s.distanceLabel}>🎯 合格までの距離</Text>
                  <Text style={[s.distanceValue, { color: distanceColor }]}>
                    あと {remainingMastery}問 マスター
                  </Text>
                </View>
                <View style={s.distanceTrack}>
                  <View style={[s.distanceFill, { width: `${rate}%`, backgroundColor: distanceColor }]} />
                </View>
                <Text style={s.distanceSub}>
                  {rate >= 70
                    ? '🏆 合格圏内！あと一息で本試験レベル到達'
                    : rate >= 30
                      ? '⚡ 順調に進んでいます。この調子で続けよう'
                      : '🌱 まずは1日5問から。継続が合格への鍵'}
                </Text>
              </View>
            );
          })()}
        </View>

        {/* ── 今日の習慣（習慣スタッキング） ── */}
        {enabledHabits.length > 0 && (
          <View style={s.habitRow}>
            <Text style={s.habitRowTitle}>今日の習慣</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.habitScroll}
            >
              {enabledHabits.map((habit) => (
                <Pressable
                  key={habit.id}
                  style={[s.habitChip, Shadow.sm]}
                  onPress={() => router.push('/(tabs)/quick-quiz')}
                  accessibilityRole="button"
                  accessibilityLabel={`${habit.trigger} ${habit.action}`}
                >
                  <Text style={s.habitChipIcon}>{habit.icon}</Text>
                  <Text style={s.habitChipText} numberOfLines={1}>{habit.trigger}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── クイックアクション（厳選4つ・横スクロール風） ── */}
        <View style={s.quickGrid}>
          <Pressable style={[s.quickCard, Shadow.sm]} onPress={() => router.push('/micro-challenge')} accessibilityRole="button" accessibilityLabel="1分チャレンジを開始">
            <Text style={s.quickIcon}>⚡</Text>
            <Text style={s.quickTitle}>1分</Text>
          </Pressable>
          <Pressable style={[s.quickCard, Shadow.sm]} onPress={startSmartQuestion} accessibilityRole="button" accessibilityLabel="問題を解く">
            <Text style={s.quickIcon}>📝</Text>
            <Text style={s.quickTitle}>問題</Text>
          </Pressable>
          <Pressable style={[s.quickCard, Shadow.sm]} onPress={() => router.push('/(tabs)/quick-quiz')} accessibilityRole="button" accessibilityLabel="一問一答を開始">
            <Text style={s.quickIcon}>⚡</Text>
            <Text style={s.quickTitle}>一問一答</Text>
          </Pressable>
          <Pressable style={[s.quickCard, Shadow.sm]} onPress={() => router.push('/study-timer')} accessibilityRole="button" accessibilityLabel="学習タイマーを開く">
            <Text style={s.quickIcon}>⏱️</Text>
            <Text style={s.quickTitle}>タイマー</Text>
          </Pressable>
        </View>

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

        {/* ── 直近7日間の学習バーチャート ── */}
        {stats.totalQuestions > 0 && (
          <View style={[s.heatmapCard, Shadow.sm]}>
            <StudyHeatmap dailyLog={dailyLog} streak={stats.streak} dailyGoal={dailyGoal} />
          </View>
        )}

        {/* ── 直前モード（試験30日前から自動表示） ── */}
        {sprintMode.isActive && <FinalSprintCard state={sprintMode} />}

        {/* ── ペイウォールプロンプト（スマート訴求） ── */}
        <PaywallPromptBanner />

        {/* ── 予測スコア・合格確率 ── */}
        {examPrediction.hasData && (
          <PredictionCard prediction={examPrediction} history={predictionHistory} />
        )}

        {/* ── 弱点コーチング（予測スコアから最弱科目を推薦） ── */}
        <WeaknessCoachingCard prediction={examPrediction} />

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

        <Text style={s.subSectionLabel}>よく出る論点</Text>
        <View style={s.topicChipRow}>
          {[
            { category: 'kenri' as Category, key: 'tanpo', label: '🔒 抵当権・担保' },
            { category: 'takkengyoho' as Category, key: 'baikai', label: '📋 媒介契約' },
            { category: 'takkengyoho' as Category, key: '35jou', label: '📑 重要事項説明' },
            { category: 'horei_seigen' as Category, key: 'toshi', label: '🗺️ 都市計画法' },
            { category: 'tax_other' as Category, key: 'kotei', label: '🏠 固定資産税' },
            { category: 'tax_other' as Category, key: 'shutoku', label: '🏷️ 不動産取得税' },
          ].map((t) => (
            <Pressable
              key={`${t.category}-${t.key}`}
              style={s.topicChip}
              onPress={async () => {
                const progress = useProgressStore.getState().progress;
                const subcat = SUBCATEGORIES[t.category].find((sc) => sc.key === t.key);
                const matchTags = subcat?.matchTags ?? [];
                const recommended = getRecommendedQuestionsBySubcategory(
                  progress,
                  t.category,
                  matchTags,
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
              accessibilityLabel={`${t.label}の弱点問題を連続で解く`}
            >
              <Text style={s.topicChipText}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* ── その他の学習モード ── */}
        <Text style={s.sectionTitle}>学習モード</Text>
        <View style={s.modeGrid}>
          <Pressable style={[s.modeCard, Shadow.sm]} onPress={() => router.push('/weak-drill')} accessibilityRole="button" accessibilityLabel="弱点ドリルを開始">
            <Text style={s.modeIcon}>💪</Text>
            <Text style={s.modeTitle}>弱点ドリル</Text>
            <Text style={s.modeSub}>苦手を集中攻撃</Text>
          </Pressable>
          <Pressable style={[s.modeCard, Shadow.sm]} onPress={() => router.push('/exam')} accessibilityRole="button" accessibilityLabel="模擬試験を開始">
            <Text style={s.modeIcon}>📋</Text>
            <Text style={s.modeTitle}>模擬試験</Text>
            <Text style={s.modeSub}>本番形式50問</Text>
          </Pressable>
          <Pressable style={[s.modeCard, Shadow.sm]} onPress={() => router.push('/pre-sleep-review')} accessibilityRole="button" accessibilityLabel="就寝前復習を開始">
            <Text style={s.modeIcon}>🌙</Text>
            <Text style={s.modeTitle}>就寝前復習</Text>
            <Text style={s.modeSub}>記憶固定5問</Text>
          </Pressable>
          <Pressable style={[s.modeCard, Shadow.sm]} onPress={() => router.push('/mastered')} accessibilityRole="button" accessibilityLabel="マスター済み問題を表示">
            <Text style={s.modeIcon}>🎓</Text>
            <Text style={s.modeTitle}>マスター済み</Text>
            <Text style={s.modeSub}>復習から除外した問題</Text>
          </Pressable>
        </View>

        {/* ── バナー群（厳選） ── */}
        <View style={s.bannerSection}>
          <Pressable style={[s.bannerCard, s.bannerDarkGreen, Shadow.md]} onPress={() => router.push('/ai-analysis')}>
            <Text style={s.bannerEmoji}>🤖</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.bannerTitle}>AI学習分析</Text>
              <Text style={s.bannerSub}>弱点・おすすめ問題</Text>
            </View>
            <Text style={s.bannerArrow}>›</Text>
          </Pressable>
          {!isPro && (
            <Pressable style={[s.bannerCard, s.bannerGold, Shadow.md]} onPress={() => router.push('/paywall')}>
              <Text style={s.bannerEmoji}>✨</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.bannerTitle}>PREMIUMで合格を目指す</Text>
                <Text style={s.bannerSub}>全{TOTAL_Q}問・模試・AI解説が使い放題</Text>
              </View>
              <Text style={s.bannerArrow}>›</Text>
            </Pressable>
          )}
        </View>

        {/* ── 詳細ダッシュボードへの導線（C1/B4） ── */}
        <View style={s.utilityRow}>
          <Pressable
            style={[s.utilityCard, Shadow.sm]}
            onPress={() => router.push('/heatmap')}
            accessibilityRole="button"
            accessibilityLabel="弱点ヒートマップを開く"
          >
            <Text style={s.utilityIcon}>🗺️</Text>
            <Text style={s.utilityTitle}>弱点ヒートマップ</Text>
            <Text style={s.utilitySub}>サブカテゴリ別の正答率</Text>
          </Pressable>
          <Pressable
            style={[s.utilityCard, Shadow.sm]}
            onPress={() => router.push('/achievements')}
            accessibilityRole="button"
            accessibilityLabel={`実績バッジを開く (${unlockedCount}/${ALL_ACHIEVEMENTS.length}個獲得)`}
          >
            <Text style={s.utilityIcon}>🏆</Text>
            <Text style={s.utilityTitle}>実績バッジ</Text>
            <Text style={s.utilitySub}>{unlockedCount}/{ALL_ACHIEVEMENTS.length} 個獲得</Text>
          </Pressable>
        </View>

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
              {/* リスト表示で全問題を見たい派向け (副導線) */}
              <Pressable
                style={[s.subAllBtn, { borderColor: catColor + '30' }]}
                onPress={() => router.push({ pathname: '/(tabs)/questions', params: { category } } as any)}
              >
                <Text style={[s.subAllText, { color: catColor }]}>
                  {CATEGORY_LABELS[category]}の全問題をリスト表示 ›
                </Text>
              </Pressable>
            </View>
          );
        })}

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
  streakFreeze: {
    fontSize: FontSize.caption2,
    color: 'rgba(200,230,255,0.9)',
    fontWeight: '600',
    marginTop: 4,
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
    gap: 16,
  },
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
  dashStats: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  dashStatItem: {
    alignItems: 'center',
  },
  dashStatNum: {
    fontSize: FontSize.headline,
    fontWeight: '800',
    color: C.text,
  },
  dashStatLabel: {
    fontSize: FontSize.caption2,
    fontWeight: '500',
    color: C.textTertiary,
    marginTop: 2,
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

  // ─── [Quick Win D] 合格距離 視覚化 ───
  distanceBox: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: C.borderLight,
  },
  distanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  distanceLabel: {
    fontSize: FontSize.footnote,
    fontWeight: '700',
    color: C.text,
  },
  distanceValue: {
    fontSize: FontSize.subhead,
    fontWeight: '800',
  },
  distanceTrack: {
    height: 10,
    backgroundColor: C.borderLight,
    borderRadius: 5,
    overflow: 'hidden',
  },
  distanceFill: {
    height: '100%',
    borderRadius: 5,
  },
  distanceSub: {
    fontSize: FontSize.caption2,
    color: C.textSecondary,
    marginTop: 8,
    fontWeight: '600',
  },

  // ─── Habit Row ───
  habitRow: {
    marginTop: Spacing.md,
    paddingLeft: Spacing.xl,
  },
  habitRowTitle: {
    fontSize: FontSize.caption,
    fontWeight: '700',
    color: C.textSecondary,
    marginBottom: 8,
    letterSpacing: LetterSpacing.wide,
  },
  habitScroll: {
    gap: 8,
    paddingRight: Spacing.xl,
  },
  habitChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
  },
  habitChipIcon: {
    fontSize: 16,
  },
  habitChipText: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    color: C.text,
    maxWidth: 120,
  },

  // ─── Main CTA ───
  mainCTA: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
    backgroundColor: C.primary,
    borderRadius: BorderRadius.xl,
    padding: 20,
  },
  mainCTALabel: {
    fontSize: FontSize.caption2,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.72)',
    letterSpacing: LetterSpacing.wide,
    marginBottom: 10,
  },
  mainCTAContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  mainCTAIcon: {
    fontSize: 32,
  },
  mainCTATitle: {
    fontSize: FontSize.callout,
    fontWeight: '800',
    color: C.white,
    letterSpacing: LetterSpacing.tight,
  },
  mainCTASub: {
    fontSize: FontSize.caption,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 3,
  },
  mainCTAArrow: {
    fontSize: 24,
    color: C.white,
    fontWeight: '300',
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

  // ─── Heatmap ───
  heatmapCard: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
    backgroundColor: C.card,
    borderRadius: BorderRadius.xl,
    padding: 16,
  },

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

  // ─── Mode Grid（2列） ───
  modeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: Spacing.xl,
  },
  modeCard: {
    width: '48%',
    backgroundColor: C.card,
    borderRadius: BorderRadius.lg,
    padding: 16,
  },
  modeIcon: {
    fontSize: 26,
    marginBottom: 8,
  },
  modeTitle: {
    fontSize: FontSize.subhead,
    fontWeight: '700',
    color: C.text,
  },
  modeSub: {
    fontSize: FontSize.caption,
    color: C.textSecondary,
    marginTop: 3,
  },
  // C1/B4 ユーティリティカード
  utilityRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  utilityCard: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: BorderRadius.lg,
    padding: 14,
  },
  utilityIcon: { fontSize: 24, marginBottom: 6 },
  utilityTitle: { fontSize: FontSize.subhead, fontWeight: '700', color: C.text },
  utilitySub: { fontSize: FontSize.caption, color: C.textSecondary, marginTop: 2 },

  // ─── バナー群 ───
  bannerSection: { paddingHorizontal: Spacing.xl, marginTop: Spacing.xl, gap: 10 },
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: 12,
  },
  bannerDarkGreen: { backgroundColor: '#145C2E' },
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
  subAllBtn: {
    marginTop: 8,
    marginBottom: 6,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  subAllText: { fontSize: FontSize.footnote, fontWeight: '700' },
}); }
