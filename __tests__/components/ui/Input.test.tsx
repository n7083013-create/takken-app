// ============================================================
// Input 共通部品 Unit Test (T8 Phase 2)
// ============================================================
// 設計仕様 7.1 章 11 ケースを「純関数 + 静的検査」で担保。
// JSX を含む Input.tsx は ts-jest (node 環境) では evaluate できないため、
// variant/state 解決ロジックを Input.helpers.ts に切り出してテスト。
// ソースの構造保証はファイル静的検査で行う (uiPrimitivesTokens.test.ts と同方針)。

import fs from 'fs';
import path from 'path';
import { Colors } from '../../../constants/theme';
import { DarkColors } from '../../../constants/darkTheme';
import type { ThemeColors } from '../../../hooks/useThemeColors';
import {
  resolveVariantProps,
  resolveBorderColor,
  resolveBackgroundColor,
  resolveTextColor,
  resolveBorderWidth,
  resolveMinHeight,
  deriveAccessibilityLabel,
  resolveCounterColor,
  type InputVariant,
} from '../../../components/ui/Input.helpers';

const LightT = Colors as unknown as ThemeColors;
const DarkT = DarkColors as unknown as ThemeColors;

const INPUT_SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'components', 'ui', 'Input.tsx'),
  'utf-8',
);

// ─────────────────────────────────────────────────────────────
// 1. default render — Input.tsx が forwardRef + variant='text' 既定
// ─────────────────────────────────────────────────────────────
describe('Input - default render', () => {
  test('forwardRef を使い TextInput ref を透過する', () => {
    expect(INPUT_SRC).toMatch(/forwardRef<RNTextInput, InputProps>/);
  });

  test("variant 未指定で 'text' 既定が適用される (resolveVariantProps)", () => {
    const props = resolveVariantProps('text', undefined, false);
    expect(props).toEqual({});
  });

  test('default state では border = C.border, bg = C.card', () => {
    const border = resolveBorderColor(LightT, {
      focused: false,
      isError: false,
      disabled: false,
    });
    const bg = resolveBackgroundColor(LightT, { isError: false, disabled: false });
    expect(border).toBe(Colors.border);
    expect(bg).toBe(Colors.card);
  });
});

// ─────────────────────────────────────────────────────────────
// 2. focused state — border = primary, borderWidth 2
// ─────────────────────────────────────────────────────────────
describe('Input - focused state', () => {
  test('focused=true で borderColor が primary になる', () => {
    expect(
      resolveBorderColor(LightT, { focused: true, isError: false, disabled: false }),
    ).toBe(Colors.primary);
    expect(
      resolveBorderColor(DarkT, { focused: true, isError: false, disabled: false }),
    ).toBe(DarkColors.primary);
  });

  test('focused=true で borderWidth が 2 になる', () => {
    expect(resolveBorderWidth(true, false)).toBe(2);
    expect(resolveBorderWidth(false, false)).toBe(1.5);
  });

  test('Input.tsx 内で focused 時に Shadow.sm を適用する', () => {
    expect(INPUT_SRC).toMatch(/focused\s*&&\s*Shadow\.sm/);
  });
});

// ─────────────────────────────────────────────────────────────
// 3. error display + 排他 helperText
// ─────────────────────────────────────────────────────────────
describe('Input - error display + 排他 helperText', () => {
  test('isError=true で borderColor が error 色', () => {
    expect(
      resolveBorderColor(LightT, { focused: false, isError: true, disabled: false }),
    ).toBe(Colors.error);
    expect(
      resolveBorderColor(DarkT, { focused: false, isError: true, disabled: false }),
    ).toBe(DarkColors.error);
  });

  test('isError=true で background が errorSurface', () => {
    expect(resolveBackgroundColor(LightT, { isError: true, disabled: false })).toBe(
      Colors.errorSurface,
    );
  });

  test('error と helperText が排他 (error 優先) で描画される構造', () => {
    // error あり → error テキスト、なし → helperText テキスト、両方なし → spacer
    expect(INPUT_SRC).toMatch(/isError\s*\?[\s\S]*?error\s*\}[\s\S]*?helperText/);
  });

  test('error 時 borderWidth が 2 (太く)', () => {
    expect(resolveBorderWidth(false, true)).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────
// 4. disabled state
// ─────────────────────────────────────────────────────────────
describe('Input - disabled state', () => {
  test('disabled=true で borderColor = borderLight, bg = background', () => {
    expect(
      resolveBorderColor(LightT, { focused: false, isError: false, disabled: true }),
    ).toBe(Colors.borderLight);
    expect(resolveBackgroundColor(LightT, { isError: false, disabled: true })).toBe(
      Colors.background,
    );
  });

  test('disabled で textColor が textDisabled', () => {
    expect(resolveTextColor(LightT, { disabled: true })).toBe(Colors.textDisabled);
    expect(resolveTextColor(LightT, { disabled: false })).toBe(Colors.text);
  });

  test('loading で textColor が textSecondary になる', () => {
    expect(resolveTextColor(LightT, { disabled: false, loading: true })).toBe(
      Colors.textSecondary,
    );
  });

  test('Input.tsx で isInactive=true 時 onChangeText を no-op に差し替える', () => {
    expect(INPUT_SRC).toMatch(/onChangeText=\{isInactive\s*\?\s*\(\)\s*=>\s*\{\}\s*:\s*onChangeText\}/);
  });

  test('Input.tsx で editable={!isInactive} を指定', () => {
    expect(INPUT_SRC).toMatch(/editable=\{!isInactive\}/);
  });
});

// ─────────────────────────────────────────────────────────────
// 5. loading + disabled overlap (loading が disabled 相当の振る舞い)
// ─────────────────────────────────────────────────────────────
describe('Input - loading state', () => {
  test('Input.tsx で isInactive = disabled || loading', () => {
    expect(INPUT_SRC).toMatch(/isInactive\s*=\s*!!disabled\s*\|\|\s*!!loading/);
  });

  test('Input.tsx で loading=true 時 ActivityIndicator を描画', () => {
    expect(INPUT_SRC).toMatch(/\{loading\s*&&\s*\([\s\S]*?ActivityIndicator/);
  });

  test('accessibilityState で disabled と busy を伝える', () => {
    expect(INPUT_SRC).toMatch(
      /accessibilityState=\{\{\s*disabled:\s*isInactive,\s*busy:\s*!!loading\s*\}\}/,
    );
  });
});

// ─────────────────────────────────────────────────────────────
// 6. password toggle (目アイコンで secureTextEntry 切替)
// ─────────────────────────────────────────────────────────────
describe('Input - password toggle', () => {
  test("variant='password' + showPassword=false で secureTextEntry=true", () => {
    const props = resolveVariantProps('password', undefined, false);
    expect(props.secureTextEntry).toBe(true);
  });

  test("variant='password' + showPassword=true で secureTextEntry=false", () => {
    const props = resolveVariantProps('password', undefined, true);
    expect(props.secureTextEntry).toBe(false);
  });

  test("password variant は autoComplete='password', autoCapitalize='none'", () => {
    const props = resolveVariantProps('password', undefined, false);
    expect(props.autoComplete).toBe('password');
    expect(props.autoCapitalize).toBe('none');
    expect(props.autoCorrect).toBe(false);
  });

  test('Input.tsx に password 目アイコン Pressable が存在し toggle する', () => {
    expect(INPUT_SRC).toMatch(/variant\s*===\s*'password'/);
    expect(INPUT_SRC).toMatch(/setShowPassword\(\(v\)\s*=>\s*!v\)/);
  });

  test('目アイコンに accessibilityLabel が設定される (表示/非表示で切替)', () => {
    expect(INPUT_SRC).toMatch(/パスワードを非表示/);
    expect(INPUT_SRC).toMatch(/パスワードを表示/);
  });
});

// ─────────────────────────────────────────────────────────────
// 7. multiline maxLength counter
// ─────────────────────────────────────────────────────────────
describe('Input - multiline + maxLength counter', () => {
  test("variant='multiline' は multiline=true, numberOfLines=rows ?? 4, textAlignVertical='top'", () => {
    const props = resolveVariantProps('multiline', undefined, false);
    expect(props.multiline).toBe(true);
    expect(props.numberOfLines).toBe(4);
    expect(props.textAlignVertical).toBe('top');
  });

  test('rows 指定で numberOfLines が反映される', () => {
    const props = resolveVariantProps('multiline', 6, false);
    expect(props.numberOfLines).toBe(6);
  });

  test('multiline の minHeight = padding*2 + lineHeight*rows', () => {
    // Spacing.md=12, LineHeight.subhead=22, rows=4
    expect(resolveMinHeight('multiline', 4, 12, 22)).toBe(12 * 2 + 22 * 4);
  });

  test('single line variant の minHeight は 48 (a11y 44pt 確保)', () => {
    expect(resolveMinHeight('text', undefined, 12, 22)).toBe(48);
    expect(resolveMinHeight('email', undefined, 12, 22)).toBe(48);
  });

  test('counter 色: 0% → textTertiary, 90% → warning, 100%+ → error', () => {
    const max = 100;
    expect(resolveCounterColor(LightT, 50, max)).toBe(Colors.textTertiary);
    expect(resolveCounterColor(LightT, 90, max)).toBe(Colors.warning);
    expect(resolveCounterColor(LightT, 100, max)).toBe(Colors.error);
    expect(resolveCounterColor(LightT, 150, max)).toBe(Colors.error);
  });

  test('Input.tsx で maxLength 指定時 "N / max" カウンタが描画される', () => {
    expect(INPUT_SRC).toMatch(/value\.length\}\s*\/\s*\{maxLength/);
  });
});

// ─────────────────────────────────────────────────────────────
// 8. search clear button
// ─────────────────────────────────────────────────────────────
describe('Input - search clear button', () => {
  test("variant='search' は keyboardType='default', returnKeyType='search'", () => {
    const props = resolveVariantProps('search', undefined, false);
    expect(props.keyboardType).toBe('default');
    expect(props.returnKeyType).toBe('search');
    expect(props.autoCapitalize).toBe('none');
    expect(props.autoCorrect).toBe(false);
  });

  test("search variant で value.length>0 のとき clear button (✕) が描画される", () => {
    expect(INPUT_SRC).toMatch(/variant\s*===\s*'search'\s*&&\s*value\.length\s*>\s*0/);
    expect(INPUT_SRC).toMatch(/accessibilityLabel="検索をクリア"/);
  });

  test('search variant は虫眼鏡 prefix を常時表示', () => {
    expect(INPUT_SRC).toMatch(/variant\s*===\s*'search'\s*&&\s*\([\s\S]*?⌕/);
  });

  test('handleClear: onClear 未指定で onChangeText("") を呼ぶ (純関数 ではないので構造検証)', () => {
    expect(INPUT_SRC).toMatch(/if\s*\(onClear\)\s*onClear\(\)[\s;]*\n?\s*else\s+onChangeText\(''\)/);
  });
});

// ─────────────────────────────────────────────────────────────
// 9. email autoComplete
// ─────────────────────────────────────────────────────────────
describe('Input - email variant', () => {
  test("variant='email' は keyboardType='email-address', autoComplete='email'", () => {
    const props = resolveVariantProps('email', undefined, false);
    expect(props.keyboardType).toBe('email-address');
    expect(props.autoComplete).toBe('email');
    expect(props.autoCapitalize).toBe('none');
    expect(props.autoCorrect).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// 10. number keyboard
// ─────────────────────────────────────────────────────────────
describe('Input - number variant', () => {
  test("variant='number' は keyboardType='number-pad'", () => {
    const props = resolveVariantProps('number', undefined, false);
    expect(props.keyboardType).toBe('number-pad');
    expect(props.autoCapitalize).toBe('none');
    expect(props.autoCorrect).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// 11. accessibilityLabel auto-derive (explicit > label > placeholder)
// ─────────────────────────────────────────────────────────────
describe('Input - accessibilityLabel auto-derive', () => {
  test('explicit 指定が最優先', () => {
    expect(deriveAccessibilityLabel('explicit', 'label', 'ph')).toBe('explicit');
  });

  test('explicit 未指定なら label を使用', () => {
    expect(deriveAccessibilityLabel(undefined, 'label', 'ph')).toBe('label');
  });

  test('explicit/label 未指定なら placeholder を使用', () => {
    expect(deriveAccessibilityLabel(undefined, undefined, 'placeholder')).toBe(
      'placeholder',
    );
  });

  test('全て未指定なら undefined (SR 側のフォールバックに委ねる)', () => {
    expect(deriveAccessibilityLabel(undefined, undefined, undefined)).toBeUndefined();
  });

  test('Web 向けに aria-invalid / aria-required を渡す', () => {
    expect(INPUT_SRC).toMatch(/'aria-invalid':\s*isError\s*\?\s*true\s*:\s*undefined/);
    expect(INPUT_SRC).toMatch(/'aria-required':\s*required\s*\?\s*true\s*:\s*undefined/);
  });
});

// ─────────────────────────────────────────────────────────────
// 静的検査: token 採用、ハードコード禁止、ダーク追従
// ─────────────────────────────────────────────────────────────
describe('Input - 静的構造検査 (token 採用)', () => {
  test('useThemeColors を import', () => {
    expect(INPUT_SRC).toMatch(/useThemeColors/);
  });

  test('constants/theme から Spacing/FontSize/LineHeight/Shadow/FontWeight を import', () => {
    expect(INPUT_SRC).toMatch(/Spacing/);
    expect(INPUT_SRC).toMatch(/FontSize/);
    expect(INPUT_SRC).toMatch(/LineHeight/);
    expect(INPUT_SRC).toMatch(/Shadow/);
    expect(INPUT_SRC).toMatch(/FontWeight/);
  });

  test('色のハードコード (#XXXXXX) を含まない', () => {
    const hexColors = INPUT_SRC.match(/['"]#[0-9A-Fa-f]{6}['"]/g);
    expect(hexColors).toBeNull();
  });

  test('全 6 variants をハンドリング', () => {
    const variants: InputVariant[] = [
      'text',
      'email',
      'password',
      'number',
      'multiline',
      'search',
    ];
    for (const v of variants) {
      // resolveVariantProps が throw しないこと
      expect(() => resolveVariantProps(v, undefined, false)).not.toThrow();
    }
  });
});
