-- ============================================================
-- 013_billing_cycle.sql
-- 2026-05: 年額プラン (¥5,980/年) 追加に伴い、profiles に billing_cycle 列を追加
-- ============================================================
--
-- 既存ユーザーは全員 'monthly' で初期化。
-- 値域: 'monthly' | 'annual' | NULL (free user)
--
-- 適用方法 (オーナー手動):
--   1. Supabase Dashboard → SQL Editor で本ファイルの内容を実行
--   2. または `supabase db push` (CLI を使う場合)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS billing_cycle text
    CHECK (billing_cycle IN ('monthly', 'annual'))
    DEFAULT NULL;

-- 既存の有料会員 (plan = 'standard') は全員 monthly 扱いに初期化
-- (2026-05 時点では年額プランは未提供だったため)
UPDATE profiles
SET billing_cycle = 'monthly'
WHERE plan = 'standard'
  AND billing_cycle IS NULL;

-- インデックス: 課金サイクル別の集計 (LTV 分析等) を高速化
CREATE INDEX IF NOT EXISTS idx_profiles_billing_cycle
  ON profiles (billing_cycle)
  WHERE billing_cycle IS NOT NULL;

COMMENT ON COLUMN profiles.billing_cycle IS
  '課金サイクル (monthly = ¥980/月 | annual = ¥5,980/年). 2026-05 年額プラン追加で導入.';
