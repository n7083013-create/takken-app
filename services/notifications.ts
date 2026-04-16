// ============================================================
// プッシュ通知サービス
// expo-notifications でローカル通知をスケジュール
// 毎日の学習リマインダー + 復習キュー通知
// ============================================================

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { logError } from './errorLogger';

const REMINDER_IDENTIFIER = 'takken_daily_reminder';
const WEEKLY_IDENTIFIER = 'takken_weekly_summary';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * 通知権限をリクエスト
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') return false;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: '学習リマインダー',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2E7D32',
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;

    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch (e) {
    logError(e, { context: 'notifications.permission' });
    return false;
  }
}

/**
 * 毎日の学習リマインダーをスケジュール
 * @param time "HH:MM" 形式 (例: "20:00")
 */
export async function scheduleDailyReminder(
  time: string,
  dueCount: number = 0,
): Promise<void> {
  try {
    if (Platform.OS === 'web') return;

    // 既存をキャンセル
    await cancelDailyReminder();

    const [hour, minute] = time.split(':').map(Number);
    if (isNaN(hour) || isNaN(minute)) return;

    const body =
      dueCount > 0
        ? `復習キューに${dueCount}問たまっています。今日も1問解きましょう！`
        : '今日の学習を始めましょう！合格まで一歩ずつ。';

    await Notifications.scheduleNotificationAsync({
      identifier: REMINDER_IDENTIFIER,
      content: {
        title: '宅建士 完全対策',
        body,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        hour,
        minute,
        repeats: true,
      },
    });
  } catch (e) {
    logError(e, { context: 'notifications.schedule' });
  }
}

/**
 * リマインダーをキャンセル
 */
export async function cancelDailyReminder(): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    await Notifications.cancelScheduledNotificationAsync(REMINDER_IDENTIFIER);
  } catch (e) {
    logError(e, { context: 'notification.cancelDaily' });
  }
}

/**
 * 全ての通知をキャンセル
 */
export async function cancelAllNotifications(): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (e) {
    logError(e, { context: 'notification.cancelAll' });
  }
}

/**
 * 週間サマリー通知をスケジュール（毎週日曜 10:00）
 * @param weeklyStats 今週の学習データ
 */
export async function scheduleWeeklySummary(weeklyStats: {
  totalAnswered: number;
  accuracy: number;
  streak: number;
  daysUntilExam: number | null;
}): Promise<void> {
  try {
    if (Platform.OS === 'web') return;

    // 既存をキャンセル
    await Notifications.cancelScheduledNotificationAsync(WEEKLY_IDENTIFIER).catch(() => {});

    const { totalAnswered, accuracy, streak, daysUntilExam } = weeklyStats;
    const pct = Math.round(accuracy * 100);

    let body: string;
    if (totalAnswered === 0) {
      body = '今週はまだ学習していません。1日10分でも続けることが合格への近道です！';
    } else {
      body = `今週の成果: ${totalAnswered}問解答・正答率${pct}%`;
      if (streak >= 7) body += ` 🔥${streak}日連続！`;
      if (daysUntilExam !== null && daysUntilExam <= 90) {
        body += ` 試験まで${daysUntilExam}日`;
      }
    }

    await Notifications.scheduleNotificationAsync({
      identifier: WEEKLY_IDENTIFIER,
      content: {
        title: '📊 週間レポート',
        body,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        weekday: 1, // 日曜日
        hour: 10,
        minute: 0,
        repeats: true,
      },
    });
  } catch (e) {
    logError(e, { context: 'notifications.weeklySummary' });
  }
}

/**
 * 即時テスト通知を送信
 */
export async function sendTestNotification(): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🎓 宅建士 完全対策',
        body: 'テスト通知です。通知は正常に動作しています。',
      },
      trigger: null,
    });
  } catch (e) {
    logError(e, { context: 'notifications.test' });
  }
}
