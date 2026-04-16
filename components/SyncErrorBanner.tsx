// ============================================================
// クラウド同期エラーバナー
// 同期失敗時に画面下部にスライドイン表示
// タップで非表示
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, Pressable } from 'react-native';
import { useProgressStore } from '../store/useProgressStore';

export function SyncErrorBanner() {
  const syncError = useProgressStore((s) => s.syncError);
  const clearSyncError = useProgressStore((s) => s.clearSyncError);
  const slideAnim = useRef(new Animated.Value(80)).current;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (syncError) {
      setVisible(true);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();

      // 10秒後に自動で消す
      const timer = setTimeout(() => {
        dismiss();
      }, 10_000);
      return () => clearTimeout(timer);
    } else if (visible) {
      Animated.timing(slideAnim, {
        toValue: 80,
        duration: 300,
        useNativeDriver: true,
      }).start(() => setVisible(false));
    }
  }, [syncError]);

  function dismiss() {
    Animated.timing(slideAnim, {
      toValue: 80,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setVisible(false);
      clearSyncError();
    });
  }

  if (!visible && !syncError) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ translateY: slideAnim }] },
      ]}
    >
      <Pressable onPress={dismiss} style={styles.inner} accessibilityRole="alert">
        <Text style={styles.icon}>{'!'}</Text>
        <Text style={styles.text}>{syncError}</Text>
        <Text style={styles.dismiss}>{'x'}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    zIndex: 9998,
    elevation: 9998,
  },
  inner: {
    backgroundColor: '#E65100',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  icon: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '900',
    marginRight: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#FFF',
    textAlign: 'center',
    lineHeight: 20,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  dismiss: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    fontWeight: '700',
    paddingLeft: 12,
  },
});
