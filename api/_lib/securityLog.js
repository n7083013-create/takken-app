// ============================================================
// セキュリティイベント監査ログ
// ------------------------------------------------------------
// 目的: 攻撃検知・異常アクセスの可観測性を確保
//       Vercel のログストリームで集約して JSON で出力する。
// 注意: PII/シークレットをログに含めない。token/password/apiKey は最終段で削除。
// ============================================================

const EVENT = {
  AUTH_FAIL: 'auth.fail',
  AUTH_MISSING: 'auth.missing',
  RATE_LIMIT_EXCEEDED: 'rate.exceeded',
  INVALID_INPUT: 'input.invalid',
  WEBHOOK_FAIL: 'webhook.fail',
  PROMPT_INJECTION_SUSPECT: 'prompt.injection',
  SUSPICIOUS_PATTERN: 'suspicious.pattern',
  PAYMENT_ANOMALY: 'payment.anomaly',
  ADMIN_DENIED: 'admin.denied',
};

function logSecurityEvent(event, details = {}) {
  const entry = {
    type: 'security',
    event,
    timestamp: new Date().toISOString(),
    ...details,
  };
  if (entry.token) delete entry.token;
  if (entry.password) delete entry.password;
  if (entry.apiKey) delete entry.apiKey;
  if (entry.cardToken) delete entry.cardToken;

  console.warn(`[SECURITY] ${JSON.stringify(entry)}`);
}

module.exports = { EVENT, logSecurityEvent };
