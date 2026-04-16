// ============================================================
// 認証ストア
// Supabase認証（メール・パスワード / OAuth）
// 未設定時はオフラインモードで動作
// ============================================================

import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { logError } from '../services/errorLogger';
import { isValidEmail, validatePassword } from '../services/validation';
import { useProgressStore } from './useProgressStore';
import { useSettingsStore } from './useSettingsStore';

/**
 * Clear all app-specific AsyncStorage keys on logout/account deletion.
 * This prevents stale data from leaking into the next session.
 */
async function clearAllLocalData() {
  const keys = [
    '@takken_progress',
    '@takken_settings',
    '@takken_quest',
    '@takken_reports',
    '@takken_achievements',
    '@takken_exam_history',
    '@takken_onboarding_done',
  ];
  await AsyncStorage.multiRemove(keys);
}

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  initialized: boolean;

  init(): Promise<void>;
  signInWithEmail(email: string, password: string): Promise<{ error: string | null }>;
  signUpWithEmail(email: string, password: string): Promise<{ error: string | null }>;
  signInWithGoogle(): Promise<{ error: string | null }>;
  resetPassword(email: string): Promise<{ error: string | null }>;
  signOut(): Promise<void>;
  deleteAccount(): Promise<{ error: string | null }>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: false,
  initialized: false,

  async init() {
    if (!isSupabaseConfigured()) {
      set({ initialized: true });
      return;
    }
    try {
      const { data } = await supabase.auth.getSession();
      set({
        session: data.session,
        user: data.session?.user ?? null,
        initialized: true,
      });
      supabase.auth.onAuthStateChange((_event, session) => {
        set({ session, user: session?.user ?? null });
        if (session?.user) {
          // Add jitter to prevent thundering herd
          const jitter = Math.random() * 5000;
          setTimeout(() => useProgressStore.getState().syncWithCloud(session.user.id), jitter);
        }
      });
      // 既存セッションがあれば起動時に同期
      if (data.session?.user) {
        // Add jitter to prevent thundering herd
        const jitter = Math.random() * 5000;
        setTimeout(() => useProgressStore.getState().syncWithCloud(data.session!.user.id), jitter);
      }
    } catch (e) {
      logError(e, { context: 'auth.init' });
      set({ initialized: true });
    }
  },

  async signInWithEmail(email, password) {
    if (!isSupabaseConfigured()) return { error: '認証サーバーが未設定です' };
    // 入力バリデーション
    if (!isValidEmail(email)) return { error: 'メールアドレスの形式が正しくありません' };
    if (!password || password.length < 1) return { error: 'パスワードを入力してください' };
    set({ loading: true });
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      set({ loading: false });
      if (error) {
        logError(error, { context: 'auth.signIn' });
        return { error: 'メールアドレスまたはパスワードが正しくありません' };
      }
      return { error: null };
    } catch (e) {
      set({ loading: false });
      logError(e, { context: 'auth.signIn' });
      return { error: 'ログインに失敗しました。通信環境を確認してください' };
    }
  },

  async signUpWithEmail(email, password) {
    if (!isSupabaseConfigured()) return { error: '認証サーバーが未設定です' };
    // 入力バリデーション
    if (!isValidEmail(email)) return { error: 'メールアドレスの形式が正しくありません' };
    const pwCheck = validatePassword(password);
    if (!pwCheck.valid) return { error: pwCheck.message };
    set({ loading: true });
    try {
      const { error } = await supabase.auth.signUp({ email: email.trim(), password });
      set({ loading: false });
      if (error) {
        logError(error, { context: 'auth.signUp' });
        if (error.message.includes('already registered')) {
          return { error: 'このメールアドレスは既に登録されています' };
        }
        return { error: 'アカウント作成に失敗しました。時間をおいて再度お試しください' };
      }
      return { error: null };
    } catch (e) {
      set({ loading: false });
      logError(e, { context: 'auth.signUp' });
      return { error: 'アカウント作成に失敗しました。通信環境を確認してください' };
    }
  },

  async signInWithGoogle() {
    if (!isSupabaseConfigured()) return { error: '認証サーバーが未設定です' };
    set({ loading: true });
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof window !== 'undefined'
            ? `${window.location.origin}`
            : undefined,
        },
      });
      set({ loading: false });
      if (error) {
        logError(error, { context: 'auth.signInWithGoogle' });
        return { error: 'Googleログインに失敗しました' };
      }
      return { error: null };
    } catch (e) {
      set({ loading: false });
      logError(e, { context: 'auth.signInWithGoogle' });
      return { error: 'Googleログインに失敗しました。通信環境を確認してください' };
    }
  },

  async resetPassword(email: string) {
    if (!isSupabaseConfigured()) return { error: '認証サーバーが未設定です' };
    if (!isValidEmail(email)) return { error: 'メールアドレスの形式が正しくありません' };
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: typeof window !== 'undefined'
          ? `${window.location.origin}/auth/reset-password`
          : undefined,
      });
      if (error) {
        logError(error, { context: 'auth.resetPassword' });
        return { error: 'パスワードリセットメールの送信に失敗しました' };
      }
      return { error: null };
    } catch (e) {
      logError(e, { context: 'auth.resetPassword' });
      return { error: '通信エラーが発生しました' };
    }
  },

  async signOut() {
    if (!isSupabaseConfigured()) return;
    await supabase.auth.signOut();
    await clearAllLocalData();
    // Reset all stores to initial state
    useProgressStore.getState().resetProgress();
    useSettingsStore.getState().resetStore();
    set({ user: null, session: null });
  },

  async deleteAccount() {
    if (!isSupabaseConfigured()) return { error: '認証サーバーが未設定です' };
    const user = get().user;
    if (!user) return { error: 'ログインしていません' };
    // 実装上、ユーザー削除はRPC経由で行う（RLS保護のため）
    const { error } = await supabase.rpc('delete_current_user');
    if (!error) {
      await supabase.auth.signOut();
      await clearAllLocalData();
      // Reset all stores to initial state
      useProgressStore.getState().resetProgress();
      useSettingsStore.getState().resetStore();
      set({ user: null, session: null });
    }
    return { error: error?.message ?? null };
  },
}));
