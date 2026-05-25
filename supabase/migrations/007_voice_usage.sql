-- ============================================================
-- 音声入力用の使用量カラム + RPC 関数
-- /api/voice-transcribe からアトミックに呼ぶ
-- 1日上限 + クールダウン + カウンタ加算 を 1 SQL トランザクションで処理
-- ============================================================

-- profiles テーブルに音声使用量カラムを追加
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS voice_used_today INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS voice_used_date DATE,
  ADD COLUMN IF NOT EXISTS voice_last_request_at TIMESTAMPTZ;

-- 原子的に上限チェック + インクリメント
-- 戻り値: -2=クールダウン中, -1=上限到達, >0=新カウント
CREATE OR REPLACE FUNCTION public.increment_voice_usage(
  p_user_id UUID,
  p_limit INTEGER,
  p_cooldown_ms INTEGER DEFAULT 1000
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
  -- まずクールダウンチェック（連続リクエスト間隔）
  SELECT EXTRACT(EPOCH FROM (NOW() - voice_last_request_at)) * 1000
    INTO v_last_request_elapsed
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_last_request_elapsed IS NOT NULL AND v_last_request_elapsed < p_cooldown_ms THEN
    RETURN -2;  -- クールダウン中
  END IF;

  -- アトミックにカウントを更新（上限チェック込み）
  UPDATE public.profiles
  SET
    voice_used_today = CASE
      WHEN voice_used_date = v_today THEN voice_used_today + 1
      ELSE 1
    END,
    voice_used_date = v_today,
    voice_last_request_at = NOW()
  WHERE id = p_user_id
    AND (
      voice_used_date IS NULL
      OR voice_used_date <> v_today
      OR voice_used_today < p_limit
    )
  RETURNING voice_used_today INTO v_new_count;

  IF v_new_count IS NULL THEN
    RETURN -1;  -- 上限到達
  END IF;

  RETURN v_new_count;
END;
$$;

-- service_role には自動付与される。authenticated にも明示的に許可（将来 RLS 経由用）。
GRANT EXECUTE ON FUNCTION public.increment_voice_usage(UUID, INTEGER, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.increment_voice_usage IS
  '音声入力 (/api/voice-transcribe) のレート制限。Premium ユーザーのみ呼び出される前提。';
