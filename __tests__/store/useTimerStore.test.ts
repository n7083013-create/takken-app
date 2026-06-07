// ============================================================
// useTimerStore - グローバル学習タイマーの純粋ロジック検証
// ============================================================
//
// 背景: 2026-06 ユーザー報告
//   「タイマーをスタート → ホーム等へ移動するとタイマーが停止し、
//     どの画面にも表示が出ない」
// 原因: タイマー状態が画面ローカル (useState) で unmount 時に消えていた。
// 修正: zustand ストアに集約し、残り時間を endAt (終了時刻) 基準で算出。
//   ルートの 1秒 ticker が tick() を駆動する。
//
// 本テスト: endAt ベースの残り時間算出 / start・pause・resume・tick・
//   complete・skip・reset の状態遷移 / フローティング非表示フラグ /
//   通知の予約・取消が適切なタイミングで呼ばれること、を検証する。

const mockSchedule: jest.Mock = jest.fn(() => Promise.resolve());
const mockCancel: jest.Mock = jest.fn(() => Promise.resolve());
const mockGet: jest.Mock = jest.fn(() => Promise.resolve(null));
const mockSet: jest.Mock = jest.fn(() => Promise.resolve());

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (k: string) => mockGet(k),
    setItem: (k: string, v: string) => mockSet(k, v),
    removeItem: () => Promise.resolve(),
  },
}));

jest.mock('../../services/notifications', () => ({
  __esModule: true,
  scheduleTimerNotification: (...args: unknown[]) => mockSchedule(...args),
  cancelTimerNotification: (...args: unknown[]) => mockCancel(...args),
}));

// errorLogger は @sentry/react-native (ESM) を引き込むため直接モックする
jest.mock('../../services/errorLogger', () => ({
  __esModule: true,
  logError: jest.fn(),
}));

// 設定ストアは vibrationEnabled だけ参照される → 最小モック
jest.mock('../../store/useSettingsStore', () => ({
  __esModule: true,
  useSettingsStore: {
    getState: () => ({ settings: { vibrationEnabled: false } }),
  },
}));

// react-native の Vibration / Platform はモック (test 環境は node)
jest.mock('react-native', () => ({
  __esModule: true,
  Platform: { OS: 'ios' },
  Vibration: { vibrate: jest.fn() },
}));

import { useTimerStore, computeRemaining } from '../../store/useTimerStore';

function resetStore() {
  useTimerStore.setState({
    mode: 'focus',
    status: 'idle',
    focusMin: 25,
    breakMin: 5,
    remainingSec: 25 * 60,
    endAt: null,
    completedSessions: 0,
    totalFocusMin: 0,
    hidden: false,
    recentMinutes: [],
    todayLogs: [],
    loaded: false,
  });
}

describe('computeRemaining - endAt から残り秒数', () => {
  test('endAt が null なら 0', () => {
    expect(computeRemaining(null, Date.now())).toBe(0);
  });
  test('未来の endAt → 残り秒数 (四捨五入)', () => {
    const now = 1_000_000;
    expect(computeRemaining(now + 90_000, now)).toBe(90);
    expect(computeRemaining(now + 90_400, now)).toBe(90); // 0.4s 切り捨て
    expect(computeRemaining(now + 90_600, now)).toBe(91); // 0.6s 切り上げ
  });
  test('過去の endAt → 0 でクランプ (負にならない)', () => {
    const now = 1_000_000;
    expect(computeRemaining(now - 5_000, now)).toBe(0);
  });
});

describe('useTimerStore - 状態遷移', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStore();
  });

  test('start → running + endAt 設定 + 終了通知を予約 + hidden 解除', () => {
    useTimerStore.setState({ hidden: true, remainingSec: 1500 });
    const before = Date.now();
    useTimerStore.getState().start();
    const st = useTimerStore.getState();
    expect(st.status).toBe('running');
    expect(st.endAt).not.toBeNull();
    // endAt は now + remainingSec*1000 付近
    expect(st.endAt! - before).toBeGreaterThanOrEqual(1500 * 1000 - 50);
    expect(st.hidden).toBe(false);
    expect(mockSchedule).toHaveBeenCalledWith(1500, 'focus');
  });

  test('start (focus) → recentMinutes に focusMin を先頭追加 (重複排除・最大5件)', () => {
    useTimerStore.setState({ focusMin: 30, recentMinutes: [10, 30, 15] });
    useTimerStore.getState().start();
    expect(useTimerStore.getState().recentMinutes).toEqual([30, 10, 15]);
    expect(mockSet).toHaveBeenCalled(); // 永続化される
  });

  test('start (break) → recentMinutes は変化しない (休憩は記録しない)', () => {
    useTimerStore.setState({ mode: 'break', breakMin: 5, recentMinutes: [25] });
    useTimerStore.getState().start();
    expect(useTimerStore.getState().recentMinutes).toEqual([25]);
  });

  test('pause → paused + endAt 解除 + 残りを確定 + 通知取消', () => {
    useTimerStore.getState().start();
    useTimerStore.getState().pause();
    const st = useTimerStore.getState();
    expect(st.status).toBe('paused');
    expect(st.endAt).toBeNull();
    expect(st.remainingSec).toBeGreaterThan(0);
    expect(mockCancel).toHaveBeenCalled();
  });

  test('pause は running 以外では無視', () => {
    useTimerStore.setState({ status: 'idle' });
    useTimerStore.getState().pause();
    expect(useTimerStore.getState().status).toBe('idle');
  });

  test('resume → running + endAt 再設定 + 通知再予約', () => {
    useTimerStore.setState({ status: 'paused', remainingSec: 600, endAt: null });
    useTimerStore.getState().resume();
    const st = useTimerStore.getState();
    expect(st.status).toBe('running');
    expect(st.endAt).not.toBeNull();
    expect(mockSchedule).toHaveBeenCalledWith(600, 'focus');
  });

  test('tick → endAt から remainingSec を更新 (走行中のみ)', () => {
    const now = Date.now();
    useTimerStore.setState({ status: 'running', endAt: now + 100_000, remainingSec: 9999 });
    useTimerStore.getState().tick();
    const st = useTimerStore.getState();
    expect(st.remainingSec).toBeLessThanOrEqual(100);
    expect(st.remainingSec).toBeGreaterThan(95);
  });

  test('tick は idle のとき何もしない', () => {
    useTimerStore.setState({ status: 'idle', remainingSec: 1500, endAt: null });
    useTimerStore.getState().tick();
    expect(useTimerStore.getState().remainingSec).toBe(1500);
  });

  test('tick で endAt 到達 → complete が発火 (focus→break・完了数+1)', () => {
    const now = Date.now();
    useTimerStore.setState({
      status: 'running',
      mode: 'focus',
      focusMin: 25,
      breakMin: 5,
      endAt: now - 1000, // 既に過ぎている
      completedSessions: 2,
      totalFocusMin: 50,
    });
    useTimerStore.getState().tick();
    const st = useTimerStore.getState();
    expect(st.status).toBe('idle');
    expect(st.mode).toBe('break');
    expect(st.completedSessions).toBe(3);
    expect(st.totalFocusMin).toBe(75);
    expect(st.remainingSec).toBe(5 * 60); // break の長さ
  });

  test('complete (break→focus) → 完了数は増えない', () => {
    useTimerStore.setState({
      status: 'running',
      mode: 'break',
      focusMin: 25,
      completedSessions: 1,
      totalFocusMin: 25,
    });
    useTimerStore.getState().complete();
    const st = useTimerStore.getState();
    expect(st.mode).toBe('focus');
    expect(st.completedSessions).toBe(1);
    expect(st.remainingSec).toBe(25 * 60);
  });

  test('reset → idle + focus + 残りを focusMin に戻す + 通知取消', () => {
    useTimerStore.setState({ status: 'running', mode: 'break', focusMin: 30, remainingSec: 12 });
    useTimerStore.getState().reset();
    const st = useTimerStore.getState();
    expect(st.status).toBe('idle');
    expect(st.mode).toBe('focus');
    expect(st.remainingSec).toBe(30 * 60);
    expect(st.endAt).toBeNull();
    expect(mockCancel).toHaveBeenCalled();
  });

  test('skip (focus→break) → break の残り時間 + 通知取消', () => {
    useTimerStore.setState({ status: 'running', mode: 'focus', breakMin: 5 });
    useTimerStore.getState().skip();
    const st = useTimerStore.getState();
    expect(st.mode).toBe('break');
    expect(st.status).toBe('idle');
    expect(st.remainingSec).toBe(5 * 60);
    expect(mockCancel).toHaveBeenCalled();
  });

  test('skip (break→focus) → focus の残り時間', () => {
    useTimerStore.setState({ status: 'running', mode: 'break', focusMin: 25 });
    useTimerStore.getState().skip();
    const st = useTimerStore.getState();
    expect(st.mode).toBe('focus');
    expect(st.remainingSec).toBe(25 * 60);
  });

  test('setFocusMin は idle/focus のとき remainingSec も追従、running 中は据え置き', () => {
    useTimerStore.setState({ status: 'idle', mode: 'focus' });
    useTimerStore.getState().setFocusMin(45);
    expect(useTimerStore.getState().remainingSec).toBe(45 * 60);

    useTimerStore.setState({ status: 'running', mode: 'focus', remainingSec: 123 });
    useTimerStore.getState().setFocusMin(10);
    expect(useTimerStore.getState().remainingSec).toBe(123); // 走行中は変えない
    expect(useTimerStore.getState().focusMin).toBe(10);
  });

  test('setHidden でフローティング表示フラグを切替', () => {
    useTimerStore.getState().setHidden(true);
    expect(useTimerStore.getState().hidden).toBe(true);
    useTimerStore.getState().setHidden(false);
    expect(useTimerStore.getState().hidden).toBe(false);
  });

  // ─── 回帰: ユーザー報告のシナリオ ─────────────────
  test('🔥 回帰: start 後に状態がストアに残る (画面 unmount でも消えない)', () => {
    useTimerStore.setState({ remainingSec: 1500 });
    useTimerStore.getState().start();
    // 画面 unmount を模した「コンポーネント外からの参照」でも状態は生きている
    const snapshot = useTimerStore.getState();
    expect(snapshot.status).toBe('running');
    expect(snapshot.endAt).not.toBeNull();
  });
});
