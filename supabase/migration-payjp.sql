-- ============================================================
-- Stripe → PAY.JP 移行: カラム名変更
-- Supabase SQL Editor で実行してください
-- ============================================================

-- stripe_customer_id → payjp_customer_id
ALTER TABLE public.profiles
  RENAME COLUMN stripe_customer_id TO payjp_customer_id;

-- stripe_subscription_id → payjp_subscription_id
ALTER TABLE public.profiles
  RENAME COLUMN stripe_subscription_id TO payjp_subscription_id;

-- 既存データをクリア（Stripeのデータはもう無効）
UPDATE public.profiles
SET payjp_customer_id = NULL,
    payjp_subscription_id = NULL,
    plan = 'free',
    subscription_status = 'none',
    trial_ends_at = NULL,
    subscription_ends_at = NULL;
