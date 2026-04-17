-- ============================================================
-- お知らせ・メンテナンス通知テーブル
-- アプリ内バナーで表示するインフォメーション
-- ============================================================

-- テーブル作成
CREATE TABLE IF NOT EXISTS announcements (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  type       text        NOT NULL CHECK (type IN ('maintenance', 'update', 'legal', 'info')),
  severity   text        NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  title      text        NOT NULL,
  body       text        NOT NULL,
  active     boolean     NOT NULL DEFAULT true,
  starts_at  timestamptz NOT NULL DEFAULT now(),
  ends_at    timestamptz,          -- NULL = 無期限
  created_at timestamptz NOT NULL DEFAULT now()
);

-- インデックス: アクティブなお知らせを高速取得
CREATE INDEX idx_announcements_active
  ON announcements (active, starts_at DESC)
  WHERE active = true;

-- RLS 有効化
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- SELECT: 全ユーザー（匿名含む）が閲覧可能
CREATE POLICY "announcements_select_all"
  ON announcements
  FOR SELECT
  USING (true);

-- INSERT / UPDATE / DELETE はポリシーなし
-- → service_role (SQL Editor / サーバーサイド) のみ操作可能

-- テーブルコメント
COMMENT ON TABLE announcements IS 'アプリ内お知らせ。管理はSQL Editorから。RLSでSELECTのみ全公開。';
COMMENT ON COLUMN announcements.type IS 'maintenance=メンテナンス, update=問題DB更新, legal=法改正, info=一般情報';
COMMENT ON COLUMN announcements.severity IS 'info=通常, warning=注意, critical=重大（非表示不可）';
COMMENT ON COLUMN announcements.ends_at IS 'NULLの場合は手動で active=false にするまで表示';
