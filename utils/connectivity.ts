// ============================================================
// ネットワーク接続判定 (純粋ロジック)
// ============================================================
//
// 旧実装: clients3.google.com/generate_204 に 5秒タイムアウトの単発 HEAD
//        → 一瞬の遅延でも「オフライン」と誤検知してバナー表示
// 新実装:
//   - 複数エンドポイント並列チェック (いずれか1つ成功で「オンライン」)
//   - タイムアウト 8秒 (旧5秒 → 余裕を持たせる)
//   - ヒステリシス: 2回連続失敗で初めて「オフライン」確定
//   - 復旧は 1回成功で即座 (バナーをすぐ消す = ユーザー体験優先)
//
// すべて React に依存しない純粋ロジック。
// OfflineBanner.tsx の useEffect から使う想定。

/** デフォルト: 複数エンドポイント並列チェックでオフライン判定の誤検知を減らす */
export const DEFAULT_PROBE_URLS: readonly string[] = [
  'https://clients3.google.com/generate_204',
  'https://www.cloudflare.com/cdn-cgi/trace', // Cloudflare の軽量エンドポイント
] as const;

/** タイムアウトの既定値 (ms) - 旧 5秒 → 8秒に延長 */
export const DEFAULT_TIMEOUT_MS = 8_000;

/** チェック間隔の既定値 (ms) */
export const DEFAULT_CHECK_INTERVAL_MS = 15_000;

/** ヒステリシス: 何回連続失敗したらオフライン確定とするか */
export const FAILURE_THRESHOLD = 2;

/**
 * 単一エンドポイントへの HEAD リクエスト。
 * 成功なら true、失敗/タイムアウト なら false。
 */
export async function probeEndpoint(
  url: string,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await fetchImpl(url, {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal,
      });
      return true;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

/**
 * 複数エンドポイントを並列にチェックし、いずれか1つでも成功すれば true。
 * 全部失敗した場合のみ false。
 *
 * Promise.any 相当の挙動だが、Promise.allSettled で実装してエラーを安全に扱う。
 */
export async function probeAny(
  urls: readonly string[],
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (urls.length === 0) return false;
  const results = await Promise.allSettled(
    urls.map((u) => probeEndpoint(u, timeoutMs, fetchImpl)),
  );
  return results.some((r) => r.status === 'fulfilled' && r.value === true);
}

/**
 * ヒステリシス判定の状態遷移を計算する純粋関数。
 * - 成功した場合は failureCount リセット + isOnline=true
 * - 失敗した場合は failureCount を 1 増やし、閾値以上ならオフライン確定
 *
 * @param prev 前回までの状態
 * @param checkResult 今回の単発チェック結果 (true=成功, false=失敗)
 * @param threshold オフライン確定の閾値 (デフォルト 2)
 */
export interface HysteresisState {
  isOnline: boolean;
  failureCount: number;
}

export function applyHysteresis(
  prev: HysteresisState,
  checkResult: boolean,
  threshold: number = FAILURE_THRESHOLD,
): HysteresisState {
  if (checkResult) {
    // 成功 → 即座にオンライン復帰 + 失敗カウントリセット
    return { isOnline: true, failureCount: 0 };
  }
  // 失敗 → カウント増、閾値以上でオフライン確定
  const nextCount = prev.failureCount + 1;
  return {
    isOnline: nextCount < threshold,
    failureCount: nextCount,
  };
}

/**
 * ヒステリシス状態の初期値
 */
export const INITIAL_HYSTERESIS_STATE: HysteresisState = {
  isOnline: true,
  failureCount: 0,
};
