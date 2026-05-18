// ============================================================
// 認証ストア
// Supabase認証（メール・パスワード / OAuth）
// 未設定時はオフラインモードで動作
// ============================================================

import { create } from 'zustand';
import { Platform } from 'react-native';
import type { Session, User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { logError } from '../services/errorLogger';
import { isValidEmail, validatePassword } from '../services/validation';
import { syncAnalyticsExclusionForUser } from '../services/analytics';
import { useProgressStore } from './useProgressStore';
import { useSettingsStore } from './useSettingsStore';
import { useAchievementStore } from './useAchievementStore';
import { useExamStore } from './useExamStore';
import { useReportStore } from './useReportStore';
import { useQuestStore } from './useQuestStore';
import { useSessionStore } from './useSessionStore';
import type { SubscriptionPlan } from '../types';

// onAuthStateChange のリスナー追跡（HMR / 多重 init() 対策）
// モジュールスコープで1つだけ保持し、再 init 時に古いリスナーを解除する
let authStateSub: { unsubscribe: () => void } | null = null;

/**
 * ユーザーのプラン情報を同期
 * セキュリティ: サーバーAPI経由で検証（/api/verify-subscription）
 * これによりDevTools/AsyncStorage改ざんによる不正を防ぐ
 */
async function syncPlanForUser(user: User, accessToken?: string) {
  // サーバーAPI経由でプラン検証（lastVerifiedAt が更新される）
  if (accessToken) {
    await useSettingsStore.getState().verifySubscription(accessToken);
    return;
  }

  // トークンがない場合のみフォールバック: profiles テーブルから読む
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('plan, subscription_status, trial_ends_at')
      .eq('id', user.id)
      .single();
    if (error || !data) return;
    const plan = (data.plan as SubscriptionPlan) || 'free';
    if (plan !== 'free') {
      useSettingsStore.getState().setPlan(plan, data.trial_ends_at ?? undefined);
    }
  } catch {
    // profiles テーブルが未作成 or ネットワークエラー → 無視
  }
}

/**
 * Clear all app-specific AsyncStorage keys on logout/account deletion.
 * This prevents stale data from leaking into the next session.
 */
async function clearAllLocalData() {
  // [FIX] @takken_onboarding_done は意図的に残す
  // → ログアウト → 再ログイン時に「またオンボーディング画面」が表示される問題を回避
  // 同一デバイスで一度オンボーディング完了 = それ以降は何度ログインしても表示されない
  // 別デバイスで初ログインの場合は次のクラウド同期ロジックでスキップ判定される
  const keys = [
    '@takken_progress',
    '@takken_settings',
    '@takken_quest',
    '@takken_reports',
    '@takken_achievements',
    '@takken_exam_history',
  ];
  await AsyncStorage.multiRemove(keys);

  // SECURITY: cloudSync のモジュールスコープ状態（dirtyIds, lastSyncTimestamp）を必ずリセット。
  // これを忘れると次ユーザーのログインで前ユーザーの未同期データが書き込まれる事故になる。
  try {
    const { resetSyncState } = await import('../services/cloudSync');
    resetSyncState();
  } catch {}
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

      // 既存セッションがある場合、JWTをリフレッシュして最新のmetadataを取得
      let activeSession = data.session;
      if (data.session) {
        // [タイムアウト] 5秒以内に返らなければスキップ（Supabaseハング時にアプリが固まらないように）
        const refreshPromise = supabase.auth.refreshSession();
        const timeoutPromise = new Promise<{ data: { session: null }; error: { message: string } }>((resolve) =>
          setTimeout(() => resolve({ data: { session: null }, error: { message: 'refresh_timeout' } }), 5000),
        );
        const result = await Promise.race([refreshPromise, timeoutPromise]) as any;
        const { data: refreshed, error: refreshError } = result;

        // タイムアウトはエラー扱いしない（既存セッションを使用）
        if (refreshError && refreshError.message !== 'refresh_timeout') {
          // [セキュリティ] リフレッシュ失敗時（トークン失効・取り消し）は強制サインアウト
          logError(refreshError, { context: 'auth.refresh.failed' });
          await supabase.auth.signOut();
          await clearAllLocalData();
          set({ session: null, user: null, initialized: true });
          return;
        }
        if (refreshed?.session) {
          activeSession = refreshed.session;
        }
      }

      // [Security Fix] セッションのユーザーがメール未確認の場合、起動時に自動ログインしない
      // Supabase Dashboard で Email Confirmation が OFF でも、アプリ側で防御層を作る
      if (
        activeSession?.user &&
        !activeSession.user.email_confirmed_at &&
        !activeSession.user.confirmed_at &&
        activeSession.user.app_metadata?.provider === 'email'
      ) {
        logError(new Error('unconfirmed_email_session_blocked'), { context: 'auth.init.unconfirmed' });
        await supabase.auth.signOut({ scope: 'global' });
        set({ session: null, user: null, initialized: true });
        return;
      }

      set({
        session: activeSession,
        user: activeSession?.user ?? null,
        initialized: true,
      });

      // [計測除外] admin email でログイン中なら Google Ads/GA4 計測を自動除外
      // → 自己コンバージョンで広告データが汚れない
      syncAnalyticsExclusionForUser(activeSession?.user?.email ?? null);

      // 既存リスナーがあれば先に解除（HMR・多重 init 対策。リスナーリーク防止）
      if (authStateSub) {
        try { authStateSub.unsubscribe(); } catch {}
        authStateSub = null;
      }
      const { data: subData } = supabase.auth.onAuthStateChange((event, session) => {
        // SECURITY: signOut 直後に TOKEN_REFRESHED 等が発火し、
        // セッションが既に null/別ユーザーでも setTimeout が前ユーザー id で発火する race を防ぐため
        // 発火時点での current user を再確認してから sync する
        const eventUserId = session?.user?.id ?? null;
        set({ session, user: session?.user ?? null });

        // [計測除外] ユーザー切替・ログアウトのたびに admin 判定を更新
        syncAnalyticsExclusionForUser(session?.user?.email ?? null);

        // SIGNED_OUT は state を消すだけで sync 不要
        if (event === 'SIGNED_OUT' || !session?.user || !eventUserId) return;

        // Add jitter to prevent thundering herd
        const jitter = Math.random() * 5000;
        setTimeout(() => {
          // 発火時とタイマー実行時で user が変わってないか再確認
          const currentUser = useAuthStore.getState().user;
          if (!currentUser || currentUser.id !== eventUserId) return;
          useProgressStore.getState().syncWithCloud(eventUserId);
        }, jitter);
        // プラン情報を同期（即時。token は session 由来）
        syncPlanForUser(session.user, session.access_token);
      });
      authStateSub = subData?.subscription ?? null;
      // 既存セッションがあれば起動時に同期
      if (activeSession?.user) {
        // Add jitter to prevent thundering herd
        const jitter = Math.random() * 5000;
        setTimeout(() => useProgressStore.getState().syncWithCloud(activeSession!.user.id), jitter);
        // プラン情報を同期
        syncPlanForUser(activeSession.user, activeSession.access_token);
      }
    } catch (e) {
      logError(e, { context: 'auth.init' });
      set({ initialized: true });
    }
  },

  async signInWithEmail(email, password) {
    if (!isSupabaseConfigured()) return { error: '認証サーバーが未設定です' };
    // 入力バリデーション (コピペで両端空白付き email を許容)
    const trimmedEmail = email.trim();
    if (!isValidEmail(trimmedEmail)) return { error: 'メールアドレスの形式が正しくありません' };
    if (!password || password.length < 1) return { error: 'パスワードを入力してください' };
    set({ loading: true });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      set({ loading: false });
      if (error) {
        logError(error, { context: 'auth.signIn' });
        return { error: 'メールアドレスまたはパスワードが正しくありません' };
      }
      // [Security Fix] メール未確認のユーザーはログインを拒否し、即座にサインアウト
      // Supabase Dashboard で Email Confirmation が OFF でも、アプリ側で防御層を作る
      if (data?.user && !data.user.email_confirmed_at && !data.user.confirmed_at) {
        // セキュリティ: 確認メールリンクをクリックするまでアプリ使用を拒否
        await supabase.auth.signOut({ scope: 'global' });
        return {
          error:
            'メール確認が完了していません。\n登録メールアドレスに送信された確認リンクをクリックしてください。\n（迷惑メールフォルダもご確認ください）',
        };
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
      if (Platform.OS === 'web') {
        // Web: 通常のOAuthリダイレクト
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
      }

      // Native: システムブラウザ（Safari/Chrome）で開く
      // GoogleはWebViewからのOAuthをブロックするため
      // redirectTo を deep link に明示することで OAuth 完了後 WebBrowser が自動 close する
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          skipBrowserRedirect: true,
          redirectTo: 'takken-app://auth/callback',
        },
      });
      if (error || !data.url) {
        set({ loading: false });
        logError(error, { context: 'auth.signInWithGoogle.native' });
        return { error: 'Googleログインに失敗しました' };
      }

      // システムブラウザで認証URLを開く
      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        'takken-app://auth/callback',
      );

      // [Bugfix] Silent fail 防止: success 以外の結果を明示的にエラー扱い
      // 'cancel': ユーザーがブラウザを閉じた
      // 'dismiss': iOS で何らかの理由で閉じられた
      // 'locked': デバイスロック等
      if (result.type === 'cancel' || result.type === 'dismiss') {
        set({ loading: false });
        // ユーザーがキャンセルした場合は静かに戻る
        return { error: null };
      }
      if (result.type !== 'success' || !result.url) {
        set({ loading: false });
        logError(new Error(`OAuth result type=${result.type}`), {
          context: 'auth.signInWithGoogle.unknownResult',
        });
        return { error: 'Googleログインが完了しませんでした。もう一度お試しください' };
      }

      // コールバックURLからトークンまたは code を抽出
      // Supabase デフォルトは PKCE フロー → code を交換
      // 旧 implicit フローの場合は access_token/refresh_token を直接使用
      const url = new URL(result.url);
      const code = url.searchParams.get('code');

      if (code) {
        // PKCE フロー: code を session に交換
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          logError(exchangeError, { context: 'auth.signInWithGoogle.exchangeCode' });
          set({ loading: false });
          return { error: 'セッションの設定に失敗しました' };
        }
        set({ loading: false });
        return { error: null };
      }

      // 旧 implicit フロー（fallback）
      const params = new URLSearchParams(
        url.hash ? url.hash.substring(1) : url.search.substring(1),
      );
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) {
          logError(sessionError, { context: 'auth.signInWithGoogle.setSession' });
          set({ loading: false });
          return { error: 'セッションの設定に失敗しました' };
        }
        set({ loading: false });
        return { error: null };
      }

      // [Bugfix] code も token も取れなかった場合は明示的にエラー
      // 多くは Supabase の Redirect URL allowlist に takken-app:// が登録されておらず、
      // Web の URL に飛ばされて scheme が認識されなかったケース
      logError(new Error(`callback URL has no code/token: ${result.url}`), {
        context: 'auth.signInWithGoogle.noCredentials',
      });
      set({ loading: false });
      return {
        error: '認証情報を取得できませんでした。Supabase の Redirect URL に takken-app:// が登録されているか確認してください',
      };
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
    try {
      // [Bugfix] global scope で Server 側のセッションも無効化
      await supabase.auth.signOut({ scope: 'global' });
    } catch (e) {
      logError(e, { context: 'auth.signOut.supabase' });
    }
    // [Bugfix] Supabase SDK の secureStorage 経由削除が完全に走らないケースを救済
    // 明示的にセッションキーを除去して、再起動時に getSession() が古いセッションを返さないようにする
    try {
      const { secureStorage } = await import('../services/secureStorage');
      // Supabase v2 のセッションキー (project-ref ベース)
      const projectRef = (process.env.EXPO_PUBLIC_SUPABASE_URL || '')
        .match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
      if (projectRef) {
        await secureStorage.removeItem(`sb-${projectRef}-auth-token`);
        // [Bugfix] PKCE フロー用 code_verifier も明示削除（次回 OAuth で stale verifier が使われる事故防止）
        await secureStorage.removeItem(`sb-${projectRef}-auth-token-code-verifier`);
      }
    } catch (e) {
      logError(e, { context: 'auth.signOut.forceClearStorage' });
    }
    await clearAllLocalData();
    // Reset ALL stores to initial state（前ユーザーの実績/試験履歴/誤り報告等が残らないように）
    useProgressStore.getState().resetProgress();
    useSettingsStore.getState().resetStore();
    useAchievementStore.getState().resetStore();
    useExamStore.getState().resetStore();
    useReportStore.getState().resetStore();
    useQuestStore.getState().resetQuest();
    useSessionStore.getState().resetCombo();
    useSessionStore.getState().resetDailyFlags();
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
      // Reset ALL stores to initial state
      useProgressStore.getState().resetProgress();
      useSettingsStore.getState().resetStore();
      useAchievementStore.getState().resetStore();
      useExamStore.getState().resetStore();
      useReportStore.getState().resetStore();
      useQuestStore.getState().resetQuest();
      useSessionStore.getState().resetCombo();
      useSessionStore.getState().resetDailyFlags();
      set({ user: null, session: null });
    }
    return { error: error?.message ?? null };
  },
}));
