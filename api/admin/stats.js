// ============================================================
// 管理ダッシュボード統計 API
// GET /api/admin/stats
// ============================================================
// Bearer 認証必須・ADMIN_EMAILS に登録されたメールのみアクセス可能
// ビジネス指標をリアルタイム計算して返す

const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// [追加] 統計から除外するメールアドレス（管理者権限はないが、集計対象外）
// 例: 身内・テスト用に無料提供しているプレミアムアカウントなど
const STATS_EXCLUDE_EMAILS = (process.env.STATS_EXCLUDE_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * Gmail のエイリアス・ドット変則を正規化（spoofing対策）
 * taira+test@gmail.com → taira@gmail.com
 * t.aira@gmail.com → taira@gmail.com
 */
function normalizeEmail(email) {
  if (!email) return '';
  const lower = email.toLowerCase().trim();
  const [local, domain] = lower.split('@');
  if (!domain) return lower;
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    const cleaned = local.split('+')[0].replace(/\./g, '');
    return `${cleaned}@gmail.com`;
  }
  return lower;
}

const NORMALIZED_ADMIN_EMAILS = ADMIN_EMAILS.map(normalizeEmail);
const NORMALIZED_STATS_EXCLUDE = STATS_EXCLUDE_EMAILS.map(normalizeEmail);
// 管理者・集計除外を合わせた統計除外リスト
const STATS_EXCLUDE_ALL = [...NORMALIZED_ADMIN_EMAILS, ...NORMALIZED_STATS_EXCLUDE];

// ============================================================
// 管理者認証共通ヘルパー
// ============================================================
// req から Bearer トークンを抽出 → ユーザー特定 → 管理者判定。
// 成功時は { user } を返す。失敗時は res に直接エラーを返して null を返す。
async function authorizeAdmin(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: '認証が必要です' });
    return null;
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    res.status(401).json({ error: '無効な認証トークンです' });
    return null;
  }

  // [セキュリティ] 管理者判定（厳格）
  // 1. メール確認済みでなければ拒否（メール乗っ取り対策）
  if (!user.email_confirmed_at) {
    res.status(403).json({ error: 'メール確認が完了していません' });
    return null;
  }
  // 2. 正規化済みメールで照合（Gmail エイリアス対策）
  const normalizedUserEmail = normalizeEmail(user.email || '');
  if (!normalizedUserEmail || !NORMALIZED_ADMIN_EMAILS.includes(normalizedUserEmail)) {
    res.status(403).json({ error: '管理者権限がありません' });
    return null;
  }

  return { user };
}

// ============================================================
// POST ハンドラ: needsReview レビュー記録 / 集計
// ============================================================
// Hobby plan の Function 上限（12個）を超えないよう、admin/stats を mode 引数で
// 拡張して /api/admin/review 相当の機能を提供する。
//
// クライアント → POST /api/admin/stats
//   body: { mode: 'mark_reviewed', questionId: string, status: 'ok'|'flagged', note?: string }
//   body: { mode: 'review_summary' }
async function handleReviewPost(req, res, user) {
  const body = (typeof req.body === 'string') ? safeJSON(req.body) : (req.body || {});
  const mode = body && body.mode;

  if (mode === 'mark_reviewed') {
    const questionId = String(body.questionId || '').trim();
    const status = String(body.status || '').trim();
    const note = body.note ? String(body.note).slice(0, 1000) : null;

    if (!questionId || questionId.length > 100) {
      return res.status(400).json({ error: 'questionId が無効です' });
    }
    if (status !== 'ok' && status !== 'flagged') {
      return res.status(400).json({ error: 'status は ok / flagged のみ許可' });
    }

    const { error: insertError } = await supabaseAdmin
      .from('question_review_log')
      .insert({
        reviewer_user_id: user.id,
        question_id: questionId,
        status,
        note,
      });

    if (insertError) {
      console.error('[admin.review] insert failed:', insertError.message);
      return res.status(500).json({ error: 'レビュー記録に失敗しました' });
    }

    return res.status(200).json({ ok: true, questionId, status });
  }

  if (mode === 'review_summary') {
    // レビュー済み問題ID（OK のみ・最新を採用）
    const { data: rows, error: sumErr } = await supabaseAdmin
      .from('question_review_log')
      .select('question_id, status, reviewed_at')
      .order('reviewed_at', { ascending: false });

    if (sumErr) {
      console.error('[admin.review] summary failed:', sumErr.message);
      return res.status(500).json({ error: 'サマリー取得に失敗しました' });
    }

    const latest = new Map();
    for (const r of rows || []) {
      if (!latest.has(r.question_id)) latest.set(r.question_id, r);
    }
    const okIds = [];
    const flaggedIds = [];
    latest.forEach((r, qid) => {
      if (r.status === 'ok') okIds.push(qid);
      else if (r.status === 'flagged') flaggedIds.push(qid);
    });

    return res.status(200).json({
      ok: true,
      reviewed_ok_ids: okIds,
      flagged_ids: flaggedIds,
      total_logs: (rows || []).length,
    });
  }

  return res.status(400).json({ error: '不明な mode です' });
}

function safeJSON(s) {
  try { return JSON.parse(s); } catch { return {}; }
}

module.exports = async (req, res) => {
  // CORS
  const origin = req.headers.origin;
  const allowed = ['https://takken-app-olive.vercel.app', 'https://takkenkanzen.com', 'https://www.takkenkanzen.com', 'https://app.takkenkanzen.com'];
  if (allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const auth = await authorizeAdmin(req, res);
    if (!auth) return;
    const user = auth.user;

    // POST: needsReview レビュー記録 / サマリー取得
    if (req.method === 'POST') {
      return await handleReviewPost(req, res, user);
    }

    // GET: 既存のビジネス指標集計
    // ────────── 集計開始 ──────────
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

    // 全 profiles 取得（数百〜数千件想定なので一括取得でOK）
    const { data: rawProfiles, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, plan, subscription_status, trial_ends_at, subscription_ends_at, payment_provider, created_at, updated_at');

    if (profileError) {
      console.error('[admin.stats] Profile query failed:', profileError.message);
      return res.status(500).json({ error: 'データ取得失敗' });
    }

    // [集計除外] 管理者・身内アカウント・テストアカウントは数字に含めない
    const profiles = (rawProfiles || []).filter((p) => {
      const normalizedEmail = normalizeEmail(p.email || '');
      return !STATS_EXCLUDE_ALL.includes(normalizedEmail);
    });
    const excludedCount = (rawProfiles || []).length - profiles.length;

    const total = profiles.length;

    // ─── ユーザー数 ───
    const newToday = profiles.filter((p) => p.created_at >= today).length;
    const newWeek = profiles.filter((p) => p.created_at >= weekAgo).length;
    const newMonth = profiles.filter((p) => p.created_at >= monthAgo).length;

    // ─── プラン別 ───
    const free = profiles.filter((p) => p.plan === 'free').length;
    const standard = profiles.filter((p) => p.plan === 'standard').length;

    // ─── トライアル状態 ───
    // trial_ends_at が未来 = まだトライアル中
    const inTrial = profiles.filter((p) =>
      p.subscription_status === 'trialing' &&
      p.trial_ends_at &&
      new Date(p.trial_ends_at) > now,
    ).length;

    const trialEndingToday = profiles.filter((p) => {
      if (!p.trial_ends_at) return false;
      const end = new Date(p.trial_ends_at);
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrow = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
      return end >= todayStart && end < tomorrow;
    }).length;

    const trialEndingWeek = profiles.filter((p) => {
      if (!p.trial_ends_at) return false;
      const end = new Date(p.trial_ends_at);
      return end > now && end <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    }).length;

    // ─── 課金 ───
    const activePaid = profiles.filter((p) =>
      p.plan === 'standard' && p.subscription_status === 'active',
    ).length;

    const trialingPaid = profiles.filter((p) =>
      p.plan === 'standard' && p.subscription_status === 'trialing',
    ).length;

    const canceled = profiles.filter((p) => p.subscription_status === 'canceled').length;
    const pastDue = profiles.filter((p) => p.subscription_status === 'past_due').length;

    // ─── 月間売上 (MRR) ───
    // active な standard プランは ¥980/月
    const mrr = activePaid * 980;

    // ─── 今月の新規課金数 ───
    const newPaidThisMonth = profiles.filter((p) =>
      p.plan === 'standard' &&
      p.created_at >= monthAgo,
    ).length;

    // ─── 転換率 ───
    // 登録 → 課金（active or trialing）
    const totalConverted = activePaid + trialingPaid;
    const conversionRate = total > 0 ? Math.round((totalConverted / total) * 1000) / 10 : 0;

    // トライアル → 有料転換率（active / (active + canceled in trial period)）
    // 簡易版: active な人 / 全 standard プランに到達した人
    const everPaid = profiles.filter((p) => p.payment_provider === 'paypal' || p.plan === 'standard').length;
    const trialToActiveRate = everPaid > 0
      ? Math.round((activePaid / everPaid) * 1000) / 10
      : 0;

    // ─── 継続率 ───
    // 1ヶ月以上前に課金開始した人のうち、現在も active な人
    const oldPaidUsers = profiles.filter((p) =>
      p.plan === 'standard' &&
      p.created_at < monthAgo,
    );
    const stillActive1m = oldPaidUsers.filter((p) => p.subscription_status === 'active').length;
    const retention1m = oldPaidUsers.length > 0
      ? Math.round((stillActive1m / oldPaidUsers.length) * 1000) / 10
      : 0;

    const veryOldPaidUsers = profiles.filter((p) =>
      p.plan === 'standard' &&
      p.created_at < threeMonthsAgo,
    );
    const stillActive3m = veryOldPaidUsers.filter((p) => p.subscription_status === 'active').length;
    const retention3m = veryOldPaidUsers.length > 0
      ? Math.round((stillActive3m / veryOldPaidUsers.length) * 1000) / 10
      : 0;

    // ─── 学習統計（全ユーザーの累計）───
    const { data: stats } = await supabaseAdmin
      .from('study_stats')
      .select('total_questions, total_correct');

    const totalQuestionsAnswered = (stats || []).reduce((sum, s) => sum + (s.total_questions || 0), 0);
    const totalCorrect = (stats || []).reduce((sum, s) => sum + (s.total_correct || 0), 0);
    const overallAccuracy = totalQuestionsAnswered > 0
      ? Math.round((totalCorrect / totalQuestionsAnswered) * 1000) / 10
      : 0;

    return res.status(200).json({
      ok: true,
      generated_at: now.toISOString(),
      excluded_admin_count: excludedCount,
      users: {
        total,
        new_today: newToday,
        new_week: newWeek,
        new_month: newMonth,
        free,
        standard,
      },
      trial: {
        in_trial: inTrial,
        ending_today: trialEndingToday,
        ending_week: trialEndingWeek,
      },
      revenue: {
        active_paid: activePaid,
        trialing_paid: trialingPaid,
        canceled,
        past_due: pastDue,
        mrr_jpy: mrr,
        new_paid_this_month: newPaidThisMonth,
      },
      conversion: {
        signup_to_paid_pct: conversionRate,
        trial_to_active_pct: trialToActiveRate,
        retention_1m_pct: retention1m,
        retention_3m_pct: retention3m,
      },
      learning: {
        total_questions_answered: totalQuestionsAnswered,
        overall_accuracy_pct: overallAccuracy,
      },
    });
  } catch (e) {
    console.error('[admin.stats] Unexpected error:', e.message);
    return res.status(500).json({ error: '集計エラー' });
  }
};
