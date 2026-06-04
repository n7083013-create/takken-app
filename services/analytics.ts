// ============================================================
// アナリティクス & 広告コンバージョン追跡
// ============================================================
// LP の主要コンバージョンイベント（サインアップ、サブスク開始、解約等）を
// GA4 / Meta Pixel / TikTok Pixel / X Pixel に送信
//
// 環境変数が未設定なら何も送信しない（安全なデフォルト）
//
// 使い方:
//   import { trackEvent } from '../services/analytics';
//   trackEvent('subscribe_start');
//   trackEvent('subscribe_complete', { value: 980, currency: 'JPY' });

import { Platform } from 'react-native';

type EventParams = {
  value?: number;
  currency?: string;
  content_ids?: string[];
  [key: string]: any;
};

type EventName =
  | 'page_view'
  | 'sign_up'
  | 'login'
  | 'view_paywall'      // paywall 画面を表示 (課金検討開始)
  | 'trial_start'       // 無料トライアル開始
  | 'subscribe_start'   // サブスク登録フロー開始 (PayPal CTA クリック)
  | 'subscribe_complete' // サブスク有効化完了 (本契約成立)
  | 'subscribe_cancel'  // 解約 (実際にキャンセル完了)
  // ── 解約防止フロー (2026-05) ──
  | 'cancel_flow_started'         // 解約ボタン押下 → reason picker 表示
  | 'cancel_flow_reason_selected' // 解約理由を選択
  | 'cancel_flow_offer_accepted'  // counter-offer を受け入れた (解約を回避)
  | 'cancel_flow_offer_declined'  // counter-offer を断った
  | 'cancel_flow_completed'       // 最終確認後、実際に解約処理を発火
  | 'first_question_answered'  // 初めて問題を解いた (アクティベーション)
  | 'exam_passed'       // 模擬試験合格 (満足度・継続予測)
  | 'custom';

// Google Ads コンバージョン ID（広告管理画面の「コンバージョン」で発行）
// defaultValue は管理画面のコンバージョン設定「該当値ない場合は ¥1」と一致させる
const GOOGLE_ADS_CONVERSIONS: Partial<Record<EventName, { id: string; defaultValue?: number }>> = {
  sign_up: { id: 'AW-18116818716/P5JmCL6mraIcEJzu4r5D', defaultValue: 1 },
  subscribe_complete: { id: 'AW-18116818716/WSNpCIvslaIcEJzu4r5D', defaultValue: 980 },
  trial_start: { id: 'AW-18116818716/P5JmCL6mraIcEJzu4r5D', defaultValue: 1 },
};

// ============================================================
// 計測除外 (管理者・テストアカウント等の自己コンバージョン汚染を防止)
// ============================================================
const STORAGE_KEY_EXCLUDED = 'takken_analytics_excluded';

/**
 * 現在のセッションで計測除外が有効か
 * - 管理者 (EXPO_PUBLIC_ADMIN_EMAILS に含まれる email) のログイン時に自動で true になる
 * - QA テスト用に手動で setAnalyticsExcluded(true) でも有効化可能
 */
export function isAnalyticsExcluded(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY_EXCLUDED) === '1';
  } catch {
    return false;
  }
}

/**
 * 計測除外フラグを設定
 * useAuthStore のログイン処理で自動的に呼び出される (admin email の場合 true、それ以外は false)
 */
export function setAnalyticsExcluded(excluded: boolean): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    if (excluded) {
      window.localStorage.setItem(STORAGE_KEY_EXCLUDED, '1');
    } else {
      window.localStorage.removeItem(STORAGE_KEY_EXCLUDED);
    }
  } catch {}
}

/**
 * email が管理者リストに含まれるか判定し、計測除外フラグを自動設定
 * useAuthStore から呼ぶことを想定 (循環依存を避けるため auth から analytics への一方向のみ)
 */
export function syncAnalyticsExclusionForUser(email: string | null | undefined): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  if (!email) {
    setAnalyticsExcluded(false);
    return;
  }
  try {
    const adminEmailsRaw = process.env.EXPO_PUBLIC_ADMIN_EMAILS || '';
    const adminEmails = adminEmailsRaw
      .split(',')
      .map((e: string) => e.trim().toLowerCase())
      .filter(Boolean);
    if (adminEmails.length === 0) {
      setAnalyticsExcluded(false);
      return;
    }
    const normalized = email.toLowerCase().trim();
    setAnalyticsExcluded(adminEmails.includes(normalized));
  } catch {
    // 設定取得失敗時は安全側 (除外しない・計測する) に倒す
    setAnalyticsExcluded(false);
  }
}

/**
 * イベントを全ての有効な追跡サービスに送信
 */
export function trackEvent(eventName: EventName, params?: EventParams): void {
  // Web のみ動作
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  // [計測除外] 管理者・テストアカウントの自己コンバージョン汚染を防ぐ
  if (isAnalyticsExcluded()) return;

  try {
    const w = window as any;

    // GA4 / 一般イベント
    if (typeof w.gtag === 'function') {
      w.gtag('event', eventName, params);
    }

    // Google Ads コンバージョントラッキング（特定イベントのみ）
    const conv = GOOGLE_ADS_CONVERSIONS[eventName];
    if (conv && typeof w.gtag === 'function') {
      w.gtag('event', 'conversion', {
        send_to: conv.id,
        value: params?.value ?? conv.defaultValue ?? 0,
        currency: params?.currency ?? 'JPY',
        transaction_id: params?.transaction_id ?? '',
      });
    }

    // Meta (Facebook) Pixel
    if (typeof w.fbq === 'function') {
      // Meta 標準イベントにマッピング
      const fbEvent = mapToMetaEvent(eventName);
      if (fbEvent) {
        w.fbq('track', fbEvent, {
          value: params?.value,
          currency: params?.currency,
          ...params,
        });
      } else {
        w.fbq('trackCustom', eventName, params);
      }
    }

    // TikTok Pixel
    if (typeof w.ttq !== 'undefined' && typeof w.ttq.track === 'function') {
      const tkEvent = mapToTikTokEvent(eventName);
      w.ttq.track(tkEvent, {
        value: params?.value,
        currency: params?.currency,
        ...params,
      });
    }

    // X (Twitter) Pixel
    if (typeof w.twq === 'function') {
      w.twq('event', eventName, params);
    }
  } catch {
    // 追跡エラーはアプリ動作を妨げない
  }
}

/** GA4 イベント → Meta Pixel 標準イベント */
function mapToMetaEvent(eventName: EventName): string | null {
  const map: Partial<Record<EventName, string>> = {
    sign_up: 'CompleteRegistration',
    trial_start: 'StartTrial',
    subscribe_start: 'InitiateCheckout',
    subscribe_complete: 'Subscribe',
    page_view: 'PageView',
  };
  return map[eventName] ?? null;
}

/** GA4 イベント → TikTok 標準イベント */
function mapToTikTokEvent(eventName: EventName): string {
  const map: Partial<Record<EventName, string>> = {
    sign_up: 'CompleteRegistration',
    trial_start: 'StartTrial',
    subscribe_start: 'InitiateCheckout',
    subscribe_complete: 'Subscribe',
    page_view: 'ViewContent',
  };
  return map[eventName] ?? eventName;
}

/**
 * 現在ページにアナリティクス追跡タグが読み込まれているか
 */
export function isAnalyticsEnabled(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const w = window as any;
  return typeof w.gtag === 'function' ||
    typeof w.fbq === 'function' ||
    typeof w.ttq !== 'undefined' ||
    typeof w.twq === 'function';
}

// ============================================================
// 広告アトリビューション (GCLID / wbraid / gbraid / UTM) 取得
// ============================================================
export interface AdAttribution {
  gclid?: string;
  wbraid?: string;
  gbraid?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  captured_at?: string;
  landing_page?: string;
}

/**
 * localStorage に保存された広告アトリビューションを取得 (90日有効)
 * - LP の HTML inline script で保存される (lp.html / index.html)
 * - sign_up 時に Supabase profiles に保存し、IAP webhook で Google Ads に送信
 */
export function getAdAttribution(): AdAttribution | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    // [2026-06-03] サブドメイン間(LP=takkenkanzen.com → app=app.takkenkanzen.com)で
    // 共有されるドメインCookieを優先して読む。localStorage はオリジン分離で、
    // LP で保存した gclid を app 側から読めず ad_gclid が null になっていた不具合の修正。
    let raw: string | null = null;
    if (typeof document !== 'undefined' && document.cookie) {
      const m = document.cookie.match(/(?:^|;\s*)takken_ad_attribution=([^;]+)/);
      if (m && m[1]) {
        try { raw = decodeURIComponent(m[1]); } catch { raw = m[1]; }
      }
    }
    // フォールバック: 同一オリジンに直接着地したケースは localStorage
    if (!raw) raw = window.localStorage.getItem('takken_ad_attribution');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: AdAttribution; expires_at: number };
    if (typeof parsed.expires_at === 'number' && Date.now() > parsed.expires_at) {
      window.localStorage.removeItem('takken_ad_attribution');
      try { document.cookie = 'takken_ad_attribution=; domain=.takkenkanzen.com; path=/; max-age=0'; } catch {}
      return null;
    }
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

/**
 * 同意状態を更新 (Consent Mode v2)
 * - cookie バナー等で広告同意を取得した後に呼ぶ
 * - 'denied' に戻すと cookieless conversion modeling になる
 */
export function updateConsent(state: {
  ad_storage?: 'granted' | 'denied';
  ad_user_data?: 'granted' | 'denied';
  ad_personalization?: 'granted' | 'denied';
  analytics_storage?: 'granted' | 'denied';
}): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    const w = window as any;
    if (typeof w.gtag === 'function') {
      w.gtag('consent', 'update', state);
    }
  } catch {}
}

/**
 * Enhanced Conversions: email を SHA-256 ハッシュ化して送信
 * Google Ads / GA4 で iOS Safari ITP (cookie制限) を超えてマッチングする世界標準。
 *
 * @param email ユーザーの email (生値・正規化前)
 * @returns SHA-256 hex 64文字 (生 email は永久に外部送信しない)
 */
export async function hashEmailForEnhancedConversions(email: string): Promise<string | null> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    // Google 指定の正規化: lowercase + trim
    const normalized = email.trim().toLowerCase();
    const encoder = new TextEncoder();
    const data = encoder.encode(normalized);
    const hashBuffer = await (window.crypto.subtle as SubtleCrypto).digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

/**
 * Enhanced Conversions 付きでイベント送信
 * Google Ads にハッシュ化済み email を渡し、cookie 不依存のマッチングを実現。
 *
 * 利用例:
 *   await trackEventWithUserData('sign_up', userEmail, { currency: 'JPY' });
 */
export async function trackEventWithUserData(
  eventName: EventName,
  email: string | null,
  params?: EventParams,
): Promise<void> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  // [計測除外] 管理者・テストアカウントは早期 return
  if (isAnalyticsExcluded()) return;
  try {
    const w = window as any;
    if (!email || typeof w.gtag !== 'function') {
      // ハッシュ化できない場合は通常イベントとして送信
      trackEvent(eventName, params);
      return;
    }
    const hashedEmail = await hashEmailForEnhancedConversions(email);
    if (hashedEmail) {
      // user_data で Google Ads に email hash を送る (Enhanced Conversions)
      w.gtag('set', 'user_data', {
        sha256_email_address: hashedEmail,
      });
    }
    trackEvent(eventName, params);
  } catch {
    // 失敗時もコア機能を妨げない
    trackEvent(eventName, params);
  }
}
