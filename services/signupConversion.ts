// ============================================================
// sign_up コンバージョンの「OAuth(Google/Apple)新規サインアップ」発火
// ============================================================
//
// 背景 (P-MAX 登録0 の真因):
//   sign_up コンバージョンは従来 app/auth/login.tsx の「メール登録」送信時に
//   しか発火していなかった。Google / Apple ログインは OAuth リダイレクトで
//   完結し session が onAuthStateChange で確立されるため、login.tsx の後続コードが
//   走らず sign_up が一切発火していなかった。
//   → ログイン画面は「Googleで続ける」が最上部で最速(パスワード/メール認証不要)なので、
//     広告流入ほど Google 登録が多く、登録が起きていてもコンバージョン未計上 → P-MAX 学習不能。
//
// 本モジュールは onAuthStateChange から呼ばれ、OAuth 新規サインアップに限って
// sign_up を「ユーザーごとに1回だけ」発火する。メール登録は引き続き login.tsx が
// 直接発火するため、provider で分離して二重計上を構造的に防ぐ。
//
// web 限定 (広告コンバージョンは web の gtag 経由)。native は no-op。

import { Platform } from 'react-native';
import { trackEventWithUserData } from './analytics';

/**
 * Supabase user の最小形 (本モジュールが必要とするフィールドのみ)。
 * 実際の Supabase User はより多くのフィールドを持つが、構造的部分型で受ける。
 */
export interface MinimalAuthUser {
  id: string;
  email?: string | null;
  /** ISO8601。アカウント作成時刻。新規判定に使う */
  created_at?: string;
  /** Supabase が付与するサインイン提供元。'email' | 'google' | 'apple' 等 */
  app_metadata?: { provider?: string; providers?: string[] } | null;
}

/** sign_up を発火させる OAuth provider のホワイトリスト */
const OAUTH_SIGNUP_PROVIDERS = ['google', 'apple'] as const;

/** 新規とみなす作成経過時間の窓 (既定: ±10分。時計ズレ両方向を許容) */
export const NEW_SIGNUP_WINDOW_MS = 10 * 60 * 1000;

/**
 * このサインインが「OAuth(Google/Apple)による新規サインアップ」かを判定する。
 *
 * 条件 (すべて満たす):
 *  1. provider が google / apple (email 登録は login.tsx が別途発火するため除外 = 二重計上防止)
 *  2. created_at が「今」から ±windowMs 以内 (新規作成のみ。既存ユーザーの再ログインを除外)
 *
 * @param user            Supabase user (最小形)
 * @param nowMs           現在時刻 (テスト容易性のため注入可能。既定 Date.now())
 * @param windowMs        新規判定の窓 (既定 NEW_SIGNUP_WINDOW_MS)
 */
export function isNewOAuthSignup(
  user: MinimalAuthUser | null | undefined,
  nowMs: number = Date.now(),
  windowMs: number = NEW_SIGNUP_WINDOW_MS,
): boolean {
  if (!user?.id || !user.created_at) return false;
  const provider = user.app_metadata?.provider;
  if (!provider || !OAUTH_SIGNUP_PROVIDERS.includes(provider as any)) return false;
  const created = new Date(user.created_at).getTime();
  if (!Number.isFinite(created)) return false;
  const age = nowMs - created;
  // 直近に作成 (時計ズレで未来側に振れても ±windowMs まで許容)。
  // 既存ユーザー (age が数時間〜数日) は除外される。
  return age < windowMs && age > -windowMs;
}

/** localStorage フラグの接頭辞 (ユーザーごとに1回だけ発火するため) */
const SIGNUP_FLAG_PREFIX = 'takken_signup_tracked_';

/**
 * sign_up コンバージョンを「ユーザーごとに1回だけ」発火する (web のみ)。
 *
 * - localStorage フラグで、再ログイン / トークン更新 / リロードによる二重発火を防止。
 * - 二重計上 (= 広告費の無駄・P-MAX 誤学習) を避けるため、発火 *前* にフラグを立てる
 *   (失敗時の取りこぼしより、二重発火を防ぐことを優先)。
 * - trackEventWithUserData 側で web 判定・管理者除外・Enhanced Conversions(email ハッシュ) を継承。
 *
 * @returns 実際に発火したら true / 既発火・対象外なら false
 */
export async function trackSignUpConversionOnce(
  userId: string | null | undefined,
  email: string | null | undefined,
): Promise<boolean> {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !userId) return false;
  try {
    const key = SIGNUP_FLAG_PREFIX + userId;
    if (window.localStorage.getItem(key)) return false; // 既に計上済み
    window.localStorage.setItem(key, '1'); // 先に立てて二重発火を防ぐ
    await trackEventWithUserData('sign_up', email ?? null, { currency: 'JPY' });
    return true;
  } catch {
    // 計測失敗はアプリ機能を妨げない
    return false;
  }
}
