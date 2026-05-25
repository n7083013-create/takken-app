import { useMemo } from 'react';
import { ScrollView, Text, StyleSheet, Linking, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors, ThemeColors } from '../../hooks/useThemeColors';
import { WebBackButton } from '../../components/WebBackButton';

export default function DeleteAccountScreen() {
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);

  return (
    <SafeAreaView style={s.safe}>
      <WebBackButton />
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.h1}>アカウント削除のご案内</Text>
        <Text style={s.meta}>宅建士 完全対策（合同会社カケル）</Text>

        <Text style={s.intro}>
          ご自身でアカウントと関連する全ての学習データをいつでも削除できます。
          以下のいずれかの方法をお選びください。
        </Text>

        {/* メイン1: モバイルアプリで削除 */}
        <View style={s.card}>
          <Text style={s.cardTitle}>方法 1 ｜ モバイルアプリから削除</Text>
          <Text style={s.cardSub}>iOS / Android アプリ内で完結（即時・推奨）</Text>
          <Text style={s.steps}>
            1. アプリを開く{'\n'}
            2. 下部メニュー「記録」タブを開く{'\n'}
            3. 画面下部「アカウント設定」セクション{'\n'}
            4. 「アカウントを削除する」をタップ{'\n'}
            5. 確認ダイアログで「削除する」をタップ
          </Text>
          <Text style={s.cardNote}>
            数秒以内に削除が完了します。確認メールも自動送信されます。
          </Text>
        </View>

        {/* メイン2: Web版で削除 */}
        <View style={s.card}>
          <Text style={s.cardTitle}>方法 2 ｜ Web 版から削除</Text>
          <Text style={s.cardSub}>ブラウザでログイン後、自分で削除（即時）</Text>
          <Text style={s.steps}>
            1.{' '}
            <Pressable onPress={() => Linking.openURL('https://app.takkenkanzen.com/auth/login')}>
              <Text style={s.link}>https://app.takkenkanzen.com</Text>
            </Pressable>
            {' '}にアクセスしてログイン{'\n'}
            2. 「記録」タブを開く{'\n'}
            3. 「アカウントを削除する」をクリック{'\n'}
            4. 確認ダイアログで「削除する」をクリック
          </Text>
          <Text style={s.cardNote}>
            アプリをインストールしていない場合・端末を紛失した場合に便利です。
          </Text>
        </View>

        <Text style={s.h2}>削除されるデータ</Text>
        <Text style={s.p}>
          ・メールアドレス・ユーザー識別子{'\n'}
          ・学習進捗（解答履歴・正答率・連続学習日数）{'\n'}
          ・模擬試験の受験履歴{'\n'}
          ・実績バッジ・クエスト進行状況{'\n'}
          ・問題誤り報告履歴{'\n'}
          ・通知設定・アプリ内設定
        </Text>

        <Text style={s.h2}>保持されるデータ</Text>
        <Text style={s.p}>
          以下のデータは法令遵守のため一定期間保持される場合があります。お客様個人を特定可能な形では保管されません。
        </Text>
        <Text style={s.p}>
          ・課金記録：特定商取引法・税法に基づき<Text style={s.bold}>7年間</Text>{'\n'}
          ・サーバーアクセスログ：不正アクセス調査のため最大<Text style={s.bold}>90日間</Text>
        </Text>

        <Text style={s.h2}>削除完了までの期間</Text>
        <Text style={s.p}>
          上記いずれの方法でも、操作完了から<Text style={s.bold}>数秒以内</Text>に削除が完了します。
          バックアップからの完全消去は最大 30 日以内に完了します。
        </Text>

        <Text style={s.h2}>一部データのみの削除について</Text>
        <Text style={s.p}>
          現状、一部データのみの削除機能は提供しておりません。
          全データの削除をご希望の場合は、上記いずれかの方法でアカウント削除をリクエストしてください。
        </Text>

        {/* フォールバック窓口（最終手段・小さく） */}
        <View style={s.fallback}>
          <Text style={s.fallbackTitle}>アプリにも Web にもアクセスできない場合</Text>
          <Text style={s.fallbackText}>
            登録メールアドレスから本人確認のうえ、件名「アカウント削除依頼」で
            下記までご連絡ください（営業日 3 日以内に対応）。
          </Text>
          <Pressable onPress={() => Linking.openURL('mailto:taira@2023kakeru.com?subject=アカウント削除依頼')}>
            <Text style={s.fallbackEmail}>taira@2023kakeru.com</Text>
          </Pressable>
        </View>

        <Text style={s.h2}>運営者情報</Text>
        <Text style={s.p}>
          合同会社カケル（代表: 平良 直也）{'\n'}
          沖縄県沖縄市美里仲原町18-7 20世紀Mカマキチ303
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.background },
    scroll: { padding: 20, paddingBottom: 40 },
    h1: { fontSize: 24, fontWeight: '800', color: C.text, marginBottom: 6 },
    meta: { fontSize: 12, color: C.textSecondary, marginBottom: 18 },
    intro: { fontSize: 14, color: C.text, lineHeight: 22, marginBottom: 18 },
    h2: { fontSize: 16, fontWeight: '700', color: C.text, marginTop: 24, marginBottom: 8 },
    p: { fontSize: 14, color: C.text, lineHeight: 22, marginBottom: 8 },
    bold: { fontWeight: '700' },
    card: {
      backgroundColor: C.card,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: 12,
    },
    cardTitle: { fontSize: 16, fontWeight: '800', color: C.primary, marginBottom: 4 },
    cardSub: { fontSize: 12, color: C.textSecondary, marginBottom: 10 },
    steps: { fontSize: 14, color: C.text, lineHeight: 24 },
    cardNote: { fontSize: 12, color: C.textSecondary, marginTop: 10, lineHeight: 18 },
    link: { fontSize: 14, color: C.primary, fontWeight: '700' },
    fallback: {
      backgroundColor: C.background,
      borderRadius: 8,
      padding: 14,
      borderWidth: 1,
      borderColor: C.borderLight,
      marginTop: 16,
    },
    fallbackTitle: { fontSize: 13, fontWeight: '700', color: C.textSecondary, marginBottom: 6 },
    fallbackText: { fontSize: 12, color: C.textSecondary, lineHeight: 18, marginBottom: 6 },
    fallbackEmail: { fontSize: 12, color: C.primary, fontWeight: '600' },
  });
}
