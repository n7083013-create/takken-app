// ============================================================
// 入力バリデーション・サニタイズ
// セキュリティ強化: XSS防止・入力検証
// ============================================================

/**
 * メールアドレスのバリデーション
 * RFC 5322 準拠の簡易チェック
 */
export function isValidEmail(email: string): boolean {
  if (!email || email.length > 254) return false;
  const pattern = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return pattern.test(email);
}

/**
 * パスワードの強度チェック
 * 最低8文字、英数字混在
 */
export function validatePassword(password: string): { valid: boolean; message: string } {
  if (!password || password.length < 8) {
    return { valid: false, message: 'パスワードは8文字以上で入力してください' };
  }
  if (password.length > 128) {
    return { valid: false, message: 'パスワードは128文字以内で入力してください' };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, message: 'パスワードには英字を含めてください' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'パスワードには数字を含めてください' };
  }
  return { valid: true, message: '' };
}

/**
 * ユーザー入力のサニタイズ
 * HTMLタグ・制御文字を除去
 */
export function sanitizeInput(input: string): string {
  if (!input) return '';
  return input
    // HTMLタグ除去
    .replace(/<[^>]*>/g, '')
    // 制御文字除去 (タブ・改行は許可)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // 先頭・末尾の空白トリミング
    .trim();
}

/**
 * AI質問テキストのサニタイズ
 * プロンプトインジェクション対策
 */
export function sanitizeAIQuery(input: string): string {
  if (!input) return '';
  let sanitized = sanitizeInput(input);
  // 文字数制限（AIクエリは500文字以内）
  if (sanitized.length > 500) {
    sanitized = sanitized.substring(0, 500);
  }
  return sanitized;
}

/**
 * レポート詳細テキストのサニタイズ
 */
export function sanitizeReportText(input: string): string {
  if (!input) return '';
  let sanitized = sanitizeInput(input);
  if (sanitized.length > 1000) {
    sanitized = sanitized.substring(0, 1000);
  }
  return sanitized;
}
