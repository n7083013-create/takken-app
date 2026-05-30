import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Shadow, FontSize, Spacing, BorderRadius } from '../constants/theme';
import { useThemeColors, ThemeColors } from '../hooks/useThemeColors';
import { useSettingsStore } from '../store/useSettingsStore';
import { useAuthStore } from '../store/useAuthStore';
import { infoAlert } from '../services/alert';
import { ALL_QUESTIONS, ALL_QUICK_QUIZZES } from '../data';
import { API_BASE_URL } from '../constants/config';
import { trackEvent } from '../services/analytics';
import { purchaseSubscription as iapPurchase, restorePurchases as iapRestore } from '../services/iap';
import { WebBackButton } from '../components/WebBackButton';
import { PLAN_PRICES, type BillingCycle } from '../types';
import {
  planPriceLabel,
  planPriceWithUnit,
  monthlyEquivalentLabel,
  annualSavingsLabel,
  annualBadgeLabel,
  postTrialDescription,
} from '../utils/pricingCopy';

const TOTAL_Q = ALL_QUESTIONS.length;
const TOTAL_QQ = ALL_QUICK_QUIZZES.length;

const FEATURES = [
  { icon: '🎯', text: 'AI合格確率予測' },
  { icon: '💪', text: '弱点AIコーチング' },
  { icon: '🧠', text: '忘却曲線復習（SM-2）' },
  { icon: '📚', text: `全${TOTAL_Q}問が解き放題` },
  { icon: '⚡', text: `一問一答 ${TOTAL_QQ}問が解き放題` },
  { icon: '📝', text: '本試験形式の模擬試験 無制限' },
  { icon: '🤖', text: 'AI解説チャット（音声入力対応）' },
  { icon: '⏰', text: '直前モード自動起動' },
];

const API_BASE = API_BASE_URL;

export default function PaywallScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ status?: string; subscription_id?: string; cycle?: string }>();
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const getDaysUntilExam = useSettingsStore((s) => s.getDaysUntilExam);
  const daysUntilExam = useMemo(() => getDaysUntilExam(), [getDaysUntilExam]);
  const user = useAuthStore((s) => s.user);
  const session = useAuthStore((s) => s.session);
  const isPro = useSettingsStore((s) => s.isPro);
  const verifySubscription = useSettingsStore((s) => s.verifySubscription);

  const [loading, setLoading] = useState(false);
  const [activating, setActivating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  // [2026-05] 課金サイクル選択。
  // - デフォルトは年額 (ARPU を最大化 + 49% OFF で訴求力高い)
  // - LP の月額/年額 CTA から ?cycle=monthly|annual を渡せば、その値で開く
  const initialCycle: BillingCycle = params.cycle === 'monthly' ? 'monthly' : 'annual';
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(initialCycle);

  // 既に有料会員ならホームに戻す
  useEffect(() => {
    if (isPro()) {
      router.replace('/(tabs)');
    }
  }, [isPro]);

  // [Phase 1.3] paywall 表示 = 課金検討開始のシグナル
  // GA4/Ads でファネル「LP → sign_up → view_paywall → subscribe_start → subscribe_complete」が可視化される
  useEffect(() => {
    if (!isPro()) {
      trackEvent('view_paywall', { currency: 'JPY', value: 980 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // PayPal 承認から戻ってきた時の処理
  useEffect(() => {
    const doActivate = async () => {
      if (params.status !== 'activating') return;
      if (!params.subscription_id || !session?.access_token) return;
      if (activating) return;

      setActivating(true);
      try {
        const res = await fetch(`${API_BASE}/paypal/activate-subscription`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ subscriptionId: params.subscription_id }),
        });
        const data = await res.json().catch(() => ({
          error: `サーバー応答エラー (${res.status})`,
        }));
        if (!res.ok) {
          throw new Error(data.error || '有効化に失敗しました');
        }
        await verifySubscription(session.access_token);
        // コンバージョントラッキング: トライアル開始 → 本契約は8日目に自動発生
        trackEvent('trial_start', { currency: 'JPY' });
        trackEvent('subscribe_complete', { value: 980, currency: 'JPY' });
        // 次回課金日を計算（7日後）
        const nextBilling = new Date();
        nextBilling.setDate(nextBilling.getDate() + 7);
        const dateStr = `${nextBilling.getFullYear()}年${nextBilling.getMonth() + 1}月${nextBilling.getDate()}日`;
        await infoAlert(
          '登録完了！',
          `7日間の無料トライアルが開始されました。\n\n次回自動更新日: ${dateStr}\nそれまでに解約すれば料金は発生しません。\n\nすべての機能をお楽しみください！`,
        );
        router.replace('/(tabs)');
      } catch (err: any) {
        await infoAlert('エラー', err.message || '有効化に失敗しました。サポートまでお問い合わせください。');
      } finally {
        setActivating(false);
      }
    };
    doActivate();
  }, [params.status, params.subscription_id, session?.access_token]);

  /**
   * 購入フロー開始
   * - Web: PayPal の承認ページに遷移
   * - Native (Android/iOS): Google Play Billing / Apple IAP のシート起動
   */
  const handleStartTrial = useCallback(async () => {
    if (!user) {
      router.push('/auth/login?returnTo=/paywall');
      return;
    }
    if (!session?.access_token) {
      await infoAlert('ログインが必要です', '先にログインしてください');
      return;
    }

    setLoading(true);
    // [2026-05] 課金サイクルを value に反映。年額の方が conversion value 高い
    trackEvent('subscribe_start', {
      value: PLAN_PRICES[billingCycle],
      currency: 'JPY',
      custom_label: billingCycle,
    });

    // ─── Native: Google Play Billing / Apple IAP ───
    // Google Play 規約上、Android アプリ内で Web 課金（PayPal）は使えない
    if (Platform.OS !== 'web') {
      try {
        await iapPurchase(billingCycle);
        // 実際のレシート検証 → profile 更新は purchaseUpdatedListener 経由で非同期実行
        // ここでは「最大15秒間 1秒おきに verify をポーリング」して isPro 化を確認
        // setTimeout 固定 2.5秒だとリスナー処理が遅延した時に見逃す（H2 race condition 対策）
        const POLL_INTERVAL_MS = 1000;
        const POLL_MAX_TRIES = 15;
        let succeeded = false;
        for (let i = 0; i < POLL_MAX_TRIES; i++) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          try {
            await verifySubscription(session.access_token);
          } catch {
            // 検証エラーは続行（次のループで再試行）
          }
          if (useSettingsStore.getState().isPro()) {
            succeeded = true;
            break;
          }
        }
        if (succeeded) {
          trackEvent('trial_start', { currency: 'JPY' });
          // subscribe_complete はトライアル後の本契約成立時に RTDN 経由で発火
          await infoAlert('登録完了！', '7日間の無料トライアルが開始されました。');
          router.replace('/(tabs)');
        } else {
          // 15秒経っても Pro 化しない場合: 復元 or 問い合わせ案内
          await infoAlert(
            '購入確認中',
            '購入処理中です。数分後に「記録」タブの「購入を復元」を押すか、ご不明な場合はサポートまでご連絡ください。',
          );
        }
        setLoading(false);
      } catch (e: any) {
        // ユーザーキャンセルはエラー扱いしない（旧/新両対応）
        const code = String(e?.code || '').toLowerCase();
        const isUserCancel =
          code === 'user-cancelled' ||
          code === 'usercancelled' ||
          code === 'e_user_cancelled' ||
          code === 'user_cancelled';
        if (!isUserCancel) {
          await infoAlert('購入エラー', e?.message || '購入処理に失敗しました');
        }
        setLoading(false);
      }
      return;
    }

    // ─── Web: PayPal ───
    try {
      const res = await fetch(`${API_BASE}/paypal/create-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ billingCycle }),
      });
      const data = await res.json().catch(() => ({
        error: `サーバー応答エラー (${res.status})`,
      }));
      if (!res.ok) {
        if (data.code === 'email_not_confirmed') {
          await infoAlert(
            'メール確認が必要です',
            '登録メールアドレスに確認リンクを送信しました。リンクをクリックしてから再度お試しください。',
          );
        } else {
          // [2026-05-22] detail を含めて表示 (診断容易化)。PayPal API のエラーが
          // ここに来るので「決済できない原因」をユーザー/サポートに見せられる。
          const msg = data.error || 'サブスクリプション作成に失敗しました';
          const parts: string[] = [msg];
          if (data.paypalError) parts.push(`PayPal: ${data.paypalError}`);
          if (data.paypalDetails) parts.push(data.paypalDetails);
          if (data.detail && !data.paypalError) parts.push(String(data.detail).substring(0, 200));
          if (data.diagPlanId) parts.push(`(plan=${data.diagPlanId} cycle=${data.diagCycle})`);
          await infoAlert('エラー', parts.join('\n'));
        }
        setLoading(false);
        return;
      }

      // [2026-05-22] 既存サブスクが ACTIVE で resume された場合: approvalUrl なし。
      // 静かに失敗してボタンが押せないままになるのを防ぐ。
      if (data.alreadyActive) {
        await verifySubscription(session.access_token);
        await infoAlert('登録済みです', '既に有効なサブスクリプションが見つかりました。');
        router.replace('/(tabs)');
        return;
      }

      if (!data.approvalUrl) {
        await infoAlert('エラー', '承認URLを取得できませんでした。再度お試しください。');
        setLoading(false);
        return;
      }

      // 同じタブで開く（戻ってきた時に activate-subscription が動く）
      window.location.href = data.approvalUrl;
    } catch (err: any) {
      await infoAlert('通信エラー', err.message || 'ネットワーク接続を確認してください');
      setLoading(false);
    }
    // [2026-05-22] billingCycle を依存配列に追加 (stale closure バグ修正)
    // タブ切替で setBillingCycle しても useCallback の memo が古い値を保持し、
    // 月額選択で API に 'annual' が送られて年額サブスクが作成される問題があった。
  }, [user, session, router, verifySubscription, billingCycle]);

  const handleRestore = useCallback(async () => {
    if (!session?.access_token) {
      infoAlert('ログインが必要です', '購入を復元するにはログインしてください。');
      return;
    }
    setRestoring(true);
    try {
      // Native: ストア側の購入履歴を再検証（Google Play / Apple IAP）
      if (Platform.OS !== 'web') {
        await iapRestore();
        // server で profile が更新されているはず
      }
      await verifySubscription(session.access_token);
      const nowPro = useSettingsStore.getState().isPro();
      if (nowPro) {
        await infoAlert('復元完了', 'サブスクリプションが復元されました。');
        router.replace('/(tabs)');
      } else {
        await infoAlert('復元結果', '有効なサブスクリプションが見つかりませんでした。');
      }
    } catch {
      await infoAlert('エラー', '復元に失敗しました。通信環境を確認して再度お試しください。');
    } finally {
      setRestoring(false);
    }
  }, [session, router, verifySubscription]);

  const heroSub = daysUntilExam !== null && daysUntilExam > 0
    ? `試験まであと${daysUntilExam}日 — 今すぐ始めよう`
    : '合格を目指して、今日から始めよう';

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen
        options={{
          title: '',
          headerTintColor: colors.primary,
          presentation: 'modal',
          headerTransparent: true,
        }}
      />
      <WebBackButton />
      <ScrollView contentContainerStyle={s.scroll}>
        {/* PayPal 承認戻り時のローディング */}
        {activating && (
          <View style={s.activatingBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={s.activatingText}>有効化中...</Text>
          </View>
        )}

        {/* Hero */}
        <View style={[s.hero, Shadow.lg]}>
          <Text style={s.heroBadge}>PREMIUM</Text>
          <Text style={s.heroTitle}>あなた専用の合格プラン</Text>
          <Text style={s.heroSub}>{heroSub}</Text>
        </View>

        {/* 機能リスト */}
        <View style={[s.featureCard, Shadow.sm]}>
          <Text style={s.featureTitle}>すべての機能が使い放題</Text>
          {FEATURES.map((f) => (
            <View key={f.text} style={s.featureRow}>
              <Text style={s.featureIcon}>{f.icon}</Text>
              <Text style={s.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>

        {/* [2026-05] 月額 / 年額トグル + 価格セクション
            年額デフォルト・49% OFF 訴求・月換算併記で price anchoring */}
        <View style={[s.priceCard, Shadow.md]}>
          <View style={s.trialBadge}>
            <Text style={s.trialBadgeText}>7日間無料</Text>
          </View>
          <Text style={s.priceExplain}>まず無料で全機能をお試し</Text>

          {/* ── 月額 / 年額 トグル ── */}
          <View style={s.cycleToggleWrap}>
            <Pressable
              style={[s.cycleTab, billingCycle === 'annual' && s.cycleTabActive]}
              onPress={() => setBillingCycle('annual')}
              accessibilityRole="radio"
              accessibilityState={{ selected: billingCycle === 'annual' }}
              accessibilityLabel="年額プラン"
            >
              <View style={s.annualBadge}>
                <Text style={s.annualBadgeText}>{annualBadgeLabel()}</Text>
              </View>
              <Text style={[s.cycleTabTitle, billingCycle === 'annual' && s.cycleTabTitleActive]}>
                年額
              </Text>
              <Text style={[s.cycleTabPrice, billingCycle === 'annual' && s.cycleTabPriceActive]}>
                {planPriceLabel('annual')}
              </Text>
              <Text style={s.cycleTabSub}>
                {monthlyEquivalentLabel('annual')}
              </Text>
            </Pressable>
            <Pressable
              style={[s.cycleTab, billingCycle === 'monthly' && s.cycleTabActive]}
              onPress={() => setBillingCycle('monthly')}
              accessibilityRole="radio"
              accessibilityState={{ selected: billingCycle === 'monthly' }}
              accessibilityLabel="月額プラン"
            >
              <Text style={[s.cycleTabTitle, billingCycle === 'monthly' && s.cycleTabTitleActive]}>
                月額
              </Text>
              <Text style={[s.cycleTabPrice, billingCycle === 'monthly' && s.cycleTabPriceActive]}>
                {planPriceLabel('monthly')}
              </Text>
              <Text style={s.cycleTabSub}>/月</Text>
            </Pressable>
          </View>

          {/* ── 価格表示 ── */}
          <View style={s.priceRow}>
            <Text style={s.priceAmount}>¥0</Text>
            <Text style={s.priceSlash}> → </Text>
            <Text style={s.priceAfter}>{planPriceWithUnit(billingCycle)}</Text>
          </View>
          <Text style={s.priceDetail}>{postTrialDescription(billingCycle)}</Text>

          {/* 年額選択時の savings 強調 */}
          {billingCycle === 'annual' && (
            <Text style={s.savingsCallout}>
              {annualSavingsLabel()} ・ 月額プランより年 ¥{(PLAN_PRICES.monthly * 12 - PLAN_PRICES.annual).toLocaleString('en-US')} お得
            </Text>
          )}

          <Text style={s.priceSafe}>トライアル中にキャンセルすれば一切料金はかかりません</Text>
        </View>

        {/* 決済ボタン — Web は PayPal、Native は Google Play / App Store
            ⚠️ Play Store 規約上、Android アプリ内で "PayPal" 等の代替決済への誘導は禁止 */}
        <Pressable
          style={[s.ctaBtn, Shadow.lg, loading && s.ctaBtnDisabled]}
          onPress={handleStartTrial}
          disabled={loading || activating}
          accessibilityRole="button"
          accessibilityLabel="7日間無料トライアルを開始"
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View style={s.ctaRow}>
              <Text style={s.ctaText}>7日間 無料で始める</Text>
            </View>
          )}
        </Pressable>

        <Text style={s.ctaSub}>
          {Platform.OS === 'web'
            ? '✓ PayPalアカウント不要（カード直接入力OK）\n✓ Visa / Mastercard / JCB / American Express 対応 ・ いつでも解約OK'
            : Platform.OS === 'ios'
              ? '✓ App Store の安全な決済 ・ いつでも解約OK\n✓ Apple ID に登録した支払い方法を利用'
              : '✓ Google Play の安全な決済 ・ いつでも解約OK\n✓ Google アカウントの支払い方法を利用'}
        </Text>

        {/* 安心ポイント */}
        <View style={s.trustRow}>
          <View style={s.trustItem}>
            <Text style={s.trustIcon}>🔒</Text>
            <Text style={s.trustText}>
              {Platform.OS === 'web'
                ? 'PayPal 安全決済'
                : Platform.OS === 'ios'
                  ? 'App Store 安全決済'
                  : 'Google Play 安全決済'}
            </Text>
          </View>
          <View style={s.trustItem}>
            <Text style={s.trustIcon}>✋</Text>
            <Text style={s.trustText}>ワンタップ解約</Text>
          </View>
          <View style={s.trustItem}>
            <Text style={s.trustIcon}>🎁</Text>
            <Text style={s.trustText}>7日間無料</Text>
          </View>
        </View>

        <Text style={s.smallNote}>
          {billingCycle === 'annual'
            ? `・7日間の無料トライアル後、年額${planPriceLabel('annual')} (${monthlyEquivalentLabel('annual')}) で自動更新されます\n`
            : `・7日間の無料トライアル後、月額${planPriceLabel('monthly')}で自動更新されます\n`}
          ・更新日の24時間前までにいつでも解約できます{'\n'}
          ・解約後は無料プランに戻ります
        </Text>

        <View style={s.linksRow}>
          <Pressable onPress={() => router.push('/legal/terms')}>
            <Text style={s.linkText}>利用規約</Text>
          </Pressable>
          <Text style={s.linkDot}>・</Text>
          <Pressable onPress={() => router.push('/legal/privacy')}>
            <Text style={s.linkText}>プライバシーポリシー</Text>
          </Pressable>
        </View>

        <Pressable onPress={handleRestore} disabled={restoring} style={s.restoreBtn}>
          {restoring ? (
            <ActivityIndicator size="small" color={colors.textSecondary} />
          ) : (
            <Text style={s.restoreText}>購入を復元</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.background },
    scroll: { padding: 20, paddingTop: 60, paddingBottom: 40 },

    activatingBox: {
      alignItems: 'center',
      paddingVertical: 20,
      marginBottom: 16,
      backgroundColor: C.card,
      borderRadius: 12,
    },
    activatingText: { marginTop: 12, color: C.text, fontWeight: '700' },

    hero: {
      backgroundColor: C.primary,
      borderRadius: 20,
      padding: 32,
      alignItems: 'center',
      marginBottom: 20,
      // @ts-ignore
      background: `linear-gradient(135deg, ${C.primary} 0%, ${C.primaryDark} 100%)`,
      overflow: 'hidden',
    },
    heroBadge: {
      color: C.white,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 3,
      backgroundColor: 'rgba(255,255,255,0.2)',
      paddingHorizontal: 14,
      paddingVertical: 4,
      borderRadius: 999,
      marginBottom: 12,
    },
    heroTitle: {
      color: C.white,
      fontSize: 28,
      fontWeight: '900',
      textAlign: 'center',
      marginBottom: 8,
    },
    heroSub: {
      color: C.white,
      fontSize: 15,
      opacity: 0.9,
      textAlign: 'center',
    },

    featureCard: {
      backgroundColor: C.card,
      borderRadius: 14,
      padding: 20,
      marginBottom: 20,
    },
    featureTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: C.text,
      marginBottom: 14,
    },
    featureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
    },
    featureIcon: { fontSize: 20, marginRight: 12 },
    featureText: { fontSize: 15, color: C.text, flex: 1 },

    priceCard: {
      backgroundColor: C.card,
      borderRadius: 18,
      padding: 28,
      alignItems: 'center',
      marginBottom: 20,
      borderWidth: 2,
      borderColor: C.primary,
      // @ts-ignore
      boxShadow: '0 8px 24px rgba(27,122,61,0.12)',
    },
    trialBadge: {
      backgroundColor: C.accent,
      paddingHorizontal: 14,
      paddingVertical: 4,
      borderRadius: 999,
      marginBottom: 12,
    },
    trialBadgeText: { color: C.white, fontWeight: '800', fontSize: 12 },
    priceExplain: { color: C.textSecondary, fontSize: 14, marginBottom: 10 },
    priceRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 6 },
    priceAmount: { fontSize: 42, fontWeight: '900', color: C.primary },
    priceSlash: { fontSize: 20, color: C.textTertiary, marginHorizontal: 8 },
    priceAfter: { fontSize: 20, fontWeight: '700', color: C.text },
    priceDetail: { fontSize: 13, color: C.textSecondary, marginTop: 4 },
    priceSafe: { fontSize: 11, color: C.primary, marginTop: 10, textAlign: 'center' },

    // [2026-05] 月額 / 年額トグル (年額デフォルト・49% OFF 訴求)
    cycleToggleWrap: {
      flexDirection: 'row',
      gap: 12,
      alignSelf: 'stretch',
      marginBottom: 18,
      marginTop: 4,
    },
    cycleTab: {
      flex: 1,
      borderWidth: 2,
      borderColor: C.border,
      borderRadius: BorderRadius.lg,
      paddingVertical: 16,
      paddingHorizontal: 12,
      alignItems: 'center',
      backgroundColor: C.background,
      position: 'relative',
    },
    cycleTabActive: {
      borderColor: C.primary,
      backgroundColor: C.primarySurface,
    },
    cycleTabTitle: {
      fontSize: FontSize.footnote,
      fontWeight: '700',
      color: C.textSecondary,
      marginBottom: 4,
    },
    cycleTabTitleActive: { color: C.primary },
    cycleTabPrice: {
      fontSize: FontSize.title3,
      fontWeight: '900',
      color: C.text,
      marginBottom: 2,
    },
    cycleTabPriceActive: { color: C.primary },
    cycleTabSub: {
      fontSize: FontSize.caption,
      color: C.textTertiary,
    },
    annualBadge: {
      position: 'absolute',
      top: -10,
      backgroundColor: C.accent ?? C.primary,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
    },
    annualBadgeText: {
      color: C.white,
      fontSize: 10,
      fontWeight: '800',
    },
    savingsCallout: {
      fontSize: FontSize.caption,
      fontWeight: '700',
      color: C.accent ?? C.primary,
      marginTop: 8,
      textAlign: 'center',
    },

    ctaBtn: {
      backgroundColor: C.primary,
      borderRadius: 999,
      paddingVertical: 20,
      alignItems: 'center',
      marginBottom: 10,
      // @ts-ignore
      background: `linear-gradient(135deg, ${C.primary} 0%, ${C.primaryDark} 100%)`,
      // @ts-ignore
      boxShadow: '0 6px 16px rgba(27,122,61,0.35)',
      // @ts-ignore
      transition: 'transform 0.15s ease',
      // @ts-ignore
      cursor: 'pointer',
    },
    ctaBtnDisabled: { opacity: 0.6 },
    ctaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    ctaText: { color: C.white, fontSize: 17, fontWeight: '900', letterSpacing: 0.5 },
    ctaSub: {
      textAlign: 'center',
      color: C.textSecondary,
      fontSize: 12,
      marginBottom: 20,
    },

    trustRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginVertical: 20,
    },
    trustItem: { alignItems: 'center' },
    trustIcon: { fontSize: 22, marginBottom: 4 },
    trustText: { fontSize: 11, color: C.textSecondary, fontWeight: '600' },

    smallNote: {
      fontSize: 11,
      color: C.textTertiary,
      lineHeight: 17,
      marginTop: 14,
      marginBottom: 10,
    },

    linksRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      marginVertical: 14,
    },
    linkText: { fontSize: 12, color: C.primary, textDecorationLine: 'underline' },
    linkDot: { marginHorizontal: 8, color: C.textTertiary },

    restoreBtn: {
      alignItems: 'center',
      paddingVertical: 10,
      marginTop: 10,
    },
    restoreText: {
      fontSize: 13,
      color: C.textSecondary,
      textDecorationLine: 'underline',
    },
  });
}
