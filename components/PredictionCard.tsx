// ============================================================
// 予測スコアカード（合格確率・推移・試験日予測）
// ============================================================
// - 大きい合格確率 % をメインに表示
// - 現在スコア vs 合格ライン のバー
// - 直近30日の推移スパークライン
// - 試験日までの予測スコア
// - データ信頼度表示

import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FontSize, Spacing, BorderRadius, Shadow, LetterSpacing } from '../constants/theme';
import { EXAM_TOTAL, PASS_LINE } from '../constants/exam';
import { useThemeColors, type ThemeColors } from '../hooks/useThemeColors';
import { CATEGORY_LABELS, CATEGORY_COLORS, type Category } from '../types';
import type { ExamPrediction } from '../hooks/useExamPrediction';
import type { PredictionSnapshot } from '../hooks/usePredictionHistory';

interface PredictionCardProps {
  prediction: ExamPrediction;
  history: PredictionSnapshot[];
  /** 統合ブロック内で使う圧縮表示。確率%・予測スコア・推移1行・合格ラインゲージのみ描画し、
   *  スパークライン/信頼区間/モメンタム/試験日予測/カテゴリ内訳/アドバイスは省く。
   *  外枠(card)・影・余白も親に委ねるため出さない。 */
  compact?: boolean;
}

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
  } = prediction;

  const isPassing = totalPredicted >= PASS_LINE;
  const probColor = passProbability >= 80
    ? colors.success
    : passProbability >= 50
      ? colors.primary
      : passProbability >= 30
        ? colors.accent
        : colors.error;

  // 推移: 1週間前との比較
  const trend = useMemo(() => {
    if (history.length < 2) return null;
    const now = history[history.length - 1].score;
    // 7日前に最も近いスナップを探す
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

  return (
    <View style={compact ? s.compactWrap : [s.card, Shadow.md]}>
      {/* ── ヘッダー: 合格確率 % メイン表示 ── */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.headerLabel}>合格確率</Text>
          <View style={s.probRow}>
            <Text style={[s.probNum, { color: probColor }]}>{passProbability}</Text>
            <Text style={[s.probUnit, { color: probColor }]}>%</Text>
          </View>
          <Text style={s.confidence}>
            {confidence === 'high' ? '📊 データ信頼度：高' :
             confidence === 'medium' ? '📊 データ信頼度：中' :
             '📊 データ信頼度：低（もっと解こう）'}
          </Text>
        </View>
        <View style={s.headerRight}>
          <Text style={s.scoreLabel}>予測スコア</Text>
          <View style={[
            s.scoreBox,
            { backgroundColor: isPassing ? colors.primarySurface : colors.errorSurface },
          ]}>
            <Text style={[s.scoreNum, { color: isPassing ? colors.primary : colors.error }]}>
              {totalPredicted}
            </Text>
            <Text style={s.scoreDenom}>/{EXAM_TOTAL}</Text>
          </View>
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
          {/* 合格ラインマーカー */}
          <View style={[s.passLine, { left: `${(PASS_LINE / EXAM_TOTAL) * 100}%` }]}>
            <Text style={s.passLineLabel}>合格ライン {PASS_LINE}</Text>
          </View>
        </View>
      </View>

      {/* 圧縮表示は「確率%・ゲージ・推移1行」までで打ち切り (統合ブロックの上段用) */}
      {compact ? null : (<>

      {/* ── 推移スパークライン ── */}
      {scoreHistory.length >= 2 && (
        <View style={s.sparkRow}>
          <Text style={s.sparkLabel}>直近{Math.min(14, scoreHistory.length)}日の推移</Text>
          <View style={s.sparkLine}>
            <Sparkline data={scoreHistory} color={colors.primary} />
          </View>
        </View>
      )}

      {/* ── 95%信頼区間 (科学的透明性) ── */}
      {confidence !== 'low' && predictionInterval && (
        <View style={s.ciBox}>
          <Text style={s.ciLabel}>95%の確率で</Text>
          <Text style={s.ciRange}>
            {predictionInterval.lower}〜{predictionInterval.upper}点 の範囲に入る
          </Text>
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

      {/* ── 試験日予測 ── */}
      {daysUntilExam !== null && predictedAtExam !== null && (
        <View style={s.examRow}>
          <Text style={s.examDaysLabel}>試験まで {daysUntilExam} 日</Text>
          <View style={s.examPredictionBox}>
            <Text style={s.examPredictionLabel}>
              このペースで続けると（個人別成長率: {growthPerDay >= 0 ? '+' : ''}{growthPerDay.toFixed(2)}点/日）
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

      {/* ── カテゴリ別内訳 ── */}
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

      {/* ── アドバイス ── */}
      {weakestCategory && pointsToPass > 0 && (
        <View style={s.adviceBox}>
          <Text style={s.adviceIcon}>💡</Text>
          <Text style={s.adviceText}>
            <Text style={{ fontWeight: '800' }}>{CATEGORY_LABELS[weakestCategory]}</Text>を集中強化すると合格ラインに届きやすいです
          </Text>
        </View>
      )}
      {pointsToPass === 0 && (
        <View style={[s.adviceBox, { backgroundColor: colors.primarySurface }]}>
          <Text style={s.adviceIcon}>🎉</Text>
          <Text style={[s.adviceText, { color: colors.primary, fontWeight: '700' }]}>
            合格圏内！このペースを維持しましょう
          </Text>
        </View>
      )}
      </>)}
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: C.card,
      borderRadius: BorderRadius.xl,
      padding: Spacing.lg,
      marginHorizontal: Spacing.lg,
      marginTop: Spacing.md,
    },
    // 統合ブロック内の上段用: 外枠/余白なし (親カードが chrome を持つ)
    compactWrap: {},

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
    probRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      marginTop: 2,
    },
    probNum: {
      fontSize: 48,
      fontWeight: '900',
      letterSpacing: -1,
    },
    probUnit: {
      fontSize: 20,
      fontWeight: '800',
      marginLeft: 2,
    },
    confidence: {
      fontSize: FontSize.caption2,
      color: C.textTertiary,
      marginTop: -2,
      fontWeight: '600',
    },
    headerRight: {
      alignItems: 'flex-end',
    },
    scoreLabel: {
      fontSize: FontSize.caption2,
      color: C.textTertiary,
      fontWeight: '600',
      marginBottom: 4,
    },
    scoreBox: {
      flexDirection: 'row',
      alignItems: 'baseline',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: BorderRadius.md,
    },
    scoreNum: {
      fontSize: FontSize.title3,
      fontWeight: '800',
    },
    scoreDenom: {
      fontSize: FontSize.caption,
      color: C.textTertiary,
      fontWeight: '600',
      marginLeft: 2,
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

    // Exam prediction
    ciBox: {
      marginTop: Spacing.sm,
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.md,
      backgroundColor: C.card,
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
    momentumBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginTop: Spacing.sm,
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.md,
      backgroundColor: C.card,
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
      marginBottom: Spacing.md,
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

    // Advice
    adviceBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: C.warningSurface,
      padding: 10,
      borderRadius: BorderRadius.md,
      marginTop: Spacing.md,
    },
    adviceIcon: {
      fontSize: 18,
    },
    adviceText: {
      flex: 1,
      fontSize: FontSize.caption,
      color: C.textSecondary,
      lineHeight: 18,
    },
  });
}
