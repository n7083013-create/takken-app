# 🚀 販売開始前 チェックリスト

## ✅ 実装済み

### 決済基盤
- [x] PayPal サブスクリプション実装（create / activate / cancel / webhook）
- [x] Supabase profiles に PayPal カラム追加（RLS保護済み）
- [x] PAYPAL_CLIENT_ID / SECRET / PLAN_ID / WEBHOOK_ID / BASE_URL 設定済み
- [x] paywall画面をPayPal対応に刷新

### セキュリティ
- [x] メール確認必須化（AI API・課金 API）
- [x] Webhook 署名検証（PAY.JP / PayPal 両方）
- [x] RLS で plan / subscription_status / trial_ends_at 等の改ざん防止
- [x] AI レート制限の原子的増分（並列攻撃防止）
- [x] CSP / HSTS / X-Frame-Options 等のセキュリティヘッダー

### LP・UX
- [x] モバイルレスポンシブ（isDesktop 判定で切替）
- [x] 未ログイン時にタブバー非表示
- [x] OGP / Twitter Card / 構造化データ
- [x] GA4 / Meta / TikTok / X Pixel 埋込機構
- [x] 全820問に1行エッセンス（論点コア）実装
- [x] 打ち消し線（消去法）対応
- [x] 合格確率予測・弱点コーチング・直前モード
- [x] ハプティクス・アニメーション設定

### 法的整備
- [x] 特商法表記（PayPal対応版に更新）
- [x] プライバシーポリシー
- [x] 利用規約
- [x] ワンタップ解約ボタン

---

## 🟡 あなたの作業（販売前）

### 1. 動作確認（必須）
- [ ] 新規アカウント作成 → メール確認 → PayPal登録 → プレミアム有効化
- [ ] 解約ボタン動作確認
- [ ] 問題を解く → 1行エッセンスが表示される
- [ ] スマホ・PC両方で表示確認

### 2. 広告タグ追加（広告出す場合）
Vercel 環境変数、または `public/index.html` に追加：
```html
<meta name="ga4-id" content="G-XXXXXXXXXX" />
<meta name="meta-pixel-id" content="XXXXXXXXXXXXXXX" />
<meta name="tiktok-pixel-id" content="XXXXXXXXXXXXXXXXXXXX" />
```

### 3. 料金設定の再確認
PayPal ダッシュボードで：
- プラン: `P-6H874940WB331310TNHVBWRI`
- 月額: ¥980（税抜 or 税込？10%税設定の確認）
- トライアル: 7日間 ¥0
- 不履行サイクル: 3

LP表示とPayPal設定が**一致**していることを確認：
- LP: `月額¥980（税込）` → PayPalも税込で¥980になっているか

### 4. PayPal Webhook 受信テスト
```
PayPal Developer Dashboard → Webhooks → 該当Webhookの詳細画面
→ 「Event logs」で届いた通知を確認
```

### 5. Supabase プロジェクトの健全性
- [ ] `profiles` テーブルに `paypal_subscription_id` 列が存在
- [ ] `payment_provider` 列が存在
- [ ] 既存の PAY.JP ユーザー（あれば）は `payment_provider='payjp'` に更新

---

## 📢 販売開始後の初期モニタリング

### 最初の1時間
- [ ] PayPal Developer → Webhook イベントログを確認
- [ ] Supabase → profiles テーブルで新規サブスクが記録されているか
- [ ] Vercel → Functions ログでエラーがないか

### 最初の24時間
- [ ] コンバージョン率（LPアクセス / サインアップ / トライアル開始）
- [ ] エラー率
- [ ] ユーザーからの問い合わせ対応体制

### ユーザーサポート
- メール: taira@2023kakeru.com
- 返信時間目標: 24時間以内

---

## 🚨 緊急時の対処

### 決済が通らない
1. PayPal Developer → Live 環境になっているか確認
2. Webhook URL: `https://takken-app-olive.vercel.app/api/paypal/webhook`
3. Vercel Function ログを確認

### プレミアムが反映されない
```sql
-- Supabase SQL Editor で手動反映
UPDATE profiles
SET plan='premium', subscription_status='active', payment_provider='paypal'
WHERE email='ユーザーのメールアドレス';
```

### アプリが落ちる
- Vercel の直近デプロイを Rollback: Vercel Dashboard → Deployments → Roll back

---

## 🎯 週次メール配信（Resend 設定後）

Resend アカウント作成後：
1. https://resend.com でAPIキー発行
2. Vercel に `RESEND_API_KEY` 追加
3. 毎週月曜朝8時に自動配信開始（Vercel Cron 設定済み）

---

## 📝 価格変更したい場合

1. PayPal で新しい Plan 作成（旧Planは既存ユーザー用に残す）
2. Vercel の `PAYPAL_PLAN_ID` を新Planに更新
3. LP・paywall・特商法 の表記を更新

---

**準備OK！販売開始 🚀**
