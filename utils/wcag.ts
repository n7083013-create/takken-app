// ============================================================
// WCAG コントラスト比計算ユーティリティ
// ============================================================
// 仕様: https://www.w3.org/TR/WCAG21/#contrast-minimum
// - AA 通常テキスト: 4.5:1 以上
// - AA 大文字 (18pt以上 or 14pt以上 bold): 3:1 以上
// - AAA 通常テキスト: 7:1 以上
//
// 用途: theme.ts / darkTheme.ts の onPrimary × primary 等が
// 設計目標を満たすかをテスト時に自動検証する。

interface RGB {
  r: number;
  g: number;
  b: number;
}

function parseHex(hex: string): RGB {
  const cleaned = hex.replace('#', '');
  return {
    r: parseInt(cleaned.substring(0, 2), 16),
    g: parseInt(cleaned.substring(2, 4), 16),
    b: parseInt(cleaned.substring(4, 6), 16),
  };
}

// sRGB 線形化 (WCAG 仕様準拠)
function toLinear(value: number): number {
  const ratio = value / 255;
  return ratio <= 0.03928 ? ratio / 12.92 : Math.pow((ratio + 0.055) / 1.055, 2.4);
}

function relativeLuminance(rgb: RGB): number {
  const r = toLinear(rgb.r);
  const g = toLinear(rgb.g);
  const b = toLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * 2 色のコントラスト比を WCAG 仕様に従い算出 (1.0 - 21.0)。
 * 順序は問わない (最大/最小を内部で判定)。
 */
export function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(parseHex(hexA));
  const lumB = relativeLuminance(parseHex(hexB));
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}
