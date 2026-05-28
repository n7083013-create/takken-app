# AGENTS.md — takken-app

You're an AI agent working on **takken-app** (宅建士 完全対策).  
Read this BEFORE writing any code.

---

## Project Info
- **Name**: takken-app (宅建士 完全対策)
- **Framework**: Expo + React Native + TypeScript (NativeWind/Tailwind は 2026-05-27 に撤去済み)
- **Backend**: Supabase + Vercel(Serverless Functions)
- **Status**: **pre-launch**(ユーザー0、リリース予定 2026-06頃)

---

## 🚨 必ず最初に読むファイル

順番:

1. **`/Users/tairanaoya/Desktop/ObsidianVault/AGENTS.md`** — AI agnostic 全体ガイド
2. **`/Users/tairanaoya/Desktop/ObsidianVault/00_System/CURRENT_STATE.md`** — 今の真実(takken の現状含む)
3. **`/Users/tairanaoya/.claude/projects/-Users-tairanaoya-Desktop/memory/constitution_company.md`** — 会社憲法 7原則
4. **`/Users/tairanaoya/.claude/projects/-Users-tairanaoya-Desktop/memory/feedback_absolute_safety.md`** — 絶対安全規範

---

## 🎯 takken-app 固有の知識

### 直近の状態
- **本番 URL**: `https://takkenkanzen.com`
- **GitHub**: `https://github.com/n7083013-create/takken-app`
- **Supabase**: `https://nyppnuvfkohbgcqgwfxr.supabase.co`
- **DB trigger 状態**: 健全(`(id, email) + ON CONFLICT DO NOTHING`、display_name 残骸なし)
- **直近 commit**: `c0a1080 feat(ui): Input 共通部品実装 + auth 系 4 ファイル置換 (T8 Phase 2)`
- **未コミット変更**: 作業開始前に `git status --short` と `CURRENT_STATE.md` を確認
- **テスト数**: 795件(全 PASS、2026-05-28 時点)

### ディレクトリ構造
```
takken-app/
├── app/                    # Expo Router 画面群
│   ├── (tabs)/             # タブグループ
│   ├── auth/               # 認証画面
│   ├── legal/              # 規約・プライバシー
│   ├── quest/, exam/, study-timer/, achievements/, ...
├── components/             # UI components
│   └── ui/                 # primitives (Button, Badge, Card, ProgressBar) — token化済
├── constants/              # theme.ts (Brand const) / darkTheme.ts / config.ts
├── api/                    # Vercel Serverless Functions
│   ├── _lib/               # rateLimit, securityLog
│   └── ai-chat.js          # AI proxy + feedback handler
├── data/                   # 試験問題データ
├── services/               # supabase, iap, notifications, analytics, ...
├── store/                  # Zustand stores
├── hooks/                  # custom hooks
├── utils/                  # 純粋関数(validation, wcag, cancellationCopy, ...)
├── supabase/migrations/    # SQL migrations
└── __tests__/              # Jest tests
```

### 重要な原則(takken 固有)
- **法令引用は条文番号 + 施行日 必須**(宅建業法/民法/借地借家法等)
- **試験問題はオリジナル創作**(過去問・教科書からの直接コピー禁止)
- **PayPal は移行済**、IAP は別途
- **正解は人間レビュー必須**(自動生成は `needsReview: true` 初期化)
- **両アプリ pre-launch のため Breaking change OK**

---

## 🛠 開発フロー

### テスト
```bash
npm test                          # 全 jest
npx jest <pattern>                # 特定
npx jest --findRelatedTests <file>  # 関連のみ
npx tsc --noEmit                  # 型チェック
```

### 開発サーバー
```bash
npm run web                       # Web (localhost:8081)
npm run ios                       # iOS Simulator
npm run android                   # Android Emulator
```

### コミット & デプロイ
```bash
# 1. 変更を logical commit に
git add <specific-files>          # 一括 git add -A は危険(残骸混入)
git commit -m "..."               # pre-commit hook が jest 実行
# 2. push(GitHub remote 連携あり)
git push origin main
# 3. Vercel CLI deploy
vercel --prod
```

### コミット message 規約
`<type>(<scope>): <subject>` のあと改行 → 詳細
- type: feat / fix / refactor / test / docs / chore
- 詳細に「なぜ」を含める
- Co-Authored-By を AI 種別ごとに記載(Claude / Codex / etc.)

---

## ⚠️ 注意事項

### 未コミット138件について
- 大半は前セッション以前の作業の残骸
- 「今日のもの」と「以前のもの」を分類してから commit
- 不明な場合はユーザーに確認(推測で commit しない)

### Asset (アイコン等)
- `assets/*.png` の icon は `#1B7A3D` で再生成必要(デザイナー手作業)
- App.json で参照

### Google Login
- PKCE code exchange は実装済(コミット `3390b89`)
- DB trigger も健全
- Google Cloud Console redirect URI: `https://nyppnuvfkohbgcqgwfxr.supabase.co/auth/v1/callback`
- Supabase URL Configuration の Site URL: `https://takken-app.vercel.app`

---

## 📞 困ったら
1. `ObsidianVault/00_System/CURRENT_STATE.md` 確認
2. `ObsidianVault/00_System/handoff_protocol.md`「トラブルシューティング」
3. それでも不明 → ユーザーに聞く(推測で進めない)
