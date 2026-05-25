-- ============================================================
-- お問い合わせ・フィードバック履歴テーブル
-- ============================================================
-- C4: サポートフロー実装
-- App内 /feedback から送信された問い合わせの履歴保存とレート制限用
-- ============================================================

CREATE TABLE IF NOT EXISTS public.feedback_submissions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN ('bug', 'feature', 'question', 'other')),
  body TEXT NOT NULL,
  contact_email TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feedback_submissions_user_time_idx
  ON public.feedback_submissions(user_id, submitted_at DESC);

ALTER TABLE public.feedback_submissions ENABLE ROW LEVEL SECURITY;

-- service_role のみアクセス可能（クライアントから直接読み書きしない）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'feedback_submissions'
      AND policyname = 'service_only'
  ) THEN
    CREATE POLICY service_only ON public.feedback_submissions
      FOR ALL USING (false) WITH CHECK (false);
  END IF;
END $$;
