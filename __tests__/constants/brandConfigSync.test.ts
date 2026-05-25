// ============================================================
// Brand 色がストア提出物・Web・Tailwind と揃っているかの整合性テスト
// ============================================================
//
// 2026-05 UI監査: アイコン #199353 → splash #1B5E20 → アプリ #2E7D32 の3段切替を解消し、
// canonical = Brand.green600 (#1B7A3D) に統一した。
// app.json / public/manifest.json / tailwind.config.js が逸れたら fail する。

import fs from 'fs';
import path from 'path';
import { Brand, Colors } from '../../constants/theme';

const REPO_ROOT = path.join(__dirname, '..', '..');
const CANONICAL = Brand.green600; // #1B7A3D

describe('app.json - splash / adaptiveIcon が Brand 色と一致', () => {
  const appJson = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'app.json'), 'utf-8'),
  );

  test('splash.backgroundColor = Brand.green600', () => {
    expect(appJson.expo.splash.backgroundColor).toBe(CANONICAL);
  });

  test('android.adaptiveIcon.backgroundColor = Brand.green600', () => {
    expect(appJson.expo.android.adaptiveIcon.backgroundColor).toBe(CANONICAL);
  });
});

describe('public/manifest.json - PWA テーマが Brand 色と一致', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'public', 'manifest.json'), 'utf-8'),
  );

  test('background_color = Brand.green600', () => {
    expect(manifest.background_color).toBe(CANONICAL);
  });

  test('theme_color = Brand.green600', () => {
    expect(manifest.theme_color).toBe(CANONICAL);
  });
});

describe('tailwind.config.js - primary が Brand 色と一致', () => {
  // tailwind.config.js は require できる (CommonJS)
  // ただし path 解決のため絶対パスで読む
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const config = require(path.join(REPO_ROOT, 'tailwind.config.js'));
  const primary = config.theme.extend.colors.primary;

  test('primary.DEFAULT = Brand.green600', () => {
    expect(primary.DEFAULT).toBe(CANONICAL);
  });

  test('primary.600 = Brand.green600 (Material風 600 が canonical)', () => {
    expect(primary[600]).toBe(CANONICAL);
  });

  test('primary.dark = Brand.green700', () => {
    expect(primary.dark).toBe(Brand.green700);
  });
});

describe('tailwind.config semantic 色 = theme.ts semantic 色 (両アプリ同一)', () => {
  // T3-T6 H-3: takken=Tailwind palette, gas-shunin=theme.ts 系で
  // semantic 色が分裂していた問題の解決後を保証する。
  // 両アプリで semantic 色を一致させ、playbook 化を可能にする。
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const config = require(path.join(REPO_ROOT, 'tailwind.config.js'));
  const tw = config.theme.extend.colors;

  test('success が theme.ts と一致', () => {
    expect(tw.success).toBe(Colors.success);
  });

  test('warning が theme.ts と一致', () => {
    expect(tw.warning).toBe(Colors.warning);
  });

  test('error が theme.ts と一致', () => {
    expect(tw.error).toBe(Colors.error);
  });

  test('surface が theme.ts と一致', () => {
    expect(tw.surface).toBe(Colors.surface);
  });

  test('accent.DEFAULT が theme.ts と一致', () => {
    expect(tw.accent.DEFAULT).toBe(Colors.accent);
  });
});
