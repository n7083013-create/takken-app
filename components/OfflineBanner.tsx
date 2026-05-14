// ============================================================
// オフライン通知バナー
// ネットワーク接続が切れたときに画面上部からスライドイン
// 復旧したら自動で消える
// ============================================================
// 注意: @react-native-community/netinfo や expo-network は未インストール
// fetch ベースの定期チェックで接続状態を検知する
//
// [Bugfix] 旧実装は単発5秒タイムアウトで一瞬の遅延でも誤検知していた。
// 新実装は utils/connectivity.ts の以下の組み合わせで誤検知を大幅削減:
//   - 複数エンドポイント並列チェック (Google + Cloudflare)
//   - タイムアウト 8秒 (旧5秒)
//   - ヒステリシス: 2回連続失敗で初めて「オフライン」確定
//   - 復旧は 1回成功で即座 (バナーをすぐ消す)

import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  probeAny,
  applyHysteresis,
  INITIAL_HYSTERESIS_STATE,
  DEFAULT_PROBE_URLS,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_CHECK_INTERVAL_MS,
  type HysteresisState,
} from '../utils/connectivity';

// ------------------------------------------------------------
// useNetworkStatus フック
// 定期的に複数エンドポイントを並列チェック + ヒステリシスで誤検知を抑止
// ------------------------------------------------------------

function useNetworkStatus(): boolean {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Web版: navigator.onLine を使う（CORSの問題を回避）
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleOnline = () => { if (mounted) setIsConnected(true); };
      const handleOffline = () => { if (mounted) setIsConnected(false); };

      setIsConnected(typeof navigator !== 'undefined' ? navigator.onLine : true);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      return () => {
        mounted = false;
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    // ネイティブ版: 並列チェック + ヒステリシス
    let state: HysteresisState = INITIAL_HYSTERESIS_STATE;

    const check = async () => {
      const success = await probeAny(DEFAULT_PROBE_URLS, DEFAULT_TIMEOUT_MS);
      if (!mounted) return;
      state = applyHysteresis(state, success);
      setIsConnected(state.isOnline);
    };

    check();
    const id = setInterval(check, DEFAULT_CHECK_INTERVAL_MS);

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
