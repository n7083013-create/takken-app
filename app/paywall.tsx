import { useState, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Shadow } from '../constants/theme';
import { useThemeColors, ThemeColors } from '../hooks/useThemeColors';
import { useSettingsStore } from '../store/useSettingsStore';
import { PLAN_PRICES } from '../types';
import { ALL_QUESTIONS, ALL_QUICK_QUIZZES } from '../data';

type Cycle = 'yearly' | 'monthly';

const TOTAL_Q = ALL_QUESTIONS.length;
const TOTAL_QQ = ALL_QUICK_QUIZZES.length;

const FEATURES = [
  `全問題 ${TOTAL_Q}問が解き放題`,
  `一問一答 ${TOTAL_QQ}問が解き放題`,
  '本試験形式の模擬試験 無制限',
  'AI解説チャット 1日100回まで利用可能',
  'わからない箇所を1問ずつ徹底的に深掘り',
  'AI苦手分析・合格予測',
  '2026年法改正完全対応',
  '全デバイスでクラウド同期',
  '法改正速報の通知',
];

export default function PaywallScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const setPlan = useSettingsStore((s) => s.setPlan);
  const startTrial = useSettingsStore((s) => s.startTrial);
  const isTrialActive = useSettingsStore((s) => s.isTrialActive());
  const trialStarted = useSettingsStore((s) => s.subscription.trialStartedAt);
  const isContinuing = useSettingsStore((s) => s.isContinuingMember());
  const [cycle, setCycle] = useState<Cycle>('yearly');

  const yearlyPrice = isContinuing ? PLAN_PRICES.yearly_renewal : PLAN_PRICES.yearly_first;
  const monthlyEquivalent = Math.round(yearlyPrice / 12);
  const savePercent = Math.round(
    (1 - yearlyPrice / (PLAN_PRICES.monthly * 12)) * 100,
  );

  const handlePurchase = () => {
    // TODO: RevenueCat 連携
    Alert.alert(
      'モック購入',
      `${cycle === 'yearly' ? `年額 ¥${yearlyPrice}` : `月額 ¥${PLAN_PRICES.monthly}`} で購入します。\n\n（実装時はApple/Google決済が起動します）`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '購入',
          onPress: () => {
            const expires = new Date();
            if (cycle === 'yearly') expires.setFullYear(expires.getFullYear() + 1);
            else expires.setMonth(expires.getMonth() + 1);
            setPlan('standard', expires.toISOString());
            Alert.alert('購入完了', 'STANDARDプランへようこそ！', [
              { text: 'OK', onPress: () => router.back() },
            ]);
          },
        },
      ],
    );
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
          <Text style={s.heroTitle}>合格までの最短ルート</Text>
          <Text style={s.heroSub}>
            {TOTAL_Q}問・模擬試験・AI分析{'\n'}全機能で合格点40点を目指す
          </Text>
        </View>

        {/* 継続割引バッジ */}
        {isContinuing && (
          <View style={s.continueBadge}>
            <Text style={s.continueBadgeText}>
              ✨ 継続会員特典: ¥{PLAN_PRICES.yearly_first - PLAN_PRICES.yearly_renewal}引き適用中
            </Text>
          </View>
        )}

        {/* 機能リスト */}
        <View style={[s.featureCard, Shadow.sm]}>
          {FEATURES.map((f) => (
            <View key={f} style={s.featureRow}>
              <Text style={s.checkIcon}>✓</Text>
              <Text style={s.featureText}>{f}</Text>
            </View>
          ))}
        </View>

        {/* プラン選択 */}
        <View style={s.planList}>
          <Pressable
            style={[s.planCard, cycle === 'yearly' && s.planCardActive, Shadow.md]}
            onPress={() => setCycle('yearly')}
          >
            <View style={s.bestBadge}>
              <Text style={s.bestBadgeText}>{savePercent}% お得</Text>
            </View>
            <View style={s.planHeader}>
              <View style={[s.radio, cycle === 'yearly' && s.radioActive]}>
                {cycle === 'yearly' && <View style={s.radioDot} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.planName}>年額プラン</Text>
                <Text style={s.planSub}>月あたり ¥{monthlyEquivalent}</Text>
              </View>
              <View style={s.priceBox}>
                <Text style={s.priceMain}>¥{yearlyPrice.toLocaleString()}</Text>
                <Text style={s.priceUnit}>/年</Text>
              </View>
            </View>
            {!isContinuing && (
              <Text style={s.planNote}>
                ✨ 2年目以降は ¥{PLAN_PRICES.yearly_renewal.toLocaleString()}/年に自動割引
              </Text>
            )}
          </Pressable>

          <Pressable
            style={[s.planCard, cycle === 'monthly' && s.planCardActive, Shadow.sm]}
            onPress={() => setCycle('monthly')}
          >
            <View style={s.planHeader}>
              <View style={[s.radio, cycle === 'monthly' && s.radioActive]}>
                {cycle === 'monthly' && <View style={s.radioDot} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.planName}>月額プラン</Text>
                <Text style={s.planSub}>気軽に試したい方へ</Text>
              </View>
              <View style={s.priceBox}>
                <Text style={s.priceMain}>¥{PLAN_PRICES.monthly}</Text>
                <Text style={s.priceUnit}>/月</Text>
              </View>
            </View>
          </Pressable>
        </View>

        {/* 無料トライアル */}
        {!trialStarted && !isTrialActive && (
          <Pressable
            style={[s.trialBtn, Shadow.md]}
            onPress={() => {
              startTrial();
              Alert.alert(
                '🎁 無料トライアル開始！',
                '7日間すべての機能が使えます。\nトライアル中に有料プランに切り替えるとそのまま継続できます。',
                [{ text: 'OK', onPress: () => router.back() }],
              );
            }}
          >
            <Text style={s.trialBtnText}>まず7日間 無料で試す</Text>
            <Text style={s.trialBtnSub}>クレジットカード不要・自動課金なし</Text>
          </Pressable>
        )}

        {/* CTA */}
        <Pressable style={[s.ctaBtn, Shadow.lg]} onPress={handlePurchase}>
          <Text style={s.ctaText}>
            {cycle === 'yearly'
              ? `年額 ¥${yearlyPrice.toLocaleString()} で始める`
              : `月額 ¥${PLAN_PRICES.monthly} で始める`}
          </Text>
        </Pressable>

        <Text style={s.smallNote}>
          ・購入は次の更新日の24時間前までに解約しない限り自動更新されます{'\n'}
          ・解約はApp Store / Google Playの設定からいつでも可能です{'\n'}
          ・解約後は無料プランに戻り、進捗データは保持されます
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
    },
    heroTitle: { fontSize: 22, fontWeight: '800', color: C.white, marginBottom: 8 },
    heroSub: {
      fontSize: 13,
      color: 'rgba(255,255,255,0.9)',
      textAlign: 'center',
      lineHeight: 20,
    },
    continueBadge: {
      backgroundColor: C.warningSurface,
      borderRadius: 10,
      padding: 12,
      marginBottom: 16,
      alignItems: 'center',
    },
    continueBadgeText: {
      fontSize: 13,
      fontWeight: '800',
      color: C.accentDark,
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
      paddingVertical: 8,
    },
    checkIcon: {
      color: C.primary,
      fontSize: 16,
      fontWeight: '800',
      width: 24,
    },
    featureText: { fontSize: 14, color: C.text, flex: 1 },
    planList: { gap: 12, marginBottom: 20 },
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
    planSub: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
    priceBox: { alignItems: 'flex-end' },
    priceMain: { fontSize: 20, fontWeight: '800', color: C.text },
    priceUnit: { fontSize: 11, color: C.textSecondary },
    planNote: {
      fontSize: 11,
      color: C.accentDark,
      marginTop: 10,
      fontWeight: '700',
    },
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
    ctaText: { color: C.white, fontSize: 16, fontWeight: '800' },
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
