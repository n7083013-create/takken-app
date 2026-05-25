// ============================================================
// Brand 色の単一真実テスト
// ============================================================
//
// 2026-05 UI監査: #1B7A3D / #2E7D32 / #1B5E20 / #199353 が乱立しており、
//   アイコン→splash→アプリで3段色切替するチープな体験になっていた。
// canonical を Brand.green600 = #1B7A3D に一本化したため、
// この値が変わったり、過去のハードコード値に戻されるのを防ぐ。

import { Brand, Colors } from '../../constants/theme';
import { DarkColors } from '../../constants/darkTheme';

describe('Brand - canonical brand colors', () => {
  test('green600 は #1B7A3D (Forest Green) であり続けること', () => {
    expect(Brand.green600).toBe('#1B7A3D');
  });

  test('green700/green500 が定義済み (variant 整合性)', () => {
    expect(Brand.green700).toBe('#145C2E');
    expect(Brand.green500).toBe('#34A853');
  });
});

describe('Colors (Light) - Brand 整合性', () => {
  test('primary は Brand.green600', () => {
    expect(Colors.primary).toBe(Brand.green600);
  });

  test('primaryDark は Brand.green700', () => {
    expect(Colors.primaryDark).toBe(Brand.green700);
  });

  test('primaryLight は Brand.green500', () => {
    expect(Colors.primaryLight).toBe(Brand.green500);
  });

  test('onPrimary が定義済み (Button/ProgressBar が参照)', () => {
    expect(Colors.onPrimary).toBeDefined();
    expect(Colors.onPrimary).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  test('kenri (民法カテゴリ) は Brand 緑と一致', () => {
    expect(Colors.kenri).toBe(Brand.green600);
  });
});

describe('DarkColors - onPrimary 定義', () => {
  test('onPrimary が定義済み', () => {
    expect(DarkColors.onPrimary).toBeDefined();
    expect(DarkColors.onPrimary).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  test('primaryDark は Brand.green600 と一致 (ダークの dark variant)', () => {
    expect(DarkColors.primaryDark).toBe(Brand.green600);
  });
});

describe('on{Accent,Error} トークン - secondary/danger variant の WCAG AA 確保用', () => {
  test('Colors.onAccent が定義済み (Light)', () => {
    expect(Colors.onAccent).toBeDefined();
    expect(Colors.onAccent).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  test('Colors.onError が定義済み (Light)', () => {
    expect(Colors.onError).toBeDefined();
    expect(Colors.onError).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  test('DarkColors.onAccent が定義済み', () => {
    expect(DarkColors.onAccent).toBeDefined();
  });

  test('DarkColors.onError が定義済み', () => {
    expect(DarkColors.onError).toBeDefined();
  });
});

describe('禁止色: 過去のハードコード緑が theme から消えていること', () => {
  const FORBIDDEN_GREENS = ['#2E7D32', '#1B5E20', '#199353'];

  test.each(FORBIDDEN_GREENS)('Colors の値に %s が含まれないこと', (forbidden) => {
    const values = Object.values(Colors);
    expect(values).not.toContain(forbidden);
  });

  test.each(FORBIDDEN_GREENS)('DarkColors の値に %s が含まれないこと', (forbidden) => {
    const values = Object.values(DarkColors);
    expect(values).not.toContain(forbidden);
  });
});

// ============================================================
// QA追加 (2026-05-24): canonical brand snapshot
// 色値が漏れる/意図せず変わるのを検出。Brand.green600 を変えるときは
// 必ず app.json / public/manifest.json / tailwind.config を同時に更新する契約。
// ============================================================
describe('Brand canonical 色のスナップショット (変更検出)', () => {
  test('Brand パレット 3 色のフィンガープリント', () => {
    const fingerprint = {
      green600: Brand.green600,
      green700: Brand.green700,
      green500: Brand.green500,
    };
    expect(fingerprint).toEqual({
      green600: '#1B7A3D',
      green700: '#145C2E',
      green500: '#34A853',
    });
  });

  test('Light/Dark primary ペアのフィンガープリント', () => {
    expect({
      lightPrimary: Colors.primary,
      lightPrimaryDark: Colors.primaryDark,
      lightPrimaryLight: Colors.primaryLight,
      lightPrimarySurface: Colors.primarySurface,
      lightOnPrimary: Colors.onPrimary,
      lightOnAccent: Colors.onAccent,
      lightOnError: Colors.onError,
      darkPrimary: DarkColors.primary,
      darkPrimaryDark: DarkColors.primaryDark,
      darkPrimaryLight: DarkColors.primaryLight,
      darkPrimarySurface: DarkColors.primarySurface,
      darkOnPrimary: DarkColors.onPrimary,
      darkOnAccent: DarkColors.onAccent,
      darkOnError: DarkColors.onError,
    }).toEqual({
      lightPrimary: '#1B7A3D',
      lightPrimaryDark: '#145C2E',
      lightPrimaryLight: '#34A853',
      lightPrimarySurface: '#E8F5EC',
      lightOnPrimary: '#FFFFFF',
      lightOnAccent: '#1D1D1F',
      lightOnError: '#FFFFFF',
      darkPrimary: '#3DBA5E',
      darkPrimaryDark: '#1B7A3D', // ダークの dark variant = canonical
      darkPrimaryLight: '#6FCF7F',
      darkPrimarySurface: '#1A2E1F',
      darkOnPrimary: '#0A1410',
      darkOnAccent: '#0A1410',
      darkOnError: '#0A1410',
    });
  });
});

describe('Light/Dark テーマで primary が異なる (回帰防止)', () => {
  test('Light primary と Dark primary は別の値', () => {
    expect(Colors.primary).not.toBe(DarkColors.primary);
  });

  test('Light primarySurface と Dark primarySurface は別の値', () => {
    expect(Colors.primarySurface).not.toBe(DarkColors.primarySurface);
  });

  test('Light onPrimary (#FFFFFF) と Dark onPrimary は異なる (ダークは黒寄りで視認性確保)', () => {
    expect(Colors.onPrimary).toBe('#FFFFFF');
    expect(DarkColors.onPrimary).not.toBe('#FFFFFF');
  });
});

describe('色値の形式整合性 (hex 6桁・大文字)', () => {
  const isValidHex = (v: string) => /^#[0-9A-F]{6}$/.test(v);

  test.each([
    ['Brand.green600', Brand.green600],
    ['Brand.green700', Brand.green700],
    ['Brand.green500', Brand.green500],
    ['Colors.primary', Colors.primary],
    ['Colors.onPrimary', Colors.onPrimary],
    ['Colors.onAccent', Colors.onAccent],
    ['Colors.onError', Colors.onError],
    ['DarkColors.primary', DarkColors.primary],
    ['DarkColors.onPrimary', DarkColors.onPrimary],
    ['DarkColors.onAccent', DarkColors.onAccent],
    ['DarkColors.onError', DarkColors.onError],
  ])('%s は #RRGGBB 大文字 6 桁形式 (= %s)', (_, value) => {
    expect(isValidHex(value)).toBe(true);
  });
});
