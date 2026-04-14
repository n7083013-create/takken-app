// ============================================================
// サブスクリプション状態確認 API
// Vercel Serverless Function
// GET /api/check-subscription?email=xxx
// ============================================================

const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ error: 'email is required' });
  }

  try {
    // メールアドレスで顧客を検索
    const customers = await stripe.customers.list({
      email: email,
      limit: 1,
    });

    if (customers.data.length === 0) {
      return res.status(200).json({
        isPro: false,
        plan: 'free',
        message: 'No subscription found',
      });
    }

    const customer = customers.data[0];

    // アクティブなサブスクリプションを検索
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'active',
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      return res.status(200).json({
        isPro: false,
        plan: 'free',
        message: 'No active subscription',
      });
    }

    const sub = subscriptions.data[0];

    return res.status(200).json({
      isPro: true,
      plan: 'standard',
      subscriptionId: sub.id,
      currentPeriodEnd: sub.current_period_end,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    });
  } catch (err) {
    console.error('[CheckSub] Error:', err.message);
    return res.status(500).json({
      error: 'サブスクリプションの確認に失敗しました',
    });
  }
};
