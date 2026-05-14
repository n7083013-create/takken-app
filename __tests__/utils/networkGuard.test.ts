// ============================================================
// utils/networkGuard.ts テスト
// ============================================================
//
// ユーザー報告:「AI質問の回数が全然使ってない気がするのに100回超えてる」
//
// 根本原因の一部 (サーバー側):
// - /api/ai-chat はリクエスト到達時点で increment_ai_usage RPC を実行
// - 通信不安定時、タイムアウトしてもサーバーは到達済み → カウント消費
//
// クライアント側の防衛策 (services/claude.ts):
// - 送信前に isLikelyOffline() をチェック
// - true なら API を叩かずローカルでエラーメッセージ
// - サーバーへリクエストが届かない = AI 回数を消費しない
//
// 本テストは isLikelyOffline() の純粋ロジックを検証する。

import { isLikelyOffline } from '../../utils/networkGuard';

describe('isLikelyOffline - 明確なオフライン検知', () => {
  // ----------------------------------------------------------
  // navigator が undefined (Node 環境のデフォルト)
  // ----------------------------------------------------------

  test('Node 環境 (navigator なし) では false を返す (オンライン扱い)', () => {
    expect(isLikelyOffline()).toBe(false);
  });

  // ----------------------------------------------------------
  // ブラウザ風モック
  // ----------------------------------------------------------

  test('navigator.onLine === false ならオフライン判定', () => {
    const originalNavigator = (global as any).navigator;
    try {
      (global as any).navigator = { onLine: false };
      expect(isLikelyOffline()).toBe(true);
    } finally {
      (global as any).navigator = originalNavigator;
    }
  });

  test('navigator.onLine === true ならオンライン判定', () => {
    const originalNavigator = (global as any).navigator;
    try {
      (global as any).navigator = { onLine: true };
      expect(isLikelyOffline()).toBe(false);
    } finally {
      (global as any).navigator = originalNavigator;
    }
  });

  test('navigator.onLine が boolean でない値の場合は false (オンライン扱い)', () => {
    const originalNavigator = (global as any).navigator;
    try {
      (global as any).navigator = { onLine: 'true' as any }; // 文字列
      expect(isLikelyOffline()).toBe(false);

      (global as any).navigator = { onLine: 1 as any }; // 数値
      expect(isLikelyOffline()).toBe(false);

      (global as any).navigator = { onLine: undefined };
      expect(isLikelyOffline()).toBe(false);

      (global as any).navigator = { onLine: null };
      expect(isLikelyOffline()).toBe(false);
    } finally {
      (global as any).navigator = originalNavigator;
    }
  });

  test('navigator アクセスで例外が出ても false を返す (フォールバック)', () => {
    const originalNavigator = (global as any).navigator;
    try {
      Object.defineProperty(global, 'navigator', {
        get() {
          throw new Error('navigator access blocked');
        },
        configurable: true,
      });
      expect(isLikelyOffline()).toBe(false);
    } finally {
      Object.defineProperty(global, 'navigator', {
        value: originalNavigator,
        configurable: true,
        writable: true,
      });
    }
  });

  // ----------------------------------------------------------
  // 設計上の安全性
  // ----------------------------------------------------------

  test('「不明」時は常にオンライン扱い (false-positive を避ける = AI使えなくなる事故を防ぐ)', () => {
    const originalNavigator = (global as any).navigator;
    try {
      (global as any).navigator = undefined;
      expect(isLikelyOffline()).toBe(false);

      (global as any).navigator = {};
      expect(isLikelyOffline()).toBe(false);
    } finally {
      (global as any).navigator = originalNavigator;
    }
  });

  test('「明確にオフライン」のみ true を返す = AI回数の無駄消費を防ぐ', () => {
    const originalNavigator = (global as any).navigator;
    try {
      (global as any).navigator = { onLine: false };
      expect(isLikelyOffline()).toBe(true);
    } finally {
      (global as any).navigator = originalNavigator;
    }
  });
});
