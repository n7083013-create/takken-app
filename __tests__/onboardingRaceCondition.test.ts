// ============================================================
// utils/onboarding.ts (オンボーディング判定) テスト
// ============================================================
//
// 背景:
// ユーザー報告:「毎回ログイン後にオンボーディングがでる」
// 原因: AsyncStorage の判定が、クラウド同期完了前に走り、
//        ローカル progress が空 → オンボーディング表示 が連発していた。
//
// 修正:
// 1. ユーザー固有キー @takken_onboarding_done_${userId} を使用 (多重ログイン対策)
// 2. レガシーキー @takken_onboarding_done を発見したら自動マイグレート
// 3. クラウド同期を await してから progress 有無を判定
// 4. progress があれば完了扱い + 以後はオンボーディング非表示
//
// 仕様:
// - userKey === 'true' → done (即完了)
// - userKey なし + legacyKey === 'true' → userKey に書き込み + done (マイグレート)
// - userKey なし + legacy なし + cloud sync 後 progress あり → userKey に書き込み + done
// - userKey なし + legacy なし + cloud sync 後 progress なし → show (オンボーディング表示)
// - cloud sync が失敗してもクラッシュしない（catch して継続）

import { decideOnboardingState, ONBOARDING_KEYS } from '../utils/onboarding';

type Progress = Record<string, unknown>;

/** テスト用: Map ベースの AsyncStorage モック */
function makeStorage(initial?: Iterable<[string, string]>) {
  const map = new Map<string, string>(initial);
  return {
    map,
    get: async (k: string) => map.get(k) ?? null,
    set: async (k: string, v: string) => {
      map.set(k, v);
    },
  };
}

describe('decideOnboardingState - Race Condition 解消', () => {
  // ----------------------------------------------------------
  // ケース1: user-specific key で即時 done
  // ----------------------------------------------------------

  test('userKey === "true" の場合、即 done を返す（クラウド同期は呼ばれない）', async () => {
    const storage = makeStorage([[ONBOARDING_KEYS.forUser('user-A'), 'true']]);
    const syncMock = jest.fn().mockResolvedValue(undefined);
    const result = await decideOnboardingState({
      userId: 'user-A',
      storageGet: storage.get,
      storageSet: storage.set,
      syncWithCloud: syncMock,
      getProgress: () => ({}),
    });
    expect(result).toBe('done');
    expect(syncMock).not.toHaveBeenCalled();
  });

  // ----------------------------------------------------------
  // ケース2: レガシーキー migration
  // ----------------------------------------------------------

  test('userKey なし + レガシーキー === "true" の場合、マイグレートして done', async () => {
    const storage = makeStorage([[ONBOARDING_KEYS.legacyKey, 'true']]);
    const syncMock = jest.fn().mockResolvedValue(undefined);
    const result = await decideOnboardingState({
      userId: 'user-B',
      storageGet: storage.get,
      storageSet: storage.set,
      syncWithCloud: syncMock,
      getProgress: () => ({}),
    });
    expect(result).toBe('done');
    // userKey に書き込まれている (マイグレート成功)
    expect(storage.map.get(ONBOARDING_KEYS.forUser('user-B'))).toBe('true');
    // 同期は呼ばれない（レガシーで完結）
    expect(syncMock).not.toHaveBeenCalled();
  });

  test('レガシーキーの値が "true" 以外の場合、マイグレートしない', async () => {
    const storage = makeStorage([[ONBOARDING_KEYS.legacyKey, 'false']]);
    const syncMock = jest.fn().mockResolvedValue(undefined);
    const result = await decideOnboardingState({
      userId: 'user-X',
      storageGet: storage.get,
      storageSet: storage.set,
      syncWithCloud: syncMock,
      getProgress: () => ({}),
    });
    expect(syncMock).toHaveBeenCalledTimes(1);
    expect(result).toBe('show');
  });

  // ----------------------------------------------------------
  // ケース3: クラウド同期後に progress 発見 → done
  // (これが Race Condition 修正の核心)
  // ----------------------------------------------------------

  test('userKey/レガシー なし + 同期後 progress あり → done', async () => {
    const storage = makeStorage();
    let progressData: Progress = {};
    const syncMock = jest.fn().mockImplementation(async () => {
      // 同期後に progress が埋まる (クラウドから取得した想定)
      progressData = { q1: { correctCount: 1 }, q2: { correctCount: 2 } };
    });

    const result = await decideOnboardingState({
      userId: 'user-C',
      storageGet: storage.get,
      storageSet: storage.set,
      syncWithCloud: syncMock,
      getProgress: () => progressData,
    });

    expect(syncMock).toHaveBeenCalledTimes(1);
    expect(result).toBe('done');
    expect(storage.map.get(ONBOARDING_KEYS.forUser('user-C'))).toBe('true');
  });

  test('progress 判定は cloud sync より「後」に走る (Race condition 修正の本質)', async () => {
    const storage = makeStorage();
    const callOrder: string[] = [];

    const syncMock = jest.fn().mockImplementation(async () => {
      callOrder.push('sync');
    });
    const getProgress = jest.fn().mockImplementation(() => {
      callOrder.push('getProgress');
      return { q1: { ok: true } };
    });

    await decideOnboardingState({
      userId: 'user-D',
      storageGet: storage.get,
      storageSet: storage.set,
      syncWithCloud: syncMock,
      getProgress,
    });

    expect(callOrder).toEqual(['sync', 'getProgress']);
  });

  // ----------------------------------------------------------
  // ケース4: 完全新規ユーザー → show
  // ----------------------------------------------------------

  test('userKey/レガシー/progress すべて なし → show (オンボーディング表示)', async () => {
    const storage = makeStorage();
    const syncMock = jest.fn().mockResolvedValue(undefined);

    const result = await decideOnboardingState({
      userId: 'new-user',
      storageGet: storage.get,
      storageSet: storage.set,
      syncWithCloud: syncMock,
      getProgress: () => ({}),
    });
    expect(syncMock).toHaveBeenCalledTimes(1);
    expect(result).toBe('show');
    // userKey は書き込まれない (まだ完了していないので)
    expect(storage.map.get(ONBOARDING_KEYS.forUser('new-user'))).toBeUndefined();
  });

  // ----------------------------------------------------------
  // ケース5: クラウド同期エラー耐性
  // ----------------------------------------------------------

  test('クラウド同期がエラーでも例外を伝播せず show を返す', async () => {
    const storage = makeStorage();
    const syncMock = jest.fn().mockRejectedValue(new Error('Network error'));

    await expect(
      decideOnboardingState({
        userId: 'user-E',
        storageGet: storage.get,
        storageSet: storage.set,
        syncWithCloud: syncMock,
        getProgress: () => ({}),
      }),
    ).resolves.toBe('show');
  });

  test('クラウド同期エラーでも progress があれば done', async () => {
    const storage = makeStorage();
    const syncMock = jest.fn().mockRejectedValue(new Error('Network error'));

    const result = await decideOnboardingState({
      userId: 'user-F',
      storageGet: storage.get,
      storageSet: storage.set,
      syncWithCloud: syncMock,
      getProgress: () => ({ q1: {} }),
    });
    expect(result).toBe('done');
  });

  // ----------------------------------------------------------
  // ケース6: 多重ログイン対策 (user-specific キー)
  // ----------------------------------------------------------

  test('ユーザーごとに独立した userKey で判定される', async () => {
    const storage = makeStorage([[ONBOARDING_KEYS.forUser('user-A'), 'true']]);
    const syncMock = jest.fn().mockResolvedValue(undefined);

    // user-A は done
    const resultA = await decideOnboardingState({
      userId: 'user-A',
      storageGet: storage.get,
      storageSet: storage.set,
      syncWithCloud: syncMock,
      getProgress: () => ({}),
    });
    expect(resultA).toBe('done');

    // user-B は show
    const resultB = await decideOnboardingState({
      userId: 'user-B',
      storageGet: storage.get,
      storageSet: storage.set,
      syncWithCloud: syncMock,
      getProgress: () => ({}),
    });
    expect(resultB).toBe('show');
  });

  // ----------------------------------------------------------
  // ケース7: 既存ユーザー（旧キー）が再ログイン → 自動マイグレート
  // ----------------------------------------------------------

  test('旧キー利用者が再ログインしても、オンボーディングが再表示されない', async () => {
    const storage = makeStorage([[ONBOARDING_KEYS.legacyKey, 'true']]);
    const syncMock = jest.fn().mockResolvedValue(undefined);

    // 初回ログイン: マイグレート
    const result1 = await decideOnboardingState({
      userId: 'legacy-user',
      storageGet: storage.get,
      storageSet: storage.set,
      syncWithCloud: syncMock,
      getProgress: () => ({}),
    });
    expect(result1).toBe('done');
    expect(storage.map.get(ONBOARDING_KEYS.forUser('legacy-user'))).toBe('true');

    // 再ログイン: user-specific キーで即 done (sync 呼ばれない)
    syncMock.mockClear();
    const result2 = await decideOnboardingState({
      userId: 'legacy-user',
      storageGet: storage.get,
      storageSet: storage.set,
      syncWithCloud: syncMock,
      getProgress: () => ({}),
    });
    expect(result2).toBe('done');
    expect(syncMock).not.toHaveBeenCalled();
  });

  // ----------------------------------------------------------
  // 回帰: Race Condition が再発しないことを保証
  // ----------------------------------------------------------

  test('回帰テスト: progress が遅延ロードされても、適切に判定される', async () => {
    const storage = makeStorage();
    let progressData: Progress = {};
    const syncMock = jest.fn().mockImplementation(async () => {
      // 50ms 後に progress が埋まる
      await new Promise((r) => setTimeout(r, 50));
      progressData = { q1: { ok: true } };
    });

    const result = await decideOnboardingState({
      userId: 'user-Z',
      storageGet: storage.get,
      storageSet: storage.set,
      syncWithCloud: syncMock,
      getProgress: () => progressData,
    });

    // 同期完了を待ってから判定したので、done になる
    expect(result).toBe('done');
  });

  test('回帰テスト: cloud sync を await しないバグが再発したら検知できる', async () => {
    const storage = makeStorage();
    let syncCompleted = false;
    const syncMock = jest.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      syncCompleted = true;
    });
    const getProgress = jest.fn().mockImplementation(() => {
      if (!syncCompleted) {
        throw new Error('REGRESSION: getProgress called before syncWithCloud completed!');
      }
      return {};
    });

    await expect(
      decideOnboardingState({
        userId: 'user-regression',
        storageGet: storage.get,
        storageSet: storage.set,
        syncWithCloud: syncMock,
        getProgress,
      }),
    ).resolves.toBe('show');
    expect(getProgress).toHaveBeenCalledTimes(1);
  });

  // ----------------------------------------------------------
  // ケース8: クラウドの onboarding_done フラグ (クロスデバイス再表示防止)
  // ----------------------------------------------------------

  test('getCloudOnboardingDone が true を返すなら progress なしでも done', async () => {
    const storage = makeStorage();
    let cloudFlag = false;
    const syncMock = jest.fn().mockImplementation(async () => {
      cloudFlag = true; // sync 後にフラグが立つ想定
    });

    const result = await decideOnboardingState({
      userId: 'cross-device-user',
      storageGet: storage.get,
      storageSet: storage.set,
      syncWithCloud: syncMock,
      getProgress: () => ({}), // progress なし
      getCloudOnboardingDone: () => cloudFlag,
    });

    expect(syncMock).toHaveBeenCalledTimes(1);
    expect(result).toBe('done');
    // userKey に書き込まれた (次回は sync なしで即 done)
    expect(storage.map.get(ONBOARDING_KEYS.forUser('cross-device-user'))).toBe('true');
  });

  test('getCloudOnboardingDone 未指定でも既存テストが壊れない (後方互換)', async () => {
    const storage = makeStorage();
    const syncMock = jest.fn().mockResolvedValue(undefined);

    const result = await decideOnboardingState({
      userId: 'no-cloud-dep-user',
      storageGet: storage.get,
      storageSet: storage.set,
      syncWithCloud: syncMock,
      getProgress: () => ({}),
      // getCloudOnboardingDone: 未指定
    });

    expect(result).toBe('show'); // progress なし + cloud フラグなし → show
  });

  // ----------------------------------------------------------
  // ONBOARDING_KEYS ヘルパー
  // ----------------------------------------------------------

  test('ONBOARDING_KEYS.forUser はユーザーIDをプレフィックスと組み合わせる', () => {
    expect(ONBOARDING_KEYS.forUser('abc-123')).toBe('@takken_onboarding_done_abc-123');
    expect(ONBOARDING_KEYS.userKeyPrefix).toBe('@takken_onboarding_done_');
    expect(ONBOARDING_KEYS.legacyKey).toBe('@takken_onboarding_done');
  });
});
