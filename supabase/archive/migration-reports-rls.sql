-- Restrict question_reports to authenticated users only
-- and enforce user_id matches auth.uid()
DROP POLICY IF EXISTS "reports_insert_any" ON public.question_reports;

CREATE POLICY "reports_insert_authenticated"
  ON public.question_reports FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  );

-- Add rate limiting: max 10 reports per user per day (enforced via unique constraint)
-- This prevents spam attacks
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_user_question_unique
  ON public.question_reports(user_id, question_id)
  WHERE resolved = false;
