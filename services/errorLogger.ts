// ============================================================
// エラーロガー
// Sentry + ローカル AsyncStorage の二層構成
// 使い方: logError(err, { context: 'exam.session' })
//
// 重要:
//  - 既存の logError 呼び出しシグネチャは絶対変えない（広範囲で使用中）
//  - PII (email/token) は services/sentry.ts の sanitize 層で除去される
//  - ローカルログ (AsyncStorage) は後方互換のため維持（debug 画面用）
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureSentryException } from './sentry';

const STORAGE_KEY = '@takken_error_log';
const MAX_LOGS = 100;

export interface ErrorLog {
  id: string;
  message: string;
  stack?: string;
  context?: string;
  extra?: Record<string, unknown>;
  createdAt: string;
}

export async function logError(
  error: unknown,
  meta?: { context?: string; extra?: Record<string, unknown> },
): Promise<void> {
  try {
    const log: ErrorLog = {
      id: `err_${Date.now()}`,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      context: meta?.context,
      extra: meta?.extra,
      createdAt: new Date().toISOString(),
    };

    if (__DEV__) {
      console.error('[ErrorLogger]', log.context ?? '-', log.message);
    }

    // Sentry へ送信（production のみ。dev は services/sentry.ts 内で握り潰し）
    // sanitize は services/sentry.ts の beforeSend で行う
    captureSentryException(error, {
      context: meta?.context,
      extra: meta?.extra,
    });

    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const logs: ErrorLog[] = raw ? JSON.parse(raw) : [];
    logs.push(log);
    const trimmed = logs.slice(-MAX_LOGS);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));

  } catch {
    // ロガー自体のエラーは握り潰す
  }
}

export async function getErrorLogs(): Promise<ErrorLog[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function clearErrorLogs(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

/**
 * グローバルエラーハンドラ登録
 * アプリ起動時に1度呼ぶ
 */
export function installGlobalErrorHandler(): void {
  const globalAny = global as unknown as {
    ErrorUtils?: {
      getGlobalHandler: () => (err: Error, isFatal?: boolean) => void;
      setGlobalHandler: (handler: (err: Error, isFatal?: boolean) => void) => void;
    };
  };
  const eu = globalAny.ErrorUtils;
  if (!eu) return;
  const prev = eu.getGlobalHandler();
  eu.setGlobalHandler((err, isFatal) => {
    logError(err, { context: 'global', extra: { isFatal } });
    prev(err, isFatal);
  });
}
