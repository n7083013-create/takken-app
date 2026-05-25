-- ============================================================
-- increment_ai_usage RPC のバグ修正
-- 旧: v_today TEXT (TO_CHAR で生成) → DATE 列との比較で
--     "operator does not exist: date <> text" エラー
-- 新: v_today DATE := CURRENT_DATE で型を揃える
-- ============================================================

CREATE OR REPLACE FUNCTION public.increment_ai_usage(
  p_user_id UUID,
  p_limit INTEGER,
  p_cooldown_ms INTEGER DEFAULT 2000
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_new_count INTEGER;
  v_last_request_elapsed NUMERIC;
BEGIN
  UPDATE public.profiles
  SET
    ai_used_today = CASE
      WHEN ai_used_date = v_today THEN ai_used_today + 1
      ELSE 1
    END,
    ai_used_date = v_today,
    ai_last_request_at = NOW()
  WHERE id = p_user_id
    AND (
      ai_last_request_at IS NULL
      OR EXTRACT(EPOCH FROM (NOW() - ai_last_request_at)) * 1000 >= p_cooldown_ms
    )
    AND (
      ai_used_date IS DISTINCT FROM v_today
      OR COALESCE(ai_used_today, 0) < p_limit
    )
  RETURNING ai_used_today INTO v_new_count;

  IF v_new_count IS NULL THEN
    SELECT EXTRACT(EPOCH FROM (NOW() - ai_last_request_at)) * 1000
    INTO v_last_request_elapsed
    FROM public.profiles
    WHERE id = p_user_id;

    IF v_last_request_elapsed IS NOT NULL AND v_last_request_elapsed < p_cooldown_ms THEN
      RETURN -2;
    END IF;
    RETURN -1;
  END IF;

  RETURN v_new_count;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_ai_usage FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_ai_usage TO authenticated, service_role;
