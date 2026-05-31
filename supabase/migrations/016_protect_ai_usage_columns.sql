-- ============================================================
-- AI 利用カウンタ列の自己改ざん防止 (RLS WITH CHECK 拡張)
-- ============================================================
-- 背景 (exam-security 監査 Low / 2026-05-31):
--   immutable_payment_columns (007_apple_iap.sql / 008_fix_rls_bypass_and_indexes.sql) は
--   plan / subscription_* / paypal_* / google_play_* / apple_* の課金系列を
--   「本人 UPDATE で変更不可」に固定していたが、AI 日次利用カウンタ
--   (ai_used_today / ai_used_date / ai_last_request_at) は WITH CHECK に含まれていなかった。
--   → 認証済みユーザーが anon key で自分の ai_used_today を 0 に書き戻し、
--     1日の AI 利用上限 (無料3 / 有料50) を超えて利用できる穴があった。
--     CWE-639 (Authorization Bypass Through User-Controlled Key) / OWASP API3:2023。
--     ※ プラン昇格・課金バイパスは不可 (plan 等は既に保護済) = 影響は API コスト増のみ (Low)。
--
-- 安全性の根拠 (この保護で正規挙動を壊さない):
--   1. カウンタの真値はサーバーが管理。increment_ai_usage RPC は SECURITY DEFINER
--      (004_fix_ai_ratelimit_rpc.sql:15) なので RLS を迂回して正規に更新でき、本ポリシーの影響を受けない。
--   2. クライアント (store/services/app) は ai_used_* を profiles へ直接 UPDATE しない (確認済み)。
--      よって本人 UPDATE をこれらの列で固定しても既存のクライアント挙動は壊れない。
--
-- 対策: immutable_payment_columns を作り直し、AI カウンタ 3 列を WITH CHECK に追加。
-- ※ 冪等: 既存ポリシーを DROP してから CREATE。007 / 008 のどちらが適用済みでも最新保護に統一される。
--
-- 本番適用前に Supabase Dashboard で profiles のバックアップ取得を推奨。
-- 適用後の手動検証: 一般ユーザーの JWT で
--   UPDATE profiles SET ai_used_today = 0 WHERE id = auth.uid();
-- が 0 行更新 (WITH CHECK 違反で拒否) になること。AI 質問は従来どおり使えること。
-- ============================================================

DROP POLICY IF EXISTS immutable_payment_columns ON public.profiles;

CREATE POLICY immutable_payment_columns ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- 課金系列 (007/008 から維持)
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
    -- [016 追加] AI 利用カウンタ。真値はサーバー RPC (SECURITY DEFINER) が更新。本人 UPDATE では改変不可。
    AND (ai_used_today IS NOT DISTINCT FROM (SELECT p.ai_used_today FROM profiles p WHERE p.id = auth.uid()))
    AND (ai_used_date IS NOT DISTINCT FROM (SELECT p.ai_used_date FROM profiles p WHERE p.id = auth.uid()))
    AND (ai_last_request_at IS NOT DISTINCT FROM (SELECT p.ai_last_request_at FROM profiles p WHERE p.id = auth.uid()))
  );
