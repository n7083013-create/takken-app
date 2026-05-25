-- ============================================================
-- Migration 010: question_review_log
-- ============================================================
-- 管理者による問題レビュー結果の記録テーブル。
-- /admin/review 画面から POST されるレビュー結果（OK / flagged）を蓄積し、
-- 次回リリース時に静的データの needsReview=false 化判定に使う。
--
-- セキュリティ:
--   - RLS 有効化 + 全 SELECT/INSERT/UPDATE/DELETE を service_only ポリシーで拒否。
--     アクセスは SUPABASE_SERVICE_ROLE_KEY を持つ /api/admin/stats からのみ。
--
-- 手動実行: Supabase ダッシュボード → SQL Editor で本ファイルを貼り付け実行。

CREATE TABLE IF NOT EXISTS public.question_review_log (
  id BIGSERIAL PRIMARY KEY,
  reviewer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  question_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'flagged')),
  note TEXT,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS question_review_log_qid_idx
  ON public.question_review_log(question_id);

CREATE INDEX IF NOT EXISTS question_review_log_reviewer_idx
  ON public.question_review_log(reviewer_user_id);

ALTER TABLE public.question_review_log ENABLE ROW LEVEL SECURITY;

-- 通常クライアントからの直接アクセスを完全遮断（service_role のみ）
DROP POLICY IF EXISTS service_only ON public.question_review_log;
CREATE POLICY service_only
  ON public.question_review_log
  FOR ALL
  USING (false)
  WITH CHECK (false);
