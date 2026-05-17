// ============================================================
// マスター済み問題 一覧画面
// 問題画面の 🎓 ボタンで手動卒業した問題のリスト表示・解除
// ユーザー要望: 「完全に理解した問題は復習からはずせるように」
// ============================================================

import { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import {
  FontSize,
  LineHeight,
  Spacing,
  BorderRadius,
  Shadow,
} from '../constants/theme';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';
import { useProgressStore } from '../store/useProgressStore';
import { getQuestionById } from '../data';
import { CATEGORY_LABELS, type Category } from '../types';
import { WebBackButton } from '../components/WebBackButton';
import { confirmAlert } from '../services/alert';

export default function MasteredScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const getManuallyMasteredIds = useProgressStore((st) => st.getManuallyMasteredIds);
  const unmarkMastered = useProgressStore((st) => st.unmarkMastered);
  // 再レンダリングを progress 変化で発火させる
  const progressMap = useProgressStore((st) => st.progress);

  const masteredIds = useMemo(
    () => getManuallyMasteredIds(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [progressMap, getManuallyMasteredIds],
  );

  /** カテゴリ別にグループ化 */
  const grouped = useMemo(() => {
    const groups: Record<Category, { id: string; text: string; subcategory: string | undefined }[]> = {
      kenri: [],
      takkengyoho: [],
      horei_seigen: [],
      tax_other: [],
    };
    for (const id of masteredIds) {
      const q = getQuestionById(id);
      if (!q) continue;
      const head = q.text.substring(0, 60) + (q.text.length > 60 ? '…' : '');
      groups[q.category].push({ id, text: head, subcategory: q.tags?.[0] });
    }
    return groups;
  }, [masteredIds]);

  const handleUnmark = async (id: string) => {
    const ok = await confirmAlert(
      'マスター済みを解除しますか？',
      'この問題が再び復習・苦手リストに表示されるようになります。',
      { okText: '解除する' },
    );
    if (ok) {
      unmarkMastered(id);
    }
  };

  const handleUnmarkAll = async () => {
    if (masteredIds.length === 0) return;
    const ok = await confirmAlert(
      `${masteredIds.length}問 すべて解除しますか？`,
      'すべてのマスター済み問題が復習対象に戻ります。\nこの操作は取り消せません。',
      { okText: 'すべて解除', destructive: true },
    );
    if (ok) {
      for (const id of masteredIds) {
        unmarkMastered(id);
      }
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen options={{ title: 'マスター済み問題', headerBackTitle: '戻る' }} />
      <WebBackButton />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Text style={s.title}>🎓 マスター済み問題</Text>
          <Text style={s.subtitle}>
            {masteredIds.length === 0
              ? '完全に理解した問題は問題画面の 🎓 ボタンで除外できます'
              : `${masteredIds.length}問 を復習・苦手リストから除外中`}
          </Text>
        </View>

        {masteredIds.length === 0 ? (
          <View style={[s.emptyCard, Shadow.sm]}>
            <Text style={s.emptyIcon}>🎓</Text>
            <Text style={s.emptyTitle}>マスター済みの問題はまだありません</Text>
            <Text style={s.emptyText}>
              問題を解いている途中で「もう完璧に理解した」と感じたら、画面上部の 🎓 ボタンを押すと、その問題は復習リスト・苦手リストから自動的に外れます。
              {'\n\n'}
              一度マスターした問題はこの画面から個別に解除できます。
            </Text>
          </View>
        ) : (
          <>
            {/* 一括解除 */}
            <Pressable style={[s.unmarkAllBtn, Shadow.sm]} onPress={handleUnmarkAll}>
              <Text style={s.unmarkAllText}>すべて解除して復習に戻す</Text>
            </Pressable>

            {(['kenri', 'takkengyoho', 'horei_seigen', 'tax_other'] as Category[]).map((cat) => {
              const items = grouped[cat];
              if (items.length === 0) return null;
              return (
                <View key={cat} style={s.section}>
                  <Text style={s.sectionTitle}>
                    {CATEGORY_LABELS[cat]} ({items.length}問)
                  </Text>
                  {items.map((item) => (
                    <View key={item.id} style={[s.row, Shadow.sm]}>
                      <Pressable
                        style={s.rowMain}
                        onPress={() => router.push(`/question/${item.id}`)}
                        accessibilityRole="button"
                        accessibilityLabel="この問題を開く"
                      >
                        <Text style={s.rowText} numberOfLines={2}>
                          {item.text}
                        </Text>
                        {item.subcategory ? (
                          <Text style={s.rowSub}>{item.subcategory}</Text>
                        ) : null}
                      </Pressable>
                      <Pressable
                        style={s.unmarkBtn}
                        onPress={() => handleUnmark(item.id)}
                        accessibilityRole="button"
                        accessibilityLabel="マスター済みを解除"
                      >
                        <Text style={s.unmarkBtnText}>解除</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              );
            })}
          </>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.background },
    scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: 40 },
    header: { marginBottom: Spacing.lg },
    title: {
      fontSize: FontSize.title2,
      fontWeight: '800',
      color: C.text,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: FontSize.subhead,
      color: C.textSecondary,
      lineHeight: LineHeight.subhead,
    },
    emptyCard: {
      backgroundColor: C.surface,
      borderRadius: BorderRadius.lg,
      padding: Spacing.xl,
      alignItems: 'center',
    },
    emptyIcon: { fontSize: 48, marginBottom: 12 },
    emptyTitle: {
      fontSize: FontSize.headline,
      fontWeight: '700',
      color: C.text,
      marginBottom: 8,
      textAlign: 'center',
    },
    emptyText: {
      fontSize: FontSize.subhead,
      color: C.textSecondary,
      lineHeight: LineHeight.subhead,
      textAlign: 'left',
    },
    unmarkAllBtn: {
      backgroundColor: C.errorSurface,
      borderRadius: BorderRadius.md,
      paddingVertical: 12,
      alignItems: 'center',
      marginBottom: Spacing.lg,
    },
    unmarkAllText: {
      fontSize: FontSize.subhead,
      fontWeight: '700',
      color: C.error,
    },
    section: { marginBottom: Spacing.lg },
    sectionTitle: {
      fontSize: FontSize.subhead,
      fontWeight: '700',
      color: C.textSecondary,
      marginBottom: 8,
      marginTop: 4,
    },
    row: {
      flexDirection: 'row',
      backgroundColor: C.surface,
      borderRadius: BorderRadius.md,
      padding: Spacing.md,
      marginBottom: 8,
      alignItems: 'center',
    },
    rowMain: { flex: 1, paddingRight: 12 },
    rowText: {
      fontSize: FontSize.subhead,
      color: C.text,
      lineHeight: LineHeight.subhead,
    },
    rowSub: {
      fontSize: FontSize.caption2,
      color: C.textTertiary,
      marginTop: 4,
    },
    unmarkBtn: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      backgroundColor: C.errorSurface,
      borderRadius: BorderRadius.sm,
    },
    unmarkBtnText: {
      fontSize: FontSize.caption,
      fontWeight: '700',
      color: C.error,
    },
  });
}
