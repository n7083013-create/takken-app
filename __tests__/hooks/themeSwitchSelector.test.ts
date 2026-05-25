// ============================================================
// QA追加 (2026-05-24): useThemeColors の Light/Dark 切替整合
// ============================================================
// 目的: settings.themeMode と OS の useColorScheme の組み合わせで
// useThemeColors が Light/Dark の正しい色オブジェクトを返すか、
// 純関数として再現テストする (RN レンダラ不要)。
//
// 背景: UI primitives は useThemeColors().primary を参照しているため、
// このフックが Light/Dark を正しく切り替えていることが UI 全体の
// テーマ追従の正しさを保証する。

import { Colors as LightColors } from '../../constants/theme';
import { DarkColors } from '../../constants/darkTheme';

type ThemeMode = 'light' | 'dark' | 'system';

// useThemeColors 内部のセレクタロジックを純関数として再現
function selectThemeColors(mode: ThemeMode, systemScheme: 'light' | 'dark' | null | undefined) {
  const isDark = mode === 'dark' || (mode === 'system' && systemScheme === 'dark');
  return isDark ? DarkColors : LightColors;
}

describe('themeMode = light の優先順位', () => {
  test('system が dark でも Light を返す (ユーザー設定が優先)', () => {
    const result = selectThemeColors('light', 'dark');
    expect(result.primary).toBe('#1B7A3D');
    expect(result).toBe(LightColors);
  });

  test('system が light なら Light を返す', () => {
    const result = selectThemeColors('light', 'light');
    expect(result).toBe(LightColors);
  });
});

describe('themeMode = dark の優先順位', () => {
  test('system が light でも Dark を返す', () => {
    const result = selectThemeColors('dark', 'light');
    expect(result.primary).toBe('#3DBA5E');
    expect(result).toBe(DarkColors);
  });

  test('system が dark なら Dark を返す', () => {
    const result = selectThemeColors('dark', 'dark');
    expect(result).toBe(DarkColors);
  });
});

describe('themeMode = system の OS 追従', () => {
  test('OS が dark なら Dark を返す', () => {
    const result = selectThemeColors('system', 'dark');
    expect(result.primary).toBe('#3DBA5E');
  });

  test('OS が light なら Light を返す', () => {
    const result = selectThemeColors('system', 'light');
    expect(result.primary).toBe('#1B7A3D');
  });

  test('OS scheme が null (取得失敗) なら Light フォールバック', () => {
    const result = selectThemeColors('system', null);
    expect(result).toBe(LightColors);
  });

  test('OS scheme が undefined (初期化前) なら Light フォールバック', () => {
    const result = selectThemeColors('system', undefined);
    expect(result).toBe(LightColors);
  });
});

describe('色追従の網羅 - 切替で UI primitives 色が変わる', () => {
  test('primary 色は Light/Dark で異なる', () => {
    const light = selectThemeColors('light', 'light');
    const dark = selectThemeColors('dark', 'light');
    expect(light.primary).not.toBe(dark.primary);
  });

  test('primarySurface (Badge背景元/ProgressBar track) も切替で変わる', () => {
    const light = selectThemeColors('light', 'light');
    const dark = selectThemeColors('dark', 'light');
    expect(light.primarySurface).not.toBe(dark.primarySurface);
  });

  test('onPrimary (Button文字色) も切替で変わる', () => {
    const light = selectThemeColors('light', 'light');
    const dark = selectThemeColors('dark', 'light');
    expect(light.onPrimary).not.toBe(dark.onPrimary);
  });

  test('error 色も切替で変わる (Button danger variant 用)', () => {
    const light = selectThemeColors('light', 'light');
    const dark = selectThemeColors('dark', 'light');
    expect(light.error).not.toBe(dark.error);
  });

  test('card 背景も切替で変わる (Card primitives 用)', () => {
    const light = selectThemeColors('light', 'light');
    const dark = selectThemeColors('dark', 'light');
    expect(light.card).not.toBe(dark.card);
  });
});

describe('カテゴリ色 (kenri) - ライト/ダークで適切に変化', () => {
  test('民法カテゴリ色は Light = Brand canonical, Dark = 視認性ある明るめ', () => {
    const light = selectThemeColors('light', 'light');
    const dark = selectThemeColors('dark', 'dark');
    expect(light.kenri).toBe('#1B7A3D');
    expect(dark.kenri).toBe('#3DBA5E');
  });
});
