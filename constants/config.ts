// ============================================================
// アプリ設定・環境変数
// ============================================================

/**
 * API ベースURL
 * 環境変数で上書き可能（開発 / ステージング / 本番）
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || 'https://app.takkenkanzen.com/api';

/**
 * アプリ公開URL（ログイン後のアプリ本体）
 */
export const APP_URL = 'https://app.takkenkanzen.com';

/**
 * ブランドサイト（LP・マーケティング・特商法表示の出元）
 */
export const BRAND_URL = 'https://takkenkanzen.com';

/**
 * アプリバージョン
 */
export const APP_VERSION = '1.0.0';

/**
 * Supabase 接続情報
 */
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
