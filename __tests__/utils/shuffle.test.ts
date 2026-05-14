// ============================================================
// utils/shuffle.ts (Fisher-Yates) テスト
// ============================================================
//
// 仕様:
// 1. 入力配列の長さを保持する
// 2. 入力配列の全要素を含む（要素の重複・欠落なし）
// 3. 入力配列をミューテートしない（元配列を変更しない）
// 4. ランダム性: 大量試行で位置分布が均等に近い
// 5. 配列長 0/1 などのエッジケースで例外を起こさない

import { shuffleArray } from '../../utils/shuffle';

describe('shuffleArray - Fisher-Yates アルゴリズム', () => {
  // ----------------------------------------------------------
  // 性質 1: 長さの保持
  // ----------------------------------------------------------

  test('シャッフル後の配列長は入力と同じ', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const out = shuffleArray(input);
    expect(out.length).toBe(input.length);
  });

  test('空配列をシャッフルしても空配列', () => {
    expect(shuffleArray([])).toEqual([]);
  });

  test('要素1個の配列はそのまま', () => {
    expect(shuffleArray([42])).toEqual([42]);
  });

  // ----------------------------------------------------------
  // 性質 2: 全要素の保持（重複・欠落なし）
  // ----------------------------------------------------------

  test('全要素が保持される (1〜100)', () => {
    const input = Array.from({ length: 100 }, (_, i) => i + 1);
    const out = shuffleArray(input);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
  });

  test('オブジェクト配列でも参照が保持される', () => {
    const objs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    const out = shuffleArray(objs);
    const ids = out.map((o) => o.id).sort();
    expect(ids).toEqual(['a', 'b', 'c', 'd']);
    // 参照が共有されている（コピーではない）
    expect(out.every((o) => objs.includes(o))).toBe(true);
  });

  test('重複要素も保持される', () => {
    const input = [1, 1, 2, 2, 3, 3];
    const out = shuffleArray(input);
    expect([...out].sort()).toEqual([1, 1, 2, 2, 3, 3]);
  });

  // ----------------------------------------------------------
  // 性質 3: 元配列をミューテートしない
  // ----------------------------------------------------------

  test('入力配列をミューテートしない', () => {
    const input = [1, 2, 3, 4, 5];
    const snapshot = [...input];
    shuffleArray(input);
    expect(input).toEqual(snapshot);
  });

  test('readonly な配列も受け入れる（型レベルの検証）', () => {
    const input: readonly number[] = [1, 2, 3];
    const out = shuffleArray(input);
    expect(out.length).toBe(3);
  });

  // ----------------------------------------------------------
  // 性質 4: ランダム性（統計的テスト）
  // ----------------------------------------------------------

  test('複数回シャッフルすると順序が変わる場合がある (10要素)', () => {
    // 同じ順序のままになる確率は 1/10! ≈ 2.76e-7
    // 100回試行で1度も変わらない確率は実質ゼロ
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    let changed = false;
    for (let i = 0; i < 100; i++) {
      const out = shuffleArray(input);
      if (out.some((v, idx) => v !== input[idx])) {
        changed = true;
        break;
      }
    }
    expect(changed).toBe(true);
  });

  test('位置分布の均等性: 10要素を 5000回シャッフルした際、各位置に出現する各値の頻度が偏らない', () => {
    const N = 10;
    const TRIALS = 5000;
    const input = Array.from({ length: N }, (_, i) => i);
    const counts: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));

    for (let t = 0; t < TRIALS; t++) {
      const out = shuffleArray(input);
      for (let pos = 0; pos < N; pos++) {
        counts[pos][out[pos]]++;
      }
    }

    // 各 (position, value) 出現頻度の期待値は TRIALS / N = 500
    // 全頻度が期待値の ±25% 以内
    const expected = TRIALS / N;
    const lowerBound = expected * 0.75;
    const upperBound = expected * 1.25;

    for (let pos = 0; pos < N; pos++) {
      for (let val = 0; val < N; val++) {
        expect(counts[pos][val]).toBeGreaterThan(lowerBound);
        expect(counts[pos][val]).toBeLessThan(upperBound);
      }
    }
  });

  // ----------------------------------------------------------
  // 決定論的検証
  // ----------------------------------------------------------

  test('Math.random をモックすれば決定論的に動作する', () => {
    const spy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      const input = [1, 2, 3, 4, 5];
      const out = shuffleArray(input);
      // Math.random 0.5 固定では、各反復で j = floor(0.5 * (i+1))
      // i=4: j = 2 → swap(4,2) → [1,2,5,4,3]
      // i=3: j = 2 → swap(3,2) → [1,2,4,5,3]
      // i=2: j = 1 → swap(2,1) → [1,4,2,5,3]
      // i=1: j = 1 → swap(1,1) → 変化なし
      expect(out).toEqual([1, 4, 2, 5, 3]);
    } finally {
      spy.mockRestore();
    }
  });
});
