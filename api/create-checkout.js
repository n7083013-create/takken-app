// ============================================================
// Stripe Checkout Session 作成 API
// Vercel Serverless Function
// POST /api/create-checkout
// ============================================================

const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// 3プランの価格ID
const PRICES = {
  monthly: 'price_1TM0DBPtS2nqGfswCPQYrL1Z',   // 月額 980円
  pack6: 'price_1TM0EBPtS2nqGfswZL2Vk6Fb',      // 合格パック 3,900円/6ヶ月
  yearly: 'price_1TM0FwPtS2nqGfswKi3rXYzM',      // 年間 5,800円
};

const PLAN_NAMES = {
  monthly: '月額プラン',
  pack6: '合格パック',
  yearly: '年間プラン',
};

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { plan, userId, email, successUrl, cancelUrl } = req.body;

    const priceId = PRICES[plan];
    if (!priceId) {
      return res.status(400).json({
        error: '無効なプランです。monthly / pack6 / yearly を指定してください',
      });
    }

    const baseUrl = req.headers.origin || 'https://dist-psi-eight-34.vercel.app';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      customer_email: email || undefined,
      client_reference_id: userId || undefined,
      success_url: successUrl || `${baseUrl}/?checkout=success&plan=${plan}`,
      cancel_url: cancelUrl || `${baseUrl}/?checkout=cancel`,
      metadata: {
        userId: userId || '',
        plan: plan,
        planName: PLAN_NAMES[plan] || '',
      },
      locale: 'ja',
      subscription_data: {
        metadata: {
          userId: userId || '',
          plan: plan,
        },
      },
      // 合格パックは自動更新しない（6ヶ月で完了）
      ...(plan === 'pack6' ? {
        subscription_data: {
          metadata: { userId: userId || '', plan: plan },
        },
      } : {}),
    });

    return res.status(200).json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (err) {
    console.error('[Stripe] Checkout error:', err.message);
    return res.status(500).json({
      error: '決済セッションの作成に失敗しました',
    });
  }
};
