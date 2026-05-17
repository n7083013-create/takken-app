import { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { infoAlert } from '../../services/alert';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Shadow } from '../../constants/theme';
import { useThemeColors, ThemeColors } from '../../hooks/useThemeColors';
import { useAuthStore } from '../../store/useAuthStore';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import { trackEvent } from '../../services/analytics';

type Mode = 'signin' | 'signup';

export default function LoginScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  // [UX改善] LP「Premium で始める」CTA → paywall 直行フローで
  // ログイン画面が中継ステップとして挟まる際の「あと1ステップ」プログレス表示
  const isHeadingToPaywall = returnTo === '/paywall';
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const signIn = useAuthStore((s) => s.signInWithEmail);
  const signUp = useAuthStore((s) => s.signUpWithEmail);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const resetPassword = useAuthStore((s) => s.resetPassword);
  const loading = useAuthStore((s) => s.loading);
  const [resetSent, setResetSent] = useState(false);
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  // Issue #23: サインアップ完了後の永続UI状態（メール確認待ち）
  const [signupCompletedEmail, setSignupCompletedEmail] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleResendVerification = async () => {
    if (!signupCompletedEmail || resendCooldown > 0) return;
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: signupCompletedEmail,
      });
      if (error) {
        infoAlert('再送失敗', error.message || '時間をおいて再度お試しください');
        return;
      }
      infoAlert('再送完了', `${signupCompletedEmail} に確認メールを再送しました`);
      setResendCooldown(60); // 60秒のクールダウン
    } catch (e) {
      infoAlert('再送失敗', '通信エラーが発生しました');
    }
  };

  const configured = isSupabaseConfigured();

  // ── Apple Sign In ──
  const handleAppleSignIn = async () => {
    try {
      setAppleLoading(true);

      // Web: Supabase の OAuth フロー（Apple Service ID 経由）
      if (Platform.OS === 'web') {
        // OAuth 戻り先を保存
        if (returnTo && typeof window !== 'undefined') {
          localStorage?.setItem('auth_returnTo', returnTo);
        }
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'apple',
          options: {
            redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
          },
        });
        if (error) throw error;
        // ブラウザが Apple のページに遷移する。戻りは onAuthStateChange で処理
        return;
      }

      // Android: Supabase OAuth + deep link callback（iOS は signInAsync を下で使う）
      if (Platform.OS === 'android') {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'apple',
          options: {
            skipBrowserRedirect: true,
            redirectTo: 'takken-app://auth/callback',
          },
        });
        if (error || !data?.url) throw error || new Error('Apple ログイン URL が取得できませんでした');
        // expo-web-browser の openAuthSessionAsync で deep link 完了を待つ
        const WebBrowser = await import('expo-web-browser');
        const result = await WebBrowser.openAuthSessionAsync(data.url, 'takken-app://auth/callback');
        if (result.type === 'success' && result.url) {
          const callbackUrl = new URL(result.url);
          const code = callbackUrl.searchParams.get('code');
          if (code) {
            // PKCE フロー
            await supabase.auth.exchangeCodeForSession(code);
          } else {
            // implicit fallback
            const params = new URLSearchParams(
              callbackUrl.hash ? callbackUrl.hash.substring(1) : callbackUrl.search.substring(1),
            );
            const accessToken = params.get('access_token');
            const refreshToken = params.get('refresh_token');
            if (accessToken && refreshToken) {
              await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
            }
          }
        }
        return;
      }

      // Native (iOS): 既存の AppleAuthentication.signInAsync
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (credential.identityToken) {
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: credential.identityToken,
        });
        if (error) throw error;
        // Navigation will be handled by auth state listener
        const safeReturn =
          returnTo &&
          typeof returnTo === 'string' &&
          returnTo.startsWith('/') &&
          !returnTo.startsWith('//')
            ? returnTo
            : '/(tabs)';
        router.replace(safeReturn as any);
      }
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('エラー', 'Appleサインインに失敗しました');
      }
    } finally {
      setAppleLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!email || !password) {
      infoAlert('入力エラー', 'メールアドレスとパスワードを入力してください');
      return;
    }
    if (mode === 'signup' && !agreed) {
      infoAlert('同意が必要です', '利用規約・プライバシーポリシーへの同意が必要です');
      return;
    }
    const fn = mode === 'signin' ? signIn : signUp;
    const { error } = await fn(email, password);
    if (error) {
      infoAlert(mode === 'signin' ? 'ログイン失敗' : '登録失敗', error);
      return;
    }
    if (mode === 'signup') {
      // Google広告コンバージョン（登録）発火
      trackEvent('sign_up', { currency: 'JPY' });
      // Issue #23: Alert だけだと閉じた瞬間ユーザーが離脱しやすい。
      // 永続的な「メール確認待ち」UI を画面に表示し、再送ボタンと迷惑メール案内を残す。
      setSignupCompletedEmail(email.trim());
      return;
    }
    const safeReturn = returnTo && typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//')
      ? returnTo : '/(tabs)';
    router.replace(safeReturn as any);
  };

  const handleGoogle = async () => {
    // OAuth後の戻り先を保存（リダイレクトで状態が消えるため）
    if (returnTo) {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') localStorage?.setItem('auth_returnTo', returnTo);
      } else {
        await AsyncStorage.setItem('auth_returnTo', returnTo);
      }
    }
    setGoogleLoading(true);
    const { error } = await signInWithGoogle();
    setGoogleLoading(false);
    if (error) {
      infoAlert('エラー', error);
      return;
    }
    // [Bugfix] Native (iOS/Android) では OAuth 完了後にアプリ内で
    // ログイン画面に留まっているため明示的にホームへ遷移させる必要がある。
    // Web ではすでにブラウザのフルページリダイレクトで遷移済みなのでスキップ。
    if (Platform.OS !== 'web') {
      // signInWithGoogle 内で session が確立済み。state 反映を待ってから遷移
      const safeReturn = returnTo && typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//')
        ? returnTo : '/(tabs)';
      // user state が onAuthStateChange 経由で更新されるまでわずかに待つ
      setTimeout(() => router.replace(safeReturn as any), 100);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen options={{ title: '', headerShown: false }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.hero}>
            <Text style={s.heroIcon}>📚</Text>
            <Text style={s.heroTitle}>宅建士 完全対策</Text>
            <Text style={s.heroSub}>
              AIが最適な学習プランを作成
            </Text>
          </View>

          {/* [UX改善] Premium 訴求プログレスバナー (LP → ログイン → paywall のフロー) */}
          {isHeadingToPaywall && (
            <View style={s.premiumProgressBox}>
              <Text style={s.premiumProgressTitle}>
                ✨ あと1ステップで 7日間無料スタート!
              </Text>
              <View style={s.progressRow}>
                <View style={s.progressStep}>
                  <View style={[s.progressDot, s.progressDotActive]}>
                    <Text style={s.progressDotNum}>1</Text>
                  </View>
                  <Text style={[s.progressLabel, s.progressLabelActive]}>登録</Text>
                </View>
                <View style={s.progressLine} />
                <View style={s.progressStep}>
                  <View style={s.progressDot}>
                    <Text style={s.progressDotNum}>2</Text>
                  </View>
                  <Text style={s.progressLabel}>Premium 開始</Text>
                </View>
              </View>
            </View>
          )}

          {!configured && (
            <View style={s.warnBox}>
              <Text style={s.warnText}>
                ⚠️ 認証サーバーが未設定です。現在ご利用いただけません。
              </Text>
            </View>
          )}

          {/* Issue #23: サインアップ完了後の永続UI（離脱防止） */}
          {signupCompletedEmail && (
            <View style={s.verifyBox}>
              <Text style={s.verifyEmoji}>📨</Text>
              <Text style={s.verifyTitle}>確認メールを送信しました</Text>
              <Text style={s.verifyEmail}>{signupCompletedEmail}</Text>
              <Text style={s.verifyDesc}>
                メール内のリンクをクリックしてアカウントを有効化してください。
              </Text>
              <View style={s.verifyTipsBox}>
                <Text style={s.verifyTip}>📁 迷惑メールフォルダもご確認ください</Text>
                <Text style={s.verifyTip}>⏱ メールが届くまで数分かかる場合があります</Text>
              </View>
              <Pressable
                style={[s.verifyResendBtn, resendCooldown > 0 && s.btnDisabled]}
                onPress={handleResendVerification}
                disabled={resendCooldown > 0}
              >
                <Text style={s.verifyResendText}>
                  {resendCooldown > 0 ? `再送可能まで ${resendCooldown} 秒` : '確認メールを再送する'}
                </Text>
              </Pressable>
              <Pressable
                style={s.verifyBackBtn}
                onPress={() => {
                  setSignupCompletedEmail(null);
                  setMode('signin');
                }}
              >
                <Text style={s.verifyBackText}>確認後にログインする →</Text>
              </Pressable>
            </View>
          )}

          {/* Googleログインボタン */}
          <Pressable
            style={[s.googleBtn, Shadow.sm, (!configured || googleLoading) && s.btnDisabled]}
            onPress={handleGoogle}
            disabled={!configured || googleLoading}
          >
            {googleLoading ? (
              <ActivityIndicator color="#333" size="small" />
            ) : (
              <>
                <Text style={s.googleIcon}>G</Text>
                <Text style={s.googleText}>Googleで続ける</Text>
              </>
            )}
          </Pressable>

          {/* Appleサインインボタン（iOS native） */}
          {Platform.OS === 'ios' && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={12}
              style={s.appleBtn}
              onPress={handleAppleSignIn}
            />
          )}

          {/* Appleサインインボタン（Web 経由 OAuth） */}
          {Platform.OS === 'web' && (
            <Pressable
              style={[s.appleWebBtn, Shadow.sm, (!configured || appleLoading) && s.btnDisabled]}
              onPress={handleAppleSignIn}
              disabled={!configured || appleLoading}
              accessibilityRole="button"
              accessibilityLabel="Appleでサインイン"
            >
              {appleLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Text style={s.appleWebIcon}>{''}</Text>
                  <Text style={s.appleWebText}>Appleでサインイン</Text>
                </>
              )}
            </Pressable>
          )}

          {/* 区切り線 */}
          <View style={s.divider}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>または</Text>
            <View style={s.dividerLine} />
          </View>

          {/* メールフォーム */}
          <View style={[s.card, Shadow.sm]}>
            <TextInput
              style={s.input}
              value={email}
              onChangeText={setEmail}
              placeholder="メールアドレス"
              placeholderTextColor={colors.textTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TextInput
              style={[s.input, { marginTop: 10 }]}
              value={password}
              onChangeText={setPassword}
              placeholder="パスワード（8文字以上）"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry
              autoCapitalize="none"
            />

            {mode === 'signup' && (
              <Pressable style={s.agreeRow} onPress={() => setAgreed(!agreed)}>
                <View style={[s.checkbox, agreed && s.checkboxChecked]}>
                  {agreed && <Text style={s.checkmark}>✓</Text>}
                </View>
                <Text style={s.agreeText}>
                  <Text
                    style={s.link}
                    onPress={() => router.push('/legal/terms')}
                  >
                    利用規約
                  </Text>
                  {' と '}
                  <Text
                    style={s.link}
                    onPress={() => router.push('/legal/privacy')}
                  >
                    プライバシーポリシー
                  </Text>
                  {' に同意する'}
                </Text>
              </Pressable>
            )}

            <Pressable
              style={[s.submitBtn, (loading || !configured) && s.btnDisabled]}
              onPress={handleSubmit}
              disabled={loading || !configured}
            >
              <Text style={s.submitText}>
                {loading ? '処理中...' : mode === 'signin' ? 'ログイン' : '無料で始める'}
              </Text>
            </Pressable>

            {mode === 'signin' && (
              <Pressable
                style={s.forgotBtn}
                onPress={async () => {
                  if (!email) {
                    infoAlert('メールアドレスを入力', 'パスワードリセット用のメールアドレスを入力してください');
                    return;
                  }
                  const { error } = await resetPassword(email);
                  if (error) {
                    infoAlert('エラー', error);
                  } else {
                    setResetSent(true);
                    infoAlert('送信完了', 'パスワードリセット用のメールを送信しました。メールをご確認ください。');
                  }
                }}
              >
                <Text style={s.forgotText}>
                  {resetSent ? '✉️ リセットメール送信済み' : 'パスワードを忘れた方'}
                </Text>
              </Pressable>
            )}
          </View>

          <Pressable
            style={s.switchBtn}
            onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          >
            <Text style={s.switchText}>
              {mode === 'signin'
                ? 'アカウントをお持ちでない方 → 新規登録'
                : 'すでにアカウントをお持ちの方 → ログイン'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.background },
    scroll: { padding: 24, paddingBottom: 40 },
    hero: { alignItems: 'center', paddingVertical: 40 },
    heroIcon: { fontSize: 56, marginBottom: 12 },
    heroTitle: { fontSize: 26, fontWeight: '900', color: C.text },
    heroSub: { fontSize: 14, color: C.textSecondary, marginTop: 8 },
    warnBox: {
      backgroundColor: '#FFF3E0',
      borderRadius: 10,
      padding: 14,
      marginBottom: 16,
    },
    warnText: { fontSize: 12, color: C.accentDark, lineHeight: 18 },

    // [UX改善] Premium 訴求プログレスバナー
    premiumProgressBox: {
      backgroundColor: C.primarySurface ?? '#E8F5EC',
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: C.primary,
      padding: 16,
      marginBottom: 16,
      alignItems: 'center',
    },
    premiumProgressTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: C.primary,
      marginBottom: 12,
      textAlign: 'center',
    },
    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    progressStep: {
      alignItems: 'center',
      minWidth: 80,
    },
    progressDot: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: '#d0d0d0',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    progressDotActive: {
      backgroundColor: C.primary,
    },
    progressDotNum: {
      fontSize: 14,
      fontWeight: '800',
      color: '#fff',
    },
    progressLine: {
      width: 36,
      height: 2,
      backgroundColor: '#d0d0d0',
      marginBottom: 22,
    },
    progressLabel: {
      fontSize: 11,
      color: C.textSecondary,
      fontWeight: '600',
    },
    progressLabelActive: {
      color: C.primary,
      fontWeight: '800',
    },

    // Issue #23: サインアップ完了後の永続UI
    verifyBox: {
      backgroundColor: C.surface,
      borderRadius: 16,
      padding: 24,
      marginBottom: 16,
      borderWidth: 2,
      borderColor: C.primary,
      alignItems: 'center',
    },
    verifyEmoji: { fontSize: 56, marginBottom: 8 },
    verifyTitle: { fontSize: 18, fontWeight: '700', color: C.text, marginBottom: 4 },
    verifyEmail: { fontSize: 14, fontWeight: '600', color: C.primary, marginBottom: 12 },
    verifyDesc: { fontSize: 13, color: C.textSecondary, lineHeight: 20, textAlign: 'center', marginBottom: 16 },
    verifyTipsBox: {
      width: '100%',
      backgroundColor: C.background,
      borderRadius: 8,
      padding: 12,
      marginBottom: 16,
    },
    verifyTip: { fontSize: 12, color: C.textSecondary, lineHeight: 18, marginVertical: 2 },
    verifyResendBtn: {
      backgroundColor: C.primary,
      borderRadius: 24,
      paddingVertical: 12,
      paddingHorizontal: 20,
      width: '100%',
      alignItems: 'center',
      marginBottom: 12,
    },
    verifyResendText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
    verifyBackBtn: { paddingVertical: 8 },
    verifyBackText: { fontSize: 13, color: C.primary, fontWeight: '600' },

    // Google button
    googleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.white,
      borderRadius: 12,
      paddingVertical: 14,
      borderWidth: 1,
      borderColor: C.border,
    },
    googleIcon: {
      fontSize: 20,
      fontWeight: '700',
      color: '#4285F4',
      marginRight: 10,
    },
    googleText: {
      fontSize: 15,
      fontWeight: '700',
      color: '#333',
    },

    // Apple button (iOS native)
    appleBtn: {
      width: '100%',
      height: 50,
      marginTop: 12,
    },
    // Apple button (Web 用カスタム)
    appleWebBtn: {
      width: '100%',
      height: 50,
      marginTop: 12,
      backgroundColor: '#000',
      borderRadius: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    appleWebIcon: { color: '#fff', fontSize: 20, fontFamily: 'System' },
    appleWebText: { color: '#fff', fontSize: 16, fontWeight: '600' },

    // Divider
    divider: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 20,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: C.border,
    },
    dividerText: {
      fontSize: 12,
      color: C.textTertiary,
      marginHorizontal: 12,
    },

    // Email form
    card: { backgroundColor: C.card, borderRadius: 16, padding: 20 },
    input: {
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: C.text,
      backgroundColor: C.background,
    },
    agreeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 4,
      borderWidth: 2,
      borderColor: C.textTertiary,
      marginRight: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxChecked: { borderColor: C.primary, backgroundColor: C.primary },
    checkmark: { color: C.white, fontSize: 12, fontWeight: '800' },
    agreeText: { flex: 1, fontSize: 12, color: C.textSecondary, lineHeight: 18 },
    link: { color: C.primary, fontWeight: '700', textDecorationLine: 'underline' },
    submitBtn: {
      marginTop: 16,
      backgroundColor: C.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    btnDisabled: { opacity: 0.5 },
    submitText: { color: C.white, fontSize: 15, fontWeight: '800' },
    forgotBtn: { marginTop: 12, alignItems: 'center' },
    forgotText: { fontSize: 13, color: C.textSecondary },
    switchBtn: { marginTop: 16, paddingVertical: 8, alignItems: 'center' },
    switchText: { fontSize: 13, color: C.primary, fontWeight: '600' },
  });
}
