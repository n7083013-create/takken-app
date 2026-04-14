// ============================================================
// 問題誤り報告モーダル
// ============================================================

import { useState, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Shadow } from '../constants/theme';
import { useThemeColors, ThemeColors } from '../hooks/useThemeColors';
import {
  useReportStore,
  ReportReason,
  REPORT_REASON_LABELS,
} from '../store/useReportStore';
import { sanitizeReportText } from '../services/validation';

interface Props {
  visible: boolean;
  questionId: string;
  onClose: () => void;
}

const REASONS: ReportReason[] = ['wrong_answer', 'typo', 'unclear', 'outdated', 'other'];

export function ReportModal({ visible, questionId, onClose }: Props) {
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const addReport = useReportStore((s) => s.addReport);
  const [reason, setReason] = useState<ReportReason>('wrong_answer');
  const [detail, setDetail] = useState('');

  const handleSubmit = () => {
    addReport(questionId, reason, sanitizeReportText(detail));
    setDetail('');
    setReason('wrong_answer');
    Alert.alert(
      'ご報告ありがとうございます',
      '内容を確認のうえ修正いたします。今後とも宜しくお願いします。',
      [{ text: 'OK', onPress: onClose }],
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={s.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={s.backdropPress} onPress={onClose} />
        <View style={[s.sheet, Shadow.xl]}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={s.handle} />
            <Text style={s.title}>この問題を報告</Text>
            <Text style={s.sub}>
              問題ID: {questionId}
            </Text>

            <Text style={s.sectionLabel}>報告理由</Text>
            {REASONS.map((r) => (
              <Pressable
                key={r}
                style={[s.reasonRow, reason === r && s.reasonRowSelected]}
                onPress={() => setReason(r)}
              >
                <View style={[s.radio, reason === r && s.radioSelected]} />
                <Text style={s.reasonLabel}>{REPORT_REASON_LABELS[r]}</Text>
              </Pressable>
            ))}

            <Text style={s.sectionLabel}>詳細（任意）</Text>
            <TextInput
              style={s.input}
              value={detail}
              onChangeText={setDetail}
              placeholder="どの部分に問題があるか教えてください"
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <View style={s.btnRow}>
              <Pressable style={[s.btn, s.btnCancel]} onPress={onClose}>
                <Text style={s.btnCancelText}>キャンセル</Text>
              </Pressable>
              <Pressable style={[s.btn, s.btnSubmit]} onPress={handleSubmit}>
                <Text style={s.btnSubmitText}>送信</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    backdropPress: { flex: 1 },
    sheet: {
      backgroundColor: C.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      maxHeight: '85%',
    },
    handle: {
      width: 40,
      height: 4,
      backgroundColor: C.border,
      borderRadius: 2,
      alignSelf: 'center',
      marginBottom: 16,
    },
    title: { fontSize: 18, fontWeight: '800', color: C.text },
    sub: { fontSize: 12, color: C.textSecondary, marginTop: 4, marginBottom: 20 },
    sectionLabel: { fontSize: 13, fontWeight: '700', color: C.text, marginTop: 12, marginBottom: 8 },
    reasonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      borderRadius: 10,
      backgroundColor: C.background,
      marginBottom: 6,
    },
    reasonRowSelected: { backgroundColor: C.primarySurface },
    radio: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: C.textTertiary,
      marginRight: 10,
    },
    radioSelected: { borderColor: C.primary, backgroundColor: C.primary },
    reasonLabel: { fontSize: 14, color: C.text, flex: 1 },
    input: {
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 10,
      padding: 12,
      fontSize: 14,
      color: C.text,
      minHeight: 90,
      backgroundColor: C.background,
    },
    btnRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
    btn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    btnCancel: { backgroundColor: C.background },
    btnCancelText: { fontSize: 15, fontWeight: '700', color: C.textSecondary },
    btnSubmit: { backgroundColor: C.primary },
    btnSubmitText: { fontSize: 15, fontWeight: '800', color: C.white },
  });
}
