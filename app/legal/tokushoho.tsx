import { useMemo } from 'react';
import { ScrollView, Text, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors, ThemeColors } from '../../hooks/useThemeColors';

const ROWS: [string, string][] = [
  ['販売事業者', '合同会社カケル'],
  ['代表者', '平良 直也'],
  ['所在地', '沖縄県沖縄市美里仲原町18-7-303'],
  ['電話番号', '080-2741-6662'],
  ['メールアドレス', 'taira@2023kakeru.com'],
  ['ウェブサイト', 'https://takken-app-olive.vercel.app'],
  [
    '販売商品',
    '宅建士 完全対策（デジタル学習サービス）\n宅地建物取引士資格試験の学習支援Webアプリケーション',
  ],
  [
    '販売価格',
    'PREMIUMプラン: 月額980円（税込）\n初回7日間は無料トライアル',
  ],
  [
    '販売価格以外の費用',
    'インターネット接続に必要な通信費はお客様のご負担となります',
  ],
  [
    '支払方法',
    'クレジットカード（Visa, Mastercard, JCB, American Express）\n決済はPAY株式会社（PAY.JP）を通じて安全に処理されます',
  ],
  [
    '支払時期',
    '無料トライアル終了後（登録から8日目）に初回課金。以後1ヶ月ごとに自動更新・課金',
  ],
  [
    '商品引渡時期',
    '決済完了後、ただちにすべての機能をご利用いただけます',
  ],
  [
    '申込方法',
    'ウェブサイト上のお申込みフォームより、会員登録の上お申込みください',
  ],
  [
    'キャンセル・解約',
    'いつでも解約可能です。次回更新日の24時間前までに、アプリ内の設定画面またはお問い合わせフォームからお手続きください。解約後も当月の残り期間は引き続きご利用いただけます。',
  ],
  [
    '返品・返金',
    'デジタルコンテンツの性質上、原則として返品・返金はお受けしておりません。ただし、サービスに重大な不具合がある場合は個別にご相談ください。',
  ],
  [
    '動作環境',
    'Web: Google Chrome / Safari / Firefox / Edge（各最新版）\niOS 15.0以降 / Android 10.0以降',
  ],
];

export default function TokushohoScreen() {
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.h1}>特定商取引法に基づく表記</Text>
        <Text style={s.meta}>最終更新日: 2026年4月15日</Text>
        <View style={s.table}>
          {ROWS.map(([k, v]) => (
            <View key={k} style={s.row}>
              <Text style={s.key}>{k}</Text>
              <Text style={s.val}>{v}</Text>
            </View>
          ))}
        </View>
        <Text style={s.note}>
          ※ 上記は特定商取引法第11条に基づく表記です。{'\n'}
          ※ ご不明な点がございましたら、メールにてお問い合わせください。
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
    key: { width: 130, fontSize: 13, fontWeight: '700', color: C.text },
    val: { flex: 1, fontSize: 13, color: C.textSecondary, lineHeight: 20 },
    note: { fontSize: 11, color: C.textTertiary, marginTop: 16, lineHeight: 18 },
  });
}
