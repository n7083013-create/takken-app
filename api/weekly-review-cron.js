// ============================================================
// 週次レビューメール配信 Cron エンドポイント
// POST /api/weekly-review-cron
// ============================================================
// Vercel Cron から毎週月曜 8:00 JST に呼ばれる
// - 全ユーザーを取得
// - 各ユーザーの過去1週間の学習データを集計
// - 結果メールを Resend 経由で送信
//
// 必要な環境変数:
//   CRON_SECRET - Vercel Cron 専用シークレット（認証用）
//   RESEND_API_KEY - Resend API キー
//   SUPABASE_SERVICE_ROLE_KEY - Supabase 管理キー（RLS無視）

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabaseAdmin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const SENDER = 'noreply@mail.takkenkanzen.com';
const SENDER_NAME = '宅建士 完全対策';

/**
 * タイミングセーフな文字列比較
 */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  try {
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * 試験までの日数（10月第3日曜日）
 */
function daysUntilExam() {
  const now = new Date();
  const calcThirdSunday = (y) => {
    const oct1 = new Date(y, 9, 1);
    const firstSunday = ((7 - oct1.getDay()) % 7) + 1;
    return new Date(y, 9, firstSunday + 14);
  };
  let exam = calcThirdSunday(now.getFullYear());
  const dayAfter = new Date(exam);
  dayAfter.setDate(dayAfter.getDate() + 1);
  if (now.getTime() >= dayAfter.getTime()) {
    exam = calcThirdSunday(now.getFullYear() + 1);
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const examDay = new Date(exam.getFullYear(), exam.getMonth(), exam.getDate());
  return Math.max(0, Math.round((examDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)));
}

/**
 * 過去1週間の学習データを集計
 */
async function getWeeklyStats(userId) {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const { data: rows, error } = await supabaseAdmin
    .from('question_progress')
    .select('attempts, correct_count, last_attempt_at')
    .eq('user_id', userId)
    .gte('last_attempt_at', oneWeekAgo.toISOString());

  if (error || !rows) return null;

  let totalAnswered = 0;
  let totalCorrect = 0;
  for (const r of rows) {
    totalAnswered += r.attempts || 0;
    totalCorrect += r.correct_count || 0;
  }

  const accuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

  // ストリーク取得
  const { data: stats } = await supabaseAdmin
    .from('study_stats')
    .select('streak, total_questions')
    .eq('user_id', userId)
    .maybeSingle();

  return {
    totalAnswered,
    accuracy,
    streak: stats?.streak ?? 0,
    lifetimeTotal: stats?.total_questions ?? 0,
  };
}

/**
 * メールテンプレート生成
 */
function buildEmailHtml({ email, stats, examDays }) {
  const greeting = new Date().getHours() < 12 ? 'おはようございます' : 'こんにちは';

  let praiseEmoji = '💪';
  let praiseText = '';
  if (stats.totalAnswered === 0) {
    praiseText = '先週は学習できませんでしたね。でも大丈夫！今週から1日1問でも始めましょう';
    praiseEmoji = '🌱';
  } else if (stats.totalAnswered < 20) {
    praiseText = 'お忙しい中、学習を続けていただきありがとうございます';
    praiseEmoji = '📚';
  } else if (stats.totalAnswered < 50) {
    praiseText = '素晴らしいペースです！この調子で続ければ合格が見えてきます';
    praiseEmoji = '🔥';
  } else {
    praiseText = '驚異的な学習量です！ここまで頑張れるあなたなら必ず合格できます';
    praiseEmoji = '🏆';
  }

  let urgencyNote = '';
  if (examDays <= 30) {
    urgencyNote = `<p style="color:#D93025;font-weight:700;margin:12px 0">⏰ 試験まで残り${examDays}日。最後の追い込みで合格を勝ち取りましょう！</p>`;
  } else if (examDays <= 90) {
    urgencyNote = `<p style="color:#E8860C;margin:12px 0">試験まで残り${examDays}日。計画的に仕上げていきましょう</p>`;
  }

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F5F5F0;margin:0;padding:20px;color:#1A1A1A">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.06)">
    <div style="text-align:center;margin-bottom:24px">
      <div style="font-size:42px;margin-bottom:8px">📊</div>
      <h1 style="font-size:22px;font-weight:800;margin:0;color:#1A1A1A">先週のあなたの学習レポート</h1>
      <p style="color:#666;font-size:14px;margin:4px 0 0">${greeting}、${email.split('@')[0]} さん</p>
    </div>

    <div style="background:#E8F5EC;border-radius:10px;padding:20px;margin-bottom:20px">
      <div style="font-size:14px;color:#1B7A3D;font-weight:700;margin-bottom:10px">${praiseEmoji} 先週の成果</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:120px;background:#fff;border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:28px;font-weight:900;color:#1B7A3D">${stats.totalAnswered}</div>
          <div style="font-size:11px;color:#666;font-weight:600">解答問題数</div>
        </div>
        <div style="flex:1;min-width:120px;background:#fff;border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:28px;font-weight:900;color:#1A6DC2">${stats.accuracy}<span style="font-size:16px">%</span></div>
          <div style="font-size:11px;color:#666;font-weight:600">正答率</div>
        </div>
        <div style="flex:1;min-width:120px;background:#fff;border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:28px;font-weight:900;color:#E8860C">🔥${stats.streak}</div>
          <div style="font-size:11px;color:#666;font-weight:600">連続学習日数</div>
        </div>
      </div>
    </div>

    <p style="font-size:15px;line-height:22px;color:#333;margin:16px 0">${praiseText}</p>

    ${urgencyNote}

    <div style="text-align:center;margin:28px 0 16px">
      <a href="https://app.takkenkanzen.com" style="display:inline-block;background:#1B7A3D;color:#fff;padding:14px 32px;border-radius:999px;text-decoration:none;font-weight:700;font-size:15px">今週の学習を始める →</a>
    </div>

    <p style="font-size:12px;color:#999;text-align:center;margin-top:28px">
      このメールは 宅建士 完全対策 からお送りしています。<br>
      配信停止はアプリの設定から変更できます。
    </p>
  </div>
</body></html>`;
}

/**
 * Resend でメール送信
 */
async function sendEmail(to, subject, html) {
  if (!RESEND_API_KEY) {
    console.error('[weekly-review] RESEND_API_KEY is not set');
    return { ok: false, reason: 'no_api_key' };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${SENDER_NAME} <${SENDER}>`,
      to,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    console.error(`[weekly-review] Resend error for ${to}: ${res.status} ${err}`);
    return { ok: false, reason: `status_${res.status}` };
  }
  return { ok: true };
}

module.exports = async (req, res) => {
  // 認証: Vercel Cron からの呼び出しのみ許可
  const authHeader = req.headers.authorization || '';
  const providedSecret = authHeader.replace('Bearer ', '');
  if (!CRON_SECRET || !timingSafeEqual(providedSecret, CRON_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // 配信対象ユーザーを取得
    // email_confirmed_at があり、週次メール受信設定が true（デフォルトtrueで opt-out 方式）
    const { data: users, error } = await supabaseAdmin
      .from('profiles')
      .select('id, email, weekly_email_enabled')
      .not('email', 'is', null);

    if (error) {
      console.error('[weekly-review] Failed to fetch users:', error.message);
      return res.status(500).json({ error: error.message });
    }

    const examDays = daysUntilExam();
    const results = { sent: 0, skipped: 0, failed: 0 };

    for (const user of users || []) {
      // opt-out されてたらスキップ
      if (user.weekly_email_enabled === false) {
        results.skipped++;
        continue;
      }

      const stats = await getWeeklyStats(user.id);
      if (!stats) {
        results.failed++;
        continue;
      }

      // 学習ゼロ + ストリーク0 の放置ユーザーはスキップ（スパム扱いリスク回避）
      if (stats.totalAnswered === 0 && stats.streak === 0 && stats.lifetimeTotal === 0) {
        results.skipped++;
        continue;
      }

      const html = buildEmailHtml({ email: user.email, stats, examDays });
      const subject = stats.totalAnswered > 0
        ? `📊 先週${stats.totalAnswered}問・正答率${stats.accuracy}% | 試験まで${examDays}日`
        : `📚 今週から再開しませんか？ | 試験まで${examDays}日`;

      const sendResult = await sendEmail(user.email, subject, html);
      if (sendResult.ok) {
        results.sent++;
      } else {
        results.failed++;
      }

      // レート制限配慮
      await new Promise((r) => setTimeout(r, 100));
    }

    console.log(`[weekly-review] Completed:`, results);
    return res.status(200).json({ ok: true, results });
  } catch (e) {
    console.error('[weekly-review] Unexpected error:', e.message);
    return res.status(500).json({ error: 'Internal error' });
  }
};
