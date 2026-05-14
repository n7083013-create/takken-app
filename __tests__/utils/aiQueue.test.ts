// ============================================================
// utils/aiQueue.ts (AI推奨問題キュー管理) テスト
// ============================================================
//
// AI分析画面で「今日のおすすめ XX問」を1タップで連続出題するための
// キュー管理ロジックを検証する。
//
// 仕様:
// - setAiQueue([...]): キューを保存
// - getNextInAiQueue(currentId): 次の問題ID、または null (完了/見つからない)
// - getNextIdInQueue(queue, currentId): 純粋関数版
// - clearAiQueue(): キューをクリア
// - getQueueProgress(queue, currentId): { current, total } または null
// - 完了/見つからない場合は自動的にストレージから削除

import {
  setAiQueue,
  getNextInAiQueue,
  getNextIdInQueue,
  clearAiQueue,
  getQueueProgress,
  AI_QUEUE_STORAGE_KEY,
} from '../../utils/aiQueue';

/** テスト用: Map ベースの AsyncStorage モック */
function makeStorage(initial?: Iterable<[string, string]>) {
  const map = new Map<string, string>(initial);
  return {
    map,
    getItem: async (k: string) => map.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: async (k: string) => {
      map.delete(k);
    },
  };
}

describe('aiQueue - AI推奨問題キュー管理', () => {
  // ----------------------------------------------------------
  // getNextIdInQueue (純粋関数)
  // ----------------------------------------------------------

  describe('getNextIdInQueue (純粋関数)', () => {
    test('空のキューは null を返す', () => {
      expect(getNextIdInQueue([], 'q1')).toBeNull();
    });

    test('キューに無いIDは null を返す', () => {
      expect(getNextIdInQueue(['q1', 'q2'], 'q99')).toBeNull();
    });

    test('現在IDが先頭なら、その次のIDを返す', () => {
      expect(getNextIdInQueue(['q1', 'q2', 'q3'], 'q1')).toBe('q2');
    });

    test('現在IDが中間なら、その次のIDを返す', () => {
      expect(getNextIdInQueue(['q1', 'q2', 'q3'], 'q2')).toBe('q3');
    });

    test('現在IDが末尾なら null を返す (完了)', () => {
      expect(getNextIdInQueue(['q1', 'q2', 'q3'], 'q3')).toBeNull();
    });

    test('1問しか無い場合、null を返す (完了)', () => {
      expect(getNextIdInQueue(['q1'], 'q1')).toBeNull();
    });
  });

  // ----------------------------------------------------------
  // setAiQueue + getNextInAiQueue (ストレージ I/O)
  // ----------------------------------------------------------

  describe('setAiQueue / getNextInAiQueue (ストレージ I/O)', () => {
    test('キューを保存後、次の問題IDを取得できる', async () => {
      const storage = makeStorage();
      await setAiQueue(storage, ['q1', 'q2', 'q3']);
      expect(storage.map.has(AI_QUEUE_STORAGE_KEY)).toBe(true);

      const next1 = await getNextInAiQueue(storage, 'q1');
      expect(next1).toBe('q2');
      const next2 = await getNextInAiQueue(storage, 'q2');
      expect(next2).toBe('q3');
    });

    test('キューが空配列の場合、ストレージから削除される', async () => {
      const storage = makeStorage([[AI_QUEUE_STORAGE_KEY, '["q1"]']]);
      await setAiQueue(storage, []);
      expect(storage.map.has(AI_QUEUE_STORAGE_KEY)).toBe(false);
    });

    test('キューが保存されていない場合は null を返す', async () => {
      const storage = makeStorage();
      const next = await getNextInAiQueue(storage, 'q1');
      expect(next).toBeNull();
    });

    test('キューの最後の問題で呼ぶと null + ストレージ自動クリーンアップ', async () => {
      const storage = makeStorage();
      await setAiQueue(storage, ['q1', 'q2', 'q3']);
      const next = await getNextInAiQueue(storage, 'q3');
      expect(next).toBeNull();
      // ストレージから削除されている
      expect(storage.map.has(AI_QUEUE_STORAGE_KEY)).toBe(false);
    });

    test('キューに無いIDで呼ぶと null + ストレージ自動クリーンアップ', async () => {
      const storage = makeStorage();
      await setAiQueue(storage, ['q1', 'q2']);
      const next = await getNextInAiQueue(storage, 'q99');
      expect(next).toBeNull();
      expect(storage.map.has(AI_QUEUE_STORAGE_KEY)).toBe(false);
    });

    test('ストレージが壊れたJSONを返しても、null を返してクラッシュしない', async () => {
      const storage = makeStorage([[AI_QUEUE_STORAGE_KEY, '<invalid json>']]);
      const next = await getNextInAiQueue(storage, 'q1');
      expect(next).toBeNull();
    });

    test('配列でないデータが保存されていても、null を返す', async () => {
      const storage = makeStorage([[AI_QUEUE_STORAGE_KEY, JSON.stringify({ not: 'array' })]]);
      const next = await getNextInAiQueue(storage, 'q1');
      expect(next).toBeNull();
    });
  });

  // ----------------------------------------------------------
  // clearAiQueue
  // ----------------------------------------------------------

  describe('clearAiQueue', () => {
    test('保存されたキューをクリアできる', async () => {
      const storage = makeStorage();
      await setAiQueue(storage, ['q1', 'q2']);
      expect(storage.map.has(AI_QUEUE_STORAGE_KEY)).toBe(true);

      await clearAiQueue(storage);
      expect(storage.map.has(AI_QUEUE_STORAGE_KEY)).toBe(false);
    });

    test('既にキューが無くてもエラーにならない', async () => {
      const storage = makeStorage();
      await expect(clearAiQueue(storage)).resolves.not.toThrow();
    });
  });

  // ----------------------------------------------------------
  // getQueueProgress
  // ----------------------------------------------------------

  describe('getQueueProgress', () => {
    test('現在IDがキュー先頭なら 1/N', () => {
      expect(getQueueProgress(['q1', 'q2', 'q3'], 'q1')).toEqual({ current: 1, total: 3 });
    });

    test('現在IDが中間なら適切な進捗を返す', () => {
      expect(getQueueProgress(['q1', 'q2', 'q3', 'q4'], 'q3')).toEqual({ current: 3, total: 4 });
    });

    test('現在IDが末尾なら N/N', () => {
      expect(getQueueProgress(['q1', 'q2', 'q3'], 'q3')).toEqual({ current: 3, total: 3 });
    });

    test('キューに無いIDなら null', () => {
      expect(getQueueProgress(['q1', 'q2'], 'q99')).toBeNull();
    });

    test('空のキューなら null', () => {
      expect(getQueueProgress([], 'q1')).toBeNull();
    });
  });

  // ----------------------------------------------------------
  // 統合シナリオ
  // ----------------------------------------------------------

  describe('統合: 連続出題フロー全体', () => {
    test('3問連続出題: setup → next, next, next(完了)', async () => {
      const storage = makeStorage();
      const queue = ['q1', 'q2', 'q3'];

      // AI分析画面で「すべてスタート」
      await setAiQueue(storage, queue);

      // q1 解答後 → q2 へ
      let next = await getNextInAiQueue(storage, 'q1');
      expect(next).toBe('q2');
      // まだクリーンアップされていない
      expect(storage.map.has(AI_QUEUE_STORAGE_KEY)).toBe(true);

      // q2 解答後 → q3 へ
      next = await getNextInAiQueue(storage, 'q2');
      expect(next).toBe('q3');
      expect(storage.map.has(AI_QUEUE_STORAGE_KEY)).toBe(true);

      // q3 解答後 → 完了 (null + クリーンアップ)
      next = await getNextInAiQueue(storage, 'q3');
      expect(next).toBeNull();
      expect(storage.map.has(AI_QUEUE_STORAGE_KEY)).toBe(false);
    });

    test('途中で別キューが開始されても、新しいキューに切り替わる', async () => {
      const storage = makeStorage();

      // 1回目のキュー
      await setAiQueue(storage, ['q1', 'q2', 'q3']);
      let next = await getNextInAiQueue(storage, 'q1');
      expect(next).toBe('q2');

      // 別のキューを設定（上書き）
      await setAiQueue(storage, ['x1', 'x2']);
      next = await getNextInAiQueue(storage, 'x1');
      expect(next).toBe('x2');

      // 古いキューのIDで呼ぶと null
      next = await getNextInAiQueue(storage, 'q1');
      expect(next).toBeNull();
    });
  });

  // ----------------------------------------------------------
  // ストレージキー
  // ----------------------------------------------------------

  test('AI_QUEUE_STORAGE_KEY が正しい値', () => {
    expect(AI_QUEUE_STORAGE_KEY).toBe('@ai_recommend_queue');
  });
});
