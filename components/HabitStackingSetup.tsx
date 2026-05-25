// ============================================================
// 宅建士 完全対策 - 習慣スタッキング設定コンポーネント
// ============================================================
// オンボーディング（compact=false）と設定画面（compact=true）の両方で使用
// プリセットの文言編集・オリジナル習慣の追加・通知時刻設定に対応

import { useMemo, useCallback, useState, useRef } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, Platform } from 'react-native';
import { Shadow, FontSize, Spacing, BorderRadius } from '../constants/theme';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';
import type { HabitStack } from '../types';

interface HabitStackingSetupProps {
  selectedHabits: HabitStack[];
  onUpdate: (habits: HabitStack[]) => void;
  compact?: boolean;  // true = settings mode (smaller), false = onboarding mode (full page)
}

/** プリセットでないカスタム習慣かどうか */
function isCustomHabit(id: string): boolean {
  return id.startsWith('custom_');
}

/** HH:MM 入力をバリデーション＆整形 */
function parseTimeInput(raw: string): string | null {
  // "730" → "07:30", "8" → "08:00", "12:30" → "12:30"
  const cleaned = raw.replace(/[^0-9:]/g, '');
  let h: number, m: number;

  if (cleaned.includes(':')) {
    const parts = cleaned.split(':');
    h = parseInt(parts[0], 10);
    m = parseInt(parts[1] || '0', 10);
  } else if (cleaned.length <= 2) {
    h = parseInt(cleaned, 10);
    m = 0;
  } else {
    // "730" → 7:30, "1230" → 12:30
    h = parseInt(cleaned.slice(0, -2), 10);
    m = parseInt(cleaned.slice(-2), 10);
  }

  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export default function HabitStackingSetup({
  selectedHabits,
  onUpdate,
  compact = false,
}: HabitStackingSetupProps) {
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors, compact), [colors, compact]);

  // 編集中のカードID
  const [editingId, setEditingId] = useState<string | null>(null);
  // 時刻入力のローカル一時状態（入力中はローカルで保持し、確定時に反映）
  const [timeInputs, setTimeInputs] = useState<Record<string, string>>({});

  /** ON/OFFトグル */
  const toggleHabit = useCallback(
    (id: string) => {
      // 編集中のカードは toggle しない（テキスト入力が優先）
      if (editingId === id) return;
      const updated = selectedHabits.map((h) =>
        h.id === id ? { ...h, enabled: !h.enabled } : h,
      );
      onUpdate(updated);
    },
    [selectedHabits, onUpdate, editingId],
  );

  /** テキスト変更 */
  const updateField = useCallback(
    (id: string, field: 'trigger' | 'action', value: string) => {
      const updated = selectedHabits.map((h) =>
        h.id === id ? { ...h, [field]: value } : h,
      );
      onUpdate(updated);
    },
    [selectedHabits, onUpdate],
  );

  /** 通知時刻変更 */
  const updateNotifyTime = useCallback(
    (id: string, time: string | undefined) => {
      const updated = selectedHabits.map((h) =>
        h.id === id ? { ...h, notifyAt: time } : h,
      );
      onUpdate(updated);
    },
    [selectedHabits, onUpdate],
  );

  /** 編集モード切替 */
  const toggleEdit = useCallback((id: string) => {
    setEditingId((prev) => (prev === id ? null : id));
  }, []);

  /** オリジナル習慣を追加 */
  const addCustomHabit = useCallback(() => {
    const newId = `custom_${Date.now()}`;
    const newHabit: HabitStack = {
      id: newId,
      trigger: '',
      action: '',
      icon: '✨',
      enabled: true,
      notifyAt: '08:00',
    };
    onUpdate([...selectedHabits, newHabit]);
    setEditingId(newId);
  }, [selectedHabits, onUpdate]);

  /** カスタム習慣を削除 */
  const removeHabit = useCallback(
    (id: string) => {
      if (editingId === id) setEditingId(null);
      onUpdate(selectedHabits.filter((h) => h.id !== id));
    },
    [selectedHabits, onUpdate, editingId],
  );

  return (
    <View style={s.container}>
      {compact && (
        <>
          <Text style={s.title}>習慣スタッキング</Text>
          <Text style={s.subtitle}>
            既存の習慣に学習をくっつけよう（文言・通知時刻は自由に編集可能）
          </Text>
        </>
      )}

      <View style={s.list}>
        {selectedHabits.map((habit) => {
          const active = habit.enabled;
          const editing = editingId === habit.id;
          const custom = isCustomHabit(habit.id);

          return (
            <View key={habit.id} style={[s.card, active && s.cardActive]}>
              {/* メインカードエリア */}
              <Pressable
                style={s.cardContent}
                onPress={() => toggleHabit(habit.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: active }}
                accessibilityLabel={`${habit.trigger || '未設定'} → ${habit.action || '未設定'}`}
              >
                <Text style={s.cardIcon}>{habit.icon}</Text>

                <View style={s.cardTexts}>
                  {editing ? (
                    /* ── 編集モード ── */
                    <>
                      <TextInput
                        style={[s.cardInput, s.cardTriggerInput]}
                        value={habit.trigger}
                        onChangeText={(v) => updateField(habit.id, 'trigger', v)}
                        placeholder="いつ？（例：朝コーヒーを淹れたら）"
                        placeholderTextColor={colors.textTertiary}
                        autoFocus={!habit.trigger}
                        returnKeyType="next"
                      />
                      <View style={s.arrowRow}>
                        <Text style={[s.arrow, active && s.arrowActive]}>→</Text>
                        <TextInput
                          style={[s.cardInput, s.cardActionInput]}
                          value={habit.action}
                          onChangeText={(v) => updateField(habit.id, 'action', v)}
                          placeholder="何をする？（例：5問解く）"
                          placeholderTextColor={colors.textTertiary}
                          returnKeyType="done"
                          onSubmitEditing={() => setEditingId(null)}
                        />
                      </View>
                    </>
                  ) : (
                    /* ── 表示モード ── */
                    <>
                      <Text
                        style={[s.cardTrigger, active && s.cardTriggerActive]}
                        numberOfLines={1}
                      >
                        {habit.trigger || '（タップして入力）'}
                      </Text>
                      <View style={s.arrowRow}>
                        <Text style={[s.arrow, active && s.arrowActive]}>→</Text>
                        <Text
                          style={[s.cardAction, active && s.cardActionActive]}
                          numberOfLines={1}
                        >
                          {habit.action || '（タップして入力）'}
                        </Text>
                      </View>
                    </>
                  )}
                </View>

                {/* 右側アクション */}
                <View style={s.cardRight}>
                  {/* 編集ボタン（有効時のみ表示） */}
                  {active && (
                    <Pressable
                      onPress={() => toggleEdit(habit.id)}
                      style={s.editBtn}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={editing ? '編集完了' : '文言を編集'}
                    >
                      <Text style={[s.editBtnText, editing && s.editBtnTextDone]}>
                        {editing ? '完了' : '✏️'}
                      </Text>
                    </Pressable>
                  )}
                  {/* 削除ボタン（カスタムのみ） */}
                  {custom && (
                    <Pressable
                      onPress={() => removeHabit(habit.id)}
                      style={s.deleteBtn}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="この習慣を削除"
                    >
                      <Text style={s.deleteBtnText}>×</Text>
                    </Pressable>
                  )}
                  {/* チェックボックス（プリセットのみ） */}
                  {!custom && (
                    <View style={[s.checkbox, active && s.checkboxActive]}>
                      {active && <Text style={s.checkmark}>✓</Text>}
                    </View>
                  )}
                </View>
              </Pressable>

              {/* ── 通知時刻設定（有効時のみ） ── */}
              {active && (
                <View style={s.notifyRow}>
                  <Text style={s.notifyIcon}>🔔</Text>
                  <Text style={s.notifyLabel}>通知</Text>

                  {habit.notifyAt != null ? (
                    <View style={s.timeControl}>
                      <TextInput
                        style={s.timeInput}
                        value={timeInputs[habit.id] ?? habit.notifyAt}
                        onChangeText={(raw) => {
                          // ローカル状態のみ更新（親には反映しない）
                          setTimeInputs((prev) => ({ ...prev, [habit.id]: raw }));
                        }}
                        onBlur={() => {
                          // 確定: バリデーションして親に反映
                          const raw = timeInputs[habit.id] ?? habit.notifyAt ?? '';
                          const parsed = parseTimeInput(raw);
                          updateNotifyTime(habit.id, parsed ?? '08:00');
                          // ローカル一時状態をクリア
                          setTimeInputs((prev) => {
                            const next = { ...prev };
                            delete next[habit.id];
                            return next;
                          });
                        }}
                        placeholder="07:00"
                        placeholderTextColor={colors.textTertiary}
                        keyboardType="numbers-and-punctuation"
                        maxLength={5}
                        selectTextOnFocus
                        accessibilityLabel="通知時刻を入力（例: 07:00）"
                      />
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => updateNotifyTime(habit.id, '08:00')}
                      style={s.setTimeBtn}
                      hitSlop={6}
                    >
                      <Text style={s.setTimeBtnText}>時刻を設定</Text>
                    </Pressable>
                  )}

                  {/* 通知OFF */}
                  {habit.notifyAt && (
                    <Pressable
                      onPress={() => updateNotifyTime(habit.id, undefined)}
                      style={s.notifyOffBtn}
                      hitSlop={6}
                      accessibilityLabel="通知をオフ"
                    >
                      <Text style={s.notifyOffText}>OFF</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* オリジナル追加ボタン */}
      <Pressable
        style={s.addBtn}
        onPress={addCustomHabit}
        accessibilityRole="button"
        accessibilityLabel="オリジナルの習慣を追加"
      >
        <Text style={s.addBtnPlus}>＋</Text>
        <Text style={s.addBtnText}>オリジナルの習慣を追加</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(C: ThemeColors, compact: boolean) {
  return StyleSheet.create({
    container: {
      width: '100%',
    },
    title: {
      fontSize: FontSize.caption,
      fontWeight: '700',
      color: C.text,
      marginTop: 14,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: FontSize.caption,
      color: C.textSecondary,
      marginBottom: 10,
    },
    list: {
      gap: compact ? 8 : 10,
      marginTop: compact ? 0 : 24,
    },

    // ── Card ──
    card: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      borderWidth: 2,
      borderColor: C.border,
      overflow: 'hidden',
      ...Shadow.sm,
    },
    cardActive: {
      borderColor: C.primary,
      backgroundColor: C.primarySurface,
    },
    cardContent: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: compact ? Spacing.md : Spacing.lg,
    },
    cardIcon: {
      fontSize: compact ? 22 : 26,
      marginRight: compact ? 10 : 12,
    },
    cardTexts: {
      flex: 1,
    },

    // ── 表示テキスト ──
    cardTrigger: {
      fontSize: compact ? FontSize.caption : FontSize.subhead,
      fontWeight: '700',
      color: C.text,
    },
    cardTriggerActive: {
      color: C.primary,
    },
    arrowRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 3,
    },
    arrow: {
      fontSize: compact ? FontSize.caption : FontSize.footnote,
      fontWeight: '600',
      color: C.textTertiary,
      marginRight: 6,
    },
    arrowActive: {
      color: C.primary,
    },
    cardAction: {
      fontSize: compact ? FontSize.caption : FontSize.footnote,
      fontWeight: '500',
      color: C.textSecondary,
      flex: 1,
    },
    cardActionActive: {
      color: C.primaryDark,
    },

    // ── 編集TextInput ──
    cardInput: {
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: BorderRadius.sm,
      backgroundColor: C.background,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    cardTriggerInput: {
      fontSize: compact ? FontSize.caption : FontSize.subhead,
      fontWeight: '700',
      color: C.primary,
    },
    cardActionInput: {
      fontSize: compact ? FontSize.caption : FontSize.footnote,
      fontWeight: '500',
      color: C.primaryDark,
      flex: 1,
    },

    // ── 右側アクション ──
    cardRight: {
      alignItems: 'center',
      marginLeft: 8,
      gap: 6,
    },
    editBtn: {
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    editBtnText: {
      fontSize: 16,
    },
    editBtnTextDone: {
      fontSize: FontSize.caption2,
      fontWeight: '700',
      color: C.primary,
    },
    deleteBtn: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: C.error + '20',
      alignItems: 'center',
      justifyContent: 'center',
    },
    deleteBtnText: {
      fontSize: 16,
      fontWeight: '800',
      color: C.error,
      lineHeight: 20,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: BorderRadius.sm,
      borderWidth: 2,
      borderColor: C.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxActive: {
      borderColor: C.primary,
      backgroundColor: C.primary,
    },
    checkmark: {
      fontSize: 14,
      fontWeight: '800',
      color: C.white,
    },

    // ── 通知時刻設定 ──
    notifyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: compact ? Spacing.md : Spacing.lg,
      paddingBottom: compact ? 10 : 12,
      paddingTop: 0,
    },
    notifyIcon: {
      fontSize: 14,
      marginRight: 4,
    },
    notifyLabel: {
      fontSize: FontSize.caption2,
      fontWeight: '600',
      color: C.textSecondary,
      marginRight: 8,
    },
    timeControl: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    timeInput: {
      backgroundColor: C.background,
      borderRadius: BorderRadius.sm,
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: 10,
      paddingVertical: 4,
      fontSize: FontSize.caption,
      fontWeight: '800',
      color: C.primary,
      minWidth: 60,
      textAlign: 'center',
    },
    setTimeBtn: {
      backgroundColor: C.primary + '15',
      borderRadius: BorderRadius.sm,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    setTimeBtnText: {
      fontSize: FontSize.caption2,
      fontWeight: '600',
      color: C.primary,
    },
    notifyOffBtn: {
      marginLeft: 8,
      backgroundColor: C.textTertiary + '20',
      borderRadius: BorderRadius.sm,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    notifyOffText: {
      fontSize: FontSize.caption2,
      fontWeight: '700',
      color: C.textTertiary,
    },

    // ── 追加ボタン ──
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: compact ? 10 : 16,
      paddingVertical: 14,
      borderRadius: BorderRadius.lg,
      borderWidth: 2,
      borderColor: C.border,
      borderStyle: 'dashed',
      backgroundColor: C.card,
    },
    addBtnPlus: {
      fontSize: FontSize.headline,
      fontWeight: '700',
      color: C.primary,
      marginRight: 8,
    },
    addBtnText: {
      fontSize: compact ? FontSize.caption : FontSize.subhead,
      fontWeight: '600',
      color: C.primary,
    },
  });
}
