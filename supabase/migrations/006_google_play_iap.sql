-- ============================================================
-- Google Play Billing 対応のためのスキーマ拡張
-- ============================================================
-- 1. profiles に Google Play 用カラム追加
-- 2. iap_purchases テーブル新規作成（重複検出・監査用）
-- 3. payment_provider に 'google_play' を許容
-- ============================================================

-- 1. profiles 拡張
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS google_play_purchase_token TEXT,
  ADD COLUMN IF NOT EXISTS google_play_product_id TEXT;

-- payment_provider の CHECK 制約を更新（既存の制約名を確認して付け替え）
DO $$
BEGIN
  -- 既存制約があれば削除
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'profiles'
      AND constraint_name LIKE '%payment_provider%check%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE public.profiles DROP CONSTRAINT ' || tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
      WHERE ccu.table_name = 'profiles'
        AND ccu.column_name = 'payment_provider'
        AND tc.constraint_type = 'CHECK'
      LIMIT 1
    );
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_payment_provider_check
  CHECK (payment_provider IS NULL OR payment_provider IN ('paypal', 'payjp', 'google_play', 'apple'));

-- 2. iap_purchases テーブル
-- 重複利用防止と監査ログを兼ねる
CREATE TABLE IF NOT EXISTS public.iap_purchases (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('android', 'ios')),
  product_id TEXT NOT NULL,
  purchase_token TEXT NOT NULL,
  order_id TEXT,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 同一プラットフォーム内で同じトークンは1ユーザーのみ使用可能
  UNIQUE (platform, purchase_token)
);

CREATE INDEX IF NOT EXISTS idx_iap_purchases_user
  ON public.iap_purchases(user_id);

CREATE INDEX IF NOT EXISTS idx_iap_purchases_token
  ON public.iap_purchases(platform, purchase_token);

-- RLS: ユーザーは自分の購入記録のみ参照可能
ALTER TABLE public.iap_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "iap_purchases_select_own" ON public.iap_purchases;
CREATE POLICY "iap_purchases_select_own"
  ON public.iap_purchases FOR SELECT
  USING (auth.uid() = user_id);

-- service_role からは全アクセス（API endpoint 経由）
DROP POLICY IF EXISTS "iap_purchases_service_role" ON public.iap_purchases;
CREATE POLICY "iap_purchases_service_role"
  ON public.iap_purchases FOR ALL
  USING (auth.role() = 'service_role'::text);

-- 3. profiles_update_own_safe ポリシーを更新
-- 新カラム（google_play_*）はユーザー自身が更新できないように保護
-- ※ 既存のセキュリティ制約に新カラムを追加
DO $$
DECLARE
  v_policy_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_update_own_safe'
  ) INTO v_policy_exists;

  IF v_policy_exists THEN
    DROP POLICY profiles_update_own_safe ON public.profiles;
  END IF;
END $$;

CREATE POLICY profiles_update_own_safe ON public.profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (
  (auth.uid() = id)
  -- 課金関連は全て service_role 経由のみ更新可能
  AND (plan = (SELECT p.plan FROM profiles p WHERE p.id = auth.uid()))
  AND (subscription_status IS NOT DISTINCT FROM (SELECT p.subscription_status FROM profiles p WHERE p.id = auth.uid()))
  AND (payment_provider IS NOT DISTINCT FROM (SELECT p.payment_provider FROM profiles p WHERE p.id = auth.uid()))
  AND (paypal_subscription_id IS NOT DISTINCT FROM (SELECT p.paypal_subscription_id FROM profiles p WHERE p.id = auth.uid()))
  AND (paypal_subscriber_id IS NOT DISTINCT FROM (SELECT p.paypal_subscriber_id FROM profiles p WHERE p.id = auth.uid()))
  AND (google_play_purchase_token IS NOT DISTINCT FROM (SELECT p.google_play_purchase_token FROM profiles p WHERE p.id = auth.uid()))
  AND (google_play_product_id IS NOT DISTINCT FROM (SELECT p.google_play_product_id FROM profiles p WHERE p.id = auth.uid()))
  AND (subscription_ends_at IS NOT DISTINCT FROM (SELECT p.subscription_ends_at FROM profiles p WHERE p.id = auth.uid()))
  AND (trial_ends_at IS NOT DISTINCT FROM (SELECT p.trial_ends_at FROM profiles p WHERE p.id = auth.uid()))
  -- AI 利用カウンターも保護（既存）
  AND (ai_used_today = (SELECT p.ai_used_today FROM profiles p WHERE p.id = auth.uid()))
  AND (ai_used_date IS NOT DISTINCT FROM (SELECT p.ai_used_date FROM profiles p WHERE p.id = auth.uid()))
  AND (ai_last_request_at IS NOT DISTINCT FROM (SELECT p.ai_last_request_at FROM profiles p WHERE p.id = auth.uid()))
);
