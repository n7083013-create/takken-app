// ============================================================
// 管理者ダッシュボード（ビジネス指標一覧）
// /admin/stats
// ============================================================
// ADMIN_EMAILS に登録された管理者のみアクセス可能
// 登録者数・課金状況・転換率・継続率をリアルタイム表示

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Shadow, FontSize, Spacing, BorderRadius, LetterSpacing } from '../../constants/theme';
import { useThemeColors, type ThemeColors } from '../../hooks/useThemeColors';
import { useAuthStore } from '../../store/useAuthStore';
import { API_BASE_URL } from '../../constants/config';

interface AdminStats {
  ok: boolean;
  generated_at: string;
  users: {
    total: number;
    new_today: number;
    new_week: number;
    new_month: number;
    free: number;
    standard: number;
  };
  trial: {
    in_trial: number;
    ending_today: number;
    ending_week: number;
  };
  revenue: {
    active_paid: number;
    trialing_paid: number;
    canceled: number;
    past_due: number;
    mrr_jpy: number;
    new_paid_this_month: number;
  };
  conversion: {
    signup_to_paid_pct: number;
    trial_to_active_pct: number;
    retention_1m_pct: number;
    retention_3m_pct: number;
  };
  learning: {
    total_questions_answered: number;
    overall_accuracy_pct: number;
  };
}

export default function AdminStatsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const session = useAuthStore((st) => st.session);
  const user = useAuthStore((st) => st.user);

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = useCallback(async () => {
    if (!session?.access_token) {
      setError('ログインが必要です');
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/stats`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'データ取得失敗');
        setStats(null);
      } else {
        setStats(data);
      }
    } catch (e: any) {
      setError(e.message || '通信エラー');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchStats();
  }, [fetchStats]);

  if (!user) {
    return (
      <SafeAreaView style={s.safe}>
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
        <Stack.Screen options={{ title: '管理ダッシュボード' }} />
        <View style={s.loadingBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={s.loadingText}>集計中...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={s.safe}>
        <Stack.Screen options={{ title: '管理ダッシュボード' }} />
        <View style={s.errorBox}>
          <Text style={s.errorText}>{error}</Text>
          <Pressable onPress={fetchStats} style={s.btn}>
            <Text style={s.btnText}>再試行</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!stats) return null;

  const generatedAt = new Date(stats.generated_at);
  const generatedStr = `${generatedAt.getMonth() + 1}/${generatedAt.getDate()} ${String(generatedAt.getHours()).padStart(2, '0')}:${String(generatedAt.getMinutes()).padStart(2, '0')}`;

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen
        options={{
          title: '📊 管理ダッシュボード',
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.text,
        }}
      />
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* ヘッダー */}
        <View style={s.header}>
          <Text style={s.headerTitle}>ビジネス指標</Text>
          <Text style={s.headerSub}>最終更新: {generatedStr}</Text>
        </View>

        {/* MRR ハイライト */}
        <View style={[s.heroCard, Shadow.md]}>
          <Text style={s.heroLabel}>MRR（月間経常収益）</Text>
          <Text style={s.heroValue}>¥{stats.revenue.mrr_jpy.toLocaleString()}</Text>
          <Text style={s.heroSub}>有料会員 {stats.revenue.active_paid}人 × ¥980</Text>
        </View>

        {/* ユーザー */}
        <Section title="👥 ユーザー" colors={colors}>
          <Row label="登録総数" value={stats.users.total.toLocaleString()} highlight />
          <Row label="本日新規" value={`+${stats.users.new_today}`} />
          <Row label="今週新規" value={`+${stats.users.new_week}`} />
          <Row label="今月新規" value={`+${stats.users.new_month}`} />
          <View style={s.divider} />
          <Row label="無料プラン" value={stats.users.free.toString()} />
          <Row label="プレミアム" value={stats.users.standard.toString()} highlightGreen />
        </Section>

        {/* トライアル */}
        <Section title="🎁 トライアル" colors={colors}>
          <Row label="トライアル中" value={`${stats.trial.in_trial}人`} highlightGreen />
          <Row label="本日終了" value={`${stats.trial.ending_today}人`} alert={stats.trial.ending_today > 0} />
          <Row label="今週終了予定" value={`${stats.trial.ending_week}人`} />
        </Section>

        {/* 売上 */}
        <Section title="💰 課金状況" colors={colors}>
          <Row label="アクティブ課金者" value={`${stats.revenue.active_paid}人`} highlightGreen />
          <Row label="トライアル中（課金待ち）" value={`${stats.revenue.trialing_paid}人`} />
          <Row label="解約済み" value={`${stats.revenue.canceled}人`} />
          <Row label="支払い遅延" value={`${stats.revenue.past_due}人`} alert={stats.revenue.past_due > 0} />
          <View style={s.divider} />
          <Row label="今月の新規課金" value={`+${stats.revenue.new_paid_this_month}人`} />
          <Row label="月間経常収益（MRR）" value={`¥${stats.revenue.mrr_jpy.toLocaleString()}`} highlight />
        </Section>

        {/* 転換率 */}
        <Section title="📈 転換率・継続率" colors={colors}>
          <Row label="登録→課金 全体" value={`${stats.conversion.signup_to_paid_pct}%`} />
          <Row label="トライアル→有料 転換率" value={`${stats.conversion.trial_to_active_pct}%`} highlight />
          <View style={s.divider} />
          <Row label="1ヶ月継続率" value={`${stats.conversion.retention_1m_pct}%`} />
          <Row label="3ヶ月継続率" value={`${stats.conversion.retention_3m_pct}%`} />
        </Section>

        {/* 学習統計 */}
        <Section title="📚 学習活動" colors={colors}>
          <Row label="総解答数" value={stats.learning.total_questions_answered.toLocaleString()} />
          <Row label="全体平均正答率" value={`${stats.learning.overall_accuracy_pct}%`} />
        </Section>

        {/* リフレッシュ */}
        <Pressable style={s.refreshBtn} onPress={onRefresh}>
          <Text style={s.refreshBtnText}>🔄 最新データを取得</Text>
        </Pressable>

        <Text style={s.footer}>
          このページは管理者のみアクセス可能です。{'\n'}
          数値はリアルタイム集計のため、表示には数秒かかる場合があります。
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── サブコンポーネント ───

function Section({ title, colors, children }: { title: string; colors: ThemeColors; children: React.ReactNode }) {
  const s = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[s.section, Shadow.sm]}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({
  label,
  value,
  highlight,
  highlightGreen,
  alert,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  highlightGreen?: boolean;
  alert?: boolean;
}) {
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text
        style={[
          s.rowValue,
          highlight && s.rowValueHighlight,
          highlightGreen && { color: colors.primary, fontWeight: '900' },
          alert && { color: colors.error, fontWeight: '900' },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.background },
    scroll: { padding: Spacing.lg, paddingBottom: 40 },

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
    btn: {
      backgroundColor: C.primary,
      paddingHorizontal: 28,
      paddingVertical: 12,
      borderRadius: BorderRadius.full,
    },
    btnText: { color: C.white, fontWeight: '800', fontSize: FontSize.subhead },

    header: {
      marginBottom: Spacing.lg,
    },
    headerTitle: {
      fontSize: FontSize.title2,
      fontWeight: '900',
      color: C.text,
      letterSpacing: LetterSpacing.tight,
    },
    headerSub: {
      fontSize: FontSize.caption,
      color: C.textTertiary,
      marginTop: 4,
    },

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
      fontSize: 48,
      fontWeight: '900',
      color: C.white,
      letterSpacing: -1,
    },
    heroSub: {
      fontSize: FontSize.caption,
      color: 'rgba(255,255,255,0.85)',
      marginTop: 4,
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

    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
    },
    rowLabel: {
      fontSize: FontSize.subhead,
      color: C.textSecondary,
      flex: 1,
    },
    rowValue: {
      fontSize: FontSize.subhead,
      fontWeight: '700',
      color: C.text,
    },
    rowValueHighlight: {
      fontSize: FontSize.headline,
      fontWeight: '900',
      color: C.primary,
    },
    divider: {
      height: 1,
      backgroundColor: C.borderLight,
      marginVertical: 8,
    },

    refreshBtn: {
      backgroundColor: C.card,
      borderWidth: 2,
      borderColor: C.primary,
      borderRadius: BorderRadius.full,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: Spacing.md,
    },
    refreshBtnText: {
      color: C.primary,
      fontWeight: '800',
      fontSize: FontSize.subhead,
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
