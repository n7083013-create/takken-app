-- ============================================================
-- migration 015: study_stats に欠落していたカラムを一括追加
-- ============================================================
--
-- 【原因】
-- 001_init.sql の study_stats スキーマには以下のカラムが存在しなかったが、
-- アプリのコードはこれらを upsert で書き込もうとしていた。
-- 結果として全ての push が PGRST204 (column not found) で失敗、
-- 別デバイスへの同期が全く機能していなかった。
--
-- 【影響】
--   - daily_log: 今日の解答数記録 (今日の目標カウンタ) が同期されない
--   - streak_freeze_count / used_at / refilled_at: ストリーク維持機能が同期されない
--   - onboarding_done: クロスデバイスでオンボーディングが何度も出る (014 で追加済み想定)
--
-- 【適用】
-- Supabase Dashboard → SQL Editor で実行 (IF NOT EXISTS なので冪等)

ALTER TABLE study_stats
  ADD COLUMN IF NOT EXISTS daily_log jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE study_stats
  ADD COLUMN IF NOT EXISTS streak_freeze_count int NOT NULL DEFAULT 0;

ALTER TABLE study_stats
  ADD COLUMN IF NOT EXISTS streak_freeze_used_at timestamptz;

ALTER TABLE study_stats
  ADD COLUMN IF NOT EXISTS streak_freeze_refilled_at timestamptz;

-- onboarding_done は 014 で追加済みだが、適用漏れ対策で冪等に再宣言
ALTER TABLE study_stats
  ADD COLUMN IF NOT EXISTS onboarding_done boolean NOT NULL DEFAULT false;

-- PostgREST のスキーマキャッシュをリロード (新カラムを即座に認識させる)
NOTIFY pgrst, 'reload schema';
