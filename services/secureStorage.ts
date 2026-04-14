// ============================================================
// セキュアストレージ
// iOS: Keychain / Android: Keystore / Web: localStorage (fallback)
// 認証トークン・APIキーなど機密情報はここに保存
// ============================================================

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const webStore =
  typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return webStore?.getItem(key) ?? null;
    }
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      webStore?.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      webStore?.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};
