// ============================================================
// UI primitives variant スタイル解決(純関数)
// ============================================================
// Button / Card / Badge の variant -> ViewStyle/TextStyle 解決を
// 純関数として切り出す。理由:
//   1. ts-jest + node 環境では .tsx の JSX を parse できないため、
//      テスト対象のロジックを JSX-free な .ts に分離する
//   2. variant ロジックを一箇所に集約することで、テーマトークン
//      経由のスタイル解決を機械的に検証できる(UI監査 H1 回帰防止)
//   3. takken / gas-shunin で同じ純関数を共有することで横展開playbook化

import type { ViewStyle, TextStyle } from 'react-native';
import { Shadow } from '../../constants/theme';
import type { ThemeColors } from '../../hooks/useThemeColors';

// ---- Button ----

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';

export interface ButtonVariantStyle {
  container: ViewStyle;
  text: TextStyle;
  indicator: string;
}

export function resolveButtonVariantStyle(
  variant: ButtonVariant,
  colors: ThemeColors,
): ButtonVariantStyle {
  // on{Primary,Accent,Error} はテーマごとに該当背景上で WCAG AA (≥ 4.5:1) を満たす色
  switch (variant) {
    case 'primary':
      return {
        container: { backgroundColor: colors.primary },
        text: { color: colors.onPrimary },
        indicator: colors.onPrimary,
      };
    case 'secondary':
      return {
        container: { backgroundColor: colors.accent },
        text: { color: colors.onAccent },
        indicator: colors.onAccent,
      };
    case 'outline':
      return {
        container: {
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderColor: colors.primary,
        },
        text: { color: colors.primary },
        indicator: colors.primary,
      };
    case 'ghost':
      return {
        container: { backgroundColor: 'transparent' },
        text: { color: colors.primary },
        indicator: colors.primary,
      };
    case 'danger':
      return {
        container: { backgroundColor: colors.error },
        text: { color: colors.onError },
        indicator: colors.onError,
      };
  }
}

// ---- Card ----

export type CardVariant = 'default' | 'elevated' | 'outlined' | 'flat';

export function resolveCardVariantStyle(variant: CardVariant, colors: ThemeColors): ViewStyle {
  switch (variant) {
    case 'default':
      return {
        backgroundColor: colors.card,
        ...Shadow.sm,
      };
    case 'elevated':
      return {
        backgroundColor: colors.cardElevated,
        ...Shadow.lg,
      };
    case 'outlined':
      return {
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
      };
    case 'flat':
      return {
        backgroundColor: colors.surface,
      };
  }
}

// ---- Badge ----

/**
 * Converts a hex color to rgba with the given opacity.
 * Badge は背景をブランド色の透過 (alpha 0.22) にしてピル状で表示する。
 */
export function hexToRgba(hex: string, opacity: number): string {
  const cleaned = hex.replace('#', '');
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
