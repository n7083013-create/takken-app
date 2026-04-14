// ============================================================
// ダークテーマカラー（OLED対応・目に優しい設計）
// ============================================================
// 設計原則:
// - 純黒(#000)を避け、わずかに暖色を含むダークグレー
// - テキストも純白を避け、#F2F2F7で目の負担軽減
// - Primary を明るめに調整してダーク背景での視認性確保
// - カード ↔ 背景のコントラストは控えめ（2:1程度）

export const DarkColors = {
  primary: '#3DBA5E',          // 明るめグリーン
  primaryDark: '#1B7A3D',
  primaryLight: '#6FCF7F',
  primarySurface: '#1A2E1F',   // primary の暗い背景用

  accent: '#F5A623',
  accentLight: '#FFC947',
  accentDark: '#E8860C',

  success: '#34C759',          // iOS system green dark
  warning: '#FFD60A',          // iOS system yellow dark
  error: '#FF453A',            // iOS system red dark

  background: '#111312',       // ほんのり暖色の黒
  surface: '#111312',
  card: '#1C1E1D',             // カード（背景との差をつける）
  cardElevated: '#252726',     // 高優先カード

  text: '#F2F2F7',             // iOS label dark
  textSecondary: '#A1A1A6',    // iOS secondaryLabel dark
  textTertiary: '#636366',     // iOS tertiaryLabel dark
  textDisabled: '#48484A',     // iOS quaternaryLabel dark

  border: '#2C2E2D',
  borderLight: '#232524',
  white: '#FFFFFF',

  // Semantic surfaces（ダーク用: 薄い背景色）
  successSurface: '#0D2818',    // 正解系の背景
  errorSurface: '#2D1215',      // 不正解系の背景
  warningSurface: '#2D2406',    // 警告系の背景
  infoSurface: '#0D1A2D',       // 情報系の背景

  // Category colors（ダーク背景で視認性確保）
  kenri: '#3DBA5E',
  takkengyoho: '#4DABF5',
  horei_seigen: '#F5944E',
  tax_other: '#B47DE0',
} as const;
