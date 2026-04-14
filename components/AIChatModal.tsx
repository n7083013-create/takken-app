// ============================================================
// 共通AIチャットモーダル（問題画面共通で使える軽量版）
// ============================================================

import { useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { FontSize, Spacing, BorderRadius } from '../constants/theme';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';
import { useSettingsStore } from '../store/useSettingsStore';
import { askAI } from '../services/claude';
import { sanitizeAIQuery } from '../services/validation';
import { CATEGORY_LABELS, type Category } from '../types';

type AIChatMessage = { role: 'user' | 'assistant'; content: string };

interface AIChatModalProps {
  visible: boolean;
  onClose: () => void;
  /** 問題テキスト */
  questionText: string;
  /** 選択肢 */
  choices: string[];
  /** 正解のインデックス */
  correctIndex: number;
  /** ユーザーが選んだインデックス */
  selectedIndex: number | null;
  /** カテゴリ */
  category: Category;
  /** 解説テキスト */
  explanation: string;
  /** 正解したか */
  isCorrect: boolean;
}

const LABELS = ['A', 'B', 'C', 'D'] as const;

function buildContext(props: AIChatModalProps): string {
  const lines = [
    `【宅建試験問題】`,
    `カテゴリ: ${CATEGORY_LABELS[props.category]}`,
    `問題: ${props.questionText}`,
    '',
    ...props.choices.map((c, i) => `${LABELS[i]}. ${c}${i === props.correctIndex ? ' ← 正解' : ''}`),
    '',
    `ユーザーの回答: ${props.selectedIndex !== null ? LABELS[props.selectedIndex] : '未回答'} (${props.isCorrect ? '正解' : '不正解'})`,
    '',
    `解説: ${props.explanation}`,
  ];
  return lines.join('\n');
}

export function AIChatModal(props: AIChatModalProps) {
  const { visible, onClose } = props;
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const canAI = useSettingsStore((st) => st.canUseAI());
  const incrementAIQuery = useSettingsStore((st) => st.incrementAIQuery);

  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const handleSend = useCallback(async () => {
    if (!input.trim() || loading || !canAI) return;

    const userMsg = sanitizeAIQuery(input.trim());
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);
    incrementAIQuery();

    try {
      const context = buildContext(props);
      const history = [...messages, { role: 'user' as const, content: userMsg }];
      const reply = await askAI(context, history);
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `エラー: ${e.message || 'AI接続エラー'}` },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [input, loading, canAI, messages, props]);

  const handleClose = useCallback(() => {
    setMessages([]);
    setInput('');
    onClose();
  }, [onClose]);

  const suggestions = [
    'この問題をわかりやすく説明して',
    '正解の理由を詳しく教えて',
    '具体例で説明して',
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>🤖 AIに質問</Text>
          <Pressable onPress={handleClose} hitSlop={12}>
            <Text style={s.closeBtn}>✕</Text>
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
            {/* 問題コンテキスト */}
            <View style={s.contextCard}>
              <Text style={s.contextLabel}>📋 この問題について</Text>
              <Text style={s.contextText} numberOfLines={3}>{props.questionText}</Text>
              <View style={s.contextResult}>
                <Text style={[s.contextResultText, { color: props.isCorrect ? colors.success : colors.error }]}>
                  {props.isCorrect ? '✓ 正解' : '✗ 不正解'}
                </Text>
              </View>
            </View>

            {/* サジェスチョン */}
            {messages.length === 0 && (
              <View style={s.suggestions}>
                {suggestions.map((sug) => (
                  <Pressable key={sug} style={s.sugChip} onPress={() => setInput(sug)}>
                    <Text style={s.sugText}>{sug}</Text>
                  </Pressable>
                ))}
              </View>
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

          {/* 入力 */}
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              placeholder="質問を入力..."
              placeholderTextColor={colors.textDisabled}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={handleSend}
            />
            <Pressable
              style={[s.sendBtn, (!input.trim() || loading || !canAI) && s.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!input.trim() || loading || !canAI}
            >
              <Text style={s.sendIcon}>↑</Text>
            </Pressable>
          </View>
          {!canAI && (
            <Text style={s.limitText}>本日のAI質問回数の上限に達しました</Text>
          )}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: Spacing.xl,
      paddingVertical: 14,
      borderBottomWidth: 0.5,
      borderBottomColor: C.borderLight,
      backgroundColor: C.card,
    },
    headerTitle: { fontSize: FontSize.headline, fontWeight: '700', color: C.text },
    closeBtn: { fontSize: 20, color: C.textTertiary, fontWeight: '600', padding: 4 },

    chat: { flex: 1 },
    chatContent: { padding: Spacing.lg, paddingBottom: 20 },

    contextCard: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      padding: Spacing.lg,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: Spacing.lg,
    },
    contextLabel: { fontSize: FontSize.caption, fontWeight: '700', color: C.textSecondary, marginBottom: 6 },
    contextText: { fontSize: FontSize.subhead, color: C.text, lineHeight: 22 },
    contextResult: { marginTop: 8 },
    contextResultText: { fontSize: FontSize.caption, fontWeight: '800' },

    suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.lg },
    sugChip: {
      backgroundColor: C.primarySurface,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      borderColor: C.primary + '30',
    },
    sugText: { fontSize: FontSize.caption, color: C.primary, fontWeight: '600' },

    msg: {
      maxWidth: '85%',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: BorderRadius.lg,
      marginBottom: 10,
    },
    msgUser: {
      alignSelf: 'flex-end',
      backgroundColor: C.primary,
      borderBottomRightRadius: 4,
    },
    msgAssistant: {
      alignSelf: 'flex-start',
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.borderLight,
      borderBottomLeftRadius: 4,
    },
    msgText: { fontSize: FontSize.subhead, color: C.text, lineHeight: 22 },
    msgTextUser: { color: C.white },

    inputRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm,
      borderTopWidth: 0.5,
      borderTopColor: C.borderLight,
      backgroundColor: C.card,
      gap: 8,
    },
    input: {
      flex: 1,
      backgroundColor: C.background,
      borderRadius: BorderRadius.lg,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: FontSize.subhead,
      color: C.text,
      maxHeight: 80,
      borderWidth: 1,
      borderColor: C.border,
    },
    sendBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendBtnDisabled: { opacity: 0.4 },
    sendIcon: { fontSize: 18, fontWeight: '800', color: C.white },
    limitText: {
      textAlign: 'center',
      fontSize: FontSize.caption2,
      color: C.error,
      paddingBottom: 6,
    },
  });
}
