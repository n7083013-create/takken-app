-- ============================================================
-- AI レート制限の原子的増分 RPC
-- TOCTOU レース状態を防ぐ（並列リクエストでの制限回避を防止）
-- ============================================================

-- 1日あたりの使用量を原子的にインクリメント
-- 成功時: 新しいカウント値 (>0)
-- 上限到達時: -1
-- クールダウン中: -2
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
  v_today TEXT := TO_CHAR(NOW(), 'YYYY-MM-DD');
  v_new_count INTEGER;
  v_last_request_elapsed INTEGER;
BEGIN
  -- 行ロックで並列リクエスト対策
  -- WHERE句で同時にクールダウン/制限チェックを行い、満たした行のみUPDATE
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
      -- クールダウン条件: 前回リクエストから p_cooldown_ms 以上経過
      ai_last_request_at IS NULL
      OR EXTRACT(EPOCH FROM (NOW() - ai_last_request_at)) * 1000 >= p_cooldown_ms
    )
    AND (
      -- 上限条件: 今日の使用量が上限未満
      ai_used_date != v_today
      OR COALESCE(ai_used_today, 0) < p_limit
    )
  RETURNING ai_used_today INTO v_new_count;

  -- 更新されなかった場合、原因を特定
  IF v_new_count IS NULL THEN
    -- クールダウン or 上限到達かチェック
    SELECT EXTRACT(EPOCH FROM (NOW() - ai_last_request_at)) * 1000::INTEGER
    INTO v_last_request_elapsed
    FROM public.profiles
    WHERE id = p_user_id;

    IF v_last_request_elapsed IS NOT NULL AND v_last_request_elapsed < p_cooldown_ms THEN
      RETURN -2;  -- クールダウン中
    END IF;
    RETURN -1;  -- 上限到達
  END IF;

  RETURN v_new_count;
END;
$$;

-- 権限設定: 認証済みユーザーのみ呼び出し可能
REVOKE ALL ON FUNCTION public.increment_ai_usage FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_ai_usage TO authenticated, service_role;

COMMENT ON FUNCTION public.increment_ai_usage IS
  'AI使用量を原子的にインクリメント。TOCTOUレース対策。成功時=新カウント値、-1=上限、-2=クールダウン中';
