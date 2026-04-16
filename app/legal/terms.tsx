import { useMemo } from 'react';
import { ScrollView, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors, ThemeColors } from '../../hooks/useThemeColors';

export default function TermsScreen() {
  const colors = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.h1}>利用規約</Text>
        <Text style={s.meta}>最終更新日: 2026年4月15日</Text>

        <Text style={s.h2}>第1条（適用）</Text>
        <Text style={s.p}>
          本規約は、ユーザーと当方との間の本アプリに関する一切の関係に適用されます。
          本アプリをダウンロードまたは利用した時点で、ユーザーは本規約に同意したものとみなします。
        </Text>

        <Text style={s.h2}>第2条（利用登録）</Text>
        <Text style={s.p}>
          ユーザーは、本規約に同意のうえ所定の方法により利用登録を行うものとします。
          当方は、虚偽の申告または過去の規約違反等があった場合、登録を拒否または取消すことができます。
        </Text>

        <Text style={s.h2}>第3条（サブスクリプション）</Text>
        <Text style={s.p}>
          1. 本アプリは、無料プランおよび有料プラン（PREMIUM・月額980円税込）を提供します。{'\n'}
          2. 有料プランには初回7日間の無料トライアル期間があります。トライアル終了後に自動的に課金が開始されます。{'\n'}
          3. 決済はPAY株式会社（PAY.JP）を通じて処理されます。クレジットカード情報は当方のサーバーには保存されません。{'\n'}
          4. 購読は自動更新され、次回更新日の24時間前までに解約しない場合、同一期間・同一料金で自動更新されます。{'\n'}
          5. 解約は、アプリ内の設定画面またはお問い合わせフォームから行ってください。解約後も当月の残り期間は引き続きご利用いただけます。{'\n'}
          6. デジタルコンテンツの性質上、原則として返金はお受けしておりません。サービスに重大な不具合がある場合はお問い合わせください。
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

        <Text style={s.h2}>第9条（準拠法・裁判管轄）</Text>
        <Text style={s.p}>
          本規約の解釈および適用は日本法に準拠します。本アプリに関して紛争が生じた場合、
          当方本店所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とします。
        </Text>

        <Text style={s.h2}>第10条（規約の変更）</Text>
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
