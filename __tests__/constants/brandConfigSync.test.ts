// ============================================================
// Brand 色がストア提出物・Web と揃っているかの整合性テスト
// ============================================================
//
// 2026-05 UI監査: アイコン #199353 → splash #1B5E20 → アプリ #2E7D32 の3段切替を解消し、
// canonical = Brand.green600 (#1B7A3D) に統一した。
// app.json / public/manifest.json が逸れたら fail する。
// 2026-05-27 T9: NativeWind 撤去に伴い tailwind.config の整合性テストを削除。
//   semantic 色の単一真実は constants/theme.ts (Colors.success 等) のみ。

import fs from 'fs';
import path from 'path';
import { Brand } from '../../constants/theme';

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
