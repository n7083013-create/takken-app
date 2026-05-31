# リリースビルド & ストア提出 プレイブック(takken / 横展開可)

> 目的: 「ストアのアプリを最新にする」を、迷わず1ステップずつ実行するための手順書。
> 対象読者: エンジニア未経験のオーナー本人。
> ⚠️ **ビルド実行・ストア提出・プラン課金は本人の作業**(規範: 金銭/契約/公開はユーザー)。Claude は設定準備・確認・案内まで。

---

## 0. まず判断: 「OTA」で済むか「新規ビルド」が要るか

| 変更内容 | 必要な対応 |
|---|---|
| **JSだけ**の変更(文言・ロジック・画面・データ) | **OTA(`eas update`)で即配信**。ストア審査不要・数秒 |
| **ネイティブ依存/設定**の変更(`package.json` のネイティブモジュール追加、`app.json` の plugins/permissions、SDK/expo バージョン) | **新規ビルド(`eas build`)+ ストア提出が必須**。OTAでは配れない |

**判定コマンド**(前回ビルドのコミット → 今:`package.json`/`app.json` が変わっていれば新規ビルド):
```bash
# 最新ビルドのコミットハッシュは: npx eas-cli build:list --limit 1 で確認
git diff <前回ビルドのcommit> HEAD --stat -- package.json app.json
```

> 📌 2026-06 時点の takken: 前回ビルド(build 19)は **2026-04-18 のコード**。その後 `expo-iap`(アプリ内課金)・`@sentry/react-native`(クラッシュ計測)が追加された=**新規ビルド必須**。OTAでは課金機能をストアのユーザーに届けられない。

---

## 1. ビルド前チェック(全部 OK を確認)

```bash
cd ~/Desktop/takken-app
npx tsc --noEmit          # 型エラー 0
npx jest                  # 全テスト PASS
npx expo export -p web    # web バンドル成功(参考)
git status                # コミット漏れが無いこと(ビルドは push 済コードでなくローカルから走る)
```

---

## 2. バージョン番号(基本は自動)

- `eas.json` は `appVersionSource: "remote"` + production で `autoIncrement: true`。
  → **ビルド番号(iOS buildNumber / Android versionCode)は EAS が自動で +1** する。手動不要。
- 表示バージョン(`1.0.0`)を上げたい時だけ `app.json` の `expo.version` を `1.0.1` 等に変更。
  ※ `runtimeVersion.policy: "appVersion"` のため、**version を変えると OTA の互換ランタイムも変わる**(古いビルドへ新OTAが届かなくなる)。大型リリース時のみ上げる。

---

## 3. ビルド(3通り。EAS無料枠の月上限に当たっている場合は (c) が有効)

> EAS Build 無料枠は **月のビルド数に上限**がある。残数/リセット日は https://expo.dev/accounts/2023kakeru → Billing で確認。

**(a) クラウドビルド(標準・EASクレジット消費)**
```bash
npx eas-cli build --platform ios --profile production
npx eas-cli build --platform android --profile production
```

**(b) 有料プランにアップグレード**(月上限を上げる。expo.dev の Billing。¥/$ 発生 → 本人判断)

**(c) ローカルビルド(EASクレジットを消費しない・上限回避)** ⭐ 月上限で詰まった時の本命
```bash
# iOS(要 macOS + Xcode + CocoaPods)
npx eas-cli build --platform ios --profile production --local
# Android(要 Android SDK + JDK17)
npx eas-cli build --platform android --profile production --local
```
→ 自分の Mac でビルドし、`.ipa` / `.aab` がローカルに出力される(EAS の月上限と無関係)。

---

## 4. ストアへ提出(`eas submit`)

```bash
# クラウドビルドした場合(最新ビルドを自動取得)
npx eas-cli submit --platform ios --latest
npx eas-cli submit --platform android --latest

# ローカルビルドした .ipa/.aab を出す場合
npx eas-cli submit --platform ios --path ./build-xxxx.ipa
npx eas-cli submit --platform android --path ./build-xxxx.aab
```

**提出設定は `eas.json` の `submit.production` を使用:**
- iOS: `ascAppId: 6766894610` / `appleTeamId: 76LAYJ849H` / `ascApiKeyPath: ./AuthKey_CTB8W2SXBB.p8` ✅ 設定済(.p8 もローカルに存在)
- Android: `serviceAccountKeyPath: ./google-play-service-account.json` ⚠️ **このファイルが未配置**。Google Cloud のサービスアカウント鍵(JSON)を DL して takken-app 直下に置く必要あり(無いと Android 提出不可)。

---

## 5. ストア審査前の必須確認(IAP 課金がある場合)

- **App Store Connect / Google Play で IAP 商品を登録 & 承認**してから提出する(未登録だと課金が動かない/審査差し戻し)。
  - iOS 商品ID: `com.takkenkanzen.app.premium.monthly` / `.premium.annual`
  - Android 商品ID: `premium_monthly` / `premium_annual`
- スクショ・ストア掲載文は `docs/app-store/METADATA.md` を流用。
- 審査目安: Apple 約1〜2日 / Google 数時間〜数日。

---

## 6. 公開後の運用

- **JSだけの修正は OTA**: `npx eas-cli update --channel production --message "修正内容"`(審査不要・即配信)。
  ※ OTA は **そのビルドに含まれるネイティブ機能の範囲内**でのみ動く。新ネイティブ依存を足したら必ず新規ビルド。
- 次回からは「JS変更=OTA / ネイティブ変更=ビルド」を §0 で判定。

---

## gas-shunin-app の状況(別アプリ)

- **EAS プロジェクト未作成**(`app.json` の `extra.eas.projectId = "TODO_CREATE_NEW_EAS_PROJECT"`)→ **まず `npx eas-cli init` でプロジェクト作成が必要**。
- `eas.json` の iOS は `ascAppId`/`appleTeamId` がプレースホルダ → **App Store Connect でアプリ登録 → 実値を eas.json に記入**。
- ネイティブ課金は RevenueCat(`react-native-purchases`)。RevenueCat ダッシュボード設定も別途必要(`docs/iap-setup.md`)。
- = gas は takken より一段手前。手順は takken と同型だが初期セットアップ(`eas init` + ASC登録)が先。

---

## 安全規範(必読)

- `eas build` / `eas submit` / プラン課金 / IAP商品作成 / ストアアップロードは **本人の作業**。Claude は実行しない。
- 認証鍵(`AuthKey_*.p8` / `google-play-service-account.json`)は **.gitignore 済**。コミット・共有・ログ出力しないこと。
