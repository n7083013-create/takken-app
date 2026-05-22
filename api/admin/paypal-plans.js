// ============================================================
// GET /api/admin/paypal-plans
// PayPal プランのステータスを一覧表示する診断エンドポイント
// ADMIN_SECRET ヘッダー必須
// ============================================================

const { paypalFetch } = require('../_paypal-utils');

const PAYPAL_PLAN_MONTHLY = process.env.PAYPAL_PLAN_MONTHLY || process.env.PAYPAL_PLAN_ID;
const PAYPAL_PLAN_ANNUAL = process.env.PAYPAL_PLAN_ANNUAL;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // 管理者認証
  const secret = req.headers['x-admin-secret'] || req.query.secret;
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const results = {};

  for (const [key, planId] of [['monthly', PAYPAL_PLAN_MONTHLY], ['annual', PAYPAL_PLAN_ANNUAL]]) {
    if (!planId) {
      results[key] = { error: 'Plan ID not set in env vars' };
      continue;
    }
    try {
      const plan = await paypalFetch(`/v1/billing/plans/${planId}`, { method: 'GET' });
      results[key] = {
        id: plan.id,
        name: plan.name,
        status: plan.status,
        billing_cycles: plan.billing_cycles?.map((bc) => ({
          frequency: bc.frequency,
          total_cycles: bc.total_cycles,
          pricing: bc.pricing_scheme?.fixed_price,
        })),
      };
      // ACTIVE でなければ自動アクティベートを試みる
      if (plan.status === 'CREATED' || plan.status === 'INACTIVE') {
        try {
          await paypalFetch(`/v1/billing/plans/${planId}/activate`, { method: 'POST' });
          results[key].activated = true;
          results[key].status = 'ACTIVE (just activated)';
        } catch (ae) {
          results[key].activateError = ae.message;
        }
      }
    } catch (e) {
      results[key] = { error: e.message, planId };
    }
  }

  return res.status(200).json(results);
};
