// ============================================================
// アプリ設定・環境変数
// ============================================================

/**
 * API ベースURL
 * 環境変数で上書き可能（開発 / ステージング / 本番）
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || 'https://takken-app-olive.vercel.app/api';

/**
 * アプリ公開URL
 */
export const APP_URL = 'https://takken-app-olive.vercel.app';

/**
 * アプリバージョン
 */
export const APP_VERSION = '1.0.0';

/**
 * Supabase 接続情報
 */
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
