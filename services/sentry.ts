// ============================================================
// Sentry 初期化（クライアント: React Native + Web）
// ============================================================
// 事業レベルで「エラーゼロ」を目指すため、
// 検知できないエラーが発生しないよう全エラーを Sentry に送信する。
//
// 注意:
//  - PII (メール・トークン・パスワード) は絶対に送信しない
//  - 頻出エラーは sample 化してレート制限回避
//  - production のみ有効、dev は無効（ローカルログのみ）
//  - Web ビルド互換: @sentry/react-native は内部で Web 検出して安全に動作
// ============================================================

import { Platform } from 'react-native';
import * as Sentry from '@sentry/react-native';

let initialized = false;

/**
 * Sentry 初期化
 * app/_layout.tsx の冒頭で 1 度だけ呼ぶ
 */
export function initSentry(): void {
  if (initialized) return;

  // dev では Sentry を無効化（ローカルログだけで十分）
  if (__DEV__) {
    initialized = true;
    return;
  }

  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    // DSN 未設定でも落ちないように。コンソールにのみ警告
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[Sentry] EXPO_PUBLIC_SENTRY_DSN not set. Skipping init.');
    }
    initialized = true;
    return;
  }

  try {
    Sentry.init({
      dsn,
      // 環境タグ — Vercel/EAS のビルド面で分類
      environment: process.env.EXPO_PUBLIC_SENTRY_ENV || 'production',
      // リリース追跡（ソースマップ照合用）。EAS / Vercel のビルド時に注入
      release: process.env.EXPO_PUBLIC_SENTRY_RELEASE,
      // パフォーマンスサンプリング: 0% (コスト削減 — 必要時に上げる)
      tracesSampleRate: 0,
      // エラーは全件送信したいが、頻出 noise は beforeSend で間引き
      sampleRate: 1.0,
      // PII を絶対に送らない
      sendDefaultPii: false,
      // ネイティブ起動失敗時もアプリは動かす
      enableNative: Platform.OS !== 'web',
      // beforeSend で sanitize / sample
      beforeSend(event: Sentry.ErrorEvent, hint: unknown) {
        try {
          return sanitizeEvent(event, hint);
        } catch {
          // sanitize 失敗時はイベントを破棄（PII 漏洩よりは欠損を選ぶ）
          return null;
        }
      },
    });
    initialized = true;
  } catch (e) {
    // 初期化失敗してもアプリは動かす
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[Sentry] init failed:', e);
    }
  }
}

/**
 * イベントから PII を除去し、頻出エラーを sample する
 */
function sanitizeEvent(
  event: Sentry.ErrorEvent,
  _hint: unknown,
): Sentry.ErrorEvent | null {
  // 1. user.email / user.username は送信しない（id だけ許可）
  if (event.user) {
    delete event.user.email;
    delete event.user.username;
    delete event.user.ip_address;
  }

  // 2. メッセージから email/token らしき部分をマスク
  if (event.message) {
    event.message = maskPII(event.message);
  }
  if (event.exception?.values) {
    for (const ex of event.exception.values) {
      if (ex.value) ex.value = maskPII(ex.value);
    }
  }

  // 3. extra/tags の値も sanitize
  if (event.extra) {
    for (const key of Object.keys(event.extra)) {
      const v = event.extra[key];
      if (typeof v === 'string') event.extra[key] = maskPII(v);
      // password / token / secret 系のキーは値ごと削除
      if (/password|token|secret|apikey|api_key/i.test(key)) {
        event.extra[key] = '[REDACTED]';
      }
    }
  }

  // 4. 頻出 noise エラーの sample
  const msg = event.message || event.exception?.values?.[0]?.value || '';
  if (isNoisyError(msg)) {
    // 10% だけ通す
    if (Math.random() > 0.1) return null;
  }

  return event;
}

/**
 * 文字列内の email・JWT らしき値を [REDACTED] に置換
 */
function maskPII(s: string): string {
  if (!s) return s;
  return s
    // email
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    // JWT (eyJ で始まる長文字列)
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[jwt]')
    // Bearer ヘッダ
    .replace(/Bearer\s+[\w.-]+/gi, 'Bearer [token]')
    // sk-/pk- 系の API キー
    .replace(/\b(sk|pk)_[\w-]+/g, '[apikey]');
}

/**
 * 頻発するノイズエラーパターン（要メンテ）
 */
function isNoisyError(msg: string): boolean {
  if (!msg) return false;
  return (
    /Network request failed/i.test(msg) ||
    /AbortError/i.test(msg) ||
    /Load failed/i.test(msg) ||
    /cancelled/i.test(msg)
  );
}

/**
 * Sentry にユーザーコンテキストを設定（id のみ。email は送らない）
 */
export function setSentryUser(userId: string | null): void {
  if (!initialized) return;
  try {
    if (userId) {
      Sentry.setUser({ id: userId });
    } else {
      Sentry.setUser(null);
    }
  } catch {
    // 失敗は無視
  }
}

/**
 * 例外を Sentry に送信
 */
export function captureSentryException(
  error: unknown,
  meta?: { context?: string; extra?: Record<string, unknown> },
): void {
  if (!initialized) return;
  if (__DEV__) return; // dev では送らない
  try {
    Sentry.withScope((scope) => {
      if (meta?.context) {
        scope.setTag('context', meta.context);
      }
      if (meta?.extra) {
        for (const key of Object.keys(meta.extra)) {
          // password/token 系は extra に入っていても捨てる
          if (/password|token|secret|apikey|api_key/i.test(key)) continue;
          scope.setExtra(key, meta.extra[key]);
        }
      }
      Sentry.captureException(error);
    });
  } catch {
    // Sentry 自身のエラーは握り潰す
  }
}

export { Sentry };
