// ============================================================
// In-App Purchase サービス
// Apple IAP / Google Play Billing の統合レイヤー
// ============================================================
//
// App Store 提出前に以下の設定が必要:
// 1. Apple Developer Console で Subscription Group を作成
// 2. Product ID を登録 (例: com.takken.app.standard.monthly)
// 3. App Store Connect で価格設定
// 4. `expo-in-app-purchases` または `react-native-iap` をインストール
//
// Web版は引き続き PAY.JP を使用（Apple IAP はネイティブのみ）
// ============================================================

import { Platform } from 'react-native';

// Product IDs — Apple Developer Console で作成後に設定
export const IAP_PRODUCTS = {
  STANDARD_MONTHLY: 'com.takken.app.standard.monthly',
} as const;

/**
 * IAP初期化（アプリ起動時に呼ぶ）
 * TODO: expo-in-app-purchases インストール後に実装
 */
export async function initializeIAP(): Promise<void> {
  if (Platform.OS === 'web') return; // Web は PAY.JP を使用

  // TODO: Implementation
  // await IAPManager.initConnection();
  // await IAPManager.getSubscriptions([IAP_PRODUCTS.STANDARD_MONTHLY]);
  console.log('[IAP] Native IAP not yet implemented');
}

/**
 * サブスクリプション購入
 * TODO: expo-in-app-purchases インストール後に実装
 */
export async function purchaseSubscription(productId: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    throw new Error('Web purchases should use PAY.JP');
  }

  // TODO: Implementation
  // const purchase = await IAPManager.requestSubscription(productId);
  // await verifyReceiptOnServer(purchase.transactionReceipt);
  // return true;

  throw new Error('Native IAP not yet implemented');
}

/**
 * 購入の復元
 */
export async function restorePurchases(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  // TODO: Implementation
  // const purchases = await IAPManager.getAvailablePurchases();
  // for (const purchase of purchases) {
  //   await verifyReceiptOnServer(purchase.transactionReceipt);
  // }
  // return purchases.length > 0;

  return false;
}

/**
 * レシート検証（サーバーサイド）
 */
async function verifyReceiptOnServer(_receipt: string): Promise<void> {
  // TODO: /api/verify-receipt エンドポイントを作成して
  // Apple の verifyReceipt API でサーバーサイド検証
}

/**
 * IAP接続を閉じる（アプリ終了時）
 */
export async function finalizeIAP(): Promise<void> {
  if (Platform.OS === 'web') return;
  // TODO: IAPManager.endConnection();
}
