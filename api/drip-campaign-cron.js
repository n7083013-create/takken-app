// ============================================================
// ドリップ & エンゲージメントメール配信 Cron
// POST /api/drip-campaign-cron
// ============================================================
// 毎日 9:00 JST 実行 → ユーザーのライフサイクル/学習状況に応じて自動メール
//
// オンボーディング（plan=free のみ）
//   - day3:  登録から3日後  → 学習促進
//   - day7:  登録から7日後  → Premium 案内
//   - day14: 登録から14日後 → 直前期/本格期の追い込み
//
// エンゲージメント（全プラン共通・継続率/合格率向上）
//   - inactive_3d:    3日サボってる → 引き戻し（クールダウン7日）
//   - countdown_X:    試験まで 30/14/7/3/1 日 → カウントダウン緊張感（年1回）
//   - streak_danger:  最後の学習から20-24時間経過 + streak≥3 → 連続記録維持訴求（クールダウン18時間）
//
// 冪等性: drip_sent テーブルに送信履歴を記録
//   - 1回限り送信: alreadySent(stage)
//   - 繰り返し送信: lastSentWithin(stage, hours)
//
// 必要な前提:
//   - Supabase migration 005_engagement_emails.sql を適用済み
//     （drip_sent の PK / CHECK 解除）
// ============================================================

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
const APP_URL = 'https://app.takkenkanzen.com';

// 1ループあたりの送信ペース（Resend レートリミット対策）
const SEND_INTERVAL_MS = 100;

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

// ─────────────────────────────────────────────
// 試験日計算（10月第3日曜）
// ─────────────────────────────────────────────
function calcThirdSundayOfOctober(year) {
  const oct1 = new Date(year, 9, 1);
  const firstSunday = ((7 - oct1.getDay()) % 7) + 1;
  return new Date(year, 9, firstSunday + 14);
}

function nextExamDate() {
  const now = new Date();
  let exam = calcThirdSundayOfOctober(now.getFullYear());
  // 試験翌日を過ぎていれば来年
  const dayAfter = new Date(exam);
  dayAfter.setDate(dayAfter.getDate() + 1);
  if (now.getTime() >= dayAfter.getTime()) {
    exam = calcThirdSundayOfOctober(now.getFullYear() + 1);
  }
  return exam;
}

function daysUntilExam() {
  const now = new Date();
  const exam = nextExamDate();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const examDay = new Date(exam.getFullYear(), exam.getMonth(), exam.getDate());
  return Math.max(0, Math.round((examDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)));
}

function getExamYear() {
  return nextExamDate().getFullYear();
}

// ─────────────────────────────────────────────
// 共通テンプレート
// ─────────────────────────────────────────────
function wrapEmail(title, bodyHtml, ctaText, ctaUrl) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F5F5F0;margin:0;padding:20px;color:#1A1A1A">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.06)">
    <div style="text-align:center;margin-bottom:20px">
      <div style="font-size:13px;color:#1B7A3D;font-weight:800;letter-spacing:2px">宅建士 完全対策</div>
    </div>
    <h1 style="font-size:22px;font-weight:800;margin:0 0 20px 0;color:#1A1A1A">${title}</h1>
    ${bodyHtml}
    <div style="text-align:center;margin:32px 0 16px">
      <a href="${ctaUrl}" style="display:inline-block;background:#1B7A3D;color:#fff;padding:14px 32px;border-radius:999px;text-decoration:none;font-weight:800;font-size:15px">${ctaText} →</a>
    </div>
    <p style="font-size:11px;color:#999;text-align:center;margin-top:28px;line-height:18px">
      このメールは宅建士 完全対策 からお送りしています。<br>
      配信停止はアプリの「記録」タブ→「メール設定」から変更できます。
    </p>
  </div>
</body></html>`;
}

// ─────────────────────────────────────────────
// オンボーディングメール（既存）
// ─────────────────────────────────────────────
function emailDay3(_email, examDays) {
  return {
    subject: `📚 学習進んでますか？試験まで${examDays}日`,
    html: wrapEmail(
      'こんにちは！学習は進んでますか？',
      `<p style="font-size:15px;line-height:24px">登録いただいてから3日。宅建試験合格に向けて、一緒に頑張りましょう！</p>
       <div style="background:#E8F5EC;border-left:4px solid #1B7A3D;padding:14px;border-radius:6px;margin:20px 0">
         <p style="margin:0;font-size:14px;color:#145C2E;font-weight:600">💡 効果的な学習法</p>
         <p style="margin:6px 0 0 0;font-size:14px;color:#2E5C3A;line-height:22px">
           スキマ時間に「一問一答」を毎日10問解くだけで、試験までに300問以上攻略できます。
         </p>
       </div>
       <p style="font-size:14px;color:#555;line-height:22px">今日の1問から始めませんか？</p>`,
      '今日の学習を始める',
      APP_URL,
    ),
  };
}

function emailDay7(_email, examDays) {
  return {
    subject: `🎁 無料トライアル特典のご案内（試験まで${examDays}日）`,
    html: wrapEmail(
      '合格力を最大化する特典のご案内',
      `<p style="font-size:15px;line-height:24px">登録から1週間経ちましたね。この調子で学習を続ければ、試験までに大きく実力が伸びます！</p>
       <div style="background:#FFF8E1;border-left:4px solid #E8860C;padding:14px;border-radius:6px;margin:20px 0">
         <p style="margin:0;font-size:14px;color:#8B5A00;font-weight:800">🌟 Premium なら、もっと伸ばせます</p>
         <ul style="margin:10px 0 0 0;padding-left:20px;font-size:14px;color:#555;line-height:22px">
           <li><b>AI合格確率予測</b> - 「今受けたら何点取れるか」が一目瞭然</li>
           <li><b>弱点AIコーチング</b> - 苦手分野を自動検出して集中強化</li>
           <li><b>全820問＋模擬試験</b> - 無料範囲の27倍のコンテンツ</li>
         </ul>
       </div>
       <p style="font-size:14px;color:#555;line-height:22px">
         <b>今なら7日間無料トライアル実施中。</b>期間内に解約すれば料金は発生しません。
       </p>`,
      '7日間無料で試す',
      `${APP_URL}/paywall`,
    ),
  };
}

function emailDay14(_email, examDays) {
  const urgency = examDays <= 90 ? '直前期' : '本格学習期';
  return {
    subject: `⏰ 試験まで${examDays}日。${urgency}の備えを`,
    html: wrapEmail(
      `試験まで残り${examDays}日！今がターニングポイント`,
      `<p style="font-size:15px;line-height:24px">登録から2週間。ここからが勝負の分かれ目です。</p>
       <div style="background:#FEF2F2;border-left:4px solid #D93025;padding:14px;border-radius:6px;margin:20px 0">
         <p style="margin:0;font-size:14px;color:#8B0000;font-weight:800">📊 合格者の共通点</p>
         <p style="margin:6px 0 0 0;font-size:14px;color:#555;line-height:22px">
           合格者の87%が「計画的な模擬試験受験」を実施。当アプリのPremiumなら<b>模擬試験を無制限</b>で受けられます。
         </p>
       </div>
       <p style="font-size:14px;color:#555;line-height:22px">
         直前モード（試験30日前から自動起動）・AI合格確率予測・弱点AIコーチングなど、合格に直結する機能が揃っています。
       </p>
       <p style="font-size:13px;color:#888;line-height:20px;margin-top:16px">
         ※ 7日間無料トライアル中。ワンタップで解約できます。
       </p>`,
      '合格力を最大化する',
      `${APP_URL}/paywall`,
    ),
  };
}

// ─────────────────────────────────────────────
// 新規: 3日サボリ引き戻しメール
// ─────────────────────────────────────────────
function emailInactive3d(examDays) {
  return {
    subject: `📚 おかえりなさい。1問だけでも続きから始めませんか？`,
    html: wrapEmail(
      'お久しぶりです。学習に戻りましょう',
      `<p style="font-size:15px;line-height:24px">最後の学習から3日。忙しい毎日、お疲れさまです。</p>
       <div style="background:#E8F5EC;border-left:4px solid #1B7A3D;padding:14px;border-radius:6px;margin:20px 0">
         <p style="margin:0;font-size:14px;color:#145C2E;font-weight:700">💡 1日1問でも、合格に近づきます</p>
         <p style="margin:6px 0 0 0;font-size:14px;color:#2E5C3A;line-height:22px">
           試験まで残り <b>${examDays}日</b>。今日の1問が、合格への大きな一歩になります。
         </p>
       </div>
       <p style="font-size:14px;color:#555;line-height:22px">
         「忘却曲線」でちょうど復習が必要なタイミングです。覚えた内容を定着させるチャンス。
       </p>
       <p style="font-size:13px;color:#888;line-height:20px;margin-top:8px">
         今日続けるべき1問が、アプリのホーム画面で待っています。
       </p>`,
      '今日の1問を解く',
      APP_URL,
    ),
  };
}

// ─────────────────────────────────────────────
// 新規: 試験カウントダウン（30/14/7/3/1）
// ─────────────────────────────────────────────
function emailCountdown(daysLeft) {
  let title, intro, tip, urgencyColor, urgencyBg, ctaText;

  if (daysLeft >= 30) {
    title = '🎯 試験まで30日！1ヶ月集中プランに切り替えどき';
    intro = '本番まで1ヶ月。ここからの30日が合否を決めます。';
    tip = '残り30日で過去問を1巡完了、苦手分野を3周復習で合格が見えます。';
    urgencyColor = '#1A6DC2';
    urgencyBg = '#E8F2FF';
    ctaText = '30日プランで合格を確実にする';
  } else if (daysLeft >= 14) {
    title = '🔥 試験まで14日！追い込みの最終局面';
    intro = 'いよいよ2週間を切りました。これまでの努力を結果に変える時期です。';
    tip = '残り14日は「弱点分野の集中復習 + 模擬試験」で実戦力を最大化。';
    urgencyColor = '#E8860C';
    urgencyBg = '#FFF4E5';
    ctaText = '弱点を集中攻略する';
  } else if (daysLeft >= 7) {
    title = '⚡ 試験まで7日！ラストスパート';
    intro = '残り1週間。直前モードを最大活用するタイミングです。';
    tip = '頻出論点の最終確認と、過去問で間違えた問題の総ざらいを。睡眠も大切。';
    urgencyColor = '#D93025';
    urgencyBg = '#FEF2F2';
    ctaText = '直前モードで仕上げる';
  } else if (daysLeft >= 3) {
    title = '🚨 試験まで3日！最終チェック';
    intro = '本番まで3日。新しいことより、今までやった内容の確実な定着を。';
    tip = '今日は「コアエッセンス」（1行解説）でサクッと総復習がおすすめ。長時間学習より短時間の高密度復習を。';
    urgencyColor = '#D93025';
    urgencyBg = '#FEF2F2';
    ctaText = '最終チェックを始める';
  } else {
    title = '✨ 明日が本番！自信を持って臨んでください';
    intro = 'ここまで頑張ってきたあなたなら、必ず合格できます。';
    tip = '今日は深く学習せず、軽く要点を見直して早めに就寝。試験会場の確認・持ち物準備もお忘れなく。応援しています！';
    urgencyColor = '#1B7A3D';
    urgencyBg = '#E8F5EC';
    ctaText = '直前ワンタップ復習';
  }

  return {
    subject: `${daysLeft <= 1 ? '✨' : '⏰'} 試験まで${daysLeft}日。${daysLeft >= 14 ? '今すぐ準備を' : '最後まで諦めずに'}`,
    html: wrapEmail(
      title,
      `<p style="font-size:15px;line-height:24px">${intro}</p>
       <div style="background:${urgencyBg};border-left:4px solid ${urgencyColor};padding:14px;border-radius:6px;margin:20px 0">
         <p style="margin:0;font-size:14px;color:${urgencyColor};font-weight:800">📌 残り${daysLeft}日の戦略</p>
         <p style="margin:6px 0 0 0;font-size:14px;color:#444;line-height:22px">${tip}</p>
       </div>
       <p style="font-size:14px;color:#555;line-height:22px">
         アプリは試験30日前から自動的に「直前モード」が起動します。今こそ、合格に直結する論点だけに集中しましょう。
       </p>`,
      ctaText,
      APP_URL,
    ),
  };
}

// ─────────────────────────────────────────────
// 新規: ストリーク危機メール
// ─────────────────────────────────────────────
function emailStreakDanger(streakDays) {
  return {
    subject: `🔥 ${streakDays}日連続記録が途切れそうです！1問でも守って`,
    html: wrapEmail(
      `🔥 ${streakDays}日連続記録、もうすぐ消えます`,
      `<p style="font-size:15px;line-height:24px">今までの${streakDays}日間、本当によく続けました。継続は実力の何よりの証拠です。</p>
       <div style="background:#FFF4E5;border-left:4px solid #E8860C;padding:14px;border-radius:6px;margin:20px 0">
         <p style="margin:0;font-size:14px;color:#8B5A00;font-weight:800">⚠️ ストリーク維持のチャンス</p>
         <p style="margin:6px 0 0 0;font-size:14px;color:#444;line-height:22px">
           あと数時間で <b>${streakDays}日連続学習</b> が途切れます。1問だけ解くだけでも記録は守れます。
         </p>
       </div>
       <p style="font-size:14px;color:#555;line-height:22px">
         「1分チャレンジ」なら 60秒で3問。今すぐ1分だけ取れば、また明日も連続記録が続きます。
       </p>
       <p style="font-size:12px;color:#888;line-height:18px;margin-top:8px">
         💪 継続率 No.1 を目指すあなたを、応援しています。
       </p>`,
      '1分チャレンジを始める',
      `${APP_URL}/micro-challenge`,
    ),
  };
}

// ─────────────────────────────────────────────
// Resend 送信
// ─────────────────────────────────────────────
async function sendEmail(to, subject, html) {
  if (!RESEND_API_KEY) {
    console.error('[drip] RESEND_API_KEY not set');
    return { ok: false };
  }
  try {
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
    return { ok: res.ok, status: res.status };
  } catch (e) {
    console.error('[drip] send failed:', e.message);
    return { ok: false };
  }
}

// ─────────────────────────────────────────────
// 送信履歴チェック
// ─────────────────────────────────────────────
async function alreadySent(userId, stage) {
  const { data } = await supabaseAdmin
    .from('drip_sent')
    .select('stage')
    .eq('user_id', userId)
    .eq('stage', stage)
    .limit(1)
    .maybeSingle();
  return !!data;
}

async function lastSentWithin(userId, stage, hours) {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from('drip_sent')
    .select('sent_at')
    .eq('user_id', userId)
    .eq('stage', stage)
    .gte('sent_at', cutoff)
    .limit(1)
    .maybeSingle();
  return !!data;
}

async function markSent(userId, stage) {
  await supabaseAdmin
    .from('drip_sent')
    .insert({ user_id: userId, stage, sent_at: new Date().toISOString() });
}

// メール送信前のユーザーチェック（メール確認済み・配信ON 共通）
async function isUserEligible(userId, profile) {
  if (!profile?.email) return false;
  if (profile.weekly_email_enabled === false) return false;
  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (!authUser?.user?.email_confirmed_at) return false;
  return true;
}

// ─────────────────────────────────────────────
// ステージごとの処理
// ─────────────────────────────────────────────

/** オンボーディング: 登録から N 日後 */
async function processOnboarding(now, examDays, results) {
  const stages = [
    { days: 3, stage: 'day3', generator: emailDay3 },
    { days: 7, stage: 'day7', generator: emailDay7 },
    { days: 14, stage: 'day14', generator: emailDay14 },
  ];

  for (const { days, stage, generator } of stages) {
    const targetDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const rangeStart = new Date(targetDate.getTime() - 12 * 60 * 60 * 1000);
    const rangeEnd = new Date(targetDate.getTime() + 12 * 60 * 60 * 1000);

    const { data: users, error } = await supabaseAdmin
      .from('profiles')
      .select('id, email, plan, weekly_email_enabled')
      .eq('plan', 'free')
      .neq('weekly_email_enabled', false)
      .gte('created_at', rangeStart.toISOString())
      .lte('created_at', rangeEnd.toISOString());

    if (error || !users) continue;

    for (const user of users) {
      if (!(await isUserEligible(user.id, user))) {
        results.skipped++;
        continue;
      }
      if (await alreadySent(user.id, stage)) {
        results.skipped++;
        continue;
      }

      const email = generator(user.email, examDays);
      const sendResult = await sendEmail(user.email, email.subject, email.html);
      if (sendResult.ok) {
        await markSent(user.id, stage);
        results[stage] = (results[stage] || 0) + 1;
      } else {
        results.failed++;
      }
      await new Promise((r) => setTimeout(r, SEND_INTERVAL_MS));
    }
  }
}

/** 3日サボリ引き戻し: last_study_at が 72-96h 前 */
async function processInactive3d(now, examDays, results) {
  const lo = new Date(now.getTime() - 96 * 60 * 60 * 1000); // 96時間前
  const hi = new Date(now.getTime() - 72 * 60 * 60 * 1000); // 72時間前

  const { data: stats, error } = await supabaseAdmin
    .from('study_stats')
    .select('user_id, last_study_at')
    .gte('last_study_at', lo.toISOString())
    .lte('last_study_at', hi.toISOString())
    .limit(500);

  if (error || !stats) return;

  for (const s of stats) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('email, weekly_email_enabled')
      .eq('id', s.user_id)
      .maybeSingle();
    if (!profile) {
      results.skipped++;
      continue;
    }
    if (!(await isUserEligible(s.user_id, profile))) {
      results.skipped++;
      continue;
    }
    // クールダウン 7日 (168時間)
    if (await lastSentWithin(s.user_id, 'inactive_3d', 168)) {
      results.skipped++;
      continue;
    }

    const email = emailInactive3d(examDays);
    const sendResult = await sendEmail(profile.email, email.subject, email.html);
    if (sendResult.ok) {
      await markSent(s.user_id, 'inactive_3d');
      results.inactive_3d = (results.inactive_3d || 0) + 1;
    } else {
      results.failed++;
    }
    await new Promise((r) => setTimeout(r, SEND_INTERVAL_MS));
  }
}

/** カウントダウン: examDays が 30/14/7/3/1 の日のみ全員配信 */
async function processCountdown(_now, examDays, results) {
  const milestones = [30, 14, 7, 3, 1];
  if (!milestones.includes(examDays)) return;

  const examYear = getExamYear();
  const stage = `countdown_${examDays}_${examYear}`;

  // ページネーション: 1000件ずつ取得
  const PAGE_SIZE = 1000;
  let from = 0;
  while (true) {
    const { data: users, error } = await supabaseAdmin
      .from('profiles')
      .select('id, email, weekly_email_enabled')
      .neq('weekly_email_enabled', false)
      .range(from, from + PAGE_SIZE - 1);

    if (error || !users || users.length === 0) break;

    for (const user of users) {
      if (!(await isUserEligible(user.id, user))) {
        results.skipped++;
        continue;
      }
      if (await alreadySent(user.id, stage)) {
        results.skipped++;
        continue;
      }

      const email = emailCountdown(examDays);
      const sendResult = await sendEmail(user.email, email.subject, email.html);
      if (sendResult.ok) {
        await markSent(user.id, stage);
        const key = `countdown_${examDays}`;
        results[key] = (results[key] || 0) + 1;
      } else {
        results.failed++;
      }
      await new Promise((r) => setTimeout(r, SEND_INTERVAL_MS));
    }

    if (users.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
}

/** ストリーク危機: last_study_at が 18-24h 前 + streak ≥ 3 */
async function processStreakDanger(now, _examDays, results) {
  const lo = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24時間前
  const hi = new Date(now.getTime() - 18 * 60 * 60 * 1000); // 18時間前

  const { data: stats, error } = await supabaseAdmin
    .from('study_stats')
    .select('user_id, last_study_at, streak')
    .gte('last_study_at', lo.toISOString())
    .lte('last_study_at', hi.toISOString())
    .gte('streak', 3)
    .limit(500);

  if (error || !stats) return;

  for (const s of stats) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('email, weekly_email_enabled')
      .eq('id', s.user_id)
      .maybeSingle();
    if (!profile) {
      results.skipped++;
      continue;
    }
    if (!(await isUserEligible(s.user_id, profile))) {
      results.skipped++;
      continue;
    }
    // クールダウン 18時間
    if (await lastSentWithin(s.user_id, 'streak_danger', 18)) {
      results.skipped++;
      continue;
    }

    const email = emailStreakDanger(s.streak);
    const sendResult = await sendEmail(profile.email, email.subject, email.html);
    if (sendResult.ok) {
      await markSent(s.user_id, 'streak_danger');
      results.streak_danger = (results.streak_danger || 0) + 1;
    } else {
      results.failed++;
    }
    await new Promise((r) => setTimeout(r, SEND_INTERVAL_MS));
  }
}

// ─────────────────────────────────────────────
// メインハンドラー
// ─────────────────────────────────────────────
module.exports = async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const providedSecret = authHeader.replace('Bearer ', '');
  if (!CRON_SECRET || !timingSafeEqual(providedSecret, CRON_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const examDays = daysUntilExam();
    const now = new Date();
    const results = {
      day3: 0, day7: 0, day14: 0,
      inactive_3d: 0, streak_danger: 0,
      countdown_30: 0, countdown_14: 0, countdown_7: 0, countdown_3: 0, countdown_1: 0,
      skipped: 0, failed: 0,
    };

    // 1. オンボーディング（plan=free のみ）
    await processOnboarding(now, examDays, results);

    // 2. エンゲージメント（全プラン）
    await processInactive3d(now, examDays, results);
    await processCountdown(now, examDays, results);
    await processStreakDanger(now, examDays, results);

    console.log('[drip] Completed:', { examDays, ...results });
    return res.status(200).json({ ok: true, examDays, results });
  } catch (e) {
    console.error('[drip] Error:', e.message, e.stack);
    return res.status(500).json({ error: 'Internal error' });
  }
};
