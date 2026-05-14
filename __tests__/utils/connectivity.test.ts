// ============================================================
// utils/connectivity.ts テスト
// ============================================================
//
// オフライン判定の誤検知（false-positive）を抑止するロジックを検証する。
//
// 仕様:
// - probeEndpoint: 単一URLへの HEAD リクエスト、成否を返す
// - probeAny: 複数URLを並列チェック、いずれか1つ成功で true
// - applyHysteresis: 失敗カウントを累積し、閾値以上でオフライン確定
//   - 成功すれば即座にオンライン復帰 + カウントリセット
//
// これにより:
// - 一瞬の遅延・タイムアウトでは「オフライン」にならない
// - 復旧時はすぐにバナーが消える

import {
  probeEndpoint,
  probeAny,
  applyHysteresis,
  INITIAL_HYSTERESIS_STATE,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_PROBE_URLS,
  FAILURE_THRESHOLD,
  type HysteresisState,
} from '../../utils/connectivity';

describe('probeEndpoint - 単一エンドポイントチェック', () => {
  test('fetch が成功すれば true', async () => {
    const fakeFetch = jest.fn().mockResolvedValue({ ok: true });
    const result = await probeEndpoint('https://example.com', 1000, fakeFetch as unknown as typeof fetch);
    expect(result).toBe(true);
  });

  test('fetch がエラーを投げれば false', async () => {
    const fakeFetch = jest.fn().mockRejectedValue(new Error('Network error'));
    const result = await probeEndpoint('https://example.com', 1000, fakeFetch as unknown as typeof fetch);
    expect(result).toBe(false);
  });

  test('AbortController によるタイムアウトは false', async () => {
    // AbortError が投げられるシミュレーション
    const fakeFetch = jest.fn().mockImplementation(() =>
      new Promise((_, reject) => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        setTimeout(() => reject(err), 5);
      }),
    );
    const result = await probeEndpoint(
      'https://slow.example.com',
      10,
      fakeFetch as unknown as typeof fetch,
    );
    expect(result).toBe(false);
  });

  test('正しいオプション (HEAD, no-store) で呼ばれる', async () => {
    const fakeFetch = jest.fn().mockResolvedValue({ ok: true });
    await probeEndpoint('https://example.com', 1000, fakeFetch as unknown as typeof fetch);
    expect(fakeFetch).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({
        method: 'HEAD',
        cache: 'no-store',
      }),
    );
  });
});

describe('probeAny - 並列複数エンドポイントチェック', () => {
  test('すべて成功 → true', async () => {
    const fakeFetch = jest.fn().mockResolvedValue({ ok: true });
    const result = await probeAny(
      ['https://a.example.com', 'https://b.example.com'],
      1000,
      fakeFetch as unknown as typeof fetch,
    );
    expect(result).toBe(true);
    expect(fakeFetch).toHaveBeenCalledTimes(2);
  });

  test('1つだけ成功 → true (フォールバックが機能)', async () => {
    const fakeFetch = jest.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce({ ok: true });
    const result = await probeAny(
      ['https://fail.example.com', 'https://ok.example.com'],
      1000,
      fakeFetch as unknown as typeof fetch,
    );
    expect(result).toBe(true);
  });

  test('すべて失敗 → false', async () => {
    const fakeFetch = jest.fn().mockRejectedValue(new Error('fail'));
    const result = await probeAny(
      ['https://a.example.com', 'https://b.example.com'],
      1000,
      fakeFetch as unknown as typeof fetch,
    );
    expect(result).toBe(false);
    expect(fakeFetch).toHaveBeenCalledTimes(2);
  });

  test('空配列 → false', async () => {
    const fakeFetch = jest.fn();
    const result = await probeAny([], 1000, fakeFetch as unknown as typeof fetch);
    expect(result).toBe(false);
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  test('並列実行されている (順次ではない)', async () => {
    // 各 fetch に 50ms の遅延を加えて、並列なら ~50ms、順次なら ~100ms かかる
    const fakeFetch = jest.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 50)),
    );
    const start = Date.now();
    await probeAny(
      ['https://a.example.com', 'https://b.example.com'],
      1000,
      fakeFetch as unknown as typeof fetch,
    );
    const elapsed = Date.now() - start;
    // 並列実行なら 50ms + 余裕。順次実行なら 100ms 以上。
    // 余裕を持って 90ms 未満なら並列実行
    expect(elapsed).toBeLessThan(90);
  });

  test('1つが成功すれば、他の失敗を無視', async () => {
    // 最初は成功、2番目は遅延後失敗
    const fakeFetch = jest.fn()
      .mockImplementationOnce(() => Promise.resolve({ ok: true }))
      .mockImplementationOnce(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error('fail')), 100)),
      );
    const result = await probeAny(
      ['https://ok.example.com', 'https://slow-fail.example.com'],
      500,
      fakeFetch as unknown as typeof fetch,
    );
    expect(result).toBe(true);
  });
});

describe('applyHysteresis - ヒステリシス判定', () => {
  test('成功 → isOnline=true、failureCount リセット', () => {
    const prev: HysteresisState = { isOnline: false, failureCount: 5 };
    const next = applyHysteresis(prev, true);
    expect(next.isOnline).toBe(true);
    expect(next.failureCount).toBe(0);
  });

  test('失敗1回目: isOnline=true 維持 (閾値2の場合)', () => {
    const prev = INITIAL_HYSTERESIS_STATE;
    const next = applyHysteresis(prev, false, 2);
    expect(next.isOnline).toBe(true); // まだオフライン確定しない
    expect(next.failureCount).toBe(1);
  });

  test('失敗2回連続でオフライン確定 (閾値2)', () => {
    let state = INITIAL_HYSTERESIS_STATE;
    state = applyHysteresis(state, false, 2);
    state = applyHysteresis(state, false, 2);
    expect(state.isOnline).toBe(false);
    expect(state.failureCount).toBe(2);
  });

  test('失敗中に1回成功すれば即復帰', () => {
    let state = INITIAL_HYSTERESIS_STATE;
    state = applyHysteresis(state, false); // 1回目失敗
    state = applyHysteresis(state, false); // 2回目失敗 → オフライン確定
    expect(state.isOnline).toBe(false);
    state = applyHysteresis(state, true); // 1回成功 → 即復帰
    expect(state.isOnline).toBe(true);
    expect(state.failureCount).toBe(0);
  });

  test('閾値3の場合は3回連続失敗で初めてオフライン', () => {
    let state = INITIAL_HYSTERESIS_STATE;
    state = applyHysteresis(state, false, 3);
    expect(state.isOnline).toBe(true);
    state = applyHysteresis(state, false, 3);
    expect(state.isOnline).toBe(true);
    state = applyHysteresis(state, false, 3);
    expect(state.isOnline).toBe(false);
  });

  test('回帰: 旧実装(閾値1)では1回失敗で即オフライン → 新実装はそうならないことを保証', () => {
    const state = applyHysteresis(INITIAL_HYSTERESIS_STATE, false, FAILURE_THRESHOLD);
    // FAILURE_THRESHOLD = 2 なので1回目はまだオンライン
    expect(state.isOnline).toBe(true);
    expect(state.failureCount).toBe(1);
  });

  test('初期状態はオンライン', () => {
    expect(INITIAL_HYSTERESIS_STATE.isOnline).toBe(true);
    expect(INITIAL_HYSTERESIS_STATE.failureCount).toBe(0);
  });
});

describe('シナリオ: 実運用フロー', () => {
  test('一瞬の遅延 (1回失敗 → 即成功) ではオフライン表示しない', async () => {
    // 旧実装ではこれで即オフライン → バナー誤表示の主原因
    let state = INITIAL_HYSTERESIS_STATE;
    state = applyHysteresis(state, false); // タイムアウト
    expect(state.isOnline).toBe(true); // バナーは出ない
    state = applyHysteresis(state, true); // 次のチェックで復帰
    expect(state.isOnline).toBe(true);
    expect(state.failureCount).toBe(0);
  });

  test('本当にオフライン (2回連続失敗) ではバナー表示', async () => {
    let state = INITIAL_HYSTERESIS_STATE;
    state = applyHysteresis(state, false);
    state = applyHysteresis(state, false);
    expect(state.isOnline).toBe(false); // バナー表示
  });

  test('長期オフライン → 復旧シナリオ', () => {
    let state = INITIAL_HYSTERESIS_STATE;
    // 10回連続失敗
    for (let i = 0; i < 10; i++) {
      state = applyHysteresis(state, false);
    }
    expect(state.isOnline).toBe(false);
    expect(state.failureCount).toBe(10);
    // 復旧
    state = applyHysteresis(state, true);
    expect(state.isOnline).toBe(true);
    expect(state.failureCount).toBe(0);
  });
});

describe('デフォルト設定', () => {
  test('プローブURLは2つ以上 (フォールバックを担保)', () => {
    expect(DEFAULT_PROBE_URLS.length).toBeGreaterThanOrEqual(2);
  });

  test('プローブURLは HTTPS のみ', () => {
    DEFAULT_PROBE_URLS.forEach((u) => {
      expect(u.startsWith('https://')).toBe(true);
    });
  });

  test('タイムアウトは旧実装(5秒)より長い', () => {
    expect(DEFAULT_TIMEOUT_MS).toBeGreaterThan(5_000);
  });

  test('失敗閾値は2以上 (ヒステリシス効く)', () => {
    expect(FAILURE_THRESHOLD).toBeGreaterThanOrEqual(2);
  });
});
