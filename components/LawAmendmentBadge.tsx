// ============================================================
// 法改正バッジ & 鮮度表示コンポーネント
// 問題画面で法改正の関連情報や鮮度警告を表示
// ============================================================

import { useState, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, ScrollView } from 'react-native';
import {
  checkQuestionFreshness,
  getRelatedAmendments,
  type QuestionFreshness,
} from '../data/lawAmendments';
import type { Question, LawAmendment } from '../types';

interface Props {
  question: Question;
}

export function LawAmendmentBadge({ question }: Props) {
  const [modalVisible, setModalVisible] = useState(false);

  const freshness = useMemo(
    () =>
      checkQuestionFreshness({
        lastVerifiedAt: question.lastVerifiedAt,
        expiresAt: question.expiresAt,
        needsReview: question.needsReview,
      }),
    [question],
  );

  const relatedAmendments = useMemo(
    () => getRelatedAmendments(question.tags),
    [question.tags],
  );

  // 法改正に関連しない & 鮮度問題なし → 何も表示しない
  if (relatedAmendments.length === 0 && freshness === 'fresh') return null;

  const badgeConfig = getBadgeConfig(freshness, relatedAmendments);

  return (
    <>
      <Pressable
        style={[s.badge, { backgroundColor: badgeConfig.bgColor }]}
        onPress={() => setModalVisible(true)}
        accessibilityRole="button"
        accessibilityLabel={badgeConfig.accessibilityLabel}
      >
        <Text style={s.badgeIcon}>{badgeConfig.icon}</Text>
        <Text style={[s.badgeText, { color: badgeConfig.textColor }]}>
          {badgeConfig.label}
        </Text>
      </Pressable>

      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>法改正情報</Text>
            <Pressable onPress={() => setModalVisible(false)} accessibilityRole="button" accessibilityLabel="閉じる">
              <Text style={s.modalClose}>閉じる</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={s.modalBody}>
            {/* 鮮度警告 */}
            {freshness !== 'fresh' && (
              <View style={[s.warningBox, { backgroundColor: getWarningColor(freshness) }]}>
                <Text style={s.warningIcon}>{getWarningIcon(freshness)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.warningTitle}>{getWarningTitle(freshness)}</Text>
                  <Text style={s.warningText}>{getWarningText(freshness, question)}</Text>
                </View>
              </View>
            )}

            {/* 検証情報 */}
            {question.lastVerifiedAt && (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>最終検証日</Text>
                <Text style={s.infoValue}>
                  {new Date(question.lastVerifiedAt).toLocaleDateString('ja-JP')}
                </Text>
              </View>
            )}
            {question.sourceExamYear && (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>出題元</Text>
                <Text style={s.infoValue}>令和{question.sourceExamYear - 2018}年度本試験</Text>
              </View>
            )}
            {question.lawEffectiveFrom && (
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>適用法令</Text>
                <Text style={s.infoValue}>{question.lawEffectiveFrom} 施行法に基づく</Text>
              </View>
            )}

            {/* 関連法改正 */}
            {relatedAmendments.length > 0 && (
              <>
                <Text style={s.sectionTitle}>関連する法改正</Text>
                {relatedAmendments.map((a) => (
                  <AmendmentCard key={a.id} amendment={a} />
                ))}
              </>
            )}

            {/* 注意書き */}
            <View style={s.disclaimer}>
              <Text style={s.disclaimerText}>
                問題の内容に誤りや法改正の未反映を発見された場合は、
                問題画面の「報告」ボタンからお知らせください。
                速やかに確認・修正いたします。
              </Text>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

function AmendmentCard({ amendment }: { amendment: LawAmendment }) {
  const impactColor =
    amendment.examImpact === 'high' ? '#D32F2F' :
    amendment.examImpact === 'medium' ? '#F57C00' : '#757575';
  const impactLabel =
    amendment.examImpact === 'high' ? '重要度: 高' :
    amendment.examImpact === 'medium' ? '重要度: 中' : '重要度: 低';

  return (
    <View style={s.amendCard}>
      <View style={s.amendHeader}>
        <Text style={s.amendName}>{amendment.lawName}</Text>
        <View style={[s.impactBadge, { backgroundColor: impactColor + '18' }]}>
          <Text style={[s.impactText, { color: impactColor }]}>{impactLabel}</Text>
        </View>
      </View>
      <Text style={s.amendDate}>
        施行日: {new Date(amendment.effectiveDate).toLocaleDateString('ja-JP')}
      </Text>
      <Text style={s.amendSummary}>{amendment.summary}</Text>
    </View>
  );
}

// ── ヘルパー関数 ──

function getBadgeConfig(
  freshness: QuestionFreshness,
  amendments: LawAmendment[],
) {
  if (freshness === 'expired') {
    return {
      icon: '⚠️', label: '要確認',
      bgColor: '#FFF3E0', textColor: '#E65100',
      accessibilityLabel: 'この問題は特例期限切れの可能性があります。タップで詳細を確認',
    };
  }
  if (freshness === 'flagged') {
    return {
      icon: '🔍', label: 'レビュー中',
      bgColor: '#FFF9C4', textColor: '#F57F17',
      accessibilityLabel: 'この問題は現在レビュー中です。タップで詳細を確認',
    };
  }
  if (freshness === 'aging') {
    return {
      icon: '📅', label: '要再検証',
      bgColor: '#FFF3E0', textColor: '#EF6C00',
      accessibilityLabel: 'この問題は検証から1年以上経過しています。タップで詳細を確認',
    };
  }
  // fresh but has amendments
  const highImpact = amendments.some((a) => a.examImpact === 'high');
  return {
    icon: '📋', label: highImpact ? '法改正あり' : '法改正情報',
    bgColor: highImpact ? '#E3F2FD' : '#F3E5F5',
    textColor: highImpact ? '#1565C0' : '#7B1FA2',
    accessibilityLabel: '関連する法改正情報があります。タップで詳細を確認',
  };
}

function getWarningColor(freshness: QuestionFreshness): string {
  if (freshness === 'expired') return '#FBE9E7';
  if (freshness === 'flagged') return '#FFF9C4';
  return '#FFF3E0';
}

function getWarningIcon(freshness: QuestionFreshness): string {
  if (freshness === 'expired') return '⚠️';
  if (freshness === 'flagged') return '🔍';
  return '📅';
}

function getWarningTitle(freshness: QuestionFreshness): string {
  if (freshness === 'expired') return '特例期限切れの可能性';
  if (freshness === 'flagged') return 'レビュー中の問題';
  return '検証から時間が経過';
}

function getWarningText(freshness: QuestionFreshness, question: Question): string {
  if (freshness === 'expired') {
    return `この問題に含まれる特例措置の期限（${question.expiresAt}）が過ぎている可能性があります。最新の法令を確認してください。`;
  }
  if (freshness === 'flagged') {
    return question.reviewReason ?? 'この問題は現在、内容の正確性を確認中です。';
  }
  return '最終検証から1年以上経過しています。法改正により内容が変わっている可能性があります。';
}

// ── スタイル ──

const s = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginBottom: 8,
    gap: 4,
  },
  badgeIcon: { fontSize: 12 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  modal: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#1a1a2e' },
  modalClose: { fontSize: 15, color: '#1B5E20', fontWeight: '600' },
  modalBody: { padding: 20, paddingBottom: 60 },

  warningBox: {
    flexDirection: 'row',
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
    gap: 10,
  },
  warningIcon: { fontSize: 20 },
  warningTitle: { fontSize: 14, fontWeight: '700', color: '#1a1a2e', marginBottom: 4 },
  warningText: { fontSize: 12, lineHeight: 18, color: '#555' },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  infoLabel: { fontSize: 13, color: '#888' },
  infoValue: { fontSize: 13, fontWeight: '600', color: '#1a1a2e' },

  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a2e',
    marginTop: 24,
    marginBottom: 12,
  },

  amendCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  amendHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  amendName: { fontSize: 14, fontWeight: '700', color: '#1a1a2e', flex: 1 },
  impactBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  impactText: { fontSize: 10, fontWeight: '700' },
  amendDate: { fontSize: 11, color: '#888', marginBottom: 6 },
  amendSummary: { fontSize: 12, lineHeight: 18, color: '#555' },

  disclaimer: {
    marginTop: 24,
    padding: 14,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
  },
  disclaimerText: { fontSize: 11, lineHeight: 18, color: '#888' },
});
