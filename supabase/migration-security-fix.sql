-- ============================================================
-- セキュリティ修正マイグレーション
-- Supabase SQL Editor で実行してください
-- ============================================================

-- [FIX H2] ユーザーが plan / subscription 系カラムを直接更新できないようにする
-- 既存の profiles_update_own ポリシーを削除して、安全なものに置き換え

-- 旧ポリシーを削除
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

-- 新ポリシー: ユーザーは自分の display_name と settings 系のみ更新可
-- plan, subscription_status, payjp_* はサーバーサイド(service_role)のみ更新可
CREATE POLICY "profiles_update_own_safe"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    -- 課金関連カラムが変更されていないことを保証
    plan = (SELECT plan FROM public.profiles WHERE id = auth.uid())
    AND subscription_status = (SELECT subscription_status FROM public.profiles WHERE id = auth.uid())
    AND payjp_customer_id IS NOT DISTINCT FROM (SELECT payjp_customer_id FROM public.profiles WHERE id = auth.uid())
    AND payjp_subscription_id IS NOT DISTINCT FROM (SELECT payjp_subscription_id FROM public.profiles WHERE id = auth.uid())
  );

-- [FIX L4] subscription_status に 'paused' と 'creating' を追加
-- まず既存のCHECK制約があれば削除（制約名は環境による）
DO $$
BEGIN
  -- CHECK制約を削除（存在する場合のみ）
  ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_subscription_status_check;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- 新しいCHECK制約を追加
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_subscription_status_check
  CHECK (subscription_status IN ('none', 'creating', 'trialing', 'active', 'past_due', 'paused', 'canceled'));
