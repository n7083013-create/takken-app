// ============================================================
// クエスト学習 - マップ画面（チャプター & ミッション一覧）
// ============================================================

import { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Shadow,
  FontSize,
  LineHeight,
  LetterSpacing,
  Spacing,
  BorderRadius,
  DifficultyLabel,
  DifficultyColor,
} from '../../constants/theme';
import { useThemeColors, ThemeColors } from '../../hooks/useThemeColors';
import { CATEGORY_COLORS } from '../../types';
import { QUEST_CHAPTERS } from '../../data/quests';
import { useQuestStore } from '../../store/useQuestStore';

export default function QuestMapScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const isMissionUnlocked = useQuestStore((st) => st.isMissionUnlocked);
  const isMissionCompleted = useQuestStore((st) => st.isMissionCompleted);
  const getMissionProgress = useQuestStore((st) => st.getMissionProgress);
  const getChapterProgress = useQuestStore((st) => st.getChapterProgress);
  const getOverallProgress = useQuestStore((st) => st.getOverallProgress);

  const overall = getOverallProgress();

  return (
    <SafeAreaView style={s.safe}>
      <Stack.Screen
        options={{
          title: 'クエスト学習',
          headerTintColor: colors.primary,
        }}
      />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── ヒーロー ── */}
        <View style={[s.hero, Shadow.lg]}>
          <Text style={s.heroTitle}>合格への学習パス</Text>
          <Text style={s.heroSub}>
            全{overall.total}ミッションをクリアして{'\n'}宅建試験の全範囲をマスターしよう
          </Text>
          <View style={s.heroProgressRow}>
            <View style={s.heroTrack}>
              <View style={[s.heroFill, { width: `${overall.percent}%` }]} />
            </View>
            <Text style={s.heroPercent}>{overall.percent}%</Text>
          </View>
          <Text style={s.heroCount}>
            {overall.completed}/{overall.total} ミッション完了
          </Text>
        </View>

        {/* ── チャプター一覧 ── */}
        {QUEST_CHAPTERS.map((chapter) => {
          const chProg = getChapterProgress(chapter.id);
          const catColor = CATEGORY_COLORS[chapter.category];
          const allDone = chProg.completed === chProg.total;

          return (
            <View key={chapter.id} style={s.chapterWrap}>
              {/* チャプターヘッダー */}
              <View style={[s.chapterHeader, Shadow.sm]}>
                <View style={[s.chapterAccent, { backgroundColor: catColor }]} />
                <View style={s.chapterBody}>
                  <View style={s.chapterTopRow}>
                    <Text style={s.chapterIcon}>{chapter.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.chapterTitle}>{chapter.title}</Text>
                      <Text style={s.chapterDesc}>{chapter.description}</Text>
                    </View>
                    {allDone && <Text style={s.chapterDone}>✅</Text>}
                  </View>
                  <View style={s.chapterProgressRow}>
                    <View style={s.chapterTrack}>
                      <View
                        style={[
                          s.chapterFill,
                          {
                            width: `${chProg.total > 0 ? (chProg.completed / chProg.total) * 100 : 0}%`,
                            backgroundColor: catColor,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[s.chapterCount, { color: catColor }]}>
                      {chProg.completed}/{chProg.total}
                    </Text>
                  </View>
                </View>
              </View>

              {/* ミッション一覧 */}
              <View style={s.missionList}>
                {chapter.missions.map((mission, mIdx) => {
                  const unlocked = isMissionUnlocked(mission.id);
                  const completed = isMissionCompleted(mission.id);
                  const prog = getMissionProgress(mission.id);
                  const isLast = mIdx === chapter.missions.length - 1;

                  return (
                    <View key={mission.id}>
                      {/* 接続線 */}
                      {mIdx > 0 && (
                        <View style={s.connector}>
                          <View
                            style={[
                              s.connectorLine,
                              {
                                backgroundColor: completed
                                  ? catColor
                                  : unlocked
                                    ? catColor + '40'
                                    : colors.borderLight,
                              },
                            ]}
                          />
                        </View>
                      )}

                      <Pressable
                        style={[
                          s.missionCard,
                          Shadow.sm,
                          completed && { borderColor: catColor, borderWidth: 1.5 },
                          !unlocked && s.missionLocked,
                        ]}
                        onPress={() => {
                          if (unlocked) {
                            router.push(`/quest/${mission.id}`);
                          }
                        }}
                        disabled={!unlocked}
                      >
                        {/* ステータスアイコン */}
                        <View
                          style={[
                            s.missionStatus,
                            {
                              backgroundColor: completed
                                ? catColor
                                : unlocked
                                  ? catColor + '20'
                                  : colors.borderLight,
                            },
                          ]}
                        >
                          <Text style={s.missionStatusIcon}>
                            {completed ? '✓' : unlocked ? mission.icon : '🔒'}
                          </Text>
                        </View>

                        <View style={s.missionBody}>
                          <View style={s.missionTopRow}>
                            <Text
                              style={[
                                s.missionTitle,
                                !unlocked && s.missionTitleLocked,
                              ]}
                              numberOfLines={1}
                            >
                              {mission.title}
                            </Text>
                            <View
                              style={[
                                s.diffBadge,
                                { backgroundColor: DifficultyColor[mission.difficulty] + '14' },
                              ]}
                            >
                              <Text
                                style={[
                                  s.diffBadgeText,
                                  { color: DifficultyColor[mission.difficulty] },
                                ]}
                              >
                                {DifficultyLabel[mission.difficulty]}
                              </Text>
                            </View>
                          </View>
                          <Text
                            style={[
                              s.missionDesc,
                              !unlocked && s.missionDescLocked,
                            ]}
                            numberOfLines={1}
                          >
                            {mission.description}
                          </Text>
                          <View style={s.missionMeta}>
                            <Text style={s.missionMetaText}>
                              {mission.questionCount}問 / 合格{Math.round(mission.passingRate * 100)}%
                            </Text>
                            {prog && prog.attempts > 0 && (
                              <Text
                                style={[
                                  s.missionBest,
                                  {
                                    color: completed ? catColor : colors.textTertiary,
                                  },
                                ]}
                              >
                                最高 {Math.round(prog.bestScore * 100)}%
                              </Text>
                            )}
                          </View>
                        </View>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.background },
    scroll: { paddingBottom: 40 },

    // ─── Hero ───
    hero: {
      backgroundColor: C.primary,
      borderBottomLeftRadius: BorderRadius.xxl,
      borderBottomRightRadius: BorderRadius.xxl,
      padding: 24,
      paddingTop: 12,
      alignItems: 'center',
    },
    heroTitle: {
      fontSize: FontSize.title2,
      fontWeight: '800',
      color: C.white,
      letterSpacing: LetterSpacing.tight,
    },
    heroSub: {
      fontSize: FontSize.footnote,
      color: 'rgba(255,255,255,0.8)',
      textAlign: 'center',
      lineHeight: LineHeight.footnote,
      marginTop: 6,
    },
    heroProgressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      width: '100%',
      marginTop: 16,
    },
    heroTrack: {
      flex: 1,
      height: 8,
      backgroundColor: 'rgba(255,255,255,0.2)',
      borderRadius: 4,
      overflow: 'hidden',
    },
    heroFill: {
      height: '100%',
      backgroundColor: C.white,
      borderRadius: 4,
    },
    heroPercent: {
      fontSize: FontSize.subhead,
      fontWeight: '800',
      color: C.white,
    },
    heroCount: {
      fontSize: FontSize.caption,
      color: 'rgba(255,255,255,0.7)',
      marginTop: 6,
    },

    // ─── Chapter ───
    chapterWrap: {
      marginTop: Spacing.xl,
    },
    chapterHeader: {
      flexDirection: 'row',
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      marginHorizontal: Spacing.xl,
      overflow: 'hidden',
    },
    chapterAccent: { width: 4 },
    chapterBody: { flex: 1, padding: 16 },
    chapterTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    chapterIcon: { fontSize: 24 },
    chapterTitle: {
      fontSize: FontSize.subhead,
      fontWeight: '700',
      color: C.text,
    },
    chapterDesc: {
      fontSize: FontSize.caption,
      color: C.textSecondary,
      marginTop: 2,
    },
    chapterDone: { fontSize: 20 },
    chapterProgressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 12,
    },
    chapterTrack: {
      flex: 1,
      height: 5,
      backgroundColor: C.borderLight,
      borderRadius: 3,
      overflow: 'hidden',
    },
    chapterFill: { height: '100%', borderRadius: 3 },
    chapterCount: {
      fontSize: FontSize.caption,
      fontWeight: '700',
    },

    // ─── Mission ───
    missionList: {
      paddingHorizontal: Spacing.xl,
      paddingLeft: Spacing.xl + 12,
      marginTop: 8,
    },
    connector: {
      alignItems: 'center',
      height: 16,
      paddingLeft: 18,
    },
    connectorLine: {
      width: 2,
      height: '100%',
      borderRadius: 1,
    },
    missionCard: {
      flexDirection: 'row',
      backgroundColor: C.card,
      borderRadius: BorderRadius.md,
      padding: 14,
      alignItems: 'center',
      gap: 12,
    },
    missionLocked: {
      opacity: 0.5,
    },
    missionStatus: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    missionStatusIcon: {
      fontSize: 18,
      fontWeight: '800',
      color: C.white,
    },
    missionBody: { flex: 1 },
    missionTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    missionTitle: {
      fontSize: FontSize.subhead,
      fontWeight: '700',
      color: C.text,
      flex: 1,
    },
    missionTitleLocked: {
      color: C.textTertiary,
    },
    missionDesc: {
      fontSize: FontSize.caption,
      color: C.textSecondary,
      marginTop: 3,
    },
    missionDescLocked: {
      color: C.textDisabled,
    },
    missionMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 6,
    },
    missionMetaText: {
      fontSize: FontSize.caption2,
      color: C.textTertiary,
      fontWeight: '500',
    },
    missionBest: {
      fontSize: FontSize.caption2,
      fontWeight: '700',
    },
    diffBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: BorderRadius.sm,
    },
    diffBadgeText: {
      fontSize: FontSize.caption2,
      fontWeight: '700',
    },
  });
}
