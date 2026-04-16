import { useState, useMemo } from 'react';
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

type Mode = 'signin' | 'signup';

export default function LoginScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
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

  const configured = isSupabaseConfigured();

  // ── Apple Sign In ──
  const handleAppleSignIn = async () => {
    try {
      setAppleLoading(true);
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
    }
    // OAuth redirect handles the rest on web
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

          {!configured && (
            <View style={s.warnBox}>
              <Text style={s.warnText}>
                ⚠️ 認証サーバーが未設定です。現在ご利用いただけません。
              </Text>
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

          {/* Appleサインインボタン（iOSのみ） */}
          {Platform.OS === 'ios' && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={12}
              style={s.appleBtn}
              onPress={handleAppleSignIn}
            />
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

    // Apple button
    appleBtn: {
      width: '100%',
      height: 50,
      marginTop: 12,
    },

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
