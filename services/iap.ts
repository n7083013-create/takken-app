// ============================================================
// In-App Purchase サービス（Google Play Billing 実装）
// ============================================================
// アーキテクチャ:
//   1. クライアント (app)        : react-native-iap で購入フロー実行
//   2. サーバー (vercel function): Google Play Developer API でレシート検証
//   3. RTDN (vercel function)    : Real-Time Developer Notifications で更新/解約検知
//
// 動作プラットフォーム:
//   - Android: Google Play Billing
//   - iOS:     Apple IAP（同じインターフェイス）— Apple サブミット時に検証エンドポイント要追加
//   - Web:     PayPal（既存・iap.ts は呼ばれない）
//
// IMPORTANT:
// - 起動時に initializeIAP() を呼び、購入リスナーを起動
// - 購入後は必ず finishTransaction() でアクノレッジしないと
//   ユーザーが3日後に自動返金される（Google Play 仕様）
// ============================================================

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logError } from './errorLogger';
import { API_BASE_URL } from '../constants/config';
import { useAuthStore } from '../store/useAuthStore';
import type { BillingCycle } from '../types';

// Issue #7: 購入直後に verify が失敗した場合に保存しておく
// 起動時/復帰時/ログイン時にリトライして finishTransaction 漏れを防ぐ
const PENDING_PURCHASE_KEY = '@takken_pending_iap_purchases';

async function queuePendingPurchase(purchase: any): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_PURCHASE_KEY);
    const list: any[] = raw ? JSON.parse(raw) : [];
    // 重複チェック（productId + transactionId / purchaseToken）
    const id = purchase.transactionId || purchase.purchaseToken;
    if (id && !list.some((p) => (p.transactionId || p.purchaseToken) === id)) {
      list.push({
        productId: purchase.productId,
        transactionId: purchase.transactionId,
        purchaseToken: purchase.purchaseToken,
        transactionReceipt: purchase.transactionReceipt,
        queuedAt: Date.now(),
      });
      await AsyncStorage.setItem(PENDING_PURCHASE_KEY, JSON.stringify(list));
    }
  } catch (e) {
    logError(e, { context: 'iap.queuePendingPurchase' });
  }
}

/**
 * 保存されている pending purchase を一括で再検証 + finishTransaction
 * - 起動時 / ログイン直後 / paywall 表示時に呼ぶ
 */
export async function retryPendingPurchases(): Promise<number> {
  if (Platform.OS === 'web') return 0;
  try {
    const raw = await AsyncStorage.getItem(PENDING_PURCHASE_KEY);
    if (!raw) return 0;
    const list: any[] = JSON.parse(raw);
    if (!list.length) return 0;

    const lib = await loadIAPLib();
    if (!lib) return 0;
    if (!connectionInitialized) {
      try { await lib.initConnection(); connectionInitialized = true; } catch {}
    }

    const remaining: any[] = [];
    let resolved = 0;
    for (const purchase of list) {
      const verified = await verifyPurchaseOnServer(purchase);
      if (verified) {
        try {
          await lib.finishTransaction({ purchase, isConsumable: false });
          resolved++;
        } catch (e) {
          logError(e, { context: 'iap.retryPendingPurchases.finish' });
          remaining.push(purchase);
        }
      } else {
        // 24時間以上残っている場合は警告 + 残す（運営が手動対応する余地）
        if (Date.now() - (purchase.queuedAt || 0) > 24 * 60 * 60 * 1000) {
          logError(new Error('Pending purchase still unverified > 24h'), {
            context: 'iap.retryPendingPurchases',
            extra: { productId: purchase.productId },
          });
        }
        remaining.push(purchase);
      }
    }
    if (remaining.length === 0) {
      await AsyncStorage.removeItem(PENDING_PURCHASE_KEY);
    } else {
      await AsyncStorage.setItem(PENDING_PURCHASE_KEY, JSON.stringify(remaining));
    }
    return resolved;
  } catch (e) {
    logError(e, { context: 'iap.retryPendingPurchases' });
    return 0;
  }
}

// 各プラットフォームのプロダクトID(月額 / 年額)
// ────────────────────────────────────────────────────────────
// ⚠️ ストア側の SKU 登録が前提:
//   App Store Connect / Google Play Console で下記 ID の商品を作成すること。
//   - 月額: premium_monthly        / com.takkenkanzen.app.premium.monthly   (¥980/月・7日トライアル)
//   - 年額: premium_annual         / com.takkenkanzen.app.premium.annual    (¥5,980/年・7日トライアル)
//   コードは年額対応済み。年額 SKU が**ストア未登録**の場合、年額購入は
//   fetchSubscriptionInfo が null → purchaseSubscription が明示エラーで弾く
//   (月額には一切影響しない)。年額 SKU 登録後そのまま購入可能になる。
//   詳細手順: ObsidianVault/10_Projects/資格アプリ開発/ストア提出プレイブック.md
// ────────────────────────────────────────────────────────────
export const IAP_PRODUCTS = {
  // Google Play では短い ID 推奨（Play Console で同じ ID を作成）
  PREMIUM_MONTHLY_ANDROID: 'premium_monthly',
  PREMIUM_ANNUAL_ANDROID: 'premium_annual',
  // Apple IAP は逆ドメイン形式
  PREMIUM_MONTHLY_IOS: 'com.takkenkanzen.app.premium.monthly',
  PREMIUM_ANNUAL_IOS: 'com.takkenkanzen.app.premium.annual',
} as const;

/** 課金サイクル + プラットフォームから Product ID を解決 */
export function getProductId(billingCycle: BillingCycle = 'monthly'): string {
  const annual = billingCycle === 'annual';
  if (Platform.OS === 'android') {
    return annual ? IAP_PRODUCTS.PREMIUM_ANNUAL_ANDROID : IAP_PRODUCTS.PREMIUM_MONTHLY_ANDROID;
  }
  if (Platform.OS === 'ios') {
    return annual ? IAP_PRODUCTS.PREMIUM_ANNUAL_IOS : IAP_PRODUCTS.PREMIUM_MONTHLY_IOS;
  }
  throw new Error('IAP is only supported on iOS and Android');
}

// 動的 import で Web ビルド時の参照エラーを回避
// （expo-iap は native モジュールのため Web からは触れない）
let IAPLib: any = null;
let purchaseUpdateSub: any = null;
let purchaseErrorSub: any = null;
let connectionInitialized = false;

async function loadIAPLib() {
  if (IAPLib || Platform.OS === 'web') return IAPLib;
  try {
    // @ts-ignore — Web ビルド時に型が見つからない場合があるため
    IAPLib = await import('expo-iap');
    return IAPLib;
  } catch (e) {
    logError(e, { context: 'iap.loadIAPLib' });
    return null;
  }
}

/**
 * 起動時に呼ぶ：ストア接続 + 購入リスナー登録
 */
export async function initializeIAP(): Promise<void> {
  if (Platform.OS === 'web') return;
  if (connectionInitialized) return;

  const lib = await loadIAPLib();
  if (!lib) return;

  try {
    await lib.initConnection();
    connectionInitialized = true;

    // 購入完了リスナー — 購入後に呼ばれる
    purchaseUpdateSub = lib.purchaseUpdatedListener(async (purchase: any) => {
      try {
        const verified = await verifyPurchaseOnServer(purchase);
        if (verified) {
          // 購入アクノレッジ（必須・3日以内）
          await lib.finishTransaction({ purchase, isConsumable: false });
          return;
        }

        // Issue #7: verify が失敗した（多くは ログイン切れ／オフライン／一時障害）。
        // ここで何もしないと Google は 3日後に自動返金、ユーザーは課金されてないのに
        // サーバー認識上「課金済み」のまま乖離する致命的状態になる。
        // → ペンディングキューに保存し、復帰時に再 verify する仕組みを使う。
        logError(new Error('IAP verification failed - queued for retry'), {
          context: 'iap.purchaseUpdated',
          extra: { productId: purchase.productId },
        });
        await queuePendingPurchase(purchase);
        // finishTransaction はしない（再 verify 成功後に呼ぶ）
      } catch (e) {
        logError(e, { context: 'iap.purchaseUpdatedListener' });
      }
    });

    // エラーリスナー
    purchaseErrorSub = lib.purchaseErrorListener((error: any) => {
      // ユーザー キャンセルは想定内（旧コード E_USER_CANCELLED と新 OpenIAP 仕様 'user-cancelled' / 'userCancelled' 両方ハンドリング）
      const code = String(error?.code || '').toLowerCase();
      if (
        code === 'user-cancelled' ||
        code === 'usercancelled' ||
        code === 'e_user_cancelled' ||
        code === 'user_cancelled'
      ) return;
      logError(new Error(error?.message || 'IAP error'), {
        context: 'iap.purchaseError',
        extra: { code: error?.code },
      });
    });
  } catch (e) {
    logError(e, { context: 'iap.initialize' });
  }
}

/**
 * アプリ終了 / ログアウト時にリソース解放
 */
export async function teardownIAP(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    purchaseUpdateSub?.remove();
    purchaseErrorSub?.remove();
    purchaseUpdateSub = null;
    purchaseErrorSub = null;
    if (IAPLib && connectionInitialized) {
      await IAPLib.endConnection();
      connectionInitialized = false;
    }
  } catch (e) {
    logError(e, { context: 'iap.teardown' });
  }
}

/**
 * サブスクリプション情報取得（価格表示用）
 */
export async function fetchSubscriptionInfo(billingCycle: BillingCycle = 'monthly'): Promise<{
  price: string;
  currency: string;
  title: string;
  offerToken?: string;
} | null> {
  if (Platform.OS === 'web') return null;
  const lib = await loadIAPLib();
  if (!lib) return null;

  const annual = billingCycle === 'annual';
  const fallbackPrice = annual ? '¥5,980' : '¥980';
  const fallbackTitle = annual ? 'Premium 年額プラン' : 'Premium 月額プラン';

  try {
    if (!connectionInitialized) await lib.initConnection();
    const sku = getProductId(billingCycle);
    // expo-iap: fetchProducts API（getSubscriptions も alias で生きてる）
    const subscriptions = lib.fetchProducts
      ? await lib.fetchProducts({ skus: [sku], type: 'subs' })
      : await lib.getSubscriptions({ skus: [sku] });
    // 年額 SKU がストア未登録だと空配列 → null を返し、購入側で「年額は準備中」として弾く
    if (!subscriptions?.length) return null;
    const sub = subscriptions[0];

    // Android (Play Billing v6+): subscriptionOfferDetails から取得
    // expo-iap v4+ は Android-suffix 付き名前 (`subscriptionOfferDetailsAndroid`) を新仕様に。
    // 古い名前と新しい名前の両方に対応（バージョン差異の安全網）。
    if (Platform.OS === 'android') {
      const offerDetails =
        sub.subscriptionOfferDetailsAndroid ??
        sub.subscriptionOfferDetails;
      const offer = offerDetails?.[0];
      // pricingPhases は `{ pricingPhaseList: [...] }` の形と純配列 `[...]` の両方ありうる
      const phaseList =
        offer?.pricingPhases?.pricingPhaseList ??
        offer?.pricingPhases ??
        [];
      const phase = phaseList[0];
      return {
        price: phase?.formattedPrice ?? sub.localizedPrice ?? sub.displayPrice ?? fallbackPrice,
        currency: phase?.priceCurrencyCode ?? 'JPY',
        title: sub.title ?? sub.displayName ?? fallbackTitle,
        offerToken: offer?.offerToken,
      };
    }

    // iOS
    return {
      price: sub.localizedPrice ?? sub.displayPrice ?? fallbackPrice,
      currency: sub.currency ?? sub.currencyCode ?? 'JPY',
      title: sub.title ?? sub.displayName ?? fallbackTitle,
    };
  } catch (e) {
    logError(e, { context: 'iap.fetchSubscriptionInfo' });
    return null;
  }
}

/**
 * サブスクリプション購入を開始
 * 購入完了は purchaseUpdatedListener で非同期に検知
 */
export async function purchaseSubscription(billingCycle: BillingCycle = 'monthly'): Promise<void> {
  if (Platform.OS === 'web') {
    throw new Error('Web は paywall.tsx で PayPal を使用してください');
  }
  // 必ず initializeIAP を経由してリスナーが登録されている状態にする（再入可・冪等）
  // teardownIAP 後や HMR 後に paywall を直接開いた場合の race を防止
  await initializeIAP();
  const lib = await loadIAPLib();
  if (!lib) throw new Error('IAP モジュールが読み込めません');
  if (!connectionInitialized) await lib.initConnection();

  const sku = getProductId(billingCycle);

  if (Platform.OS === 'android') {
    // Android Play Billing v6+ は offerToken 必須
    const info = await fetchSubscriptionInfo(billingCycle);
    if (!info?.offerToken) {
      // 年額 SKU がストア未登録だと info=null。月額には影響させず、年額のみ明示エラー。
      throw new Error(
        billingCycle === 'annual'
          ? '年額プランは現在準備中です。月額プランをご利用ください。'
          : 'サブスクリプション情報を取得できませんでした',
      );
    }
    // expo-iap v4+: per-platform request shape
    // Android は skus (複数形・配列) + subscriptionOffers
    await lib.requestPurchase({
      request: {
        android: {
          skus: [sku],
          subscriptionOffers: [{ sku, offerToken: info.offerToken }],
        },
      },
      type: 'subs',
    });
    return;
  }

  // iOS — 年額 SKU がストア未登録なら requestPurchase 前に弾く(分かりやすいエラーに)。
  // 月額は従来どおり(info 取得は購入前チェックのみで、失敗時も月額は親切メッセージ)。
  const iosInfo = await fetchSubscriptionInfo(billingCycle);
  if (!iosInfo) {
    throw new Error(
      billingCycle === 'annual'
        ? '年額プランは現在準備中です。月額プランをご利用ください。'
        : 'サブスクリプション情報を取得できませんでした',
    );
  }

  // iOS — per-platform request shape
  // SECURITY (Issue #4): appAccountToken に user.id を渡してトランザクションを user に紐付け
  // サーバー側で apple-asn / verify-receipt が一致確認することで他人の購入の流用を防ぐ
  const userId = useAuthStore.getState().user?.id;
  await lib.requestPurchase({
    request: {
      ios: {
        sku,
        // appAccountToken は UUID。Supabase の user.id は UUID 形式なのでそのまま使える
        ...(userId ? { appAccountToken: userId } : {}),
      },
    },
    type: 'subs',
  });
}

/**
 * 購入の復元（アプリ再インストール後など）
 */
export async function restorePurchases(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const lib = await loadIAPLib();
  if (!lib) return false;

  try {
    if (!connectionInitialized) await lib.initConnection();
    const purchases = await lib.getAvailablePurchases();
    let anyVerified = false;
    for (const purchase of purchases) {
      const verified = await verifyPurchaseOnServer(purchase);
      if (verified) {
        await lib.finishTransaction({ purchase, isConsumable: false });
        anyVerified = true;
      }
    }
    return anyVerified;
  } catch (e) {
    logError(e, { context: 'iap.restorePurchases' });
    return false;
  }
}

/**
 * サーバー側で購入レシート検証
 * Google Play Developer API / App Store Server API を経由
 */
async function verifyPurchaseOnServer(purchase: any): Promise<boolean> {
  const session = useAuthStore.getState().session;
  if (!session?.access_token) {
    logError(new Error('No session for IAP verify'), { context: 'iap.verify' });
    return false;
  }

  try {
    const platform = Platform.OS; // 'android' | 'ios'
    const body = {
      platform,
      productId: purchase.productId,
      // Android: purchaseToken / iOS: transactionReceipt
      purchaseToken: purchase.purchaseToken ?? null,
      transactionReceipt: purchase.transactionReceipt ?? null,
      transactionId: purchase.transactionId ?? null,
    };

    const res = await fetch(`${API_BASE_URL}/iap/verify-receipt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      logError(new Error(data.error || `Verify failed: ${res.status}`), {
        context: 'iap.verify.serverResponse',
        extra: { status: res.status, productId: purchase.productId },
      });
      return false;
    }

    const data = await res.json();
    return data.ok === true;
  } catch (e) {
    logError(e, { context: 'iap.verifyPurchaseOnServer' });
    return false;
  }
}
