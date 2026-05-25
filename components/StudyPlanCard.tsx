// ============================================================
// AI 学習プランカード（ホーム画面用）
// ============================================================
// - 24時間キャッシュから即時表示、ボタンで再生成
// - 今日のおすすめ3件 / 週の重点 / 試験までロードマップ / 激励
// - Web/Native 両対応
// ============================================================

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { FontSize, Spacing, BorderRadius, Shadow, LetterSpacing } from '../constants/theme';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';
import { useAuthStore } from '../store/useAuthStore';
import {
  fetchStudyPlan,
  getCachedStudyPlan,
  type StudyPlan,
  type StudyPlanTask,
} from '../services/studyPlan';

const TYPE_META: Record<
  StudyPlanTask['type'],
  { icon: string; color: string; route: (count: number) => string }
> = {
  weak: { icon: '💪', color: '#DC2626', route: () => '/weak-drill' },
  review: { icon: '⏰', color: '#1A6DC2', route: () => '/(tabs)/review' },
  new: { icon: '📝', color: '#1B7A3D', route: () => '/(tabs)/questions' },
  mock: { icon: '📋', color: '#7B3FA0', route: () => '/exam' },
};

function showError(msg: string) {
  if (Platform.OS === 'web') {
    // RN-Web の Alert は呼び出せない場合があるため安全に
    if (typeof window !== 'undefined') window.alert(msg);
  } else {
    Alert.alert('AI 学習プラン', msg);
  }
}

export function StudyPlanCard() {
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const user = useAuthStore((st) => st.user);
  const session = useAuthStore((st) => st.session);

  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  // 初回マウント時にキャッシュから即時表示
  useEffect(() => {
    let cancelled = false;
    if (!user?.id) return;
    getCachedStudyPlan(user.id).then((cached) => {
      if (!cancelled && cached) setPlan(cached);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const generate = useCallback(
    async (force = false) => {
      if (!session?.access_token) {
        showError('ログインしてからご利用ください。');
        return;
      }
      setLoading(true);
      setHasError(false);
      try {
        const result = await fetchStudyPlan(force);
        setPlan(result.plan);
      } catch (e: any) {
        setHasError(true);
        showError(e?.message || 'AI 学習プランの取得に失敗しました。');
      } finally {
        setLoading(false);
      }
    },
    [session?.access_token],
  );

  const onTaskPress = (task: StudyPlanTask) => {
    const route = TYPE_META[task.type].route(task.questionCount);
    router.push(route as any);
  };

  // 未生成 + 未ロード時の初期 UI
  if (!plan && !loading) {
    return (
      <View style={[s.card, Shadow.md]}>
        <View style={s.headerRow}>
          <Text style={s.headerIcon}>🤖</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>AI 個別学習プラン</Text>
            <Text style={s.headerSub}>あなた専用の合格ロードマップを生成</Text>
          </View>
        </View>
        <Text style={s.emptyText}>
          現在の学習データから AI が今日のおすすめ・週の重点・試験までのロードマップを設計します。
        </Text>
        <Pressable
          style={[s.primaryBtn, { backgroundColor: colors.primary }]}
          onPress={() => generate(false)}
          accessibilityRole="button"
          accessibilityLabel="AI 学習プランを生成"
        >
          <Text style={s.primaryBtnText}>学習プランを生成</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[s.card, Shadow.md]}>
      <View style={s.headerRow}>
        <Text style={s.headerIcon}>🤖</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>AI 個別学習プラン</Text>
          {plan?.generatedAt && (
            <Text style={s.headerSub}>
              生成: {new Date(plan.generatedAt).toLocaleDateString('ja-JP', {
                month: 'numeric',
                day: 'numeric',
              })}
            </Text>
          )}
        </View>
        <Pressable
          style={s.refreshBtn}
          onPress={() => generate(true)}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="プランを再生成"
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={[s.refreshBtnText, { color: colors.primary }]}>↻ 更新</Text>
          )}
        </Pressable>
      </View>

      {loading && !plan && (
        <View style={s.loadingBlock}>
          <ActivityIndicator color={colors.primary} />
          <Text style={s.loadingText}>AI が学習プランを設計中...</Text>
        </View>
      )}

      {plan && (
        <>
          {/* 今日のおすすめ */}
          <Text style={s.sectionLabel}>今日のおすすめ</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.todayRow}
          >
            {plan.today.map((t, i) => {
              const meta = TYPE_META[t.type];
              return (
                <Pressable
                  key={i}
                  style={[s.todayCard, { borderLeftColor: meta.color }]}
                  onPress={() => onTaskPress(t)}
                  accessibilityRole="button"
                  accessibilityLabel={`${t.title}を開始`}
                >
                  <View style={s.todayHeader}>
                    <Text style={s.todayIcon}>{meta.icon}</Text>
                    <Text style={[s.todayCount, { color: meta.color }]}>{t.questionCount}問</Text>
                  </View>
                  <Text style={s.todayTitle} numberOfLines={2}>
                    {t.title}
                  </Text>
                  <Text style={s.todayDesc} numberOfLines={2}>
                    {t.description}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* 週の重点 */}
          {plan.weekFocus?.category && (
            <View style={s.weekBlock}>
              <Text style={s.sectionLabel}>今週の重点テーマ</Text>
              <View style={s.weekRow}>
                <Text style={s.weekIcon}>🎯</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.weekCat}>{plan.weekFocus.category}</Text>
                  <Text style={s.weekReason}>{plan.weekFocus.reason}</Text>
                </View>
              </View>
            </View>
          )}

          {/* ロードマップ */}
          {plan.roadmap && plan.roadmap.length > 0 && (
            <View style={s.roadmapBlock}>
              <Text style={s.sectionLabel}>試験までのマイルストーン</Text>
              {plan.roadmap.map((r, i) => (
                <View key={i} style={s.roadmapRow}>
                  <View style={s.roadmapBadge}>
                    <Text style={s.roadmapBadgeText}>あと{r.daysUntilExam}日</Text>
                  </View>
                  <Text style={s.roadmapGoal}>{r.goal}</Text>
                </View>
              ))}
            </View>
          )}

          {/* 激励メッセージ */}
          {plan.message && (
            <View style={[s.messageBlock, { backgroundColor: colors.primary + '12' }]}>
              <Text style={[s.messageText, { color: colors.primary }]}>{plan.message}</Text>
            </View>
          )}
        </>
      )}

      {hasError && plan && (
        <Text style={s.errorHint}>※ 最新の生成に失敗。前回のプランを表示しています。</Text>
      )}
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    card: {
      marginHorizontal: Spacing.xl,
      marginTop: Spacing.lg,
      backgroundColor: C.card,
      borderRadius: BorderRadius.xl,
      padding: 18,
      borderWidth: 1,
      borderColor: C.borderLight,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    headerIcon: { fontSize: 26 },
    headerTitle: {
      fontSize: FontSize.subhead,
      fontWeight: '800',
      color: C.text,
      letterSpacing: LetterSpacing.tight,
    },
    headerSub: { fontSize: FontSize.caption2, color: C.textTertiary, marginTop: 2 },
    refreshBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: C.borderLight,
      minWidth: 56,
      alignItems: 'center',
    },
    refreshBtnText: { fontSize: FontSize.caption, fontWeight: '700' },
    emptyText: {
      fontSize: FontSize.caption,
      color: C.textSecondary,
      lineHeight: 18,
      marginTop: 12,
      marginBottom: 14,
    },
    primaryBtn: {
      paddingVertical: 12,
      borderRadius: BorderRadius.lg,
      alignItems: 'center',
    },
    primaryBtnText: {
      color: C.white,
      fontSize: FontSize.footnote,
      fontWeight: '800',
    },
    loadingBlock: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 16,
      justifyContent: 'center',
    },
    loadingText: { fontSize: FontSize.caption, color: C.textSecondary },
    sectionLabel: {
      fontSize: FontSize.caption,
      fontWeight: '700',
      color: C.textSecondary,
      letterSpacing: LetterSpacing.wide,
      marginTop: 14,
      marginBottom: 8,
    },
    todayRow: {
      gap: 10,
      paddingRight: 4,
    },
    todayCard: {
      width: 200,
      backgroundColor: C.background,
      borderRadius: BorderRadius.lg,
      padding: 12,
      borderLeftWidth: 4,
    },
    todayHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    todayIcon: { fontSize: 20 },
    todayCount: { fontSize: FontSize.caption, fontWeight: '800' },
    todayTitle: {
      fontSize: FontSize.footnote,
      fontWeight: '700',
      color: C.text,
      marginBottom: 4,
      minHeight: 36,
    },
    todayDesc: {
      fontSize: FontSize.caption2,
      color: C.textSecondary,
      lineHeight: 14,
    },
    weekBlock: { marginTop: 4 },
    weekRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: C.background,
      padding: 12,
      borderRadius: BorderRadius.md,
    },
    weekIcon: { fontSize: 22 },
    weekCat: { fontSize: FontSize.footnote, fontWeight: '700', color: C.text },
    weekReason: {
      fontSize: FontSize.caption,
      color: C.textSecondary,
      marginTop: 2,
      lineHeight: 16,
    },
    roadmapBlock: { marginTop: 4 },
    roadmapRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 8,
      borderBottomWidth: 0.5,
      borderBottomColor: C.borderLight,
    },
    roadmapBadge: {
      backgroundColor: C.primary + '18',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: BorderRadius.full,
      minWidth: 78,
      alignItems: 'center',
    },
    roadmapBadgeText: {
      fontSize: FontSize.caption2,
      fontWeight: '800',
      color: C.primary,
    },
    roadmapGoal: {
      flex: 1,
      fontSize: FontSize.caption,
      color: C.text,
      fontWeight: '500',
    },
    messageBlock: {
      marginTop: 12,
      padding: 12,
      borderRadius: BorderRadius.md,
    },
    messageText: {
      fontSize: FontSize.caption,
      fontWeight: '700',
      lineHeight: 18,
      textAlign: 'center',
    },
    errorHint: {
      marginTop: 8,
      fontSize: FontSize.caption2,
      color: C.textTertiary,
      textAlign: 'center',
    },
  });
}
