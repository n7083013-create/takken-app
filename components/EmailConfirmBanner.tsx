// ============================================================
// メール確認未完了バナー
// ログイン済みだが email_confirmed_at が無いユーザーに警告表示
// ============================================================

import { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { FontSize, BorderRadius, Spacing } from '../constants/theme';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';
import { useAuthStore } from '../store/useAuthStore';
import { supabase } from '../services/supabase';
import { infoAlert } from '../services/alert';

export function EmailConfirmBanner() {
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const user = useAuthStore((st) => st.user);
  const [sending, setSending] = useState(false);

  // OAuth（Google/Apple）ログインは email_confirmed_at が自動セットされる
  // メール/パスワード登録のみ未確認の可能性あり
  const needsConfirm = user && !user.email_confirmed_at;

  const handleResend = useCallback(async () => {
    if (!user?.email || sending) return;
    setSending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: user.email,
      });
      if (error) {
        await infoAlert('送信失敗', '確認メールの再送信に失敗しました。時間をおいて再度お試しください。');
      } else {
        await infoAlert(
          '確認メールを送信しました',
          `${user.email} 宛に確認メールを送信しました。メール内のリンクをクリックしてください。`,
        );
      }
    } catch {
      await infoAlert('送信失敗', '通信エラーが発生しました。');
    } finally {
      setSending(false);
    }
  }, [user, sending]);

  if (!needsConfirm) return null;

  return (
    <View style={s.banner}>
      <Text style={s.icon}>📧</Text>
      <View style={s.content}>
        <Text style={s.title}>メール確認が必要です</Text>
        <Text style={s.desc} numberOfLines={2}>
          {user?.email} に届いた確認リンクをクリックしてください
        </Text>
      </View>
      <Pressable
        style={[s.btn, sending && s.btnDisabled]}
        onPress={handleResend}
        disabled={sending}
        accessibilityRole="button"
        accessibilityLabel="確認メールを再送信"
      >
        <Text style={s.btnText}>{sending ? '送信中' : '再送'}</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.warningSurface,
      borderRadius: BorderRadius.md,
      padding: Spacing.md,
      marginHorizontal: Spacing.lg,
      marginTop: Spacing.md,
      gap: 10,
      borderWidth: 1,
      borderColor: C.accent + '40',
    },
    icon: {
      fontSize: 22,
    },
    content: {
      flex: 1,
    },
    title: {
      fontSize: FontSize.caption,
      fontWeight: '800',
      color: C.accent,
    },
    desc: {
      fontSize: FontSize.caption2,
      color: C.textSecondary,
      marginTop: 2,
    },
    btn: {
      backgroundColor: C.accent,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: BorderRadius.sm,
    },
    btnDisabled: {
      opacity: 0.5,
    },
    btnText: {
      fontSize: FontSize.caption2,
      fontWeight: '800',
      color: C.white,
    },
  });
}
