// ============================================================
// グローバルAIフローティングボタン
// どの画面からでもAIに質問できる
// ============================================================

import { useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors, ThemeColors } from '../hooks/useThemeColors';
import { FontSize, LineHeight, Spacing, BorderRadius } from '../constants/theme';
import { useSettingsStore } from '../store/useSettingsStore';
import { askAI } from '../services/claude';
import { sanitizeAIQuery } from '../services/validation';

type AIChatMessage = { role: 'user' | 'assistant'; content: string };

export function GlobalAIButton() {
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const canAI = useSettingsStore((st) => st.canUseAI());
  const isPro = useSettingsStore((st) => st.isPro());
  const incrementAIQuery = useSettingsStore((st) => st.incrementAIQuery);

  const [visible, setVisible] = useState(false);
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading || !canAI) return;
    const userMsg = sanitizeAIQuery(input);
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);
    incrementAIQuery();
    try {
      const context = '宅建試験の学習に関する質問です。ユーザーの疑問に丁寧に答えてください。法律用語は具体例を交えて分かりやすく説明してください。';
      const history = [...messages, { role: 'user' as const, content: userMsg }];
      const reply = await askAI(context, history);
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `エラーが発生しました: ${e.message || 'AIサービスに接続できません'}` },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [input, loading, canAI, messages]);

  if (!isPro) return null;

  return (
    <>
      {/* フローティングボタン */}
      <Pressable
        style={s.fab}
        onPress={() => setVisible(true)}
      >
        <Text style={s.fabIcon}>🤖</Text>
      </Pressable>

      {/* AIチャットモーダル */}
      <Modal visible={visible} animationType="slide" onRequestClose={() => setVisible(false)}>
        <SafeAreaView style={s.safe}>
          <View style={s.header}>
            <Text style={s.headerTitle}>🤖 AI学習アシスタント</Text>
            <Pressable onPress={() => setVisible(false)} hitSlop={12}>
              <Text style={s.close}>✕</Text>
            </Pressable>
          </View>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            <ScrollView
              ref={scrollRef}
              style={s.chat}
              contentContainerStyle={s.chatContent}
              onContentSizeChange={() => {
                if (messages.length > 0) scrollRef.current?.scrollToEnd({ animated: true });
              }}
              keyboardShouldPersistTaps="handled"
            >
              {/* ウェルカムメッセージ */}
              {messages.length === 0 && (
                <>
                  <View style={s.welcome}>
                    <Text style={s.welcomeEmoji}>🤖</Text>
                    <Text style={s.welcomeTitle}>宅建AIアシスタント</Text>
                    <Text style={s.welcomeDesc}>
                      宅建試験に関する疑問を何でも聞いてください。{'\n'}
                      法律用語の解説、条文の意味、学習のコツなど。
                    </Text>
                  </View>
                  <View style={s.suggestions}>
                    {[
                      '善意の第三者とは何ですか？',
                      '重要事項説明と37条書面の違いは？',
                      '建ぺい率と容積率を分かりやすく教えて',
                      '今の勉強法で合格できるかアドバイスして',
                    ].map((sug) => (
                      <Pressable key={sug} style={s.suggestionChip} onPress={() => setInput(sug)}>
                        <Text style={s.suggestionText}>{sug}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              {/* メッセージ */}
              {messages.map((msg, i) => (
                <View key={i} style={[s.msg, msg.role === 'user' ? s.msgUser : s.msgAssistant]}>
                  <Text style={[s.msgText, msg.role === 'user' && s.msgTextUser]}>{msg.content}</Text>
                </View>
              ))}
              {loading && (
                <View style={[s.msg, s.msgAssistant]}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              )}
            </ScrollView>

            <View style={s.inputRow}>
              <TextInput
                style={s.input}
                placeholder="宅建について質問..."
                placeholderTextColor={colors.textDisabled}
                value={input}
                onChangeText={setInput}
                multiline
                maxLength={500}
                editable={!loading}
              />
              <Pressable
                style={[s.sendBtn, (!input.trim() || loading || !canAI) && s.sendBtnDisabled]}
                onPress={sendMessage}
                disabled={!input.trim() || loading || !canAI}
              >
                <Text style={s.sendIcon}>↑</Text>
              </Pressable>
            </View>
            {!canAI && (
              <Text style={s.limitText}>本日のAI質問回数の上限に達しました</Text>
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    fab: {
      position: 'absolute',
      bottom: 100,
      right: 20,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 8,
      zIndex: 999,
    },
    fabIcon: { fontSize: 28 },

    safe: { flex: 1, backgroundColor: C.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 12,
      backgroundColor: C.card,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    headerTitle: { fontSize: FontSize.headline, fontWeight: '800', color: C.text },
    close: { fontSize: 22, color: C.textTertiary, padding: 4 },

    chat: { flex: 1 },
    chatContent: { padding: 16, paddingBottom: 10 },

    welcome: { alignItems: 'center', paddingVertical: 30 },
    welcomeEmoji: { fontSize: 48, marginBottom: 12 },
    welcomeTitle: { fontSize: FontSize.title3, fontWeight: '800', color: C.text, marginBottom: 8 },
    welcomeDesc: { fontSize: FontSize.subhead, color: C.textSecondary, textAlign: 'center', lineHeight: LineHeight.body },

    suggestions: { gap: 10, marginBottom: 16 },
    suggestionChip: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: C.border,
    },
    suggestionText: { fontSize: FontSize.subhead, color: C.primary, fontWeight: '600' },

    msg: {
      maxWidth: '85%',
      borderRadius: BorderRadius.lg,
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginBottom: 12,
    },
    msgUser: { alignSelf: 'flex-end', backgroundColor: C.primary },
    msgAssistant: {
      alignSelf: 'flex-start',
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.border,
    },
    msgText: { fontSize: FontSize.subhead, color: C.text, lineHeight: LineHeight.body },
    msgTextUser: { color: C.white },

    inputRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 12,
      borderTopWidth: 1,
      borderTopColor: C.border,
      backgroundColor: C.card,
    },
    input: {
      flex: 1,
      backgroundColor: C.background,
      borderRadius: BorderRadius.lg,
      paddingHorizontal: 18,
      paddingVertical: 14,
      fontSize: FontSize.body,
      color: C.text,
      minHeight: 52,
      maxHeight: 140,
      borderWidth: 1,
      borderColor: C.border,
      lineHeight: LineHeight.body,
    },
    sendBtn: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendBtnDisabled: { backgroundColor: C.borderLight },
    sendIcon: { fontSize: 20, fontWeight: '800', color: C.white },
    limitText: {
      textAlign: 'center',
      fontSize: FontSize.caption2,
      color: C.error,
      paddingBottom: 12,
      backgroundColor: C.card,
    },
  });
}
