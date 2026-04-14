import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Shadow, FontSize, LineHeight, LetterSpacing, Spacing, BorderRadius } from '../../constants/theme';
import { useThemeColors, ThemeColors } from '../../hooks/useThemeColors';
import { CATEGORY_LABELS, CATEGORY_ICONS, CATEGORY_COLORS, Category, AI_QUERY_LIMITS, Question } from '../../types';
import { ALL_QUESTIONS } from '../../data';
import { useMemo } from 'react';
import { useProgressStore } from '../../store/useProgressStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useAchievementStore, ALL_ACHIEVEMENTS } from '../../store/useAchievementStore';
import { useExamStore } from '../../store/useExamStore';
import {
  requestNotificationPermission,
  scheduleDailyReminder,
  cancelDailyReminder,
  sendTestNotification,
} from '../../services/notifications';

const CATEGORIES: Category[] = ['kenri', 'takkengyoho', 'horei_seigen', 'tax_other'];

const EXAM_ALLOCATION: Record<Category, number> = {
  kenri: 14,
  takkengyoho: 20,
  horei_seigen: 8,
  tax_other: 8,
};
const EXAM_TOTAL = 50;
const PASS_LINE = 36;

function SettingsSection() {
  const colors = useThemeColors();
  const sset = useMemo(() => makeSettingsStyles(colors), [colors]);
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const getDueForReview = useProgressStore((s) => s.getDueForReview);

  const themeModes: Array<{ key: 'system' | 'light' | 'dark'; label: string; icon: string }> = [
    { key: 'system', label: '自動', icon: '🌓' },
    { key: 'light', label: 'ライト', icon: '☀️' },
    { key: 'dark', label: 'ダーク', icon: '🌙' },
  ];

  const toggleNotifications = async (next: boolean) => {
    if (next) {
      const ok = await requestNotificationPermission();
      if (!ok) {
        Alert.alert('通知権限', '設定アプリから通知を許可してください');
        return;
      }
      updateSettings({ notificationsEnabled: true });
      await scheduleDailyReminder(settings.notificationTime, getDueForReview().length);
    } else {
      updateSettings({ notificationsEnabled: false });
      await cancelDailyReminder();
    }
  };

  const timeOptions = ['07:00', '12:00', '18:00', '20:00', '22:00'];

  const handleTimeChange = async (t: string) => {
    updateSettings({ notificationTime: t });
    if (settings.notificationsEnabled) {
      await scheduleDailyReminder(t, getDueForReview().length);
    }
  };

  return (
    <View style={sset.box}>
      <Text style={sset.title}>設定</Text>

      <Text style={sset.label}>テーマ</Text>
      <View style={sset.segRow}>
        {themeModes.map((m) => (
          <Pressable
            key={m.key}
            style={[sset.segBtn, settings.themeMode === m.key && sset.segBtnActive]}
            onPress={() => updateSettings({ themeMode: m.key })}
          >
            <Text style={sset.segIcon}>{m.icon}</Text>
            <Text
              style={[sset.segText, settings.themeMode === m.key && sset.segTextActive]}
            >
              {m.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={sset.label}>学習リマインダー通知</Text>
      <View style={sset.toggleRow}>
        <Text style={sset.toggleLabel}>
          {settings.notificationsEnabled ? '有効' : '無効'}
        </Text>
        <Pressable
          style={[
            sset.toggle,
            settings.notificationsEnabled && sset.toggleOn,
          ]}
          onPress={() => toggleNotifications(!settings.notificationsEnabled)}
        >
          <View
            style={[
              sset.toggleKnob,
              settings.notificationsEnabled && sset.toggleKnobOn,
            ]}
          />
        </Pressable>
      </View>

      {settings.notificationsEnabled && (
        <>
          <Text style={sset.label}>通知時刻</Text>
          <View style={sset.timeRow}>
            {timeOptions.map((t) => (
              <Pressable
                key={t}
                style={[
                  sset.timeBtn,
                  settings.notificationTime === t && sset.timeBtnActive,
                ]}
                onPress={() => handleTimeChange(t)}
              >
                <Text
                  style={[
                    sset.timeText,
                    settings.notificationTime === t && sset.timeTextActive,
                  ]}
                >
                  {t}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={sset.testBtn} onPress={() => sendTestNotification()}>
            <Text style={sset.testText}>🔔 テスト通知を送信</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

function makeSettingsStyles(C: ThemeColors) {
  return StyleSheet.create({
    box: {
      marginTop: Spacing.xxl,
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      padding: Spacing.lg,
    },
    title: {
      fontSize: FontSize.caption,
      fontWeight: '700',
      color: C.textTertiary,
      marginBottom: 10,
      letterSpacing: LetterSpacing.wide,
    },
    label: {
      fontSize: FontSize.caption,
      fontWeight: '700',
      color: C.text,
      marginTop: 14,
      marginBottom: 8,
    },
    segRow: { flexDirection: 'row', gap: 8 },
    segBtn: {
      flex: 1,
      backgroundColor: C.background,
      borderRadius: BorderRadius.md,
      paddingVertical: 10,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: C.border,
    },
    segBtnActive: { backgroundColor: C.primary, borderColor: C.primary },
    segIcon: { fontSize: 18 },
    segText: {
      fontSize: FontSize.caption,
      color: C.textSecondary,
      marginTop: 2,
      fontWeight: '600',
    },
    segTextActive: { color: C.white },
    toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    toggleLabel: { fontSize: FontSize.footnote, color: C.textSecondary },
    toggle: {
      width: 50,
      height: 30,
      borderRadius: 15,
      backgroundColor: C.border,
      padding: 2,
    },
    toggleOn: { backgroundColor: C.primary },
    toggleKnob: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: C.white,
      ...Shadow.sm,
    },
    toggleKnobOn: { transform: [{ translateX: 20 }] },
    timeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    timeBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: BorderRadius.sm,
      backgroundColor: C.background,
      borderWidth: 1,
      borderColor: C.border,
    },
    timeBtnActive: { backgroundColor: C.primary, borderColor: C.primary },
    timeText: { fontSize: FontSize.footnote, color: C.textSecondary, fontWeight: '600' },
    timeTextActive: { color: C.white },
    testBtn: {
      marginTop: Spacing.md,
      padding: Spacing.md,
      borderRadius: BorderRadius.md,
      backgroundColor: C.background,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: C.border,
    },
    testText: { fontSize: FontSize.footnote, color: C.primary, fontWeight: '700' },
  });
}

function AccountSection() {
  const colors = useThemeColors();
  const acct = useMemo(() => makeAccountStyles(colors), [colors]);
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const syncWithCloud = useProgressStore((s) => s.syncWithCloud);

  const handleSignOut = () => {
    Alert.alert('ログアウト', 'ログアウトしますか？', [
      { text: 'キャンセル', style: 'cancel' },
      { text: 'ログアウト', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  const handleDelete = () => {
    Alert.alert(
      'アカウント削除',
      '全ての学習データが完全に削除されます。この操作は取り消せません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            const { error } = await deleteAccount();
            if (error) Alert.alert('削除失敗', error);
            else Alert.alert('削除完了', 'アカウントを削除しました');
          },
        },
      ],
    );
  };

  const handleSync = async () => {
    if (!user) return;
    await syncWithCloud(user.id);
    Alert.alert('同期完了', 'クラウドと同期しました');
  };

  return (
    <View style={acct.box}>
      <Text style={acct.title}>アカウント</Text>
      {user ? (
        <>
          <View style={acct.row}>
            <Text style={acct.label}>メール</Text>
            <Text style={acct.value} numberOfLines={1}>{user.email}</Text>
          </View>
          <Pressable style={acct.rowBtn} onPress={handleSync}>
            <Text style={acct.rowBtnText}>☁️ クラウド同期</Text>
          </Pressable>
          <Pressable style={acct.rowBtn} onPress={handleSignOut}>
            <Text style={acct.rowBtnText}>ログアウト</Text>
          </Pressable>
          <Pressable style={[acct.rowBtn, acct.danger]} onPress={handleDelete}>
            <Text style={[acct.rowBtnText, { color: colors.error }]}>アカウント削除</Text>
          </Pressable>
        </>
      ) : (
        <Pressable style={acct.loginBtn} onPress={() => router.push('/auth/login')}>
          <Text style={acct.loginText}>ログイン / 新規登録</Text>
          <Text style={acct.loginSub}>全デバイスで進捗を同期</Text>
        </Pressable>
      )}
    </View>
  );
}

function makeAccountStyles(C: ThemeColors) {
  return StyleSheet.create({
    box: {
      marginTop: Spacing.xxl,
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      padding: Spacing.lg,
    },
    title: {
      fontSize: FontSize.caption,
      fontWeight: '700',
      color: C.textTertiary,
      marginBottom: 10,
      letterSpacing: LetterSpacing.wide,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: C.borderLight,
    },
    label: { fontSize: FontSize.footnote, color: C.textSecondary },
    value: { fontSize: FontSize.footnote, color: C.text, fontWeight: '600', maxWidth: 200 },
    rowBtn: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.borderLight },
    rowBtnText: { fontSize: FontSize.subhead, color: C.text, fontWeight: '600' },
    danger: { borderBottomWidth: 0 },
    loginBtn: {
      backgroundColor: C.primary,
      borderRadius: BorderRadius.md,
      paddingVertical: 14,
      alignItems: 'center',
    },
    loginText: { color: C.white, fontSize: FontSize.subhead, fontWeight: '700' },
    loginSub: { color: 'rgba(255,255,255,0.85)', fontSize: FontSize.caption2, marginTop: 2 },
  });
}

export default function ProgressScreen() {
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const stats = useProgressStore((s) => s.stats);
  const progress = useProgressStore((s) => s.progress);
  const getCategoryAccuracy = useProgressStore((s) => s.getCategoryAccuracy);
  const getBookmarkedQuestions = useProgressStore((s) => s.getBookmarkedQuestions);
  const getWeakQuestions = useProgressStore((s) => s.getWeakQuestions);
  const resetProgress = useProgressStore((s) => s.resetProgress);
  const subscription = useSettingsStore((s) => s.subscription);
  const achievementUnlocked = useAchievementStore((s) => s.unlocked);
  const examHistory = useExamStore((s) => s.examHistory);

  const rate = stats.totalQuestions > 0
    ? Math.round((stats.totalCorrect / stats.totalQuestions) * 100) : 0;
  const bookmarks = getBookmarkedQuestions().length;
  const weak = getWeakQuestions().length;
  const aiLimit = AI_QUERY_LIMITS[subscription.plan];
  const aiUsed = subscription.aiQueriesUsed;

  /** 忘却曲線を考慮した予測（ホーム画面と同じロジック） */
  const examPrediction = useMemo(() => {
    const now = Date.now();
    const perCategory = CATEGORIES.map((cat) => {
      const catQuestions = ALL_QUESTIONS.filter((q: Question) => q.category === cat);
      const allocation = EXAM_ALLOCATION[cat];
      if (catQuestions.length === 0) return { category: cat, allocation, accuracy: 0, predicted: 0, attempted: 0 };

      let retentionSum = 0;
      let attempted = 0;
      for (const q of catQuestions) {
        const prog = progress[q.id];
        if (!prog || prog.attempts === 0) continue;
        attempted++;
        const rawAccuracy = prog.correctCount / prog.attempts;
        const reviewDue = new Date(prog.nextReviewAt).getTime();
        if (now > reviewDue) {
          const overdueDays = (now - reviewDue) / (1000 * 60 * 60 * 24);
          const stability = Math.max(prog.interval, 1);
          const retention = Math.exp(-overdueDays / stability);
          retentionSum += rawAccuracy * retention;
        } else {
          retentionSum += rawAccuracy;
        }
      }
      const accuracy = retentionSum / catQuestions.length;
      const predicted = Math.round(allocation * accuracy * 10) / 10;
      return { category: cat, allocation, accuracy, predicted, attempted };
    });
    const totalPredicted = perCategory.reduce((sum, c) => sum + c.predicted, 0);
    const hasData = stats.totalQuestions > 0;
    return { perCategory, totalPredicted: Math.round(totalPredicted), hasData };
  }, [progress, stats.totalQuestions]);

  const handleReset = () => {
    Alert.alert('学習データのリセット', '全ての学習記録が削除されます。この操作は取り消せません。', [
      { text: 'キャンセル', style: 'cancel' },
      { text: 'リセット', style: 'destructive', onPress: () => resetProgress() },
    ]);
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>学習記録</Text>

        {/* Hero Stats */}
        <View style={[s.heroCard, Shadow.md]}>
          <View style={s.heroRow}>
            <View style={s.heroItem}>
              <Text style={s.heroValue}>{stats.totalQuestions}</Text>
              <Text style={s.heroLabel}>総解答数</Text>
            </View>
            <View style={s.heroDivider} />
            <View style={s.heroItem}>
              <Text style={[s.heroValue, { color: colors.primary }]}>{rate}%</Text>
              <Text style={s.heroLabel}>正答率</Text>
            </View>
            <View style={s.heroDivider} />
            <View style={s.heroItem}>
              <Text style={[s.heroValue, { color: colors.accent }]}>{stats.streak}</Text>
              <Text style={s.heroLabel}>連続日数</Text>
            </View>
          </View>
          {stats.longestStreak > 0 && (
            <View style={s.heroFooter}>
              <Text style={s.heroFooterText}>🏆 最長記録：{stats.longestStreak}日連続</Text>
            </View>
          )}
        </View>

        {/* Quick Metrics */}
        <View style={s.metricRow}>
          <View style={[s.metricCard, Shadow.sm]}>
            <Text style={s.metricIcon}>🔖</Text>
            <Text style={s.metricValue}>{bookmarks}</Text>
            <Text style={s.metricLabel}>ブックマーク</Text>
          </View>
          <View style={[s.metricCard, Shadow.sm]}>
            <Text style={s.metricIcon}>⚠️</Text>
            <Text style={[s.metricValue, weak > 0 ? { color: colors.error } : {}]}>{weak}</Text>
            <Text style={s.metricLabel}>苦手問題</Text>
          </View>
          <View style={[s.metricCard, Shadow.sm]}>
            <Text style={s.metricIcon}>🤖</Text>
            <Text style={s.metricValue}>
              {aiLimit === Infinity ? '∞' : `${aiUsed}/${aiLimit}`}
            </Text>
            <Text style={s.metricLabel}>AI解説</Text>
          </View>
        </View>

        {/* ── 本試験予測スコア（詳細版） ── */}
        <View style={[s.examCard, Shadow.md]}>
          <View style={s.examHeader}>
            <View>
              <Text style={s.examTitle}>本試験 予測スコア</Text>
              <Text style={s.examSub}>正答率から本番の得点を予測</Text>
            </View>
            {examPrediction.hasData ? (
              <View style={[
                s.examBigScore,
                { backgroundColor: examPrediction.totalPredicted >= PASS_LINE ? colors.primarySurface : colors.errorSurface },
              ]}>
                <Text style={[
                  s.examBigNum,
                  { color: examPrediction.totalPredicted >= PASS_LINE ? colors.primary : colors.error },
                ]}>
                  {examPrediction.totalPredicted}
                </Text>
                <Text style={s.examBigDenom}>/{EXAM_TOTAL}</Text>
              </View>
            ) : (
              <Text style={s.examNoData}>--/{EXAM_TOTAL}</Text>
            )}
          </View>

          {examPrediction.hasData && (
            <View style={[
              s.examVerdict,
              { backgroundColor: examPrediction.totalPredicted >= PASS_LINE ? colors.successSurface : colors.errorSurface },
            ]}>
              <Text style={[
                s.examVerdictText,
                { color: examPrediction.totalPredicted >= PASS_LINE ? colors.success : colors.error },
              ]}>
                {examPrediction.totalPredicted >= PASS_LINE
                  ? `合格圏内 — 合格ライン(${PASS_LINE}点)を${examPrediction.totalPredicted - PASS_LINE}点上回っています`
                  : `合格ラインまであと${PASS_LINE - examPrediction.totalPredicted}点 — 苦手科目を重点的に対策しましょう`}
              </Text>
            </View>
          )}

          <View style={s.examGrid}>
            {examPrediction.perCategory.map((item) => {
              const catColor = CATEGORY_COLORS[item.category];
              const pctOfAllocation = item.allocation > 0 ? (item.predicted / item.allocation) * 100 : 0;
              return (
                <View key={item.category} style={s.examRow}>
                  <View style={s.examRowTop}>
                    <View style={s.examRowLeft}>
                      <View style={[s.examDot, { backgroundColor: catColor }]} />
                      <Text style={s.examRowLabel}>{CATEGORY_LABELS[item.category]}</Text>
                    </View>
                    <View style={s.examRowRight}>
                      <Text style={[s.examRowScore, { color: catColor }]}>
                        {examPrediction.hasData ? item.predicted.toFixed(1) : '-'}
                      </Text>
                      <Text style={s.examRowAlloc}>/{item.allocation}問</Text>
                    </View>
                  </View>
                  <View style={s.examRowTrack}>
                    <View style={[s.examRowFill, {
                      width: `${examPrediction.hasData ? pctOfAllocation : 0}%`,
                      backgroundColor: catColor,
                    }]} />
                    <View style={[s.examPassMark, { left: `${(PASS_LINE / EXAM_TOTAL) * 100}%` }]} />
                  </View>
                </View>
              );
            })}
          </View>

          {!examPrediction.hasData && (
            <Text style={s.examHint}>問題を解き始めると予測スコアが表示されます</Text>
          )}
        </View>

        {/* Upgrade Banner */}
        {subscription.plan === 'free' && (
          <Pressable style={s.upgradeBanner} onPress={() => router.push('/paywall')}>
            <View style={s.upgradeLeft}>
              <Text style={s.upgradeIcon}>✨</Text>
              <View>
                <Text style={s.upgradeTitle}>STANDARDプラン</Text>
                <Text style={s.upgradeDesc}>全問題・AI解説が使い放題</Text>
              </View>
            </View>
            <View style={s.upgradeBtn}>
              <Text style={s.upgradeBtnText}>詳細</Text>
            </View>
          </Pressable>
        )}

        {/* Category Analysis */}
        <Text style={s.sectionTitle}>科目別分析</Text>
        {CATEGORIES.map((cat) => {
          const accuracy = getCategoryAccuracy(cat);
          const cs = stats.categoryStats[cat];
          const pct = cs.total > 0 ? Math.round(accuracy * 100) : 0;
          const color = CATEGORY_COLORS[cat];

          return (
            <View key={cat} style={[s.catCard, Shadow.sm]}>
              <View style={s.catHeader}>
                <View style={s.catLeft}>
                  <View style={[s.catIconWrap, { backgroundColor: color + '14' }]}>
                    <Text style={s.catIcon}>{CATEGORY_ICONS[cat]}</Text>
                  </View>
                  <View>
                    <Text style={s.catName}>{CATEGORY_LABELS[cat]}</Text>
                    <Text style={s.catSub}>{cs.total}問解答 / {cs.correct}問正解</Text>
                  </View>
                </View>
                <Text style={[s.catPct, { color }]}>{pct}%</Text>
              </View>
              <View style={s.catTrack}>
                <View style={[s.catFill, { width: `${pct}%`, backgroundColor: color }]} />
              </View>
            </View>
          );
        })}

        {/* ── 模試受験履歴 ── */}
        {examHistory.length > 0 && (
          <>
            <Text style={s.sectionTitle}>模試スコア推移</Text>
            <View style={[s.examHistCard, Shadow.sm]}>
              <View style={s.examHistScores}>
                <View style={s.examHistStat}>
                  <Text style={s.examHistStatLabel}>受験回数</Text>
                  <Text style={s.examHistStatVal}>{examHistory.length}回</Text>
                </View>
                <View style={s.examHistStat}>
                  <Text style={s.examHistStatLabel}>最高点</Text>
                  <Text style={[s.examHistStatVal, { color: colors.primary }]}>
                    {Math.max(...examHistory.map((r) => r.score))}点
                  </Text>
                </View>
                <View style={s.examHistStat}>
                  <Text style={s.examHistStatLabel}>最新</Text>
                  <Text style={s.examHistStatVal}>
                    {examHistory[examHistory.length - 1].score}点
                  </Text>
                </View>
              </View>
              <View style={s.examHistBars}>
                {examHistory.slice(-10).map((r) => (
                  <View key={r.id} style={s.examHistBarCol}>
                    <View style={s.examHistBarTrack}>
                      <View style={[
                        s.examHistBarFill,
                        { height: `${(r.score / 50) * 100}%`, backgroundColor: r.passed ? colors.primary : colors.error },
                      ]} />
                    </View>
                    <Text style={s.examHistBarLabel}>{r.score}</Text>
                    <Text style={s.examHistBarDate}>
                      {new Date(r.date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}

        {/* ── 実績バッジ概要 ── */}
        <Text style={s.sectionTitle}>実績バッジ</Text>
        <Pressable style={[s.achieveCard, Shadow.sm]} onPress={() => router.push('/achievements')}>
          <View style={s.achieveHeader}>
            <Text style={s.achieveTitle}>
              🏅 {Object.keys(achievementUnlocked).length}/{ALL_ACHIEVEMENTS.length} 獲得済み
            </Text>
            <Text style={s.achieveArrow}>›</Text>
          </View>
          <View style={s.achieveTrack}>
            <View style={[
              s.achieveFill,
              { width: `${Math.round((Object.keys(achievementUnlocked).length / ALL_ACHIEVEMENTS.length) * 100)}%` },
            ]} />
          </View>
          {/* 最近獲得したバッジ（最大4個表示） */}
          <View style={s.achieveRecent}>
            {ALL_ACHIEVEMENTS
              .filter((a) => achievementUnlocked[a.id])
              .sort((a, b) => (achievementUnlocked[b.id] || '').localeCompare(achievementUnlocked[a.id] || ''))
              .slice(0, 4)
              .map((a) => (
                <View key={a.id} style={s.achieveBadge}>
                  <Text style={s.achieveBadgeIcon}>{a.icon}</Text>
                  <Text style={s.achieveBadgeText} numberOfLines={1}>{a.title}</Text>
                </View>
              ))}
            {Object.keys(achievementUnlocked).length === 0 && (
              <Text style={s.achieveEmpty}>問題を解いてバッジを獲得しよう</Text>
            )}
          </View>
        </Pressable>

        {/* 設定 */}
        <SettingsSection />

        {/* アカウント */}
        <AccountSection />

        {/* 法的情報 */}
        <View style={s.legalBox}>
          <Text style={s.legalTitle}>アプリ情報</Text>
          <Pressable style={s.legalRow} onPress={() => router.push('/legal/privacy')}>
            <Text style={s.legalRowText}>プライバシーポリシー</Text>
            <Text style={s.legalArrow}>›</Text>
          </Pressable>
          <Pressable style={s.legalRow} onPress={() => router.push('/legal/terms')}>
            <Text style={s.legalRowText}>利用規約</Text>
            <Text style={s.legalArrow}>›</Text>
          </Pressable>
          <Pressable style={s.legalRow} onPress={() => router.push('/legal/tokushoho')}>
            <Text style={s.legalRowText}>特定商取引法に基づく表記</Text>
            <Text style={s.legalArrow}>›</Text>
          </Pressable>
        </View>

        {/* DEV: プラン切り替え */}
        <View style={s.devBox}>
          <Text style={s.devTitle}>開発用プラン切り替え</Text>
          <View style={s.devRow}>
            {(['free', 'standard'] as const).map((plan) => (
              <Pressable
                key={plan}
                style={[
                  s.devBtn,
                  subscription.plan === plan && s.devBtnActive,
                ]}
                onPress={() => {
                  const setPlan = useSettingsStore.getState().setPlan;
                  setPlan(plan, plan === 'standard' ? new Date(Date.now() + 365 * 86400000).toISOString() : undefined);
                }}
              >
                <Text style={[s.devBtnText, subscription.plan === plan && s.devBtnTextActive]}>
                  {plan === 'free' ? 'FREE' : 'STANDARD'}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={s.devNote}>現在: {subscription.plan.toUpperCase()}</Text>
        </View>

        {/* Reset */}
        <Pressable style={s.resetBtn} onPress={handleReset}>
          <Text style={s.resetBtnText}>学習データをリセット</Text>
        </Pressable>

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.background },
    scroll: { padding: Spacing.xl },
    title: {
      fontSize: FontSize.title1,
      fontWeight: '800',
      color: C.text,
      letterSpacing: LetterSpacing.tight,
      marginBottom: Spacing.lg,
    },

    // ─── Hero ───
    heroCard: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.xl,
      padding: Spacing.xxl,
      marginBottom: Spacing.lg,
    },
    heroRow: { flexDirection: 'row', justifyContent: 'space-around' },
    heroItem: { alignItems: 'center' },
    heroValue: {
      fontSize: 28,
      fontWeight: '800',
      color: C.text,
      letterSpacing: LetterSpacing.tight,
    },
    heroLabel: {
      fontSize: FontSize.caption,
      color: C.textSecondary,
      marginTop: 4,
      fontWeight: '500',
      letterSpacing: LetterSpacing.wide,
    },
    heroDivider: { width: 1, backgroundColor: C.borderLight },
    heroFooter: {
      marginTop: 16,
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: C.borderLight,
      alignItems: 'center',
    },
    heroFooterText: {
      fontSize: FontSize.subhead,
      color: C.accent,
      fontWeight: '700',
    },

    // ─── Metrics ───
    metricRow: { flexDirection: 'row', gap: 10, marginBottom: Spacing.lg },
    metricCard: {
      flex: 1,
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      padding: 14,
      alignItems: 'center',
    },
    metricIcon: { fontSize: 22, marginBottom: 6 },
    metricValue: {
      fontSize: FontSize.title3,
      fontWeight: '800',
      color: C.text,
    },
    metricLabel: {
      fontSize: FontSize.caption2,
      color: C.textSecondary,
      marginTop: 3,
      fontWeight: '500',
      letterSpacing: LetterSpacing.wide,
    },

    // ─── 本試験予測 ───
    examCard: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.xl,
      padding: 20,
      marginBottom: Spacing.lg,
    },
    examHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    examTitle: {
      fontSize: FontSize.headline,
      fontWeight: '800',
      color: C.text,
    },
    examSub: {
      fontSize: FontSize.caption,
      color: C.textSecondary,
      marginTop: 2,
    },
    examBigScore: {
      flexDirection: 'row',
      alignItems: 'baseline',
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: BorderRadius.full,
    },
    examBigNum: {
      fontSize: 32,
      fontWeight: '900',
      letterSpacing: LetterSpacing.tight,
    },
    examBigDenom: {
      fontSize: FontSize.footnote,
      fontWeight: '600',
      color: C.textSecondary,
      marginLeft: 2,
    },
    examNoData: {
      fontSize: FontSize.headline,
      fontWeight: '600',
      color: C.textTertiary,
    },
    examVerdict: {
      marginTop: 14,
      padding: 12,
      borderRadius: BorderRadius.md,
    },
    examVerdictText: {
      fontSize: FontSize.caption,
      fontWeight: '700',
      textAlign: 'center',
      lineHeight: LineHeight.caption * 1.3,
    },
    examGrid: {
      marginTop: 18,
      gap: 14,
    },
    examRow: {},
    examRowTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    examRowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    examDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginRight: 8,
    },
    examRowLabel: {
      fontSize: FontSize.footnote,
      fontWeight: '600',
      color: C.text,
    },
    examRowRight: {
      flexDirection: 'row',
      alignItems: 'baseline',
    },
    examRowScore: {
      fontSize: FontSize.headline,
      fontWeight: '800',
    },
    examRowAlloc: {
      fontSize: FontSize.caption,
      fontWeight: '500',
      color: C.textTertiary,
      marginLeft: 2,
    },
    examRowTrack: {
      height: 8,
      backgroundColor: C.borderLight,
      borderRadius: 4,
      overflow: 'hidden',
      position: 'relative' as const,
    },
    examRowFill: {
      height: '100%',
      borderRadius: 4,
    },
    examPassMark: {
      position: 'absolute' as const,
      top: 0,
      bottom: 0,
      width: 2,
      backgroundColor: C.textTertiary,
      opacity: 0.4,
    },
    examHint: {
      fontSize: FontSize.caption,
      color: C.textTertiary,
      textAlign: 'center',
      marginTop: 14,
    },

    // ─── Upgrade ───
    upgradeBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: '#FFFBEB',
      borderRadius: BorderRadius.lg,
      padding: Spacing.lg,
      marginBottom: Spacing.xxl,
      borderWidth: 1,
      borderColor: '#FDE68A',
    },
    upgradeLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    upgradeIcon: { fontSize: 24 },
    upgradeTitle: { fontSize: FontSize.subhead, fontWeight: '700', color: '#92400E' },
    upgradeDesc: { fontSize: FontSize.caption, color: '#B45309', marginTop: 2 },
    upgradeBtn: {
      backgroundColor: '#E8860C',
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: BorderRadius.sm,
    },
    upgradeBtnText: { fontSize: FontSize.footnote, fontWeight: '700', color: C.white },

    // ─── Section ───
    sectionTitle: {
      fontSize: FontSize.title3,
      fontWeight: '800',
      color: C.text,
      marginBottom: Spacing.md,
      letterSpacing: LetterSpacing.tight,
    },

    // ─── Category ───
    catCard: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      padding: Spacing.lg,
      marginBottom: 10,
    },
    catHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    catLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    catIconWrap: {
      width: 40,
      height: 40,
      borderRadius: BorderRadius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    catIcon: { fontSize: 20 },
    catName: { fontSize: FontSize.subhead, fontWeight: '700', color: C.text },
    catSub: { fontSize: FontSize.caption, color: C.textSecondary, marginTop: 2 },
    catPct: { fontSize: FontSize.title2, fontWeight: '800' },
    catTrack: {
      height: 6,
      backgroundColor: C.borderLight,
      borderRadius: 3,
      overflow: 'hidden',
      marginTop: Spacing.md,
    },
    catFill: { height: '100%', borderRadius: 3 },

    // ─── Exam History ───
    examHistCard: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.xl,
      padding: Spacing.lg,
      marginBottom: Spacing.md,
    },
    examHistScores: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginBottom: 14,
    },
    examHistStat: { alignItems: 'center' },
    examHistStatLabel: {
      fontSize: FontSize.caption2,
      color: C.textTertiary,
      fontWeight: '500',
    },
    examHistStatVal: {
      fontSize: FontSize.title3,
      fontWeight: '800',
      color: C.text,
      marginTop: 2,
    },
    examHistBars: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 6,
      height: 80,
    },
    examHistBarCol: {
      flex: 1,
      alignItems: 'center',
    },
    examHistBarTrack: {
      width: '100%',
      height: 60,
      backgroundColor: C.borderLight,
      borderRadius: 3,
      overflow: 'hidden',
      justifyContent: 'flex-end',
    },
    examHistBarFill: {
      width: '100%',
      borderRadius: 3,
    },
    examHistBarLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: C.textSecondary,
      marginTop: 3,
    },
    examHistBarDate: {
      fontSize: 8,
      color: C.textTertiary,
      marginTop: 1,
    },

    // ─── Achievements ───
    achieveCard: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.xl,
      padding: Spacing.lg,
      marginBottom: Spacing.md,
    },
    achieveHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    achieveTitle: {
      fontSize: FontSize.subhead,
      fontWeight: '700',
      color: C.text,
    },
    achieveArrow: {
      fontSize: 22,
      color: C.textTertiary,
      fontWeight: '300',
    },
    achieveTrack: {
      height: 6,
      backgroundColor: C.borderLight,
      borderRadius: 3,
      overflow: 'hidden',
      marginTop: 10,
    },
    achieveFill: {
      height: '100%',
      backgroundColor: '#F59E0B',
      borderRadius: 3,
    },
    achieveRecent: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 12,
    },
    achieveBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.surface,
      borderRadius: BorderRadius.md,
      paddingHorizontal: 10,
      paddingVertical: 6,
      gap: 4,
    },
    achieveBadgeIcon: { fontSize: 16 },
    achieveBadgeText: {
      fontSize: FontSize.caption2,
      fontWeight: '600',
      color: C.textSecondary,
      maxWidth: 80,
    },
    achieveEmpty: {
      fontSize: FontSize.caption,
      color: C.textTertiary,
      fontStyle: 'italic',
    },

    // ─── DEV ───
    devBox: {
      marginTop: Spacing.xxl,
      backgroundColor: '#FFFBEB',
      borderRadius: BorderRadius.lg,
      padding: Spacing.lg,
      borderWidth: 1,
      borderColor: '#FDE68A',
    },
    devTitle: {
      fontSize: FontSize.caption,
      fontWeight: '700',
      color: '#92400E',
      marginBottom: 10,
    },
    devRow: { flexDirection: 'row', gap: 10 },
    devBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: BorderRadius.md,
      borderWidth: 1.5,
      borderColor: C.border,
      alignItems: 'center',
      backgroundColor: C.card,
    },
    devBtnActive: {
      backgroundColor: C.primary,
      borderColor: C.primary,
    },
    devBtnText: {
      fontSize: FontSize.subhead,
      fontWeight: '700',
      color: C.textSecondary,
    },
    devBtnTextActive: { color: C.white },
    devNote: {
      fontSize: FontSize.caption,
      color: '#B45309',
      marginTop: 8,
      textAlign: 'center',
    },

    // ─── Reset ───
    resetBtn: {
      marginTop: Spacing.xxxl,
      paddingVertical: Spacing.lg,
      borderRadius: BorderRadius.lg,
      borderWidth: 1.5,
      borderColor: C.error + '30',
      alignItems: 'center',
      backgroundColor: C.error + '06',
    },
    resetBtnText: { fontSize: FontSize.subhead, fontWeight: '600', color: C.error },

    // ─── Legal ───
    legalBox: {
      marginTop: Spacing.xxl,
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm,
    },
    legalTitle: {
      fontSize: FontSize.caption,
      fontWeight: '700',
      color: C.textTertiary,
      marginTop: 8,
      marginBottom: 4,
      letterSpacing: LetterSpacing.wide,
    },
    legalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 14,
      borderTopWidth: 1,
      borderTopColor: C.borderLight,
    },
    legalRowText: { fontSize: FontSize.subhead, color: C.text },
    legalArrow: { fontSize: 20, color: C.textTertiary },
  });
}
