// ============================================================
// 週次レビューメール受信設定トグル
// ============================================================
// profiles.weekly_email_enabled を Supabase で更新

import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { FontSize, Spacing, BorderRadius, Shadow } from '../constants/theme';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';
import { useAuthStore } from '../store/useAuthStore';
import { supabase } from '../services/supabase';
import { logError } from '../services/errorLogger';

export function WeeklyEmailToggle() {
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const user = useAuthStore((st) => st.user);

  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);

  // 現在の設定をDBから取得
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('weekly_email_enabled')
          .eq('id', user.id)
          .maybeSingle();
        if (!cancelled && !error && data) {
          setEnabled(data.weekly_email_enabled !== false);
        }
      } catch (e) {
        logError(e, { context: 'weeklyEmail.load' });
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const toggle = async () => {
    if (!user?.id || loading) return;
    const newValue = !enabled;
    setEnabled(newValue);
    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ weekly_email_enabled: newValue })
        .eq('id', user.id);
      if (error) {
        // 失敗時はロールバック
        setEnabled(!newValue);
        logError(error, { context: 'weeklyEmail.update' });
      }
    } catch (e) {
      setEnabled(!newValue);
      logError(e, { context: 'weeklyEmail.update' });
    } finally {
      setLoading(false);
    }
  };

  // 未ログインユーザーには表示しない
  if (!user) return null;

  return (
    <View style={s.box}>
      <View style={s.content}>
        <Text style={s.icon}>📧</Text>
        <View style={s.texts}>
          <Text style={s.title}>週次レビューメール</Text>
          <Text style={s.desc}>
            毎週月曜朝、学習の成果をメールでお届けします
          </Text>
        </View>
        <Pressable
          style={[s.toggle, enabled && s.toggleOn, loading && s.toggleLoading]}
          onPress={toggle}
          disabled={loading}
          accessibilityRole="switch"
          accessibilityState={{ checked: enabled }}
          accessibilityLabel="週次レビューメール"
        >
          <View style={[s.toggleKnob, enabled && s.toggleKnobOn]} />
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    box: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      marginTop: Spacing.md,
      ...Shadow.sm,
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    icon: {
      fontSize: 24,
    },
    texts: {
      flex: 1,
    },
    title: {
      fontSize: FontSize.subhead,
      fontWeight: '700',
      color: C.text,
    },
    desc: {
      fontSize: FontSize.caption2,
      color: C.textSecondary,
      marginTop: 2,
      lineHeight: 16,
    },
    toggle: {
      width: 50,
      height: 30,
      borderRadius: 15,
      backgroundColor: C.border,
      padding: 2,
    },
    toggleOn: {
      backgroundColor: C.primary,
    },
    toggleLoading: {
      opacity: 0.6,
    },
    toggleKnob: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: C.white,
      ...Shadow.sm,
    },
    toggleKnobOn: {
      transform: [{ translateX: 20 }],
    },
  });
}
