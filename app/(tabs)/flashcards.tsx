import { useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  Pressable,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontSize, LineHeight, LetterSpacing, Spacing, BorderRadius, Shadow } from '../../constants/theme';
import { useThemeColors, ThemeColors } from '../../hooks/useThemeColors';
import { CATEGORY_LABELS, CATEGORY_ICONS, CATEGORY_COLORS, Category } from '../../types';
import { ALL_GLOSSARY } from '../../data';

const CATEGORIES: Category[] = ['kenri', 'takkengyoho', 'horei_seigen', 'tax_other'];
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min(SCREEN_WIDTH - 40, 420);

export default function FlashcardsScreen() {
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [studyMode, setStudyMode] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const filteredGlossary = useMemo(
    () => selectedCategory ? ALL_GLOSSARY.filter((g) => g.category === selectedCategory) : ALL_GLOSSARY,
    [selectedCategory],
  );

  const currentTerm = filteredGlossary[currentIndex];

  const flipCard = useCallback(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 0.95, duration: 150, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, friction: 6, useNativeDriver: true }),
      ]),
    ]).start();
    setTimeout(() => setShowBack((prev) => !prev), 150);
  }, [fadeAnim, scaleAnim]);

  const goTo = useCallback(
    (direction: 'prev' | 'next') => {
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();

      setTimeout(() => {
        setShowBack(false);
        if (direction === 'next') {
          setCurrentIndex((prev) =>
            prev < filteredGlossary.length - 1 ? prev + 1 : 0
          );
        } else {
          setCurrentIndex((prev) =>
            prev > 0 ? prev - 1 : filteredGlossary.length - 1
          );
        }
      }, 120);
    },
    [filteredGlossary.length, fadeAnim]
  );

  const startStudy = useCallback((index: number) => {
    setCurrentIndex(index);
    setStudyMode(true);
    setShowBack(false);
  }, []);

  // ============================================================
  // Study Mode
  // ============================================================
  if (studyMode && currentTerm) {
    const catColor = CATEGORY_COLORS[currentTerm.category];
    const progress = ((currentIndex + 1) / filteredGlossary.length) * 100;

    return (
      <SafeAreaView style={s.container}>
        {/* Study Header */}
        <View style={s.studyTopBar}>
          <Pressable style={s.closeBtn} onPress={() => setStudyMode(false)}>
            <Text style={s.closeBtnText}>✕</Text>
          </Pressable>
          <View style={s.studyProgress}>
            <Text style={s.studyProgressNum}>
              {currentIndex + 1}
              <Text style={s.studyProgressTotal}> / {filteredGlossary.length}</Text>
            </Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Progress Bar */}
        <View style={s.progressBarContainer}>
          <View style={s.progressBarTrack}>
            <View style={[s.progressBarFill, { width: `${progress}%` }]} />
          </View>
        </View>

        {/* Card Area */}
        <View style={s.cardArea}>
          <Pressable onPress={flipCard} style={s.cardPressable}>
            <Animated.View
              style={[
                s.studyCard,
                showBack ? s.studyCardBack : s.studyCardFront,
                {
                  opacity: fadeAnim,
                  transform: [{ scale: scaleAnim }],
                },
              ]}
            >
              {/* Category pill */}
              <View style={[s.cardCatPill, { backgroundColor: catColor + '14' }]}>
                <Text style={[s.cardCatPillText, { color: catColor }]}>
                  {CATEGORY_ICONS[currentTerm.category]} {CATEGORY_LABELS[currentTerm.category]}
                </Text>
              </View>

              {!showBack ? (
                // Front: Term
                <View style={s.cardFrontContent}>
                  <Text style={s.cardTermText}>{currentTerm.term}</Text>
                  <Text style={s.cardReadingText}>{currentTerm.reading}</Text>
                  <View style={s.tapHintRow}>
                    <View style={s.tapHintDot} />
                    <Text style={s.tapHintText}>タップして解説を表示</Text>
                  </View>
                </View>
              ) : (
                // Back: Definition
                <View style={s.cardBackContent}>
                  <Text style={s.cardBackTerm}>{currentTerm.term}</Text>
                  <View style={s.cardDivider} />
                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    style={s.cardBackScrollArea}
                  >
                    <Text style={s.cardDefText}>
                      {currentTerm.definition}
                    </Text>
                  </ScrollView>
                  <View style={s.tapHintRow}>
                    <View style={s.tapHintDot} />
                    <Text style={s.tapHintText}>タップで用語に戻る</Text>
                  </View>
                </View>
              )}
            </Animated.View>
          </Pressable>
        </View>

        {/* Bottom Navigation */}
        <View style={s.studyNavContainer}>
          <View style={s.studyNavRow}>
            <Pressable
              style={s.studyNavBtn}
              onPress={() => goTo('prev')}
            >
              <Text style={s.studyNavArrow}>‹</Text>
              <Text style={s.studyNavLabel}>前へ</Text>
            </Pressable>

            <Pressable
              style={[s.studyNavBtn, s.studyNavBtnPrimary]}
              onPress={() => goTo('next')}
            >
              <Text style={[s.studyNavLabel, { color: colors.white }]}>次へ</Text>
              <Text style={[s.studyNavArrow, { color: colors.white }]}>›</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ============================================================
  // List Mode
  // ============================================================
  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>暗記カード</Text>
          <Text style={s.headerSub}>{filteredGlossary.length}の重要用語を収録</Text>
        </View>
      </View>

      {/* Category Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.filterRow}
      >
        <Pressable
          style={[
            s.filterChip,
            !selectedCategory && s.filterChipActive,
          ]}
          onPress={() => {
            setSelectedCategory(null);
            setCurrentIndex(0);
          }}
        >
          <Text
            style={[
              s.filterChipText,
              !selectedCategory && s.filterChipTextActive,
            ]}
          >
            すべて
          </Text>
        </Pressable>
        {CATEGORIES.map((cat) => {
          const isActive = selectedCategory === cat;
          return (
            <Pressable
              key={cat}
              style={[
                s.filterChip,
                isActive && {
                  backgroundColor: CATEGORY_COLORS[cat],
                  borderColor: CATEGORY_COLORS[cat],
                },
              ]}
              onPress={() => {
                setSelectedCategory(isActive ? null : cat);
                setCurrentIndex(0);
              }}
            >
              <Text
                style={[
                  s.filterChipText,
                  isActive && s.filterChipTextActive,
                ]}
              >
                {CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Start Study CTA */}
      {filteredGlossary.length > 0 && (
        <Pressable style={s.ctaButton} onPress={() => startStudy(0)}>
          <View style={s.ctaInner}>
            <Text style={s.ctaIcon}>🃏</Text>
            <View>
              <Text style={s.ctaTitle}>カード学習を始める</Text>
              <Text style={s.ctaDesc}>{filteredGlossary.length}枚のカードで暗記</Text>
            </View>
          </View>
          <Text style={s.ctaArrow}>→</Text>
        </Pressable>
      )}

      {/* Term List */}
      <FlatList
        data={filteredGlossary}
        keyExtractor={(item) => item.slug}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={5}
        ListFooterComponent={<View style={{ height: 120 }} />}
        renderItem={({ item: term, index }) => {
          const catColor = CATEGORY_COLORS[term.category];
          return (
            <Pressable
              style={s.termCard}
              onPress={() => startStudy(index)}
            >
              <View style={[s.termAccent, { backgroundColor: catColor }]} />
              <View style={s.termBody}>
                <View style={s.termTopRow}>
                  <Text style={s.termName}>{term.term}</Text>
                  <View style={[s.termCatDot, { backgroundColor: catColor }]} />
                </View>
                <Text style={s.termReading}>{term.reading}</Text>
                <Text style={s.termPreview} numberOfLines={1}>
                  {term.definition}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: C.background,
    },

    // ─── Header ───
    header: {
      paddingHorizontal: Spacing.xl,
      paddingTop: Spacing.lg,
      paddingBottom: Spacing.md,
    },
    headerTitle: {
      fontSize: FontSize.title1,
      fontWeight: '800',
      color: C.text,
      letterSpacing: LetterSpacing.tight,
    },
    headerSub: {
      fontSize: FontSize.footnote,
      color: C.textSecondary,
      marginTop: 3,
    },

    // ─── Filter Chips ───
    filterRow: {
      paddingHorizontal: Spacing.xl,
      paddingBottom: Spacing.lg,
      gap: 8,
    },
    filterChip: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: BorderRadius.full,
      borderWidth: 1.5,
      borderColor: C.border,
      backgroundColor: C.card,
    },
    filterChipActive: {
      backgroundColor: C.primary,
      borderColor: C.primary,
    },
    filterChipText: {
      fontSize: FontSize.footnote,
      fontWeight: '600',
      color: C.textSecondary,
    },
    filterChipTextActive: {
      color: C.white,
    },

    // ─── CTA Button ───
    ctaButton: {
      marginHorizontal: Spacing.xl,
      marginBottom: Spacing.xl,
      backgroundColor: C.primary,
      borderRadius: BorderRadius.xl,
      padding: 18,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      ...Shadow.md,
    },
    ctaInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    ctaIcon: { fontSize: 30 },
    ctaTitle: {
      fontSize: FontSize.callout,
      fontWeight: '700',
      color: C.white,
    },
    ctaDesc: {
      fontSize: FontSize.footnote,
      color: 'rgba(255,255,255,0.75)',
      marginTop: 2,
    },
    ctaArrow: {
      fontSize: FontSize.title2,
      fontWeight: '700',
      color: C.white,
    },

    // ─── Term List ───
    listContent: {
      paddingHorizontal: Spacing.xl,
    },
    termCard: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      marginBottom: 10,
      flexDirection: 'row',
      overflow: 'hidden',
      ...Shadow.sm,
    },
    termAccent: { width: 4 },
    termBody: { flex: 1, padding: Spacing.lg },
    termTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    termName: {
      fontSize: FontSize.callout,
      fontWeight: '700',
      color: C.text,
    },
    termCatDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
    termReading: {
      fontSize: FontSize.caption,
      color: C.textTertiary,
      marginTop: 2,
    },
    termPreview: {
      fontSize: FontSize.footnote,
      color: C.textSecondary,
      marginTop: 6,
      lineHeight: LineHeight.footnote,
    },

    // ─── Study Mode: Top Bar ───
    studyTopBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.md,
    },
    closeBtn: {
      width: 40,
      height: 40,
      borderRadius: BorderRadius.full,
      backgroundColor: C.borderLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeBtnText: {
      fontSize: FontSize.headline,
      color: C.textSecondary,
      fontWeight: '600',
    },
    studyProgress: { alignItems: 'center' },
    studyProgressNum: {
      fontSize: FontSize.title3,
      fontWeight: '800',
      color: C.text,
    },
    studyProgressTotal: {
      fontSize: FontSize.body,
      fontWeight: '500',
      color: C.textTertiary,
    },

    // ─── Study Mode: Progress Bar ───
    progressBarContainer: {
      paddingHorizontal: Spacing.xl,
      marginBottom: Spacing.sm,
    },
    progressBarTrack: {
      height: 5,
      backgroundColor: C.primarySurface,
      borderRadius: 3,
      overflow: 'hidden',
    },
    progressBarFill: {
      height: '100%',
      backgroundColor: C.primary,
      borderRadius: 3,
    },

    // ─── Study Mode: Card ───
    cardArea: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.lg,
    },
    cardPressable: {
      width: CARD_WIDTH,
      ...(Platform.OS === 'web' ? { cursor: 'pointer' as any } : {}),
    },
    studyCard: {
      width: '100%',
      minHeight: 340,
      borderRadius: BorderRadius.xxl,
      padding: 28,
      alignItems: 'center',
      ...Shadow.lg,
    },
    studyCardFront: {
      backgroundColor: C.card,
    },
    studyCardBack: {
      backgroundColor: '#FAFFFE',
      borderWidth: 2,
      borderColor: C.primary + '1A',
    },
    cardCatPill: {
      paddingHorizontal: 14,
      paddingVertical: 5,
      borderRadius: BorderRadius.md,
      marginBottom: Spacing.xxl,
    },
    cardCatPillText: {
      fontSize: FontSize.footnote,
      fontWeight: '600',
    },

    // Front
    cardFrontContent: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardTermText: {
      fontSize: FontSize.largeTitle,
      fontWeight: '800',
      color: C.text,
      textAlign: 'center',
      letterSpacing: LetterSpacing.tight,
    },
    cardReadingText: {
      fontSize: FontSize.callout,
      color: C.textTertiary,
      marginTop: 10,
    },
    tapHintRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: Spacing.xxxl,
      gap: 6,
    },
    tapHintDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor: C.textDisabled,
    },
    tapHintText: {
      fontSize: FontSize.footnote,
      color: C.textTertiary,
    },

    // Back
    cardBackContent: {
      flex: 1,
      alignItems: 'center',
      width: '100%',
    },
    cardBackTerm: {
      fontSize: FontSize.title2,
      fontWeight: '800',
      color: C.primary,
      textAlign: 'center',
    },
    cardDivider: {
      width: 40,
      height: 3,
      backgroundColor: C.primarySurface,
      borderRadius: 2,
      marginVertical: Spacing.lg,
    },
    cardBackScrollArea: {
      maxHeight: 200,
      width: '100%',
    },
    cardDefText: {
      fontSize: FontSize.body,
      color: C.text,
      lineHeight: LineHeight.body,
      textAlign: 'center',
    },

    // ─── Study Mode: Bottom Nav ───
    studyNavContainer: {
      paddingHorizontal: Spacing.xl,
      paddingBottom: Spacing.xxl,
    },
    studyNavRow: {
      flexDirection: 'row',
      gap: 12,
    },
    studyNavBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Spacing.lg,
      borderRadius: BorderRadius.lg,
      backgroundColor: C.card,
      borderWidth: 1.5,
      borderColor: C.border,
      gap: 6,
    },
    studyNavBtnPrimary: {
      backgroundColor: C.primary,
      borderColor: C.primary,
    },
    studyNavArrow: {
      fontSize: FontSize.title2,
      fontWeight: '600',
      color: C.text,
    },
    studyNavLabel: {
      fontSize: FontSize.body,
      fontWeight: '700',
      color: C.text,
    },
  });
}
