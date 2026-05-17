// ============================================================
// グローバルAIフローティングボタン
// どの画面からでもAIに質問できる（音声入力対応）
// ============================================================

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
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
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, ThemeColors } from '../hooks/useThemeColors';
import { FontSize, LineHeight, Spacing, BorderRadius } from '../constants/theme';
import { useSettingsStore } from '../store/useSettingsStore';
import { AIChatMessage } from '../types';
import { askAI } from '../services/claude';
import { sanitizeAIQuery } from '../services/validation';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';

export function GlobalAIButton() {
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  // [UX改善] PC (>=768px) では全画面 Modal ではなくフローティングパネル
  const { width: screenWidth } = useWindowDimensions();
  const isWideScreen = screenWidth >= 768;

  const canAI = useSettingsStore((st) => st.canUseAI());
  const isPro = useSettingsStore((st) => st.isPro());
  const setAIRemainingFromServer = useSettingsStore((st) => st.setAIRemainingFromServer);

  const [visible, setVisible] = useState(false);
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

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading || !canAI) return;
    const userMsg = sanitizeAIQuery(input);
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);
    try {
      const context = '宅建試験の学習に関する質問です。ユーザーの疑問に丁寧に答えてください。法律用語は具体例を交えて分かりやすく説明してください。';
      const history = [...messages, { role: 'user' as const, content: userMsg }];
      const result = await askAI(context, history);
      if (result.remaining !== null) {
        setAIRemainingFromServer(result.remaining);
      }
      setMessages((prev) => [...prev, { role: 'assistant', content: result.text }]);
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

  /** マイクボタン押下 */
  const handleMic = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

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

      {/* AIチャットモーダル
          - PC (isWideScreen): transparent モーダル + 右側フローティングパネル
          - モバイル: 通常の slide モーダル (全画面) */}
      <Modal
        visible={visible}
        animationType={isWideScreen ? 'fade' : 'slide'}
        transparent={isWideScreen}
        onRequestClose={() => setVisible(false)}
      >
        {isWideScreen && (
          <Pressable
            style={s.pcBackdrop}
            onPress={() => setVisible(false)}
            accessibilityLabel="閉じる"
          />
        )}
        <SafeAreaView
          style={isWideScreen ? s.pcPanel : s.safe}
          edges={isWideScreen ? [] : ['bottom', 'left', 'right']}
        >
          <View style={[s.header, !isWideScreen && { paddingTop: insets.top + 12 }]}>
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
                    <Text style={s.welcomeTitle}>わからないことを聞こう</Text>
                    <Text style={s.welcomeDesc}>
                      問題の意味がわからない、イメージが湧かない...{'\n'}
                      そんなときはAIに気軽に聞いてみてください。
                    </Text>
                    {micAvailable && (
                      <Text style={s.micHint}>🎤 音声でも質問できます</Text>
                    )}
                  </View>
                  <View style={s.suggestions}>
                    {[
                      '「善意の第三者」って何？具体例で教えて',
                      '抵当権をイメージしやすい例で説明して',
                      '35条書面と37条書面、何が違うの？',
                      '用途地域がごちゃごちゃで整理したい',
                      '借地権と借家権の違いを簡単に教えて',
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

            <View style={s.inputRow}>
              <TextInput
                style={s.input}
                placeholder={isListening ? '話してください...' : '宅建について質問...'}
                placeholderTextColor={colors.textDisabled}
                value={input}
                onChangeText={setInput}
                multiline
                maxLength={500}
                editable={!loading}
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
              {/* 送信ボタン */}
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
    // [UX改善] PC 向けフローティングパネル (画面右側に表示)
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
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      // paddingTop は JSX で insets.top + 12 を動的に適用（ステータスバー回避）
      paddingBottom: 12,
      backgroundColor: C.card,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    headerTitle: { fontSize: FontSize.subhead, fontWeight: '800', color: C.text },
    close: { fontSize: 20, color: C.textTertiary, padding: 4 },

    chat: { flex: 1 },
    chatContent: { padding: 14, paddingBottom: 10 },

    welcome: { alignItems: 'center', paddingVertical: 20 },
    welcomeEmoji: { fontSize: 36, marginBottom: 8 },
    welcomeTitle: { fontSize: FontSize.headline, fontWeight: '800', color: C.text, marginBottom: 6 },
    welcomeDesc: { fontSize: FontSize.caption, color: C.textSecondary, textAlign: 'center', lineHeight: 20 },
    micHint: {
      fontSize: FontSize.caption,
      color: C.primary,
      fontWeight: '600',
      marginTop: 12,
      backgroundColor: C.primarySurface,
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: BorderRadius.full,
    },

    suggestions: { gap: 8, marginBottom: 12 },
    suggestionChip: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: C.border,
    },
    suggestionText: { fontSize: FontSize.caption, color: C.primary, fontWeight: '600' },

    msg: {
      maxWidth: '85%',
      borderRadius: BorderRadius.lg,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 10,
    },
    msgUser: { alignSelf: 'flex-end', backgroundColor: C.primary },
    msgAssistant: {
      alignSelf: 'flex-start',
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.border,
    },
    msgText: { fontSize: FontSize.footnote, color: C.text, lineHeight: 21 },
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
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 8,
      borderTopWidth: 1,
      borderTopColor: C.border,
      backgroundColor: C.card,
    },
    input: {
      flex: 1,
      backgroundColor: C.background,
      borderRadius: BorderRadius.lg,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: FontSize.subhead,
      color: C.text,
      minHeight: 44,
      maxHeight: 160,
      borderWidth: 1,
      borderColor: C.border,
      lineHeight: 22,
    },
    micBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
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
    micIcon: { fontSize: 22 },
    sendBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
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
