// ============================================================
// オンボーディング表示判定 (純粋関数)
// ============================================================
//
// ログイン後にオンボーディングを表示するかを決定する。
// Race condition（クラウド同期完了前に判定するバグ）を回避するため、
// 必ず syncWithCloud を await してから progress 有無を判定する。
//
// 使用箇所: app/(tabs)/index.tsx
//
// 仕様:
// - userKey === 'true' → done (即完了、同期スキップ)
// - userKey なし + legacyKey === 'true' → userKey に書き込み + done (マイグレート)
// - userKey なし + legacy なし + cloud sync 後 progress あり → userKey に書き込み + done
// - userKey なし + legacy なし + cloud sync 後 progress なし → show (オンボーディング表示)
// - cloud sync が失敗してもクラッシュしない（catch して継続）

const USER_KEY_PREFIX = '@takken_onboarding_done_';
const LEGACY_KEY = '@takken_onboarding_done';

export type OnboardingDecision = 'done' | 'show';

export interface OnboardingDeps {
  /** ログイン中ユーザーの ID (Supabase user.id 等) */
  userId: string;
  /** AsyncStorage.getItem 相当: キーから値を取得 (なければ null) */
  storageGet: (key: string) => Promise<string | null>;
  /** AsyncStorage.setItem 相当: キーに値を保存 */
  storageSet: (key: string, value: string) => Promise<void>;
  /** クラウド同期実行 (失敗時の例外は内部で吸収される) */
  syncWithCloud: () => Promise<void>;
  /** ローカル progress 取得: ストア state からそのまま返す */
  getProgress: () => Record<string, unknown>;
  /**
   * [オプション] クラウドの onboarding_done フラグを読む。
   * syncWithCloud() 後に store に反映されている値を返す想定。
   * 別デバイスで完了済みのユーザーが新デバイスで再表示されないための判定に使う。
   * 未指定の場合は false として扱う（後方互換）。
   */
  getCloudOnboardingDone?: () => boolean;
}

/**
 * オンボーディングを表示するかを決定する。
 * Race condition 修正版（cloud sync を await してから判定する）。
 */
export async function decideOnboardingState(
  deps: OnboardingDeps,
): Promise<OnboardingDecision> {
  const userKey = `${USER_KEY_PREFIX}${deps.userId}`;

  // 1. user-specific key を確認
  const val = await deps.storageGet(userKey);
  if (val === 'true') return 'done';

  // 2. レガシーキーを確認 & マイグレート
  const legacy = await deps.storageGet(LEGACY_KEY);
  if (legacy === 'true') {
    await deps.storageSet(userKey, 'true').catch(() => {});
    return 'done';
  }

  // 3. クラウド同期を待つ (失敗は無視)
  try {
    await deps.syncWithCloud();
  } catch {
    // ignore - 同期失敗してもアプリは継続
  }

  // 4. 同期後の progress 有無 または クラウドの onboarding_done フラグを確認
  const progress = deps.getProgress();
  const hasProgress = Object.keys(progress || {}).length > 0;
  const cloudDone = deps.getCloudOnboardingDone?.() ?? false;
  if (hasProgress || cloudDone) {
    await deps.storageSet(userKey, 'true').catch(() => {});
    return 'done';
  }

  return 'show';
}

/**
 * テスト/外部参照用: キー名の定数
 */
export const ONBOARDING_KEYS = {
  userKeyPrefix: USER_KEY_PREFIX,
  legacyKey: LEGACY_KEY,
  /** ユーザー固有キーを組み立てる */
  forUser: (userId: string) => `${USER_KEY_PREFIX}${userId}`,
} as const;
