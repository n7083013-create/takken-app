// ============================================================
// useSessionStore - celebratedToday 永続化テスト
// ============================================================
//
// 背景: 2026-05-23 ユーザー報告
//   「今日の目標達成の表示がアプリを開くたびに出てくる」
// 原因: celebratedToday Set がメモリ上のみで永続化されておらず、
//   アプリ再起動 / ブラウザ reload で Set が空になり、達成済みフラグが消える
//   → useEffect が再度祝福を発火させていた。
// 修正: AsyncStorage に { date, keys[] } を保存。日付が変わったら自動リセット。
// 本テスト: 永続化 / 日付跨ぎ / 未ロード時の安全動作を検証。

const mockGet: jest.Mock = jest.fn();
const mockSet: jest.Mock = jest.fn(() => Promise.resolve());
const mockRemove: jest.Mock = jest.fn(() => Promise.resolve());

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (k: string) => mockGet(k),
    setItem: (k: string, v: string) => mockSet(k, v),
    removeItem: (k: string) => mockRemove(k),
  },
}));

import { useSessionStore } from '../../store/useSessionStore';

const STORAGE_KEY = '@takken_celebrated_today';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function resetStore() {
  useSessionStore.setState({
    combo: 0,
    bestCombo: 0,
    celebratedToday: new Set(),
    celebratedDate: todayStr(),
    celebratedLoaded: false,
    activeStreakCeleb: null,
  });
}

describe('useSessionStore - celebratedToday 永続化', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStore();
    mockGet.mockResolvedValue(null);
  });

  describe('loadCelebrated - 起動時復元', () => {
    test('AsyncStorage が空 → 空 Set でロード完了', async () => {
      mockGet.mockResolvedValueOnce(null);
      await useSessionStore.getState().loadCelebrated();
      const s = useSessionStore.getState();
      expect(s.celebratedLoaded).toBe(true);
      expect(s.celebratedToday.size).toBe(0);
      expect(s.celebratedDate).toBe(todayStr());
    });

    test('AsyncStorage に今日の祝福履歴あり → 復元', async () => {
      mockGet.mockResolvedValueOnce(
        JSON.stringify({ date: todayStr(), keys: ['daily_goal_' + todayStr()] }),
      );
      await useSessionStore.getState().loadCelebrated();
      const s = useSessionStore.getState();
      expect(s.celebratedLoaded).toBe(true);
      expect(s.celebratedToday.has('daily_goal_' + todayStr())).toBe(true);
    });

    test('AsyncStorage に昨日の履歴 → 破棄して空でロード完了 (日付跨ぎリセット)', async () => {
      mockGet.mockResolvedValueOnce(
        JSON.stringify({ date: '2026-05-22', keys: ['daily_goal_2026-05-22'] }),
      );
      await useSessionStore.getState().loadCelebrated();
      const s = useSessionStore.getState();
      expect(s.celebratedLoaded).toBe(true);
      expect(s.celebratedToday.size).toBe(0);
      expect(s.celebratedDate).toBe(todayStr());
    });

    test('JSON 不正でもクラッシュせずロード完了扱い', async () => {
      mockGet.mockResolvedValueOnce('{not-valid-json');
      await useSessionStore.getState().loadCelebrated();
      const s = useSessionStore.getState();
      expect(s.celebratedLoaded).toBe(true);
    });

    test('AsyncStorage 自体がエラー → ロード完了 (祝福を永久に抑制しない)', async () => {
      mockGet.mockRejectedValueOnce(new Error('storage failed'));
      await useSessionStore.getState().loadCelebrated();
      expect(useSessionStore.getState().celebratedLoaded).toBe(true);
    });
  });

  describe('markCelebrated - 永続化', () => {
    test('markCelebrated は AsyncStorage に書き込む', async () => {
      await useSessionStore.getState().loadCelebrated();
      useSessionStore.getState().markCelebrated('daily_goal_' + todayStr());
      // micro task で setItem が呼ばれるのを待つ
      await Promise.resolve();
      expect(mockSet).toHaveBeenCalledWith(
        STORAGE_KEY,
        expect.stringContaining('"date":"' + todayStr() + '"'),
      );
    });

    test('日付が変わっていたら Set をリセットしてから追加', async () => {
      // 昨日の状態を直接注入
      useSessionStore.setState({
        celebratedToday: new Set(['daily_goal_2026-05-22']),
        celebratedDate: '2026-05-22',
        celebratedLoaded: true,
      });
      useSessionStore.getState().markCelebrated('daily_goal_' + todayStr());
      const s = useSessionStore.getState();
      expect(s.celebratedToday.has('daily_goal_2026-05-22')).toBe(false); // 昨日のは消えた
      expect(s.celebratedToday.has('daily_goal_' + todayStr())).toBe(true);
      expect(s.celebratedDate).toBe(todayStr());
    });
  });

  describe('isCelebrated - 判定', () => {
    test('ロード前は true を返す (重複発火防止)', () => {
      useSessionStore.setState({ celebratedLoaded: false });
      expect(useSessionStore.getState().isCelebrated('any-key')).toBe(true);
    });

    test('ロード後で未祝福のキー → false', async () => {
      await useSessionStore.getState().loadCelebrated();
      expect(useSessionStore.getState().isCelebrated('daily_goal_xxx')).toBe(false);
    });

    test('ロード後で祝福済みキー → true', async () => {
      await useSessionStore.getState().loadCelebrated();
      useSessionStore.getState().markCelebrated('daily_goal_' + todayStr());
      expect(useSessionStore.getState().isCelebrated('daily_goal_' + todayStr())).toBe(true);
    });

    test('日付が変わっていたら false (たとえ Set に残っていても)', async () => {
      useSessionStore.setState({
        celebratedToday: new Set(['daily_goal_2026-05-22']),
        celebratedDate: '2026-05-22',
        celebratedLoaded: true,
      });
      // 今日のキーで問い合わせ → false (日付ズレで全部リセット扱い)
      expect(useSessionStore.getState().isCelebrated('daily_goal_2026-05-22')).toBe(false);
    });
  });

  describe('resetDailyFlags', () => {
    test('Set をクリアして AsyncStorage も削除', async () => {
      await useSessionStore.getState().loadCelebrated();
      useSessionStore.getState().markCelebrated('daily_goal_' + todayStr());
      useSessionStore.getState().resetDailyFlags();
      const s = useSessionStore.getState();
      expect(s.celebratedToday.size).toBe(0);
      expect(mockRemove).toHaveBeenCalledWith(STORAGE_KEY);
    });
  });

  // ─── activeStreakCeleb: 再マウント耐性 ─────────────────
  // 背景: 2026-06-09 ユーザー報告「ストリーク祝福が一瞬で表示されて消える」。
  // 原因: HomeScreen は HomeScreenWrapper 配下で onboarding/sync 確定時に
  //   再マウントされる。旧実装は表示と同時に永続フラグを立てていたため、
  //   再マウント後の再評価で「祝福済み」となり再表示されず、初回の祝福が
  //   unmount されてフラッシュして消えていた。
  // 修正: 表示中は activeStreakCeleb (メモリ・store はコンポーネント木の外なので
  //   再マウントで消えない) を保持し、再マウント後もこの値で再表示する。
  describe('🔥 回帰: activeStreakCeleb で再マウントしても祝福が消えない', () => {
    test('初期値は null', () => {
      expect(useSessionStore.getState().activeStreakCeleb).toBeNull();
    });

    test('setActiveStreakCeleb で値を保持/クリアできる', () => {
      useSessionStore.getState().setActiveStreakCeleb(7);
      expect(useSessionStore.getState().activeStreakCeleb).toBe(7);
      useSessionStore.getState().setActiveStreakCeleb(null);
      expect(useSessionStore.getState().activeStreakCeleb).toBeNull();
    });

    test('表示開始 → コンポーネント再マウント (state リセット) しても store の値は生存', () => {
      // 表示開始: トリガーが値をセット
      useSessionStore.getState().setActiveStreakCeleb(7);
      // HomeScreen の useState は再マウントで失われるが、store は別。
      // (store 自体は resetStore しない = コンポーネント木の外にあることの再現)
      expect(useSessionStore.getState().activeStreakCeleb).toBe(7);
    });

    test('dismiss 相当 (null セット) 後はもう再表示トリガーにならない', () => {
      useSessionStore.getState().setActiveStreakCeleb(7);
      // 閉じた
      useSessionStore.getState().setActiveStreakCeleb(null);
      expect(useSessionStore.getState().activeStreakCeleb).toBeNull();
    });
  });

  // ─── 回帰: ユーザー報告のシナリオ ─────────────────
  describe('🔥 回帰: アプリ再起動で祝福が再表示されない', () => {
    test('1日目に祝福 → アプリ再起動 → 祝福再表示しない', async () => {
      // 1回目セッション: 祝福する
      await useSessionStore.getState().loadCelebrated();
      const key = 'daily_goal_' + todayStr();
      useSessionStore.getState().markCelebrated(key);
      // micro task で永続化を待つ
      await Promise.resolve();
      const savedRaw = mockSet.mock.calls[mockSet.mock.calls.length - 1][1];

      // アプリ再起動シミュレーション: store をリセット
      resetStore();

      // AsyncStorage は前回の値を保持している想定で再ロード
      mockGet.mockResolvedValueOnce(savedRaw);
      await useSessionStore.getState().loadCelebrated();

      // 既に祝福済みなので isCelebrated は true
      expect(useSessionStore.getState().isCelebrated(key)).toBe(true);
    });
  });
});
