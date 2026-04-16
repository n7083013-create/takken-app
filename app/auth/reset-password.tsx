import { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Shadow } from '../../constants/theme';
import { useThemeColors, ThemeColors } from '../../hooks/useThemeColors';
import { supabase } from '../../services/supabase';
import { infoAlert } from '../../services/alert';
import { validatePassword } from '../../services/validation';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleReset = async () => {
    const check = validatePassword(password);
    if (!check.valid) {
      infoAlert('入力エラー', check.message);
      return;
    }
    if (password !== confirm) {
      infoAlert('入力エラー', 'パスワードが一致しません');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        infoAlert('エラー', 'パスワードの更新に失敗しました。リンクが期限切れの場合は再度リセットしてください。');
      } else {
        setDone(true);
        infoAlert('完了', 'パスワードを更新しました。');
      }
    } catch {
      infoAlert('エラー', '通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <SafeAreaView style={s.safe}>
        <Stack.Screen options={{ title: 'パスワード変更完了', headerTintColor: '#2E7D32' }} />
        <View style={s.center}>
          <Text style={s.doneIcon}>✅</Text>
          <Text style={s.doneTitle}>パスワードを変更しました</Text>
          <Pressable style={[s.btn, Shadow.sm]} onPress={() => router.replace('/(tabs)')}>
            <Text style={s.btnText}>ホームへ戻る</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen options={{ title: '新しいパスワード', headerTintColor: '#2E7D32' }} />
      <View style={s.container}>
        <Text style={s.title}>新しいパスワードを設定</Text>
        <Text style={s.sub}>8文字以上で入力してください</Text>

        <TextInput
          style={s.input}
          value={password}
          onChangeText={setPassword}
          placeholder="新しいパスワード"
          placeholderTextColor={colors.textTertiary}
          secureTextEntry
          autoCapitalize="none"
        />
        <TextInput
          style={[s.input, { marginTop: 12 }]}
          value={confirm}
          onChangeText={setConfirm}
          placeholder="パスワード（確認）"
          placeholderTextColor={colors.textTertiary}
          secureTextEntry
          autoCapitalize="none"
        />

        <Pressable
          style={[s.btn, Shadow.sm, loading && s.disabled]}
          onPress={handleReset}
          disabled={loading}
        >
          <Text style={s.btnText}>{loading ? '更新中...' : 'パスワードを変更'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.background },
    container: { padding: 24, paddingTop: 40 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    title: { fontSize: 22, fontWeight: '800', color: C.text, marginBottom: 8 },
    sub: { fontSize: 14, color: C.textSecondary, marginBottom: 24 },
    input: {
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: C.text,
      backgroundColor: C.card,
    },
    btn: {
      marginTop: 24,
      backgroundColor: C.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    btnText: { color: C.white, fontSize: 15, fontWeight: '800' },
    disabled: { opacity: 0.5 },
    doneIcon: { fontSize: 56, marginBottom: 16 },
    doneTitle: { fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 24 },
  });
}
