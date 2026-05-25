import { useMemo } from 'react';
import { ScrollView, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors, ThemeColors } from '../../hooks/useThemeColors';
import { WebBackButton } from '../../components/WebBackButton';

export default function TermsScreen() {
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);

  return (
    <SafeAreaView style={s.safe}>
      <WebBackButton />
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.h1}>利用規約</Text>
        <Text style={s.meta}>最終更新日: 2026年5月3日</Text>

        <Text style={s.h2}>第1条（適用）</Text>
        <Text style={s.p}>
          本規約は、合同会社カケル（以下「当方」）が提供する「宅建士 完全対策」（以下「本アプリ」）の
          利用に関して、ユーザーと当方との間の一切の関係に適用されます。
          本アプリをダウンロードまたは利用した時点で、ユーザーは本規約に同意したものとみなします。
        </Text>

        <Text style={s.h2}>第2条（利用登録・年齢制限）</Text>
        <Text style={s.p}>
          本アプリは13歳以上を対象としています。13歳以上18歳未満の未成年者は保護者の同意を得たうえで
          ご利用ください。当方は、虚偽の申告または過去の規約違反等があった場合、登録を拒否または
          取消すことができます。
        </Text>

        <Text style={s.h2}>第3条（サブスクリプション・自動更新）</Text>
        <Text style={s.p}>
          1. 本アプリは、無料プランおよび有料プラン PREMIUM（月額980円・税込）を提供します。{'\n'}
          2. 有料プランには初回7日間の無料トライアル期間があります。トライアル期間中にキャンセルした場合、料金は発生しません。{'\n'}
          3. 自動更新: トライアル終了後（登録から8日目）に初回課金が行われ、以後1ヶ月ごとに同一料金（980円・税込）で自動更新されます。{'\n'}
          4. 解約は次回更新日の24時間前までに行ってください。期限を過ぎた場合は次回更新分が課金されます。{'\n'}
          5. 決済は PayPal Pte. Ltd. のセキュアな決済基盤を通じて処理されます。クレジットカード情報は当方のサーバーには保存されません。{'\n'}
          6. App Store・Google Play 経由でご購入された場合、各ストアの決済規約および解約方法が適用されます。{'\n'}
          7. 解約は、アプリ内「記録」タブのサブスクリプション管理画面、PayPal アカウント、または各ストアの設定画面から行ってください。解約後も当月の残り期間は引き続きご利用いただけます。{'\n'}
          8. デジタルコンテンツの性質上、原則として返金はお受けしておりません。サービスに重大な不具合がある場合はお問い合わせください。
        </Text>

        <Text style={s.h2}>第4条（禁止事項）</Text>
        <Text style={s.p}>
          ユーザーは以下の行為を行ってはなりません。{'\n'}
          ・法令または公序良俗に違反する行為{'\n'}
          ・犯罪行為に関連する行為{'\n'}
          ・本アプリの内容（問題・解説・コード等）を無断で複製・転載・販売する行為{'\n'}
          ・リバースエンジニアリング・改変・解析する行為{'\n'}
          ・当方のサーバーまたはネットワークに過度な負荷をかける行為{'\n'}
          ・他のユーザーに迷惑をかける行為
        </Text>

        <Text style={s.h2}>第5条（知的財産権）</Text>
        <Text style={s.p}>
          本アプリに含まれる問題文・解説・画像・アニメーション・ソースコード等の知的財産権は、
          当方または正当な権利者に帰属します。ユーザーは個人の学習目的でのみ利用できます。
        </Text>

        <Text style={s.h2}>第6条（合格保証の不存在）</Text>
        <Text style={s.p}>
          本アプリは学習支援ツールであり、試験の合格を保証するものではありません。
          学習成果は個人の努力および受験環境に依存します。
        </Text>

        <Text style={s.h2}>第7条（サービス内容の変更）</Text>
        <Text style={s.p}>
          当方は、ユーザーに通知することなく本アプリの内容を変更または提供を停止することができ、
          これによってユーザーに生じた損害について一切の責任を負いません。
        </Text>

        <Text style={s.h2}>第8条（免責事項）</Text>
        <Text style={s.p}>
          当方は、本アプリの内容について、最新の法令・制度に基づく正確性確保に努めますが、
          完全性・正確性・有用性を保証するものではありません。本アプリの利用によって生じた
          損害について、当方は一切の責任を負いません。
        </Text>

        <Text style={s.h2}>第9条（個人情報）</Text>
        <Text style={s.p}>
          ユーザーの個人情報の取り扱いについては、別途定めるプライバシーポリシーに従います。
        </Text>

        <Text style={s.h2}>第10条（準拠法・裁判管轄）</Text>
        <Text style={s.p}>
          本規約の解釈および適用は日本法に準拠します。本アプリに関して紛争が生じた場合、
          当方本店所在地（沖縄県那覇地方裁判所）を第一審の専属的合意管轄裁判所とします。
        </Text>

        <Text style={s.h2}>第11条（規約の変更）</Text>
        <Text style={s.p}>
          当方は、必要に応じて本規約を変更することがあります。変更後の規約はアプリ内に掲示した
          時点から効力を生じるものとします。
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
