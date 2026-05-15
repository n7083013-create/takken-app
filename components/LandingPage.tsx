// ============================================================
// LandingPage (app.takkenkanzen.com 未ログイン時のページ)
// ============================================================
//
// 役割分担 (Google CEO 流の設計):
// - takkenkanzen.com (public/lp.html)       = マーケLP / SEO 入口 / Google広告先
// - app.takkenkanzen.com (このコンポーネント) = アプリ本体への入口 (ログイン/登録)
//
// 旧実装は1400行超のフル LP だったため、takkenkanzen.com と「LP が2種類ある」
// 状態になり、ブランド体験が分散していた。新実装は最小限の認証導線に絞り、
// 詳しい紹介はマーケLP (takkenkanzen.com) に集約する。
//
// 参考: Gmail と mail.google.com / Workspace と admin.google.com の関係と同じ設計。

import { useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';
import { FontSize, Spacing, BorderRadius, Shadow } from '../constants/theme';

const MARKETING_LP_URL = 'https://takkenkanzen.com';

export default function LandingPage() {
  const router = useRouter();
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const openMarketingLP = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = MARKETING_LP_URL;
      return;
    }
    Linking.openURL(MARKETING_LP_URL).catch(() => {});
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={s.container}>
        {/* ─── ブランドエリア ─── */}
        <View style={s.brand}>
          <Text style={s.appIcon}>📘</Text>
          <Text style={s.appName}>宅建士 完全対策</Text>
          <Text style={s.tagline}>AIと学ぶ、最短合格ルート</Text>
        </View>

        {/* ─── 認証 CTA ─── */}
        <View style={s.actions}>
          <Pressable
            style={({ pressed }) => [s.primaryBtn, pressed && s.primaryBtnPressed]}
            onPress={() => router.push('/auth/login')}
            accessibilityRole="button"
            accessibilityLabel="ログインする"
          >
            <Text style={s.primaryBtnText}>ログイン</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [s.secondaryBtn, pressed && s.secondaryBtnPressed]}
            onPress={() => router.push({ pathname: '/auth/login', params: { mode: 'signup' } })}
            accessibilityRole="button"
            accessibilityLabel="新規登録する"
          >
            <Text style={s.secondaryBtnText}>新規登録（無料）</Text>
          </Pressable>
        </View>

        {/* ─── マーケLP への誘導 ─── */}
        <View style={s.marketingBox}>
          <Text style={s.marketingTitle}>サービス紹介・料金プランは</Text>
          <Pressable onPress={openMarketingLP} accessibilityRole="link" accessibilityLabel="サービス紹介ページを開く">
            <Text style={s.marketingLink}>takkenkanzen.com で詳しく見る →</Text>
          </Pressable>
        </View>

        {/* ─── フッター ─── */}
        <Text style={s.footer}>© 2026 合同会社カケル</Text>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.background },
    container: {
      flex: 1,
      paddingHorizontal: Spacing.xl,
      justifyContent: 'space-between',
      paddingVertical: Spacing.xxl,
      maxWidth: 480,
      width: '100%',
      alignSelf: 'center',
    },

    // ─── ブランド ───
    brand: {
      alignItems: 'center',
      marginTop: Spacing.xxl,
    },
    appIcon: { fontSize: 72, marginBottom: Spacing.md },
    appName: {
      fontSize: 28,
      fontWeight: '800',
      color: C.text,
      letterSpacing: -0.5,
      marginBottom: Spacing.sm,
    },
    tagline: {
      fontSize: FontSize.subhead,
      color: C.textSecondary,
      fontWeight: '500',
      textAlign: 'center',
    },

    // ─── アクション ───
    actions: {
      gap: 12,
      marginVertical: Spacing.xxl,
    },
    primaryBtn: {
      backgroundColor: C.primary,
      paddingVertical: 16,
      borderRadius: BorderRadius.lg,
      alignItems: 'center',
      ...Shadow.sm,
    },
    primaryBtnPressed: { opacity: 0.85 },
    primaryBtnText: {
      color: C.white,
      fontSize: 17,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    secondaryBtn: {
      backgroundColor: C.card,
      paddingVertical: 16,
      borderRadius: BorderRadius.lg,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: C.primary,
    },
    secondaryBtnPressed: { opacity: 0.7 },
    secondaryBtnText: {
      color: C.primary,
      fontSize: 17,
      fontWeight: '700',
      letterSpacing: 0.3,
    },

    // ─── マーケLP導線 ───
    marketingBox: {
      alignItems: 'center',
      paddingVertical: Spacing.lg,
    },
    marketingTitle: {
      fontSize: FontSize.caption,
      color: C.textSecondary,
      marginBottom: 8,
    },
    marketingLink: {
      fontSize: FontSize.subhead,
      color: C.primary,
      fontWeight: '700',
      textDecorationLine: 'underline',
    },

    // ─── フッター ───
    footer: {
      textAlign: 'center',
      fontSize: FontSize.caption2,
      color: C.textTertiary,
      marginTop: Spacing.lg,
    },
  });
}
