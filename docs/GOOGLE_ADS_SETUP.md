# Google Ads 設定リスト — 世界基準

このドキュメントは takken-app の Google Ads (`AW-18116818716`) を**世界トップレベルの計測精度**で運用するための設定リストです。コード側の実装は完了済み。管理画面側で以下を実施してください。

---

## ✅ コード側で実装済み (再設定不要)

| 機能 | 実装ファイル |
|---|---|
| Google Ads 基本タグ | `public/lp.html`, `public/index.html` |
| GCLID / wbraid / gbraid キャプチャ + 90日永続化 | `public/lp.html`, `public/index.html` |
| UTM パラメータ追跡 | 同上 |
| Sign Up コンバージョン (¥1) | `app/auth/login.tsx` |
| Trial Start コンバージョン (¥1) | `app/paywall.tsx` |
| Subscribe Complete コンバージョン (¥980) | `app/paywall.tsx` |
| View Paywall コンバージョン | `app/paywall.tsx` |
| First Question Answered (アクティベーション) | `store/useProgressStore.ts` |
| Exam Passed (満足度シグナル) | `app/exam/result.tsx` |
| **Enhanced Conversions (email SHA-256)** | `services/analytics.ts` |
| **Consent Mode v2** | `public/lp.html`, `public/index.html` |
| **Supabase: ad_gclid 等カラム** | `supabase/migrations/012_ad_attribution.sql` |

---

## 🔧 管理画面で実施すべき設定

### 1. **Enhanced Conversions (拡張コンバージョン) を有効化** ⭐ 最重要

iOS Safari の ITP / cookieless 時代に対応する最重要設定。**コンバージョン計測精度が 10-50% 向上**します。

1. Google Ads → 「**ツールと設定**」 → 「**コンバージョン**」
2. 各コンバージョン (sign_up / subscribe_complete / trial_start) を開く
3. 「**Enhanced Conversions**」セクション → 「**ウェブのコンバージョンを設定**」
4. 「**Google タグ**」を選択 (sGTM ではなくウェブのチェックボックスをON)
5. 「**ユーザー提供データ**」で `sha256_email_address` を有効に
6. **利用規約に同意**

✅ コード側で `services/analytics.ts:trackEventWithUserData()` がハッシュ済み email を `gtag('set', 'user_data', ...)` で送信済み。管理画面で有効化するだけ。

---

### 2. **3つのコンバージョンの「カテゴリ」と「値の取り扱い」を再確認**

| コンバージョン | カテゴリ設定 | 入札への含め方 | 値設定 |
|---|---|---|---|
| `sign_up` | **見込み顧客 / リード** | サブ (二次目標) | ¥1 固定 (パッシブ計測) |
| `trial_start` | **見込み顧客 / 体験開始** | サブ (二次目標) | ¥1 固定 |
| `subscribe_complete` | **購入 / サブスク開始** | **メイン (主要目標)** ★★★ | **¥980 (タグから動的)** |

**重要**: 入札最適化 (tCPA/tROAS) を使う場合、**主要目標は `subscribe_complete` のみ** にする。複数のコンバージョンが「主要」になっていると Google Ads が混乱して入札がブレる。

設定箇所: コンバージョン詳細 → 「**入札に含める**」 / 「**目標を最適化**」

---

### 3. **コンバージョン リンカー (Conversion Linker) を有効化**

LP (takkenkanzen.com) と アプリ (app.takkenkanzen.com) を跨いだクリック計測のため必須。

- 管理画面 → 「ツール → 設定 → コンバージョン」 → 「**Google タグ**」 → 「設定の管理」 → 「**Conversion Linker**」を ON
- cookie_domain を `takkenkanzen.com` に設定済み (コード側)

---

### 4. **オフライン コンバージョン インポート設定 (iOS/Android IAP 対応)**

Web の paywall は完全計測できるが、**iOS/Android アプリで購入された場合は別途 GCLID 経由でアップロードが必要**。

#### 4-1. コンバージョン作成
1. 「ツール → コンバージョン」 → 「**+ 新しいコンバージョン アクション**」
2. 「**インポート**」 → 「他のデータソース」 → 「**クリック数のコンバージョン**」
3. 名前: `subscribe_complete_iap` (Web の `subscribe_complete` と区別)

#### 4-2. アップロード方法
**A. 半手動 (CSV アップロード)** — 設定が簡単
- `Google Click ID` 列に `profiles.ad_gclid` 値を入れた CSV を週次でアップロード
- 推奨ツール: Supabase の SQL で抽出 → CSV ダウンロード → Google Ads に手動 upload

**B. API 自動連携 (Google Ads Offline Conversion API)** — 完全自動
- 別途実装が必要 (Phase 1.6 として保留中)
- 認証: Google Ads API OAuth2 + Developer Token
- 環境変数: `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID`
- IAP webhook (`api/iap/apple-asn.js`, `api/iap/google-play-rtdn.js`) でサブスク有効化時に Google Ads API へ POST

→ **まずは A (半手動) で運用開始し、月の課金件数が増えたら B に移行** が現実的。

---

### 5. **入札戦略の世界基準設定**

#### Phase 1 (データ蓄積中: 月10件未満のコンバージョン)
- **手動 CPC (上限クリック単価制)** or **コンバージョン数の最大化**
- 目的: コンバージョンデータを Google Ads に蓄積

#### Phase 2 (データ蓄積後: 月30件以上のコンバージョン)
- **目標コンバージョン単価 (tCPA)** に移行
- 推奨 tCPA: LTV ÷ (CPA 許容倍率)
  - 例: 月¥980 × 平均継続6ヶ月 = LTV ¥5,880 → tCPA 上限 ¥2,940 (LTV の50%)
- これにより自動入札がコンバージョン獲得を最適化

#### Phase 3 (収益が安定後)
- **目標広告費用対効果 (tROAS)** に移行
- conversion value (¥980) と tROAS を使って ROI 最大化

---

### 6. **オーディエンス (リマーケティング)**

#### Customer Match
- 既存ユーザー (有料会員) リストを `profiles.email` から SHA-256 で抽出 → Google Ads に同期
- 用途:
  - **似たユーザー (Similar Audiences)** → 新規獲得
  - **既存顧客は広告から除外** → 広告費の無駄をカット

#### 行動ベース オーディエンス
- 「LP訪問者で sign_up していないユーザー」 → リターゲティング
- 「sign_up したが trial_start していないユーザー」 → paywall への送客
- 「trial_start したが subscribe_complete していないユーザー」 → 解約防止

---

### 7. **GA4 と Google Ads の連携 (アトリビューション強化)**

1. Google Analytics 4 (GA4) でプロパティを作成 (まだなら)
2. 「**管理 → プロパティ → Google 広告のリンク**」で接続
3. GA4 のコンバージョンを Google Ads にインポート可能に
4. **データドリブン アトリビューション (DDA)** で多段クリックの重み配分

---

### 8. **広告品質スコア対策 (CPC 低減)**

- LP の読み込み速度: 既に Vercel CDN で対応済み (推奨3秒以内)
- モバイル対応: 既に レスポンシブで対応済み
- HTTPS: 既に対応済み
- 関連性スコア向上:
  - 広告文・キーワード・LP のメッセージ統一
  - 「**宅建 アプリ**」「**宅建 通信講座**」 等のロングテール KW を追加

---

### 9. **コンバージョン除外 (除外コンバージョン)**

社内テスト時にコンバージョンが計上されると入札が歪む。
- 「**コンバージョン → コンバージョン アクション**」で「**テスト用 IP 範囲を除外**」設定
- または、コード側で `localhost` / 開発環境では `trackEvent` を no-op にする (実装済み: Platform.OS !== 'web' で stub)

---

## 📊 期待される計測ファネル

```
Google 広告クリック (Impression → Click)
    ↓ gclid 保存 (90日)
LP 閲覧 (takkenkanzen.com)
    ↓ trackEvent('lp_cta_click') 発火
ログイン画面 (CTA クリック)
    ↓ trackEvent('sign_up', email_hash) 発火 ★Enhanced Conversion
profiles.ad_gclid に Supabase 保存
    ↓
paywall 画面表示
    ↓ trackEvent('view_paywall') 発火
PayPal 承認画面
    ↓ trackEvent('subscribe_start') 発火
有料化完了
    ↓ trackEvent('subscribe_complete', value: 980) 発火 ★★★ 主要目標
    ↓
1問目正解 (アクティベーション)
    ↓ trackEvent('first_question_answered') 発火
模試合格
    ↓ trackEvent('exam_passed') 発火 ★満足度シグナル
```

**Google Ads は `subscribe_complete` を主要目標として最適化し、`exam_passed` を二次シグナルとして使うことで、「合格まで導けるユーザー」を優先的に獲得できる。**

---

## 🚨 注意事項

1. **iOS Safari ITP**: 3rd party cookie が制限されるが、Enhanced Conversions + GCLID 直接記録で計測精度を維持
2. **コンバージョン重複防止**: `trial_start` と `subscribe_complete` が両方発火するパターンがあるため、入札最適化では `subscribe_complete` のみ「主要目標」に
3. **データ反映遅延**: Google Ads 管理画面への反映は 3〜24h かかる
4. **アトリビューション期間**: デフォルト 30日クリック / 1日表示 → 業界推奨は **90日クリック** (検討期間が長い試験対策アプリは特に長め)

---

## 次のアクション

1. Google Ads 管理画面で **Enhanced Conversions を有効化** (上記 1)
2. 3つのコンバージョンを **主要 / 二次** に振り分け (上記 2)
3. iOS/Android IAP は **CSV 半手動運用** で開始 (上記 4-A)
4. 月の課金件数を見ながら **入札戦略を tCPA に切替** (上記 5)

実装は世界基準で完了済み。あとは管理画面側の運用設定だけです。
