// ============================================================
// Stripe Webhook Handler
// Vercel Serverless Function
// POST /api/webhook
// サブスクリプションの状態変更を受け取る
// ============================================================

const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Vercel では body を raw で受け取る設定が必要
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let event;

  try {
    const rawBody = await getRawBody(req);
    const sig = req.headers['stripe-signature'];

    if (endpointSecret) {
      event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
    } else {
      // テスト環境: signature検証をスキップ
      event = JSON.parse(rawBody.toString());
    }
  } catch (err) {
    console.error('[Webhook] Signature verification failed:', err.message);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  // イベント処理
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      console.log('[Webhook] Checkout completed:', {
        userId: session.metadata?.userId,
        email: session.customer_email,
        subscriptionId: session.subscription,
      });
      // TODO: Supabase の profiles テーブルを更新
      // await supabase.from('profiles').update({ plan: 'standard', stripe_subscription_id: session.subscription }).eq('id', session.metadata.userId);
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      console.log('[Webhook] Subscription updated:', {
        status: subscription.status,
        userId: subscription.metadata?.userId,
      });
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      console.log('[Webhook] Subscription cancelled:', {
        userId: subscription.metadata?.userId,
      });
      // TODO: プランをfreeに戻す
      // await supabase.from('profiles').update({ plan: 'free' }).eq('stripe_subscription_id', subscription.id);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      console.log('[Webhook] Payment failed:', {
        customer: invoice.customer,
      });
      break;
    }

    default:
      console.log('[Webhook] Unhandled event:', event.type);
  }

  return res.status(200).json({ received: true });
};
