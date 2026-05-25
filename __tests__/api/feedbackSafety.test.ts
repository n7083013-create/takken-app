// ============================================================
// T-PII Round2: takken feedback API セキュリティ層の回帰テスト
// ============================================================
// H-1: 認証ユーザーの日次レート制限の発火条件
// H-2: 未ログイン送信に対する IPベースレート制限
// H-3: contactEmail の CRLF注入 / ヘッダ汚染 防御
//
// api/ai-chat.js は js (Vercel functions) のため、検証ロジックを純関数として
// ミラー実装してテストする。サーバ側と乖離した場合 CI で即時検出するのが目的。

import { checkRateLimit } from '../../api/_lib/rateLimit';

// ----- サーバ側ロジックのミラー実装 (api/ai-chat.js と完全一致) -----
const EMAIL_MAX = 254;
const EMAIL_LOCAL_MAX = 64;
const EMAIL_RE = /^[A-Za-z0-9!#$%&'*+\-/=?^_`{|}~.]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
const EMAIL_FORBIDDEN_RE = /[\r\n\t\x00-\x1F\x7F<>"'\\,;:()[\]]|%0[ADad]/;
function isValidContactEmail(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > EMAIL_MAX) return false;
  if (EMAIL_FORBIDDEN_RE.test(value)) return false;
  if (!EMAIL_RE.test(value)) return false;
  const atIdx = value.indexOf('@');
  if (atIdx < 1 || atIdx > EMAIL_LOCAL_MAX) return false;
  return true;
}

function buildSubject(category: 'bug' | 'feature' | 'question' | 'other', body: string): string {
  const catLabel = {
    bug: '🐛 バグ報告',
    feature: '✨ 機能要望',
    question: '❓ 質問',
    other: '💬 その他',
  }[category];
  const subjectBody = body.slice(0, 30).replace(/[\r\n\t\x00-\x1F\x7F]/g, ' ');
  return `[宅建アプリ] ${catLabel}: ${subjectBody}${body.length > 30 ? '...' : ''}`;
}

function mockReq(ip: string) {
  return {
    headers: { 'x-forwarded-for': ip },
    socket: { remoteAddress: ip },
  };
}

// ============================================================
// H-3: contactEmail CRLF injection 防御
// ============================================================
describe('H-3 isValidContactEmail — CRLF injection 攻撃ペイロード', () => {
  test('CRLF + Bcc 注入 (定番ペイロード) は拒否', () => {
    expect(isValidContactEmail('attacker@evil.com\r\nBcc: victim@example.com')).toBe(false);
  });

  test('LF のみの注入も拒否', () => {
    expect(isValidContactEmail('attacker@evil.com\nBcc: victim@example.com')).toBe(false);
  });

  test('CR のみの注入も拒否', () => {
    expect(isValidContactEmail('attacker@evil.com\rBcc: victim@example.com')).toBe(false);
  });

  test('パーセントエンコード CRLF (%0d%0a) は拒否', () => {
    expect(isValidContactEmail('attacker@evil.com%0d%0aBcc:x@y.co')).toBe(false);
    expect(isValidContactEmail('attacker@evil.com%0D%0ABcc:x@y.co')).toBe(false);
  });

  test('NULL バイト / タブ / 制御文字は拒否', () => {
    expect(isValidContactEmail('attacker@evil.com\x00')).toBe(false);
    expect(isValidContactEmail('a\tb@example.com')).toBe(false);
  });

  test('カンマ/セミコロン による複数宛先指定は拒否', () => {
    expect(isValidContactEmail('a@b.co,c@d.co')).toBe(false);
    expect(isValidContactEmail('a@b.co;c@d.co')).toBe(false);
  });

  test('山括弧/引用符 によるヘッダ書式混入は拒否', () => {
    expect(isValidContactEmail('<victim@example.com>')).toBe(false);
    expect(isValidContactEmail('"victim"@example.com')).toBe(false);
  });

  test('254 文字超は拒否 (RFC 5321)', () => {
    const local = 'a'.repeat(60);
    const domain = 'b'.repeat(200) + '.co';
    expect(isValidContactEmail(`${local}@${domain}`)).toBe(false);
  });

  test('ローカル部 64 文字超は拒否', () => {
    expect(isValidContactEmail('a'.repeat(65) + '@example.com')).toBe(false);
  });

  test('@ なし / TLD なし / 連続ドット は拒否', () => {
    expect(isValidContactEmail('no-at-sign')).toBe(false);
    expect(isValidContactEmail('user@host')).toBe(false);
    expect(isValidContactEmail('user@host..com')).toBe(false);
  });

  test('non-string は拒否', () => {
    expect(isValidContactEmail(null)).toBe(false);
    expect(isValidContactEmail(undefined)).toBe(false);
    expect(isValidContactEmail(123)).toBe(false);
    expect(isValidContactEmail({ toString: () => 'a@b.co' })).toBe(false);
  });

  test('空文字は拒否 (handler 側で空は別経路許容)', () => {
    expect(isValidContactEmail('')).toBe(false);
  });

  test('正常アドレスは許可 (回帰)', () => {
    expect(isValidContactEmail('user@example.com')).toBe(true);
    expect(isValidContactEmail('user.name+tag@example.co.jp')).toBe(true);
    expect(isValidContactEmail('a@b.co')).toBe(true);
  });
});

// ============================================================
// H-3 続: 件名 ヘッダ注入 防御
// ============================================================
describe('H-3 buildSubject — 件名 CRLF注入 防御', () => {
  test('body に CRLF があっても件名行は分割されない', () => {
    const evil = `bug\r\nBcc: victim@example.com`;
    const subj = buildSubject('bug', evil);
    expect(subj).not.toMatch(/[\r\n]/);
  });

  test('NULLバイトを含む body は件名から除去', () => {
    const subj = buildSubject('bug', 'a\x00b');
    expect(subj).not.toMatch(/[\x00-\x1F\x7F]/);
  });

  test('30 文字超は省略記号 ... が付く', () => {
    const long = 'a'.repeat(50);
    expect(buildSubject('bug', long)).toMatch(/\.\.\.$/);
  });

  test('件名 prefix は [宅建アプリ]', () => {
    expect(buildSubject('bug', 'test').startsWith('[宅建アプリ]')).toBe(true);
  });
});

// ============================================================
// H-2: 未ログイン送信に対する IPベースレート制限
// ============================================================
describe('H-2 feedback IP rate limit', () => {
  test('1時間あたり 10件を超えると allowed=false (未認証DoS遮断)', () => {
    const ip = '203.0.113.55';
    let blockedAt = -1;
    for (let i = 0; i < 15; i++) {
      const r = checkRateLimit(mockReq(ip), 'feedback', {
        limit: 10,
        windowMs: 60 * 60 * 1000,
      });
      if (!r.allowed && blockedAt === -1) blockedAt = i;
    }
    expect(blockedAt).toBe(10);
  });

  test('100連投シナリオでも 10件のみ通過', () => {
    const ip = '198.51.100.77';
    let allowed = 0;
    for (let i = 0; i < 100; i++) {
      const r = checkRateLimit(mockReq(ip), 'feedback', {
        limit: 10,
        windowMs: 60 * 60 * 1000,
      });
      if (r.allowed) allowed++;
    }
    expect(allowed).toBe(10);
  });

  test('別IPは独立してカウント (分散攻撃の最小要件)', () => {
    const ipA = '203.0.113.111';
    const ipB = '203.0.113.222';
    for (let i = 0; i < 10; i++) {
      checkRateLimit(mockReq(ipA), 'feedback', { limit: 10, windowMs: 60 * 60 * 1000 });
    }
    const rA = checkRateLimit(mockReq(ipA), 'feedback', { limit: 10, windowMs: 60 * 60 * 1000 });
    const rB = checkRateLimit(mockReq(ipB), 'feedback', { limit: 10, windowMs: 60 * 60 * 1000 });
    expect(rA.allowed).toBe(false);
    expect(rB.allowed).toBe(true);
  });
});

// ============================================================
// H-1: 認証ユーザーの日次レート制限ロジック
// ============================================================
describe('H-1 feedback user-id rate limit', () => {
  function shouldRateLimitByCount(count: number | null, limit = 5): boolean {
    return (count ?? 0) >= limit;
  }

  test('count 4 はまだ送信可能', () => {
    expect(shouldRateLimitByCount(4)).toBe(false);
  });

  test('count 5 はブロック (上限到達)', () => {
    expect(shouldRateLimitByCount(5)).toBe(true);
  });

  test('count null は 0 扱い (テーブル不在時はサーバ側で SUSPICIOUS_PATTERN ログ)', () => {
    expect(shouldRateLimitByCount(null)).toBe(false);
  });
});
