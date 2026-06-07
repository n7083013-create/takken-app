// ============================================================
// 学習タイマー グローバルストア
//
// 背景: 旧実装はタイマー状態が study-timer 画面ローカル (useState) で、
//   画面を離れると unmount → state 消失 + setInterval 停止していた。
//   → 状態を zustand に移し、ルートの ticker で駆動することで
//     「どの画面にいても動き続ける」を実現する。
//
// 残り時間は endAt (終了時刻のタイムスタンプ) を真実とする。
//   running 中は endAt から remainingSec を都度算出するため、
//   背景化 / 画面遷移 / ticker の遅延があってもズレない。
//   paused / idle 中は remainingSec が真実 (endAt=null)。
//
// 永続化: 直近の集中分 (recentMinutes) と当日のセッション記録 (todayLogs)
//   を AsyncStorage に保存。タイマー進行状態そのものは永続化しない
//   (アプリ再起動時はリセットでよい — 通知は OS 側で別途発火する)。
// ============================================================

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Vibration, Platform } from 'react-native';
import { logError } from '../services/errorLogger';
import { scheduleTimerNotification, cancelTimerNotification } from '../services/notifications';
import { useSettingsStore } from './useSettingsStore';

export type TimerMode = 'focus' | 'break';
export type TimerStatus = 'idle' | 'running' | 'paused';

export interface SessionLog {
  focusMin: number;
  completedAt: string; // ISO
}

const STORAGE_KEY_RECENT = '@timer_recent_minutes';
const STORAGE_KEY_LOGS = '@timer_session_logs';

const DEFAULT_FOCUS_MIN = 25;
const DEFAULT_BREAK_MIN = 5;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * endAt (終了時刻) から残り秒数を算出する純粋関数。
 * テスト容易性のためストア外に切り出す。
 */
export function computeRemaining(endAt: number | null, now: number): number {
  if (endAt == null) return 0;
  return Math.max(0, Math.round((endAt - now) / 1000));
}

interface TimerState {
  mode: TimerMode;
  status: TimerStatus;
  focusMin: number;
  breakMin: number;
  /** 残り秒数。running 中は endAt から都度算出した値が入る */
  remainingSec: number;
  /** running 中の終了時刻 (実時間タイムスタンプ)。それ以外は null */
  endAt: number | null;
  completedSessions: number;
  totalFocusMin: number;
  /** フローティング表示の非表示フラグ (× で立てる) */
  hidden: boolean;

  // 永続データ
  recentMinutes: number[];
  todayLogs: SessionLog[];
  loaded: boolean;

  // Actions
  load(): Promise<void>;
  setFocusMin(min: number): void;
  setBreakMin(min: number): void;
  start(): void;
  pause(): void;
  resume(): void;
  reset(): void;
  skip(): void;
  /** ルートの ticker から毎秒呼ぶ。endAt 到達で complete() を発火 */
  tick(): void;
  /** カウント完了時のモード遷移 (内部 + ticker から呼ばれる) */
  complete(): void;
  setHidden(hidden: boolean): void;
}

function vibrate(pattern: number[]) {
  // 設定で OFF のときは鳴らさない。Web は Vibration 非対応。
  if (Platform.OS === 'web') return;
  if (!useSettingsStore.getState().settings.vibrationEnabled) return;
  Vibration.vibrate(pattern);
}

async function persistRecent(recent: number[]) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_RECENT, JSON.stringify(recent));
  } catch (e) {
    logError(e, { context: 'timerStore.persistRecent' });
  }
}

export const useTimerStore = create<TimerState>((set, get) => ({
  mode: 'focus',
  status: 'idle',
  focusMin: DEFAULT_FOCUS_MIN,
  breakMin: DEFAULT_BREAK_MIN,
  remainingSec: DEFAULT_FOCUS_MIN * 60,
  endAt: null,
  completedSessions: 0,
  totalFocusMin: 0,
  hidden: false,

  recentMinutes: [],
  todayLogs: [],
  loaded: false,

  async load() {
    let recentMinutes: number[] = [];
    let focusMin = get().focusMin;
    let remainingSec = get().remainingSec;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY_RECENT);
      if (raw) {
        const parsed = JSON.parse(raw) as number[];
        if (Array.isArray(parsed)) {
          recentMinutes = parsed;
          // 走行中でなければ直近の集中分を初期値に反映
          if (parsed.length > 0 && get().status === 'idle') {
            focusMin = parsed[0];
            remainingSec = parsed[0] * 60;
          }
        }
      }
    } catch (e) {
      logError(e, { context: 'timerStore.loadRecent' });
    }

    let todayLogs: SessionLog[] = [];
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY_LOGS);
      if (raw) {
        const all = JSON.parse(raw) as SessionLog[];
        if (Array.isArray(all)) {
          const today = todayStr();
          todayLogs = all.filter((l) => l.completedAt.slice(0, 10) === today);
        }
      }
    } catch (e) {
      logError(e, { context: 'timerStore.loadLogs' });
    }

    set({ recentMinutes, focusMin, remainingSec, todayLogs, loaded: true });
  },

  setFocusMin(min) {
    set((st) => ({
      focusMin: min,
      // idle かつ focus モードなら表示残り時間も追従させる
      remainingSec: st.status === 'idle' && st.mode === 'focus' ? min * 60 : st.remainingSec,
    }));
  },

  setBreakMin(min) {
    set((st) => ({
      breakMin: min,
      remainingSec: st.status === 'idle' && st.mode === 'break' ? min * 60 : st.remainingSec,
    }));
  },

  start() {
    const st = get();
    const secs = st.remainingSec;
    const endAt = Date.now() + secs * 1000;
    // 集中開始時のみ直近分を記録 (休憩は記録しない)
    let recentMinutes = st.recentMinutes;
    if (st.mode === 'focus') {
      recentMinutes = [st.focusMin, ...st.recentMinutes.filter((m) => m !== st.focusMin)].slice(0, 5);
      persistRecent(recentMinutes);
    }
    set({ status: 'running', endAt, recentMinutes, hidden: false });
    // [#5] アプリを閉じても/他画面でも、終了時に音・バイブで知らせる
    scheduleTimerNotification(secs, st.mode);
  },

  pause() {
    const st = get();
    if (st.status !== 'running') return;
    // 一時停止時点の残りを確定して endAt を解除
    const remainingSec = computeRemaining(st.endAt, Date.now());
    set({ status: 'paused', endAt: null, remainingSec });
    cancelTimerNotification();
  },

  resume() {
    const st = get();
    if (st.status !== 'paused') return;
    const secs = st.remainingSec;
    const endAt = Date.now() + secs * 1000;
    set({ status: 'running', endAt, hidden: false });
    scheduleTimerNotification(secs, st.mode);
  },

  reset() {
    const st = get();
    cancelTimerNotification();
    set({
      status: 'idle',
      mode: 'focus',
      endAt: null,
      remainingSec: st.focusMin * 60,
    });
  },

  skip() {
    const st = get();
    cancelTimerNotification();
    if (st.mode === 'focus') {
      set({ status: 'idle', mode: 'break', endAt: null, remainingSec: st.breakMin * 60 });
    } else {
      set({ status: 'idle', mode: 'focus', endAt: null, remainingSec: st.focusMin * 60 });
    }
  },

  tick() {
    const st = get();
    if (st.status !== 'running' || st.endAt == null) return;
    const remainingSec = computeRemaining(st.endAt, Date.now());
    if (remainingSec <= 0) {
      get().complete();
      return;
    }
    if (remainingSec !== st.remainingSec) set({ remainingSec });
  },

  complete() {
    const st = get();
    vibrate([0, 500, 200, 500]);

    if (st.mode === 'focus') {
      const completedSessions = st.completedSessions + 1;
      const totalFocusMin = st.totalFocusMin + st.focusMin;
      // セッション記録を永続化
      const log: SessionLog = { focusMin: st.focusMin, completedAt: new Date().toISOString() };
      (async () => {
        try {
          const raw = await AsyncStorage.getItem(STORAGE_KEY_LOGS);
          const all: SessionLog[] = raw ? JSON.parse(raw) : [];
          const updated = [log, ...all].slice(0, 100);
          await AsyncStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(updated));
          const today = todayStr();
          set({ todayLogs: updated.filter((l) => l.completedAt.slice(0, 10) === today) });
        } catch (e) {
          logError(e, { context: 'timerStore.saveLog' });
        }
      })();
      set({
        status: 'idle',
        mode: 'break',
        endAt: null,
        remainingSec: st.breakMin * 60,
        completedSessions,
        totalFocusMin,
      });
    } else {
      set({ status: 'idle', mode: 'focus', endAt: null, remainingSec: st.focusMin * 60 });
    }
  },

  setHidden(hidden) {
    set({ hidden });
  },
}));
