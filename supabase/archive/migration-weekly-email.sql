-- ============================================================
-- profiles テーブルに週次メール受信設定を追加
-- Supabase SQL Editor で実行してください
-- ============================================================

-- 1. weekly_email_enabled 列を追加（デフォルト true = opt-out 方式）
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS weekly_email_enabled BOOLEAN NOT NULL DEFAULT true;

-- 2. 既存ユーザーは全員オプトイン状態（デフォルト値で OK）
-- 新規ユーザーも自動で true（opt-in 済み扱い）
--   ※ 法的には特商法に違反しない範囲で「有益な学習レポート」として送信

-- 3. RLS: ユーザー自身のみ更新可能
-- 既存の profiles_update_own_safe ポリシーで保護済み
-- （plan や subscription_status を書き換えられない仕組みを流用可能）

-- 4. WITH CHECK を更新（weekly_email_enabled の変更は本人に許可）
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
  AND (NOT (trial_ends_at IS DISTINCT FROM (SELECT p.trial_ends_at FROM profiles p WHERE p.id = auth.uid())))
  AND (NOT (subscription_ends_at IS DISTINCT FROM (SELECT p.subscription_ends_at FROM profiles p WHERE p.id = auth.uid())))
  AND (ai_used_today = (SELECT p.ai_used_today FROM profiles p WHERE p.id = auth.uid()))
  AND (NOT (ai_used_date IS DISTINCT FROM (SELECT p.ai_used_date FROM profiles p WHERE p.id = auth.uid())))
  AND (NOT (ai_last_request_at IS DISTINCT FROM (SELECT p.ai_last_request_at FROM profiles p WHERE p.id = auth.uid())))
  -- weekly_email_enabled は本人が自由に変更可能（制約なし）
);
