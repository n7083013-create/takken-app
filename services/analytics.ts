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
  | 'subscribe_cancel'  // 解約
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

/**
 * イベントを全ての有効な追跡サービスに送信
 */
export function trackEvent(eventName: EventName, params?: EventParams): void {
  // Web のみ動作
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;

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
    const raw = window.localStorage.getItem('takken_ad_attribution');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: AdAttribution; expires_at: number };
    if (typeof parsed.expires_at === 'number' && Date.now() > parsed.expires_at) {
      window.localStorage.removeItem('takken_ad_attribution');
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
