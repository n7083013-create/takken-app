import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Shadow, FontSize, LineHeight, LetterSpacing, Spacing, BorderRadius } from '../../constants/theme';
import { EXAM_TOTAL, PASS_LINE } from '../../constants/exam';
import { useThemeColors, type ThemeColors } from '../../hooks/useThemeColors';
import { useExamPrediction } from '../../hooks/useExamPrediction';
import { CATEGORY_LABELS, CATEGORY_ICONS, CATEGORY_COLORS, Category, SUBCATEGORIES } from '../../types';
import { ALL_QUESTIONS, getCategoryStats } from '../../data';
import { useProgressStore } from '../../store/useProgressStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useQuestStore } from '../../store/useQuestStore';
import { useAchievementStore, ALL_ACHIEVEMENTS } from '../../store/useAchievementStore';
import { useExamStore } from '../../store/useExamStore';
import { useAuthStore } from '../../store/useAuthStore';
import { StudyHeatmap } from '../../components/StudyHeatmap';
import { StreakCelebration } from '../../components/AnswerFeedback';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { AnnouncementBanner } from '../../components/AnnouncementBanner';
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

  // 1. 復習期限切れ（SM-2 overdue）
  const dueIds = new Set(
    Object.values(progress)
      .filter((p) => p.attempts > 0 && p.nextReviewAt <= now)
      .map((p) => p.questionId),
  );
  const dueQuestions = ALL_QUESTIONS.filter((q) => dueIds.has(q.id));
  if (dueQuestions.length > 0) {
    return dueQuestions[Math.floor(Math.random() * dueQuestions.length)];
  }

  // 2. 苦手（正答率 < 50%）
  const weakIds = new Set(
    Object.values(progress)
      .filter((p) => p.attempts > 0 && p.correctCount / p.attempts < 0.5)
      .map((p) => p.questionId),
  );
  const weakQuestions = ALL_QUESTIONS.filter((q) => weakIds.has(q.id));
  if (weakQuestions.length > 0) {
    return weakQuestions[Math.floor(Math.random() * weakQuestions.length)];
  }

  // 3. 未解答
  const attemptedIds = new Set(
    Object.values(progress)
      .filter((p) => p.attempts > 0)
      .map((p) => p.questionId),
  );
  const unseenQuestions = ALL_QUESTIONS.filter((q) => !attemptedIds.has(q.id));
  if (unseenQuestions.length > 0) {
    return unseenQuestions[Math.floor(Math.random() * unseenQuestions.length)];
  }

  // 4. 全部解いた → ランダム
  return ALL_QUESTIONS[Math.floor(Math.random() * ALL_QUESTIONS.length)];
}

const TOTAL_Q = ALL_QUESTIONS.length;
const CATEGORY_STATS = getCategoryStats('takken');


/** サブカテゴリにマッチするタグがあるか判定 */
function matchSubcat(tags: string[], matchTags: string[]): boolean {
  return tags.some((t) => matchTags.includes(t));
}

/** 認証状態に応じてLP or オンボーディング or ダッシュボードを切り替えるラッパー */
export default function HomeScreenWrapper() {
  const user = useAuthStore((s) => s.user);
  const initialized = useAuthStore((s) => s.initialized);
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  useEffect(() => {
    if (user) {
      AsyncStorage.getItem('@takken_onboarding_done').then((val) => {
        setOnboardingDone(val === 'true');
      });
    }
  }, [user]);

  // ストア初期化完了前はスケルトンを表示
  if (!initialized) {
    return <LoadingSkeleton />;
  }

  if (!user) {
    return <LandingPage />;
  }

  // オンボーディング状態を読み込み中
  if (onboardingDone === null) {
    return <LoadingSkeleton />;
  }

  // 初回起動時: オンボーディングを表示
  if (!onboardingDone) {
    return <Onboarding onComplete={() => setOnboardingDone(true)} />;
  }

  return <HomeScreen />;
}

function HomeScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const stats = useProgressStore((s) => s.stats);
  const progress = useProgressStore((s) => s.progress);
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
  const s = useMemo(() => makeStyles(colors), [colors]);
  const dailyLog = useMemo(() => getDailyLog(), [stats]);
  const freezeCount = useMemo(() => getStreakFreezeCount(), [stats]);

  const todayAnswered = useMemo(() => getTodayAnswered(), [progress, getTodayAnswered]);
  const dailyGoalPct = useMemo(
    () => dailyGoal > 0 ? Math.min(100, Math.round((todayAnswered / dailyGoal) * 100)) : 0,
    [todayAnswered, dailyGoal],
  );
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

  const rate = useMemo(
    () => stats.totalQuestions > 0 ? Math.round((stats.totalCorrect / stats.totalQuestions) * 100) : 0,
    [stats.totalCorrect, stats.totalQuestions],
  );
  const progressPct = useMemo(
    () => TOTAL_Q > 0 ? Math.round((Math.min(stats.totalQuestions, TOTAL_Q) / TOTAL_Q) * 100) : 0,
    [stats.totalQuestions],
  );
  const dueCount = useMemo(() => getDueForReview().length, [getDueForReview]);
  const weakCount = useMemo(() => getWeakQuestions().length, [getWeakQuestions]);

  const examPrediction = useExamPrediction();

  // 時間帯に応じた最適アクションのサジェスト
  const hourNow = new Date().getHours();
  const isEvening = hourNow >= 21 || hourNow < 5;

  return (
    <SafeAreaView style={s.safe}>
      {/* お知らせバナー（ScrollView外で画面上部に固定表示） */}
      <AnnouncementBanner />
      {/* ストリークマイルストーン祝福 */}
      <StreakCelebration
        streak={stats.streak}
        visible={streakCelebVisible}
        onDismiss={() => setStreakCelebVisible(false)}
      />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Hero（コンパクト） ── */}
        <View style={s.hero}>
          <View style={s.heroTop}>
            {examDays !== null ? (
              <View>
                <Text style={s.examCountdownLabel}>試験まであと</Text>
                <View style={s.examCountdownRow}>
                  <Text style={s.examCountdownNum}>{examDays}</Text>
                  <Text style={s.examCountdownUnit}>日</Text>
                </View>
              </View>
            ) : (
              <View>
                <Text style={s.heroTitle}>宅建士 完全対策</Text>
              </View>
            )}
            {stats.streak > 0 && (
              <View style={s.streakBadge}>
                <Text style={s.streakBadgeNum}>{stats.streak}</Text>
                <Text style={s.streakBadgeLabel}>日連続</Text>
                {freezeCount > 0 && <Text style={s.streakFreeze}>🛡️×{freezeCount}</Text>}
              </View>
            )}
          </View>
          {examDays !== null && (
            <Text style={s.heroAppName}>宅建士 完全対策</Text>
          )}
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

        {/* ── 今日の進捗（コンパクトダッシュボード） ── */}
        <View style={[s.dashCard, Shadow.md]}>
          {/* デイリーゴール + ミニ統計 */}
          <View style={s.dashTop}>
            <View style={s.dashGoal}>
              <View style={s.dashGoalRing}>
                <Text style={s.dashGoalNum}>{todayAnswered}</Text>
                <Text style={s.dashGoalDenom}>/{dailyGoal}</Text>
              </View>
              <Text style={s.dashGoalLabel}>
                {dailyGoalPct >= 100 ? '達成！' : '今日の目標'}
              </Text>
            </View>
            <View style={s.dashStats}>
              <View style={s.dashStatItem}>
                <Text style={s.dashStatNum}>{rate}%</Text>
                <Text style={s.dashStatLabel}>正答率</Text>
              </View>
              <View style={s.dashStatItem}>
                <Text style={s.dashStatNum}>{stats.totalQuestions}</Text>
                <Text style={s.dashStatLabel}>累計解答</Text>
              </View>
              <View style={s.dashStatItem}>
                <Text style={[s.dashStatNum, { color: colors.primary }]}>{progressPct}%</Text>
                <Text style={s.dashStatLabel}>進捗</Text>
              </View>
            </View>
          </View>
          {/* 進捗バー */}
          <View style={s.dashProgress}>
            <View style={[s.dashProgressFill, { width: `${dailyGoalPct}%` }]} />
          </View>
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

        {/* ── メインCTA: 状況に応じて最適なアクションを1つ提示 ── */}
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

        {/* ── 学習カレンダーヒートマップ（実績あるとき） ── */}
        {stats.totalQuestions > 0 && (
          <View style={[s.heatmapCard, Shadow.sm]}>
            <StudyHeatmap dailyLog={dailyLog} />
          </View>
        )}

        {/* ── 予測スコア（コンパクト版） ── */}
        {examPrediction.hasData && (
          <View style={[s.scoreCard, Shadow.sm]}>
            <View style={s.scoreHeader}>
              <Text style={s.scoreHeaderTitle}>予測スコア</Text>
              <View style={[
                s.scoreTotal,
                { backgroundColor: examPrediction.totalPredicted >= PASS_LINE ? colors.primarySurface : colors.errorSurface },
              ]}>
                <Text style={[
                  s.scoreTotalNum,
                  { color: examPrediction.totalPredicted >= PASS_LINE ? colors.primary : colors.error },
                ]}>
                  {examPrediction.totalPredicted}
                </Text>
                <Text style={s.scoreTotalDenom}>/{EXAM_TOTAL}</Text>
              </View>
            </View>
            <View style={s.scoreGrid}>
              {examPrediction.perCategory.map((item) => {
                const catColor = CATEGORY_COLORS[item.category];
                return (
                  <View key={item.category} style={s.scoreRow}>
                    <View style={[s.scoreRowDot, { backgroundColor: catColor }]} />
                    <Text style={s.scoreRowLabel} numberOfLines={1}>
                      {CATEGORY_LABELS[item.category]}
                    </Text>
                    <View style={s.scoreRowBar}>
                      <View style={s.scoreRowTrack}>
                        <View style={[s.scoreRowFill, {
                          width: `${(item.predicted / item.allocation) * 100}%`,
                          backgroundColor: catColor,
                        }]} />
                      </View>
                    </View>
                    <Text style={[s.scoreRowValue, { color: catColor }]}>
                      {item.predicted.toFixed(1)}
                    </Text>
                    <Text style={s.scoreRowMax}>/{item.allocation}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

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
          <Pressable style={[s.modeCard, Shadow.sm]} onPress={() => router.push('/achievements')} accessibilityRole="button" accessibilityLabel="実績を表示">
            <Text style={s.modeIcon}>🏅</Text>
            <Text style={s.modeTitle}>実績</Text>
            <Text style={s.modeSub}>{unlockedCount}個獲得</Text>
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

        {/* ── Category Breakdown ── */}
        <Text style={s.sectionTitle}>科目別の分析</Text>
        {CATEGORY_STATS.map(({ category, total }) => {
          const cs = stats.categoryStats[category];
          const catColor = CATEGORY_COLORS[category];
          const pct = total > 0 ? Math.round((cs.correct / total) * 100) : 0;
          const expanded = expandedCat === category;
          const subcats = SUBCATEGORIES[category];

          return (
            <View key={category} style={s.catWrapper}>
              <Pressable
                style={[s.catCard, Shadow.sm]}
                accessibilityRole="button"
                accessibilityLabel={`${CATEGORY_LABELS[category]}の詳細を${expanded ? '閉じる' : '開く'}`}
                onPress={() => setExpandedCat(expanded ? null : category)}
              >
                <View style={[s.catAccent, { backgroundColor: catColor }]} />
                <View style={s.catBody}>
                  <View style={s.catTopRow}>
                    <View style={s.catLeft}>
                      <Text style={s.catIcon}>{CATEGORY_ICONS[category]}</Text>
                      <View>
                        <Text style={s.catName}>{CATEGORY_LABELS[category]}</Text>
                        <Text style={s.catDetail}>{total}問中 {cs.correct}問正解</Text>
                      </View>
                    </View>
                    <View style={s.catRight}>
                      <Text style={[s.catRate, { color: catColor }]}>{pct}%</Text>
                      <Text style={s.catChevron}>{expanded ? '▾' : '▸'}</Text>
                    </View>
                  </View>
                  <View style={s.catTrack}>
                    <View style={[s.catFill, { width: `${pct}%`, backgroundColor: catColor }]} />
                  </View>
                </View>
              </Pressable>

              {expanded && (
                <View style={s.subList}>
                  {subcats.map((sc) => {
                    const scQuestions = ALL_QUESTIONS.filter(
                      (q) => q.category === category && matchSubcat(q.tags, sc.matchTags),
                    );
                    const scTotal = scQuestions.length;
                    if (scTotal === 0) return null;
                    const scCorrect = scQuestions.filter((q) => {
                      const p = progress[q.id];
                      return p && p.correctCount > 0;
                    }).length;
                    const scPct = scTotal > 0 ? Math.round((scCorrect / scTotal) * 100) : 0;

                    return (
                      <Pressable
                        key={sc.key}
                        style={s.subRow}
                        onPress={() =>
                          router.push({ pathname: '/(tabs)/questions', params: { category } })
                        }
                      >
                        <Text style={s.subIcon}>{sc.icon}</Text>
                        <View style={s.subInfo}>
                          <Text style={s.subName}>{sc.label}</Text>
                          <View style={s.subTrack}>
                            <View style={[s.subFill, { width: `${scPct}%`, backgroundColor: catColor }]} />
                          </View>
                        </View>
                        <Text style={s.subCount}>{scCorrect}/{scTotal}</Text>
                        <Text style={[s.subPct, { color: catColor }]}>{scPct}%</Text>
                      </Pressable>
                    );
                  })}
                  <Pressable
                    style={[s.subAllBtn, { borderColor: catColor + '30' }]}
                    onPress={() => router.push({ pathname: '/(tabs)/questions', params: { category } })}
                  >
                    <Text style={[s.subAllText, { color: catColor }]}>
                      {CATEGORY_LABELS[category]}の全問題を見る ›
                    </Text>
                  </Pressable>
                </View>
              )}
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

  // ─── Hero（コンパクト）───
  hero: {
    paddingHorizontal: Spacing.xl,
    paddingTop: 24,
    paddingBottom: 28,
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
    fontSize: 48,
    fontWeight: '900',
    color: C.white,
    letterSpacing: -1,
  },
  examCountdownUnit: {
    fontSize: FontSize.title1,
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
    padding: 18,
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
