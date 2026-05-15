import { View, Text, Pressable, ScrollView, StyleSheet, Platform, DimensionValue } from 'react-native';
import { useRouter } from 'expo-router';
import { Shadow, FontSize, Spacing, BorderRadius, LetterSpacing } from '../constants/theme';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';
import { ALL_QUESTIONS, ALL_QUICK_QUIZZES } from '../data';
import { useMemo, useEffect, useState, useCallback } from 'react';

const TOTAL_Q = ALL_QUESTIONS.length;
const TOTAL_QQ = ALL_QUICK_QUIZZES.length;

// ─── 試験日までの日数を計算 ───
const EXAM_DATE = new Date('2026-10-18');
function getDaysUntilExam(): number {
  const now = new Date();
  const diff = EXAM_DATE.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// ─── 定数データ ───
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

const PAIN_POINTS = [
  { icon: '📖', text: 'テキストが分厚すぎて挫折した...' },
  { icon: '🤔', text: '独学だと正しい勉強法がわからない...' },
  { icon: '⏰', text: '仕事が忙しくてまとまった時間がない...' },
  { icon: '📋', text: '模擬試験を受ける機会が少ない...' },
];

const APP_MOCKUPS = [
  {
    icon: '📚',
    title: '問題演習',
    desc: '分野別・年度別の過去問を\nスワイプで快適に解答',
    details: ['4択問題をタップで回答', '即座に正誤判定', '解説をその場で確認'],
  },
  {
    icon: '🤖',
    title: 'AI解説',
    desc: 'わからない問題は\nAIがわかるまで解説',
    details: ['チャット形式で質問', '図解つきの丁寧な解説', '関連論点も自動提示'],
  },
  {
    icon: '📝',
    title: '模擬試験',
    desc: '本番と同じ50問×2時間で\n実力を正確に測定',
    details: ['本試験と同じ出題形式', 'リアルタイムで残り時間表示', '終了後に詳細な成績分析'],
  },
];

const REASONS = [
  {
    num: '1',
    title: 'スキマ時間で効率学習',
    desc: '通勤中・休憩中・寝る前。一問一答なら1問30秒で解けるから、忙しい毎日でもムリなく続けられます。分厚いテキストを持ち歩く必要はありません。',
  },
  {
    num: '2',
    title: 'AIがわかるまで解説',
    desc: '解説を読んでもわからない問題は、AIに何度でも質問OK。自分の理解度に合わせた説明で、独学の「わからないまま放置」をゼロにします。',
  },
  {
    num: '3',
    title: '本番に強くなる模擬試験',
    desc: '本試験と同じ50問×2時間の形式で、時間配分の感覚を身につけられます。何度でも受験でき、回を重ねるごとに実力が伸びるのを実感できます。',
  },
];

const TARGET_AUDIENCE = [
  '初めて宅建を受ける方',
  '独学で勉強している方',
  '忙しくてスキマ時間で勉強したい方',
  '過去に不合格で再挑戦する方',
];

const FAQ_DATA = [
  {
    q: '無料プランだけでも合格できますか？',
    a: '無料プランでも基礎的な学習は可能ですが、全問演習・模擬試験・AI解説といった合格に直結する機能はPremiumプランに含まれています。7日間の無料トライアルで、まずはすべての機能をお試しください。',
  },
  {
    q: '7日間無料トライアルに料金はかかりますか？',
    a: '一切かかりません。7日間はすべての機能を完全無料でご利用いただけます。トライアル期間中に解約すれば、料金は0円です。',
  },
  {
    q: 'スマホとPCで同期できますか？',
    a: 'はい、同じアカウントでログインするだけで、学習進捗・成績データがすべて自動同期されます。通勤中はスマホ、自宅ではPCなど、シーンに合わせてご利用ください。',
  },
  {
    q: '2026年度の法改正に対応していますか？',
    a: 'はい、2026年度の最新法改正に完全対応しています。法改正があった場合も速やかに問題・解説を更新しますので、安心してご利用ください。',
  },
  {
    q: '解約は簡単ですか？',
    a: 'はい、マイページからワンタップで即時解約できます。違約金や解約手数料は一切かかりません。解約後も無料プランとしてご利用を続けられます。',
  },
];

const TRUST_ITEMS = [
  { icon: '🔒', title: '安全な決済', desc: 'PAY.JPによるPCI DSS準拠の決済処理' },
  { icon: '✋', title: 'いつでも解約', desc: 'マイページから即時解約。違約金なし' },
  { icon: '🎁', title: '7日間無料', desc: 'トライアル中に解約すれば完全無料' },
  { icon: '⚖️', title: '法改正対応', desc: '2026年度の最新法改正に完全対応' },
];

// ─── CTA pulse animation CSS (web only) ───
const PULSE_KEYFRAMES = `
@keyframes ctaPulse {
  0% { box-shadow: 0 0 0 0 rgba(255,255,255,0.5); }
  70% { box-shadow: 0 0 0 12px rgba(255,255,255,0); }
  100% { box-shadow: 0 0 0 0 rgba(255,255,255,0); }
}
@keyframes ctaPulseFinal {
  0% { box-shadow: 0 0 0 0 rgba(27,122,61,0.4); }
  70% { box-shadow: 0 0 0 14px rgba(27,122,61,0); }
  100% { box-shadow: 0 0 0 0 rgba(27,122,61,0); }
}
.cta-pulse { animation: ctaPulse 2s infinite; }
.cta-pulse-final { animation: ctaPulseFinal 2s infinite; }
`;

export default function LandingPage() {
  const router = useRouter();
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const daysLeft = useMemo(() => getDaysUntilExam(), []);

  // FAQ state
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const toggleFaq = useCallback((idx: number) => {
    setOpenFaq((prev) => (prev === idx ? null : idx));
  }, []);

  // Web: OGP meta + CSS animations
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

    // Inject CSS animations
    const styleId = 'lp-pulse-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = PULSE_KEYFRAMES;
      document.head.appendChild(style);
    }
    return () => {
      const el = document.getElementById(styleId);
      if (el) el.remove();
    };
  }, []);

  // Web-only: assign CSS class for pulse animation
  const heroCTARef = useCallback((node: View | null) => {
    if (Platform.OS === 'web' && node) {
      const el = node as unknown as HTMLElement;
      if (el.classList) el.classList.add('cta-pulse');
    }
  }, []);
  const finalCTARef = useCallback((node: View | null) => {
    if (Platform.OS === 'web' && node) {
      const el = node as unknown as HTMLElement;
      if (el.classList) el.classList.add('cta-pulse-final');
    }
  }, []);

  const goLogin = useCallback(() => router.push('/auth/login'), [router]);

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      {/* ─── 1. ヘッダー ─── */}
      <View style={s.header} accessibilityRole="header">
        <Text style={s.headerLogo} accessibilityRole="text">宅建士 完全対策</Text>
        <View style={s.headerButtons}>
          <Pressable onPress={goLogin} style={s.loginBtn} accessibilityRole="button" accessibilityLabel="ログイン">
            <Text style={s.loginBtnText}>ログイン</Text>
          </Pressable>
        </View>
      </View>

      {/* ─── 2. ヒーロー ─── */}
      <View style={[s.hero, Shadow.lg]}>
        {/* Countdown */}
        <View style={s.countdownBadge}>
          <Text style={s.countdownText}>
            2026年10月試験まであと{' '}
          </Text>
          <Text style={s.countdownDays}>{daysLeft}日</Text>
        </View>

        <View style={s.heroBadge}>
          <Text style={s.heroBadgeText}>2026年度試験対応</Text>
        </View>

        <Text style={s.heroTitle}>
          もう分厚いテキストは{'\n'}いらない
        </Text>
        <Text style={s.heroSub}>
          全{TOTAL_Q}問の過去問 × AI解説{'\n'}
          スマホ1つで、合格へ最短ルート
        </Text>

        {/* Stats row */}
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

        {/* CTA */}
        <Pressable
          ref={heroCTARef}
          style={[s.heroCTA, Shadow.md]}
          onPress={goLogin}
          accessibilityRole="button"
          accessibilityLabel="無料で始める - 7日間無料トライアル"
        >
          <Text style={s.heroCTAText}>無料で始める</Text>
        </Pressable>
        <Text style={s.heroCTASub}>7日間無料 → 月額¥980 ・ いつでも解約OK</Text>
        <Text style={s.heroCTATrust}>
          {'✓ クレジットカード不要　✓ 30秒で登録'}
        </Text>
      </View>

      {/* ─── 3. 悩みセクション ─── */}
      <View style={[s.section, s.sectionAlt]}>
        <Text style={s.sectionLabel}>PAIN POINTS</Text>
        <Text style={s.sectionTitle}>こんな悩み{'\n'}ありませんか？</Text>
        <View style={s.painGrid}>
          {PAIN_POINTS.map((p) => (
            <View key={p.text} style={[s.painCard, Shadow.sm]}>
              <Text style={s.painIcon}>{p.icon}</Text>
              <Text style={s.painText}>{p.text}</Text>
            </View>
          ))}
        </View>
        <View style={s.painTransition}>
          <View style={s.painArrow}>
            <Text style={s.painArrowText}>▼</Text>
          </View>
          <Text style={s.painSolution}>
            宅建士 完全対策なら、すべて解決
          </Text>
        </View>
      </View>

      {/* ─── 4. アプリスクリーンショットモック ─── */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>APP PREVIEW</Text>
        <Text style={s.sectionTitle}>アプリの中身をチェック</Text>
        <View style={s.mockupRow}>
          {APP_MOCKUPS.map((m) => (
            <View key={m.title} style={[s.mockupCard, Shadow.md]}>
              <View style={s.mockupNotch} />
              <View style={s.mockupScreen}>
                <Text style={s.mockupIcon}>{m.icon}</Text>
                <Text style={s.mockupTitle}>{m.title}</Text>
                <Text style={s.mockupDesc}>{m.desc}</Text>
                <View style={s.mockupDivider} />
                {m.details.map((d) => (
                  <Text key={d} style={s.mockupDetail}>{'・' + d}</Text>
                ))}
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* ─── 5. 機能紹介 ─── */}
      <View style={[s.section, s.sectionAlt]}>
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

      {/* ─── 6. 科目カバー ─── */}
      <View style={s.section}>
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

      {/* ─── 7. 選ばれる理由 ─── */}
      <View style={[s.section, s.sectionAlt]}>
        <Text style={s.sectionLabel}>WHY CHOOSE US</Text>
        <Text style={s.sectionTitle}>選ばれる3つの理由</Text>
        <View style={s.reasonGrid}>
          {REASONS.map((r) => (
            <View key={r.title} style={[s.reasonCard, Shadow.sm]}>
              <View style={s.reasonNumBadge}>
                <Text style={s.reasonNum}>{r.num}</Text>
              </View>
              <Text style={s.reasonTitle}>{r.title}</Text>
              <Text style={s.reasonDesc}>{r.desc}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ─── 8. こんな方におすすめ ─── */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>TARGET</Text>
        <Text style={s.sectionTitle}>こんな方におすすめ</Text>
        <View style={s.targetList}>
          {TARGET_AUDIENCE.map((t) => (
            <View key={t} style={[s.targetItem, Shadow.sm]}>
              <View style={s.targetCheck}>
                <Text style={s.targetCheckText}>✓</Text>
              </View>
              <Text style={s.targetText}>{t}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ─── 9. 料金プラン ─── */}
      <View style={[s.section, s.sectionAlt]}>
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
              onPress={goLogin}
              accessibilityRole="button"
              accessibilityLabel="PREMIUMプラン 7日間無料で試す"
            >
              <Text style={s.planCTAText}>7日間無料で試す</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* ─── 10. 機能比較テーブル ─── */}
      <View style={s.section}>
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

      {/* ─── 11. 始め方 ─── */}
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

      {/* ─── 12. FAQ ─── */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>FAQ</Text>
        <Text style={s.sectionTitle}>よくある質問</Text>
        <View style={s.faqList}>
          {FAQ_DATA.map((faq, idx) => (
            <Pressable
              key={faq.q}
              style={[s.faqItem, Shadow.sm]}
              onPress={() => toggleFaq(idx)}
              accessibilityRole="button"
              accessibilityLabel={`質問: ${faq.q}`}
              accessibilityState={{ expanded: openFaq === idx }}
            >
              <View style={s.faqHeader}>
                <Text style={s.faqQ}>Q. {faq.q}</Text>
                <Text style={s.faqToggle}>{openFaq === idx ? '−' : '＋'}</Text>
              </View>
              {openFaq === idx && (
                <View style={s.faqBody}>
                  <Text style={s.faqA}>A. {faq.a}</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      </View>

      {/* ─── 13. 安心ポイント ─── */}
      <View style={[s.section, s.sectionAlt]}>
        <Text style={s.sectionLabel}>GUARANTEE</Text>
        <Text style={s.sectionTitle}>安心の3つの保証</Text>
        <View style={s.trustGrid}>
          {TRUST_ITEMS.map((t) => (
            <View key={t.title} style={[s.trustCard, Shadow.sm]}>
              <Text style={s.trustIcon}>{t.icon}</Text>
              <Text style={s.trustTitle}>{t.title}</Text>
              <Text style={s.trustDesc}>{t.desc}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ─── 14. 最終CTA ─── */}
      <View style={[s.finalCTA, Shadow.lg]}>
        <View style={s.finalCountdown}>
          <Text style={s.finalCountdownLabel}>試験まで</Text>
          <Text style={s.finalCountdownDays}>あと{daysLeft}日</Text>
        </View>
        <Text style={s.finalCTATitle}>
          今日が、合格への{'\n'}最短スタート地点
        </Text>
        <Text style={s.finalCTASub}>
          {TOTAL_Q}問の過去問とAI解説で{'\n'}
          効率的に宅建合格を目指せます
        </Text>
        <Pressable
          ref={finalCTARef}
          style={[s.finalCTABtn, Shadow.md]}
          onPress={goLogin}
          accessibilityRole="button"
          accessibilityLabel="7日間無料で始める"
        >
          <Text style={s.finalCTABtnText}>7日間 無料で始める</Text>
          <Text style={s.finalCTABtnSub}>まずは無料で全機能を体験</Text>
        </Pressable>
        <Text style={s.finalCTANote}>無料期間終了後 ¥980/月 ・ いつでも解約OK</Text>
        <Text style={s.finalCTATrust}>
          {'✓ クレジットカード不要　✓ 30秒で登録　✓ いつでも解約'}
        </Text>
      </View>

      {/* ─── 15. フッター ─── */}
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

// ═══════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════
function makeStyles(C: ThemeColors) {
  const isWeb = Platform.OS === 'web';
  const maxW = isWeb ? 960 : undefined;

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    content: {
      ...(maxW ? { maxWidth: maxW, alignSelf: 'center' as const, width: '100%' as DimensionValue } : {}),
      paddingBottom: 0,
    },

    // ─── Header ───
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

    // ─── Hero ───
    hero: {
      backgroundColor: C.primary,
      margin: Spacing.xl,
      borderRadius: BorderRadius.xxl,
      padding: 32,
      alignItems: 'center',
    },
    countdownBadge: {
      flexDirection: 'row',
      alignItems: 'baseline',
      backgroundColor: 'rgba(255,255,255,0.15)',
      paddingHorizontal: 18,
      paddingVertical: 8,
      borderRadius: BorderRadius.full,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.25)',
    },
    countdownText: {
      color: 'rgba(255,255,255,0.9)',
      fontSize: FontSize.caption,
      fontWeight: '600',
    },
    countdownDays: {
      color: C.white,
      fontSize: FontSize.headline,
      fontWeight: '900',
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
    heroCTATrust: {
      fontSize: FontSize.caption2,
      color: 'rgba(255,255,255,0.6)',
      marginTop: 8,
      textAlign: 'center',
    },

    // ─── Sections ───
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

    // ─── Pain Points ───
    painGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginBottom: 28,
    },
    painCard: {
      width: (isWeb ? '48%' : '100%') as DimensionValue,
      backgroundColor: C.background,
      borderRadius: BorderRadius.lg,
      padding: 18,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      flexGrow: 1,
      minWidth: 260,
      borderWidth: 1,
      borderColor: C.borderLight,
    },
    painIcon: { fontSize: 28 },
    painText: {
      fontSize: FontSize.subhead,
      color: C.text,
      fontWeight: '600',
      flex: 1,
      lineHeight: 22,
    },
    painTransition: {
      alignItems: 'center',
      gap: 12,
    },
    painArrow: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    painArrowText: {
      color: C.white,
      fontSize: FontSize.subhead,
      fontWeight: '700',
    },
    painSolution: {
      fontSize: FontSize.title3,
      fontWeight: '900',
      color: C.primary,
      textAlign: 'center',
      letterSpacing: LetterSpacing.tight,
    },

    // ─── App Mockups ───
    mockupRow: {
      flexDirection: isWeb ? 'row' : 'column',
      gap: 16,
      alignItems: isWeb ? 'stretch' : 'center',
    },
    mockupCard: {
      width: (isWeb ? '31%' : '100%') as DimensionValue,
      maxWidth: 300,
      backgroundColor: C.card,
      borderRadius: BorderRadius.xxl,
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: C.borderLight,
      flexGrow: 1,
      minWidth: 240,
    },
    mockupNotch: {
      width: 100,
      height: 6,
      backgroundColor: C.borderLight,
      borderRadius: 3,
      alignSelf: 'center',
      marginTop: 10,
    },
    mockupScreen: {
      padding: 20,
      alignItems: 'center',
    },
    mockupIcon: { fontSize: 40, marginBottom: 10 },
    mockupTitle: {
      fontSize: FontSize.headline,
      fontWeight: '800',
      color: C.text,
      marginBottom: 8,
    },
    mockupDesc: {
      fontSize: FontSize.footnote,
      color: C.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 12,
    },
    mockupDivider: {
      width: '80%',
      height: 1,
      backgroundColor: C.borderLight,
      marginBottom: 12,
    },
    mockupDetail: {
      fontSize: FontSize.caption,
      color: C.textSecondary,
      lineHeight: 20,
      alignSelf: 'flex-start',
      paddingLeft: 8,
    },

    // ─── Features ───
    featureGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    featureCard: {
      width: (isWeb ? '31%' : '47%') as DimensionValue,
      backgroundColor: C.background,
      borderRadius: BorderRadius.lg,
      padding: 18,
      minWidth: 150,
      flexGrow: 1,
    },
    featureIcon: { fontSize: 28, marginBottom: 10 },
    featureTitle: { fontSize: FontSize.subhead, fontWeight: '700', color: C.text, marginBottom: 4 },
    featureDesc: { fontSize: FontSize.caption, color: C.textSecondary, lineHeight: 18 },

    // ─── Subjects ───
    subjectList: { gap: 10 },
    subjectCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      overflow: 'hidden',
    },
    subjectAccent: { width: 5, alignSelf: 'stretch' },
    subjectIcon: { fontSize: 24, marginHorizontal: 14 },
    subjectInfo: { flex: 1, paddingVertical: 16, paddingRight: 16 },
    subjectName: { fontSize: FontSize.subhead, fontWeight: '700', color: C.text },
    subjectDesc: { fontSize: FontSize.caption, color: C.textSecondary, marginTop: 3 },

    // ─── Reasons ───
    reasonGrid: {
      flexDirection: isWeb ? 'row' : 'column',
      gap: 16,
      alignItems: isWeb ? 'stretch' : 'center',
    },
    reasonCard: {
      width: (isWeb ? '31%' : '100%') as DimensionValue,
      maxWidth: 360,
      backgroundColor: C.background,
      borderRadius: BorderRadius.lg,
      padding: 24,
      alignItems: 'center',
      flexGrow: 1,
      minWidth: 260,
    },
    reasonNumBadge: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    reasonNum: {
      fontSize: FontSize.title2,
      fontWeight: '900',
      color: C.white,
    },
    reasonTitle: {
      fontSize: FontSize.headline,
      fontWeight: '800',
      color: C.text,
      marginBottom: 10,
      textAlign: 'center',
    },
    reasonDesc: {
      fontSize: FontSize.footnote,
      color: C.textSecondary,
      lineHeight: 22,
      textAlign: 'center',
    },

    // ─── Target Audience ───
    targetList: {
      gap: 10,
      maxWidth: 480,
      alignSelf: 'center',
      width: '100%',
    },
    targetItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      padding: 16,
      gap: 14,
    },
    targetCheck: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: C.primarySurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    targetCheckText: {
      fontSize: FontSize.subhead,
      fontWeight: '800',
      color: C.primary,
    },
    targetText: {
      fontSize: FontSize.subhead,
      fontWeight: '600',
      color: C.text,
      flex: 1,
    },

    // ─── Plans ───
    planRow: {
      flexDirection: isWeb ? 'row' : 'column',
      gap: 16,
      alignItems: isWeb ? 'stretch' : 'center',
    },
    planCard: {
      backgroundColor: C.background,
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

    // ─── Comparison Table ───
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

    // ─── Steps ───
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

    // ─── FAQ ───
    faqList: {
      gap: 10,
      maxWidth: 640,
      alignSelf: 'center',
      width: '100%',
    },
    faqItem: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.lg,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: C.borderLight,
    },
    faqHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 18,
      gap: 12,
    },
    faqQ: {
      fontSize: FontSize.subhead,
      fontWeight: '700',
      color: C.text,
      flex: 1,
      lineHeight: 22,
    },
    faqToggle: {
      fontSize: FontSize.title3,
      fontWeight: '700',
      color: C.primary,
      width: 28,
      textAlign: 'center',
    },
    faqBody: {
      paddingHorizontal: 18,
      paddingBottom: 18,
      paddingTop: 0,
    },
    faqA: {
      fontSize: FontSize.footnote,
      color: C.textSecondary,
      lineHeight: 22,
    },

    // ─── Trust ───
    trustGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    trustCard: {
      width: (isWeb ? '23%' : '47%') as DimensionValue,
      backgroundColor: C.background,
      borderRadius: BorderRadius.lg,
      padding: 18,
      alignItems: 'center',
      minWidth: 140,
      flexGrow: 1,
    },
    trustIcon: { fontSize: 28, marginBottom: 8 },
    trustTitle: { fontSize: FontSize.footnote, fontWeight: '700', color: C.text, marginBottom: 4 },
    trustDesc: { fontSize: FontSize.caption2, color: C.textSecondary, textAlign: 'center', lineHeight: 16 },

    // ─── Final CTA ───
    finalCTA: {
      backgroundColor: C.primary,
      margin: Spacing.xl,
      borderRadius: BorderRadius.xxl,
      padding: 36,
      alignItems: 'center',
    },
    finalCountdown: {
      backgroundColor: 'rgba(255,255,255,0.15)',
      borderRadius: BorderRadius.full,
      paddingHorizontal: 22,
      paddingVertical: 10,
      marginBottom: 20,
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 6,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.25)',
    },
    finalCountdownLabel: {
      fontSize: FontSize.footnote,
      color: 'rgba(255,255,255,0.85)',
      fontWeight: '600',
    },
    finalCountdownDays: {
      fontSize: FontSize.title2,
      fontWeight: '900',
      color: C.white,
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
      paddingVertical: 20,
      paddingHorizontal: 48,
      width: '100%',
      alignItems: 'center',
      marginBottom: 10,
    },
    finalCTABtnText: {
      fontSize: FontSize.title3,
      fontWeight: '900',
      color: C.primary,
    },
    finalCTABtnSub: {
      fontSize: FontSize.caption,
      color: C.primaryLight,
      marginTop: 4,
      fontWeight: '500',
    },
    finalCTANote: { fontSize: FontSize.caption, color: 'rgba(255,255,255,0.6)' },
    finalCTATrust: {
      fontSize: FontSize.caption2,
      color: 'rgba(255,255,255,0.5)',
      marginTop: 8,
      textAlign: 'center',
    },

    // ─── Footer ───
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
