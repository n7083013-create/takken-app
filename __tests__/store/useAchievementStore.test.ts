// ============================================================
// useAchievementStore テスト
// ============================================================
//
// 重点: 「実績バッジが何度も表示される」バグの回帰防止
//
// ユーザー報告:
// 「ストリークなんだけど、起動させると何度も同じ実績バッジが表示される。
//  4日目なのに3日連続みたいな感じで。うっとうしいから一回だけでいい。」
//
// 原因 (旧実装):
// - saveAchievements() で newlyUnlocked も AsyncStorage に保存
// - loadAchievements() で newlyUnlocked を復元
// - dismiss しても次回起動時に古い配列が復元 → 同じトーストが再表示
//
// 修正:
// - saveAchievements(): unlocked のみ保存
// - loadAchievements(): newlyUnlocked は常に [] で初期化
//   (newlyUnlocked は「セッション中の未表示バッジ」であり永続化不要)

// AsyncStorage の動的モック (シナリオごとに getItem を制御)
const storage: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key: string) => Promise.resolve(storage[key] ?? null)),
  setItem: jest.fn((key: string, value: string) => {
    storage[key] = value;
    return Promise.resolve();
  }),
  removeItem: jest.fn((key: string) => {
    delete storage[key];
    return Promise.resolve();
  }),
}));

jest.mock('../../services/errorLogger', () => ({
  logError: jest.fn(),
}));

// cloudSync をモック (Supabase 依存を切り離す)
jest.mock('../../services/cloudSync', () => ({
  pullAchievementsFromCloud: jest.fn(() => Promise.resolve({})),
  pushAchievementsToCloud: jest.fn(() => Promise.resolve(true)),
  mergeAchievements: jest.fn((local: any, remote: any) => ({ ...local, ...remote })),
}));

import { useAchievementStore } from '../../store/useAchievementStore';

const STORAGE_KEY = '@takken_achievements';

describe('useAchievementStore', () => {
  beforeEach(() => {
    // ストレージとストアをクリア
    Object.keys(storage).forEach((k) => delete storage[k]);
    useAchievementStore.getState().resetStore();
    jest.clearAllMocks();
  });

  // ----------------------------------------------------------
  // checkAndUnlock の基本動作
  // ----------------------------------------------------------

  describe('checkAndUnlock - 達成判定', () => {
    test('ストリーク3日で streak_3 が解除される', () => {
      const result = useAchievementStore.getState().checkAndUnlock({
        streak: 3,
        totalAnswers: 5,
        accuracy: 0.6,
      });
      expect(result).toContain('streak_3');
    });

    test('同じ条件で2回呼んでも、2回目は新規解除されない (重複ロック防止)', () => {
      const store = useAchievementStore.getState();
      const first = store.checkAndUnlock({ streak: 3, totalAnswers: 5, accuracy: 0.6 });
      expect(first).toContain('streak_3');

      // ストアの newlyUnlocked にも追加
      useAchievementStore.setState((s) => ({
        unlocked: { ...s.unlocked, streak_3: new Date().toISOString() },
        newlyUnlocked: [...s.newlyUnlocked, 'streak_3'],
      }));

      // 2回目: 既に unlocked なので新規解除されない
      const second = useAchievementStore.getState().checkAndUnlock({
        streak: 4,
        totalAnswers: 5,
        accuracy: 0.6,
      });
      expect(second).not.toContain('streak_3');
    });
  });

  // ----------------------------------------------------------
  // 🚨 [Bugfix] newlyUnlocked が永続化されない
  // ----------------------------------------------------------

  describe('[Bugfix] newlyUnlocked が再起動後に復元されない', () => {
    test('saveAchievements は newlyUnlocked を AsyncStorage に保存しない', async () => {
      // newlyUnlocked に値をセット
      useAchievementStore.setState({
        unlocked: { streak_3: '2026-05-15T00:00:00.000Z' },
        newlyUnlocked: ['streak_3'],
      });

      await useAchievementStore.getState().saveAchievements();

      // 保存されたデータをパース
      const raw = storage[STORAGE_KEY];
      expect(raw).toBeDefined();
      const data = JSON.parse(raw);

      // unlocked は保存される
      expect(data.unlocked).toEqual({ streak_3: '2026-05-15T00:00:00.000Z' });
      // newlyUnlocked は保存されない (キー自体存在しない)
      expect(data.newlyUnlocked).toBeUndefined();
    });

    test('loadAchievements は newlyUnlocked を常に空配列で初期化する', async () => {
      // 旧実装で保存された古いデータをシミュレート (newlyUnlocked あり)
      storage[STORAGE_KEY] = JSON.stringify({
        unlocked: { streak_3: '2026-05-15T00:00:00.000Z' },
        newlyUnlocked: ['streak_3'], // ← 旧実装が保存していたゴミデータ
      });

      await useAchievementStore.getState().loadAchievements();

      const state = useAchievementStore.getState();
      expect(state.unlocked).toEqual({ streak_3: '2026-05-15T00:00:00.000Z' });
      // 古い newlyUnlocked は復元されない (= 同じトーストが再表示されない)
      expect(state.newlyUnlocked).toEqual([]);
    });

    test('回帰テスト: 達成→dismiss→再起動 で同じトーストが再表示されない', async () => {
      const store = useAchievementStore.getState();

      // 1) 達成
      const unlocks = store.checkAndUnlock({
        streak: 3,
        totalAnswers: 5,
        accuracy: 0.6,
      });
      expect(unlocks).toContain('streak_3');

      // ストアに反映 (実際は呼び出し側で行う)
      useAchievementStore.setState((s) => ({
        unlocked: { ...s.unlocked, streak_3: new Date().toISOString() },
        newlyUnlocked: [...s.newlyUnlocked, 'streak_3'],
      }));

      // 2) ユーザーがトースト dismiss
      useAchievementStore.getState().dismissNew('streak_3');
      expect(useAchievementStore.getState().newlyUnlocked).toEqual([]);

      // 3) 保存
      await useAchievementStore.getState().saveAchievements();

      // 4) 再起動シミュレーション: ストアをリセット → load
      useAchievementStore.getState().resetStore();
      // (resetStore は AsyncStorage も削除するので、保存し直す)
      storage[STORAGE_KEY] = JSON.stringify({
        unlocked: { streak_3: new Date().toISOString() },
      });

      await useAchievementStore.getState().loadAchievements();

      // 5) 検証: 再起動後も newlyUnlocked は空 (= 同じトーストが再表示されない)
      expect(useAchievementStore.getState().newlyUnlocked).toEqual([]);
    });

    test('回帰テスト: 4日目に再判定しても streak_3 は再トーストされない', async () => {
      // 3日目: streak_3 達成済み
      storage[STORAGE_KEY] = JSON.stringify({
        unlocked: { streak_3: '2026-05-15T00:00:00.000Z' },
      });
      await useAchievementStore.getState().loadAchievements();

      // 起動時に newlyUnlocked は空
      expect(useAchievementStore.getState().newlyUnlocked).toEqual([]);

      // 4日目に再判定: streak=4 でも streak_3 は既に unlocked
      const newUnlocks = useAchievementStore.getState().checkAndUnlock({
        streak: 4,
        totalAnswers: 20,
        accuracy: 0.7,
      });

      // streak_3 は新規解除されない (既に unlocked)
      expect(newUnlocks).not.toContain('streak_3');
      // streak_7 もまだ達成条件未満
      expect(newUnlocks).not.toContain('streak_7');
    });

    test('複数の実績を達成→dismiss後の再起動でも残らない', async () => {
      // 複数の実績を達成
      useAchievementStore.setState({
        unlocked: {
          streak_3: '2026-05-15T00:00:00.000Z',
          answers_10: '2026-05-15T00:00:00.000Z',
        },
        newlyUnlocked: ['streak_3', 'answers_10'],
      });

      // 個別に dismiss
      useAchievementStore.getState().dismissNew('streak_3');
      useAchievementStore.getState().dismissNew('answers_10');
      expect(useAchievementStore.getState().newlyUnlocked).toEqual([]);

      // 保存→再起動
      await useAchievementStore.getState().saveAchievements();
      useAchievementStore.getState().resetStore();
      storage[STORAGE_KEY] = JSON.stringify({
        unlocked: {
          streak_3: '2026-05-15T00:00:00.000Z',
          answers_10: '2026-05-15T00:00:00.000Z',
        },
      });
      await useAchievementStore.getState().loadAchievements();

      // newlyUnlocked は空
      expect(useAchievementStore.getState().newlyUnlocked).toEqual([]);
      // unlocked は維持
      expect(useAchievementStore.getState().unlocked).toEqual({
        streak_3: '2026-05-15T00:00:00.000Z',
        answers_10: '2026-05-15T00:00:00.000Z',
      });
    });
  });

  // ----------------------------------------------------------
  // dismissNew の挙動
  // ----------------------------------------------------------

  describe('dismissNew', () => {
    test('指定IDを newlyUnlocked から削除する', () => {
      useAchievementStore.setState({
        unlocked: {},
        newlyUnlocked: ['streak_3', 'answers_10'],
      });
      useAchievementStore.getState().dismissNew('streak_3');
      expect(useAchievementStore.getState().newlyUnlocked).toEqual(['answers_10']);
    });

    test('存在しないIDを dismiss してもエラーにならない', () => {
      useAchievementStore.setState({
        unlocked: {},
        newlyUnlocked: ['streak_3'],
      });
      useAchievementStore.getState().dismissNew('answers_100');
      expect(useAchievementStore.getState().newlyUnlocked).toEqual(['streak_3']);
    });
  });

  // ----------------------------------------------------------
  // isUnlocked
  // ----------------------------------------------------------

  describe('isUnlocked', () => {
    test('解除済みは true', () => {
      useAchievementStore.setState({
        unlocked: { streak_3: '2026-05-15T00:00:00.000Z' },
        newlyUnlocked: [],
      });
      expect(useAchievementStore.getState().isUnlocked('streak_3')).toBe(true);
    });

    test('未解除は false', () => {
      useAchievementStore.setState({ unlocked: {}, newlyUnlocked: [] });
      expect(useAchievementStore.getState().isUnlocked('streak_3')).toBe(false);
    });
  });
});
