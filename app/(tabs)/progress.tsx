import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
  Linking,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { confirmAlert, infoAlert } from '../../services/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Shadow, FontSize, LineHeight, LetterSpacing, Spacing, BorderRadius } from '../../constants/theme';
import { CATEGORIES, EXAM_TOTAL, PASS_LINE } from '../../constants/exam';
import { useThemeColors, ThemeColors } from '../../hooks/useThemeColors';
import { useExamPrediction } from '../../hooks/useExamPrediction';
import { usePredictionHistory } from '../../hooks/usePredictionHistory';
import { useHeatmap } from '../../hooks/useHeatmap';
import { PredictionCard } from '../../components/PredictionCard';
import { distributePointsLostToSubcategories, recoverablePoints, type SubcategoryStat } from '../../utils/predictionDisplay';
import { CATEGORY_LABELS, CATEGORY_ICONS, CATEGORY_COLORS, Category } from '../../types';
import { getCategoryStats, ALL_QUESTIONS } from '../../data';
import { useMemo, useState, useCallback } from 'react';
import { useProgressStore } from '../../store/useProgressStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useAchievementStore, ALL_ACHIEVEMENTS } from '../../store/useAchievementStore';
import { useExamStore } from '../../store/useExamStore';
import { APP_VERSION, API_BASE_URL } from '../../constants/config';
import { StudyHeatmap } from '../../components/StudyHeatmap';
import { planLabel as computePlanLabel } from '../../utils/subscriptionLabel';
import { WeeklyEmailToggle } from '../../components/WeeklyEmailToggle';
import {
  requestNotificationPermission,
  scheduleDailyReminder,
  cancelDailyReminder,
  normalizeTime,
  MAX_REMINDER_TIMES,
} from '../../services/notifications';

/** よく使う時刻のワンタップ fill（主役は自由入力・補助） */
const QUICK_TIME_CHIPS = ['07:00', '12:00', '21:00'];

/**
 * 1 行ぶんのカスタム HH:MM 入力。
 * 入力中は親 store に書かずローカル state で編集し、確定(onEndEditing/onBlur)時のみ
 * normalizeTime でクランプ整形して onCommit に渡す（毎キー書き込みでカーソルと喧嘩しない）。
 * 親はクイック chip fill 等で value が変わると key で remount → ローカル state を再初期化する。
 */
function TimeInputRow({
  value,
  canRemove,
  onCommit,
  onRemove,
  styles: t,
  colors,
}: {
  value: string;
  canRemove: boolean;
  onCommit: (next: string) => void;
  onRemove: () => void;
  styles: ReturnType<typeof makeSettingsStyles>;
  colors: ThemeColors;
}) {
  const [hStr, mStr] = value.split(':');
  const [hour, setHour] = useState(hStr ?? '');
  const [minute, setMinute] = useState(mStr ?? '');

  const commit = () => {
    const next = normalizeTime(parseInt(hour, 10), parseInt(minute, 10));
    // 表示をゼロ埋め済みの確定値へ揃える（"9"/"5" → "09"/"05"）
    const [nh, nm] = next.split(':');
    setHour(nh);
    setMinute(nm);
    if (next !== value) onCommit(next); // 同値は no-op（無駄な再スケジュール回避）
  };

  return (
    <View style={t.timeListRow}>
      <Text style={t.timeListIcon}>🔔</Text>
      <View style={t.timeInputWrap}>
        <TextInput
          style={t.timeInput}
          keyboardType="number-pad"
          value={hour}
          selectTextOnFocus
          onChangeText={(text) => setHour(text.replace(/[^0-9]/g, '').slice(0, 2))}
          onEndEditing={commit}
          onBlur={commit}
          maxLength={2}
          placeholder="00"
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel="通知時刻 時"
        />
        <Text style={t.timeColon}>:</Text>
        <TextInput
          style={t.timeInput}
          keyboardType="number-pad"
          value={minute}
          selectTextOnFocus
          onChangeText={(text) => setMinute(text.replace(/[^0-9]/g, '').slice(0, 2))}
          onEndEditing={commit}
          onBlur={commit}
          maxLength={2}
          placeholder="00"
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel="通知時刻 分"
        />
      </View>
      {canRemove && (
        <Pressable
          onPress={onRemove}
          style={t.timeRemoveBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${value} の通知を削除`}
        >
          <Text style={t.timeRemoveText}>×</Text>
        </Pressable>
      )}
    </View>
  );
}

function SettingsSection() {
  const colors = useThemeColors();
  const sset = useMemo(() => makeSettingsStyles(colors), [colors]);
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const themeModes: Array<{ key: 'system' | 'light' | 'dark'; label: string; icon: string }> = [
    { key: 'system', label: '自動', icon: '🌓' },
    { key: 'light', label: 'ライト', icon: '☀️' },
    { key: 'dark', label: 'ダーク', icon: '🌙' },
  ];

  const toggleNotifications = async (next: boolean) => {
    if (next) {
      const ok = await requestNotificationPermission();
      if (!ok) {
        infoAlert('通知権限', '設定アプリから通知を許可してください');
        return;
      }
      updateSettings({ notificationsEnabled: true });
      await scheduleDailyReminder(settings.notificationTimes);
    } else {
      updateSettings({ notificationsEnabled: false });
      await cancelDailyReminder();
    }
  };

  const applyTimes = async (times: string[]) => {
    updateSettings({ notificationTimes: times });
    if (settings.notificationsEnabled) {
      await scheduleDailyReminder(times);
    }
  };

  // 1 つの時刻を確定値で置き換える（重複は畳まれるため同値・既存値なら何もしない）
  const replaceTime = async (index: number, next: string) => {
    if (settings.notificationTimes[index] === next) return;
    if (settings.notificationTimes.includes(next)) return;
    const updated = settings.notificationTimes.map((t, i) => (i === index ? next : t));
    await applyTimes(updated);
  };

  const removeTime = async (index: number) => {
    // 最低 1 つは残す（全削除なら通知 OFF 側で対応）
    if (settings.notificationTimes.length <= 1) return;
    await applyTimes(settings.notificationTimes.filter((_, i) => i !== index));
  };

  const addTime = async () => {
    if (settings.notificationTimes.length >= MAX_REMINDER_TIMES) return;
    // 妥当な未使用デフォルト（21:00 が埋まっていれば近傍をずらす）
    const fallbacks = ['21:00', '07:00', '12:00', '19:00', '22:00'];
    const next = fallbacks.find((t) => !settings.notificationTimes.includes(t)) ?? '21:00';
    if (settings.notificationTimes.includes(next)) return;
    await applyTimes([...settings.notificationTimes, next]);
  };

  // よく使う時刻をワンタップで未使用の行に追加（既に全行埋まっていれば何もしない）
  const quickFill = async (t: string) => {
    if (settings.notificationTimes.includes(t)) return;
    if (settings.notificationTimes.length >= MAX_REMINDER_TIMES) return;
    await applyTimes([...settings.notificationTimes, t]);
  };

  const goalOptions = [5, 10, 15, 20, 30, 50];
  // [UX改善] カスタム目標値入力 (ユーザー報告:「自分で目標を決めたい」)
  const [customGoalInput, setCustomGoalInput] = useState('');
  const isCustomGoal = !goalOptions.includes(settings.dailyGoal);

  return (
    <View style={sset.box}>
      <Text style={sset.title}>設定</Text>

      <Text style={sset.label}>1日の目標問題数</Text>
      <View style={sset.segRow}>
        {goalOptions.map((g) => (
          <Pressable
            key={g}
            style={[sset.segBtn, settings.dailyGoal === g && sset.segBtnActive]}
            onPress={() => updateSettings({ dailyGoal: g })}
          >
            <Text style={[sset.segText, settings.dailyGoal === g && sset.segTextActive]}>
              {g}問
            </Text>
          </Pressable>
        ))}
      </View>
      {/* [UX改善] カスタム入力 */}
      <View style={sset.customRow}>
        <Text style={sset.customLabel}>カスタム:</Text>
        <TextInput
          style={[sset.customInput, isCustomGoal && sset.customInputActive]}
          keyboardType="number-pad"
          placeholder={isCustomGoal ? String(settings.dailyGoal) : '例: 75'}
          placeholderTextColor={isCustomGoal ? colors.primary : colors.textTertiary}
          value={customGoalInput}
          onChangeText={(text) => setCustomGoalInput(text.replace(/[^0-9]/g, ''))}
          onBlur={() => {
            const n = parseInt(customGoalInput, 10);
            if (!isNaN(n) && n >= 1 && n <= 500) {
              updateSettings({ dailyGoal: n });
              setCustomGoalInput('');
            }
          }}
          onSubmitEditing={() => {
            const n = parseInt(customGoalInput, 10);
            if (!isNaN(n) && n >= 1 && n <= 500) {
              updateSettings({ dailyGoal: n });
              setCustomGoalInput('');
            }
          }}
          returnKeyType="done"
          maxLength={3}
        />
        <Text style={sset.customLabel}>問 (1〜500)</Text>
      </View>

      <Text style={sset.label}>テーマ</Text>
      <View style={sset.segRow}>
        {themeModes.map((m) => (
          <Pressable
            key={m.key}
            style={[sset.segBtn, settings.themeMode === m.key && sset.segBtnActive]}
            onPress={() => updateSettings({ themeMode: m.key })}
          >
            <Text style={sset.segIcon}>{m.icon}</Text>
            <Text
              style={[sset.segText, settings.themeMode === m.key && sset.segTextActive]}
            >
              {m.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={sset.label}>学習リマインダー通知</Text>
      <View style={sset.toggleRow}>
        <Text style={sset.toggleLabel}>
          {settings.notificationsEnabled ? '有効' : '無効'}
        </Text>
        <Pressable
          style={[
            sset.toggle,
            settings.notificationsEnabled && sset.toggleOn,
          ]}
          onPress={() => toggleNotifications(!settings.notificationsEnabled)}
        >
          <View
            style={[
              sset.toggleKnob,
              settings.notificationsEnabled && sset.toggleKnobOn,
            ]}
          />
        </Pressable>
      </View>

      {settings.notificationsEnabled && (
        <>
          <Text style={sset.label}>通知時刻</Text>
          <Text style={sset.labelDesc}>
            時・分を入力して、続けやすい時刻を自由に設定できます（最大{MAX_REMINDER_TIMES}つ）
          </Text>
          {settings.notificationTimes.map((time, index) => (
            <TimeInputRow
              key={`${time}-${index}`}
              value={time}
              canRemove={settings.notificationTimes.length > 1}
              onCommit={(next) => replaceTime(index, next)}
              onRemove={() => removeTime(index)}
              styles={sset}
              colors={colors}
            />
          ))}
          {settings.notificationTimes.length < MAX_REMINDER_TIMES && (
            <>
              {/* よく使う時刻のワンタップ追加（主役は上の自由入力・補助） */}
              <View style={sset.quickChipRow}>
                {QUICK_TIME_CHIPS.map((t) => {
                  const used = settings.notificationTimes.includes(t);
                  return (
                    <Pressable
                      key={t}
                      disabled={used}
                      style={[sset.quickChip, used && sset.timeBtnDisabled]}
                      onPress={() => quickFill(t)}
                      accessibilityRole="button"
                      accessibilityLabel={`${t} を追加`}
                    >
                      <Text style={sset.quickChipText}>＋{t}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Pressable
                style={sset.timeAddBtn}
                onPress={addTime}
                accessibilityRole="button"
                accessibilityLabel="通知時刻を追加"
              >
                <Text style={sset.timeAddPlus}>＋</Text>
                <Text style={sset.timeAddText}>時刻を追加</Text>
              </Pressable>
            </>
          )}
        </>
      )}

      {/* ── 学習中の演出 ── */}
      <View style={sset.divider} />
      <Text style={sset.sectionLabel}>🎯 学習中の演出</Text>
      <Text style={sset.labelDesc}>
        集中しやすい設定に調整できます
      </Text>

      {/* バイブレーション */}
      <View style={sset.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={sset.toggleLabel}>📳 バイブレーション</Text>
          <Text style={sset.toggleDesc}>正解時の軽い振動</Text>
        </View>
        <Pressable
          style={[sset.toggle, settings.vibrationEnabled && sset.toggleOn]}
          onPress={() => updateSettings({ vibrationEnabled: !settings.vibrationEnabled })}
          accessibilityRole="switch"
          accessibilityState={{ checked: !!settings.vibrationEnabled }}
          accessibilityLabel="バイブレーション"
        >
          <View style={[sset.toggleKnob, settings.vibrationEnabled && sset.toggleKnobOn]} />
        </Pressable>
      </View>

      {/* 効果音 */}
      <View style={sset.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={sset.toggleLabel}>🔊 効果音</Text>
          <Text style={sset.toggleDesc}>正解・不正解時の音（デフォOFF）</Text>
        </View>
        <Pressable
          style={[sset.toggle, settings.soundEnabled && sset.toggleOn]}
          onPress={() => updateSettings({ soundEnabled: !settings.soundEnabled })}
          accessibilityRole="switch"
          accessibilityState={{ checked: !!settings.soundEnabled }}
          accessibilityLabel="効果音"
        >
          <View style={[sset.toggleKnob, settings.soundEnabled && sset.toggleKnobOn]} />
        </Pressable>
      </View>

      {/* アニメーションレベル */}
      <Text style={sset.label}>🎬 アニメーション</Text>
      <Text style={sset.labelDesc}>
        コンボや祝福演出のレベル
      </Text>
      <View style={sset.segRow}>
        {[
          { key: 'full', label: '通常', icon: '🎉' },
          { key: 'subtle', label: '控えめ', icon: '✨' },
          { key: 'off', label: 'OFF', icon: '🔇' },
        ].map((m) => (
          <Pressable
            key={m.key}
            style={[sset.segBtn, (settings.animationLevel ?? 'full') === m.key && sset.segBtnActive]}
            onPress={() => updateSettings({ animationLevel: m.key as 'full' | 'subtle' | 'off' })}
            accessibilityRole="button"
            accessibilityState={{ selected: (settings.animationLevel ?? 'full') === m.key }}
          >
            <Text style={sset.segIcon}>{m.icon}</Text>
            <Text
              style={[
                sset.segText,
                (settings.animationLevel ?? 'full') === m.key && sset.segTextActive,
              ]}
            >
              {m.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function makeSettingsStyles(C: ThemeColors) {
  return StyleSheet.create({
    box: {
      marginTop: Spacing.xxl,
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      padding: Spacing.lg,
    },
    title: {
      fontSize: FontSize.caption,
      fontWeight: '700',
      color: C.textTertiary,
      marginBottom: 10,
      letterSpacing: LetterSpacing.wide,
    },
    label: {
      fontSize: FontSize.caption,
      fontWeight: '700',
      color: C.text,
      marginTop: 14,
      marginBottom: 8,
    },
    labelDesc: {
      fontSize: FontSize.caption2,
      color: C.textTertiary,
      marginBottom: 8,
    },
    sectionLabel: {
      fontSize: FontSize.subhead,
      fontWeight: '800',
      color: C.text,
      marginTop: 8,
      marginBottom: 4,
    },
    divider: {
      height: 1,
      backgroundColor: C.borderLight,
      marginVertical: Spacing.lg,
    },
    toggleDesc: {
      fontSize: FontSize.caption2,
      color: C.textTertiary,
      marginTop: 2,
    },
    segRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    // [UX改善] カスタム目標値入力
    customRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 10,
    },
    customLabel: {
      fontSize: FontSize.caption,
      color: C.textSecondary,
      fontWeight: '600',
    },
    customInput: {
      flex: 1,
      backgroundColor: C.background,
      borderRadius: BorderRadius.md,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: C.border,
      fontSize: FontSize.subhead,
      color: C.text,
      textAlign: 'center',
      minWidth: 80,
    },
    customInputActive: {
      borderColor: C.primary,
      borderWidth: 2,
    },
    segBtn: {
      flex: 1,
      backgroundColor: C.background,
      borderRadius: BorderRadius.md,
      paddingVertical: 10,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: C.border,
    },
    segBtnActive: { backgroundColor: C.primary, borderColor: C.primary },
    segIcon: { fontSize: 18 },
    segText: {
      fontSize: FontSize.caption,
      color: C.textSecondary,
      marginTop: 2,
      fontWeight: '600',
    },
    segTextActive: { color: C.white },
    toggleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10,
    },
    toggleLabel: { fontSize: FontSize.footnote, color: C.textSecondary },
    toggle: {
      width: 50,
      height: 30,
      borderRadius: 15,
      backgroundColor: C.border,
      padding: 2,
    },
    toggleOn: { backgroundColor: C.primary },
    toggleKnob: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: C.white,
      ...Shadow.sm,
    },
    toggleKnobOn: { transform: [{ translateX: 20 }] },
    timeBtnDisabled: { opacity: 0.35 },
    // ── 複数時刻リマインダー行（カスタム HH:MM 入力） ──
    timeListRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    timeListIcon: { fontSize: 16 },
    timeInputWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    timeInput: {
      width: 64,
      backgroundColor: C.background,
      borderRadius: BorderRadius.md,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: C.border,
      fontSize: FontSize.subhead,
      color: C.text,
      textAlign: 'center',
      fontWeight: '700',
    },
    timeColon: {
      fontSize: FontSize.subhead,
      fontWeight: '800',
      color: C.text,
    },
    quickChipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 4,
      marginBottom: 8,
    },
    quickChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: BorderRadius.sm,
      backgroundColor: C.primarySurface,
      borderWidth: 1,
      borderColor: C.primary,
    },
    quickChipText: {
      fontSize: FontSize.caption,
      color: C.primary,
      fontWeight: '700',
    },
    timeRemoveBtn: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: C.error + '20',
      alignItems: 'center',
      justifyContent: 'center',
    },
    timeRemoveText: {
      fontSize: 16,
      fontWeight: '800',
      color: C.error,
      lineHeight: 20,
    },
    timeAddBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
      paddingVertical: 10,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: C.border,
      borderStyle: 'dashed',
      backgroundColor: C.background,
    },
    timeAddPlus: {
      fontSize: FontSize.subhead,
      fontWeight: '700',
      color: C.primary,
      marginRight: 6,
    },
    timeAddText: {
      fontSize: FontSize.footnote,
      fontWeight: '600',
      color: C.primary,
    },
  });
}

function SubscriptionSection() {
  const colors = useThemeColors();
  const ss = useMemo(() => makeSubStyles(colors), [colors]);
  const router = useRouter();
  const isPro = useSettingsStore((s) => s.isPro);
  const subscription = useSettingsStore((s) => s.subscription);
  const isTrialActive = useSettingsStore((s) => s.isTrialActive);
  const trialDaysLeft = useSettingsStore((s) => s.trialDaysLeft);
  const verifySubscription = useSettingsStore((s) => s.verifySubscription);
  const session = useAuthStore((s) => s.session);
  const [restoring, setRestoring] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  // [2026-05] canceling state は cancel-flow.tsx に移管済み。

  const handleRestore = useCallback(async () => {
    if (!session?.access_token) {
      infoAlert('ログインが必要です', '購入を復元するにはログインしてください。');
      return;
    }
    setRestoring(true);
    try {
      await verifySubscription(session.access_token);
      const nowPro = useSettingsStore.getState().isPro();
      if (nowPro) {
        infoAlert('復元完了', 'サブスクリプションが復元されました。');
      } else {
        infoAlert('復元結果', '有効なサブスクリプションが見つかりませんでした。');
      }
    } catch {
      infoAlert('エラー', '復元に失敗しました。通信環境を確認して再度お試しください。');
    } finally {
      setRestoring(false);
    }
  }, [session, verifySubscription]);

  /**
   * 解約ボタン → 解約防止フロー (Spotify / Netflix パターン) へ誘導。
   * [2026-05] 旧: ここで confirmAlert → 直接 PayPal API 呼び出し。
   * 新: /cancel-flow で理由ヒアリング → counter-offer → 最終確認の 3 ステップ。
   * 実際の API 呼び出しは cancel-flow.tsx 内に移管済み。
   */
  const handleCancelSubscription = useCallback(async () => {
    if (!session?.access_token) {
      infoAlert('ログインが必要です', '解約するにはログインしてください。');
      return;
    }
    router.push('/cancel-flow');
  }, [session, router]);

  const handleManageSubscription = useCallback(() => {
    if (Platform.OS === 'ios') {
      Linking.openURL('https://apps.apple.com/account/subscriptions');
    } else {
      // Web / Android: 直接解約ボタンを使ってもらう
      infoAlert(
        'サブスクリプション管理',
        '下の「解約する」ボタンから、いつでも解約手続きができます。\n\n次回更新日の24時間前までに解約すれば、それ以降の課金は発生しません。',
      );
    }
  }, []);

  /**
   * [2026-05-22] 月額 → 年額アップグレード (Web/PayPal のみ)
   * PayPal Subscription Revise API を呼んで、承認画面に遷移させる。
   * 承認後は activate-subscription 経由で profiles.billing_cycle = 'annual' に更新される。
   */
  const handleUpgradeToAnnual = useCallback(async () => {
    if (!session?.access_token) {
      await infoAlert('ログインが必要です', 'プラン変更にはログインしてください。');
      return;
    }
    const confirmed = await confirmAlert(
      '年額プランにアップグレード',
      '月額 ¥980 → 年額 ¥5,980 (¥498/月相当・約 49% OFF)\n\nPayPal の承認画面で確認後、年額プランに切り替わります。\n切替後は次回課金日に年額が請求されます。',
      { okText: '変更する', cancelText: 'やめる' },
    );
    if (!confirmed) return;

    setUpgrading(true);
    try {
      // [2026-05-22] Vercel 12 Functions 制限のため、revise は create-subscription に統合
      const res = await fetch(`${API_BASE_URL}/paypal/create-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ billingCycle: 'annual', action: 'revise' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await infoAlert(
          'プラン変更に失敗しました',
          data.error || '時間をおいて再度お試しください。',
        );
        return;
      }
      // 自動承認 (PayPal 側で即適用)
      if (data.status === 'auto-approved') {
        await verifySubscription(session.access_token);
        await infoAlert('変更完了', '年額プランへの変更が完了しました。');
        return;
      }
      // 通常は承認 URL に遷移
      if (data.approvalUrl) {
        if (Platform.OS === 'web') {
          window.location.href = data.approvalUrl;
        } else {
          await Linking.openURL(data.approvalUrl);
        }
      } else {
        await infoAlert(
          'プラン変更を受け付けました',
          'PayPal 側で処理中です。完了後に「購入を復元」をお試しください。',
        );
      }
    } catch (e: any) {
      await infoAlert('通信エラー', e.message || 'ネットワーク接続を確認してください');
    } finally {
      setUpgrading(false);
    }
  }, [session, verifySubscription]);

  const pro = isPro();
  const trial = isTrialActive();
  const daysLeft = trialDaysLeft();

  // [UI修正] プラン表示を LP に合わせて 2プラン構成 (無料 / Premium) に統一。
  // utils/subscriptionLabel.ts に純関数として切り出し、ユニットテスト化済み。
  const planLabel = computePlanLabel({
    plan: subscription.plan,
    isTrial: trial,
    trialDaysLeft: daysLeft,
  });

  return (
    <View style={ss.box}>
      <Text style={ss.title}>サブスクリプション管理</Text>

      {/* Current plan display */}
      <View style={ss.planRow}>
        <Text style={ss.planLabel}>現在のプラン</Text>
        <View style={[ss.planBadge, pro && ss.planBadgePro]}>
          <Text style={[ss.planBadgeText, pro && ss.planBadgeTextPro]}>
            {planLabel}
          </Text>
        </View>
      </View>

      {pro && (
        <>
          {/* Manage subscription button */}
          <Pressable style={ss.manageBtn} onPress={handleManageSubscription}>
            <Text style={ss.manageBtnText}>サブスクリプションを管理</Text>
            <Text style={ss.manageArrow}>{'\u203A'}</Text>
          </Pressable>

          {/* [2026-05-22] 月額契約者のみ: 年額にアップグレード CTA (Web/PayPal のみ)
              iOS/Android の IAP では年額 SKU 未公開 (来月予定) */}
          {Platform.OS === 'web' &&
            subscription.billingCycle === 'monthly' &&
            subscription.subscriptionStatus !== 'canceled' && (
              <Pressable
                style={[ss.upgradeBtn, upgrading && { opacity: 0.5 }]}
                onPress={handleUpgradeToAnnual}
                disabled={upgrading}
                accessibilityRole="button"
                accessibilityLabel="年額プランにアップグレード"
              >
                {upgrading ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <View style={ss.upgradeBtnInner}>
                    <Text style={ss.upgradeBtnText}>年額にアップグレード</Text>
                    <Text style={ss.upgradeBtnSub}>¥5,980/年・約 49% OFF</Text>
                  </View>
                )}
              </Pressable>
            )}

          {/* Web/Android: 解約フローへ進むボタン */}
          {Platform.OS !== 'ios' && subscription.subscriptionStatus !== 'canceled' && (
            <Pressable
              style={ss.cancelBtn}
              onPress={handleCancelSubscription}
              accessibilityRole="button"
              accessibilityLabel="サブスクリプションを解約"
            >
              <Text style={ss.cancelBtnText}>解約する</Text>
            </Pressable>
          )}

          {/* Web/Android: 解約予定の表示 */}
          {Platform.OS !== 'ios' && subscription.subscriptionStatus === 'canceled' && (
            <View style={ss.canceledInfo}>
              <Text style={ss.canceledInfoIcon}>✓</Text>
              <View style={{ flex: 1 }}>
                <Text style={ss.canceledInfoTitle}>解約済み</Text>
                <Text style={ss.canceledInfoText}>
                  {subscription.expiresAt
                    ? `${new Date(subscription.expiresAt).toLocaleDateString('ja-JP')} まで引き続きご利用いただけます`
                    : '次回更新日まで引き続きご利用いただけます'}
                </Text>
              </View>
            </View>
          )}

          {/* Cancellation instructions */}
          <View style={ss.cancelInfo}>
            <Text style={ss.cancelInfoTitle}>解約について</Text>
            <Text style={ss.cancelInfoText}>
              {Platform.OS === 'ios'
                ? '上の「サブスクリプションを管理」から Apple の設定画面で解約できます。次回更新日の24時間前までに手続きしてください。'
                : 'いつでも「解約する」ボタンからワンタップで解約できます。次回更新日の24時間前までに手続きすれば、それ以降の課金は発生しません。'}
            </Text>
            <Text style={ss.cancelInfoSub}>
              解約後も、当月の残り期間は引き続きご利用いただけます。
            </Text>
          </View>
        </>
      )}

      {/* Restore purchases button */}
      <Pressable
        style={ss.restoreBtn}
        onPress={handleRestore}
        disabled={restoring}
      >
        {restoring ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Text style={ss.restoreBtnText}>購入を復元</Text>
        )}
      </Pressable>
    </View>
  );
}

function makeSubStyles(C: ThemeColors) {
  return StyleSheet.create({
    box: {
      marginTop: Spacing.xxl,
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      padding: Spacing.lg,
    },
    title: {
      fontSize: FontSize.caption,
      fontWeight: '700',
      color: C.textTertiary,
      marginBottom: 10,
      letterSpacing: LetterSpacing.wide,
    },
    planRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: C.borderLight,
    },
    planLabel: {
      fontSize: FontSize.footnote,
      color: C.textSecondary,
    },
    planBadge: {
      backgroundColor: C.background,
      borderRadius: BorderRadius.sm,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: C.border,
    },
    planBadgePro: {
      backgroundColor: C.primarySurface,
      borderColor: C.primary,
    },
    planBadgeText: {
      fontSize: FontSize.caption,
      fontWeight: '700',
      color: C.textSecondary,
    },
    planBadgeTextPro: {
      color: C.primary,
    },
    manageBtn: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: C.borderLight,
    },
    manageBtnText: {
      fontSize: FontSize.subhead,
      color: C.text,
      fontWeight: '600',
    },
    manageArrow: {
      fontSize: 20,
      color: C.textTertiary,
    },
    // ── Web/Android ワンタップ解約ボタン ──
    cancelBtn: {
      marginTop: 8,
      marginBottom: 8,
      paddingVertical: 12,
      paddingHorizontal: 16,
      alignItems: 'center',
      borderRadius: BorderRadius.md,
      borderWidth: 1.5,
      borderColor: C.error,
      backgroundColor: C.card,
    },
    cancelBtnDisabled: { opacity: 0.5 },
    cancelBtnText: {
      fontSize: FontSize.subhead,
      color: C.error,
      fontWeight: '700',
    },

    // [2026-05-22] 年額にアップグレード CTA
    upgradeBtn: {
      marginTop: 4,
      marginBottom: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: BorderRadius.md,
      backgroundColor: C.accent ?? '#E8860C',
      alignItems: 'center',
      ...Shadow.sm,
    },
    upgradeBtnInner: {
      alignItems: 'center',
    },
    upgradeBtnText: {
      fontSize: FontSize.subhead,
      color: C.white,
      fontWeight: '800',
    },
    upgradeBtnSub: {
      fontSize: FontSize.caption,
      color: 'rgba(255,255,255,0.92)',
      fontWeight: '700',
      marginTop: 2,
    },
    // 解約予定表示
    canceledInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 8,
      marginBottom: 8,
      padding: 12,
      borderRadius: BorderRadius.md,
      backgroundColor: C.primarySurface,
      gap: 10,
    },
    canceledInfoIcon: {
      fontSize: 20,
      color: C.primary,
      fontWeight: '800',
    },
    canceledInfoTitle: {
      fontSize: FontSize.caption,
      fontWeight: '700',
      color: C.primaryDark,
    },
    canceledInfoText: {
      fontSize: FontSize.caption2,
      color: C.textSecondary,
      marginTop: 2,
    },
    cancelInfo: {
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: C.borderLight,
    },
    cancelInfoTitle: {
      fontSize: FontSize.caption,
      fontWeight: '700',
      color: C.textSecondary,
      marginBottom: 6,
    },
    cancelInfoText: {
      fontSize: FontSize.caption,
      color: C.textSecondary,
      lineHeight: LineHeight.caption * 1.3,
    },
    cancelInfoSub: {
      fontSize: FontSize.caption2,
      color: C.textTertiary,
      marginTop: 6,
      lineHeight: LineHeight.caption * 1.2,
    },
    restoreBtn: {
      paddingVertical: 14,
      alignItems: 'center',
    },
    restoreBtnText: {
      fontSize: FontSize.subhead,
      color: C.primary,
      fontWeight: '600',
    },
  });
}

function AccountSection() {
  const colors = useThemeColors();
  const acct = useMemo(() => makeAccountStyles(colors), [colors]);
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);

  const handleSignOut = () => {
    confirmAlert('ログアウト', 'ログアウトしますか？', () => signOut());
  };

  const handleDelete = () => {
    confirmAlert('アカウント削除', '全ての学習データが完全に削除されます。この操作は取り消せません。', async () => {
      const { error } = await deleteAccount();
      if (error) infoAlert('削除失敗', error);
      else infoAlert('削除完了', 'アカウントを削除しました');
    });
  };

  return (
    <View style={acct.box}>
      <Text style={acct.title}>アカウント</Text>
      {user ? (
        <>
          <View style={acct.row}>
            <Text style={acct.label}>メール</Text>
            <Text style={acct.value} numberOfLines={1}>{user.email}</Text>
          </View>
          <WeeklyEmailToggle />
          <Pressable style={acct.rowBtn} onPress={handleSignOut}>
            <Text style={acct.rowBtnText}>ログアウト</Text>
          </Pressable>
          <Pressable style={[acct.rowBtn, acct.danger]} onPress={handleDelete}>
            <Text style={[acct.rowBtnText, { color: colors.error }]}>アカウント削除</Text>
          </Pressable>
        </>
      ) : (
        <Pressable style={acct.loginBtn} onPress={() => router.push('/auth/login')}>
          <Text style={acct.loginText}>ログイン / 新規登録</Text>
          <Text style={acct.loginSub}>全デバイスで進捗を同期</Text>
        </Pressable>
      )}
    </View>
  );
}

function makeAccountStyles(C: ThemeColors) {
  return StyleSheet.create({
    box: {
      marginTop: Spacing.xxl,
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      padding: Spacing.lg,
    },
    title: {
      fontSize: FontSize.caption,
      fontWeight: '700',
      color: C.textTertiary,
      marginBottom: 10,
      letterSpacing: LetterSpacing.wide,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: C.borderLight,
    },
    label: { fontSize: FontSize.footnote, color: C.textSecondary },
    value: { fontSize: FontSize.footnote, color: C.text, fontWeight: '600', maxWidth: 200 },
    rowBtn: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.borderLight },
    rowBtnText: { fontSize: FontSize.subhead, color: C.text, fontWeight: '600' },
    danger: { borderBottomWidth: 0 },
    loginBtn: {
      backgroundColor: C.primary,
      borderRadius: BorderRadius.md,
      paddingVertical: 14,
      alignItems: 'center',
    },
    loginText: { color: C.white, fontSize: FontSize.subhead, fontWeight: '700' },
    loginSub: { color: 'rgba(255,255,255,0.85)', fontSize: FontSize.caption2, marginTop: 2 },
  });
}

/**
 * 予測ハブ④ 模試突合: 予測点 ↔ 直近模試の実測点を並べ、誤差を示す。
 * 誤差±3以内なら「予測はあなたの実力をほぼ正確に捉えています」。未受験なら受験CTA。
 * 推移バー(直近10回)も内包し、別セクションの重複を解消する。
 */
function MockReconciliation({
  s,
  colors,
  router,
  predicted,
  latestMockScore,
  mockError,
}: {
  s: ReturnType<typeof makeStyles>;
  colors: ThemeColors;
  router: ReturnType<typeof useRouter>;
  predicted: number;
  latestMockScore: number | null;
  mockError: number | null;
}) {
  return (
    <View style={[s.hubSection, Shadow.sm]}>
      <Text style={s.hubSectionTitle}>④ 模試突合 — 予測 vs 実測</Text>
      {latestMockScore === null || mockError === null ? (
        <Pressable
          style={s.mockCta}
          onPress={() => router.push('/exam')}
          accessibilityRole="button"
          accessibilityLabel="模擬試験を受けて予測を実測で確かめる"
        >
          <Text style={s.mockCtaText}>
            模試を受けると、予測があなたの実力を正しく捉えているか実測で確かめられます
          </Text>
          <Text style={s.mockCtaBtn}>模擬試験を受ける →</Text>
        </Pressable>
      ) : (
        <>
          <View style={s.mockCompareRow}>
            <View style={s.mockCompareItem}>
              <Text style={s.mockCompareLabel}>予測</Text>
              <Text style={[s.mockCompareVal, { color: colors.primary }]}>{predicted}点</Text>
            </View>
            <Text style={s.mockCompareVs}>↔</Text>
            <View style={s.mockCompareItem}>
              <Text style={s.mockCompareLabel}>直近模試</Text>
              <Text style={s.mockCompareVal}>{latestMockScore}点</Text>
            </View>
            <View style={s.mockCompareItem}>
              <Text style={s.mockCompareLabel}>誤差</Text>
              <Text style={[s.mockCompareVal, { color: Math.abs(mockError) <= 3 ? colors.success : colors.accent }]}>
                {mockError > 0 ? '+' : ''}{mockError}
              </Text>
            </View>
          </View>
          <Text style={[
            s.mockVerdict,
            { color: Math.abs(mockError) <= 3 ? colors.success : colors.textSecondary },
          ]}>
            {Math.abs(mockError) <= 3
              ? '✓ 予測はあなたの実力をほぼ正確に捉えています'
              : '模試を重ねるほど予測が実測へ寄っていきます'}
          </Text>
          <Text style={s.mockTrendHint}>スコアの推移は下の「模試スコア推移」で確認できます</Text>
        </>
      )}
    </View>
  );
}

export default function ProgressScreen() {
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const stats = useProgressStore((s) => s.stats);
  const getCategoryAccuracy = useProgressStore((s) => s.getCategoryAccuracy);
  const getBookmarkedQuestions = useProgressStore((s) => s.getBookmarkedQuestions);
  const getWeakQuestions = useProgressStore((s) => s.getWeakQuestions);
  const getDueForReview = useProgressStore((s) => s.getDueForReview);
  const getPreSleepReview = useProgressStore((s) => s.getPreSleepReview);
  const getManuallyMasteredIds = useProgressStore((s) => s.getManuallyMasteredIds);
  const getDailyLog = useProgressStore((s) => s.getDailyLog);
  const resetProgress = useProgressStore((s) => s.resetProgress);
  const dailyGoal = useSettingsStore((s) => s.settings.dailyGoal);
  const subscription = useSettingsStore((s) => s.subscription);
  const achievementUnlocked = useAchievementStore((s) => s.unlocked);
  const examHistory = useExamStore((s) => s.examHistory);
  const authUser = useAuthStore((s) => s.user);

  // 管理者判定（クライアント側はあくまで UI 表示用。サーバ側 ADMIN_EMAILS が真の認可）
  const isAdmin = useMemo(() => {
    const list = (process.env.EXPO_PUBLIC_ADMIN_EMAILS || '')
      .split(',')
      .map((e: string) => e.trim().toLowerCase())
      .filter(Boolean);
    const email = (authUser?.email || '').toLowerCase().trim();
    return !!email && list.includes(email);
  }, [authUser?.email]);

  // [UX改善 v2] 達成率 = 3回連続正解の問題数 / 全問題数
  // 単なる正解数ではなく「習得」(連続正解で証明)を要求してまぐれ正解を排除
  const TOTAL_Q = ALL_QUESTIONS.length;
  const masteredCount = useProgressStore((st) => st.getMasteredCount)();
  const rate = TOTAL_Q > 0
    ? Math.round((Math.min(masteredCount, TOTAL_Q) / TOTAL_Q) * 100) : 0;
  // 進捗率 = 一度でも解いた問題のカバー率 (ホームの統計から集約。達成率=習得率とは別指標)。
  const progressPct = TOTAL_Q > 0
    ? Math.round((Math.min(stats.totalQuestions, TOTAL_Q) / TOTAL_Q) * 100) : 0;
  const dailyLog = useMemo(() => getDailyLog(), [getDailyLog, stats]);
  const bookmarks = getBookmarkedQuestions().length;
  const weak = getWeakQuestions().length;
  const dueCount = useMemo(() => getDueForReview().length, [getDueForReview, stats]);
  // 就寝前は実際に出せる問題数を表示（固定「5」だと中身0でも5表示→押すと空、のバグ防止）
  // progress(確信度/復習日/連続正解)も購読: stats不変の操作(マスター/確信度変更等)でもズレないように
  const progressMap = useProgressStore((s) => s.progress);
  const preSleepCount = useMemo(() => getPreSleepReview(5).length, [getPreSleepReview, stats, progressMap]);
  const masteredManualCount = getManuallyMasteredIds().length;
  // [Bugfix] 旧: 月間累計 (subscription.aiQueriesUsed) を表示していたが、
  // ローカル加算でずれが蓄積し「使ってないのに100回超え」と表示される問題があった。
  // 新: サーバー認定の日次残数から逆算した「今日の使用数 / 今日の上限」を表示。
  // - サーバー側は日次のみ管理 (profiles.ai_used_today)、月間累計は信頼性なし
  // - 今日の上限を超えるとサーバーが弾く設計なので、ユーザーに最も実用的な値。
  const getAIDailyRemaining = useSettingsStore((s) => s.getAIDailyRemaining);
  const getAIDailyLimit = useSettingsStore((s) => s.getAIDailyLimit);
  const aiDailyRemaining = getAIDailyRemaining();
  // [H-1] AI上限は常にプラン基準(= サーバー一致)。旧トライアル特例(10/日)は撤去し、
  // store の getAIDailyLimit() に一本化(トライアル中の「0/10」誤表示を解消)。
  const aiDailyLimit = getAIDailyLimit();
  const aiUsedToday = Math.max(0, aiDailyLimit - aiDailyRemaining);

  const examPrediction = useExamPrediction();
  const predictionHistory = usePredictionHistory(
    examPrediction.totalPredicted,
    examPrediction.passProbability,
    examPrediction.hasData,
  );
  const heatmap = useHeatmap();

  // ── 予測ハブ③ 失点ランキング (サブカテゴリ粒度) ──
  // 科目失点 (allocation·(1−θ)) を、その科目のサブカテゴリへ「取りこぼし度合い」比で按分。
  // 色だけに頼らず ▲記号 + 点数 の三重符号化で弱点を示す (アクセシビリティ)。
  const pointsLostRanking = useMemo(() => {
    const rows = examPrediction.perCategory.flatMap((cat) => {
      if (cat.pointsLost <= 0) return [];
      const row = heatmap.rows.find((r) => r.category === cat.category);
      if (!row) return [];
      const subStats: SubcategoryStat[] = row.cells.map((cell) => ({
        label: cell.label,
        categoryLabel: CATEGORY_LABELS[cat.category],
        // 取りこぼし度合い = 掲載数 × (1 − 達成率)。未着手も「これから失点しうる」ので残す。
        missWeight: cell.total * (1 - cell.masteryRate),
      }));
      return distributePointsLostToSubcategories(cat.pointsLost, subStats);
    });
    return rows.sort((a, b) => b.pointsLost - a.pointsLost).slice(0, 5);
  }, [examPrediction.perCategory, heatmap.rows]);

  // 上位3つ攻略で何点伸びるか (失点合計 → 予測+◯点 → ◯点)
  const top3Recoverable = useMemo(
    () => recoverablePoints(pointsLostRanking, 3),
    [pointsLostRanking],
  );

  // ── 予測ハブ④ 模試突合 ──
  const latestMockScore = useMemo(
    () => (examHistory.length > 0 ? examHistory[examHistory.length - 1].score : null),
    [examHistory],
  );
  const mockError = latestMockScore !== null ? examPrediction.totalPredicted - latestMockScore : null;

  // 直前期(試験30日以内)は ④模試突合 を上位に・当日見込を主役に
  const isFinalSprint = examPrediction.daysUntilExam !== null && examPrediction.daysUntilExam <= 30;

  const handleReset = () => {
    confirmAlert('学習データのリセット', '全ての学習記録が削除されます。この操作は取り消せません。', () => resetProgress());
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>学習記録</Text>

        {/* ════════ 予測ハブ: 記録タブで最も価値ある「今どれくらい合格に近いか」を最上部に ════════ */}
        <Text style={s.hubTitle}>🎯 本試験 予測ハブ</Text>

        {!examPrediction.hasData ? (
          <View style={[s.examCard, Shadow.md]}>
            <Text style={s.examTitle}>本試験 予測点数</Text>
            <Text style={s.examHint}>問題を解き始めると、あなた専用の予測点数が表示されます</Text>
          </View>
        ) : (
          <>
            {/* ── ① 予測点数 + 95%信頼区間 + 合格ライン + 合格可能性 + 当日見込 + ②科目別内訳 ── */}
            <PredictionCard prediction={examPrediction} history={predictionHistory} />

            {/* 直前期は ④模試突合 を ③ より上に (実測で予測の正しさを示すのが最優先) */}
            {isFinalSprint && (
              <MockReconciliation
                s={s}
                colors={colors}
                router={router}
                predicted={examPrediction.totalPredicted}
                latestMockScore={latestMockScore}
                mockError={mockError}
              />
            )}

            {/* ── ③ 弱点 = 失点ランキング (▲記号 + 点数 の三重符号化) ── */}
            {pointsLostRanking.length > 0 && (
              <View style={[s.hubSection, Shadow.sm]}>
                <Text style={s.hubSectionTitle}>③ 弱点 — どこで何点 失っているか</Text>
                {pointsLostRanking.map((row, i) => (
                  <View key={`${row.label}-${i}`} style={s.lossRow}>
                    <Text style={s.lossRank}>▲{i + 1}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.lossLabel}>{row.label}</Text>
                      <Text style={s.lossCat}>{row.categoryLabel}</Text>
                    </View>
                    <Text style={s.lossPoints}>−{row.pointsLost.toFixed(1)}点</Text>
                  </View>
                ))}
                {top3Recoverable > 0 && (
                  <Text style={s.lossSummary}>
                    上位3つを攻略すると 予測 +{top3Recoverable.toFixed(1)}点 → {Math.min(EXAM_TOTAL, Math.round(examPrediction.totalPredicted + top3Recoverable))}点
                  </Text>
                )}
                <Pressable
                  style={s.heatmapLink}
                  onPress={() => router.push('/heatmap')}
                  accessibilityRole="button"
                  accessibilityLabel="弱点マップ全体を見る"
                >
                  <Text style={s.heatmapLinkText}>▦ 弱点マップ全体を見る →</Text>
                </Pressable>
              </View>
            )}

            {/* ── ④ 模試突合 (直前期以外はここ) ── */}
            {!isFinalSprint && (
              <MockReconciliation
                s={s}
                colors={colors}
                router={router}
                predicted={examPrediction.totalPredicted}
                latestMockScore={latestMockScore}
                mockError={mockError}
              />
            )}
          </>
        )}

        {/* ── 復習ハブ: 手動で選ぶ4つの復習入口 (due は今日やることCTAが自動で拾うが、
            ブックマーク等 CTA に導線が無いキューもここから必ず到達できる) ── */}
        <Text style={s.sectionTitle}>📖 復習する</Text>
        <View style={s.reviewHubGrid}>
          <Pressable
            style={[s.reviewHubCard, Shadow.sm]}
            onPress={() => router.push({ pathname: '/review', params: { q: 'due' } })}
            accessibilityRole="button"
            accessibilityLabel={`全体復習 ${dueCount}問`}
          >
            <Text style={s.reviewHubIcon}>📖</Text>
            <Text style={[s.reviewHubValue, dueCount > 0 ? { color: colors.accent } : {}]}>{dueCount}</Text>
            <Text style={s.reviewHubLabel}>全体復習</Text>
          </Pressable>
          <Pressable
            style={[s.reviewHubCard, Shadow.sm]}
            onPress={() => router.push({ pathname: '/review', params: { q: 'weak' } })}
            accessibilityRole="button"
            accessibilityLabel={`苦手 ${weak}問`}
          >
            <Text style={s.reviewHubIcon}>💪</Text>
            <Text style={[s.reviewHubValue, weak > 0 ? { color: colors.error } : {}]}>{weak}</Text>
            <Text style={s.reviewHubLabel}>苦手</Text>
          </Pressable>
          <Pressable
            style={[s.reviewHubCard, Shadow.sm]}
            onPress={() => router.push({ pathname: '/review', params: { q: 'bookmarked' } })}
            accessibilityRole="button"
            accessibilityLabel={`ブックマーク ${bookmarks}問`}
          >
            <Text style={s.reviewHubIcon}>🔖</Text>
            <Text style={[s.reviewHubValue, { color: colors.primary }]}>{bookmarks}</Text>
            <Text style={s.reviewHubLabel}>ブックマーク</Text>
          </Pressable>
          <Pressable
            style={[s.reviewHubCard, Shadow.sm]}
            onPress={() => router.push('/pre-sleep-review')}
            accessibilityRole="button"
            accessibilityLabel="就寝前の復習"
          >
            <Text style={s.reviewHubIcon}>🌙</Text>
            <Text style={[s.reviewHubValue, preSleepCount > 0 ? { color: colors.primary } : {}]}>{preSleepCount}</Text>
            <Text style={s.reviewHubLabel}>就寝前</Text>
          </Pressable>
        </View>

        {/* Upgrade Banner */}
        {subscription.plan === 'free' && (
          <Pressable style={s.upgradeBanner} onPress={() => router.push('/paywall')}>
            <View style={s.upgradeLeft}>
              <Text style={s.upgradeIcon}>✨</Text>
              <View>
                <Text style={s.upgradeTitle}>PREMIUMプラン</Text>
                <Text style={s.upgradeDesc}>全問題・AI解説が使い放題</Text>
              </View>
            </View>
            <View style={s.upgradeBtn}>
              <Text style={s.upgradeBtnText}>詳細</Text>
            </View>
          </Pressable>
        )}

        {/* ════════ 学習の記録: stats/履歴をこのグループに集約 ════════ */}
        <Text style={s.hubTitle}>📊 学習の記録</Text>

        {/* Hero Stats */}
        <View style={[s.heroCard, Shadow.md]}>
          <View style={s.heroRow}>
            <View style={s.heroItem}>
              <Text style={s.heroValue}>{stats.totalQuestions}</Text>
              <Text style={s.heroLabel}>総解答数</Text>
            </View>
            <View style={s.heroDivider} />
            <Pressable
              style={s.heroItem}
              onPress={() => infoAlert(
                '習得カバー率について',
                'これは合格判定ではなく「学習の網羅度」です。\n「3回連続で正解した問題」が全問題に占める割合を表します。\n\n合格の目安は予測スコア（予測ハブ）で確認してください。',
              )}
            >
              <Text style={[s.heroValue, { color: colors.primary }]}>{rate}%</Text>
              <Text style={s.heroLabel}>習得カバー率 ⓘ</Text>
            </Pressable>
            <View style={s.heroDivider} />
            <View style={s.heroItem}>
              <Text style={[s.heroValue, { color: colors.accent }]}>{stats.streak}</Text>
              <Text style={s.heroLabel}>連続日数</Text>
            </View>
          </View>
          {stats.longestStreak > 0 && (
            <View style={s.heroFooter}>
              <Text style={s.heroFooterText}>🏆 最長記録：{stats.longestStreak}日連続</Text>
            </View>
          )}
        </View>

        {/* ── 直近7日間の学習バーチャート + 進捗率（ホームから集約） ── */}
        {stats.totalQuestions > 0 && (
          <View style={[s.heatmapCard, Shadow.sm]}>
            <StudyHeatmap dailyLog={dailyLog} streak={stats.streak} dailyGoal={dailyGoal} />
            <View style={s.heatmapProgressRow}>
              <Text style={s.heatmapProgressLabel}>学習進捗（出題範囲のカバー率）</Text>
              <Text style={[s.heatmapProgressValue, { color: colors.primary }]}>{progressPct}%</Text>
            </View>
          </View>
        )}

        {/* AI解説の今日の残数 (旧 Quick Metrics から残置・情報表示) */}
        <View style={s.metricRow}>
          <View style={[s.metricCard, Shadow.sm]}>
            <Text style={s.metricIcon}>🤖</Text>
            <Text style={s.metricValue}>
              {`${aiUsedToday}/${aiDailyLimit}`}
            </Text>
            <Text style={s.metricLabel}>AI解説 (今日)</Text>
          </View>
        </View>

        {/* Category Analysis */}
        <Text style={s.sectionTitle}>科目別分析</Text>
        {/* 弱点ヒートマップ導線 (ホームの tile を廃止し、詳細はここから到達) */}
        <Pressable
          style={[s.achieveCard, Shadow.sm]}
          onPress={() => router.push('/heatmap')}
          accessibilityRole="button"
          accessibilityLabel="弱点ヒートマップを開く"
        >
          <View style={s.achieveHeader}>
            <Text style={s.achieveTitle}>🗺️ 弱点ヒートマップを見る</Text>
            <Text style={s.achieveArrow}>›</Text>
          </View>
          <Text style={[s.heroLabel, { marginTop: 6 }]}>サブカテゴリ別の正答率を一覧で確認</Text>
        </Pressable>
        {CATEGORIES.map((cat) => {
          const accuracy = getCategoryAccuracy(cat);
          const cs = stats.categoryStats[cat];
          const catTotal = getCategoryStats('takken').find((c) => c.category === cat)?.total ?? 0;
          const pct = catTotal > 0 ? Math.round(accuracy * 100) : 0;
          const color = CATEGORY_COLORS[cat];

          return (
            <View key={cat} style={[s.catCard, Shadow.sm]}>
              <View style={s.catHeader}>
                <View style={s.catLeft}>
                  <View style={[s.catIconWrap, { backgroundColor: color + '14' }]}>
                    <Text style={s.catIcon}>{CATEGORY_ICONS[cat]}</Text>
                  </View>
                  <View>
                    <Text style={s.catName}>{CATEGORY_LABELS[cat]}</Text>
                    <Text style={s.catSub}>{cs.correct}問正解 / 全{catTotal}問</Text>
                  </View>
                </View>
                <Text style={[s.catPct, { color }]}>{pct}%</Text>
              </View>
              <View style={s.catTrack}>
                <View style={[s.catFill, { width: `${pct}%`, backgroundColor: color }]} />
              </View>
            </View>
          );
        })}

        {/* ── 模試受験履歴 ── */}
        {examHistory.length > 0 && (
          <>
            <Text style={s.sectionTitle}>模試スコア推移</Text>
            <View style={[s.examHistCard, Shadow.sm]}>
              <View style={s.examHistScores}>
                <View style={s.examHistStat}>
                  <Text style={s.examHistStatLabel}>受験回数</Text>
                  <Text style={s.examHistStatVal}>{examHistory.length}回</Text>
                </View>
                <View style={s.examHistStat}>
                  <Text style={s.examHistStatLabel}>最高点</Text>
                  <Text style={[s.examHistStatVal, { color: colors.primary }]}>
                    {Math.max(...examHistory.map((r) => r.score))}点
                  </Text>
                </View>
                <View style={s.examHistStat}>
                  <Text style={s.examHistStatLabel}>最新</Text>
                  <Text style={s.examHistStatVal}>
                    {examHistory[examHistory.length - 1].score}点
                  </Text>
                </View>
              </View>
              <View style={s.examHistBars}>
                {examHistory.slice(-10).map((r) => (
                  <View key={r.id} style={s.examHistBarCol}>
                    <View style={s.examHistBarTrack}>
                      <View style={[
                        s.examHistBarFill,
                        { height: `${(r.score / 50) * 100}%`, backgroundColor: r.passed ? colors.primary : colors.error },
                      ]} />
                    </View>
                    <Text style={s.examHistBarLabel}>{r.score}</Text>
                    <Text style={s.examHistBarDate}>
                      {new Date(r.date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}

        {/* ── マスター済み問題（手動卒業）──
            問題画面で 🎓 ボタンを押した問題が復習・苦手リストから永久除外される。
            ユーザー報告: 「完全に理解した問題は復習から外したい」への対応 */}
        <Text style={s.sectionTitle}>マスター済み</Text>
        <Pressable style={[s.achieveCard, Shadow.sm]} onPress={() => router.push('/mastered')}>
          <View style={s.achieveHeader}>
            <Text style={s.achieveTitle}>
              🎓 {masteredManualCount}問 を復習から除外中
            </Text>
            <Text style={s.achieveArrow}>›</Text>
          </View>
          <Text style={[s.heroLabel, { marginTop: 6 }]}>
            {masteredManualCount === 0
              ? '問題画面の 🎓 ボタンで「もう不要」とマークできます'
              : 'タップで一覧表示・個別解除できます'}
          </Text>
        </Pressable>

        {/* ── 実績バッジ概要 ── */}
        <Text style={s.sectionTitle}>実績バッジ</Text>
        <Pressable style={[s.achieveCard, Shadow.sm]} onPress={() => router.push('/achievements')}>
          <View style={s.achieveHeader}>
            <Text style={s.achieveTitle}>
              🏅 {Object.keys(achievementUnlocked).length}/{ALL_ACHIEVEMENTS.length} 獲得済み
            </Text>
            <Text style={s.achieveArrow}>›</Text>
          </View>
          <View style={s.achieveTrack}>
            <View style={[
              s.achieveFill,
              { width: `${Math.round((Object.keys(achievementUnlocked).length / ALL_ACHIEVEMENTS.length) * 100)}%` },
            ]} />
          </View>
          {/* 最近獲得したバッジ（最大4個表示） */}
          <View style={s.achieveRecent}>
            {ALL_ACHIEVEMENTS
              .filter((a) => achievementUnlocked[a.id])
              .sort((a, b) => (achievementUnlocked[b.id] || '').localeCompare(achievementUnlocked[a.id] || ''))
              .slice(0, 4)
              .map((a) => (
                <View key={a.id} style={s.achieveBadge}>
                  <Text style={s.achieveBadgeIcon}>{a.icon}</Text>
                  <Text style={s.achieveBadgeText} numberOfLines={1}>{a.title}</Text>
                </View>
              ))}
            {Object.keys(achievementUnlocked).length === 0 && (
              <Text style={s.achieveEmpty}>問題を解いてバッジを獲得しよう</Text>
            )}
          </View>
        </Pressable>

        {/* ════════ 設定 ════════ */}
        <Text style={s.hubTitle}>⚙️ 設定</Text>

        {/* 設定 */}
        <SettingsSection />

        {/* サブスクリプション管理 */}
        <SubscriptionSection />

        {/* アカウント */}
        <AccountSection />

        {/* 管理者専用セクション */}
        {isAdmin && (
          <View style={s.legalBox}>
            <Text style={s.legalTitle}>🛠 管理者ツール</Text>
            <Pressable style={s.legalRow} onPress={() => router.push('/admin/stats')}>
              <Text style={s.legalRowText}>📊 管理ダッシュボード</Text>
              <Text style={s.legalArrow}>›</Text>
            </Pressable>
            <Pressable style={s.legalRow} onPress={() => router.push('/admin/review')}>
              <Text style={s.legalRowText}>🔎 問題レビュー（needsReview 精査）</Text>
              <Text style={s.legalArrow}>›</Text>
            </Pressable>
          </View>
        )}

        {/* 法的情報・サポート */}
        <View style={s.legalBox}>
          <Text style={s.legalTitle}>アプリ情報・サポート</Text>
          <Pressable style={s.legalRow} onPress={() => router.push('/feedback')}>
            <Text style={s.legalRowText}>💬 お問い合わせ・要望</Text>
            <Text style={s.legalArrow}>›</Text>
          </Pressable>
          <Pressable style={s.legalRow} onPress={() => router.push('/legal/privacy')}>
            <Text style={s.legalRowText}>プライバシーポリシー</Text>
            <Text style={s.legalArrow}>›</Text>
          </Pressable>
          <Pressable style={s.legalRow} onPress={() => router.push('/legal/terms')}>
            <Text style={s.legalRowText}>利用規約</Text>
            <Text style={s.legalArrow}>›</Text>
          </Pressable>
          <Pressable style={s.legalRow} onPress={() => router.push('/legal/tokushoho')}>
            <Text style={s.legalRowText}>特定商取引法に基づく表記</Text>
            <Text style={s.legalArrow}>›</Text>
          </Pressable>
        </View>

        {/* Reset */}
        <Pressable style={s.resetBtn} onPress={handleReset}>
          <Text style={s.resetBtnText}>学習データをリセット</Text>
        </Pressable>

        <Text style={s.versionText}>バージョン {APP_VERSION}</Text>

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.background },
    scroll: { padding: Spacing.xl },
    title: {
      fontSize: FontSize.title1,
      fontWeight: '800',
      color: C.text,
      letterSpacing: LetterSpacing.tight,
      marginBottom: Spacing.lg,
    },

    // ─── Hero ───
    heroCard: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.xl,
      padding: Spacing.xxl,
      marginBottom: Spacing.lg,
    },
    heroRow: { flexDirection: 'row', justifyContent: 'space-around' },
    heroItem: { alignItems: 'center' },
    heroValue: {
      fontSize: 28,
      fontWeight: '800',
      color: C.text,
      letterSpacing: LetterSpacing.tight,
    },
    heroLabel: {
      fontSize: FontSize.caption,
      color: C.textSecondary,
      marginTop: 4,
      fontWeight: '500',
      letterSpacing: LetterSpacing.wide,
    },
    heroDivider: { width: 1, backgroundColor: C.borderLight },
    heroFooter: {
      marginTop: 16,
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: C.borderLight,
      alignItems: 'center',
    },
    heroFooterText: {
      fontSize: FontSize.subhead,
      color: C.accent,
      fontWeight: '700',
    },

    // ─── Metrics ───
    // ─── 復習ハブ (4入口) ───
    reviewHubGrid: { flexDirection: 'row', gap: 10, marginBottom: Spacing.lg },
    reviewHubCard: {
      flex: 1,
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      paddingVertical: 14,
      paddingHorizontal: 6,
      alignItems: 'center',
    },
    reviewHubIcon: { fontSize: 22, marginBottom: 6 },
    reviewHubValue: {
      fontSize: FontSize.title3,
      fontWeight: '800',
      color: C.text,
    },
    reviewHubLabel: {
      fontSize: FontSize.caption2,
      color: C.textSecondary,
      marginTop: 3,
      fontWeight: '600',
      letterSpacing: LetterSpacing.wide,
      textAlign: 'center',
    },

    metricRow: { flexDirection: 'row', gap: 10, marginBottom: Spacing.lg },
    metricCard: {
      flex: 1,
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      padding: 14,
      alignItems: 'center',
    },
    metricIcon: { fontSize: 22, marginBottom: 6 },
    metricValue: {
      fontSize: FontSize.title3,
      fontWeight: '800',
      color: C.text,
    },
    metricLabel: {
      fontSize: FontSize.caption2,
      color: C.textSecondary,
      marginTop: 3,
      fontWeight: '500',
      letterSpacing: LetterSpacing.wide,
    },

    // ─── 直近7日グラフ (ホームから集約) ───
    heatmapCard: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.xl,
      padding: 16,
      marginBottom: Spacing.lg,
    },
    heatmapProgressRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 14,
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: C.borderLight,
    },
    heatmapProgressLabel: {
      fontSize: FontSize.footnote,
      fontWeight: '700',
      color: C.text,
    },
    heatmapProgressValue: {
      fontSize: FontSize.headline,
      fontWeight: '800',
    },

    // ─── 本試験予測 (データ0 フォールバック用の最小スタイル) ───
    examCard: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.xl,
      padding: 20,
      marginBottom: Spacing.lg,
    },
    examTitle: {
      fontSize: FontSize.headline,
      fontWeight: '800',
      color: C.text,
    },
    examHint: {
      fontSize: FontSize.caption,
      color: C.textTertiary,
      textAlign: 'center',
      marginTop: 14,
    },

    // ─── 予測ハブ (① PredictionCard + ③ 失点 + ④ 模試突合) ───
    hubTitle: {
      fontSize: FontSize.title3,
      fontWeight: '800',
      color: C.text,
      marginBottom: Spacing.md,
      letterSpacing: LetterSpacing.tight,
    },
    hubSection: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.xl,
      padding: Spacing.lg,
      marginTop: Spacing.md,
      marginBottom: Spacing.lg,
    },
    hubSectionTitle: {
      fontSize: FontSize.subhead,
      fontWeight: '800',
      color: C.text,
      marginBottom: Spacing.md,
    },
    // 失点ランキング (▲記号 + 点数 の三重符号化)
    lossRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: 0.5,
      borderBottomColor: C.borderLight,
    },
    lossRank: {
      fontSize: FontSize.subhead,
      fontWeight: '900',
      color: C.error,
      width: 32,
    },
    lossLabel: {
      fontSize: FontSize.footnote,
      fontWeight: '700',
      color: C.text,
    },
    lossCat: {
      fontSize: FontSize.caption2,
      color: C.textSecondary,
      marginTop: 2,
    },
    lossPoints: {
      fontSize: FontSize.headline,
      fontWeight: '900',
      color: C.error,
    },
    lossSummary: {
      fontSize: FontSize.footnote,
      fontWeight: '700',
      color: C.primary,
      marginTop: Spacing.md,
      lineHeight: LineHeight.footnote * 1.3,
    },
    heatmapLink: {
      marginTop: Spacing.md,
      paddingTop: Spacing.md,
      borderTopWidth: 1,
      borderTopColor: C.borderLight,
    },
    heatmapLinkText: {
      fontSize: FontSize.footnote,
      fontWeight: '700',
      color: C.primary,
    },
    // 模試突合 ④
    mockCta: {
      backgroundColor: C.background,
      borderRadius: BorderRadius.md,
      padding: Spacing.md,
    },
    mockCtaText: {
      fontSize: FontSize.caption,
      color: C.textSecondary,
      lineHeight: LineHeight.caption * 1.4,
    },
    mockCtaBtn: {
      fontSize: FontSize.footnote,
      fontWeight: '800',
      color: C.primary,
      marginTop: 8,
    },
    mockCompareRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      marginBottom: Spacing.sm,
    },
    mockCompareItem: { alignItems: 'center' },
    mockCompareLabel: {
      fontSize: FontSize.caption2,
      color: C.textTertiary,
      fontWeight: '600',
    },
    mockCompareVal: {
      fontSize: FontSize.title3,
      fontWeight: '900',
      color: C.text,
      marginTop: 2,
    },
    mockCompareVs: {
      fontSize: FontSize.headline,
      color: C.textTertiary,
    },
    mockVerdict: {
      fontSize: FontSize.footnote,
      fontWeight: '700',
      textAlign: 'center',
      marginTop: Spacing.sm,
    },
    mockTrendHint: {
      fontSize: FontSize.caption2,
      color: C.textTertiary,
      textAlign: 'center',
      marginTop: 6,
    },

    // ─── Upgrade ───
    upgradeBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: C.warningSurface,
      borderRadius: BorderRadius.lg,
      padding: Spacing.lg,
      marginBottom: Spacing.xxl,
      borderWidth: 1,
      borderColor: C.accent + '50',
    },
    upgradeLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    upgradeIcon: { fontSize: 24 },
    upgradeTitle: { fontSize: FontSize.subhead, fontWeight: '700', color: C.accent },
    upgradeDesc: { fontSize: FontSize.caption, color: C.accent, marginTop: 2, opacity: 0.85 },
    upgradeBtn: {
      backgroundColor: C.accent,
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: BorderRadius.sm,
    },
    upgradeBtnText: { fontSize: FontSize.footnote, fontWeight: '700', color: C.white },

    // ─── Section ───
    sectionTitle: {
      fontSize: FontSize.title3,
      fontWeight: '800',
      color: C.text,
      marginBottom: Spacing.md,
      letterSpacing: LetterSpacing.tight,
    },

    // ─── Category ───
    catCard: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      padding: Spacing.lg,
      marginBottom: 10,
    },
    catHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    catLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    catIconWrap: {
      width: 40,
      height: 40,
      borderRadius: BorderRadius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    catIcon: { fontSize: 20 },
    catName: { fontSize: FontSize.subhead, fontWeight: '700', color: C.text },
    catSub: { fontSize: FontSize.caption, color: C.textSecondary, marginTop: 2 },
    catPct: { fontSize: FontSize.title2, fontWeight: '800' },
    catTrack: {
      height: 6,
      backgroundColor: C.borderLight,
      borderRadius: 3,
      overflow: 'hidden',
      marginTop: Spacing.md,
    },
    catFill: { height: '100%', borderRadius: 3 },

    // ─── Exam History ───
    examHistCard: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.xl,
      padding: Spacing.lg,
      marginBottom: Spacing.md,
    },
    examHistScores: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginBottom: 14,
    },
    examHistStat: { alignItems: 'center' },
    examHistStatLabel: {
      fontSize: FontSize.caption2,
      color: C.textTertiary,
      fontWeight: '500',
    },
    examHistStatVal: {
      fontSize: FontSize.title3,
      fontWeight: '800',
      color: C.text,
      marginTop: 2,
    },
    examHistBars: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 6,
      height: 80,
    },
    examHistBarCol: {
      flex: 1,
      alignItems: 'center',
    },
    examHistBarTrack: {
      width: '100%',
      height: 60,
      backgroundColor: C.borderLight,
      borderRadius: 3,
      overflow: 'hidden',
      justifyContent: 'flex-end',
    },
    examHistBarFill: {
      width: '100%',
      borderRadius: 3,
    },
    examHistBarLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: C.textSecondary,
      marginTop: 3,
    },
    examHistBarDate: {
      fontSize: 8,
      color: C.textTertiary,
      marginTop: 1,
    },

    // ─── Achievements ───
    achieveCard: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.xl,
      padding: Spacing.lg,
      marginBottom: Spacing.md,
    },
    achieveHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    achieveTitle: {
      fontSize: FontSize.subhead,
      fontWeight: '700',
      color: C.text,
    },
    achieveArrow: {
      fontSize: 22,
      color: C.textTertiary,
      fontWeight: '300',
    },
    achieveTrack: {
      height: 6,
      backgroundColor: C.borderLight,
      borderRadius: 3,
      overflow: 'hidden',
      marginTop: 10,
    },
    achieveFill: {
      height: '100%',
      backgroundColor: '#F59E0B',
      borderRadius: 3,
    },
    achieveRecent: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 12,
    },
    achieveBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.surface,
      borderRadius: BorderRadius.md,
      paddingHorizontal: 10,
      paddingVertical: 6,
      gap: 4,
    },
    achieveBadgeIcon: { fontSize: 16 },
    achieveBadgeText: {
      fontSize: FontSize.caption2,
      fontWeight: '600',
      color: C.textSecondary,
      maxWidth: 80,
    },
    achieveEmpty: {
      fontSize: FontSize.caption,
      color: C.textTertiary,
      fontStyle: 'italic',
    },

    // ─── Reset ───
    resetBtn: {
      marginTop: Spacing.xxxl,
      paddingVertical: Spacing.lg,
      borderRadius: BorderRadius.lg,
      borderWidth: 1.5,
      borderColor: C.error + '30',
      alignItems: 'center',
      backgroundColor: C.error + '06',
    },
    resetBtnText: { fontSize: FontSize.subhead, fontWeight: '600', color: C.error },

    // ─── Legal ───
    legalBox: {
      marginTop: Spacing.xxl,
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm,
    },
    legalTitle: {
      fontSize: FontSize.caption,
      fontWeight: '700',
      color: C.textTertiary,
      marginTop: 8,
      marginBottom: 4,
      letterSpacing: LetterSpacing.wide,
    },
    legalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 14,
      borderTopWidth: 1,
      borderTopColor: C.borderLight,
    },
    legalRowText: { fontSize: FontSize.subhead, color: C.text },
    legalArrow: { fontSize: 20, color: C.textTertiary },

    // ─── Version ───
    versionText: {
      fontSize: FontSize.caption,
      color: C.textTertiary,
      textAlign: 'center',
      marginTop: Spacing.lg,
      marginBottom: Spacing.xl,
    },
  });
}
