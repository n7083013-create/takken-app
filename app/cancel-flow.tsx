// ============================================================
// 解約防止フロー (Cancellation Save Flow)
// ============================================================
//
// 世界基準 (Spotify / Netflix / NYT / Audible) のパターン:
//   Step 1: 解約理由を選んでもらう (6 種類)
//   Step 2: 理由別 counter-offer を提示
//          受け入れ → 解約せず終了 (offer 適用)
//          断り    → Step 3 へ
//   Step 3: 最終確認 (loss aversion で「失うもの」明示)
//          確定    → 実際の解約 API を呼ぶ
//
// 文言・offer ロジックは utils/cancellationCopy.ts に純関数として切り出し済み。
// 分析イベントは services/analytics.ts の 5 イベントで funnel 化:
//   cancel_flow_started → reason_selected → offer_accepted | offer_declined
//   → cancel_flow_completed (実解約)

import { useState, useMemo, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { FontSize, LineHeight, Spacing, BorderRadius, Shadow } from '../constants/theme';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';
import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { trackEvent } from '../services/analytics';
import { confirmAlert, infoAlert } from '../services/alert';
import { API_BASE_URL } from '../constants/config';
import { WebBackButton } from '../components/WebBackButton';
import {
  REASON_CHOICES,
  getCounterOffer,
  getFinalConfirmCopy,
  offerEventLabel,
  type CancellationReason,
  type OfferType,
} from '../utils/cancellationCopy';

type Step = 'reason' | 'offer' | 'final';

export default function CancelFlowScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const session = useAuthStore((st) => st.session);
  const verifySubscription = useSettingsStore((st) => st.verifySubscription);

  const [step, setStep] = useState<Step>('reason');
  const [reason, setReason] = useState<CancellationReason | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // セッション開始イベント (初回マウント)
  const [funnelStarted, setFunnelStarted] = useState(false);
  if (!funnelStarted) {
    trackEvent('cancel_flow_started');
    setFunnelStarted(true);
  }

  const offer = useMemo(() => (reason ? getCounterOffer(reason) : null), [reason]);
  const finalCopy = useMemo(() => getFinalConfirmCopy(), []);

  // ----------------------------------------------------------
  // Step 1: 理由選択 → 「次へ」で Step 2
  // ----------------------------------------------------------
  const handleReasonNext = useCallback(() => {
    if (!reason) return;
    trackEvent('cancel_flow_reason_selected', { custom_label: reason });
    setStep('offer');
  }, [reason]);

  // ----------------------------------------------------------
  // Step 2a: offer を受け入れる → 適用処理 (またはサポート誘導) → 閉じる
  // ----------------------------------------------------------
  const handleAcceptOffer = useCallback(async () => {
    if (!offer || !reason) return;
    trackEvent('cancel_flow_offer_accepted', {
      custom_label: offerEventLabel(offer.offerType),
    });

    // [MVP] 自動適用は未実装 (PayPal subscription modification API 連携が別途必要)。
    // 当面は「申請を受け付けた」UI 表示 + サーバー側の管理者通知メールに集約。
    // 後続 PR で half_price / pause を PayPal API で自動化する。
    const message = getOfferAcceptedMessage(offer.offerType);
    await infoAlert('お申し込みを受け付けました', message);

    // 「要望を伝える」だけは feedback ページへ誘導
    if (offer.offerType === 'support_form') {
      router.replace('/feedback' as any);
      return;
    }
    router.back();
  }, [offer, reason, router]);

  // ----------------------------------------------------------
  // Step 2b: offer を断る → Step 3 (最終確認)
  // ----------------------------------------------------------
  const handleDeclineOffer = useCallback(() => {
    if (!offer) return;
    trackEvent('cancel_flow_offer_declined', {
      custom_label: offerEventLabel(offer.offerType),
    });
    setStep('final');
  }, [offer]);

  // ----------------------------------------------------------
  // Step 3: 実際に解約 API を呼ぶ
  // ----------------------------------------------------------
  const handleFinalCancel = useCallback(async () => {
    if (!session?.access_token) {
      await infoAlert('ログインが必要です', '解約するにはログインしてください。');
      return;
    }

    const confirmed = await confirmAlert(
      'サブスクリプションを解約しますか？',
      '✓ 次回更新日まで全機能を引き続きご利用いただけます\n✓ 違約金・解約手数料は一切かかりません\n✓ 学習データは保持されます',
      { okText: '解約する', cancelText: 'やめる', destructive: true },
    );
    if (!confirmed) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/paypal/cancel-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await infoAlert(
          '解約に失敗しました',
          data.error || '時間をおいて再度お試しください。問題が続く場合はお問い合わせください。',
        );
        return;
      }
      trackEvent('cancel_flow_completed', { custom_label: reason ?? 'unknown' });
      trackEvent('subscribe_cancel'); // 既存イベントも互換のため発火
      await verifySubscription(session.access_token);
      await infoAlert(
        '解約が完了しました',
        data.message || '次回更新日まで引き続きご利用いただけます。ご利用ありがとうございました。',
      );
      router.back();
    } catch {
      await infoAlert('エラー', '通信エラーが発生しました。時間をおいて再度お試しください。');
    } finally {
      setSubmitting(false);
    }
  }, [session, verifySubscription, reason, router]);

  // ----------------------------------------------------------
  // Render
  // ----------------------------------------------------------
  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen options={{ title: '解約手続き' }} />
      <WebBackButton />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {step === 'reason' && (
          <View>
            <Text style={s.heroTitle}>解約される前に教えてください</Text>
            <Text style={s.heroSubtitle}>
              理由に応じて、最適な選択肢をご提案します。{'\n'}
              すぐに解約手続きにも進めます。
            </Text>

            <View style={s.choices}>
              {REASON_CHOICES.map((c) => {
                const selected = reason === c.reason;
                return (
                  <Pressable
                    key={c.reason}
                    style={[s.choice, selected && s.choiceSelected, Shadow.sm]}
                    onPress={() => setReason(c.reason)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${c.label}: ${c.description ?? ''}`}
                  >
                    <Text style={s.choiceEmoji}>{c.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.choiceLabel, selected && s.choiceLabelSelected]}>
                        {c.label}
                      </Text>
                      {c.description && (
                        <Text style={s.choiceDesc}>{c.description}</Text>
                      )}
                    </View>
                    <View style={[s.radio, selected && s.radioSelected]}>
                      {selected && <View style={s.radioInner} />}
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              style={[s.primaryBtn, !reason && s.primaryBtnDisabled, Shadow.md]}
              onPress={handleReasonNext}
              disabled={!reason}
              accessibilityRole="button"
              accessibilityLabel="次へ"
            >
              <Text style={s.primaryBtnText}>次へ</Text>
            </Pressable>

            <Pressable style={s.secondaryBtn} onPress={() => router.back()}>
              <Text style={s.secondaryBtnText}>キャンセル (画面を閉じる)</Text>
            </Pressable>
          </View>
        )}

        {step === 'offer' && offer && (
          <View>
            <Text style={s.offerEmoji}>{offer.emoji}</Text>
            <Text style={s.heroTitle}>{offer.title}</Text>
            <Text style={s.heroSubtitle}>{offer.subtitle}</Text>

            <Pressable
              style={[s.primaryBtn, Shadow.md]}
              onPress={handleAcceptOffer}
              accessibilityRole="button"
              accessibilityLabel={offer.acceptCta}
            >
              <Text style={s.primaryBtnText}>{offer.acceptCta}</Text>
            </Pressable>

            <Pressable
              style={s.secondaryBtn}
              onPress={handleDeclineOffer}
              accessibilityRole="button"
              accessibilityLabel={offer.declineCta}
            >
              <Text style={s.declineLink}>{offer.declineCta}</Text>
            </Pressable>
          </View>
        )}

        {step === 'final' && (
          <View>
            <Text style={s.warningEmoji}>⚠️</Text>
            <Text style={s.heroTitle}>{finalCopy.title}</Text>
            <Text style={s.heroSubtitle}>解約すると、以下の機能が使えなくなります:</Text>

            <View style={s.lossList}>
              {finalCopy.losses.map((loss, i) => (
                <View key={i} style={s.lossRow}>
                  <Text style={s.lossBullet}>✕</Text>
                  <Text style={s.lossText}>{loss}</Text>
                </View>
              ))}
            </View>

            {/* iOS は最終的に App Store へ誘導 (App Store ガイドライン準拠) */}
            {Platform.OS === 'ios' ? (
              <>
                <Pressable
                  style={[s.primaryBtn, Shadow.md]}
                  onPress={() => router.back()}
                  accessibilityRole="button"
                >
                  <Text style={s.primaryBtnText}>{finalCopy.primaryCta}</Text>
                </Pressable>
                <Text style={s.iosNote}>
                  iOS の解約手続きは「設定」アプリの Apple ID → サブスクリプション から行ってください。
                </Text>
              </>
            ) : (
              <>
                <Pressable
                  style={[s.primaryBtn, Shadow.md]}
                  onPress={() => router.back()}
                  accessibilityRole="button"
                  accessibilityLabel={finalCopy.primaryCta}
                >
                  <Text style={s.primaryBtnText}>{finalCopy.primaryCta}</Text>
                </Pressable>

                <Pressable
                  style={[s.dangerBtn, submitting && s.dangerBtnDisabled]}
                  onPress={handleFinalCancel}
                  disabled={submitting}
                  accessibilityRole="button"
                  accessibilityLabel={finalCopy.secondaryCta}
                >
                  <Text style={s.dangerBtnText}>
                    {submitting ? '処理中...' : finalCopy.secondaryCta}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * offer を受け入れた時に表示するメッセージ。
 * MVP では自動適用ではなく「申請受付」表示。後続で自動化予定。
 */
function getOfferAcceptedMessage(offerType: OfferType): string {
  switch (offerType) {
    case 'half_price_one_month':
      return '次回更新時に半額（¥490）を適用します。\n適用には数日かかる場合があります。';
    case 'pause_subscription':
      return '次の試験 (10月) まで一時停止の手続きを承りました。\n再開のご案内を試験前にお送りします。';
    case 'free_extension_30days':
      return '30日間の無料延長を適用します。\n来年に向けて、無理なく続けていきましょう。';
    case 'pause_short':
      return '1〜3ヶ月の一時停止を承りました。\n再開したい時はメールでお知らせください。';
    case 'support_form':
      return 'ご要望をお聞かせください。優先的に検討します。';
    case 'no_offer':
    default:
      return '解約手続きをキャンセルしました。引き続きご利用いただけます。';
  }
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.background },
    scroll: {
      flexGrow: 1,
      padding: Spacing.xxl,
      justifyContent: 'flex-start',
    },
    heroTitle: {
      fontSize: FontSize.title3,
      fontWeight: '800',
      color: C.text,
      textAlign: 'center',
      marginBottom: Spacing.md,
      lineHeight: LineHeight.title3,
    },
    heroSubtitle: {
      fontSize: FontSize.footnote,
      color: C.textSecondary,
      textAlign: 'center',
      lineHeight: LineHeight.footnote,
      marginBottom: Spacing.xxl,
    },
    choices: { gap: Spacing.sm, marginBottom: Spacing.xxl },
    choice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      backgroundColor: C.card,
      padding: Spacing.lg,
      borderRadius: BorderRadius.lg,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    choiceSelected: {
      borderColor: C.primary,
      backgroundColor: C.primarySurface,
    },
    choiceEmoji: { fontSize: 28 },
    choiceLabel: { fontSize: FontSize.subhead, fontWeight: '700', color: C.text },
    choiceLabelSelected: { color: C.primary },
    choiceDesc: {
      fontSize: FontSize.caption,
      color: C.textSecondary,
      marginTop: 2,
      lineHeight: 16,
    },
    radio: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: C.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioSelected: { borderColor: C.primary },
    radioInner: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: C.primary,
    },
    primaryBtn: {
      backgroundColor: C.primary,
      paddingHorizontal: Spacing.xxl,
      paddingVertical: Spacing.lg,
      borderRadius: BorderRadius.lg,
      alignItems: 'center',
      marginBottom: Spacing.md,
    },
    primaryBtnDisabled: { opacity: 0.5 },
    primaryBtnText: { color: C.white, fontSize: FontSize.subhead, fontWeight: '800' },
    secondaryBtn: {
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      alignItems: 'center',
    },
    secondaryBtnText: {
      color: C.textSecondary,
      fontSize: FontSize.footnote,
      fontWeight: '600',
    },
    declineLink: {
      color: C.textTertiary,
      fontSize: FontSize.footnote,
      fontWeight: '500',
      textDecorationLine: 'underline',
    },
    offerEmoji: {
      fontSize: 64,
      textAlign: 'center',
      marginBottom: Spacing.lg,
    },
    warningEmoji: {
      fontSize: 48,
      textAlign: 'center',
      marginBottom: Spacing.lg,
    },
    lossList: {
      backgroundColor: C.errorSurface,
      padding: Spacing.lg,
      borderRadius: BorderRadius.lg,
      borderLeftWidth: 4,
      borderLeftColor: C.error,
      marginBottom: Spacing.xxl,
      gap: Spacing.sm,
    },
    lossRow: { flexDirection: 'row', gap: Spacing.sm },
    lossBullet: { color: C.error, fontSize: FontSize.footnote, fontWeight: '800' },
    lossText: { color: C.text, fontSize: FontSize.footnote, flex: 1, lineHeight: 20 },
    dangerBtn: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: C.error,
      paddingHorizontal: Spacing.xxl,
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.lg,
      alignItems: 'center',
      marginTop: Spacing.sm,
    },
    dangerBtnDisabled: { opacity: 0.5 },
    dangerBtnText: { color: C.error, fontSize: FontSize.footnote, fontWeight: '700' },
    iosNote: {
      fontSize: FontSize.caption,
      color: C.textTertiary,
      textAlign: 'center',
      marginTop: Spacing.md,
      lineHeight: 16,
    },
  });
}
