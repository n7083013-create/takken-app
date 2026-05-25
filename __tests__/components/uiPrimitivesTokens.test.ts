// ============================================================
// UI primitives (Button / Badge / ProgressBar / Card) が
// theme トークン経由になっているかの静的検査 + variant 純関数テスト
// ============================================================
//
// 2026-05 UI監査:
//   Button/Badge/ProgressBar/Card が #2E7D32 をハードコードしていたため、
//   ダークモード/テーマ変更で色が追従しない問題があった。
// 2026-05-24 T3-T6 round 2:
//   variantStyles.ts を gas-shunin と同形で導入し、variant 解決の
//   純関数テストも追加 (M1: playbook 化のための構造統一)。
//
// このテストは「設計の意図」を機械的に保証する:
//   1. ファイル内に過去のハードコード緑が含まれない
//   2. theme.ts / useThemeColors から token を import している
//   3. 局所 COLORS const を再導入していない (Button/Card のアンチパターン)
//   4. variant 解決が on{Primary,Accent,Error} トークン経由になっている

import fs from 'fs';
import path from 'path';
import { Colors } from '../../constants/theme';
import { DarkColors } from '../../constants/darkTheme';
import {
  resolveButtonVariantStyle,
  resolveCardVariantStyle,
  hexToRgba,
} from '../../components/ui/variantStyles';
import type {
  ButtonVariant as ButtonVariantType,
  CardVariant as CardVariantType,
} from '../../components/ui/variantStyles';
import type { ThemeColors } from '../../hooks/useThemeColors';

const UI_DIR = path.join(__dirname, '..', '..', 'components', 'ui');

const PRIMITIVES = ['Button.tsx', 'Badge.tsx', 'ProgressBar.tsx', 'Card.tsx'];

const FORBIDDEN_GREENS = ['#2E7D32', '#1B5E20', '#199353'];

function readSrc(file: string): string {
  return fs.readFileSync(path.join(UI_DIR, file), 'utf-8');
}

const LightT = Colors as unknown as ThemeColors;
const DarkT = DarkColors as unknown as ThemeColors;

describe.each(PRIMITIVES)('%s - token化要件', (file) => {
  const src = readSrc(file);

  test.each(FORBIDDEN_GREENS)('過去ハードコード緑 %s を含まないこと', (forbidden) => {
    expect(src).not.toContain(forbidden);
  });

  test('useThemeColors を import していること', () => {
    expect(src).toMatch(/from\s+['"]\.\.\/\.\.\/hooks\/useThemeColors['"]/);
    expect(src).toMatch(/useThemeColors\s*\(/);
  });

  test('constants/theme から token を import していること (BorderRadius/Spacing/FontSize/Shadow いずれか)', () => {
    expect(src).toMatch(/from\s+['"]\.\.\/\.\.\/constants\/theme['"]/);
    expect(src).toMatch(/\b(BorderRadius|Spacing|FontSize|FontWeight|LineHeight|Shadow)\b/);
  });

  test('局所 COLORS const を再導入していないこと (アンチパターン)', () => {
    // 過去 Button/Card で `const COLORS = { primary: ..., ... }` を持っていた構造を防ぐ
    expect(src).not.toMatch(/const\s+COLORS\s*=\s*\{/);
  });
});

describe('Badge - 引数省略時のフォールバック', () => {
  const src = readSrc('Badge.tsx');
  test('color 引数のデフォルト = undefined (内部で colors.primary フォールバック)', () => {
    expect(src).toMatch(/color\?\s*:\s*string/);
    // デフォルト値が固定色文字列ではないこと
    expect(src).not.toMatch(/color\s*=\s*['"]#[0-9A-Fa-f]{6}['"]/);
  });
});

describe('ProgressBar - 引数省略時のフォールバック', () => {
  const src = readSrc('ProgressBar.tsx');
  test('color/trackColor のデフォルトが固定色文字列ではない', () => {
    expect(src).not.toMatch(/color\s*=\s*['"]#[0-9A-Fa-f]{6}['"]/);
    expect(src).not.toMatch(/trackColor\s*=\s*['"]#[0-9A-Fa-f]{6}['"]/);
  });
});

// ============================================================
// variantStyles 純関数テスト (T3-T6 round 2: M1 構造統一)
// ============================================================
describe('Button.resolveButtonVariantStyle (純関数)', () => {
  test('primary: primary 背景 + onPrimary 文字', () => {
    const style = resolveButtonVariantStyle('primary', LightT);
    expect((style.container as { backgroundColor: string }).backgroundColor).toBe(Colors.primary);
    expect((style.text as { color: string }).color).toBe(Colors.onPrimary);
  });

  test('secondary: accent 背景 + onAccent 文字 (white では AA FAIL のため)', () => {
    const style = resolveButtonVariantStyle('secondary', LightT);
    expect((style.container as { backgroundColor: string }).backgroundColor).toBe(Colors.accent);
    expect((style.text as { color: string }).color).toBe(Colors.onAccent);
  });

  test('danger: error 背景 + onError 文字', () => {
    const style = resolveButtonVariantStyle('danger', LightT);
    expect((style.container as { backgroundColor: string }).backgroundColor).toBe(Colors.error);
    expect((style.text as { color: string }).color).toBe(Colors.onError);
  });

  test('outline: 透明背景 + ボーダー primary', () => {
    const style = resolveButtonVariantStyle('outline', LightT);
    expect((style.container as { backgroundColor: string }).backgroundColor).toBe('transparent');
    expect((style.container as { borderColor: string }).borderColor).toBe(Colors.primary);
    expect((style.text as { color: string }).color).toBe(Colors.primary);
  });

  test('ghost: 透明背景 + 文字 primary', () => {
    const style = resolveButtonVariantStyle('ghost', LightT);
    expect((style.container as { backgroundColor: string }).backgroundColor).toBe('transparent');
    expect((style.text as { color: string }).color).toBe(Colors.primary);
  });

  test('Dark テーマで primary が DarkColors に追従', () => {
    const style = resolveButtonVariantStyle('primary', DarkT);
    expect((style.container as { backgroundColor: string }).backgroundColor).toBe(DarkColors.primary);
    expect((style.text as { color: string }).color).toBe(DarkColors.onPrimary);
  });
});

describe('Button variant table - 全パターンが旧色を返さない', () => {
  const variants: ButtonVariantType[] = ['primary', 'secondary', 'outline', 'ghost', 'danger'];

  test.each(variants)('Light - %s variant は禁止色を含まない', (v) => {
    const style = resolveButtonVariantStyle(v, LightT);
    const all = [
      (style.container as { backgroundColor?: string }).backgroundColor ?? '',
      (style.container as { borderColor?: string }).borderColor ?? '',
      (style.text as { color?: string }).color ?? '',
      style.indicator,
    ];
    for (const f of FORBIDDEN_GREENS) {
      expect(all).not.toContain(f);
    }
  });

  test.each(variants)('Dark - %s variant は禁止色を含まない', (v) => {
    const style = resolveButtonVariantStyle(v, DarkT);
    const all = [
      (style.container as { backgroundColor?: string }).backgroundColor ?? '',
      (style.container as { borderColor?: string }).borderColor ?? '',
      (style.text as { color?: string }).color ?? '',
      style.indicator,
    ];
    for (const f of FORBIDDEN_GREENS) {
      expect(all).not.toContain(f);
    }
  });
});

describe('Card.resolveCardVariantStyle (純関数)', () => {
  test('default: card 背景', () => {
    const style = resolveCardVariantStyle('default', LightT);
    expect((style as { backgroundColor: string }).backgroundColor).toBe(Colors.card);
  });

  test('elevated: cardElevated 背景', () => {
    const style = resolveCardVariantStyle('elevated', LightT);
    expect((style as { backgroundColor: string }).backgroundColor).toBe(Colors.cardElevated);
  });

  test('outlined: card 背景 + border 色', () => {
    const style = resolveCardVariantStyle('outlined', LightT);
    expect((style as { borderColor: string }).borderColor).toBe(Colors.border);
  });

  test('flat: surface 背景', () => {
    const style = resolveCardVariantStyle('flat', LightT);
    expect((style as { backgroundColor: string }).backgroundColor).toBe(Colors.surface);
  });

  test('Dark テーマで cardElevated が追従', () => {
    const style = resolveCardVariantStyle('elevated', DarkT);
    expect((style as { backgroundColor: string }).backgroundColor).toBe(DarkColors.cardElevated);
  });
});

describe('Card variant table - 全パターンが旧色を返さない', () => {
  const variants: CardVariantType[] = ['default', 'elevated', 'outlined', 'flat'];

  test.each(variants)('Light - %s variant は禁止色を含まない', (v) => {
    const style = resolveCardVariantStyle(v, LightT);
    const colorish = [
      (style as { backgroundColor?: string }).backgroundColor ?? '',
      (style as { borderColor?: string }).borderColor ?? '',
    ];
    for (const f of FORBIDDEN_GREENS) {
      expect(colorish).not.toContain(f);
    }
  });

  test.each(variants)('Dark - %s variant は禁止色を含まない', (v) => {
    const style = resolveCardVariantStyle(v, DarkT);
    const colorish = [
      (style as { backgroundColor?: string }).backgroundColor ?? '',
      (style as { borderColor?: string }).borderColor ?? '',
    ];
    for (const f of FORBIDDEN_GREENS) {
      expect(colorish).not.toContain(f);
    }
  });
});

describe('Badge.hexToRgba (純関数)', () => {
  test('primary を 22% 透過に変換できる', () => {
    expect(hexToRgba('#1B7A3D', 0.22)).toBe('rgba(27, 122, 61, 0.22)');
  });

  test('# 無しでも動く (色値正規化)', () => {
    expect(hexToRgba('1B7A3D', 0.5)).toBe('rgba(27, 122, 61, 0.5)');
  });

  test('黒/白を扱える (境界値)', () => {
    expect(hexToRgba('#000000', 1)).toBe('rgba(0, 0, 0, 1)');
    expect(hexToRgba('#FFFFFF', 0)).toBe('rgba(255, 255, 255, 0)');
  });
});
