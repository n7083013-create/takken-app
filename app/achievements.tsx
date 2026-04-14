// ============================================================
// 実績バッジ一覧画面
// ============================================================

import { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontSize, LineHeight, Spacing, BorderRadius, Shadow } from '../constants/theme';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';
import { useAchievementStore, ALL_ACHIEVEMENTS } from '../store/useAchievementStore';

export default function AchievementsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const unlocked = useAchievementStore((s) => s.unlocked);
  const s = useMemo(() => makeStyles(colors), [colors]);

  const unlockedCount = Object.keys(unlocked).length;
  const totalCount = ALL_ACHIEVEMENTS.length;
  const pct = Math.round((unlockedCount / totalCount) * 100);

  // グループ分け
  const groups = useMemo(() => {
    const map: Record<string, typeof ALL_ACHIEVEMENTS> = {};
    for (const a of ALL_ACHIEVEMENTS) {
      let group: string;
      if (a.id.startsWith('streak_')) group = '連続学習';
      else if (a.id.startsWith('answers_')) group = '解答数';
      else if (a.id.startsWith('accuracy_')) group = '正答率';
      else if (a.id.startsWith('exam_')) group = '模擬試験';
      else if (a.id.startsWith('quest_')) group = 'クエスト';
      else if (a.id.startsWith('master_')) group = 'カテゴリ制覇';
      else if (a.id.startsWith('quick_')) group = '一問一答';
      else group = 'その他';
      if (!map[group]) map[group] = [];
      map[group].push(a);
    }
    return Object.entries(map);
  }, []);

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backText}>‹ 戻る</Text>
        </Pressable>
        <Text style={s.headerTitle}>実績バッジ</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={s.hero}>
          <Text style={s.heroIcon}>🏅</Text>
          <Text style={s.heroTitle}>{unlockedCount}/{totalCount}</Text>
          <Text style={s.heroSub}>実績獲得済み</Text>
          <View style={s.heroTrack}>
            <View style={[s.heroFill, { width: `${pct}%` }]} />
          </View>
          <Text style={s.heroPct}>{pct}%</Text>
        </View>

        {/* Badge Groups */}
        {groups.map(([groupName, badges]) => (
          <View key={groupName} style={s.group}>
            <Text style={s.groupTitle}>{groupName}</Text>
            <View style={s.badgeGrid}>
              {badges.map((badge) => {
                const isUnlocked = !!unlocked[badge.id];
                const date = unlocked[badge.id];
                return (
                  <View
                    key={badge.id}
                    style={[
                      s.badgeCard,
                      Shadow.sm,
                      !isUnlocked && s.badgeLocked,
                    ]}
                  >
                    <Text style={[s.badgeIcon, !isUnlocked && s.badgeIconLocked]}>
                      {isUnlocked ? badge.icon : '🔒'}
                    </Text>
                    <Text style={[s.badgeTitle, !isUnlocked && s.badgeTitleLocked]} numberOfLines={1}>
                      {badge.title}
                    </Text>
                    <Text style={[s.badgeCond, !isUnlocked && s.badgeCondLocked]} numberOfLines={2}>
                      {badge.condition}
                    </Text>
                    {isUnlocked && date && (
                      <Text style={s.badgeDate}>
                        {new Date(date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) { return StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: C.borderLight,
  },
  backBtn: { width: 60 },
  backText: { fontSize: FontSize.body, color: C.primary, fontWeight: '600' },
  headerTitle: { fontSize: FontSize.headline, fontWeight: '700', color: C.text },
  scroll: { paddingBottom: 20 },

  // Hero
  hero: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: Spacing.xl,
  },
  heroIcon: { fontSize: 48 },
  heroTitle: {
    fontSize: 36,
    fontWeight: '900',
    color: C.text,
    marginTop: 8,
  },
  heroSub: {
    fontSize: FontSize.subhead,
    color: C.textSecondary,
    fontWeight: '600',
    marginTop: 2,
  },
  heroTrack: {
    width: '60%',
    height: 8,
    backgroundColor: C.borderLight,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 14,
  },
  heroFill: {
    height: '100%',
    backgroundColor: '#F59E0B',
    borderRadius: 4,
  },
  heroPct: {
    fontSize: FontSize.caption,
    fontWeight: '700',
    color: '#F59E0B',
    marginTop: 6,
  },

  // Group
  group: {
    paddingHorizontal: Spacing.xl,
    marginTop: 8,
  },
  groupTitle: {
    fontSize: FontSize.subhead,
    fontWeight: '800',
    color: C.text,
    marginBottom: 10,
    marginTop: 16,
  },
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  badgeCard: {
    width: '31%',
    backgroundColor: C.card,
    borderRadius: BorderRadius.lg,
    padding: 12,
    alignItems: 'center',
    minHeight: 120,
  },
  badgeLocked: {
    opacity: 0.5,
  },
  badgeIcon: {
    fontSize: 28,
  },
  badgeIconLocked: {
    fontSize: 24,
  },
  badgeTitle: {
    fontSize: FontSize.caption,
    fontWeight: '700',
    color: C.text,
    textAlign: 'center',
    marginTop: 6,
  },
  badgeTitleLocked: {
    color: C.textTertiary,
  },
  badgeCond: {
    fontSize: 10,
    color: C.textSecondary,
    textAlign: 'center',
    marginTop: 3,
    lineHeight: 14,
  },
  badgeCondLocked: {
    color: C.textTertiary,
  },
  badgeDate: {
    fontSize: 9,
    color: C.textTertiary,
    marginTop: 4,
    fontWeight: '500',
  },
}); }
