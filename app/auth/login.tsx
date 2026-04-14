import { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Shadow } from '../../constants/theme';
import { useThemeColors, ThemeColors } from '../../hooks/useThemeColors';
import { useAuthStore } from '../../store/useAuthStore';
import { isSupabaseConfigured } from '../../services/supabase';

type Mode = 'signin' | 'signup';

export default function LoginScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const signIn = useAuthStore((s) => s.signInWithEmail);
  const signUp = useAuthStore((s) => s.signUpWithEmail);
  const loading = useAuthStore((s) => s.loading);
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);

  const configured = isSupabaseConfigured();

  const handleSubmit = async () => {
    if (!email || !password) {
      Alert.alert('入力エラー', 'メールアドレスとパスワードを入力してください');
      return;
    }
    if (mode === 'signup' && !agreed) {
      Alert.alert('同意が必要です', '利用規約・プライバシーポリシーへの同意が必要です');
      return;
    }
    const fn = mode === 'signin' ? signIn : signUp;
    const { error } = await fn(email, password);
    if (error) {
      Alert.alert(mode === 'signin' ? 'ログイン失敗' : '登録失敗', error);
      return;
    }
    if (mode === 'signup') {
      Alert.alert(
        '確認メール送信',
        '登録いただいたメールに確認リンクを送信しました。メール内のリンクから認証を完了してください。',
      );
    }
    router.back();
  };

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen options={{ title: mode === 'signin' ? 'ログイン' : '新規登録', headerTintColor: colors.primary }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.hero}>
            <Text style={s.heroIcon}>🎓</Text>
            <Text style={s.heroTitle}>
              {mode === 'signin' ? 'おかえりなさい' : 'アカウント作成'}
            </Text>
            <Text style={s.heroSub}>
              {mode === 'signin'
                ? '全デバイスで学習進捗を同期'
                : '無料で始められます'}
            </Text>
          </View>

          {!configured && (
            <View style={s.warnBox}>
              <Text style={s.warnText}>
                ⚠️ 認証サーバーが未設定です。オフラインモードで学習は可能ですが、
                クラウド同期はご利用いただけません。
              </Text>
            </View>
          )}

          <View style={[s.card, Shadow.sm]}>
            <Text style={s.label}>メールアドレス</Text>
            <TextInput
              style={s.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.textTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={s.label}>パスワード</Text>
            <TextInput
              style={s.input}
              value={password}
              onChangeText={setPassword}
              placeholder="8文字以上"
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
              style={[s.submitBtn, (loading || !configured) && s.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={loading || !configured}
            >
              <Text style={s.submitText}>
                {loading ? '処理中...' : mode === 'signin' ? 'ログイン' : '登録する'}
              </Text>
            </Pressable>

            <Pressable
              style={s.switchBtn}
              onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            >
              <Text style={s.switchText}>
                {mode === 'signin'
                  ? 'アカウントをお持ちでない方はこちら'
                  : 'すでにアカウントをお持ちの方'}
              </Text>
            </Pressable>
          </View>

          <Text style={s.footerNote}>
            ログインしなくても学習はご利用いただけます。{'\n'}
            ログインすると全デバイスで進捗が同期されます。
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.background },
    scroll: { padding: 20, paddingBottom: 40 },
    hero: { alignItems: 'center', paddingVertical: 24 },
    heroIcon: { fontSize: 56, marginBottom: 8 },
    heroTitle: { fontSize: 22, fontWeight: '800', color: C.text },
    heroSub: { fontSize: 13, color: C.textSecondary, marginTop: 6 },
    warnBox: {
      backgroundColor: '#FFF3E0',
      borderRadius: 10,
      padding: 14,
      marginBottom: 16,
    },
    warnText: { fontSize: 12, color: C.accentDark, lineHeight: 18 },
    card: { backgroundColor: C.card, borderRadius: 16, padding: 20 },
    label: { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 6, marginTop: 10 },
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
    agreeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
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
      marginTop: 20,
      backgroundColor: C.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    submitBtnDisabled: { backgroundColor: C.textTertiary },
    submitText: { color: C.white, fontSize: 15, fontWeight: '800' },
    switchBtn: { marginTop: 12, paddingVertical: 8, alignItems: 'center' },
    switchText: { fontSize: 13, color: C.primary, fontWeight: '600' },
    footerNote: {
      fontSize: 12,
      color: C.textTertiary,
      textAlign: 'center',
      marginTop: 20,
      lineHeight: 18,
    },
  });
}
