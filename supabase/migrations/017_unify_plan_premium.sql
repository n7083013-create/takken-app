-- ============================================================
-- 017: plan 値を 'premium' に統一（旧 'standard'/'unlimited' を集約）
-- ============================================================
-- 背景: takken はこれまで内部キーに 'standard' を使っていたが、UI 表記「PREMIUM」・
--       姉妹アプリ gas-shunin（plan='premium'）と統一するため DB 値も 'premium' に寄せる。
-- 安全性(P2): pre-launch（有料ユーザー0）のため安全。万一の残存有料行も premium へ変換し、
--       free は据え置き＝**誰も無料に降格しない**。CHECK は旧値も許容したまま（paid 書込を
--       絶対に reject しない＝デプロイ順序に関わらず課金反映が失敗しない防御）。
-- 適用順: 新コード（plan='premium' を書く / isPro は premium+standard+unlimited を Pro 扱い）
--       をデプロイ後に本 SQL を適用すれば最も安全（ただし 0 課金中なので順序事故の実害なし）。
-- ============================================================

-- 1) CHECK を「free / premium / 旧 standard / 旧 unlimited」を許容する寛容な形に張り替え。
--    旧 standard 限定 CHECK のままだと 'premium' 書込が CHECK 違反で失敗（=課金反映されない）ため。
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_plan_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_plan_check
  CHECK (plan IN ('free', 'premium', 'standard', 'unlimited'));

-- 2) 既存の有料値を premium に集約（free は触らない＝降格ゼロ）。
UPDATE public.profiles SET plan = 'premium' WHERE plan IN ('standard', 'unlimited');

-- 注: CHECK は意図的に 'standard'/'unlimited' を許容したままにする（防御的）。
--     コードの正準書込は 'premium'、読取(isPro)は premium/standard/unlimited を全て Pro 扱い。
--     将来どうしても 2 値に締めたい場合のみ、全コード反映を確認後に別マイグレーションで
--     CHECK (plan IN ('free','premium')) へ縮小すること（縮小は paid 書込 reject リスクを伴う）。
