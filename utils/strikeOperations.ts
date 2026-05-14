// ============================================================
// 打ち消し線 Set 操作 (純粋関数)
// ============================================================
//
// hooks/useStrikethrough.ts の内部状態遷移ロジックを純粋関数として
// 切り出したもの。React の外側でも単体テスト可能。
//
// 設計方針:
// - Set<number> はイミュータブルに扱う (元 Set をミューテートしない)
// - 各関数は新しい Set を返す
// - useState の updater 関数として直接使える形

/**
 * 指定インデックスの打ち消しを反転する。すでに含まれていれば削除、なければ追加。
 */
export function toggleStrike(prev: Set<number>, index: number): Set<number> {
  const next = new Set(prev);
  if (next.has(index)) {
    next.delete(index);
  } else {
    next.add(index);
  }
  return next;
}

/**
 * 指定インデックスに打ち消し線がついているか判定。
 */
export function isStrikeSet(set: Set<number>, index: number): boolean {
  return set.has(index);
}

/**
 * 打ち消し線をすべてクリアした新しい Set を返す。
 */
export function clearAllStrikes(): Set<number> {
  return new Set();
}
