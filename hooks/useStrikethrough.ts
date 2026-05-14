// ============================================================
// 選択肢の打ち消し線（消去法）状態管理フック
// ============================================================
// - 長押しで選択肢に打ち消し線を追加/削除
// - 明らかに違う選択肢を視覚的に除外できる消去法UX
// - 問題が変わったら自動リセット
// - 選択不可にはしない（間違いに気づいたら再選択可能）
//
// 内部ロジックは utils/strikeOperations.ts に分離してテスト容易性を確保。

import { useCallback, useEffect, useState } from 'react';
import { toggleStrike, isStrikeSet, clearAllStrikes } from '../utils/strikeOperations';

export function useStrikethrough(questionId: string | undefined) {
  // 打ち消し線がついた選択肢のインデックス集合
  const [struckSet, setStruckSet] = useState<Set<number>>(() => clearAllStrikes());

  // 問題が変わったらリセット
  useEffect(() => {
    setStruckSet(clearAllStrikes());
  }, [questionId]);

  const toggleStrikeHandler = useCallback((index: number) => {
    setStruckSet((prev) => toggleStrike(prev, index));
  }, []);

  const isStruck = useCallback(
    (index: number): boolean => isStrikeSet(struckSet, index),
    [struckSet],
  );

  const clearAll = useCallback(() => {
    setStruckSet(clearAllStrikes());
  }, []);

  return {
    toggleStrike: toggleStrikeHandler,
    isStruck,
    clearAll,
    struckCount: struckSet.size,
  };
}
