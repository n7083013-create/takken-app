// ============================================================
// IPベース レート制限（インメモリ）
// ------------------------------------------------------------
// 目的: API エンドポイントへの IP からの短期間大量リクエストを遮断
//       特に feedback DoS / 間接スパムの緩和 (T-PII Round2 H-2)
//
// 注意: Vercel Serverless は stateless。ウォームインスタンス内でのみ
//       カウンタ保持。Cold start で初期化される。本格的な分散レート制限は
//       Upstash Redis や Vercel KV を検討。現状は DoS 基本緩和と
//       ユーザーDBレート制限(feedback_submissions 5件/日)の二重防御で運用。
// ============================================================

const buckets = new Map();
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX = 30;

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    return String(xff).split(',')[0].trim();
  }
  const xri = req.headers['x-real-ip'];
  if (xri) return String(xri).trim();
  return req.socket?.remoteAddress || 'unknown';
}

function checkRateLimit(req, keyPrefix = 'default', opts = {}) {
  const limit = opts.limit ?? DEFAULT_MAX;
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const ip = getClientIp(req);
  const key = `${keyPrefix}:${ip}`;
  const now = Date.now();

  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;

  if (buckets.size > 5000) {
    for (const [k, v] of buckets.entries()) {
      if (now >= v.resetAt) buckets.delete(k);
    }
  }

  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
    ip,
  };
}

function sendRateLimitExceeded(res, resetAt) {
  const retryAfterSec = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  res.setHeader('Retry-After', String(retryAfterSec));
  return res.status(429).json({
    error: 'リクエストが多すぎます。しばらく待ってからお試しください。',
  });
}

module.exports = { checkRateLimit, sendRateLimitExceeded, getClientIp };
