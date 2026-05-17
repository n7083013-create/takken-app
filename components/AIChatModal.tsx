// ============================================================
// 共通AIチャットモーダル（問題画面共通で使える軽量版・音声入力対応）
// ============================================================

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
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
  useWindowDimensions,
} from 'react-native';
import { FontSize, Spacing, BorderRadius } from '../constants/theme';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';
import { useSettingsStore } from '../store/useSettingsStore';
import { askAI } from '../services/claude';
import { sanitizeAIQuery } from '../services/validation';
import { CATEGORY_LABELS, type Category } from '../types';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';

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
  // [UX改善] PC (>=768px) では全画面 Modal を使わず、右側フローティングパネル表示
  // ユーザー報告:「PCでAI質問するときは全画面で表示させるのやめてほしい。戻ったり消したり手間」
  const { width: screenWidth } = useWindowDimensions();
  const isWideScreen = screenWidth >= 768;
  const canAI = useSettingsStore((st) => st.canUseAI());
  const setAIRemainingFromServer = useSettingsStore((st) => st.setAIRemainingFromServer);

  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // 音声認識
  const { isListening, transcript, startListening, stopListening, isAvailable: micAvailable, error: micError } =
    useSpeechRecognition();

  // 音声認識結果をテキスト入力に反映
  useEffect(() => {
    if (transcript) {
      setInput(transcript);
    }
  }, [transcript]);

  // モーダルを閉じたらマイクを停止
  useEffect(() => {
    if (!visible && isListening) {
      stopListening();
    }
  }, [visible, isListening, stopListening]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || loading || !canAI) return;

    const userMsg = sanitizeAIQuery(input.trim());
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const context = buildContext(props);
      const history = [...messages, { role: 'user' as const, content: userMsg }];
      const result = await askAI(context, history);
      // サーバー側の使用量を真値として反映（ローカル増分はしない）
      if (result.remaining !== null) {
        setAIRemainingFromServer(result.remaining);
      }
      setMessages((prev) => [...prev, { role: 'assistant', content: result.text }]);
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
    if (isListening) stopListening();
    onClose();
  }, [onClose, isListening, stopListening]);

  /** マイクボタン */
  const handleMic = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  const suggestions = [
    'この問題の意味がわからない',
    '具体例でイメージしやすく教えて',
    'なぜこれが正解なの？',
    '間違えやすいポイントは？',
  ];

  // PC では transparent + フローティングパネル、モバイルでは pageSheet で全画面表示
  const modalProps = isWideScreen
    ? { transparent: true as const, animationType: 'fade' as const }
    : { animationType: 'slide' as const, presentationStyle: 'pageSheet' as const };

  return (
    <Modal visible={visible} {...modalProps} onRequestClose={handleClose}>
      {isWideScreen && (
        <Pressable style={s.pcBackdrop} onPress={handleClose} accessibilityLabel="閉じる" />
      )}
      <View style={isWideScreen ? s.pcPanel : s.container}>
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

          {/* 音声認識中インジケーター */}
          {isListening && (
            <View style={s.listeningBar}>
              <Text style={s.listeningDot}>🔴</Text>
              <Text style={s.listeningText}>音声入力中...</Text>
              <Pressable onPress={stopListening} style={s.listeningStop}>
                <Text style={s.listeningStopText}>停止</Text>
              </Pressable>
            </View>
          )}

          {/* マイクエラー */}
          {micError && (
            <View style={s.micErrorBar}>
              <Text style={s.micErrorText}>{micError}</Text>
            </View>
          )}

          {/* 入力 */}
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              placeholder={isListening ? '話してください...' : '質問を入力...'}
              placeholderTextColor={colors.textDisabled}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={handleSend}
            />
            {/* マイクボタン */}
            {micAvailable && (
              <Pressable
                style={[s.micBtn, isListening && s.micBtnActive]}
                onPress={handleMic}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel={isListening ? '音声入力を停止' : '音声入力を開始'}
              >
                <Text style={s.micIcon}>{isListening ? '⏹' : '🎤'}</Text>
              </Pressable>
            )}
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
    // [UX改善] PC 向けフローティングパネル (画面右下)
    pcBackdrop: {
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.25)',
    },
    pcPanel: {
      position: 'absolute',
      top: 24,
      right: 24,
      bottom: 24,
      width: 440,
      maxWidth: '50%',
      backgroundColor: C.background,
      borderRadius: 16,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.25,
      shadowRadius: 24,
      elevation: 12,
    },
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
    headerTitle: { fontSize: FontSize.subhead, fontWeight: '700', color: C.text },
    closeBtn: { fontSize: 18, color: C.textTertiary, fontWeight: '600', padding: 4 },

    chat: { flex: 1 },
    chatContent: { padding: 14, paddingBottom: 16 },

    contextCard: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      padding: Spacing.md,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: Spacing.md,
    },
    contextLabel: { fontSize: FontSize.caption2, fontWeight: '700', color: C.textSecondary, marginBottom: 4 },
    contextText: { fontSize: FontSize.caption, color: C.text, lineHeight: 19 },
    contextResult: { marginTop: 6 },
    contextResultText: { fontSize: FontSize.caption2, fontWeight: '800' },

    suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: Spacing.md },
    sugChip: {
      backgroundColor: C.primarySurface,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      borderColor: C.primary + '30',
    },
    sugText: { fontSize: FontSize.caption2, color: C.primary, fontWeight: '600' },

    msg: {
      maxWidth: '85%',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: BorderRadius.lg,
      marginBottom: 8,
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
    msgText: { fontSize: FontSize.footnote, color: C.text, lineHeight: 20 },
    msgTextUser: { color: C.white },

    // 音声認識中バー
    listeningBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      paddingHorizontal: 16,
      backgroundColor: C.error + '15',
      gap: 8,
    },
    listeningDot: { fontSize: 10 },
    listeningText: { fontSize: FontSize.caption, fontWeight: '700', color: C.error },
    listeningStop: {
      backgroundColor: C.error + '20',
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: BorderRadius.sm,
    },
    listeningStopText: { fontSize: FontSize.caption2, fontWeight: '700', color: C.error },

    // マイクエラー
    micErrorBar: {
      paddingVertical: 6,
      paddingHorizontal: 16,
      backgroundColor: C.warningSurface,
    },
    micErrorText: { fontSize: FontSize.caption2, color: C.accent, textAlign: 'center' },

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
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: FontSize.subhead,
      color: C.text,
      maxHeight: 160,
      borderWidth: 1,
      borderColor: C.border,
    },
    micBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: C.card,
      borderWidth: 2,
      borderColor: C.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    micBtnActive: {
      backgroundColor: C.error + '20',
      borderColor: C.error,
    },
    micIcon: { fontSize: 18 },
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
