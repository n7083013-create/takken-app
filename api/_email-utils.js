// ============================================================
// メールアドレス正規化＆ハッシュ化
// トライアル履歴の重複検知に使用（spoofing対策）
// ============================================================

const crypto = require('crypto');

/**
 * Gmail のエイリアス・ドット変則を正規化
 * - 大文字小文字無視
 * - Gmail のドット無視: t.aira@gmail.com → taira@gmail.com
 * - Gmail のエイリアス除去: taira+test@gmail.com → taira@gmail.com
 */
function normalizeEmail(email) {
  if (!email) return '';
  const lower = String(email).toLowerCase().trim();
  const [local, domain] = lower.split('@');
  if (!domain) return lower;
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    const cleaned = local.split('+')[0].replace(/\./g, '');
    return `${cleaned}@gmail.com`;
  }
  return lower;
}

/**
 * メールアドレスを SHA-256 でハッシュ化
 * 元のアドレスは復元できないが、同じメアドからは同じハッシュが得られる
 * → DBに平文メアドを残さず、重複検知だけ可能
 */
function hashEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return '';
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

module.exports = {
  normalizeEmail,
  hashEmail,
};
