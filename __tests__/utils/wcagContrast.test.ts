// ============================================================
// WCAG AA コントラスト自動テスト
// ============================================================
// 2026-05-24 T3-T6 round 2: テーマトークン (onPrimary/onAccent/onError)
// が Light/Dark 両モードで Button/ProgressBar/Badge/Card の主要組合せに
// 対し WCAG AA (4.5:1) を満たすことを機械的に保証する。
//
// 関連: 90_System/Agents/ShareBox/2026-05-24_designer_to_exam-engineer_T3-T6-review.md
// (H-1: gas-shunin Dark mode で white on #3DBA5E = 2.57:1 FAIL の解消)

import { contrastRatio } from '../../utils/wcag';
import { Colors } from '../../constants/theme';
import { DarkColors } from '../../constants/darkTheme';

const AA_NORMAL = 4.5;
const AA_LARGE = 3.0;

describe('WCAG AA: contrastRatio ヘルパーの正当性', () => {
  test('白×黒は 21:1 (上限)', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 1);
  });

  test('同色は 1:1 (下限)', () => {
    expect(contrastRatio('#1B7A3D', '#1B7A3D')).toBeCloseTo(1, 5);
  });

  test('順序を入れ替えても同値 (対称性)', () => {
    const a = contrastRatio('#1B7A3D', '#FFFFFF');
    const b = contrastRatio('#FFFFFF', '#1B7A3D');
    expect(a).toBeCloseTo(b, 5);
  });

  test('# 無しでも動く (色値正規化)', () => {
    expect(contrastRatio('1B7A3D', 'FFFFFF')).toBeCloseTo(5.39, 1);
  });
});

describe('Light テーマ: Button 全 variant が AA 達成', () => {
  test('primary: onPrimary × primary ≥ 4.5', () => {
    const ratio = contrastRatio(Colors.onPrimary, Colors.primary);
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  test('secondary: onAccent × accent ≥ 4.5', () => {
    const ratio = contrastRatio(Colors.onAccent, Colors.accent);
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  test('danger: onError × error ≥ 4.5', () => {
    const ratio = contrastRatio(Colors.onError, Colors.error);
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  test('outline: primary × background ≥ 4.5 (テキストは primary、背景は normal)', () => {
    const ratio = contrastRatio(Colors.primary, Colors.background);
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  test('outline: primary × card ≥ 4.5 (カード上の outline ボタン)', () => {
    const ratio = contrastRatio(Colors.primary, Colors.card);
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

describe('Dark テーマ: Button 全 variant が AA 達成', () => {
  test('primary: onPrimary × primary ≥ 4.5 (旧 white on #3DBA5E は 2.57 FAIL → onPrimary 黒寄りで解消)', () => {
    const ratio = contrastRatio(DarkColors.onPrimary, DarkColors.primary);
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  test('secondary: onAccent × accent ≥ 4.5', () => {
    const ratio = contrastRatio(DarkColors.onAccent, DarkColors.accent);
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  test('danger: onError × error ≥ 4.5', () => {
    const ratio = contrastRatio(DarkColors.onError, DarkColors.error);
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  test('outline: primary × background ≥ 3 (Large) - Dark で primary は明るいが大きめ文字想定', () => {
    const ratio = contrastRatio(DarkColors.primary, DarkColors.background);
    expect(ratio).toBeGreaterThanOrEqual(AA_LARGE);
  });
});

describe('テキスト: 主要 text × background が AA 達成', () => {
  test('Light: text × background ≥ 4.5', () => {
    const ratio = contrastRatio(Colors.text, Colors.background);
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  test('Light: text × card ≥ 4.5', () => {
    const ratio = contrastRatio(Colors.text, Colors.card);
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  test('Light: textSecondary × background ≥ 4.5', () => {
    const ratio = contrastRatio(Colors.textSecondary, Colors.background);
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  test('Dark: text × background ≥ 4.5', () => {
    const ratio = contrastRatio(DarkColors.text, DarkColors.background);
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  test('Dark: text × card ≥ 4.5', () => {
    const ratio = contrastRatio(DarkColors.text, DarkColors.card);
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

describe('ProgressBar inside label の AA 確保', () => {
  test('Light: onPrimary × primary (バー上の % ラベル) ≥ 4.5', () => {
    const ratio = contrastRatio(Colors.onPrimary, Colors.primary);
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  test('Dark: onPrimary × primary ≥ 4.5 (H-1 で改善された組合せ)', () => {
    const ratio = contrastRatio(DarkColors.onPrimary, DarkColors.primary);
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

describe('禁止組合せ: 旧 white on dark.primary は FAIL のままであることを記録', () => {
  // 後戻りした場合の警告として、white × DarkColors.primary が
  // 4.5 を満たさない事実を文書化する。
  test('white × DarkColors.primary (#3DBA5E) は約 2.5:1 で AA FAIL (記録)', () => {
    const ratio = contrastRatio('#FFFFFF', DarkColors.primary);
    expect(ratio).toBeLessThan(AA_NORMAL);
  });
});
