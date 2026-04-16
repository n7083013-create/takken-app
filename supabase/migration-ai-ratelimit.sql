-- ============================================================
-- AI レートリミット用カラム追加マイグレーション
-- Supabase SQL Editor で実行してください
-- ============================================================

-- AI利用回数の日次カウンターとクールダウン用タイムスタンプを追加
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_used_today INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_used_date DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS ai_last_request_at TIMESTAMPTZ;

-- ============================================================
-- RLS ポリシーの更新
-- migration-security-fix.sql の profiles_update_own_safe ポリシーに
-- ai_used_today, ai_used_date, ai_last_request_at を保護カラムとして追加
-- これらのカラムはユーザーが直接更新できず、service_role のみ更新可能
-- ============================================================

-- 既存の安全なポリシーを削除して、ai カラムの保護を追加した版に置き換え
DROP POLICY IF EXISTS "profiles_update_own_safe" ON public.profiles;

CREATE POLICY "profiles_update_own_safe"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    -- 課金関連カラムが変更されていないことを保証
    plan = (SELECT plan FROM public.profiles WHERE id = auth.uid())
    AND subscription_status = (SELECT subscription_status FROM public.profiles WHERE id = auth.uid())
    AND payjp_customer_id IS NOT DISTINCT FROM (SELECT payjp_customer_id FROM public.profiles WHERE id = auth.uid())
    AND payjp_subscription_id IS NOT DISTINCT FROM (SELECT payjp_subscription_id FROM public.profiles WHERE id = auth.uid())
    -- AI利用カウンター関連カラムが変更されていないことを保証
    AND ai_used_today = (SELECT ai_used_today FROM public.profiles WHERE id = auth.uid())
    AND ai_used_date IS NOT DISTINCT FROM (SELECT ai_used_date FROM public.profiles WHERE id = auth.uid())
    AND ai_last_request_at IS NOT DISTINCT FROM (SELECT ai_last_request_at FROM public.profiles WHERE id = auth.uid())
  );
