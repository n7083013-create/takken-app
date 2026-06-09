// ============================================================
// 予測スコアカード（本試験予測点数 統一システム / Phase2）
// ============================================================
// compact: ホームの 1 行プレビュー。主役は「予測点数」1つ (合格確率%は出さない)。
//          合格ライン併記 + 合格圏内/あと◯点 + 信頼度 + 「あと◯問で精度↑」。
// full   : 記録タブ予測ハブ①。予測点数 + 95%信頼区間 + 合格ライン + 合格可能性 +
//          当日見込 + 科目別内訳。passProbability はハブでは併記してよい。
//
// 設計の正本: Vault/.../2026-06-09_本試験予測点数_統一システム設計.md (designer)
//   死蔵だった本コンポーネントを「予測点数主役」へ小改修して配線で復活させる。

import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FontSize, Spacing, BorderRadius, Shadow, LetterSpacing } from '../constants/theme';
import { EXAM_TOTAL, PASS_LINE } from '../constants/exam';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';
import { CATEGORY_LABELS, CATEGORY_COLORS } from '../types';
import type { ExamPrediction } from '../hooks/useExamPrediction';
import type { PredictionSnapshot } from '../hooks/usePredictionHistory';
import { questionsToNextConfidence } from '../utils/predictionDisplay';

interface PredictionCardProps {
  prediction: ExamPrediction;
  history: PredictionSnapshot[];
  /** ホームの 1 行プレビュー (予測点数主役・確率%なし・外枠は親に委ねる) */
  compact?: boolean;
}

const CONFIDENCE_LABEL: Record<ExamPrediction['confidence'], string> = {
  high: 'データ信頼度：高',
  medium: 'データ信頼度：中',
  low: '測定中（データ少）',
};

/** スパークライン（簡易SVG風・View描画） */
function Sparkline({ data, color, height = 28 }: { data: number[]; color: string; height?: number }) {
  if (data.length < 2) {
    return <View style={{ height, justifyContent: 'center' }}><Text style={{ fontSize: 10, color: '#999' }}>データ蓄積中</Text></View>;
  }

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = Math.max(max - min, 1);
  const BARS = 14;  // 直近14点まで表示

  const displayed = data.slice(-BARS);
  const padding = new Array(Math.max(0, BARS - displayed.length)).fill(null);
  const bars = [...padding, ...displayed];

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: 2 }}>
      {bars.map((v, i) => {
        if (v === null) return <View key={i} style={{ flex: 1 }} />;
        const h = Math.max(4, ((v - min) / range) * height);
        const isLast = i === bars.length - 1;
        return (
          <View
            key={i}
            style={{
              flex: 1,
              height: h,
              backgroundColor: isLast ? color : color + '60',
              borderRadius: 2,
            }}
          />
        );
      })}
    </View>
  );
}

export function PredictionCard({ prediction, history, compact = false }: PredictionCardProps) {
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const {
    totalPredicted,
    passProbability,
    confidence,
    daysUntilExam,
    predictedAtExam,
    pointsToPass,
    weakestCategory,
    perCategory,
    predictionInterval,
    growthPerDay,
    momentum,
    effectiveSampleSize,
  } = prediction;

  const isPassing = totalPredicted >= PASS_LINE;
  const scoreColor = isPassing ? colors.primary : colors.error;
  const margin = totalPredicted - PASS_LINE;
  const toPrecision = questionsToNextConfidence(effectiveSampleSize, confidence);

  // 推移: 1週間前との比較
  const trend = useMemo(() => {
    if (history.length < 2) return null;
    const now = history[history.length - 1].score;
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - 7);
    const targetStr = targetDate.toISOString().slice(0, 10);
    let oldScore: number | null = null;
    for (const snap of history) {
      if (snap.date <= targetStr) oldScore = snap.score;
      else break;
    }
    if (oldScore === null) oldScore = history[0].score;
    const diff = now - oldScore;
    return { diff, label: diff > 0 ? `+${diff}` : `${diff}` };
  }, [history]);

  const scoreHistory = useMemo(() => history.map((h) => h.score), [history]);

  // ── compact: ホームの 1 行プレビュー (予測点数だけが主役) ──
  if (compact) {
    return (
      <View style={s.compactWrap}>
        <View style={s.compactTop}>
          <Text style={s.compactLabel}>本試験 予測点数</Text>
          <Text style={s.compactConfidence}>{CONFIDENCE_LABEL[confidence]}</Text>
        </View>
        <View style={s.compactScoreRow}>
          <Text style={[s.compactScore, { color: scoreColor }]}>{totalPredicted}</Text>
          <Text style={s.compactDenom}>点 / {EXAM_TOTAL}</Text>
          <View style={s.compactPassPill}>
            <Text style={s.compactPassPillText}>合格 {PASS_LINE}点</Text>
          </View>
        </View>
        <Text style={[s.compactVerdict, { color: isPassing ? colors.success : colors.error }]}>
          {isPassing ? `✓ 合格圏内 +${margin}点` : `あと ${pointsToPass}点`}
          {toPrecision > 0 && (
            <Text style={s.compactHint}>{`　・あと${toPrecision}問で精度↑`}</Text>
          )}
        </Text>
      </View>
    );
  }

  // ── full: 記録タブ予測ハブ① ──
  return (
    <View style={[s.card, Shadow.md]}>
      {/* ── ヘッダー: 予測点数を主役に。合格可能性は副指標として併記 ── */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.headerLabel}>本試験 予測点数</Text>
          <View style={s.scoreRow}>
            <Text style={[s.scoreNum, { color: scoreColor }]}>{totalPredicted}</Text>
            <Text style={s.scoreUnit}>点</Text>
            <Text style={s.scoreDenom}>/{EXAM_TOTAL}</Text>
          </View>
          <Text style={s.confidence}>📊 {CONFIDENCE_LABEL[confidence]}</Text>
        </View>
        <View style={s.headerRight}>
          <Text style={s.probLabel}>合格可能性</Text>
          <Text style={[s.probNum, { color: scoreColor }]}>{passProbability}<Text style={s.probUnit}>%</Text></Text>
          {trend && (
            <Text style={[
              s.trend,
              { color: trend.diff > 0 ? colors.success : trend.diff < 0 ? colors.error : colors.textTertiary },
            ]}>
              {trend.diff > 0 ? '↑' : trend.diff < 0 ? '↓' : '→'} {trend.label}点 / 1週間
            </Text>
          )}
        </View>
      </View>

      {/* ── 合格ラインゲージ ── */}
      <View style={s.gauge}>
        <View style={s.gaugeTrack}>
          <View style={[
            s.gaugeFill,
            {
              width: `${Math.min(100, (totalPredicted / EXAM_TOTAL) * 100)}%`,
              backgroundColor: isPassing ? colors.primary : colors.accent,
            },
          ]} />
          <View style={[s.passLine, { left: `${(PASS_LINE / EXAM_TOTAL) * 100}%` }]}>
            <Text style={s.passLineLabel}>合格 {PASS_LINE}</Text>
          </View>
        </View>
      </View>

      {/* ── 95%信頼区間 (常時表示・科学的透明性) ── */}
      {predictionInterval && (
        <View style={s.ciBox}>
          <Text style={s.ciLabel}>95%の確率で</Text>
          <Text style={s.ciRange}>
            {predictionInterval.lower}〜{predictionInterval.upper}点 の範囲に入る
            {confidence === 'low' && <Text style={s.ciMeasuring}>（測定中）</Text>}
          </Text>
          {toPrecision > 0 && (
            <Text style={s.ciHint}>あと{toPrecision}問解くと予測の精度が上がります</Text>
          )}
        </View>
      )}

      {/* ── 推移スパークライン ── */}
      {scoreHistory.length >= 2 && (
        <View style={s.sparkRow}>
          <Text style={s.sparkLabel}>直近{Math.min(14, scoreHistory.length)}日の推移</Text>
          <View style={s.sparkLine}>
            <Sparkline data={scoreHistory} color={colors.primary} />
          </View>
        </View>
      )}

      {/* ── モメンタム (直近7日の傾向) ── */}
      {momentum !== 'insufficient' && (
        <View style={s.momentumBox}>
          <Text style={s.momentumIcon}>
            {momentum === 'rising' ? '📈' : momentum === 'falling' ? '📉' : '➡️'}
          </Text>
          <Text style={s.momentumText}>
            {momentum === 'rising' && '直近7日：上昇傾向 — このまま継続！'}
            {momentum === 'falling' && '直近7日：下降傾向 — 集中力を取り戻そう'}
            {momentum === 'stable' && '直近7日：横ばい — 苦手を攻めて突破口を'}
          </Text>
        </View>
      )}

      {/* ── 当日見込 (このペースで当日◯点) ── */}
      {daysUntilExam !== null && predictedAtExam !== null && (
        <View style={s.examRow}>
          <Text style={s.examDaysLabel}>試験まで {daysUntilExam} 日</Text>
          <View style={s.examPredictionBox}>
            <Text style={s.examPredictionLabel}>
              このペースで続けると（成長率: {growthPerDay >= 0 ? '+' : ''}{growthPerDay.toFixed(2)}点/日）
            </Text>
            <Text style={[
              s.examPredictionValue,
              { color: predictedAtExam >= PASS_LINE ? colors.success : colors.error },
            ]}>
              試験当日 {predictedAtExam} 点{predictedAtExam >= PASS_LINE ? '（合格圏）' : '（あと' + (PASS_LINE - predictedAtExam) + '点）'}
            </Text>
          </View>
        </View>
      )}

      {/* ── 科目別内訳 (ハブ②) ── */}
      <View style={s.catGrid}>
        {perCategory.map((item) => {
          const catColor = CATEGORY_COLORS[item.category];
          const isWeak = item.category === weakestCategory;
          return (
            <View key={item.category} style={[s.catRow, isWeak && s.catRowWeak]}>
              <View style={[s.catDot, { backgroundColor: catColor }]} />
              <Text style={s.catLabel} numberOfLines={1}>
                {CATEGORY_LABELS[item.category]}
                {isWeak && ' ⚠️'}
              </Text>
              <View style={s.catBar}>
                <View style={s.catBarTrack}>
                  <View style={[s.catBarFill, {
                    width: `${(item.predicted / item.allocation) * 100}%`,
                    backgroundColor: catColor,
                  }]} />
                </View>
              </View>
              <Text style={[s.catVal, { color: catColor }]}>
                {item.predicted.toFixed(1)}
              </Text>
              <Text style={s.catMax}>/{item.allocation}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.xl,
      padding: Spacing.lg,
    },

    // ── compact (ホーム 1 行プレビュー) ──
    compactWrap: {},
    compactTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    compactLabel: {
      fontSize: FontSize.footnote,
      fontWeight: '700',
      color: C.text,
    },
    compactConfidence: {
      fontSize: FontSize.caption2,
      fontWeight: '600',
      color: C.textTertiary,
    },
    compactScoreRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 6,
    },
    compactScore: {
      fontSize: 40,
      fontWeight: '900',
      letterSpacing: -1,
    },
    compactDenom: {
      fontSize: FontSize.footnote,
      fontWeight: '700',
      color: C.textSecondary,
    },
    compactPassPill: {
      marginLeft: 'auto',
      backgroundColor: C.surface,
      borderRadius: BorderRadius.full,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    compactPassPillText: {
      fontSize: FontSize.caption,
      fontWeight: '700',
      color: C.textSecondary,
    },
    compactVerdict: {
      fontSize: FontSize.footnote,
      fontWeight: '800',
      marginTop: 4,
    },
    compactHint: {
      fontSize: FontSize.caption,
      fontWeight: '600',
      color: C.textTertiary,
    },

    // Header
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: Spacing.md,
    },
    headerLeft: {
      flex: 1,
    },
    headerLabel: {
      fontSize: FontSize.caption,
      fontWeight: '700',
      color: C.textSecondary,
      letterSpacing: LetterSpacing.wide,
    },
    scoreRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      marginTop: 2,
    },
    scoreNum: {
      fontSize: 48,
      fontWeight: '900',
      letterSpacing: -1,
    },
    scoreUnit: {
      fontSize: 20,
      fontWeight: '800',
      color: C.textSecondary,
      marginLeft: 2,
    },
    scoreDenom: {
      fontSize: FontSize.subhead,
      fontWeight: '600',
      color: C.textTertiary,
      marginLeft: 2,
    },
    confidence: {
      fontSize: FontSize.caption2,
      color: C.textTertiary,
      marginTop: 2,
      fontWeight: '600',
    },
    headerRight: {
      alignItems: 'flex-end',
    },
    probLabel: {
      fontSize: FontSize.caption2,
      color: C.textTertiary,
      fontWeight: '600',
    },
    probNum: {
      fontSize: FontSize.title2,
      fontWeight: '900',
    },
    probUnit: {
      fontSize: FontSize.subhead,
      fontWeight: '800',
    },
    trend: {
      fontSize: FontSize.caption2,
      fontWeight: '700',
      marginTop: 4,
    },

    // Gauge
    gauge: {
      marginVertical: Spacing.md,
    },
    gaugeTrack: {
      height: 12,
      backgroundColor: C.borderLight,
      borderRadius: 6,
      overflow: 'visible',
      position: 'relative',
    },
    gaugeFill: {
      height: '100%',
      borderRadius: 6,
    },
    passLine: {
      position: 'absolute',
      top: -4,
      width: 2,
      height: 20,
      backgroundColor: C.text,
    },
    passLineLabel: {
      position: 'absolute',
      top: 22,
      left: -30,
      width: 60,
      fontSize: 9,
      fontWeight: '700',
      color: C.textSecondary,
      textAlign: 'center',
    },

    // Sparkline
    sparkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: Spacing.lg,
      marginBottom: Spacing.md,
    },
    sparkLabel: {
      fontSize: FontSize.caption2,
      color: C.textTertiary,
      fontWeight: '600',
      flex: 0,
      minWidth: 80,
    },
    sparkLine: {
      flex: 1,
    },

    // CI
    ciBox: {
      marginTop: Spacing.sm,
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.md,
      backgroundColor: C.surface,
      borderRadius: BorderRadius.md,
      borderLeftWidth: 3,
      borderLeftColor: C.primary,
    },
    ciLabel: {
      fontSize: 11,
      color: C.textSecondary,
      marginBottom: 2,
    },
    ciRange: {
      fontSize: 14,
      fontWeight: '700',
      color: C.text,
    },
    ciMeasuring: {
      fontSize: 12,
      fontWeight: '700',
      color: C.accent,
    },
    ciHint: {
      fontSize: 11,
      color: C.textTertiary,
      marginTop: 3,
      fontWeight: '600',
    },
    momentumBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginTop: Spacing.sm,
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.md,
      backgroundColor: C.surface,
      borderRadius: BorderRadius.md,
    },
    momentumIcon: {
      fontSize: 20,
    },
    momentumText: {
      flex: 1,
      fontSize: 12,
      fontWeight: '600',
      color: C.text,
    },
    examRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.background,
      borderRadius: BorderRadius.md,
      padding: 10,
      marginTop: Spacing.md,
      gap: 10,
    },
    examDaysLabel: {
      fontSize: FontSize.caption,
      fontWeight: '800',
      color: C.text,
    },
    examPredictionBox: {
      flex: 1,
      borderLeftWidth: 1,
      borderLeftColor: C.borderLight,
      paddingLeft: 10,
    },
    examPredictionLabel: {
      fontSize: FontSize.caption2,
      color: C.textTertiary,
      marginBottom: 2,
    },
    examPredictionValue: {
      fontSize: FontSize.caption,
      fontWeight: '800',
    },

    // Category grid
    catGrid: {
      gap: 8,
      marginTop: Spacing.md,
    },
    catRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 4,
      paddingHorizontal: 6,
      borderRadius: BorderRadius.sm,
    },
    catRowWeak: {
      backgroundColor: C.warningSurface,
    },
    catDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    catLabel: {
      fontSize: FontSize.caption,
      fontWeight: '600',
      color: C.text,
      width: 110,
    },
    catBar: {
      flex: 1,
    },
    catBarTrack: {
      height: 6,
      backgroundColor: C.borderLight,
      borderRadius: 3,
      overflow: 'hidden',
    },
    catBarFill: {
      height: '100%',
    },
    catVal: {
      fontSize: FontSize.caption,
      fontWeight: '800',
      minWidth: 28,
      textAlign: 'right',
    },
    catMax: {
      fontSize: FontSize.caption2,
      color: C.textTertiary,
    },
  });
}
