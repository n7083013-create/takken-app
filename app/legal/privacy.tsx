import { useMemo } from 'react';
import { ScrollView, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors, ThemeColors } from '../../hooks/useThemeColors';

export default function PrivacyScreen() {
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.h1}>プライバシーポリシー</Text>
        <Text style={s.meta}>最終更新日: 2026年4月1日</Text>

        <Text style={s.h2}>1. はじめに</Text>
        <Text style={s.p}>
          本アプリ「宅建士 完全対策」（以下「本アプリ」）の運営者（以下「当方」）は、
          利用者のプライバシーを最大限尊重し、個人情報の保護に関する法律（個人情報保護法）
          その他関連法令を遵守してユーザー情報を取り扱います。
        </Text>

        <Text style={s.h2}>2. 取得する情報</Text>
        <Text style={s.p}>
          当方は、本アプリの提供にあたり以下の情報を取得することがあります。{'\n'}
          ・学習履歴（解答結果・正誤・学習時間・ブックマーク等）{'\n'}
          ・アプリ設定情報（通知設定・表示設定等）{'\n'}
          ・クラッシュログ・エラーログ（アプリ改善のため）{'\n'}
          ・サブスクリプション購読状況（課金プラットフォーム経由）{'\n'}
          ・メールアドレス（アカウント作成時のみ）
        </Text>

        <Text style={s.h2}>3. 利用目的</Text>
        <Text style={s.p}>
          取得した情報は以下の目的で利用します。{'\n'}
          ・学習進捗の保存および学習体験の提供{'\n'}
          ・苦手分野の分析および学習提案{'\n'}
          ・不具合の特定および品質改善{'\n'}
          ・サブスクリプション管理および本人確認{'\n'}
          ・利用規約違反への対応
        </Text>

        <Text style={s.h2}>4. 第三者提供</Text>
        <Text style={s.p}>
          当方は、以下の場合を除き取得した情報を第三者に提供しません。{'\n'}
          ・ご本人の同意がある場合{'\n'}
          ・法令に基づく場合{'\n'}
          ・人の生命・身体または財産の保護のために必要な場合
        </Text>

        <Text style={s.h2}>5. 外部サービスの利用</Text>
        <Text style={s.p}>
          本アプリは以下の外部サービスを利用しています。{'\n'}
          ・Apple App Store / Google Play（課金処理）{'\n'}
          ・Supabase（認証・学習履歴クラウド同期）{'\n'}
          ・RevenueCat（サブスクリプション管理）{'\n'}
          ・Sentry（エラーログ・クラッシュ解析）{'\n'}
          ・Anthropic Claude API（AI解説機能）{'\n'}
          各サービスのプライバシーポリシーが適用されます。
        </Text>

        <Text style={s.h2}>6. データの保存期間</Text>
        <Text style={s.p}>
          取得した情報は、利用目的達成に必要な期間または法令で定められた期間保存します。
          アカウント削除のご依頼があった場合、合理的期間内に削除します。
        </Text>

        <Text style={s.h2}>7. ユーザーの権利</Text>
        <Text style={s.p}>
          ユーザーは、当方が保有する自己の個人情報について開示・訂正・削除・利用停止を
          求めることができます。お問い合わせ先は本ポリシー末尾に記載しています。
        </Text>

        <Text style={s.h2}>8. セキュリティ</Text>
        <Text style={s.p}>
          当方は取得した情報の漏えい、滅失、毀損を防止するため、適切な安全管理措置を講じます。
          認証情報は端末のセキュアストレージに暗号化して保存されます。
        </Text>

        <Text style={s.h2}>9. 未成年者について</Text>
        <Text style={s.p}>
          未成年者が本アプリを利用する場合は、保護者の同意を得たうえでご利用ください。
        </Text>

        <Text style={s.h2}>10. ポリシーの変更</Text>
        <Text style={s.p}>
          本ポリシーの内容は、法令改正またはサービス改善に伴い変更することがあります。
          重要な変更がある場合はアプリ内でお知らせします。
        </Text>

        <Text style={s.h2}>11. お問い合わせ</Text>
        <Text style={s.p}>
          本ポリシーに関するお問い合わせは、アプリ内の「お問い合わせ」または
          下記連絡先までお願いいたします。{'\n'}
          Email: taira@2023kakeru.com
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
    h2: { fontSize: 15, fontWeight: '700', color: C.text, marginTop: 20, marginBottom: 6 },
    p: { fontSize: 13, lineHeight: 22, color: C.textSecondary },
    meta: { fontSize: 11, color: C.textTertiary, marginBottom: 10 },
  });
}
