// ============================================================
// Supabase クライアント
// 認証トークンは expo-secure-store に保存（AsyncStorage より安全）
// URL/KEY 未設定時はクライアント生成しない（Web開発時対応）
// ============================================================

import 'react-native-url-polyfill/auto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { secureStorage } from './secureStorage';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!_client) {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase is not configured');
    }
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: {
          getItem: (k) => secureStorage.getItem(k),
          setItem: (k, v) => secureStorage.setItem(k, v),
          removeItem: (k) => secureStorage.removeItem(k),
        },
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return _client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!isSupabaseConfigured()) {
      // 未設定時は安全にno-opを返す
      if (prop === 'auth') {
        return {
          getSession: async () => ({ data: { session: null }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
          signInWithPassword: async () => ({ error: { message: '認証サーバーが未設定です' } }),
          signUp: async () => ({ error: { message: '認証サーバーが未設定です' } }),
          signOut: async () => ({}),
        };
      }
      if (prop === 'from') {
        return () => ({
          select: () => ({ eq: () => ({ data: [], error: null }), maybeSingle: () => ({ data: null, error: null }) }),
          upsert: async () => ({ error: null }),
        });
      }
      if (prop === 'rpc') {
        return async () => ({ error: { message: '認証サーバーが未設定です' } });
      }
      return undefined;
    }
    return (getClient() as any)[prop];
  },
});

export const isSupabaseConfigured = (): boolean =>
  SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
