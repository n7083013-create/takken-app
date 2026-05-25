# Supabase SQL 管理

## 📂 フォルダ構成

```
supabase/
├── README.md                       ← このファイル
├── management-announcements.sql    ← お知らせ投稿用（運用クエリ・随時使用）
├── migrations/                     ← 初期スキーマの記録
│   ├── 001_init.sql
│   └── 003_announcements.sql
└── archive/                        ← 実行済みマイグレーション（再実行不要）
```

## ✅ 実行済みマイグレーション（archive/）

すべて Supabase に適用済み。**再実行不要**。履歴のために保存。

| ファイル | 実行済み | 概要 |
|---------|---------|------|
| `setup.sql` | ✅ | profiles テーブル＋RLS 初期セットアップ |
| `migration-payjp.sql` | ✅ | Stripe → PAY.JP 移行（カラム名変更） |
| `migration-security-fix.sql` | ✅ | セキュリティ修正 |
| `migration-correct-streak.sql` | ✅ | SM-2 correct_streak カラム追加 |
| `migration-indexes.sql` | ✅ | webhook 検索高速化インデックス |
| `migration-reports-rls.sql` | ✅ | question_reports の RLS 強化 |
| `migration-ai-ratelimit.sql` | ✅ | AI レートリミット用カラム |
| `migration-ai-atomic-ratelimit.sql` | ✅ | AI レート制限の原子的増分 RPC |
| `migration-weekly-email.sql` | ✅ | weekly_email_enabled 列 + RLS 更新 |
| `migration-paypal.sql` | ✅ | paypal_subscription_id/subscriber_id/payment_provider 列 + RLS 更新 |
| `migration-drip-campaign.sql` | ✅ | drip_sent テーブル作成（ドリップメール配信記録） |

## 🔧 運用クエリ

### お知らせ投稿: `management-announcements.sql`
メンテナンス通知・お知らせ・法改正情報などをアプリ内バナーで表示する際に使用。
必要な SQL をコピペして Supabase SQL Editor で実行。

---

## 新規マイグレーション追加のルール

1. 新しい SQL ファイルを `supabase/` 直下に作成
2. Supabase SQL Editor で実行
3. 実行確認後、`archive/` に移動
4. この README の表に追記
