-- ============================================================
-- トライアル履歴テーブル（不正利用防止）
-- Supabase SQL Editor で実行してください
-- ============================================================
-- アカウント削除しても履歴が残る独立テーブル
-- 同じメアドで再登録しても無料トライアルを再利用できないようにする

CREATE TABLE IF NOT EXISTS public.trial_history (
  email_hash TEXT PRIMARY KEY,                            -- メアドのSHA-256ハッシュ
  paypal_subscriber_id TEXT,                              -- PayPal側の subscriber/payer ID
  first_trial_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),      -- 初回トライアル日時
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),        -- 最終利用日時
  trial_count INTEGER NOT NULL DEFAULT 1                  -- 累計トライアル使用回数
);

-- RLS を有効化（service_role のみ読み書き可能）
ALTER TABLE public.trial_history ENABLE ROW LEVEL SECURITY;

-- service_role 以外は完全アクセス不可
CREATE POLICY "Service role only access trial_history"
  ON public.trial_history FOR ALL
  USING (auth.role() = 'service_role'::text);

-- PayPal subscriber_id でも検索できるようにインデックス
CREATE INDEX IF NOT EXISTS idx_trial_history_paypal_sub
  ON public.trial_history(paypal_subscriber_id)
  WHERE paypal_subscriber_id IS NOT NULL;
