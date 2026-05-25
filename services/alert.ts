import { Platform, Alert } from 'react-native';

interface ConfirmOptions {
  okText?: string;
  cancelText?: string;
  destructive?: boolean;
}

/**
 * クロスプラットフォーム対応の確認ダイアログ（Promise版）
 * Web: window.confirm を使用
 * Native: Alert.alert を使用
 *
 * オーバーロード1: Promise 形式（推奨）
 *   const ok = await confirmAlert(title, message, { okText: '...' });
 * オーバーロード2: コールバック形式（後方互換）
 *   confirmAlert(title, message, () => onConfirm());
 */
export function confirmAlert(
  title: string,
  message: string,
  onConfirmOrOptions?: (() => void) | ConfirmOptions,
): Promise<boolean> | void {
  // コールバック形式（後方互換）
  if (typeof onConfirmOrOptions === 'function') {
    const onConfirm = onConfirmOrOptions;
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}`)) {
        onConfirm();
      }
    } else {
      Alert.alert(title, message, [
        { text: 'キャンセル', style: 'cancel' },
        { text: 'OK', style: 'destructive', onPress: onConfirm },
      ]);
    }
    return;
  }

  // Promise 形式
  const options = onConfirmOrOptions ?? {};
  const okText = options.okText ?? 'OK';
  const cancelText = options.cancelText ?? 'キャンセル';

  return new Promise<boolean>((resolve) => {
    if (Platform.OS === 'web') {
      resolve(window.confirm(`${title}\n\n${message}`));
    } else {
      Alert.alert(title, message, [
        { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
        {
          text: okText,
          style: options.destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ]);
    }
  });
}

export function infoAlert(title: string, message: string): Promise<void> {
  return new Promise<void>((resolve) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
      resolve();
    } else {
      Alert.alert(title, message, [{ text: 'OK', onPress: () => resolve() }]);
    }
  });
}
