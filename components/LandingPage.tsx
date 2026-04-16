import { View, Text, Pressable, ScrollView, StyleSheet, Platform, DimensionValue } from 'react-native';
import { useRouter } from 'expo-router';
import { Shadow, FontSize, Spacing, BorderRadius, LetterSpacing } from '../constants/theme';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';
import { ALL_QUESTIONS, ALL_QUICK_QUIZZES } from '../data';
import { useMemo, useEffect } from 'react';

const TOTAL_Q = ALL_QUESTIONS.length;
const TOTAL_QQ = ALL_QUICK_QUIZZES.length;

const FEATURES = [
  { icon: '📚', title: `過去問 ${TOTAL_Q}問`, desc: '分野別・年度別に網羅した問題集' },
  { icon: '⚡', title: `一問一答 ${TOTAL_QQ}問`, desc: 'スキマ時間にサクサク解ける' },
  { icon: '📝', title: '本番形式 模擬試験', desc: '50問×2時間の本試験シミュレーション' },
  { icon: '🤖', title: 'AI解説チャット', desc: 'わからない問題をAIが即座に解説' },
  { icon: '📊', title: 'AI苦手分析', desc: '弱点を自動検出し最適な問題を提案' },
  { icon: '🌙', title: '就寝前復習', desc: '科学的根拠に基づく記憶定着メソッド' },
];

const COMPARISONS = [
  { feature: '過去問演習', free: '一部', premium: `全${TOTAL_Q}問` },
  { feature: '一問一答', free: '一部', premium: `全${TOTAL_QQ}問` },
  { feature: '模擬試験', free: '×', premium: '無制限' },
  { feature: 'AI解説', free: '×', premium: '1日100回' },
  { feature: 'AI苦手分析', free: '×', premium: '○' },
  { feature: '法改正対応', free: '○', premium: '○' },
];

const STEPS = [
  { num: '1', title: '無料で始める', desc: 'メールアドレスで30秒で登録' },
  { num: '2', title: '7日間お試し', desc: '全機能を無料でじっくり体験' },
  { num: '3', title: '月額980円', desc: '続けるなら。いつでも解約OK' },
];

export default function LandingPage() {
  const router = useRouter();
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);

  // Web: OGPメタタグ設定
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const meta = (name: string, content: string, prop = 'property') => {
      let el = document.querySelector(`meta[${prop}="${name}"]`) as HTMLMetaElement | null;
      if (!el) { el = document.createElement('meta'); el.setAttribute(prop, name); document.head.appendChild(el); }
      el.content = content;
    };
    document.title = '宅建士 完全対策 - AI搭載の宅建試験対策アプリ';
    meta('description', `全${TOTAL_Q}問の過去問とAI解説で宅建試験合格を目指す。7日間無料トライアル。`, 'name');
    meta('og:title', '宅建士 完全対策 - AI搭載の宅建試験対策アプリ');
    meta('og:description', `過去問${TOTAL_Q}問+一問一答${TOTAL_QQ}問。AIが弱点を分析し最短ルートで合格へ導く。`);
    meta('og:type', 'website');
    meta('og:url', 'https://takken-app-olive.vercel.app/');
    meta('og:image', 'https://takken-app-olive.vercel.app/ogp.png');
    meta('og:locale', 'ja_JP');
    meta('twitter:card', 'summary_large_image', 'name');
    meta('twitter:title', '宅建士 完全対策 - AI搭載の宅建試験対策アプリ', 'name');
    meta('twitter:description', `過去問${TOTAL_Q}問+AI解説で宅建合格を目指す。7日間無料。`, 'name');
  }, []);

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      {/* ─── ヘッダー ─── */}
      <View style={s.header} accessibilityRole="header">
        <Text style={s.headerLogo} accessibilityRole="text">宅建士 完全対策</Text>
        <View style={s.headerButtons}>
          <Pressable onPress={() => router.push('/auth/login')} style={s.loginBtn} accessibilityRole="button" accessibilityLabel="ログイン">
            <Text style={s.loginBtnText}>ログイン</Text>
          </Pressable>
        </View>
      </View>

      {/* ─── ヒーロー ─── */}
      <View style={[s.hero, Shadow.lg]}>
        <View style={s.heroBadge}>
          <Text style={s.heroBadgeText}>2026年度試験対応</Text>
        </View>
        <Text style={s.heroTitle}>
          宅建試験{'\n'}合格への最短ルート
        </Text>
        <Text style={s.heroSub}>
          全{TOTAL_Q}問の過去問 × AI解説で{'\n'}
          効率的に合格力を身につける
        </Text>
        <View style={s.heroStats}>
          <View style={s.heroStat}>
            <Text style={s.heroStatNum}>{TOTAL_Q}+</Text>
            <Text style={s.heroStatLabel}>収録問題数</Text>
          </View>
          <View style={s.heroStatDivider} />
          <View style={s.heroStat}>
            <Text style={s.heroStatNum}>4科目</Text>
            <Text style={s.heroStatLabel}>完全網羅</Text>
          </View>
          <View style={s.heroStatDivider} />
          <View style={s.heroStat}>
            <Text style={s.heroStatNum}>AI</Text>
            <Text style={s.heroStatLabel}>解説搭載</Text>
          </View>
        </View>
        <Pressable
          style={[s.heroCTA, Shadow.md]}
          onPress={() => router.push('/auth/login')}
          accessibilityRole="button"
          accessibilityLabel="無料で始める - 7日間無料トライアル"
        >
          <Text style={s.heroCTAText}>無料で始める</Text>
        </Pressable>
        <Text style={s.heroCTASub}>7日間無料 → 月額¥980 ・ いつでも解約OK</Text>
      </View>

      {/* ─── 機能紹介 ─── */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>FEATURES</Text>
        <Text style={s.sectionTitle}>合格に必要な機能を{'\n'}すべて搭載</Text>
        <View style={s.featureGrid}>
          {FEATURES.map((f) => (
            <View key={f.title} style={[s.featureCard, Shadow.sm]}>
              <Text style={s.featureIcon}>{f.icon}</Text>
              <Text style={s.featureTitle}>{f.title}</Text>
              <Text style={s.featureDesc}>{f.desc}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ─── 科目カバー ─── */}
      <View style={[s.section, s.sectionAlt]}>
        <Text style={s.sectionLabel}>COVERAGE</Text>
        <Text style={s.sectionTitle}>全4科目を完全網羅</Text>
        <View style={s.subjectList}>
          {[
            { icon: '⚖️', name: '権利関係', desc: '民法・借地借家法・区分所有法・不動産登記法', color: '#1B7A3D' },
            { icon: '🏢', name: '宅建業法', desc: '宅建業法の全範囲を網羅', color: '#1A6DC2' },
            { icon: '📐', name: '法令上の制限', desc: '都市計画法・建築基準法・その他法令', color: '#C75A1A' },
            { icon: '💰', name: '税・その他', desc: '不動産取得税・固定資産税・鑑定評価', color: '#7B3FA0' },
          ].map((sub) => (
            <View key={sub.name} style={[s.subjectCard, Shadow.sm]}>
              <View style={[s.subjectAccent, { backgroundColor: sub.color }]} />
              <Text style={s.subjectIcon}>{sub.icon}</Text>
              <View style={s.subjectInfo}>
                <Text style={s.subjectName}>{sub.name}</Text>
                <Text style={s.subjectDesc}>{sub.desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* ─── 料金プラン ─── */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>PRICING</Text>
        <Text style={s.sectionTitle}>シンプルな料金プラン</Text>

        <View style={s.planRow}>
          {/* FREE */}
          <View style={[s.planCard, Shadow.sm]}>
            <Text style={s.planName}>FREE</Text>
            <Text style={s.planPrice}>¥0</Text>
            <Text style={s.planPeriod}>ずっと無料</Text>
            <View style={s.planDivider} />
            <Text style={s.planFeature}>✓ 一部の過去問</Text>
            <Text style={s.planFeature}>✓ 基本的な学習機能</Text>
            <Text style={s.planFeature}>✓ 学習記録</Text>
            <Text style={s.planFeatureDisabled}>× 模擬試験</Text>
            <Text style={s.planFeatureDisabled}>× AI解説</Text>
            <Text style={s.planFeatureDisabled}>× AI苦手分析</Text>
          </View>

          {/* PREMIUM */}
          <View style={[s.planCard, s.planCardPremium, Shadow.md]}>
            <View style={s.planBadge}>
              <Text style={s.planBadgeText}>おすすめ</Text>
            </View>
            <Text style={[s.planName, s.planNamePremium]}>PREMIUM</Text>
            <Text style={[s.planPrice, s.planPricePremium]}>¥980</Text>
            <Text style={[s.planPeriod, s.planPeriodPremium]}>月額（税込）</Text>
            <View style={[s.planDivider, { borderColor: 'rgba(255,255,255,0.2)' }]} />
            <Text style={s.planFeaturePremium}>✓ 全{TOTAL_Q}問が解き放題</Text>
            <Text style={s.planFeaturePremium}>✓ 一問一答{TOTAL_QQ}問</Text>
            <Text style={s.planFeaturePremium}>✓ 模擬試験 無制限</Text>
            <Text style={s.planFeaturePremium}>✓ AI解説 1日100回</Text>
            <Text style={s.planFeaturePremium}>✓ AI苦手分析</Text>
            <Text style={s.planFeaturePremium}>✓ 法改正完全対応</Text>
            <Pressable
              style={[s.planCTA, Shadow.sm]}
              onPress={() => router.push('/auth/login')}
              accessibilityRole="button"
              accessibilityLabel="PREMIUMプラン 7日間無料で試す"
            >
              <Text style={s.planCTAText}>7日間無料で試す</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* ─── 機能比較テーブル ─── */}
      <View style={[s.section, s.sectionAlt]}>
        <Text style={s.sectionLabel}>COMPARISON</Text>
        <Text style={s.sectionTitle}>プラン比較</Text>
        <View style={[s.comparisonTable, Shadow.sm]}>
          {/* ヘッダー */}
          <View style={[s.compRow, s.compHeaderRow]}>
            <Text style={[s.compCell, s.compHeaderCell, { flex: 2 }]}>機能</Text>
            <Text style={[s.compCell, s.compHeaderCell]}>FREE</Text>
            <Text style={[s.compCell, s.compHeaderCellPremium]}>PREMIUM</Text>
          </View>
          {/* ボディ */}
          {COMPARISONS.map((row, i) => (
            <View key={row.feature} style={[s.compRow, i % 2 === 1 && s.compRowAlt]} accessibilityLabel={`${row.feature}: 無料版は${row.free}、プレミアムは${row.premium}`}>
              <Text style={[s.compCell, s.compFeatureCell, { flex: 2 }]}>{row.feature}</Text>
              <Text style={[s.compCell, s.compFreeCell]}>{row.free}</Text>
              <Text style={[s.compCell, s.compPremiumCell]}>{row.premium}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ─── 始め方 ─── */}
      <View style={[s.section, s.sectionAlt]}>
        <Text style={s.sectionLabel}>HOW IT WORKS</Text>
        <Text style={s.sectionTitle}>3ステップで開始</Text>
        <View style={s.stepsRow}>
          {STEPS.map((step, i) => (
            <View key={step.num} style={s.stepItem}>
              <View style={[s.stepCircle, Shadow.sm]}>
                <Text style={s.stepNum}>{step.num}</Text>
              </View>
              <Text style={s.stepTitle}>{step.title}</Text>
              <Text style={s.stepDesc}>{step.desc}</Text>
              {i < STEPS.length - 1 && <View style={s.stepConnector} />}
            </View>
          ))}
        </View>
      </View>

      {/* ─── 安心ポイント ─── */}
      <View style={s.section}>
        <View style={s.trustGrid}>
          {[
            { icon: '🔒', title: '安全な決済', desc: 'PAY.JPによるPCI DSS準拠の決済処理' },
            { icon: '✋', title: 'いつでも解約', desc: 'マイページから即時解約。違約金なし' },
            { icon: '🎁', title: '7日間無料', desc: 'トライアル中に解約すれば完全無料' },
            { icon: '⚖️', title: '法改正対応', desc: '2026年度の最新法改正に完全対応' },
          ].map((t) => (
            <View key={t.title} style={[s.trustCard, Shadow.sm]}>
              <Text style={s.trustIcon}>{t.icon}</Text>
              <Text style={s.trustTitle}>{t.title}</Text>
              <Text style={s.trustDesc}>{t.desc}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ─── 最終CTA ─── */}
      <View style={[s.finalCTA, Shadow.lg]}>
        <Text style={s.finalCTATitle}>今すぐ合格への{'\n'}第一歩を踏み出そう</Text>
        <Text style={s.finalCTASub}>
          {TOTAL_Q}問の過去問とAI解説で{'\n'}
          効率的に宅建合格を目指せます
        </Text>
        <Pressable
          style={[s.finalCTABtn, Shadow.md]}
          onPress={() => router.push('/auth/login')}
          accessibilityRole="button"
          accessibilityLabel="7日間無料で始める"
        >
          <Text style={s.finalCTABtnText}>7日間 無料で始める</Text>
        </Pressable>
        <Text style={s.finalCTANote}>無料期間終了後 ¥980/月 ・ いつでも解約OK</Text>
      </View>

      {/* ─── フッター ─── */}
      <View style={s.footer}>
        <Text style={s.footerBrand}>宅建士 完全対策</Text>
        <Text style={s.footerCompany}>合同会社カケル</Text>
        <View style={s.footerLinks}>
          <Pressable onPress={() => router.push('/legal/terms')}>
            <Text style={s.footerLink}>利用規約</Text>
          </Pressable>
          <Text style={s.footerSep}>|</Text>
          <Pressable onPress={() => router.push('/legal/privacy')}>
            <Text style={s.footerLink}>プライバシーポリシー</Text>
          </Pressable>
          <Text style={s.footerSep}>|</Text>
          <Pressable onPress={() => router.push('/legal/tokushoho')}>
            <Text style={s.footerLink}>特定商取引法に基づく表記</Text>
          </Pressable>
        </View>
        <Text style={s.footerCopy}>© 2026 合同会社カケル All rights reserved.</Text>
      </View>
    </ScrollView>
  );
}

function makeStyles(C: ThemeColors) {
  const isWeb = Platform.OS === 'web';
  const maxW = isWeb ? 960 : undefined;

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    content: {
      ...(maxW ? { maxWidth: maxW, alignSelf: 'center' as const, width: '100%' as DimensionValue } : {}),
      paddingBottom: 0,
    },

    // Header
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: Spacing.xl,
      paddingVertical: 14,
      backgroundColor: C.background,
      borderBottomWidth: 1,
      borderBottomColor: C.borderLight,
    },
    headerLogo: { fontSize: FontSize.headline, fontWeight: '800', color: C.primary },
    headerButtons: { flexDirection: 'row', gap: 10 },
    loginBtn: {
      backgroundColor: C.primary,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: BorderRadius.md,
    },
    loginBtnText: { color: C.white, fontSize: FontSize.footnote, fontWeight: '700' },

    // Hero
    hero: {
      backgroundColor: C.primary,
      margin: Spacing.xl,
      borderRadius: BorderRadius.xxl,
      padding: 32,
      alignItems: 'center',
    },
    heroBadge: {
      backgroundColor: 'rgba(255,255,255,0.2)',
      paddingHorizontal: 16,
      paddingVertical: 6,
      borderRadius: BorderRadius.full,
      marginBottom: 20,
    },
    heroBadgeText: { color: C.white, fontSize: FontSize.caption, fontWeight: '700', letterSpacing: LetterSpacing.wide },
    heroTitle: {
      fontSize: 30,
      fontWeight: '900',
      color: C.white,
      textAlign: 'center',
      lineHeight: 42,
      letterSpacing: LetterSpacing.tight,
      marginBottom: 12,
    },
    heroSub: {
      fontSize: FontSize.subhead,
      color: 'rgba(255,255,255,0.85)',
      textAlign: 'center',
      lineHeight: 24,
      marginBottom: 24,
    },
    heroStats: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.12)',
      borderRadius: BorderRadius.lg,
      paddingVertical: 14,
      paddingHorizontal: 20,
      marginBottom: 28,
      width: '100%',
      justifyContent: 'center',
    },
    heroStat: { alignItems: 'center', flex: 1 },
    heroStatNum: { fontSize: FontSize.title2, fontWeight: '900', color: C.white },
    heroStatLabel: { fontSize: FontSize.caption2, color: 'rgba(255,255,255,0.7)', marginTop: 2, fontWeight: '500' },
    heroStatDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 12 },
    heroCTA: {
      backgroundColor: C.white,
      borderRadius: BorderRadius.lg,
      paddingVertical: 18,
      paddingHorizontal: 48,
      width: '100%',
      alignItems: 'center',
    },
    heroCTAText: { fontSize: FontSize.headline, fontWeight: '800', color: C.primary },
    heroCTASub: {
      fontSize: FontSize.caption,
      color: 'rgba(255,255,255,0.7)',
      marginTop: 10,
    },

    // Sections
    section: { paddingHorizontal: Spacing.xl, paddingVertical: 40 },
    sectionAlt: { backgroundColor: C.card },
    sectionLabel: {
      fontSize: FontSize.caption,
      fontWeight: '800',
      color: C.primary,
      letterSpacing: 2,
      marginBottom: 8,
      textAlign: 'center',
    },
    sectionTitle: {
      fontSize: FontSize.title1,
      fontWeight: '900',
      color: C.text,
      textAlign: 'center',
      letterSpacing: LetterSpacing.tight,
      marginBottom: 28,
      lineHeight: 36,
    },

    // Features
    featureGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    featureCard: {
      width: (isWeb ? '31%' : '47%') as DimensionValue,
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      padding: 18,
      minWidth: 150,
      flexGrow: 1,
    },
    featureIcon: { fontSize: 28, marginBottom: 10 },
    featureTitle: { fontSize: FontSize.subhead, fontWeight: '700', color: C.text, marginBottom: 4 },
    featureDesc: { fontSize: FontSize.caption, color: C.textSecondary, lineHeight: 18 },

    // Subjects
    subjectList: { gap: 10 },
    subjectCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.background,
      borderRadius: BorderRadius.lg,
      overflow: 'hidden',
    },
    subjectAccent: { width: 5, alignSelf: 'stretch' },
    subjectIcon: { fontSize: 24, marginHorizontal: 14 },
    subjectInfo: { flex: 1, paddingVertical: 16, paddingRight: 16 },
    subjectName: { fontSize: FontSize.subhead, fontWeight: '700', color: C.text },
    subjectDesc: { fontSize: FontSize.caption, color: C.textSecondary, marginTop: 3 },

    // Plans
    planRow: {
      flexDirection: isWeb ? 'row' : 'column',
      gap: 16,
      alignItems: isWeb ? 'stretch' : 'center',
    },
    planCard: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.xl,
      padding: 24,
      borderWidth: 1,
      borderColor: C.border,
      width: (isWeb ? '48%' : '100%') as DimensionValue,
      maxWidth: 360,
    },
    planCardPremium: {
      backgroundColor: C.primary,
      borderColor: C.primary,
      position: 'relative',
      overflow: 'visible',
    },
    planBadge: {
      position: 'absolute',
      top: -12,
      alignSelf: 'center',
      backgroundColor: C.accent,
      paddingHorizontal: 14,
      paddingVertical: 4,
      borderRadius: BorderRadius.full,
    },
    planBadgeText: { color: C.white, fontSize: FontSize.caption, fontWeight: '800' },
    planName: { fontSize: FontSize.footnote, fontWeight: '800', color: C.textSecondary, letterSpacing: 2, marginTop: 4 },
    planNamePremium: { color: 'rgba(255,255,255,0.8)' },
    planPrice: { fontSize: 36, fontWeight: '900', color: C.text, marginTop: 4 },
    planPricePremium: { color: C.white },
    planPeriod: { fontSize: FontSize.caption, color: C.textSecondary },
    planPeriodPremium: { color: 'rgba(255,255,255,0.7)' },
    planDivider: { borderTopWidth: 1, borderColor: C.borderLight, marginVertical: 16 },
    planFeature: { fontSize: FontSize.footnote, color: C.text, paddingVertical: 4, fontWeight: '500' },
    planFeatureDisabled: { fontSize: FontSize.footnote, color: C.textTertiary, paddingVertical: 4, fontWeight: '500' },
    planFeaturePremium: { fontSize: FontSize.footnote, color: C.white, paddingVertical: 4, fontWeight: '500' },
    planCTA: {
      backgroundColor: C.white,
      borderRadius: BorderRadius.md,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 20,
    },
    planCTAText: { fontSize: FontSize.subhead, fontWeight: '800', color: C.primary },

    // Comparison Table
    comparisonTable: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: C.borderLight,
    },
    compRow: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: C.borderLight,
    },
    compRowAlt: {
      backgroundColor: C.background,
    },
    compHeaderRow: {
      backgroundColor: C.card,
    },
    compCell: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 12,
      fontSize: FontSize.caption,
      textAlign: 'center',
    },
    compHeaderCell: {
      fontWeight: '800',
      fontSize: FontSize.caption,
      color: C.textSecondary,
      letterSpacing: 1,
    },
    compHeaderCellPremium: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 12,
      fontWeight: '800',
      fontSize: FontSize.caption,
      color: C.primary,
      textAlign: 'center',
      letterSpacing: 1,
    },
    compFeatureCell: {
      fontWeight: '600',
      color: C.text,
      textAlign: 'left',
    },
    compFreeCell: {
      color: C.textTertiary,
      fontWeight: '500',
    },
    compPremiumCell: {
      color: C.primary,
      fontWeight: '700',
    },

    // Steps
    stepsRow: {
      flexDirection: isWeb ? 'row' : 'column',
      gap: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepItem: {
      alignItems: 'center',
      flex: isWeb ? 1 : undefined,
      width: isWeb ? undefined : '100%',
      maxWidth: 240,
    },
    stepCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    stepNum: { fontSize: FontSize.title2, fontWeight: '900', color: C.white },
    stepTitle: { fontSize: FontSize.subhead, fontWeight: '700', color: C.text, marginBottom: 4 },
    stepDesc: { fontSize: FontSize.caption, color: C.textSecondary, textAlign: 'center' },
    stepConnector: {
      width: isWeb ? 60 : 2,
      height: isWeb ? 2 : 30,
      backgroundColor: C.borderLight,
      position: 'absolute',
      right: isWeb ? -40 : undefined,
      top: isWeb ? 24 : undefined,
    },

    // Trust
    trustGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    trustCard: {
      width: (isWeb ? '23%' : '47%') as DimensionValue,
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      padding: 18,
      alignItems: 'center',
      minWidth: 140,
      flexGrow: 1,
    },
    trustIcon: { fontSize: 28, marginBottom: 8 },
    trustTitle: { fontSize: FontSize.footnote, fontWeight: '700', color: C.text, marginBottom: 4 },
    trustDesc: { fontSize: FontSize.caption2, color: C.textSecondary, textAlign: 'center', lineHeight: 16 },

    // Final CTA
    finalCTA: {
      backgroundColor: C.primary,
      margin: Spacing.xl,
      borderRadius: BorderRadius.xxl,
      padding: 36,
      alignItems: 'center',
    },
    finalCTATitle: {
      fontSize: FontSize.title1,
      fontWeight: '900',
      color: C.white,
      textAlign: 'center',
      lineHeight: 36,
      letterSpacing: LetterSpacing.tight,
      marginBottom: 12,
    },
    finalCTASub: {
      fontSize: FontSize.subhead,
      color: 'rgba(255,255,255,0.8)',
      textAlign: 'center',
      lineHeight: 24,
      marginBottom: 24,
    },
    finalCTABtn: {
      backgroundColor: C.white,
      borderRadius: BorderRadius.lg,
      paddingVertical: 18,
      paddingHorizontal: 48,
      width: '100%',
      alignItems: 'center',
      marginBottom: 10,
    },
    finalCTABtnText: { fontSize: FontSize.headline, fontWeight: '800', color: C.primary },
    finalCTANote: { fontSize: FontSize.caption, color: 'rgba(255,255,255,0.6)' },

    // Footer
    footer: {
      backgroundColor: '#1a1a1a',
      padding: 32,
      alignItems: 'center',
    },
    footerBrand: { fontSize: FontSize.subhead, fontWeight: '800', color: '#fff', marginBottom: 4 },
    footerCompany: { fontSize: FontSize.caption, color: 'rgba(255,255,255,0.5)', marginBottom: 20 },
    footerLinks: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 8,
      marginBottom: 20,
    },
    footerLink: { fontSize: FontSize.caption, color: 'rgba(255,255,255,0.7)', textDecorationLine: 'underline' },
    footerSep: { fontSize: FontSize.caption, color: 'rgba(255,255,255,0.3)' },
    footerCopy: { fontSize: FontSize.caption2, color: 'rgba(255,255,255,0.4)' },
  });
}
