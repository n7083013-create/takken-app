-- Performance index for webhook customer lookups
CREATE INDEX IF NOT EXISTS idx_profiles_payjp_customer
  ON public.profiles(payjp_customer_id)
  WHERE payjp_customer_id IS NOT NULL;

-- Ensure composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_qp_next_review
  ON public.question_progress(user_id, next_review_at)
  WHERE next_review_at IS NOT NULL;
