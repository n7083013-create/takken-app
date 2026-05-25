-- ============================================================
-- ドリップキャンペーン: 送信済み記録テーブル
-- Supabase SQL Editor で実行
-- ============================================================

CREATE TABLE IF NOT EXISTS public.drip_sent (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('day3', 'day7', 'day14', 'free_limit')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, stage)
);

-- RLS 有効化（service_role のみ読み書き可能・ユーザーは自分の送信履歴さえ見れない）
ALTER TABLE public.drip_sent ENABLE ROW LEVEL SECURITY;

-- service_role だけフルアクセス
CREATE POLICY "Service role full access drip_sent"
  ON public.drip_sent FOR ALL
  USING (auth.role() = 'service_role'::text);

-- インデックス（配信時の高速検索）
CREATE INDEX IF NOT EXISTS idx_drip_sent_user ON public.drip_sent(user_id);
