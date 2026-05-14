// ============================================================
// Fisher-Yates シャッフル (純粋関数)
// ============================================================
//
// 配列をランダムに並び替える。元配列はミューテートしない。
//
// 使用箇所:
// - app/(tabs)/quick-quiz.tsx - 一問一答でのシャッフル出題
// - 他の出題画面でも利用可能
//
// 性質:
// - 入力配列の長さを保持
// - 入力配列の全要素を含む（重複・欠落なし）
// - 入力配列をミューテートしない
// - 統計的に均等なランダム性 (Math.random ベース)

/**
 * Fisher-Yates アルゴリズムで配列をランダムシャッフルする
 * @param input シャッフル対象の配列 (readonly でも OK、ミューテートしない)
 * @returns シャッフル後の新しい配列
 */
export function shuffleArray<T>(input: readonly T[]): T[] {
  const shuffled = [...input];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
