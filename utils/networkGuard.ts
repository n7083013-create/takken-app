// ============================================================
// ネットワーク状態の事前チェック (純粋ロジック)
// ============================================================
//
// 用途: API 呼び出し前に navigator.onLine をチェックして、
// 明らかにオフライン時にサーバーリクエストを送らないようにする。
//
// 主な目的: services/claude.ts の askAI() でサーバーがリクエスト到達時点で
// AI 回数をカウントする設計に対し、オフライン時の意図しない消費を防ぐ。
//
// 設計:
// - 「不明」時は false (オンライン扱い) を返す → 安全側にフォールスする
//   = AI 機能が使えなくなる事故を防ぐ
// - 「明確にオフライン」(navigator.onLine === false) のみ true

/**
 * navigator.onLine ベースで「明らかにオフライン」か判定する
 *
 * - true:  明らかにオフライン → API を叩かない
 * - false: オンライン、または不明 → 通常通り API を試行
 *
 * navigator が無い (SSR, Node test) や onLine が boolean でない場合は false。
 * 例外発生時も false (オンライン扱い) で安全側にフォールバックする。
 */
export function isLikelyOffline(): boolean {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      return navigator.onLine === false;
    }
  } catch {
    // ignore - 不明時は安全側に倒す
  }
  return false;
}
