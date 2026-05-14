// ============================================================
// AI推奨問題キュー管理 (純粋ロジック + ストレージ I/O)
// ============================================================
//
// AI分析画面で「今日のおすすめ XX問」を1タップで連続出題するための
// キュー管理。AsyncStorage に保存し、question/[id].tsx で次の問題に進む際に参照する。
//
// 使い方:
// 1. AI分析画面で setAiQueue(['q1', 'q2', 'q3']) を呼ぶ
// 2. router.push(`/question/q1?source=ai`)
// 3. question/[id].tsx で `?source=ai` の場合、解答後に getNextInAiQueue(currentId) を呼ぶ
// 4. 次の問題ID が返れば遷移、null なら「完了」表示で AI分析画面に戻る

const STORAGE_KEY = '@ai_recommend_queue';

export interface AiQueueStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

/**
 * AI推奨キューをストレージに保存
 */
export async function setAiQueue(
  storage: AiQueueStorage,
  questionIds: readonly string[],
): Promise<void> {
  if (questionIds.length === 0) {
    await storage.removeItem(STORAGE_KEY);
    return;
  }
  await storage.setItem(STORAGE_KEY, JSON.stringify(questionIds));
}

/**
 * 現在の問題IDから「次の問題ID」を返す純粋関数。
 * - キューに現在のIDが含まれていれば、その次のIDを返す
 * - 最後の問題、または見つからない場合は null
 *
 * 補助関数: ロジックを純粋関数として切り出してテスト容易性を確保
 */
export function getNextIdInQueue(
  queue: readonly string[],
  currentId: string,
): string | null {
  const idx = queue.indexOf(currentId);
  if (idx < 0) return null; // キューに無い
  const nextId = queue[idx + 1];
  return nextId ?? null;
}

/**
 * AIキューから次の問題IDを取り出す。ストレージ I/O 込み。
 * - 次の問題があればそのID
 * - 完了またはキューが無い場合は null + ストレージから削除（クリーンアップ）
 */
export async function getNextInAiQueue(
  storage: AiQueueStorage,
  currentId: string,
): Promise<string | null> {
  try {
    const raw = await storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const queue: string[] = JSON.parse(raw);
    if (!Array.isArray(queue)) return null;

    const nextId = getNextIdInQueue(queue, currentId);
    if (nextId === null) {
      // 完了または見つからない → ストレージをクリーンアップ
      await storage.removeItem(STORAGE_KEY).catch(() => {});
    }
    return nextId;
  } catch {
    return null;
  }
}

/**
 * AIキューをクリア（中断時など）
 */
export async function clearAiQueue(storage: AiQueueStorage): Promise<void> {
  await storage.removeItem(STORAGE_KEY).catch(() => {});
}

/**
 * 進捗情報: 現在の問題が キューの何問目 / 何問中 か
 */
export function getQueueProgress(
  queue: readonly string[],
  currentId: string,
): { current: number; total: number } | null {
  if (queue.length === 0) return null;
  const idx = queue.indexOf(currentId);
  if (idx < 0) return null;
  return { current: idx + 1, total: queue.length };
}

/**
 * テスト/外部参照用: ストレージキー
 */
export const AI_QUEUE_STORAGE_KEY = STORAGE_KEY;
