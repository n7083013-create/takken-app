// ============================================================
// プッシュ通知サービス
// expo-notifications でローカル通知をスケジュール
// 毎日の学習リマインダー + 復習キュー通知 + ストリーク維持アラート
// ============================================================

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { logError } from './errorLogger';
import { useProgressStore } from '../store/useProgressStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { Brand } from '../constants/theme';

const REMINDER_IDENTIFIER = 'takken_daily_reminder';
const WEEKLY_IDENTIFIER = 'takken_weekly_summary';
const STREAK_DANGER_IDENTIFIER = 'takken_streak_danger';
const HABIT_PREFIX = 'takken_habit_';
const TIMER_IDENTIFIER = 'takken_study_timer';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * 通知権限が許可されているか確認する内部ヘルパー
 * 未許可なら早期 return できるように boolean を返す
 */
async function hasPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  } catch (e) {
    logError(e, { context: 'notifications.hasPermission' });
    return false;
  }
}

/**
 * 通知権限をリクエスト
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') return false;

    if (Platform.OS === 'android') {
      // 日次リマインダー用の通常チャネル
      await Notifications.setNotificationChannelAsync('default', {
        name: '学習リマインダー',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: Brand.green600,
      });
      // ストリーク維持用の高優先度チャネル（即時警告）
      await Notifications.setNotificationChannelAsync('streak_danger', {
        name: 'ストリーク維持アラート',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 400, 200, 400],
        lightColor: '#FF6B35',
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

// ── 動的本文生成 ──

interface ReminderContext {
  dueCount: number;
  weakCount: number;
  streak: number;
  daysUntilExam: number | null;
  todayAnswered: number;
}

/**
 * 通知時点の状態を stores から取得
 * プレーン関数として呼び出すので React Hook ではなく getState() を使う
 */
function getReminderContext(): ReminderContext {
  const progress = useProgressStore.getState();
  const settings = useSettingsStore.getState();

  return {
    dueCount: progress.getDueForReview().length,
    weakCount: progress.getWeakQuestions().length,
    streak: progress.stats.streak,
    daysUntilExam: settings.getDaysUntilExam(),
    todayAnswered: progress.getTodayAnswered(),
  };
}

/**
 * テンプレートを優先度付きで評価し、最も訴求力のある本文を 1 つ返す
 *
 * 優先順位（合格に直結する順）:
 *  1. 試験直前 (D-30 以内) — 最重要
 *  2. ストリーク維持 (3日以上) — 継続率に直結
 *  3. 復習タイミング (SR で due) — 記憶定着に直結
 *  4. 苦手集中 (10問以上) — 弱点克服
 *  5. 励まし系 — フォールバック
 */
export function buildDailyReminderText(ctx: ReminderContext): {
  title: string;
  body: string;
} {
  const { dueCount, weakCount, streak, daysUntilExam, todayAnswered } = ctx;

  // 1. 試験直前 (D-30 以内) — 最重要
  if (daysUntilExam !== null && daysUntilExam >= 0 && daysUntilExam <= 30) {
    if (daysUntilExam === 0) {
      return {
        title: '🎯 いよいよ本番',
        body: '試験当日です。最後の確認、深呼吸して臨みましょう！',
      };
    }
    if (daysUntilExam <= 7) {
      return {
        title: `🔥 試験まで残り${daysUntilExam}日`,
        body: `仕上げの${daysUntilExam}日。今日も1問でも多く触れて自信に変えよう。`,
      };
    }
    return {
      title: `📅 試験まで${daysUntilExam}日`,
      body: `合格圏に入る最後のチャンス。今日の演習で一歩前進しよう！`,
    };
  }

  // 2. ストリーク維持 (3日以上 → 切らしたら惜しい)
  if (streak >= 3) {
    return {
      title: `🔥 ${streak}日連続学習中`,
      body: `ストリーク${streak}日継続中！今日も1問解いて記録を更新しよう。`,
    };
  }

  // 3. 復習タイミング (SR で due な問題)
  if (dueCount >= 5) {
    return {
      title: '🧠 復習のタイミング',
      body: `今日復習予定 ${dueCount} 問あります。忘却曲線がリセットされる前に！`,
    };
  }
  if (dueCount > 0) {
    return {
      title: '📖 復習タイム',
      body: `${dueCount}問の復習が予定されています。サクッと片付けよう。`,
    };
  }

  // 4. 苦手集中
  if (weakCount >= 10) {
    return {
      title: '⚡ 苦手克服チャンス',
      body: `苦手 ${weakCount} 問の克服タイミングです。差をつけるのは今！`,
    };
  }

  // 5. 励まし系（学習量低下時 / フォールバック）
  if (todayAnswered === 0) {
    if (daysUntilExam !== null && daysUntilExam > 0) {
      return {
        title: '📚 学習を始めよう',
        body: `試験まであと${daysUntilExam}日。今日の1問が合格を引き寄せる。`,
      };
    }
    return {
      title: '📚 学習を始めよう',
      body: '今日の1問が合格を引き寄せる。さあ、はじめよう！',
    };
  }

  // 既に学習済み（通知時間が早すぎた等）
  return {
    title: '✨ 今日もお疲れ様',
    body: `今日は${todayAnswered}問解答済み。プラス1問でさらに記憶定着！`,
  };
}

// ── 日次リマインダー ──

/**
 * 毎日の学習リマインダーをスケジュール
 *
 * 仕組み:
 *  - 通知をスケジュールする時点で stores から状態を取得して動的本文生成
 *  - expo-notifications の CALENDAR repeats: true で毎日同時刻に発火
 *  - 本文を毎晩更新したい場合、recordAnswer 後など主要イベントで再呼び出し
 *
 * @param time "HH:MM" 形式 (例: "20:00")
 * @param _legacyDueCount 旧 API 互換用（無視。store から最新値を取得する）
 */
export async function scheduleDailyReminder(
  time: string,
  _legacyDueCount: number = 0,
): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    if (!(await hasPermission())) return;

    // 既存をキャンセル
    await cancelDailyReminder();

    const [hour, minute] = time.split(':').map(Number);
    if (isNaN(hour) || isNaN(minute)) return;

    const ctx = getReminderContext();
    const { title, body } = buildDailyReminderText(ctx);

    await Notifications.scheduleNotificationAsync({
      identifier: REMINDER_IDENTIFIER,
      content: {
        title,
        body,
        sound: true,
        ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
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
 * 日次リマインダーをキャンセル
 */
export async function cancelDailyReminder(): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    await Notifications.cancelScheduledNotificationAsync(REMINDER_IDENTIFIER);
  } catch (e) {
    logError(e, { context: 'notification.cancelDaily' });
  }
}

// ── ストリーク切れ前夜通知 ──

/**
 * ストリーク継続を維持するため、最終学習から 20-22 時間後に警告通知を予約
 *
 * 設計:
 *  - lastStudyAt から +20h ～ +22h（その時刻が現在より過去なら +20h）
 *  - 既存予約を必ずキャンセルしてから新規予約（重複防止）
 *  - 学習記録があり streak >= 1 のときだけ予約（初日 0 ストリークは励まし通知に任せる）
 *
 * 呼び出しタイミング:
 *  - recordAnswer 後（次の学習までのカウントダウン更新）
 *  - 通知設定変更時
 */
export async function scheduleStreakDangerNotification(): Promise<void> {
  try {
    if (Platform.OS === 'web') return;

    // 設定で通知 OFF なら予約しない
    const settings = useSettingsStore.getState().settings;
    if (!settings.notificationsEnabled) {
      await cancelStreakDangerNotification();
      return;
    }

    if (!(await hasPermission())) return;

    // 必ず既存予約をキャンセル（重複・古い予約の掃除）
    await cancelStreakDangerNotification();

    const progress = useProgressStore.getState();
    const lastStudyAt = progress.stats.lastStudyAt;
    const streak = progress.stats.streak;

    // 学習履歴がない、または streak が 0 の場合は予約しない
    if (!lastStudyAt || streak < 1) return;

    const lastStudyMs = new Date(lastStudyAt).getTime();
    if (!Number.isFinite(lastStudyMs)) return;

    // 20-22h 後に発火 — 早めに通知して気付くチャンスを残す（22h ピンポイントだと寝てる可能性）
    // 既に 20h 以上経過していたら +1h 後（=今すぐ近い未来）に予約
    const now = Date.now();
    const twentyHoursAfterLast = lastStudyMs + 20 * 60 * 60 * 1000;
    const twentyTwoHoursAfterLast = lastStudyMs + 22 * 60 * 60 * 1000;

    let fireAtMs: number;
    if (now >= twentyTwoHoursAfterLast) {
      // 既に危険水域。1 時間後（または最低 5 分後）に発火
      fireAtMs = Math.max(now + 5 * 60 * 1000, now + 60 * 60 * 1000);
    } else if (now >= twentyHoursAfterLast) {
      // 20-22h 帯。すぐに通知
      fireAtMs = Math.max(now + 5 * 60 * 1000, twentyTwoHoursAfterLast);
    } else {
      // まだ 20h 経ってない。20h 経過時点で予約
      fireAtMs = twentyHoursAfterLast;
    }

    // ストリークが切れる時刻（最終学習翌日の 23:59:59 ローカル）まで残り時間
    const lastLocal = new Date(lastStudyAt);
    const deadline = new Date(
      lastLocal.getFullYear(),
      lastLocal.getMonth(),
      lastLocal.getDate() + 2, // 翌日いっぱい = +2 日 0:00
      0, 0, 0,
    );
    const hoursLeft = Math.max(1, Math.round((deadline.getTime() - fireAtMs) / (60 * 60 * 1000)));

    const triggerSeconds = Math.max(60, Math.floor((fireAtMs - now) / 1000));

    await Notifications.scheduleNotificationAsync({
      identifier: STREAK_DANGER_IDENTIFIER,
      content: {
        title: `🚨 ${streak}日ストリーク継続中`,
        body: `あと数時間でストリークが切れます！1問だけでも解いて記録を守ろう（残り約${hoursLeft}時間）`,
        sound: true,
        ...(Platform.OS === 'android' ? { channelId: 'streak_danger' } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: triggerSeconds,
        repeats: false,
      },
    });
  } catch (e) {
    logError(e, { context: 'notifications.streakDanger' });
  }
}

/**
 * ストリーク切れ前夜通知をキャンセル
 */
export async function cancelStreakDangerNotification(): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    await Notifications.cancelScheduledNotificationAsync(STREAK_DANGER_IDENTIFIER);
  } catch (e) {
    logError(e, { context: 'notification.cancelStreakDanger' });
  }
}

/**
 * 答案記録後に呼び出すフック関数
 * 日次リマインダー本文を最新化し、ストリーク危険通知も再予約する
 *
 * 64 個上限を考慮: 同一 identifier で上書きするため累積しない
 */
export async function refreshNotificationsAfterAnswer(): Promise<void> {
  try {
    if (Platform.OS === 'web') return;

    const settings = useSettingsStore.getState().settings;
    if (!settings.notificationsEnabled) return;
    if (!(await hasPermission())) return;

    // 日次リマインダーの本文を最新の状態で更新
    await scheduleDailyReminder(settings.notificationTime);
    // ストリーク維持通知を再予約（最終学習から 20-22h 後）
    await scheduleStreakDangerNotification();
  } catch (e) {
    logError(e, { context: 'notifications.refreshAfterAnswer' });
  }
}

// ── キャンセル系 ──

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

// ── 週間サマリー ──

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
    if (!(await hasPermission())) return;

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
        ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
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

// ── 習慣スタッキング通知 ──

/**
 * 習慣スタッキング通知を一括スケジュール
 * 既存の習慣通知をすべてキャンセルしてから再設定
 */
export async function scheduleHabitNotifications(
  habits: { id: string; trigger: string; action: string; icon: string; notifyAt?: string; enabled: boolean }[],
): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    if (!(await hasPermission())) return;

    // 既存の習慣通知をすべてキャンセル
    await cancelHabitNotifications();

    const enabled = habits.filter((h) => h.enabled && h.notifyAt);
    for (const habit of enabled) {
      const [hour, minute] = (habit.notifyAt ?? '').split(':').map(Number);
      if (isNaN(hour) || isNaN(minute)) continue;

      await Notifications.scheduleNotificationAsync({
        identifier: `${HABIT_PREFIX}${habit.id}`,
        content: {
          title: `${habit.icon} ${habit.trigger}`,
          body: `→ ${habit.action}`,
          sound: true,
          ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
          hour,
          minute,
          repeats: true,
        },
      });
    }
  } catch (e) {
    logError(e, { context: 'notifications.habitSchedule' });
  }
}

/**
 * 習慣スタッキング通知をすべてキャンセル
 */
export async function cancelHabitNotifications(): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of all) {
      if (n.identifier.startsWith(HABIT_PREFIX)) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  } catch (e) {
    logError(e, { context: 'notifications.cancelHabit' });
  }
}

/**
 * 即時テスト通知を送信
 */
export async function sendTestNotification(): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    if (!(await hasPermission())) return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🎓 宅建士 完全対策',
        body: 'テスト通知です。通知は正常に動作しています。',
        ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
      },
      trigger: null,
    });
  } catch (e) {
    logError(e, { context: 'notifications.test' });
  }
}

// ── 学習タイマー終了通知 ──

/**
 * 学習タイマーの終了時刻に通知を予約する。
 * アプリを閉じていても / 他画面に移動していても、終了時に音・バイブで知らせる。
 * @param seconds 残り秒数
 * @param mode 'focus' | 'break'
 */
export async function scheduleTimerNotification(
  seconds: number,
  mode: 'focus' | 'break',
): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    if (!Number.isFinite(seconds) || seconds < 1) return;
    if (!(await hasPermission())) return;
    // 既存のタイマー通知を必ず消してから予約（多重防止）
    await Notifications.cancelScheduledNotificationAsync(TIMER_IDENTIFIER).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: TIMER_IDENTIFIER,
      content: {
        title: mode === 'focus' ? '🎯 集中タイム終了' : '☕ 休憩終了',
        body: mode === 'focus'
          ? 'お疲れさまでした！区切りがつきました。'
          : '休憩おわり。次の集中、いきましょう！',
        sound: true,
        ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.ceil(seconds),
        repeats: false,
      },
    });
  } catch (e) {
    logError(e, { context: 'notifications.timer' });
  }
}

/** 学習タイマー終了通知をキャンセル */
export async function cancelTimerNotification(): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    await Notifications.cancelScheduledNotificationAsync(TIMER_IDENTIFIER);
  } catch (e) {
    logError(e, { context: 'notifications.cancelTimer' });
  }
}
