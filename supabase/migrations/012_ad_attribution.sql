-- ============================================================
-- 広告アトリビューション (Google Ads / UTM) 永続化
-- ============================================================
-- 目的: 広告クリック (gclid/wbraid/gbraid) と UTM パラメータをユーザーに紐付け、
-- iOS/Android アプリで購入された場合も Google Ads Offline Conversion API で
-- コンバージョン送信できるようにする。
--
-- 設計:
--   - sign_up 時にクライアントの localStorage 'takken_ad_attribution' から取得して保存
--   - 既存 user (RLS で id = auth.uid()) は自分の attribution のみ更新可能
--   - サーバー側 (service_role) は IAP webhook で取得して Google Ads API に送信
-- ============================================================

alter table public.profiles
  add column if not exists ad_gclid text,
  add column if not exists ad_wbraid text,
  add column if not exists ad_gbraid text,
  add column if not exists ad_utm_source text,
  add column if not exists ad_utm_medium text,
  add column if not exists ad_utm_campaign text,
  add column if not exists ad_utm_term text,
  add column if not exists ad_utm_content text,
  add column if not exists ad_captured_at timestamptz,
  add column if not exists ad_landing_page text;

-- 検索性能: campaign 集計や gclid 逆引き用にインデックス
create index if not exists profiles_ad_gclid_idx on public.profiles (ad_gclid) where ad_gclid is not null;
create index if not exists profiles_ad_campaign_idx on public.profiles (ad_utm_campaign) where ad_utm_campaign is not null;

comment on column public.profiles.ad_gclid is 'Google Ads Click ID. Offline Conversion API でコンバージョン送信時に使用。';
comment on column public.profiles.ad_wbraid is 'iOS App Tracking Transparency 非同意時の Google Ads クリック ID';
comment on column public.profiles.ad_gbraid is 'Android Privacy Sandbox 対応の Google Ads クリック ID';
