// ============================================================
// お問い合わせ・フィードバック画面（C4: サポートフロー）
// ============================================================
// App Store / Google Play の審査要件「サポート連絡手段」を満たす。
// 利用目的・バグ報告・要望・質問など分類して送信。
// 既存 Resend 経由のメール送信を ai-chat.js 同居で行う（mode='feedback'）。
// ============================================================

import { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useAuthStore } from '../store/useAuthStore';
import { useThemeColors, ThemeColors } from '../hooks/useThemeColors';
import { Shadow } from '../constants/theme';
import { Input } from '../components/ui/Input';
import { API_BASE_URL, APP_VERSION } from '../constants/config';
import { infoAlert } from '../services/alert';
import { WebBackButton } from '../components/WebBackButton';

type Category = 'bug' | 'feature' | 'question' | 'other';

const CATEGORIES: Array<{ key: Category; label: string; icon: string }> = [
  { key: 'bug', label: 'バグ報告', icon: '🐛' },
  { key: 'feature', label: '機能要望', icon: '✨' },
  { key: 'question', label: '質問', icon: '❓' },
  { key: 'other', label: 'その他', icon: '💬' },
];

// T-PII Round2 H-3: サーバ側 isValidContactEmail と完全同期。
// CRLF注入 / ヘッダ汚染を遮断するためクライアントでも形式確認する。
const MAX_EMAIL = 254;
const MAX_EMAIL_LOCAL = 64;
const EMAIL_RE = /^[A-Za-z0-9!#$%&'*+\-/=?^_`{|}~.]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
const EMAIL_FORBIDDEN_RE = /[\r\n\t\x00-\x1F\x7F<>"'\\,;:()[\]]|%0[ADad]/;
function isValidContactEmail(value: string): boolean {
  if (value.length === 0 || value.length > MAX_EMAIL) return false;
  if (EMAIL_FORBIDDEN_RE.test(value)) return false;
  if (!EMAIL_RE.test(value)) return false;
  const atIdx = value.indexOf('@');
  if (atIdx < 1 || atIdx > MAX_EMAIL_LOCAL) return false;
  return true;
}

export default function FeedbackScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const session = useAuthStore((st) => st.session);
  const user = useAuthStore((st) => st.user);

  const [category, setCategory] = useState<Category>('bug');
  const [body, setBody] = useState('');
  const [contactEmail, setContactEmail] = useState(user?.email ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    const trimmed = body.trim();
    if (trimmed.length < 5) {
      infoAlert('入力エラー', '内容を5文字以上入力してください');
      return;
    }
    if (trimmed.length > 4000) {
      infoAlert('入力エラー', '内容は4000文字以内にしてください');
      return;
    }
    // T-PII Round2 H-3: email 形式チェック。空は任意、入力ありなら厳格
    const trimmedEmail = contactEmail.trim();
    if (trimmedEmail.length > 0 && !isValidContactEmail(trimmedEmail)) {
      infoAlert('入力エラー', 'メールアドレスの形式が正しくありません');
      return;
    }
    setSubmitting(true);
    try {
      const meta = {
        appVersion: APP_VERSION,
        platform: Platform.OS,
        platformVersion: Platform.Version?.toString?.() ?? '',
        device: Constants.deviceName ?? '',
      };
      const res = await fetch(`${API_BASE_URL}/ai-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          mode: 'feedback',
          category,
          body: trimmed,
          contactEmail: trimmedEmail,
          meta,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `送信失敗: ${res.status}`);
      }
      setSubmitted(true);
    } catch (e: any) {
      infoAlert('送信失敗', e?.message || '通信エラーが発生しました。少し時間をおいてお試しください。');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <SafeAreaView style={s.safe}>
        <Stack.Screen options={{ title: 'お問い合わせ' }} />
        <WebBackButton />
        <View style={s.thanksWrap}>
          <Text style={s.thanksEmoji}>🙏</Text>
          <Text style={s.thanksTitle}>送信しました</Text>
          <Text style={s.thanksText}>
            お問い合わせありがとうございます。{'\n'}
            内容を確認の上、必要に応じてご連絡先メールアドレスへ返信いたします。
          </Text>
          <Pressable style={s.primaryBtn} onPress={() => router.back()}>
            <Text style={s.primaryBtnText}>戻る</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen options={{ title: 'お問い合わせ' }} />
      <WebBackButton />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Text style={s.lead}>
            ご質問・ご要望・不具合のご報告など、お気軽にお寄せください。
            通常3営業日以内にご返信いたします（土日祝を除く）。
          </Text>

          <Text style={s.sectionLabel}>種類</Text>
          <View style={s.catGrid}>
            {CATEGORIES.map((c) => {
              const active = category === c.key;
              return (
                <Pressable
                  key={c.key}
                  style={[s.catBtn, active && s.catBtnActive]}
                  onPress={() => setCategory(c.key)}
                >
                  <Text style={s.catIcon}>{c.icon}</Text>
                  <Text style={[s.catLabel, active && s.catLabelActive]}>{c.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Input
            variant="multiline"
            label="内容"
            placeholder="ご質問・ご要望の内容をお書きください"
            value={body}
            onChangeText={setBody}
            rows={8}
            maxLength={4000}
            accessibilityLabel="お問い合わせ内容"
          />

          <View style={s.fieldGap} />
          <Input
            variant="email"
            label="ご連絡先メールアドレス"
            placeholder="返信先メールアドレス"
            value={contactEmail}
            onChangeText={setContactEmail}
            maxLength={MAX_EMAIL}
            accessibilityLabel="ご連絡先メールアドレス"
          />
          <Text style={s.note}>
            ※ ログイン中のメールアドレスが自動入力されています。{'\n'}
            別のアドレスへ返信を希望する場合は変更してください。
          </Text>

          <Pressable
            style={[s.primaryBtn, Shadow.sm, submitting && s.btnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={s.primaryBtnText}>送信する</Text>
            )}
          </Pressable>

          <Text style={s.privacy}>
            送信内容と一緒に、アプリのバージョン・OS情報・端末名が自動的に記録されます。
            これらは不具合調査の目的のみに使用し、第三者へ提供いたしません。
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
    lead: { fontSize: 14, color: C.textSecondary, lineHeight: 22, marginBottom: 20 },
    sectionLabel: { fontSize: 14, fontWeight: '700', color: C.text, marginTop: 16, marginBottom: 8 },
    catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    catBtn: {
      flex: 1,
      minWidth: 140,
      backgroundColor: C.card,
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 12,
      borderWidth: 1.5,
      borderColor: C.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    catBtnActive: { borderColor: C.primary, backgroundColor: C.primarySurface },
    catIcon: { fontSize: 22 },
    catLabel: { fontSize: 14, fontWeight: '700', color: C.textSecondary },
    catLabelActive: { color: C.primary },
    fieldGap: { height: 16 },
    note: { fontSize: 11, color: C.textTertiary, marginTop: 6, lineHeight: 16 },
    primaryBtn: {
      backgroundColor: C.primary,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 24,
    },
    btnDisabled: { opacity: 0.5 },
    primaryBtnText: { color: C.white, fontSize: 16, fontWeight: '800' },
    privacy: { fontSize: 11, color: C.textTertiary, marginTop: 16, lineHeight: 16, textAlign: 'center' },

    // Thanks screen
    thanksWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    thanksEmoji: { fontSize: 72, marginBottom: 16 },
    thanksTitle: { fontSize: 22, fontWeight: '800', color: C.text, marginBottom: 12 },
    thanksText: { fontSize: 14, color: C.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  });
}
