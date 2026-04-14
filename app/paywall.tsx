import { useState, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  Linking,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Shadow } from '../constants/theme';
import { useThemeColors, ThemeColors } from '../hooks/useThemeColors';
import { useSettingsStore } from '../store/useSettingsStore';
import { ALL_QUESTIONS, ALL_QUICK_QUIZZES } from '../data';

type PlanKey = 'pack6' | 'yearly' | 'monthly';

const TOTAL_Q = ALL_QUESTIONS.length;
const TOTAL_QQ = ALL_QUICK_QUIZZES.length;

const PLANS: { key: PlanKey; name: string; price: number; unit: string; perMonth: number; badge?: string; sub: string }[] = [
  {
    key: 'pack6',
    name: '合格パック',
    price: 3900,
    unit: '/6ヶ月',
    perMonth: 650,
    badge: '人気No.1',
    sub: '試験まで集中！4〜10月に最適',
  },
  {
    key: 'yearly',
    name: '年間プラン',
    price: 5800,
    unit: '/年',
    perMonth: 483,
    badge: '最安',
    sub: 'じっくり学習・再挑戦の方に',
  },
  {
    key: 'monthly',
    name: '月額プラン',
    price: 980,
    unit: '/月',
    perMonth: 980,
    sub: 'まず1ヶ月試したい方に',
  },
];

const FEATURES = [
  `全問題 ${TOTAL_Q}問が解き放題`,
  `一問一答 ${TOTAL_QQ}問が解き放題`,
  '本試験形式の模擬試験 無制限',
  'AI解説チャット 1日100回まで',
  'AI苦手分析・合格予測',
  '2026年法改正完全対応',
  '全デバイスでクラウド同期',
];

// Stripe Checkout APIのベースURL
const API_BASE = 'https://dist-psi-eight-34.vercel.app/api';

export default function PaywallScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const setPlan = useSettingsStore((s) => s.setPlan);
  const startTrial = useSettingsStore((s) => s.startTrial);
  const isTrialActive = useSettingsStore((s) => s.isTrialActive());
  const trialStarted = useSettingsStore((s) => s.subscription.trialStartedAt);
  const [selectedPlan, setSelectedPlan] = useState<PlanKey>('pack6');
  const [loading, setLoading] = useState(false);

  const selected = PLANS.find((p) => p.key === selectedPlan)!;
  const savePercent = Math.round((1 - selected.perMonth / 980) * 100);

  const handlePurchase = async () => {
    setLoading(true);
    try {
      if (Platform.OS === 'web') {
        // Web版: Stripe Checkoutにリダイレクト
        const res = await fetch(`${API_BASE}/create-checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: selectedPlan }),
        });
        const data = await res.json();
        if (data.url) {
          // Stripe決済ページへ遷移
          if (typeof window !== 'undefined') {
            window.location.href = data.url;
          } else {
            Linking.openURL(data.url);
          }
          return;
        }
        throw new Error(data.error || '決済エラー');
      }

      // ネイティブ版: 将来的にRevenueCat or Stripe経由
      // 現在はモック購入
      Alert.alert(
        '購入確認',
        `${selected.name}（¥${selected.price.toLocaleString()}${selected.unit}）で購入しますか？`,
        [
          { text: 'キャンセル', style: 'cancel' },
          {
            text: '購入',
            onPress: () => {
              const expires = new Date();
              if (selectedPlan === 'yearly') expires.setFullYear(expires.getFullYear() + 1);
              else if (selectedPlan === 'pack6') expires.setMonth(expires.getMonth() + 6);
              else expires.setMonth(expires.getMonth() + 1);
              setPlan('standard', expires.toISOString());
              Alert.alert('購入完了！', 'STANDARDプランへようこそ！全機能が使えるようになりました。', [
                { text: 'OK', onPress: () => router.back() },
              ]);
            },
          },
        ],
      );
    } catch (err: any) {
      Alert.alert('エラー', err.message || '購入処理に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen
        options={{
          title: 'STANDARDプラン',
          headerTintColor: colors.primary,
          presentation: 'modal',
        }}
      />
      <ScrollView contentContainerStyle={s.scroll}>
        {/* Hero */}
        <View style={[s.hero, Shadow.lg]}>
          <Text style={s.heroBadge}>STANDARD</Text>
          <Text style={s.heroTitle}>合格への最短ルート</Text>
          <Text style={s.heroSub}>
            {TOTAL_Q}問・模擬試験・AI分析{'\n'}全機能で合格点を突破する
          </Text>
        </View>

        {/* 機能リスト */}
        <View style={[s.featureCard, Shadow.sm]}>
          {FEATURES.map((f) => (
            <View key={f} style={s.featureRow}>
              <Text style={s.checkIcon}>✓</Text>
              <Text style={s.featureText}>{f}</Text>
            </View>
          ))}
        </View>

        {/* 3プラン選択 */}
        <View style={s.planList}>
          {PLANS.map((plan) => {
            const active = selectedPlan === plan.key;
            return (
              <Pressable
                key={plan.key}
                style={[s.planCard, active && s.planCardActive, Shadow.sm]}
                onPress={() => setSelectedPlan(plan.key)}
                accessibilityRole="button"
                accessibilityLabel={`${plan.name} ${plan.price}円${plan.unit}`}
              >
                {plan.badge && (
                  <View style={[s.bestBadge, plan.key === 'yearly' && s.bestBadgeSecondary]}>
                    <Text style={s.bestBadgeText}>{plan.badge}</Text>
                  </View>
                )}
                <View style={s.planHeader}>
                  <View style={[s.radio, active && s.radioActive]}>
                    {active && <View style={s.radioDot} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.planName}>{plan.name}</Text>
                    <Text style={s.planSub}>{plan.sub}</Text>
                  </View>
                  <View style={s.priceBox}>
                    <Text style={s.priceMain}>¥{plan.price.toLocaleString()}</Text>
                    <Text style={s.priceUnit}>{plan.unit}</Text>
                    {plan.key !== 'monthly' && (
                      <Text style={s.pricePerMonth}>月あたり¥{plan.perMonth}</Text>
                    )}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* 無料トライアル */}
        {!trialStarted && !isTrialActive && (
          <Pressable
            style={[s.trialBtn, Shadow.md]}
            accessibilityRole="button"
            accessibilityLabel="7日間無料で試す"
            onPress={() => {
              startTrial();
              Alert.alert(
                '無料トライアル開始！',
                '7日間すべての機能が使えます。\nクレジットカード不要・自動課金なし。',
                [{ text: 'OK', onPress: () => router.back() }],
              );
            }}
          >
            <Text style={s.trialBtnText}>まず7日間 無料で試す</Text>
            <Text style={s.trialBtnSub}>クレジットカード不要・自動課金なし</Text>
          </Pressable>
        )}

        {/* CTA */}
        <Pressable
          style={[s.ctaBtn, Shadow.lg, loading && s.ctaBtnDisabled]}
          onPress={handlePurchase}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel={`${selected.name}で購入`}
        >
          <Text style={s.ctaText}>
            {loading ? '処理中...' : `${selected.name} ¥${selected.price.toLocaleString()}${selected.unit} で始める`}
          </Text>
          {savePercent > 0 && !loading && (
            <Text style={s.ctaSave}>月額より{savePercent}%お得</Text>
          )}
        </Pressable>

        <Text style={s.smallNote}>
          ・購入は次の更新日の24時間前までに解約しない限り自動更新されます{'\n'}
          ・解約はいつでも可能です。解約後は無料プランに戻ります{'\n'}
          ・進捗データは解約後も保持されます
        </Text>

        <View style={s.linksRow}>
          <Pressable onPress={() => router.push('/legal/terms')}>
            <Text style={s.linkText}>利用規約</Text>
          </Pressable>
          <Text style={s.linkSep}>・</Text>
          <Pressable onPress={() => router.push('/legal/privacy')}>
            <Text style={s.linkText}>プライバシー</Text>
          </Pressable>
          <Text style={s.linkSep}>・</Text>
          <Pressable onPress={() => router.push('/legal/tokushoho')}>
            <Text style={s.linkText}>特商法表記</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.background },
    scroll: { padding: 20, paddingBottom: 40 },
    hero: {
      backgroundColor: C.primary,
      borderRadius: 20,
      padding: 24,
      alignItems: 'center',
      marginBottom: 16,
    },
    heroBadge: {
      color: C.primary,
      backgroundColor: C.white,
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 999,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1,
      marginBottom: 12,
      overflow: 'hidden',
    },
    heroTitle: { fontSize: 22, fontWeight: '800', color: C.white, marginBottom: 8 },
    heroSub: {
      fontSize: 13,
      color: 'rgba(255,255,255,0.9)',
      textAlign: 'center',
      lineHeight: 20,
    },
    featureCard: {
      backgroundColor: C.card,
      borderRadius: 16,
      padding: 18,
      marginBottom: 20,
    },
    featureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 7,
    },
    checkIcon: {
      color: C.primary,
      fontSize: 16,
      fontWeight: '800',
      width: 24,
    },
    featureText: { fontSize: 14, color: C.text, flex: 1 },
    planList: { gap: 10, marginBottom: 20 },
    planCard: {
      backgroundColor: C.card,
      borderRadius: 14,
      padding: 16,
      borderWidth: 2,
      borderColor: C.border,
      position: 'relative',
    },
    planCardActive: { borderColor: C.primary, backgroundColor: C.successSurface },
    bestBadge: {
      position: 'absolute',
      top: -10,
      right: 14,
      backgroundColor: C.accent,
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 10,
    },
    bestBadgeSecondary: {
      backgroundColor: C.primary,
    },
    bestBadgeText: { color: C.white, fontSize: 10, fontWeight: '800' },
    planHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    radio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: C.textTertiary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioActive: { borderColor: C.primary },
    radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.primary },
    planName: { fontSize: 16, fontWeight: '800', color: C.text },
    planSub: { fontSize: 11, color: C.textSecondary, marginTop: 2 },
    priceBox: { alignItems: 'flex-end' },
    priceMain: { fontSize: 20, fontWeight: '800', color: C.text },
    priceUnit: { fontSize: 11, color: C.textSecondary },
    pricePerMonth: { fontSize: 10, color: C.primary, fontWeight: '700', marginTop: 2 },
    trialBtn: {
      backgroundColor: C.card,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      marginBottom: 12,
      borderWidth: 2,
      borderColor: C.primary,
    },
    trialBtnText: { fontSize: 17, fontWeight: '800', color: C.primary },
    trialBtnSub: { fontSize: 12, color: C.textSecondary, marginTop: 4 },
    ctaBtn: {
      backgroundColor: C.primary,
      borderRadius: 14,
      paddingVertical: 18,
      alignItems: 'center',
      marginBottom: 16,
    },
    ctaBtnDisabled: { opacity: 0.6 },
    ctaText: { color: C.white, fontSize: 16, fontWeight: '800' },
    ctaSave: { color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 4, fontWeight: '600' },
    smallNote: {
      fontSize: 10,
      color: C.textTertiary,
      lineHeight: 16,
      marginBottom: 16,
    },
    linksRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 4,
    },
    linkText: { fontSize: 12, color: C.primary, fontWeight: '600' },
    linkSep: { color: C.textTertiary },
  });
}
