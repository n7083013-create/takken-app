-- ============================================================
-- SM-2 バグ修正: correct_streak カラム追加
-- question_progress テーブルに連続正答数カラムが欠落していたため、
-- SM-2 アルゴリズムの interval 計算が正しく動作しなかった問題を修正。
-- Supabase SQL Editor で実行してください
-- ============================================================

-- correct_streak カラムを追加（冪等: 既に存在する場合はスキップ）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'question_progress'
      AND column_name = 'correct_streak'
  ) THEN
    ALTER TABLE public.question_progress
      ADD COLUMN correct_streak int NOT NULL DEFAULT 0;

    RAISE NOTICE 'correct_streak カラムを追加しました';
  ELSE
    RAISE NOTICE 'correct_streak カラムは既に存在します（スキップ）';
  END IF;
END $$;
