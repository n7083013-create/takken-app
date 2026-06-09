// ============================================================
// buildReminderPlan — 複数時刻リマインダーの予約計画(純粋ロジック)検証
// ============================================================
//
// 背景: 習慣スタッキング(時刻通知)を学習リマインダーへ統合し、
//   「複数時刻・カスタマイズ可」にした。各時刻 → 通知計画への変換は
//   副作用のない純粋関数 buildReminderPlan に切り出してテスト可能にした。
//
// expo-notifications は services/notifications.ts の import 解決のためだけに
// モックする(本テストは純粋関数のみを対象とし、通知 API は呼ばない)。

jest.mock('react-native', () => ({ __esModule: true, Platform: { OS: 'ios' } }));
jest.mock('expo-notifications', () => ({
  __esModule: true,
  setNotificationHandler: jest.fn(),
  SchedulableTriggerInputTypes: { CALENDAR: 'calendar', TIME_INTERVAL: 'timeInterval' },
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
}));
jest.mock('../../store/useProgressStore', () => ({ useProgressStore: { getState: () => ({}) } }));
jest.mock('../../store/useSettingsStore', () => ({ useSettingsStore: { getState: () => ({}) } }));
jest.mock('../../services/errorLogger', () => ({ logError: jest.fn() }));

import { buildReminderPlan, MAX_REMINDER_TIMES } from '../../services/notifications';

describe('buildReminderPlan', () => {
  it('単一時刻 → 時刻別 identifier の 1 件', () => {
    const plan = buildReminderPlan(['20:00']);
    expect(plan).toEqual([
      { identifier: 'takken_daily_reminder_2000', hour: 20, minute: 0 },
    ]);
  });

  it('複数時刻 → それぞれ別 identifier で順序を維持', () => {
    const plan = buildReminderPlan(['08:00', '20:30']);
    expect(plan).toEqual([
      { identifier: 'takken_daily_reminder_0800', hour: 8, minute: 0 },
      { identifier: 'takken_daily_reminder_2030', hour: 20, minute: 30 },
    ]);
  });

  it('重複時刻は 1 件に畳む(同一 identifier 衝突を防ぐ)', () => {
    const plan = buildReminderPlan(['08:00', '08:00', '20:00']);
    expect(plan.map((p) => p.identifier)).toEqual([
      'takken_daily_reminder_0800',
      'takken_daily_reminder_2000',
    ]);
  });

  it('不正な要素(空・非数値・範囲外)は捨てる', () => {
    const plan = buildReminderPlan(['', 'abc', '25:00', '12:60', '07:15']);
    expect(plan).toEqual([
      { identifier: 'takken_daily_reminder_0715', hour: 7, minute: 15 },
    ]);
  });

  it('最大数を超える入力は先頭 MAX_REMINDER_TIMES 件に丸める', () => {
    const many = ['01:00', '02:00', '03:00', '04:00', '05:00', '06:00'];
    const plan = buildReminderPlan(many);
    expect(plan).toHaveLength(MAX_REMINDER_TIMES);
    expect(plan[0].hour).toBe(1);
    expect(plan[MAX_REMINDER_TIMES - 1].hour).toBe(MAX_REMINDER_TIMES);
  });

  it('空配列 → 空計画(全削除時は何も予約しない)', () => {
    expect(buildReminderPlan([])).toEqual([]);
  });
});
