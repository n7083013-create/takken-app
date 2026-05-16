-- ============================================================
-- Migration 011: 実績 / 模試 / クエスト のクラウド同期テーブル
-- ============================================================
--
-- 背景: ユーザー報告
-- 「アプリ消したら全データ消えた。再ログインしても進捗が戻ってない」
--
-- 原因: useProgressStore (4択問題進捗) はクラウド同期ありだが、
--      useAchievementStore / useExamStore / useQuestStore は
--      ローカル AsyncStorage のみで、アンインストールで永久消失していた。
--
-- 対策: 3つのテーブルを追加し、各ストアでクラウド同期を実装する。
--
-- 注意: 各テーブルに RLS (Row Level Security) を必ず設定。
--      「ユーザーは自分のデータのみ操作可能」を強制する。

-- ============================================================
-- 1. achievements_progress (実績バッジ)
-- ============================================================
-- ユーザーが解除した実績の一覧。
-- ストアの { achievementId: unlockedAt } を行として保存。
CREATE TABLE IF NOT EXISTS public.achievements_progress (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_achievements_user
  ON public.achievements_progress(user_id);

ALTER TABLE public.achievements_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_select_own_achievements" ON public.achievements_progress;
CREATE POLICY "user_select_own_achievements"
  ON public.achievements_progress FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_insert_own_achievements" ON public.achievements_progress;
CREATE POLICY "user_insert_own_achievements"
  ON public.achievements_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_update_own_achievements" ON public.achievements_progress;
CREATE POLICY "user_update_own_achievements"
  ON public.achievements_progress FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================
-- 2. exam_history (模試結果)
-- ============================================================
-- 模試受験ごとの結果。append-only (DELETE 禁止) で履歴を守る。
CREATE TABLE IF NOT EXISTS public.exam_history (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date TIMESTAMPTZ NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0),
  total INTEGER NOT NULL CHECK (total > 0),
  passed BOOLEAN NOT NULL,
  by_category JSONB NOT NULL DEFAULT '{}'::jsonb,
  duration_sec INTEGER NOT NULL CHECK (duration_sec >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_history_user_date
  ON public.exam_history(user_id, date DESC);

ALTER TABLE public.exam_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_select_own_exam_history" ON public.exam_history;
CREATE POLICY "user_select_own_exam_history"
  ON public.exam_history FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_insert_own_exam_history" ON public.exam_history;
CREATE POLICY "user_insert_own_exam_history"
  ON public.exam_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 模試結果は履歴として残すべきなので UPDATE / DELETE は禁止
-- (誤上書きや破壊行為からデータを守る)

-- ============================================================
-- 3. quest_progress (クエスト・ミッション進捗)
-- ============================================================
-- ミッションごとの best_score, attempts, completedAt を保存。
CREATE TABLE IF NOT EXISTS public.quest_progress (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_id TEXT NOT NULL,
  best_score NUMERIC NOT NULL DEFAULT 0 CHECK (best_score >= 0 AND best_score <= 1),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  completed_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, mission_id)
);

CREATE INDEX IF NOT EXISTS idx_quest_progress_user
  ON public.quest_progress(user_id);

ALTER TABLE public.quest_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_select_own_quest" ON public.quest_progress;
CREATE POLICY "user_select_own_quest"
  ON public.quest_progress FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_insert_own_quest" ON public.quest_progress;
CREATE POLICY "user_insert_own_quest"
  ON public.quest_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_update_own_quest" ON public.quest_progress;
CREATE POLICY "user_update_own_quest"
  ON public.quest_progress FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================
-- コメント
-- ============================================================
COMMENT ON TABLE public.achievements_progress IS '実績バッジの達成状況。ユーザーごとに解除した実績IDを保存。';
COMMENT ON TABLE public.exam_history IS '模試の受験履歴。append-only (UPDATE/DELETE 禁止) で履歴を守る。';
COMMENT ON TABLE public.quest_progress IS 'クエスト・ミッションごとの進捗 (最高スコア、試行回数、完了日)。';
