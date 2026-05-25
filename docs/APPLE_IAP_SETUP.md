# Apple App Store IAP 完全セットアップガイド

このドキュメントは、App Store で月額¥980 サブスクリプションを実装・運用するための手順書です。
コード実装は完了済み（`api/iap/verify-receipt.js` で iOS 対応済み）。**コンソール作業 + 環境変数設定**を以下の順で進めてください。

---

## 全体像

```
┌──────────────────────────────────────────────────────┐
│  ユーザー（iOS アプリ）                              │
│   └── react-native-iap で購入 → transactionReceipt 取得│
└────────────────────┬─────────────────────────────────┘
                     │ POST /api/iap/verify-receipt
                     ▼
┌──────────────────────────────────────────────────────┐
│  Vercel Serverless Function                          │
│   ├── Apple verifyReceipt API で検証                 │
│   │    （shared secret + receipt-data）              │
│   └── profiles.plan = 'standard' に更新              │
└──────────────────────────────────────────────────────┘
```

**注意**：将来は App Store Server API（JWT 認証・新方式）への移行を推奨しますが、現状の `verifyReceipt` でも本番運用可能です。

---

## Step 1: Apple Developer Program 登録

すでに進めている場合スキップ。

1. https://developer.apple.com/programs/enroll/
2. **$99/年** 支払い
3. 個人 or 法人（合同会社カケル）として登録
   - 法人の場合 D-U-N-S Number 必要（無料取得・1〜2週間）
4. 承認まで 個人即日〜2日 / 法人 1〜2週間

---

## Step 2: App Store Connect でアプリ登録

1. https://appstoreconnect.apple.com → 「アプリ」 → 「+」
2. プラットフォーム: **iOS**
3. 名前: **宅建士 完全対策**
4. プライマリ言語: **日本語**
5. バンドル ID: **com.takkenkanzen.app**（事前に Developer Portal で作成必要）
6. SKU: `takken-app-ios-001`

---

## Step 3: バンドル ID と App ID 設定

1. https://developer.apple.com/account/resources/identifiers
2. 「+」→ App IDs → App
3. Bundle ID: `com.takkenkanzen.app`
4. Capabilities:
   - ✅ **In-App Purchase**（最重要）
   - ✅ Sign In with Apple（既存・OAuth用）
   - ✅ Push Notifications（任意・通知機能用）

---

## Step 4: In-App Purchase 商品作成

App Store Connect → アプリ → **App内課金** → 「+」

### 商品設定

| 項目 | 値 |
|---|---|
| タイプ | **自動更新型サブスクリプション** |
| 参照名 | Premium 月額 |
| 商品 ID | `com.takkenkanzen.app.premium.monthly` |
| サブスクリプショングループ | 「Premium プラン」（新規作成） |
| 価格 | ¥980 / 月 |
| 期間 | 1ヶ月 |
| 無料試用期間 | 7日間（初回のみ） |
| 利用可能国 | 日本（必要に応じて全世界） |

⚠️ **商品 ID は `services/iap.ts` の `PREMIUM_MONTHLY_IOS` と一致させること**：
```ts
PREMIUM_MONTHLY_IOS: 'com.takkenkanzen.app.premium.monthly',
```

### 表示情報（日本語）

- **表示名**: Premium 月額プラン
- **説明**:
  ```
  AI合格確率予測・弱点AIコーチング・忘却曲線復習・全820問・模擬試験無制限。
  7日間無料トライアル付き、いつでもワンタップで解約可能。
  ```

### 初回スクショ（1枚必須）
- iPhone 6.7" 以上のスクショ
- App内で Premium 機能が表示されている画面

---

## Step 5: Shared Secret 取得

サーバー側で `verifyReceipt` を呼ぶための共有秘密鍵。

1. App Store Connect → 該当アプリ → **App情報** → **App固有の共有秘密鍵**
   - 「**App固有の共有秘密鍵を表示**」をクリック
   - 32文字の hex 文字列がコピー可能

2. （または）App Store Connect → **ユーザーとアクセス** → **キー** → **App内課金** → **マスター共有秘密鍵**
   - 全アプリ共通で使える秘密鍵
   - 個別アプリの方が推奨

---

## Step 6: Vercel に環境変数を設定

```bash
cd /Users/tairanaoya/Desktop/takken-app
vercel env add APPLE_SHARED_SECRET production --sensitive --value "<32文字のhex>" --yes
```

設定後、再デプロイ：
```bash
vercel --prod --yes
```

---

## Step 7: Sandbox テスター作成

実機で実課金せずテストするため。

1. App Store Connect → **ユーザーとアクセス** → **Sandbox** → **テスター** → 「+」
2. 適当なメール（捨てメアドOK）と Apple ID 形式で作成
3. テスター数：最低3名作成しておくと色々試せる

---

## Step 8: アプリビルド & TestFlight

### 8-1. EAS で iOS ビルド

```bash
eas build --platform ios --profile production
```

初回は EAS が証明書・プロビジョニングプロファイルを生成。Apple Developer Portal にアクセス権限が必要です。

### 8-2. TestFlight アップロード

EAS がビルド完了後、自動 or 手動で TestFlight にアップロード：

```bash
eas submit --platform ios --latest
```

`eas.json` の以下を埋めること：
```json
"submit": {
  "production": {
    "ios": {
      "appleId": "あなたのApple ID（メール）",
      "ascAppId": "App Store Connect の APP ID（数字）",
      "appleTeamId": "Apple Team ID（10文字英数字）"
    }
  }
}
```

### 8-3. TestFlight でテスト

1. App Store Connect → TestFlight → ビルドが「審査中」→「テスト準備完了」
2. 内部テスター（社内）に配布
3. 端末で TestFlight アプリを開いてインストール
4. **iPhone 設定 → App Store → サインアウト → Sandbox テスターでサインイン**
5. アプリで「7日間無料で始める」→ 購入フロー → Sandbox 課金完了
6. アプリで Premium 機能が解放される確認

---

## Step 9: 本番審査提出

1. App Store Connect → 該当アプリ → 「+ バージョン」or 既存リリース
2. 必須情報入力：
   - スクリーンショット（iPhone 6.9" 必須・最低3枚）
   - アプリ説明・キーワード
   - サポート URL: `https://takkenkanzen.com/legal/privacy`
   - マーケティング URL（任意）
3. **App Privacy 設定**：
   - 収集データ: メールアドレスのみ
   - 用途: アプリ機能（アカウント認証）
   - 第三者提供: なし
4. **コンテンツレーティング**: 4+
5. 「審査へ提出」→ 1〜3日

---

## 🛠️ コード実装サマリー（iOS 部分）

| 場所 | 内容 |
|---|---|
| `services/iap.ts` | `Platform.OS === 'ios'` 分岐で `requestSubscription({ sku })` |
| `api/iap/verify-receipt.js` | `platform === 'ios'` 分岐で `verifyAppleReceipt` 関数 |
| `app.json` の `bundleIdentifier` | `com.takkenkanzen.app`（変更時要再ビルド） |

---

## ❓ よくあるトラブル

### 「verifyReceipt status 21002」
→ `transactionReceipt` の base64 が壊れている。クライアント側で `purchase.transactionReceipt` を**そのまま**サーバーに渡すこと。

### 「verifyReceipt status 21004」
→ Shared Secret が間違っている。Vercel env の `APPLE_SHARED_SECRET` を確認。

### 「verifyReceipt status 21007」
→ Sandbox レシートが本番URLに送られた。**コードで自動 fallback 実装済み**なので通常は気にしないで OK。

### TestFlight で「購入できません」
→ Sandbox テスターアカウントで端末にサインインしているか確認。**通常の Apple ID では Sandbox 課金はできない。**

### EAS Build で証明書エラー
→ `eas credentials` で証明書管理画面に入り、自動生成または手動アップロード。

---

## 🚀 将来の拡張（Optional）

### App Store Server Notifications V2

Apple の Webhook 通知（解約・更新・返金イベント）。

設定：
1. App Store Connect → アプリ → **App Store Server Notifications** → URL 設定
   - 本番: `https://app.takkenkanzen.com/api/iap/apple-asn`
2. **Issuer ID, Key ID, Private Key** 取得（App Store Connect → Users and Access → Keys → In-App Purchase）

実装は別ファイルで `api/iap/apple-asn.js` を新規作成。Google の RTDN と同じパターン。

→ **launch 後に余裕ができたら実装** で OK。verifyReceipt だけでも基本動作は問題なし。

### App Store Server API (JWT 認証)

`verifyReceipt` の代替（Apple 推奨）。実装は手間かかるが、Apple は将来 verifyReceipt を完全廃止する可能性あり。早めの移行推奨だが、今は不要。
