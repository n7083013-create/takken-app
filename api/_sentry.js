// ============================================================
// Sentry 初期化ヘルパー（Vercel Serverless Functions）
// ============================================================
// 各 API ルートの冒頭で initServerSentry() を呼ぶだけで Sentry が有効化される。
// 二度呼んでも安全（idempotent）。
//
// 設計:
//  - DSN は SENTRY_DSN（クライアントとは別 DSN にすると分離しやすい）
//  - PII (email/token) は sanitize 層で除去
//  - 例外捕捉は captureServerException(err, ctx) を使う
//
// 重要: Vercel Serverless はリクエスト毎にコールドスタートのことがあるため、
//       require の最上位で init してプロセス内で 1 度だけ実行する。
// ============================================================

const Sentry = require('@sentry/node');

let initialized = false;

function initServerSentry() {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    initialized = true; // DSN 未設定でも 2 度目以降は no-op
    return;
  }
  try {
    Sentry.init({
      dsn,
      environment: process.env.SENTRY_ENV || process.env.VERCEL_ENV || 'production',
      release: process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA,
      // パフォーマンスは未収集（コスト削減）
      tracesSampleRate: 0,
      sampleRate: 1.0,
      sendDefaultPii: false,
      beforeSend(event) {
        try {
          return sanitizeEvent(event);
        } catch {
          return null;
        }
      },
    });
    initialized = true;
  } catch (e) {
    // 初期化失敗は致命的ではない
    console.warn('[Sentry server] init failed:', e && e.message);
  }
}

function maskPII(s) {
  if (!s || typeof s !== 'string') return s;
  return s
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[jwt]')
    .replace(/Bearer\s+[\w.-]+/gi, 'Bearer [token]')
    .replace(/\b(sk|pk)_[\w-]+/g, '[apikey]');
}

function sanitizeEvent(event) {
  if (event.user) {
    delete event.user.email;
    delete event.user.username;
    delete event.user.ip_address;
  }
  if (event.message) event.message = maskPII(event.message);
  if (event.exception && event.exception.values) {
    for (const ex of event.exception.values) {
      if (ex.value) ex.value = maskPII(ex.value);
    }
  }
  if (event.extra) {
    for (const key of Object.keys(event.extra)) {
      const v = event.extra[key];
      if (typeof v === 'string') event.extra[key] = maskPII(v);
      if (/password|token|secret|apikey|api_key/i.test(key)) {
        event.extra[key] = '[REDACTED]';
      }
    }
  }
  // request の headers / cookies は丸ごと落とす（Authorization 漏洩防止）
  if (event.request) {
    delete event.request.headers;
    delete event.request.cookies;
    if (event.request.data) {
      // body 内の機密値も削除
      if (typeof event.request.data === 'object') {
        for (const k of Object.keys(event.request.data)) {
          if (/password|token|secret|receipt|purchaseToken/i.test(k)) {
            event.request.data[k] = '[REDACTED]';
          }
        }
      }
    }
  }
  return event;
}

/**
 * 例外を Sentry に送信
 *  ctx: { context?: string; userId?: string; route?: string; extra?: object }
 */
function captureServerException(err, ctx = {}) {
  if (!initialized) initServerSentry();
  try {
    Sentry.withScope((scope) => {
      if (ctx.context) scope.setTag('context', ctx.context);
      if (ctx.route) scope.setTag('route', ctx.route);
      if (ctx.userId) scope.setUser({ id: ctx.userId });
      if (ctx.extra) {
        for (const key of Object.keys(ctx.extra)) {
          if (/password|token|secret|apikey|api_key/i.test(key)) continue;
          scope.setExtra(key, ctx.extra[key]);
        }
      }
      Sentry.captureException(err);
    });
  } catch {
    // Sentry 自身のエラーは握り潰す
  }
}

/**
 * Vercel Serverless では関数が早期リターンする前に flush しないと
 * イベントが送信されない。重要なエラー後は await してから返す。
 */
async function flushSentry(timeoutMs = 1500) {
  if (!initialized) return;
  try {
    await Sentry.flush(timeoutMs);
  } catch {
    // ignore
  }
}

// モジュール読込時に初期化
initServerSentry();

module.exports = {
  initServerSentry,
  captureServerException,
  flushSentry,
  Sentry,
};
