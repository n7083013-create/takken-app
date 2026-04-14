import { useMemo } from 'react';
import { ScrollView, Text, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors, ThemeColors } from '../../hooks/useThemeColors';

const ROWS: [string, string][] = [
  ['販売事業者', 'カケル'],
  ['運営責任者', 'カケル'],
  ['所在地', '請求があった場合、遅滞なく開示します'],
  ['連絡先', 'taira@2023kakeru.com'],
  ['販売価格', 'アプリ内購入画面に表示（税込）'],
  ['支払方法', 'Apple App Store / Google Play の各決済方法'],
  ['支払時期', 'サブスクリプション購入確定時、以後自動更新の都度'],
  ['商品引渡時期', '決済完了後ただちに利用可能'],
  [
    'キャンセル・解約',
    'App Store / Google Play の設定画面より、次回更新日の24時間前までに解約してください。解約しない場合、同一期間で自動更新されます。',
  ],
  ['返品・返金', '各プラットフォームの返金ポリシーに従います'],
  [
    '動作環境',
    'iOS 15.0 以降 / Android 10.0 以降 / 最新版のモダンブラウザ',
  ],
];

export default function TokushohoScreen() {
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.h1}>特定商取引法に基づく表記</Text>
        <Text style={s.meta}>最終更新日: 2026年4月1日</Text>
        <View style={s.table}>
          {ROWS.map(([k, v]) => (
            <View key={k} style={s.row}>
              <Text style={s.key}>{k}</Text>
              <Text style={s.val}>{v}</Text>
            </View>
          ))}
        </View>
        <Text style={s.note}>
          ※ 上記は特定商取引法第11条に基づく表記です。請求があった場合、運営者の氏名・住所・
          電話番号を遅滞なくご提供いたします。
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.background },
    scroll: { padding: 20, paddingBottom: 60 },
    h1: { fontSize: 22, fontWeight: '800', color: C.text, marginBottom: 4 },
    meta: { fontSize: 11, color: C.textTertiary, marginBottom: 20 },
    table: { backgroundColor: C.card, borderRadius: 12, overflow: 'hidden' },
    row: {
      flexDirection: 'row',
      padding: 14,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    key: { width: 110, fontSize: 13, fontWeight: '700', color: C.text },
    val: { flex: 1, fontSize: 13, color: C.textSecondary, lineHeight: 20 },
    note: { fontSize: 11, color: C.textTertiary, marginTop: 16, lineHeight: 18 },
  });
}
