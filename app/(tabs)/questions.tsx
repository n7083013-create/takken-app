import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  SectionList,
  Pressable,
  TextInput,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Shadow, FontSize, LineHeight, LetterSpacing, Spacing, BorderRadius, DifficultyLabel, DifficultyColor } from '../../constants/theme';
import { CATEGORIES } from '../../constants/exam';
import { useThemeColors, ThemeColors } from '../../hooks/useThemeColors';
import {
  CATEGORY_LABELS,
  CATEGORY_ICONS,
  CATEGORY_COLORS,
  Category,
  SUBCATEGORIES,
  Subcategory,
  Question,
} from '../../types';
import { ALL_QUESTIONS } from '../../data';
import { useProgressStore } from '../../store/useProgressStore';
import { EmptyState } from '../../components/EmptyState';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setAiQueue } from '../../utils/aiQueue';
import {
  getRecommendedQuestionsBySubcategory,
  getRecommendedQuestionsForOther,
} from '../../services/aiAnalysis';

/** タグベースでサブカテゴリに振り分け */
function matchSubcategory(q: Question, subcats: Subcategory[]): string {
  for (const sc of subcats) {
    if (q.tags.some((t) => sc.matchTags.includes(t))) return sc.key;
  }
  return '_other';
}

type SectionData = {
  key: string;
  title: string;
  icon: string;
  count: number;
  data: Question[];
};

export default function QuestionsScreen() {
  const router = useRouter();
  // [UX改善] subcategory パラメータ対応:
  // ホーム画面の「カテゴリ別に解く」「よく出る論点」 chip から直接ジャンプ可能
  const params = useLocalSearchParams<{ category?: string; subcategory?: string }>();
  const getProgress = useProgressStore((s) => s.getProgress);
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(
    params.category && CATEGORIES.includes(params.category as Category)
      ? (params.category as Category)
      : null,
  );
  // [UX改善] 初回マウントから「全サブカテゴリ折り畳み + 集中するボタン押せる状態」で開始
  // (展開してから「集中する」ではなく、開いた瞬間からタップ可能にする)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => {
    if (params.category && CATEGORIES.includes(params.category as Category)) {
      const subcats = SUBCATEGORIES[params.category as Category];
      const allKeys = new Set(subcats.map((sc) => sc.key));
      allKeys.add('_other');
      // subcategory 指定がある場合のみ、その項目だけ展開
      if (params.subcategory && allKeys.has(params.subcategory)) {
        allKeys.delete(params.subcategory);
      }
      return allKeys;
    }
    return new Set();
  });

  // パラメータ変更時にカテゴリを更新（ホーム画面からのナビゲーション対応）
  // - subcategory 指定あり: 該当 subcategory のみ展開 (ピンポイント学習)
  // - subcategory 指定なし: 全セクション折りたたみで一覧表示 (既存挙動)
  useEffect(() => {
    if (params.category && CATEGORIES.includes(params.category as Category)) {
      setSelectedCategory(params.category as Category);
      const subcats = SUBCATEGORIES[params.category as Category];
      const allKeys = new Set(subcats.map((sc) => sc.key));
      allKeys.add('_other');
      // subcategory 指定がある場合は、その項目だけ展開して残りは折り畳み
      if (params.subcategory && allKeys.has(params.subcategory)) {
        allKeys.delete(params.subcategory);
      }
      setCollapsedSections(allKeys);
    }
  }, [params.category, params.subcategory]);

  const toggleSection = useCallback((key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  /** カテゴリ別フィルター */
  const categoryFiltered = useMemo(() => {
    if (selectedCategory) return ALL_QUESTIONS.filter((q) => q.category === selectedCategory);
    return ALL_QUESTIONS;
  }, [selectedCategory]);

  /** 検索フィルター */
  const isSearching = searchText.trim().length > 0;
  const searchFiltered = useMemo(() => {
    if (!isSearching) return categoryFiltered;
    const t = searchText.trim().toLowerCase();
    return categoryFiltered.filter(
      (q) => q.text.toLowerCase().includes(t) || q.tags.some((tag) => tag.toLowerCase().includes(t)),
    );
  }, [categoryFiltered, searchText, isSearching]);

  /** セクション分け */
  const sections: SectionData[] = useMemo(() => {
    const cat = selectedCategory;
    if (!cat || isSearching) {
      // 検索中 or 全カテゴリ → カテゴリ単位でグルーピング
      const grouped = new Map<Category, Question[]>();
      for (const q of searchFiltered) {
        const arr = grouped.get(q.category) || [];
        arr.push(q);
        grouped.set(q.category, arr);
      }
      return CATEGORIES
        .filter((c) => grouped.has(c))
        .map((c) => ({
          key: c,
          title: `${CATEGORY_ICONS[c]} ${CATEGORY_LABELS[c]}`,
          icon: CATEGORY_ICONS[c],
          count: grouped.get(c)!.length,
          data: collapsedSections.has(c) ? [] : grouped.get(c)!,
        }));
    }

    // カテゴリ選択中 → サブカテゴリでグルーピング
    const subcats = SUBCATEGORIES[cat];
    const grouped = new Map<string, Question[]>();
    for (const q of categoryFiltered) {
      const sk = matchSubcategory(q, subcats);
      const arr = grouped.get(sk) || [];
      arr.push(q);
      grouped.set(sk, arr);
    }

    const result: SectionData[] = [];
    for (const sc of subcats) {
      const qs = grouped.get(sc.key);
      if (!qs || qs.length === 0) continue;
      result.push({
        key: sc.key,
        title: `${sc.icon} ${sc.label}`,
        icon: sc.icon,
        count: qs.length,
        data: collapsedSections.has(sc.key) ? [] : qs,
      });
    }
    // タグ未分類の問題
    const others = grouped.get('_other');
    if (others && others.length > 0) {
      result.push({
        key: '_other',
        title: '📦 その他',
        icon: '📦',
        count: others.length,
        data: collapsedSections.has('_other') ? [] : others,
      });
    }
    return result;
  }, [selectedCategory, categoryFiltered, searchFiltered, isSearching, collapsedSections]);

  const totalCount = isSearching ? searchFiltered.length : categoryFiltered.length;

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>問題集</Text>
        <View style={s.countPill}>
          <Text style={s.countText}>{totalCount}問</Text>
        </View>
      </View>

      {/* Search */}
      <View style={s.searchWrap}>
        <View style={s.searchBox}>
          <Text style={s.searchIcon}>🔍</Text>
          <TextInput
            style={s.searchInput}
            placeholder="キーワードで検索..."
            placeholderTextColor={colors.textDisabled}
            value={searchText}
            onChangeText={setSearchText}
          />
          {searchText.length > 0 && (
            <Pressable onPress={() => setSearchText('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="検索をクリア">
              <Text style={s.clearBtn}>✕</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Category Filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.filterScroll}
        contentContainerStyle={s.filterRow}
      >
        <Pressable
          style={[s.chip, !selectedCategory && s.chipActive]}
          onPress={() => setSelectedCategory(null)}
          accessibilityRole="tab"
          accessibilityLabel="すべてのカテゴリを表示"
        >
          <Text style={[s.chipText, !selectedCategory && s.chipTextActive]}>すべて</Text>
        </Pressable>
        {CATEGORIES.map((cat) => {
          const active = selectedCategory === cat;
          return (
            <Pressable
              key={cat}
              style={[
                s.chip,
                active && { backgroundColor: CATEGORY_COLORS[cat], borderColor: CATEGORY_COLORS[cat] },
              ]}
              onPress={() => {
                setSelectedCategory(active ? null : cat);
                setCollapsedSections(new Set());
              }}
              accessibilityRole="tab"
              accessibilityLabel={`${CATEGORY_LABELS[cat]}カテゴリを${active ? '解除' : '選択'}`}
            >
              <Text style={[s.chipText, active && s.chipTextActive]}>
                {CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Question List (SectionList) */}
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.list}
        stickySectionHeadersEnabled={false}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={5}
        renderSectionHeader={({ section }) => {
          const collapsed = collapsedSections.has(section.key);
          const catColor = selectedCategory ? CATEGORY_COLORS[selectedCategory] : colors.primary;
          // [UX改善] サブカテゴリ表示時に「集中する」ボタンを表示
          // (カテゴリ全体表示時は対象外。_other も対象に含める)
          const showFocusBtn = !!selectedCategory;
          return (
            <View style={[s.sectionHeader, Shadow.sm]}>
              <Pressable
                style={s.sectionHeaderMain}
                onPress={() => toggleSection(section.key)}
                accessibilityRole="button"
                accessibilityLabel={`${section.title} ${section.count}問 ${collapsed ? '展開する' : '折りたたむ'}`}
              >
                <View style={s.sectionLeft}>
                  <Text style={s.sectionTitle}>{section.title}</Text>
                  <View style={[s.sectionCount, { backgroundColor: catColor + '14' }]}>
                    <Text style={[s.sectionCountText, { color: catColor }]}>{section.count}問</Text>
                  </View>
                </View>
                <Text style={s.sectionChevron}>{collapsed ? '▸' : '▾'}</Text>
              </Pressable>
              {showFocusBtn && selectedCategory && (
                <Pressable
                  style={[s.focusBtn, { backgroundColor: catColor }]}
                  onPress={async () => {
                    const progress = useProgressStore.getState().progress;
                    let recommended;
                    if (section.key === '_other') {
                      // 「その他」(未分類): カテゴリ内の全 matchTags にマッチしない問題
                      const allMatchTags = SUBCATEGORIES[selectedCategory].flatMap(
                        (sc) => sc.matchTags as string[],
                      );
                      recommended = getRecommendedQuestionsForOther(
                        progress,
                        selectedCategory,
                        allMatchTags,
                        15,
                      );
                    } else {
                      const subcat = SUBCATEGORIES[selectedCategory].find((sc) => sc.key === section.key);
                      if (!subcat) return;
                      recommended = getRecommendedQuestionsBySubcategory(
                        progress,
                        selectedCategory,
                        subcat.matchTags,
                        15,
                      );
                    }
                    if (recommended.length === 0) return;
                    const ids = recommended.map((r) => r.questionId);
                    await setAiQueue(
                      {
                        getItem: (k) => AsyncStorage.getItem(k),
                        setItem: (k, v) => AsyncStorage.setItem(k, v),
                        removeItem: (k) => AsyncStorage.removeItem(k),
                      },
                      ids,
                    );
                    router.push(`/question/${ids[0]}?source=ai` as any);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${section.title}をAI優先で集中して解く`}
                >
                  <Text style={s.focusBtnText}>▶ 集中する</Text>
                </Pressable>
              )}
            </View>
          );
        }}
        renderItem={({ item }) => {
          const prog = getProgress(item.id);
          const catColor = CATEGORY_COLORS[item.category];
          const attempted = prog && prog.attempts > 0;
          const correct = prog && prog.correctCount > 0;

          return (
            <Pressable
              style={[s.qCard, Shadow.sm]}
              onPress={() => router.push(`/question/${item.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`問題: ${item.text}`}
            >
              <View style={[s.qAccent, { backgroundColor: catColor }]} />
              <View style={s.qBody}>
                <View style={s.qTopRow}>
                  <View style={s.qBadges}>
                    {!selectedCategory && (
                      <View style={[s.qBadge, { backgroundColor: catColor + '14' }]}>
                        <Text style={[s.qBadgeText, { color: catColor }]}>
                          {CATEGORY_LABELS[item.category]}
                        </Text>
                      </View>
                    )}
                    <View style={[s.qBadge, { backgroundColor: DifficultyColor[item.difficulty] + '14' }]}>
                      <Text style={[s.qBadgeText, { color: DifficultyColor[item.difficulty] }]}>
                        {DifficultyLabel[item.difficulty]}
                      </Text>
                    </View>
                  </View>
                  <View style={s.qStatusRow}>
                    <View
                      style={[
                        s.qStatusDot,
                        {
                          backgroundColor: !attempted
                            ? colors.textDisabled
                            : correct
                              ? colors.success
                              : colors.error,
                        },
                      ]}
                    />
                    {prog?.bookmarked && <Text style={s.qBookmark}>🔖</Text>}
                  </View>
                </View>
                <Text style={s.qText} numberOfLines={2}>{item.text}</Text>
              </View>
            </Pressable>
          );
        }}
        renderSectionFooter={({ section }) => {
          if (collapsedSections.has(section.key)) return null;
          return <View style={s.sectionSpacer} />;
        }}
        ListEmptyComponent={
          isSearching ? (
            <EmptyState
              icon="🔍"
              title="該当する問題がありません"
              subtitle={`「${searchText.trim()}」に一致する問題が見つかりませんでした`}
              actionLabel="検索をクリア"
              onAction={() => setSearchText('')}
            />
          ) : (
            <EmptyState
              icon="📚"
              title="まだ問題がありません"
              subtitle="このカテゴリの問題を解いてみましょう！最初の一歩が大切です"
            />
          )
        }
      />
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) { return StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },

  // ─── Header ───
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  title: {
    fontSize: FontSize.title1,
    fontWeight: '800',
    color: C.text,
    letterSpacing: LetterSpacing.tight,
  },
  countPill: {
    backgroundColor: C.primarySurface,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: BorderRadius.md,
  },
  countText: {
    fontSize: FontSize.footnote,
    fontWeight: '700',
    color: C.primary,
  },

  // ─── Search ───
  searchWrap: { paddingHorizontal: Spacing.xl, marginBottom: Spacing.md },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  searchIcon: { fontSize: 15, marginRight: 8 },
  searchInput: {
    flex: 1,
    paddingVertical: 13,
    fontSize: FontSize.subhead,
    color: C.text,
    lineHeight: LineHeight.subhead,
  },
  clearBtn: {
    fontSize: 15,
    color: C.textTertiary,
    padding: 4,
  },

  // ─── Filters ───
  filterScroll: { flexShrink: 0, flexGrow: 0 },
  filterRow: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.md, gap: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  chipActive: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: {
    fontSize: FontSize.footnote,
    fontWeight: '600',
    color: C.textSecondary,
  },
  chipTextActive: { color: C.white },

  // ─── Section Headers ───
  sectionHeader: {
    backgroundColor: C.card,
    borderRadius: BorderRadius.lg,
    marginBottom: 8,
    overflow: 'hidden',
  },
  sectionHeaderMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sectionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  // [UX改善] サブカテゴリ集中ボタン
  focusBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  focusBtnText: {
    color: '#fff',
    fontSize: FontSize.footnote,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  sectionTitle: {
    fontSize: FontSize.subhead,
    fontWeight: '700',
    color: C.text,
  },
  sectionCount: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  sectionCountText: {
    fontSize: FontSize.caption2,
    fontWeight: '700',
  },
  sectionChevron: {
    fontSize: FontSize.body,
    color: C.textTertiary,
  },
  sectionSpacer: {
    height: 12,
  },

  // ─── List ───
  list: { paddingHorizontal: Spacing.xl, paddingBottom: 120 },

  // ─── Question Card ───
  qCard: {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderRadius: BorderRadius.md,
    marginBottom: 6,
    marginLeft: 8,
    overflow: 'hidden',
  },
  qAccent: { width: 3 },
  qBody: { flex: 1, paddingHorizontal: 14, paddingVertical: 12 },
  qTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  qBadges: { flexDirection: 'row', gap: 6 },
  qBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: BorderRadius.sm },
  qBadgeText: {
    fontSize: FontSize.caption2,
    fontWeight: '700',
    letterSpacing: LetterSpacing.wide,
  },
  qText: {
    fontSize: FontSize.footnote,
    color: C.text,
    lineHeight: LineHeight.footnote,
  },
  qStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qStatusDot: { width: 7, height: 7, borderRadius: 4 },
  qBookmark: { fontSize: 14 },

  // ─── Empty ───
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 40, marginBottom: 8 },
  emptyText: {
    fontSize: FontSize.body,
    color: C.textTertiary,
  },
}); }
