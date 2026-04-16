import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Shadow } from '../constants/theme';
import { useThemeColors, ThemeColors } from '../hooks/useThemeColors';
import { useSettingsStore } from '../store/useSettingsStore';
import { useAuthStore } from '../store/useAuthStore';
import { infoAlert } from '../services/alert';
import { ALL_QUESTIONS, ALL_QUICK_QUIZZES } from '../data';
import { API_BASE_URL } from '../constants/config';

const TOTAL_Q = ALL_QUESTIONS.length;
const TOTAL_QQ = ALL_QUICK_QUIZZES.length;

const FEATURES = [
  { icon: '📚', text: `全${TOTAL_Q}問が解き放題` },
  { icon: '⚡', text: `一問一答 ${TOTAL_QQ}問が解き放題` },
  { icon: '📝', text: '本試験形式の模擬試験 無制限' },
  { icon: '🤖', text: 'AI解説チャット 1日100回' },
  { icon: '📊', text: 'AI苦手分析・合格予測' },
  { icon: '⚖️', text: '2026年法改正完全対応' },
];

const API_BASE = API_BASE_URL;
const PAYJP_PUBLIC_KEY = process.env.EXPO_PUBLIC_PAYJP_PUBLIC_KEY || '';

export default function PaywallScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const getDaysUntilExam = useSettingsStore((s) => s.getDaysUntilExam);
  const daysUntilExam = useMemo(() => getDaysUntilExam(), [getDaysUntilExam]);
  const user = useAuthStore((s) => s.user);
  const session = useAuthStore((s) => s.session);
  const isPro = useSettingsStore((s) => s.isPro);
  const verifySubscription = useSettingsStore((s) => s.verifySubscription);

  // 既に有料会員ならホームに戻す
  useEffect(() => {
    if (isPro()) {
      router.replace('/(tabs)');
    }
  }, [isPro]);

  const [loading, setLoading] = useState(false);
  const [showCardForm, setShowCardForm] = useState(false);
  const [cardError, setCardError] = useState('');
  const cardElRef = useRef<any>(null);
  const payjpRef = useRef<any>(null);

  // PAY.JP Elements を初期化
  useEffect(() => {
    if (Platform.OS !== 'web' || !showCardForm || !PAYJP_PUBLIC_KEY) return;
    if (payjpRef.current) return; // 既にロード済み

    const loadPayjp = () => {
      if (typeof window === 'undefined') return;
      const existing = document.getElementById('payjp-script');
      if (existing) {
        initElements();
        return;
      }
      const script = document.createElement('script');
      script.id = 'payjp-script';
      script.src = 'https://js.pay.jp/v2/pay.js';
      script.onload = initElements;
      document.head.appendChild(script);
    };

    const initElements = () => {
      if (!window.Payjp) return;
      const pj = window.Payjp(PAYJP_PUBLIC_KEY);
      payjpRef.current = pj;
      const elements = pj.elements();
      const card = elements.create('card', {
        style: {
          base: {
            color: '#fff',
            fontSize: '16px',
            '::placeholder': { color: '#999' },
          },
          invalid: { color: '#ff6b6b' },
        },
      });
      // カードフォームをマウント
      const mountTarget = document.getElementById('payjp-card-element');
      if (mountTarget) {
        card.mount('#payjp-card-element');
        cardElRef.current = card;
        card.on('change', (e: any) => {
          setCardError(e.error ? e.error.message : '');
        });
      }
    };

    loadPayjp();
  }, [showCardForm]);

  const handleStartTrial = useCallback(() => {
    if (!user) {
      router.push('/auth/login?returnTo=/paywall');
      return;
    }
    setShowCardForm(true);
  }, [user, router]);

  const handleSubmitCard = useCallback(async () => {
    if (!payjpRef.current || !cardElRef.current) {
      infoAlert('エラー', 'カードフォームの読み込み中です。少々お待ちください。');
      return;
    }
    setLoading(true);
    setCardError('');

    try {
      // カードトークン化
      const result = await payjpRef.current.createToken(cardElRef.current);
      if (result.error) {
        setCardError(result.error.message);
        setLoading(false);
        return;
      }

      // サーバーにトークン送信 → サブスクリプション作成
      const res = await fetch(`${API_BASE}/create-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ cardToken: result.token.id }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '決済エラーが発生しました');
      }

      // 成功 → サブスクリプション状態を更新
      if (session?.access_token) {
        await verifySubscription(session.access_token);
      }
      infoAlert('登録完了！', '7日間の無料トライアルが開始されました。\nすべての機能をお楽しみください！');
      router.replace('/(tabs)');
    } catch (err: any) {
      setCardError(err.message || '処理に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [session, router, verifySubscription]);

  // 試験までの日数でメッセージだけ変える
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
      <ScrollView contentContainerStyle={s.scroll}>
        {/* Hero */}
        <View style={[s.hero, Shadow.lg]}>
          <Text style={s.heroBadge}>PREMIUM</Text>
          <Text style={s.heroTitle}>合格への最短ルート</Text>
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

        {/* 価格セクション */}
        <View style={[s.priceCard, Shadow.md]}>
          <View style={s.trialBadge}>
            <Text style={s.trialBadgeText}>7日間無料</Text>
          </View>
          <Text style={s.priceExplain}>まず無料で全機能をお試し</Text>
          <View style={s.priceRow}>
            <Text style={s.priceAmount}>¥0</Text>
            <Text style={s.priceSlash}> → </Text>
            <Text style={s.priceAfter}>¥980/月</Text>
          </View>
          <Text style={s.priceDetail}>8日目から月額¥980（1日わずか33円）</Text>
          <Text style={s.priceSafe}>トライアル中にキャンセルすれば一切料金はかかりません</Text>
        </View>

        {/* カード入力フォーム（PAY.JP Elements） */}
        {showCardForm && Platform.OS === 'web' && (
          <View style={[s.cardFormWrap, Shadow.md]}>
            <Text style={s.cardFormTitle}>カード情報を入力</Text>
            <View style={s.cardElementWrap}>
              <div
                id="payjp-card-element"
                style={{
                  padding: '14px',
                  borderRadius: '10px',
                  border: '1px solid #444',
                  backgroundColor: '#1a1a2e',
                  minHeight: '44px',
                }}
              />
            </View>
            {cardError ? <Text style={s.cardErrorText}>{cardError}</Text> : null}
            <Text style={s.cardSecureNote}>🔒 カード情報はPAY.JPが安全に処理します。当方のサーバーには保存されません。</Text>

            <Pressable
              style={[s.ctaBtn, Shadow.lg, loading && s.ctaBtnDisabled]}
              onPress={handleSubmitCard}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.ctaText}>7日間 無料トライアルを開始</Text>
              )}
            </Pressable>

            <Pressable onPress={() => setShowCardForm(false)} style={s.cancelBtn}>
              <Text style={s.cancelBtnText}>戻る</Text>
            </Pressable>
          </View>
        )}

        {/* CTA（カードフォーム非表示時） */}
        {!showCardForm && (
          <>
            <Pressable
              style={[s.ctaBtn, Shadow.lg]}
              onPress={handleStartTrial}
              accessibilityRole="button"
              accessibilityLabel="7日間無料で始める"
            >
              <Text style={s.ctaText}>7日間 無料で始める</Text>
            </Pressable>

            <Text style={s.ctaSub}>
              無料期間終了後 ¥980/月 ・ いつでも解約OK
            </Text>
          </>
        )}

        {/* 安心ポイント */}
        <View style={s.trustRow}>
          <View style={s.trustItem}>
            <Text style={s.trustIcon}>🔒</Text>
            <Text style={s.trustText}>安全な決済</Text>
          </View>
          <View style={s.trustItem}>
            <Text style={s.trustIcon}>✋</Text>
            <Text style={s.trustText}>いつでも解約</Text>
          </View>
        </View>

        <Text style={s.smallNote}>
          ・7日間の無料トライアル後、月額¥980で自動更新されます{'\n'}
          ・更新日の24時間前までにいつでも解約できます{'\n'}
          ・解約後は無料プランに戻ります
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

    // Hero
    hero: {
      backgroundColor: C.primary,
      borderRadius: 20,
      padding: 28,
      alignItems: 'center',
      marginBottom: 20,
      marginTop: 40,
    },
    heroBadge: {
      color: C.primary,
      backgroundColor: C.white,
      paddingHorizontal: 14,
      paddingVertical: 5,
      borderRadius: 999,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 1.5,
      marginBottom: 14,
      overflow: 'hidden',
    },
    heroTitle: { fontSize: 24, fontWeight: '800', color: C.white, marginBottom: 8 },
    heroSub: {
      fontSize: 15,
      color: 'rgba(255,255,255,0.9)',
      textAlign: 'center',
      lineHeight: 24,
      fontWeight: '600',
    },

    // Features
    featureCard: {
      backgroundColor: C.card,
      borderRadius: 16,
      padding: 20,
      marginBottom: 20,
    },
    featureTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: C.text,
      marginBottom: 12,
    },
    featureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
    },
    featureIcon: {
      fontSize: 18,
      width: 30,
    },
    featureText: { fontSize: 15, color: C.text, flex: 1, fontWeight: '500' },

    // Price card
    priceCard: {
      backgroundColor: C.card,
      borderRadius: 20,
      padding: 24,
      alignItems: 'center',
      marginBottom: 20,
      borderWidth: 2,
      borderColor: C.primary,
      position: 'relative',
      overflow: 'visible',
    },
    trialBadge: {
      position: 'absolute',
      top: -14,
      backgroundColor: C.accent,
      paddingHorizontal: 16,
      paddingVertical: 5,
      borderRadius: 12,
    },
    trialBadgeText: {
      color: C.white,
      fontSize: 14,
      fontWeight: '800',
    },
    priceExplain: {
      fontSize: 14,
      color: C.textSecondary,
      marginTop: 12,
      marginBottom: 8,
    },
    priceRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      marginBottom: 10,
    },
    priceAmount: {
      fontSize: 40,
      fontWeight: '800',
      color: C.primary,
    },
    priceSlash: {
      fontSize: 22,
      color: C.textTertiary,
      marginHorizontal: 6,
    },
    priceAfter: {
      fontSize: 20,
      fontWeight: '700',
      color: C.textSecondary,
    },
    priceDetail: {
      fontSize: 13,
      color: C.textSecondary,
      marginBottom: 6,
    },
    priceSafe: {
      fontSize: 12,
      color: C.primary,
      fontWeight: '600',
    },

    // Card form
    cardFormWrap: {
      backgroundColor: C.card,
      borderRadius: 16,
      padding: 20,
      marginBottom: 20,
      borderWidth: 2,
      borderColor: C.primary,
    },
    cardFormTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: C.text,
      marginBottom: 14,
      textAlign: 'center',
    },
    cardElementWrap: {
      marginBottom: 12,
    },
    cardErrorText: {
      color: '#ff6b6b',
      fontSize: 13,
      marginBottom: 8,
      textAlign: 'center',
    },
    cardSecureNote: {
      fontSize: 11,
      color: C.textTertiary,
      textAlign: 'center',
      marginBottom: 16,
      lineHeight: 16,
    },
    cancelBtn: {
      alignItems: 'center' as const,
      paddingVertical: 10,
    },
    cancelBtnText: {
      color: C.textSecondary,
      fontSize: 14,
    },

    // CTA
    ctaBtn: {
      backgroundColor: C.primary,
      borderRadius: 16,
      paddingVertical: 20,
      alignItems: 'center',
      marginBottom: 8,
    },
    ctaBtnDisabled: { opacity: 0.6 },
    ctaText: { color: C.white, fontSize: 18, fontWeight: '800' },
    ctaSub: {
      textAlign: 'center',
      fontSize: 12,
      color: C.textSecondary,
      marginBottom: 20,
    },

    // Trust indicators
    trustRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 20,
      marginBottom: 20,
    },
    trustItem: { alignItems: 'center', gap: 4 },
    trustIcon: { fontSize: 20 },
    trustText: { fontSize: 11, color: C.textSecondary, fontWeight: '600' },

    // Footer
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
