-- ============================================================
-- Apple App Store IAP サポート
-- ============================================================
-- profiles テーブルに Apple サブスクリプション識別子を追加
-- iap_purchases / payment_provider は既に google_play 同等の枠組み
-- (006_google_play_iap.sql) を再利用するため、構造変更は最小限
-- ============================================================

-- 1. profiles 拡張: Apple サブスクリプション識別子
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS apple_original_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS apple_product_id TEXT;

-- 同一 originalTransactionId を別ユーザーが申告できないように UNIQUE
-- ※ NULL は重複扱いされない（PostgreSQL のデフォルト挙動）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND indexname = 'profiles_apple_otid_unique'
  ) THEN
    CREATE UNIQUE INDEX profiles_apple_otid_unique
      ON public.profiles (apple_original_transaction_id)
      WHERE apple_original_transaction_id IS NOT NULL;
  END IF;
END $$;

-- 2. RLS の immutability 拡張
-- 既存ポリシー (006_google_play_iap.sql の immutable_payment_columns) では
-- apple_* カラムを保護していないため、UPDATE 時にユーザー自身で書き換え可能になっている。
-- service_role 経由でのみ更新できるよう RLS を強化する。
DO $$
BEGIN
  -- 既存の immutable_payment_columns ポリシーがあれば DROP（再作成のため）
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'immutable_payment_columns'
  ) THEN
    DROP POLICY immutable_payment_columns ON public.profiles;
  END IF;
END $$;

-- 再作成: Apple カラム保護を追加
CREATE POLICY immutable_payment_columns ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND (plan IS NOT DISTINCT FROM (SELECT p.plan FROM profiles p WHERE p.id = auth.uid()))
    AND (subscription_status IS NOT DISTINCT FROM (SELECT p.subscription_status FROM profiles p WHERE p.id = auth.uid()))
    AND (subscription_ends_at IS NOT DISTINCT FROM (SELECT p.subscription_ends_at FROM profiles p WHERE p.id = auth.uid()))
    AND (trial_ends_at IS NOT DISTINCT FROM (SELECT p.trial_ends_at FROM profiles p WHERE p.id = auth.uid()))
    AND (payment_provider IS NOT DISTINCT FROM (SELECT p.payment_provider FROM profiles p WHERE p.id = auth.uid()))
    AND (paypal_subscription_id IS NOT DISTINCT FROM (SELECT p.paypal_subscription_id FROM profiles p WHERE p.id = auth.uid()))
    AND (paypal_subscriber_id IS NOT DISTINCT FROM (SELECT p.paypal_subscriber_id FROM profiles p WHERE p.id = auth.uid()))
    AND (google_play_purchase_token IS NOT DISTINCT FROM (SELECT p.google_play_purchase_token FROM profiles p WHERE p.id = auth.uid()))
    AND (google_play_product_id IS NOT DISTINCT FROM (SELECT p.google_play_product_id FROM profiles p WHERE p.id = auth.uid()))
    AND (apple_original_transaction_id IS NOT DISTINCT FROM (SELECT p.apple_original_transaction_id FROM profiles p WHERE p.id = auth.uid()))
    AND (apple_product_id IS NOT DISTINCT FROM (SELECT p.apple_product_id FROM profiles p WHERE p.id = auth.uid()))
  );
