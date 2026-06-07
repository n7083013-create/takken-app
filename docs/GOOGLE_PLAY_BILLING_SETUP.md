# Google Play Billing 完全セットアップガイド

このドキュメントは、Google Play で月額¥980 サブスクリプションを実装・運用するための手順書です。
コード実装は完了済み。**コンソール作業 + 環境変数設定**を以下の順で進めてください。

## 全体像

```
┌──────────────────────────────────────────────────────┐
│  ユーザー（Android アプリ）                          │
│   └── react-native-iap で購入 → purchaseToken 取得    │
└────────────────────┬─────────────────────────────────┘
                     │ POST /api/iap/verify-receipt
                     ▼
┌──────────────────────────────────────────────────────┐
│  Vercel Serverless Function                          │
│   ├── Service Account で Play API 認証               │
│   ├── purchaseToken を verify                        │
│   └── profiles.plan = 'premium' に更新               │
└──────────────────────────────────────────────────────┘
                     │
                     │ Pub/Sub Push (RTDN)
                     ▼
┌──────────────────────────────────────────────────────┐
│  /api/iap/google-play-rtdn                           │
│   └── 解約・更新・返金イベントで profile を同期      │
└──────────────────────────────────────────────────────┘
```

---

## Step 1: Google Play Developer 登録

すでに済んでいれば飛ばして OK。

1. https://play.google.com/console/signup
2. **$25**（一回のみ）支払い
3. 本人確認（運転免許証・パスポート等）
4. 承認まで 1〜2日

---

## Step 2: アプリを Play Console に登録

1. Play Console → 「**アプリを作成**」
2. 入力：
   - アプリ名: **宅建士 完全対策**
   - デフォルト言語: **日本語**
   - アプリまたはゲーム: **アプリ**
   - 無料または有料: **無料**（アプリ内購入あり）
3. パッケージ名は **`com.takkenkanzen.app`**（`app.json` と一致させる）

---

## Step 3: 定期購入プロダクトを作成

Play Console → **収益化** → **商品** → **定期購入** → 「定期購入を作成」

| 項目 | 値 |
|---|---|
| プロダクト ID | `premium_monthly` |
| 名称 | Premium 月額プラン |
| 説明 | AI合格確率予測・弱点コーチング・全機能が使い放題 |
| 基本プラン | 自動更新型・¥980/月 |
| 無料試用期間 | 7日 |
| 利用可能国 | 日本 |

⚠️ プロダクト ID `premium_monthly` は **`services/iap.ts`** の `IAP_PRODUCTS.PREMIUM_MONTHLY_ANDROID` と一致させること。

---

## Step 4: Google Cloud Service Account 作成

サーバー側でレシート検証するために、Play Developer API へのアクセス権を持つ Service Account が必要です。

### 4-1. Google Cloud プロジェクトを Play と紐付け

1. Play Console → **設定** → **API へのアクセス**
2. 「Google Cloud プロジェクトをリンク」
3. 既存のプロジェクトを選ぶ、または「新規作成」

### 4-2. Service Account 作成

1. Google Cloud Console (https://console.cloud.google.com) を開く
2. 該当プロジェクト → **IAM と管理** → **サービスアカウント** → 「作成」
3. 名前: `play-developer-api`
4. 役割: 一旦スキップ（次で Play 側で付与）
5. 作成完了後、**鍵を作成 → JSON** でダウンロード（次で使用）

### 4-3. Play Console で権限付与

1. Play Console → **API へのアクセス**
2. 作成した Service Account メール（`play-developer-api@xxx.iam.gserviceaccount.com`）に「**アクセス権を付与**」
3. アクセス権限：
   - 「**注文と定期購入の管理**」: 表示
   - 「**注文を編集して払い戻しを処理**」: ✅
4. 「ユーザーを招待」

---

## Step 5: Vercel に環境変数を設定

ダウンロードした JSON から値を取り出して、Vercel に設定。

```bash
# Service Account のメール
vercel env add GOOGLE_SERVICE_ACCOUNT_EMAIL production --value "play-developer-api@xxx.iam.gserviceaccount.com" --yes

# 秘密鍵（JSON の "private_key" 値・改行は \n のままでOK）
vercel env add GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY production --sensitive --yes
# プロンプトで貼り付け：
# -----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n

# パッケージ名（デフォルト 'com.takkenkanzen.app' なので明示しなくても可）
vercel env add ANDROID_PACKAGE_NAME production --value "com.takkenkanzen.app" --yes

# RTDN 用 Audience（次のステップで作る Pub/Sub の push 設定で使う）
# 仮設定（後で更新可）：
vercel env add PUBSUB_AUDIENCE production --value "https://app.takkenkanzen.com/api/iap/google-play-rtdn" --yes
```

設定後、再デプロイで反映：
```bash
vercel --prod --yes
```

---

## Step 6: Real-Time Developer Notifications (RTDN) セットアップ

サブスクの更新・解約・返金などのイベントを自動受信する仕組み。

### 6-1. Pub/Sub トピック作成

1. Google Cloud Console → **Pub/Sub** → **トピック** → 「トピックを作成」
2. トピック名: `play-rtdn-takkenkanzen`

### 6-2. Push サブスクリプション作成

1. 作成したトピック → **サブスクリプションを作成**
2. ID: `play-rtdn-push`
3. 配信タイプ: **Push**
4. Endpoint URL: `https://app.takkenkanzen.com/api/iap/google-play-rtdn`
5. 認証: ✅「**認証を有効化**」
6. Service Account: 先ほど作った `play-developer-api@xxx.iam.gserviceaccount.com`
7. Audience: `https://app.takkenkanzen.com/api/iap/google-play-rtdn`（Vercel env `PUBSUB_AUDIENCE` と一致）

### 6-3. Play 側に通知先を設定

1. Play Console → **収益化** → **収益化のセットアップ** → **リアルタイム デベロッパー通知**
2. トピック名: `projects/<プロジェクトID>/topics/play-rtdn-takkenkanzen`
3. **テスト通知を送信**ボタンで疎通確認
4. Vercel ログ（`vercel logs`）で `[rtdn] Test notification received` を確認

---

## Step 7: アプリビルド & テスト提出

### 7-1. EAS CLI 準備

```bash
npm install -g eas-cli
eas login          # Expo アカウントでログイン
eas build:configure  # eas.json 設定（既存）
```

### 7-2. AAB ビルド

```bash
eas build --platform android --profile production
```

完了まで 10〜20 分。EAS ダッシュボードから AAB をダウンロード。

### 7-3. Play Console にアップロード

1. Play Console → **テスト** → **内部テスト** → 「新しいリリースを作成」
2. AAB をアップロード
3. リリースノート: 「初回リリース」
4. 「保存」→「リリースのレビュー」→「公開」

### 7-4. 内部テスター追加

1. **テスター** タブ → メールリスト追加（自分・身近な人 5-10名）
2. **オプトイン URL** をテスターに送る
3. テスターは Play Store でインストール → 課金フロー確認
4. **テストカード番号**: ライセンス テスター設定でテスト購入が可能（実際の課金なし）

### 7-5. 動作確認チェックリスト

- [ ] アプリ起動 → 課金画面表示 → 「7日間無料で始める」タップ
- [ ] Google Play 課金シートが起動
- [ ] テストカードで購入完了
- [ ] アプリが Premium 状態に切り替わる（AI質問・全問題が解放される）
- [ ] Play Console → 注文管理 で購入レコードが表示される
- [ ] 購入後数分以内に Pub/Sub から `SUBSCRIPTION_PURCHASED` 通知 → Vercel ログで確認
- [ ] 設定 → 解約 → アプリで解約反映確認
- [ ] アプリ再インストール → 「購入を復元」→ Premium 復活

---

## Step 8: 本番公開

内部テストで問題なければ：

1. Play Console → **本番環境** → 「新しいリリースを作成」
2. AAB を内部テストから昇格 or 新たにアップロード
3. **コンテンツレーティング** 取得（教育アプリ → 全年齢）
4. **データセーフティ**: メールアドレスのみ収集
5. **アプリのカテゴリ**: 教育
6. **連絡先メール**: taira@2023kakeru.com
7. **プライバシーポリシー URL**: `https://takkenkanzen.com/legal/privacy`
8. 審査リクエスト → 1〜3日で公開

---

## 🛠️ コード実装サマリー

| ファイル | 役割 |
|---|---|
| `services/iap.ts` | クライアント側購入フロー（react-native-iap ラッパー） |
| `api/iap/verify-receipt.js` | サーバー側レシート検証 + profile 更新 |
| `api/iap/google-play-rtdn.js` | RTDN webhook（自動更新・解約・返金イベント受信） |
| `app.json` | `react-native-iap` config plugin |
| `app/paywall.tsx` | Native は IAP、Web は PayPal の分岐 |
| `app/_layout.tsx` | 起動時に `initializeIAP()` |
| `supabase/migrations/006_google_play_iap.sql` | profile 拡張 + iap_purchases テーブル |

---

## ❓ よくあるトラブル

### 「Service Account 認証失敗」
→ Vercel env の `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` で改行が `\n`（バックスラッシュ + n）として保存されているか確認。

### 「テスト通知が届かない」
→ Pub/Sub の認証 Service Account と Vercel env の SA メールが**同一**であること。Audience が **完全一致**（末尾スラなし）であること。

### 「テスト購入時に "Authentication failed" が出る」
→ Play Console → ライセンステスター 設定にテスターのメールが登録されていない。

### 「内部テスト URL が "アプリは利用できません" と表示される」
→ AAB が正しくアップロードされていない、または公開ロールアウトが完了していない（最大3時間）。

---

## 📦 必要な npm パッケージ

すでに `package.json` に追加済み：

- `react-native-iap` (^12.15.7) — クライアント
- `google-auth-library` (^9.14.1) — サーバー JWT 署名

`npm install` を実行してください。
