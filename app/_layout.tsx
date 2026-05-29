// [Sentry] 起動時の最初に Sentry を初期化（他の import より先に呼びたいので冒頭で行う）
import { initSentry, setSentryUser } from '../services/sentry';
initSentry();

import { useEffect, useRef } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, Text, ActivityIndicator, StyleSheet, Platform, AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useProgressStore } from '../store/useProgressStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useReportStore } from '../store/useReportStore';
import { useAuthStore } from '../store/useAuthStore';
import { useQuestStore } from '../store/useQuestStore';
import { useAchievementStore } from '../store/useAchievementStore';
import { useExamStore } from '../store/useExamStore';
import { useSessionStore } from '../store/useSessionStore';
import { installGlobalErrorHandler } from '../services/errorLogger';
import { initializeIAP, retryPendingPurchases } from '../services/iap';
import { useThemeColors, useIsDark } from '../hooks/useThemeColors';
import {
  requestNotificationPermission,
  scheduleDailyReminder,
  scheduleWeeklySummary,
} from '../services/notifications';
import { pushProgressToCloud, pushStatsToCloud } from '../services/cloudSync';
import ErrorBoundary from '../components/ErrorBoundary';
import { OfflineBanner } from '../components/OfflineBanner';
import { SyncErrorBanner } from '../components/SyncErrorBanner';
import { AchievementToast } from '../components/AchievementToast';

export default function RootLayout() {
  const loadProgress = useProgressStore((s) => s.loadProgress);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const loadReports = useReportStore((s) => s.loadReports);
  const initAuth = useAuthStore((s) => s.init);
  const loadQuest = useQuestStore((s) => s.loadQuest);
  const loadAchievements = useAchievementStore((s) => s.loadAchievements);
  const loadExamHistory = useExamStore((s) => s.loadHistory);
  const loadCelebrated = useSessionStore((s) => s.loadCelebrated);
  const settings = useSettingsStore((s) => s.settings);
  const getDueForReview = useProgressStore((s) => s.getDueForReview);
  const colors = useThemeColors();
  const isDark = useIsDark();
  const router = useRouter();
  const didRedirect = useRef(false);

  useEffect(() => {
    installGlobalErrorHandler();
    (async () => {
      // [FIX A1] Settings を先に読み込み（テーマ依存）、残りは並列化で起動高速化
      await loadSettings();
      await Promise.all([
        loadProgress(),
        loadQuest(),
        loadReports(),
        loadAchievements(),
        loadExamHistory(),
        loadCelebrated(),
      ]);
      // Auth は他ストアの後に初期化（セッション復元後にsync等が走るため）
      await initAuth();
      // 未送信の問題報告を再送(前回オフライン/送信失敗分)。トークンが要るので auth 後。
      useReportStore.getState().syncPendingReports().catch(() => {});
      // IAP（Native のみ）— 起動後に非ブロッキングで購入リスナーを起動
      if (Platform.OS !== 'web') {
        initializeIAP().catch(() => {});
        // Issue #7: 前回起動時に verify 失敗したまま残っている購入を再検証
        // (起動後 5秒待ってネット安定 + ログイン復元を待つ)
        setTimeout(() => { retryPendingPurchases().catch(() => {}); }, 5000);
      }
    })();
  }, []);

  // OAuth後のリダイレクト処理 & サブスク検証
  const user = useAuthStore((s) => s.user);
  const session = useAuthStore((s) => s.session);
  const initialized = useAuthStore((s) => s.initialized);
  const verifySubscription = useSettingsStore((s) => s.verifySubscription);

  // [Sentry] ユーザー変更時に Sentry のユーザーコンテキストを更新
  // email は送らず id のみ。ログアウト時は null。
  useEffect(() => {
    setSentryUser(user?.id ?? null);
  }, [user?.id]);

  useEffect(() => {
    if (!initialized || !user) return;

    // サーバー側でサブスク状態を検証（改ざん防止）
    if (session?.access_token) {
      verifySubscription(session.access_token);
    }

    // OAuth後のリダイレクト
    if (didRedirect.current) return;
    (async () => {
      let returnTo: string | null = null;
      if (Platform.OS === 'web') {
        if (typeof window === 'undefined') return;
        returnTo = localStorage?.getItem('auth_returnTo') ?? null;
        if (returnTo) localStorage?.removeItem('auth_returnTo');
      } else {
        returnTo = await AsyncStorage.getItem('auth_returnTo');
        if (returnTo) await AsyncStorage.removeItem('auth_returnTo');
      }
      if (returnTo) {
        didRedirect.current = true;
        router.replace(returnTo as any);
      }
    })();
  }, [user, initialized]);

  const stats = useProgressStore((s) => s.stats);
  const getDaysUntilExam = useSettingsStore((s) => s.getDaysUntilExam);

  // [Phase 2] ログイン直後・フォアグラウンド復帰時に全ストアをクラウドと同期
  // - useProgressStore: 既存 (4択進捗 + 統計)
  // - useAchievementStore: 実績バッジ (新規)
  // - useExamStore: 模試履歴 (新規)
  // - useQuestStore: クエスト進捗 (新規)
  // 全ストアに空 push 防止ガードを実装済み → クラウドデータの誤上書きは物理的に発生しない
  useEffect(() => {
    if (!user) return;
    const syncAll = async () => {
      const uid = user.id;
      // 並列実行: 各ストアは独立、失敗してもアプリは継続
      await Promise.allSettled([
        useProgressStore.getState().syncWithCloud(uid),
        useAchievementStore.getState().syncWithCloud(uid),
        useExamStore.getState().syncWithCloud(uid),
        useQuestStore.getState().syncWithCloud(uid),
      ]);
    };
    // [DEBUG] ブラウザ console から手動で同期できるグローバル関数を公開
    // 使い方: ブラウザの devtools → Console で `__takkenSync()` と打つ
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      (window as unknown as { __takkenSync?: () => Promise<void> }).__takkenSync = async () => {
        console.log('[sync] Manual __takkenSync() invoked');
        await syncAll();
        console.log('[sync] Manual __takkenSync() done');
      };
      (window as unknown as { __takkenState?: () => unknown }).__takkenState = () => {
        const p = useProgressStore.getState();
        const todayKey = new Date().toISOString().slice(0, 10);
        return {
          userId: user?.id,
          totalQuestions: p.stats.totalQuestions,
          totalCorrect: p.stats.totalCorrect,
          dailyLogToday: p.stats.dailyLog?.[todayKey],
          lastStudyAt: p.stats.lastStudyAt,
          progressRows: Object.keys(p.progress).length,
          quickQuizTotal: p.quickQuizStats.total,
          quickQuizTodayCount: p.quickQuizStats.todayCount,
          syncError: p.syncError,
        };
      };
    }

    // ログイン直後に1回同期
    syncAll().catch(() => {});
    // フォアグラウンド復帰時にも同期
    const appState = { current: AppState.currentState };
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        syncAll().catch(() => {});
      }
      appState.current = next;
    });

    // [Web 専用] タブの可視性 / ウィンドウのフォーカスでクラウド同期
    // - hidden → push (PC で解答後にスマホへ移るケース)
    // - visible / window focus → full sync (スマホで解答後に PC へ戻るケース)
    //   AppState の background→active だけでは別ウィンドウからの focus 復帰を
    //   取りこぼすため、window.focus も併用する。
    let webVisibilityHandler: (() => void) | null = null;
    let webFocusHandler: (() => void) | null = null;
    let webPollInterval: ReturnType<typeof setInterval> | null = null;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const uid = user.id;
      webVisibilityHandler = () => {
        if (document.visibilityState === 'hidden') {
          // タブを離れる → 今のローカル状態をクラウドに push
          const cur = useProgressStore.getState();
          if (cur.progress && Object.keys(cur.progress).length > 0) {
            Promise.allSettled([
              pushProgressToCloud(uid, cur.progress),
              pushStatsToCloud(uid, cur.stats, cur.quickQuizStats),
            ]).catch(() => {});
          }
        } else if (document.visibilityState === 'visible') {
          // タブが再表示 → 別デバイスでの変更を pull するため full sync
          syncAll().catch(() => {});
        }
      };
      document.addEventListener('visibilitychange', webVisibilityHandler);

      if (typeof window !== 'undefined') {
        webFocusHandler = () => {
          // ウィンドウフォーカス復帰 → full sync
          // (例: PC で別アプリから戻ってきた / 別ブラウザウィンドウから戻ってきた)
          syncAll().catch(() => {});
        };
        window.addEventListener('focus', webFocusHandler);
      }

      // [Safety Net] 20秒ごとの定期同期
      // PC とスマホを並べて使うケース (PC のフォーカス/可視性が変化しない) でも、
      // 一定間隔で pull することで「いつのまにか反映されている」体験を保証する。
      // 可視時のみ実行 → 裏タブで無駄なリクエストを撃たない。
      webPollInterval = setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          syncAll().catch(() => {});
        }
      }, 20 * 1000);
    }

    return () => {
      sub.remove();
      if (webVisibilityHandler) {
        document.removeEventListener('visibilitychange', webVisibilityHandler);
      }
      if (webFocusHandler && typeof window !== 'undefined') {
        window.removeEventListener('focus', webFocusHandler);
      }
      if (webPollInterval) clearInterval(webPollInterval);
    };
  }, [user?.id]);

  // 通知スケジュールの自動更新
  useEffect(() => {
    if (!settings.notificationsEnabled) return;
    (async () => {
      const ok = await requestNotificationPermission();
      if (ok) {
        await scheduleDailyReminder(settings.notificationTime, getDueForReview().length);
        // 週間サマリー通知もスケジュール
        const accuracy = stats.totalQuestions > 0 ? stats.totalCorrect / stats.totalQuestions : 0;
        await scheduleWeeklySummary({
          totalAnswered: stats.totalQuestions,
          accuracy,
          streak: stats.streak,
          daysUntilExam: getDaysUntilExam(),
        });
      }
    })();
  }, [settings.notificationsEnabled, settings.notificationTime]);

  return (
    <ErrorBoundary>
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.card },
          headerTitleStyle: { color: colors.text },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        {/*
         * [Bugfix] 戻るボタン二重表示防止戦略:
         * 全ての全画面 (tab以外) で Stack ヘッダを非表示にし、
         * 各画面の WebBackButton or 独自ヘッダで戻る導線を提供する。
         * これで Web/Native とも単一の戻るボタンに統一される。
         */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="question/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="auth/login" options={{ headerShown: false }} />
        <Stack.Screen name="auth/reset-password" options={{ headerShown: false }} />
        <Stack.Screen name="paywall" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="cancel-flow" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="quest/index" options={{ headerShown: false }} />
        <Stack.Screen name="quest/[missionId]" options={{ headerShown: false }} />
        <Stack.Screen name="heatmap" options={{ headerShown: false }} />
        <Stack.Screen name="feedback" options={{ headerShown: false }} />
        <Stack.Screen name="achievements" options={{ headerShown: false }} />
        <Stack.Screen name="study-timer" options={{ headerShown: false }} />
        {/* [Refactor] ai-analysis は (tabs)/ai-analysis.tsx に移動 (タブから直接アクセス可能) */}
        <Stack.Screen name="micro-challenge" options={{ headerShown: false }} />
        <Stack.Screen name="pre-sleep-review" options={{ headerShown: false }} />
        <Stack.Screen name="weak-drill" options={{ headerShown: false }} />
        <Stack.Screen name="exam/index" options={{ headerShown: false }} />
        <Stack.Screen name="exam/session" options={{ headerShown: false }} />
        <Stack.Screen name="exam/result" options={{ headerShown: false }} />
        <Stack.Screen name="admin/stats" options={{ headerShown: false }} />
        <Stack.Screen name="admin/review" options={{ headerShown: false }} />
        <Stack.Screen name="legal/privacy" options={{ headerShown: false }} />
        <Stack.Screen name="legal/terms" options={{ headerShown: false }} />
        <Stack.Screen name="legal/tokushoho" options={{ headerShown: false }} />
        <Stack.Screen name="legal/delete-account" options={{ headerShown: false }} />
      </Stack>
      <OfflineBanner />
      <SyncErrorBanner />
      <AchievementToast />
    </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
