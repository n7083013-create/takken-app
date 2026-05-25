import { useMemo } from 'react';
import { ScrollView, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors, ThemeColors } from '../../hooks/useThemeColors';
import { WebBackButton } from '../../components/WebBackButton';

export default function PrivacyScreen() {
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);

  return (
    <SafeAreaView style={s.safe}>
      <WebBackButton />
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.h1}>プライバシーポリシー</Text>
        <Text style={s.meta}>最終更新日: 2026年5月3日</Text>

        <Text style={s.h2}>1. はじめに</Text>
        <Text style={s.p}>
          本アプリ「宅建士 完全対策」（以下「本アプリ」）の運営者 合同会社カケル（以下「当方」）は、
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
          ・メールアドレス（アカウント作成時のみ）{'\n'}
          ・端末情報（OS種類・アプリバージョン）
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

        <Text style={s.h2}>5. 外部送信・委託先</Text>
        <Text style={s.p}>
          本アプリは以下の外部サービスにデータを送信します。各サービスのプライバシーポリシーが適用されます。{'\n'}
          ・PayPal Pte. Ltd.（決済処理・サブスクリプション管理）{'\n'}
          ・Supabase, Inc.（認証・学習履歴クラウド同期・米国）{'\n'}
          ・Anthropic PBC（AI解説機能・Claude API・米国）{'\n'}
          ・OpenAI, L.L.C.（音声入力の文字起こし・Whisper API・米国／Premium プラン利用時のみ）{'\n'}
          ・Resend, Inc.（メール配信・米国）{'\n'}
          ・Google LLC（アクセス解析・広告効果測定）{'\n'}
          外国にある第三者への個人データ提供を含むため、個人情報保護法第28条に基づきユーザーの同意を取得します。
        </Text>

        <Text style={s.h2}>6. データの保存期間</Text>
        <Text style={s.p}>
          取得した情報は、利用目的達成に必要な期間または法令で定められた期間保存します。
          アカウント削除のご依頼があった場合、合理的期間内（通常30日以内）に削除します。
          課金記録は税法・特定商取引法に基づき7年間保管します。
        </Text>

        <Text style={s.h2}>7. ユーザーの権利・データ削除</Text>
        <Text style={s.p}>
          ユーザーは、当方が保有する自己の個人情報について開示・訂正・削除・利用停止を
          求めることができます。アカウントとすべての学習データは、アプリ内・Web版いずれからも
          ご自身で削除できます。お問い合わせ先は本ポリシー末尾に記載しています。
        </Text>

        <Text style={s.h2}>8. セキュリティ</Text>
        <Text style={s.p}>
          当方は取得した情報の漏えい、滅失、毀損を防止するため、適切な安全管理措置を講じます。
          通信はTLSにより暗号化され、認証情報は端末のセキュアストレージに暗号化して保存されます。
        </Text>

        <Text style={s.h2}>9. お子様のプライバシー</Text>
        <Text style={s.p}>
          本アプリは13歳未満のお子様を対象としておりません。13歳未満のお子様の個人情報を
          意図的に収集することはありません。13歳以上18歳未満の未成年者がご利用になる場合は、
          保護者の同意を得たうえでご利用ください。13歳未満のお子様のデータが誤って収集された
          ことが判明した場合、速やかに削除します。
        </Text>

        <Text style={s.h2}>10. ポリシーの変更</Text>
        <Text style={s.p}>
          本ポリシーの内容は、法令改正またはサービス改善に伴い変更することがあります。
          重要な変更がある場合はアプリ内でお知らせします。
        </Text>

        <Text style={s.h2}>11. 個人情報保護管理者・お問い合わせ</Text>
        <Text style={s.p}>
          個人情報保護管理者: 平良 直也（合同会社カケル 代表）{'\n'}
          運営者: 合同会社カケル{'\n'}
          所在地: 沖縄県沖縄市美里仲原町18-7 20世紀Mカマキチ303{'\n'}
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
