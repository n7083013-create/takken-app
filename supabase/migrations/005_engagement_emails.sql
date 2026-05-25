-- ============================================================
-- エンゲージメントメール拡張
-- - 3日サボリ引き戻し (inactive_3d) — 同一ユーザーに繰り返し送信可
-- - 試験カウントダウン (countdown_30/14/7/3/1_<year>) — 年単位で1回
-- - ストリーク危機 (streak_danger) — クールダウン付きで繰り返し
--
-- 既存 drip_sent テーブルを拡張：
--   - PRIMARY KEY (user_id, stage) を解除（同一stageの再送可）
--   - CHECK 制約を解除（新stage名を許容）
--   - id サロゲートキー追加
-- ============================================================

ALTER TABLE public.drip_sent DROP CONSTRAINT IF EXISTS drip_sent_pkey;
ALTER TABLE public.drip_sent DROP CONSTRAINT IF EXISTS drip_sent_stage_check;

ALTER TABLE public.drip_sent
  ADD COLUMN IF NOT EXISTS id BIGSERIAL PRIMARY KEY;

CREATE INDEX IF NOT EXISTS idx_drip_sent_user_stage_sent_at
  ON public.drip_sent(user_id, stage, sent_at DESC);
