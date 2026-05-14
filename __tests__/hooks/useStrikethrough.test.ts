// ============================================================
// utils/strikeOperations.ts (打ち消し線 Set 操作) テスト
// ============================================================
//
// hooks/useStrikethrough.ts が内部で使う純粋関数の検証。
// 元 hook の状態遷移ロジックがここに分離されている。
//
// 仕様:
// - toggleStrike(prev, i): 含まれていれば削除、なければ追加
// - isStrikeSet(set, i): 含まれているか判定
// - clearAllStrikes(): 新しい空 Set を返す
// - 元の Set はミューテートしない（イミュータブル）

import {
  toggleStrike,
  isStrikeSet,
  clearAllStrikes,
} from '../../utils/strikeOperations';

describe('utils/strikeOperations - 打ち消し線 (消去法) の状態遷移', () => {
  // ----------------------------------------------------------
  // 初期状態
  // ----------------------------------------------------------

  test('clearAllStrikes は空 Set を返す', () => {
    const initial = clearAllStrikes();
    expect(initial.size).toBe(0);
    expect(isStrikeSet(initial, 0)).toBe(false);
    expect(isStrikeSet(initial, 1)).toBe(false);
  });

  // ----------------------------------------------------------
  // toggleStrike: 追加と削除
  // ----------------------------------------------------------

  test('toggleStrike(空, 0) で 0 が追加される', () => {
    const next = toggleStrike(new Set(), 0);
    expect(isStrikeSet(next, 0)).toBe(true);
    expect(next.size).toBe(1);
  });

  test('同じインデックスで toggleStrike を2回呼ぶと消える', () => {
    let s = new Set<number>();
    s = toggleStrike(s, 2);
    expect(isStrikeSet(s, 2)).toBe(true);
    s = toggleStrike(s, 2);
    expect(isStrikeSet(s, 2)).toBe(false);
    expect(s.size).toBe(0);
  });

  test('複数インデックスを独立に管理できる', () => {
    let s = new Set<number>();
    s = toggleStrike(s, 0);
    s = toggleStrike(s, 2);
    s = toggleStrike(s, 3);
    expect(isStrikeSet(s, 0)).toBe(true);
    expect(isStrikeSet(s, 1)).toBe(false); // 触っていない
    expect(isStrikeSet(s, 2)).toBe(true);
    expect(isStrikeSet(s, 3)).toBe(true);
    expect(s.size).toBe(3);
  });

  test('一部だけ取り消しても他は残る', () => {
    let s = new Set<number>();
    s = toggleStrike(s, 0);
    s = toggleStrike(s, 1);
    s = toggleStrike(s, 2);
    s = toggleStrike(s, 1); // 1 だけ取り消し
    expect(isStrikeSet(s, 0)).toBe(true);
    expect(isStrikeSet(s, 1)).toBe(false);
    expect(isStrikeSet(s, 2)).toBe(true);
    expect(s.size).toBe(2);
  });

  // ----------------------------------------------------------
  // イミュータビリティ
  // ----------------------------------------------------------

  test('toggleStrike は元の set をミューテートしない', () => {
    const original = new Set<number>([0, 1]);
    const snapshot = new Set(original);
    toggleStrike(original, 2);
    expect(original).toEqual(snapshot);
  });

  test('toggleStrike の戻り値は元の set と別インスタンス', () => {
    const original = new Set<number>([0]);
    const next = toggleStrike(original, 1);
    expect(next).not.toBe(original);
  });

  // ----------------------------------------------------------
  // clearAllStrikes
  // ----------------------------------------------------------

  test('clearAllStrikes は空 Set を返す（複数回呼んでも独立）', () => {
    const a = clearAllStrikes();
    const b = clearAllStrikes();
    expect(a.size).toBe(0);
    expect(b.size).toBe(0);
    expect(a).not.toBe(b); // 別インスタンス
  });

  test('clearAllStrikes で既存の打ち消しが全部消える (代入で適用)', () => {
    let s = new Set<number>([0, 1, 2, 3]);
    s = clearAllStrikes();
    expect(s.size).toBe(0);
    expect(isStrikeSet(s, 0)).toBe(false);
    expect(isStrikeSet(s, 1)).toBe(false);
  });

  // ----------------------------------------------------------
  // 問題変更時のリセット (useEffect の動作シミュレーション)
  // ----------------------------------------------------------

  test('問題が変わったら struckSet がクリアされる (シミュレーション)', () => {
    // 問題A で 0,1,2 を打ち消し
    let s = new Set<number>();
    s = toggleStrike(s, 0);
    s = toggleStrike(s, 1);
    s = toggleStrike(s, 2);
    expect(s.size).toBe(3);

    // 問題が変わる (useEffect が走る)
    s = clearAllStrikes();
    expect(s.size).toBe(0);
    expect(isStrikeSet(s, 0)).toBe(false);
    expect(isStrikeSet(s, 1)).toBe(false);
    expect(isStrikeSet(s, 2)).toBe(false);

    // 新しい問題で 1 だけ打ち消し
    s = toggleStrike(s, 1);
    expect(isStrikeSet(s, 1)).toBe(true);
    expect(isStrikeSet(s, 0)).toBe(false);
    expect(s.size).toBe(1);
  });

  // ----------------------------------------------------------
  // 4択全てを打ち消すケース
  // ----------------------------------------------------------

  test('選択肢4つすべてを打ち消すこともできる', () => {
    let s = new Set<number>();
    [0, 1, 2, 3].forEach((i) => {
      s = toggleStrike(s, i);
    });
    expect(s.size).toBe(4);
    expect(isStrikeSet(s, 0)).toBe(true);
    expect(isStrikeSet(s, 3)).toBe(true);
  });
});
