-- ============================================================
-- migration 014: オンボーディング完了フラグを study_stats に追加
-- ============================================================
--
-- 目的:
--   これまで「オンボーディング完了」はデバイスローカルの AsyncStorage にしか
--   保存していなかった。新しいデバイス/ブラウザで開くたびにオンボーディングが
--   再表示される問題を解消するため、クラウド側にフラグを持つ。
--
-- 動作:
--   - onboarding_done = true のユーザーはどのデバイスからログインしても
--     オンボーディングをスキップする
--   - 既存ユーザーはデフォルト false → 次回 syncWithCloud 時に true に更新
--     (question_progress が存在する既存ユーザーはアプリ側ロジックで自動補完)

ALTER TABLE study_stats
  ADD COLUMN IF NOT EXISTS onboarding_done boolean NOT NULL DEFAULT false;
