-- ============================================================
-- PayPal Subscriptions 対応マイグレーション
-- Supabase SQL Editor で実行してください
-- ============================================================
-- PAY.JP カラムはそのまま残し、PayPal 用に新規追加
-- どちらの決済が通っても対応できる構造

-- 1. profiles に PayPal 関連カラム追加
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS paypal_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS paypal_subscriber_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_provider TEXT DEFAULT 'paypal'
    CHECK (payment_provider IN ('payjp', 'paypal', 'none'));

-- 2. PayPal Subscription ID で高速検索するためのインデックス
CREATE INDEX IF NOT EXISTS idx_profiles_paypal_sub
  ON public.profiles(paypal_subscription_id)
  WHERE paypal_subscription_id IS NOT NULL;

-- 3. RLS: profiles_update_own_safe ポリシーを PayPal 列保護込みで再作成
DROP POLICY IF EXISTS profiles_update_own_safe ON public.profiles;

CREATE POLICY profiles_update_own_safe ON public.profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (
  (auth.uid() = id)
  AND (plan = (SELECT p.plan FROM profiles p WHERE p.id = auth.uid()))
  AND (subscription_status = (SELECT p.subscription_status FROM profiles p WHERE p.id = auth.uid()))
  AND (NOT (payjp_customer_id IS DISTINCT FROM (SELECT p.payjp_customer_id FROM profiles p WHERE p.id = auth.uid())))
  AND (NOT (payjp_subscription_id IS DISTINCT FROM (SELECT p.payjp_subscription_id FROM profiles p WHERE p.id = auth.uid())))
  AND (NOT (paypal_subscription_id IS DISTINCT FROM (SELECT p.paypal_subscription_id FROM profiles p WHERE p.id = auth.uid())))
  AND (NOT (paypal_subscriber_id IS DISTINCT FROM (SELECT p.paypal_subscriber_id FROM profiles p WHERE p.id = auth.uid())))
  AND (NOT (payment_provider IS DISTINCT FROM (SELECT p.payment_provider FROM profiles p WHERE p.id = auth.uid())))
  AND (NOT (trial_ends_at IS DISTINCT FROM (SELECT p.trial_ends_at FROM profiles p WHERE p.id = auth.uid())))
  AND (NOT (subscription_ends_at IS DISTINCT FROM (SELECT p.subscription_ends_at FROM profiles p WHERE p.id = auth.uid())))
  AND (ai_used_today = (SELECT p.ai_used_today FROM profiles p WHERE p.id = auth.uid()))
  AND (NOT (ai_used_date IS DISTINCT FROM (SELECT p.ai_used_date FROM profiles p WHERE p.id = auth.uid())))
  AND (NOT (ai_last_request_at IS DISTINCT FROM (SELECT p.ai_last_request_at FROM profiles p WHERE p.id = auth.uid())))
  -- weekly_email_enabled は本人が自由に変更可能
);
