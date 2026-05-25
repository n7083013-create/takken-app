-- ============================================================
-- 重大セキュリティ修正: profiles UPDATE RLS バイパス
-- + その他のインデックス改善
-- ============================================================
-- 背景:
--   001_init.sql で `profiles_update_own` ポリシーを `using (auth.uid() = id)` のみで定義
--   006 で `profiles_update_own_safe`（plan/payment_provider 等を保護する WITH CHECK 付き）を追加したが、
--   旧ポリシーを DROP していなかったため UPDATE 時に両ポリシーが OR で評価される。
--   結果: 任意のユーザーが anon key だけで自己プロフィールを更新するとき
--         旧ポリシーがマッチして payment 関連カラムを書き換え可能 = 課金バイパス。
--
-- 修正:
--   1) `profiles_update_own` を DROP
--   2) profiles のクライアント書き込み許可カラムを最小限に絞る WITH CHECK を再確認
--   3) iap_purchases / question_progress に高速検索インデックス追加（運用最適化）
-- ============================================================

-- 1. 課金バイパス可能な旧 RLS を DROP
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

-- 2. immutable_payment_columns（007 で再定義済み）の存在確認
--    存在しなければ再作成（万が一 007 が未適用環境向け）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'immutable_payment_columns'
  ) THEN
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
      );
  END IF;
END $$;

-- 3. 旧 profiles_update_own_safe が残っていれば DROP（006 適用環境向け清掃）
DROP POLICY IF EXISTS "profiles_update_own_safe" ON public.profiles;

-- 4. iap_purchases に user_id + verified_at の複合 index（rate-limit 高速化）
CREATE INDEX IF NOT EXISTS iap_purchases_user_verified_idx
  ON public.iap_purchases(user_id, verified_at DESC);

-- 5. question_progress に user_id + last_attempted_at の index（getTodayAnswered 高速化）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'question_progress'
      AND column_name = 'last_attempted_at'
  ) THEN
    CREATE INDEX IF NOT EXISTS question_progress_user_last_idx
      ON public.question_progress(user_id, last_attempted_at DESC);
  END IF;
END $$;

-- 6. iap verify-attempts 専用テーブル（rate-limit 信頼性向上 - Issue #5 対応）
--    iap_purchases.verified_at の upsert で巻き戻る問題を解消
CREATE TABLE IF NOT EXISTS public.iap_verify_attempts (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('android', 'ios')),
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ok BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS iap_verify_attempts_user_time_idx
  ON public.iap_verify_attempts(user_id, attempted_at DESC);
ALTER TABLE public.iap_verify_attempts ENABLE ROW LEVEL SECURITY;
-- service_role のみ read/write
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'iap_verify_attempts'
      AND policyname = 'service_only'
  ) THEN
    CREATE POLICY service_only ON public.iap_verify_attempts
      FOR ALL USING (false) WITH CHECK (false);
  END IF;
END $$;

-- 7. RTDN orphan event 用の deferred queue（Issue #12 対応）
--    verify-receipt 前に RTDN が来ても永続化しておき、後で reconcile
CREATE TABLE IF NOT EXISTS public.iap_pending_events (
  id BIGSERIAL PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('android', 'ios')),
  purchase_token TEXT NOT NULL,
  notification_type TEXT,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reconciled_at TIMESTAMPTZ,
  retry_count INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS iap_pending_events_token_idx
  ON public.iap_pending_events(platform, purchase_token);
CREATE INDEX IF NOT EXISTS iap_pending_events_unreconciled_idx
  ON public.iap_pending_events(received_at)
  WHERE reconciled_at IS NULL;
ALTER TABLE public.iap_pending_events ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'iap_pending_events'
      AND policyname = 'service_only'
  ) THEN
    CREATE POLICY service_only ON public.iap_pending_events
      FOR ALL USING (false) WITH CHECK (false);
  END IF;
END $$;

-- 8. PayPal subscription 作成ロック取得 RPC (Issue #6 対応)
--    .or() + count 方式は PostgREST バージョン依存で count=0 にならず素通りすることがある
--    SECURITY DEFINER で row lock を取って原子的に状態遷移させる
CREATE OR REPLACE FUNCTION public.acquire_paypal_creation_lock(
  p_user_id UUID,
  p_stale_ms INT DEFAULT 300000  -- 5 分以上前の creating は失効扱い
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_updated_at TIMESTAMPTZ;
  v_acquired BOOLEAN := false;
BEGIN
  -- FOR UPDATE で row lock を取得
  SELECT subscription_status, updated_at
    INTO v_status, v_updated_at
    FROM profiles
    WHERE id = p_user_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- 既に有料の場合はロック取得拒否
  IF v_status IN ('active', 'trialing', 'past_due') THEN
    RETURN false;
  END IF;

  -- creating 中で stale 期間内ならロック取得失敗（処理中扱い）
  IF v_status = 'creating' THEN
    IF v_updated_at IS NOT NULL
       AND (EXTRACT(EPOCH FROM (NOW() - v_updated_at)) * 1000) < p_stale_ms THEN
      RETURN false;
    END IF;
  END IF;

  -- ロック取得（none / canceled / 古い creating → creating へ）
  UPDATE profiles
    SET subscription_status = 'creating',
        updated_at = NOW()
    WHERE id = p_user_id;

  RETURN true;
END;
$$;

-- anon/authenticated には実行権限を与えない（service_role のみ）
REVOKE ALL ON FUNCTION public.acquire_paypal_creation_lock(UUID, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.acquire_paypal_creation_lock(UUID, INT) FROM authenticated;
REVOKE ALL ON FUNCTION public.acquire_paypal_creation_lock(UUID, INT) FROM anon;
