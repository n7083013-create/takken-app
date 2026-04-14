import '../global.css';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useProgressStore } from '../store/useProgressStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useReportStore } from '../store/useReportStore';
import { useAuthStore } from '../store/useAuthStore';
import { useQuestStore } from '../store/useQuestStore';
import { useAchievementStore } from '../store/useAchievementStore';
import { useExamStore } from '../store/useExamStore';
import { installGlobalErrorHandler } from '../services/errorLogger';
import { useThemeColors, useIsDark } from '../hooks/useThemeColors';
import {
  requestNotificationPermission,
  scheduleDailyReminder,
  scheduleWeeklySummary,
} from '../services/notifications';

export default function RootLayout() {
  const loadProgress = useProgressStore((s) => s.loadProgress);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const loadReports = useReportStore((s) => s.loadReports);
  const initAuth = useAuthStore((s) => s.init);
  const loadQuest = useQuestStore((s) => s.loadQuest);
  const loadAchievements = useAchievementStore((s) => s.loadAchievements);
  const loadExamHistory = useExamStore((s) => s.loadHistory);
  const settings = useSettingsStore((s) => s.settings);
  const getDueForReview = useProgressStore((s) => s.getDueForReview);
  const colors = useThemeColors();
  const isDark = useIsDark();

  useEffect(() => {
    installGlobalErrorHandler();
    (async () => {
      await loadSettings();
      await loadProgress();
      await loadQuest();
      await loadReports();
      await loadAchievements();
      await loadExamHistory();
      await initAuth();
    })();
  }, []);

  const stats = useProgressStore((s) => s.stats);
  const getDaysUntilExam = useSettingsStore((s) => s.getDaysUntilExam);

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
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.card },
          headerTitleStyle: { color: colors.text },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="question/[id]"
          options={{
            title: '問題',
            headerBackTitle: '戻る',
            headerTintColor: colors.primary,
          }}
        />
        <Stack.Screen name="auth/login" options={{ title: 'ログイン', headerTintColor: '#2E7D32' }} />
        <Stack.Screen
          name="paywall"
          options={{
            title: 'STANDARDプラン',
            presentation: 'modal',
            headerTintColor: colors.primary,
          }}
        />
        <Stack.Screen
          name="quest/index"
          options={{
            title: 'クエスト学習',
            headerTintColor: colors.primary,
          }}
        />
        <Stack.Screen
          name="quest/[missionId]"
          options={{
            title: 'クエスト',
            headerBackTitle: '戻る',
            headerTintColor: colors.primary,
          }}
        />
        <Stack.Screen name="legal/privacy" options={{ title: 'プライバシーポリシー', headerTintColor: '#2E7D32' }} />
        <Stack.Screen name="legal/terms" options={{ title: '利用規約', headerTintColor: '#2E7D32' }} />
        <Stack.Screen name="legal/tokushoho" options={{ title: '特定商取引法表記', headerTintColor: '#2E7D32' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
