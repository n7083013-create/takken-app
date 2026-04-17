-- ============================================================
-- お知らせ管理用クエリ集
-- Supabase SQL Editor から実行する運用クエリ
-- ============================================================

-- ■ 1. メンテナンスお知らせを追加（例: 24時間限定）
INSERT INTO announcements (type, severity, title, body, starts_at, ends_at)
VALUES (
  'maintenance',
  'warning',
  'サーバーメンテナンスのお知らせ',
  '4/20 (日) 02:00〜06:00 にメンテナンスを実施します。この間、同期機能がご利用いただけません。',
  '2026-04-18T00:00:00+09:00',
  '2026-04-20T06:00:00+09:00'
);

-- ■ 2. 問題データベース更新のお知らせを追加
INSERT INTO announcements (type, severity, title, body)
VALUES (
  'update',
  'info',
  '問題データベースを更新しました',
  '令和8年度試験対応の新問題を30問追加しました。カテゴリ一覧からご確認ください。'
);

-- ■ 3. 法改正のお知らせを追加（重要度: critical）
INSERT INTO announcements (type, severity, title, body)
VALUES (
  'legal',
  'critical',
  '【重要】法改正に伴う問題更新',
  '令和8年4月施行の宅建業法改正に対応しました。改正前の解説が含まれる問題は修正済みです。'
);

-- ■ 4. 一般お知らせを追加
INSERT INTO announcements (type, severity, title, body)
VALUES (
  'info',
  'info',
  '新機能: AI学習分析がパワーアップ',
  '苦手分野の分析精度が向上しました。ホーム画面の「AI学習分析」からお試しください。'
);

-- ■ 5. お知らせを無効化する（IDを指定）
-- UPDATE announcements SET active = false WHERE id = 'ここにUUIDを貼り付け';

-- ■ 6. 現在有効なお知らせ一覧
SELECT id, type, severity, title,
       starts_at, ends_at, created_at
FROM   announcements
WHERE  active = true
  AND  starts_at <= now()
  AND  (ends_at IS NULL OR ends_at > now())
ORDER BY
  CASE severity
    WHEN 'critical' THEN 0
    WHEN 'warning'  THEN 1
    WHEN 'info'     THEN 2
  END,
  created_at DESC;

-- ■ 7. 全お知らせ一覧（管理用・無効化済み含む）
SELECT id, type, severity, active, title,
       starts_at, ends_at, created_at
FROM   announcements
ORDER BY created_at DESC;

-- ■ 8. 古い無効なお知らせを削除（30日以上前）
DELETE FROM announcements
WHERE  active = false
  AND  created_at < now() - INTERVAL '30 days';
