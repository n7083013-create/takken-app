// ============================================================
// オフライン通知バナー
// ネットワーク接続が切れたときに画面上部からスライドイン
// 復旧したら自動で消える
// ============================================================
// 注意: @react-native-community/netinfo や expo-network は未インストール
// fetch ベースの定期チェックで接続状態を検知する

import { useEffect, useRef, useState, useMemo } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ------------------------------------------------------------
// useNetworkStatus フック
// 定期的に fetch して接続状態を判定する
// ------------------------------------------------------------

const CHECK_URL = 'https://clients3.google.com/generate_204';
const CHECK_INTERVAL_MS = 8_000; // 8秒ごと

function useNetworkStatus(): boolean {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    let mounted = true;

    const check = async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5_000);
        await fetch(CHECK_URL, {
          method: 'HEAD',
          cache: 'no-store',
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (mounted) setIsConnected(true);
      } catch {
        if (mounted) setIsConnected(false);
      }
    };

    // 初回チェック
    check();

    // 定期チェック
    const id = setInterval(check, CHECK_INTERVAL_MS);

    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  return isConnected;
}

// ------------------------------------------------------------
// OfflineBanner コンポーネント
// ------------------------------------------------------------

export function OfflineBanner() {
  const isConnected = useNetworkStatus();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isConnected) {
      // オフライン: バナーを表示
      setVisible(true);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else if (visible) {
      // 復旧: スライドアウトしてから非表示
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setVisible(false);
      });
    }
  }, [isConnected]);

  if (!visible && isConnected) return null;

  const s = styles;
  const topPadding = Platform.OS === 'ios' ? insets.top : insets.top || 4;

  return (
    <Animated.View
      style={[
        s.container,
        {
          paddingTop: topPadding + 6,
          transform: [{ translateY: slideAnim }],
        },
      ]}
      pointerEvents="none"
    >
      <Text style={s.text}>
        オフラインです - インターネット接続を確認してください
      </Text>
    </Animated.View>
  );
}

// ------------------------------------------------------------
// スタイル
// ------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FF5722',
    paddingBottom: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    elevation: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
});
