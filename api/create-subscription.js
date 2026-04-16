// ============================================================
// PAY.JP サブスクリプション作成 API
// POST /api/create-subscription
// 認証必須 — カードトークンを受け取り、顧客+定期課金を作成
// ============================================================

const payjp = require('payjp')(process.env.PAYJP_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const PLAN_ID = process.env.PAYJP_PLAN_ID; // PAY.JP ダッシュボードで作成したプランID

module.exports = async (req, res) => {
  // --- CORS ---
  const origin = req.headers.origin;
  const allowed = ['https://takken-app-olive.vercel.app'];
  if (allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // --- 認証チェック ---
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '認証が必要です' });
  }

  let userId = null;

  try {
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: '無効な認証トークンです' });
    }
    userId = user.id;

    // --- 入力バリデーション ---
    const { cardToken } = req.body || {};
    if (!cardToken || typeof cardToken !== 'string') {
      return res.status(400).json({ error: 'Invalid token' });
    }
    if (cardToken.length > 200) {
      return res.status(400).json({ error: 'Invalid token' });
    }

    // --- [FIX H1] 既存サブスクリプションチェック + 二重作成防止 ---
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('plan, payjp_customer_id, payjp_subscription_id')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.plan === 'standard' && profile?.payjp_subscription_id) {
      return res.status(400).json({ error: '既に有料プランに登録済みです' });
    }

    // 5分以上経過した 'creating' ロックを解除（タイムアウトリカバリー）
    // NOTE: profiles テーブルに updated_at カラム（自動更新）が必要
    await supabaseAdmin
      .from('profiles')
      .update({ subscription_status: 'none' })
      .eq('id', user.id)
      .eq('subscription_status', 'creating')
      .lt('updated_at', new Date(Date.now() - 5 * 60 * 1000).toISOString());

    // 処理中フラグで二重送信を防止（count: 'exact' で実際の更新行数を検証）
    const { error: lockError, count } = await supabaseAdmin
      .from('profiles')
      .update(
        { subscription_status: 'creating', updated_at: new Date().toISOString() },
        { count: 'exact' }
      )
      .eq('id', user.id)
      .in('subscription_status', ['none', 'canceled']);

    if (lockError || count === 0) {
      return res.status(409).json({ error: '既に処理中です。しばらくお待ちください。' });
    }

    // --- PAY.JP 顧客作成 (既存顧客がいればカード更新) ---
    let customerId = profile?.payjp_customer_id;
    if (customerId) {
      try {
        await payjp.customers.update(customerId, { card: cardToken });
      } catch {
        // 顧客が存在しない場合は新規作成
        const customer = await payjp.customers.create({
          email: user.email,
          card: cardToken,
        });
        customerId = customer.id;
      }
    } else {
      const customer = await payjp.customers.create({
        email: user.email,
        card: cardToken,
      });
      customerId = customer.id;
    }

    // --- サブスクリプション作成（7日間トライアル） ---
    const trialEnd = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
    const subscription = await payjp.subscriptions.create({
      customer: customerId,
      plan: PLAN_ID,
      trial_end: trialEnd,
    });

    // --- Supabase profiles 更新 ---
    const trialEndsAt = new Date(trialEnd * 1000).toISOString();
    await supabaseAdmin
      .from('profiles')
      .upsert({
        id: user.id,
        email: user.email,
        plan: 'standard',
        payjp_customer_id: customerId,
        payjp_subscription_id: subscription.id,
        subscription_status: 'trialing',
        trial_ends_at: trialEndsAt,
      }, { onConflict: 'id' });

    return res.status(200).json({
      success: true,
      subscriptionId: subscription.id,
      trialEndsAt,
    });
  } catch (err) {
    console.error('[CreateSub] Error:', err.message);

    // 'creating' ロック状態をロールバック（リトライ可能にする）
    if (userId) {
      try {
        await supabaseAdmin
          .from('profiles')
          .update({ subscription_status: 'none' })
          .eq('id', userId)
          .eq('subscription_status', 'creating');
      } catch (rollbackErr) {
        console.error('[CreateSub] Rollback failed:', rollbackErr.message);
      }
    }

    // PAY.JP のエラーコードに応じたメッセージ
    if (err.status === 402) {
      return res.status(400).json({ error: 'カードが拒否されました。別のカードをお試しください。' });
    }
    if (err.status === 400) {
      return res.status(400).json({ error: 'カード情報が無効です。' });
    }
    return res.status(500).json({ error: 'サブスクリプションの作成に失敗しました' });
  }
};
