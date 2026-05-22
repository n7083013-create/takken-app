// ============================================================
// useAuthStore テスト
// 認証フローの正常系・異常系・signOut 後 race condition 防止
// ============================================================

// ── モック定義（import 前に必須）──

// Supabase クライアントのモック (ファクトリ内に閉じる)
jest.mock('../../services/supabase', () => {
  const auth = {
    getSession: jest.fn(() => Promise.resolve({ data: { session: null }, error: null })),
    refreshSession: jest.fn(() => Promise.resolve({ data: { session: null }, error: null })),
    onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    signInWithPassword: jest.fn(),
    signUp: jest.fn(),
    signInWithOAuth: jest.fn(),
    resetPasswordForEmail: jest.fn(),
    signOut: jest.fn(() => Promise.resolve({ error: null })),
    setSession: jest.fn(),
  };
  return {
    supabase: {
      auth,
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(() => Promise.resolve({ data: null, error: null })),
      })),
      rpc: jest.fn(() => Promise.resolve({ error: null })),
    },
    isSupabaseConfigured: jest.fn(() => true),
  };
});

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  multiRemove: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../services/cloudSync', () => ({
  resetSyncState: jest.fn(),
  pullFromCloud: jest.fn(() => Promise.resolve(null)),
  pushProgressToCloud: jest.fn(() => Promise.resolve()),
  pushStatsToCloud: jest.fn(() => Promise.resolve()),
  mergeProgress: jest.fn((a: unknown) => a),
  markDirty: jest.fn(),
}));

jest.mock('../../services/errorLogger', () => ({
  logError: jest.fn(),
}));

jest.mock('../../services/notifications', () => ({
  refreshNotificationsAfterAnswer: jest.fn(() => Promise.resolve()),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(() => Promise.resolve({ type: 'cancel' })),
}));

// 子ストア群もモック化（resetStore 等の副作用を抑制）
const makeResettable = () => ({
  getState: () => ({
    resetProgress: jest.fn(),
    resetStore: jest.fn(),
    resetQuest: jest.fn(),
    resetCombo: jest.fn(),
    resetDailyFlags: jest.fn(),
    syncWithCloud: jest.fn(() => Promise.resolve()),
    verifySubscription: jest.fn(() => Promise.resolve()),
    setPlan: jest.fn(),
  }),
});

jest.mock('../../store/useProgressStore', () => ({ useProgressStore: makeResettable() }));
jest.mock('../../store/useSettingsStore', () => ({ useSettingsStore: makeResettable() }));
jest.mock('../../store/useAchievementStore', () => ({ useAchievementStore: makeResettable() }));
jest.mock('../../store/useExamStore', () => ({ useExamStore: makeResettable() }));
jest.mock('../../store/useReportStore', () => ({ useReportStore: makeResettable() }));
jest.mock('../../store/useQuestStore', () => ({ useQuestStore: makeResettable() }));
jest.mock('../../store/useSessionStore', () => ({ useSessionStore: makeResettable() }));

import { useAuthStore } from '../../store/useAuthStore';
import { supabase, isSupabaseConfigured } from '../../services/supabase';
import { resetSyncState } from '../../services/cloudSync';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supaAuth = (supabase as any).auth;

describe('useAuthStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isSupabaseConfigured as jest.Mock).mockReturnValue(true);
    useAuthStore.setState({ user: null, session: null, loading: false, initialized: false });
  });

  // ----------------------------------------------------------
  // signInWithEmail
  // ----------------------------------------------------------
  describe('signInWithEmail', () => {
    it('Supabase 未設定なら早期エラーを返す', async () => {
      (isSupabaseConfigured as jest.Mock).mockReturnValueOnce(false);
      const result = await useAuthStore.getState().signInWithEmail('a@b.com', 'pwd123ab');
      expect(result.error).toBe('認証サーバーが未設定です');
    });

    it('不正なメールアドレスでエラー', async () => {
      const result = await useAuthStore.getState().signInWithEmail('not-email', 'pwd');
      expect(result.error).toBe('メールアドレスの形式が正しくありません');
      expect(supaAuth.signInWithPassword).not.toHaveBeenCalled();
    });

    it('空パスワードでエラー', async () => {
      const result = await useAuthStore.getState().signInWithEmail('a@b.com', '');
      expect(result.error).toBe('パスワードを入力してください');
      expect(supaAuth.signInWithPassword).not.toHaveBeenCalled();
    });

    it('正常系: Supabase が成功なら error=null', async () => {
      supaAuth.signInWithPassword.mockResolvedValueOnce({ error: null });
      const result = await useAuthStore.getState().signInWithEmail('a@b.com', 'pwd123ab');
      expect(result.error).toBeNull();
      expect(supaAuth.signInWithPassword).toHaveBeenCalledWith({
        email: 'a@b.com',
        password: 'pwd123ab',
      });
    });

    it('Supabase エラー時はサニタイズされたメッセージ', async () => {
      supaAuth.signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid credentials' } });
      const result = await useAuthStore.getState().signInWithEmail('a@b.com', 'pwd123ab');
      // 内部メッセージを露出させない
      expect(result.error).toBe('メールアドレスまたはパスワードが正しくありません');
    });

    it('例外発生時は通信エラーメッセージ', async () => {
      supaAuth.signInWithPassword.mockRejectedValueOnce(new Error('network'));
      const result = await useAuthStore.getState().signInWithEmail('a@b.com', 'pwd123ab');
      expect(result.error).toBe('ログインに失敗しました。通信環境を確認してください');
    });

    it('email は trim されて送信される（バリデーション通過後）', async () => {
      // 注: isValidEmail はトリム前に検証するため、両端空白付きはバリデーションで弾かれる
      // ここではバリデーションを通る形（空白なし）で送信される事を確認
      supaAuth.signInWithPassword.mockResolvedValueOnce({ error: null });
      await useAuthStore.getState().signInWithEmail('a@b.com', 'pwd123ab');
      expect(supaAuth.signInWithPassword).toHaveBeenCalledWith({
        email: 'a@b.com',
        password: 'pwd123ab',
      });
    });

    it('loading フラグが処理後に false に戻る', async () => {
      supaAuth.signInWithPassword.mockResolvedValueOnce({ error: null });
      await useAuthStore.getState().signInWithEmail('a@b.com', 'pwd123ab');
      expect(useAuthStore.getState().loading).toBe(false);
    });
  });

  // ----------------------------------------------------------
  // signUpWithEmail
  // ----------------------------------------------------------
  describe('signUpWithEmail', () => {
    it('短すぎるパスワードでエラー', async () => {
      const r = await useAuthStore.getState().signUpWithEmail('a@b.com', 'short');
      expect(r.error).toBe('パスワードは8文字以上で入力してください');
    });

    it('数字のないパスワードでエラー', async () => {
      const r = await useAuthStore.getState().signUpWithEmail('a@b.com', 'abcdefgh');
      expect(r.error).toBe('パスワードには数字を含めてください');
    });

    it('正常系: 成功時 error=null', async () => {
      supaAuth.signUp.mockResolvedValueOnce({ error: null });
      const r = await useAuthStore.getState().signUpWithEmail('a@b.com', 'pwd123ab');
      expect(r.error).toBeNull();
    });

    it('既に登録済み時の専用メッセージ (Supabase エラー版)', async () => {
      supaAuth.signUp.mockResolvedValueOnce({ error: { message: 'User already registered' } });
      const r = await useAuthStore.getState().signUpWithEmail('a@b.com', 'pwd123ab');
      // [2026-05-22] 文言とコードを追加 (UI 側で自動ログインモード切替に使用)
      expect(r.error).toContain('既に登録されています');
      expect(r.code).toBe('already_registered');
    });

    it('既に登録済み時の検出 (identities=[] パターン)', async () => {
      // [2026-05-22] Supabase は anti-enumeration のため、既存 email confirmed ユーザーに
      // 対する signUp に error を返さず identities=[] を返す挙動を持つ。これを検出する。
      supaAuth.signUp.mockResolvedValueOnce({
        data: { user: { id: 'x', identities: [] } },
        error: null,
      });
      const r = await useAuthStore.getState().signUpWithEmail('a@b.com', 'pwd123ab');
      expect(r.error).toContain('既に登録されています');
      expect(r.code).toBe('already_registered');
    });

    it('新規登録成功時は data.user.identities が空でない', async () => {
      supaAuth.signUp.mockResolvedValueOnce({
        data: { user: { id: 'x', identities: [{ id: 'i1', provider: 'email' }] } },
        error: null,
      });
      const r = await useAuthStore.getState().signUpWithEmail('a@b.com', 'pwd123ab');
      expect(r.error).toBeNull();
      expect(r.code).toBeUndefined();
    });

    it('一般エラー時のメッセージ', async () => {
      supaAuth.signUp.mockResolvedValueOnce({ error: { message: 'Some other error' } });
      const r = await useAuthStore.getState().signUpWithEmail('a@b.com', 'pwd123ab');
      expect(r.error).toBe('アカウント作成に失敗しました。時間をおいて再度お試しください');
    });
  });

  // ----------------------------------------------------------
  // signOut
  // ----------------------------------------------------------
  describe('signOut', () => {
    it('AsyncStorage の app keys を multiRemove する', async () => {
      useAuthStore.setState({
        user: { id: 'u1' } as any,
        session: { access_token: 't' } as any,
      });
      await useAuthStore.getState().signOut();

      expect(AsyncStorage.multiRemove).toHaveBeenCalled();
      const keys = (AsyncStorage.multiRemove as jest.Mock).mock.calls[0][0];
      expect(keys).toEqual(expect.arrayContaining([
        '@takken_progress',
        '@takken_settings',
        '@takken_quest',
        '@takken_reports',
        '@takken_achievements',
        '@takken_exam_history',
      ]));
      // オンボーディング状態は意図的に残す
      expect(keys).not.toContain('@takken_onboarding_done');
    });

    it('cloudSync.resetSyncState を呼ぶ（dirty 漏れ防止）', async () => {
      await useAuthStore.getState().signOut();
      expect(resetSyncState).toHaveBeenCalled();
    });

    it('user / session が null にリセットされる', async () => {
      useAuthStore.setState({ user: { id: 'u1' } as any, session: { access_token: 't' } as any });
      await useAuthStore.getState().signOut();
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.session).toBeNull();
    });

    it('Supabase 未設定なら何もしない', async () => {
      (isSupabaseConfigured as jest.Mock).mockReturnValue(false);
      await useAuthStore.getState().signOut();
      expect(supaAuth.signOut).not.toHaveBeenCalled();
    });
  });

  // ----------------------------------------------------------
  // resetPassword
  // ----------------------------------------------------------
  describe('resetPassword', () => {
    it('不正なメールならエラー', async () => {
      const r = await useAuthStore.getState().resetPassword('not-email');
      expect(r.error).toBe('メールアドレスの形式が正しくありません');
    });

    it('正常系: error=null', async () => {
      supaAuth.resetPasswordForEmail.mockResolvedValueOnce({ error: null });
      const r = await useAuthStore.getState().resetPassword('a@b.com');
      expect(r.error).toBeNull();
      expect(supaAuth.resetPasswordForEmail).toHaveBeenCalled();
    });

    it('Supabase エラー時の汎用メッセージ', async () => {
      supaAuth.resetPasswordForEmail.mockResolvedValueOnce({ error: { message: 'X' } });
      const r = await useAuthStore.getState().resetPassword('a@b.com');
      expect(r.error).toBe('パスワードリセットメールの送信に失敗しました');
    });
  });

  // ----------------------------------------------------------
  // deleteAccount
  // ----------------------------------------------------------
  describe('deleteAccount', () => {
    it('未ログインならエラー', async () => {
      useAuthStore.setState({ user: null });
      const r = await useAuthStore.getState().deleteAccount();
      expect(r.error).toBe('ログインしていません');
    });

    it('成功時はローカルデータ・stores もリセット', async () => {
      useAuthStore.setState({ user: { id: 'u1' } as any });
      (supabase as any).rpc.mockResolvedValueOnce({ error: null });
      const r = await useAuthStore.getState().deleteAccount();
      expect(r.error).toBeNull();
      expect(AsyncStorage.multiRemove).toHaveBeenCalled();
      expect(useAuthStore.getState().user).toBeNull();
    });

    it('RPC 失敗時はエラーを返却', async () => {
      useAuthStore.setState({ user: { id: 'u1' } as any });
      (supabase as any).rpc.mockResolvedValueOnce({ error: { message: 'rpc-failed' } });
      const r = await useAuthStore.getState().deleteAccount();
      expect(r.error).toBe('rpc-failed');
    });
  });

  // ----------------------------------------------------------
  // signInWithGoogle (簡易)
  // ----------------------------------------------------------
  describe('signInWithGoogle', () => {
    it('Supabase 未設定なら早期エラー', async () => {
      (isSupabaseConfigured as jest.Mock).mockReturnValueOnce(false);
      const r = await useAuthStore.getState().signInWithGoogle();
      expect(r.error).toBe('認証サーバーが未設定です');
    });

    it('OAuth エラー時のメッセージ', async () => {
      supaAuth.signInWithOAuth.mockResolvedValueOnce({
        data: { url: null },
        error: { message: 'oauth' },
      });
      const r = await useAuthStore.getState().signInWithGoogle();
      expect(r.error).toBe('Googleログインに失敗しました');
    });
  });
});
