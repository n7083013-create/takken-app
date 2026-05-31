// ============================================================
// 模擬試験プリセット (data/index.ts) テスト
// 重点 (バグ C-1 の回帰防止):
//   一部年度は問題が 50問未満(例 2023=15 / 2022=19 / 2021=33 / 2020=42)。
//   これらをプリセットにすると「/50・合格ライン36点」固定UIと乖離し、
//   数学的に合格不能 + 表示矛盾になる。プリセットは「ちょうど50問」のみに限定する。
// ============================================================

import {
  getMockPresetYears,
  getMockPresetCount,
  getMockPresetByNumber,
  getRandomMockExam,
  getAvailableExamYears,
} from '../../data';

describe('模擬試験プリセット (C-1 回帰防止)', () => {
  it('プリセット年度は 1 つ以上あり、全年度の部分集合', () => {
    const years = getMockPresetYears();
    expect(years.length).toBeGreaterThan(0);
    const all = new Set(getAvailableExamYears());
    years.forEach((y) => expect(all.has(y)).toBe(true));
  });

  it('50問に満たない年度(2020-2023)はプリセットに含めない', () => {
    const years = getMockPresetYears();
    [2020, 2021, 2022, 2023].forEach((y) => {
      expect(years).not.toContain(y);
    });
  });

  it('全プリセットがちょうど 50問を返す(/50 表示・合格ライン36点と整合)', () => {
    const count = getMockPresetCount();
    expect(count).toBeGreaterThan(0);
    expect(count).toBe(getMockPresetYears().length);
    for (let n = 1; n <= count; n++) {
      expect(getMockPresetByNumber(n).length).toBe(50);
    }
  });

  it('範囲外のプリセット番号は空配列を返す', () => {
    expect(getMockPresetByNumber(0)).toEqual([]);
    expect(getMockPresetByNumber(getMockPresetCount() + 1)).toEqual([]);
    expect(getMockPresetByNumber(-1)).toEqual([]);
  });

  it('ランダム模擬も 50問', () => {
    expect(getRandomMockExam().length).toBe(50);
  });
});
