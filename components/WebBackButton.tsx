// ============================================================
// WebBackButton — Web 専用ホーム戻るボタン
// ============================================================
// expo-router の Stack ヘッダーは Native では戻るボタンを描画するが、
// Web ではブラウザ履歴に依存し、直 URL で開いた場合に戻れない問題がある。
// このコンポーネントは Web のときだけ画面上部に明示的なホーム導線を描画する。
//
// 使い方:
//   import { WebBackButton } from '../components/WebBackButton';
//   <SafeAreaView>
//     <Stack.Screen options={{ ... }} />
//     <WebBackButton />        // ← デフォルトで「← ホームに戻る」
//     <ScrollView>...</ScrollView>
//   </SafeAreaView>
//
// ラベル/遷移先のカスタマイズ:
//   <WebBackButton label="← 模試一覧へ" to="/exam" />
// ============================================================

import { Pressable, View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeColors } from '../hooks/useThemeColors';

interface Props {
  /** ボタンラベル。デフォルト「← ホームに戻る」 */
  label?: string;
  /** 遷移先パス。デフォルト '/(tabs)' (ホームタブ) */
  to?: string;
}

export function WebBackButton({ label = '← ホームに戻る', to = '/(tabs)' }: Props) {
  const router = useRouter();
  const colors = useThemeColors();

  // [Bugfix v2] Stack ヘッダを非表示にしたため、Web/Native とも本コンポーネントが
  // 唯一の戻る導線となる。両プラットフォームで表示する。

  return (
    <View style={styles.container}>
      <Pressable
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
        onPress={() => router.replace(to as any)}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Text style={[styles.text, { color: colors.primary }]}>{label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  button: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
  },
});
