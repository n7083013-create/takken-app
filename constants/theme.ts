// ============================================================
// 宅建士 完全対策 - テーマ定数（超一流UI品質）
// ============================================================
// 設計原則:
// - WCAG AA準拠のコントラスト比（本文4.5:1以上、大文字3:1以上）
// - ブルーライト軽減: 暖色寄りの白背景（純白を避ける）
// - 長時間学習でも疲れにくい中間コントラスト
// - iOS Human Interface Guidelines / Material Design 3 準拠のスケール

export const Colors = {
  // Primary (Forest Green - 落ち着いた深緑)
  primary: '#1B7A3D',
  primaryDark: '#145C2E',
  primaryLight: '#34A853',
  primarySurface: '#E8F5EC',   // primary の薄い背景用

  // Accent (Warm Amber)
  accent: '#E8860C',
  accentLight: '#F5A623',
  accentDark: '#C2690A',

  // Semantic（やや彩度を抑えて目に優しく）
  success: '#0F9D58',
  warning: '#F29D0B',
  error: '#D93025',

  // Backgrounds & Surfaces（微暖色系でブルーライト軽減）
  background: '#F5F6F3',      // ほんのり暖色グレー（純白より目に優しい）
  surface: '#F5F6F3',
  card: '#FFFFFF',
  cardElevated: '#FFFFFF',     // 高優先カード

  // Text（純黒を避け、わずかに暖色を含む）
  text: '#1D1D1F',            // Apple SF系ブラック（コントラスト比15:1）
  textSecondary: '#555658',   // 読みやすいセカンダリ（コントラスト比7:1）
  textTertiary: '#8E8E93',    // iOS systemGray（コントラスト比3.5:1）
  textDisabled: '#AEAEB2',    // iOS systemGray2

  // Borders
  border: '#E1E2DE',          // 暖色寄りボーダー
  borderLight: '#EDEDEB',     // 薄いセパレータ

  // Semantic surfaces（ライト用: 薄い背景色）
  successSurface: '#F0FDF4',   // 正解系の背景
  errorSurface: '#FEF2F2',     // 不正解系の背景
  warningSurface: '#FFF8E1',   // 警告系の背景
  infoSurface: '#EEF2FF',      // 情報系の背景

  // Base
  white: '#FFFFFF',

  // Category colors（彩度を統一、視認性重視）
  kenri: '#1B7A3D',           // 深緑（民法）
  takkengyoho: '#1A6DC2',     // ロイヤルブルー（業法）
  horei_seigen: '#C75A1A',    // テラコッタ（法令制限）
  tax_other: '#7B3FA0',       // ロイヤルパープル（税その他）
} as const;

// ─── タイポグラフィ ───
// iOS Dynamic Type Scale に準拠した読みやすいサイズ体系
// 本文は15-16px（学習アプリの最適値: 長文でも目が疲れない）
export const FontSize = {
  caption2: 11,    // 最小ラベル
  caption: 12,     // キャプション・バッジ
  footnote: 13,    // 補足テキスト
  subhead: 15,     // サブヘッド・リスト本文
  body: 16,        // 本文（メインの読み物サイズ）
  callout: 17,     // 問題文・重要テキスト
  headline: 18,    // 見出し
  title3: 20,      // セクション見出し
  title2: 22,      // 画面サブタイトル
  title1: 26,      // 画面タイトル
  largeTitle: 32,  // ヒーロータイトル
} as const;

// ─── 行間 ───
// 日本語は英語より行間が必要（1.6-1.8倍が最適）
export const LineHeight = {
  caption: 16,     // FontSize.caption × 1.33
  footnote: 18,    // FontSize.footnote × 1.38
  subhead: 22,     // FontSize.subhead × 1.47
  body: 26,        // FontSize.body × 1.625（日本語最適値）
  callout: 28,     // FontSize.callout × 1.65
  headline: 26,    // FontSize.headline × 1.44
  title3: 28,      // FontSize.title3 × 1.4
  title2: 30,      // FontSize.title2 × 1.36
  title1: 34,      // FontSize.title1 × 1.31
} as const;

// ─── フォントウェイト ───
export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};

// ─── 字間（レタースペーシング）───
// 日本語見出しは詰め気味、本文はデフォルト
export const LetterSpacing = {
  tight: -0.5,     // 大見出し
  normal: 0,       // 本文
  wide: 0.3,       // キャプション・ラベル
} as const;

// ─── スペーシング ───
// 8ptグリッドベース（一貫した余白リズム）
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  xxxxl: 48,
} as const;

// ─── 角丸 ───
export const BorderRadius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  xxl: 24,
  full: 9999,
} as const;

// ─── シャドウ ───
// iOS-native に近い繊細なシャドウ（重すぎず軽すぎず）
export const Shadow = {
  sm: {
    shadowColor: '#1D1D1F',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  md: {
    shadowColor: '#1D1D1F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  lg: {
    shadowColor: '#1D1D1F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 14,
    elevation: 5,
  },
  xl: {
    shadowColor: '#1D1D1F',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 8,
  },
} as const;

// ─── 難易度 ───
export const DifficultyLabel: Record<1 | 2 | 3, string> = {
  1: '基礎',
  2: '標準',
  3: '応用',
};

export const DifficultyColor: Record<1 | 2 | 3, string> = {
  1: '#0F9D58',    // success green
  2: '#F29D0B',    // warm amber
  3: '#D93025',    // alert red
};
