import { GlossaryTerm } from '../../../types';

export const takkenGlossary: GlossaryTerm[] = [
  // =============================================================
  // 権利関係 (kenri) - 民法の基本概念
  // =============================================================

  // ── 意思表示・契約の基本 ──
  {
    slug: 'ishi-hyouji',
    term: '意思表示',
    reading: 'いしひょうじ',
    category: 'kenri',
    definition:
      '「この土地を買います」「この家を売ります」のように、法律上の効果を生じさせるための意思を外部に表すこと。契約は、売主と買主の意思表示が合致することで成立します。',
    relatedTerms: ['shinri-ryuuho', 'kyogi-hyouji', 'sakugo'],
  },
  {
    slug: 'zenni',
    term: '善意',
    reading: 'ぜんい',
    category: 'kenri',
    definition:
      '法律用語で「ある事情を知らない」という意味。日常の「善い心」とは無関係です。例えば「善意の買主」とは、土地に問題があることを知らずに買った人のことです。',
    relatedTerms: ['akui', 'zenni-no-daisansha', 'mukashitsu'],
  },
  {
    slug: 'akui',
    term: '悪意',
    reading: 'あくい',
    category: 'kenri',
    definition:
      '法律用語で「ある事情を知っている」という意味。日常の「悪い心」とは無関係です。例えば「悪意の買主」とは、土地に問題があることを知った上で買った人のことです。',
    relatedTerms: ['zenni', 'zenni-no-daisansha', 'mukashitsu'],
  },
  {
    slug: 'mukashitsu',
    term: '無過失',
    reading: 'むかしつ',
    category: 'kenri',
    definition:
      '注意を払っても知ることができなかった、という意味。「善意無過失」なら「知らなかったし、注意しても知りようがなかった」ということ。法律では最も強く保護されます。',
    relatedTerms: ['zenni', 'akui', 'zenni-no-daisansha'],
  },
  {
    slug: 'zenni-no-daisansha',
    term: '善意の第三者',
    reading: 'ぜんいのだいさんしゃ',
    category: 'kenri',
    definition:
      '事情を知らないまま取引に関わった人。例えば、AとBの契約に問題があったことを知らずにBから土地を買ったCのこと。法律は善意の第三者を手厚く保護します。',
    relatedTerms: ['zenni', 'akui', 'taikou'],
  },
  {
    slug: 'taikou',
    term: '対抗',
    reading: 'たいこう',
    category: 'kenri',
    definition:
      '自分の権利を他人に対して「私の権利です」と法的に主張すること。不動産では登記がないと対抗できません。「対抗できない」＝相手に権利を主張できない、という意味。',
    relatedTerms: ['taikou-youken', 'touki', 'bukken-hendou'],
  },
  {
    slug: 'shinri-ryuuho',
    term: '心裡留保',
    reading: 'しんりりゅうほ',
    category: 'kenri',
    definition:
      'ウソだと分かっていながら意思表示すること。冗談で「この土地あげるよ」と言った場合など。原則として有効ですが、相手がウソだと知っていた場合は無効になります。',
    relatedTerms: ['ishi-hyouji', 'kyogi-hyouji', 'sakugo'],
  },
  {
    slug: 'kyogi-hyouji',
    term: '虚偽表示',
    reading: 'きょぎひょうじ',
    category: 'kenri',
    definition:
      '相手と示し合わせてウソの契約をすること。借金から逃れるため友人と「この不動産を売った」と見せかけるケースが典型例。この契約は無効ですが、事情を知らない第三者は保護されます。',
    relatedTerms: ['ishi-hyouji', 'shinri-ryuuho', 'zenni-no-daisansha'],
  },
  {
    slug: 'sakugo',
    term: '錯誤',
    reading: 'さくご',
    category: 'kenri',
    definition:
      '勘違いして契約してしまうこと。100万円のつもりが1000万円と書いてしまった場合や、偽物を本物と思って買った場合など。取り消すことができますが、重大な不注意があった場合は原則取り消せません。',
    relatedTerms: ['ishi-hyouji', 'sagi-kyouhaku', 'torikeshi'],
  },
  {
    slug: 'sagi-kyouhaku',
    term: '詐欺・強迫',
    reading: 'さぎ・きょうはく',
    category: 'kenri',
    definition:
      '詐欺＝だまして契約させること。強迫＝脅して契約させること。どちらも取り消せます。大きな違いは、詐欺の取消しは善意の第三者に主張できませんが、強迫の取消しは誰に対しても主張できる点です。',
    relatedTerms: ['ishi-hyouji', 'sakugo', 'torikeshi'],
  },
  {
    slug: 'torikeshi',
    term: '取消し',
    reading: 'とりけし',
    category: 'kenri',
    definition:
      'いったん成立した契約を、後から「なかったこと」にすること。詐欺・強迫・錯誤・未成年者の契約などで認められます。取り消すと契約は最初からなかったものとして扱われます。',
    relatedTerms: ['sakugo', 'sagi-kyouhaku', 'seigen-koui-nouryokusha'],
  },

  // ── 権利能力・行為能力 ──
  {
    slug: 'seigen-koui-nouryokusha',
    term: '制限行為能力者',
    reading: 'せいげんこういのうりょくしゃ',
    category: 'kenri',
    definition:
      '判断能力が不十分なため、一人では有効な契約ができない人の総称。未成年者・成年被後見人・被保佐人・被補助人の4種類があります。これらの人がした契約は取り消せる場合があります。',
    relatedTerms: ['seinen-hikoukennnin', 'hiho-sanin', 'torikeshi'],
  },
  {
    slug: 'seinen-hikoukennnin',
    term: '成年被後見人',
    reading: 'せいねんひこうけんにん',
    category: 'kenri',
    definition:
      '精神上の障害で判断能力がほとんどない人として、家庭裁判所から後見開始の審判を受けた人。成年後見人が代わりに契約などを行います。本人がした契約は日用品の購入を除き取り消せます。',
    relatedTerms: ['seinen-kouken-nin', 'seigen-koui-nouryokusha', 'hiho-sanin'],
  },
  {
    slug: 'seinen-kouken-nin',
    term: '成年後見人',
    reading: 'せいねんこうけんにん',
    category: 'kenri',
    definition:
      '判断能力がほとんどない人（成年被後見人）に代わって契約などの法律行為を行う人。家庭裁判所が選任します。成年被後見人の財産を管理し、本人に不利な契約を取り消すことができます。',
    relatedTerms: ['seinen-hikoukennnin', 'seigen-koui-nouryokusha', 'houtei-dairinin'],
  },
  {
    slug: 'hiho-sanin',
    term: '被保佐人',
    reading: 'ひほさにん',
    category: 'kenri',
    definition:
      '判断能力が著しく不十分な人として、家庭裁判所から保佐開始の審判を受けた人。不動産の売買や借金など重要な行為をするには保佐人の同意が必要です。同意なくした行為は取り消せます。',
    relatedTerms: ['seinen-hikoukennnin', 'seigen-koui-nouryokusha'],
  },
  {
    slug: 'houtei-dairinin',
    term: '法定代理人',
    reading: 'ほうていだいりにん',
    category: 'kenri',
    definition:
      '法律の規定によって代理権を持つ人。未成年者に対する親権者や、成年被後見人に対する成年後見人がこれにあたります。本人に代わって契約を結んだり、本人の契約を取り消したりできます。',
    relatedTerms: ['seinen-kouken-nin', 'dairi', 'seigen-koui-nouryokusha'],
  },

  // ── 代理 ──
  {
    slug: 'dairi',
    term: '代理',
    reading: 'だいり',
    category: 'kenri',
    definition:
      '他の人に代わって契約などの法律行為を行うこと。代理人が行った行為の効果は本人に帰属します。自分で選んだ「任意代理」と、法律で決まる「法定代理」の2種類があります。',
    relatedTerms: ['dairi-ken', 'houtei-dairinin', 'muken-dairi'],
  },
  {
    slug: 'dairi-ken',
    term: '代理権',
    reading: 'だいりけん',
    category: 'kenri',
    definition:
      '他人に代わって法律行為を行える権限のこと。代理権がないのに代理行為をすると「無権代理」となり、原則として本人に効果が生じません。',
    relatedTerms: ['dairi', 'muken-dairi', 'hyouken-dairi'],
  },
  {
    slug: 'muken-dairi',
    term: '無権代理',
    reading: 'むけんだいり',
    category: 'kenri',
    definition:
      '代理権がないのに「本人の代理人です」と言って契約すること。原則として本人に効果は生じません。ただし本人が後から認める（追認する）と有効になります。',
    relatedTerms: ['dairi-ken', 'hyouken-dairi', 'dairi'],
  },
  {
    slug: 'hyouken-dairi',
    term: '表見代理',
    reading: 'ひょうけんだいり',
    category: 'kenri',
    definition:
      '実際には代理権がないのに、外見上は代理権があるように見える場合に、善意無過失の相手方を保護する制度。相手が「本当の代理人だ」と信じたことに落ち度がなければ、契約は有効になります。',
    relatedTerms: ['muken-dairi', 'dairi-ken', 'zenni'],
  },

  // ── 物権・担保 ──
  {
    slug: 'bukken-hendou',
    term: '物権変動',
    reading: 'ぶっけんへんどう',
    category: 'kenri',
    definition:
      '所有権などの物に対する権利が発生・移転・消滅すること。売買で所有権が移るのが典型例。日本では契約だけで権利は移りますが、第三者に主張するには登記が必要です。',
    relatedTerms: ['taikou-youken', 'touki', 'taikou'],
  },
  {
    slug: 'taikou-youken',
    term: '対抗要件',
    reading: 'たいこうようけん',
    category: 'kenri',
    definition:
      '自分の権利を第三者に主張するために必要な条件。不動産は「登記」、動産は「引渡し」が対抗要件です。同じ土地を2人に売った場合、先に登記した方が勝ちます。',
    relatedTerms: ['touki', 'bukken-hendou', 'taikou'],
  },
  {
    slug: 'touki',
    term: '登記',
    reading: 'とうき',
    category: 'kenri',
    definition:
      '不動産の情報（場所・面積・所有者・抵当権など）を法務局の公式記録に載せること。不動産の権利を他人に主張するために必要な手続きです。誰でも登記簿を見ることができます。',
    relatedTerms: ['taikou-youken', 'bukken-hendou', 'teitoken'],
  },
  {
    slug: 'teitoken',
    term: '抵当権',
    reading: 'ていとうけん',
    category: 'kenri',
    definition:
      'お金を貸した人が、借りた人の不動産を担保にとる権利。住宅ローンで銀行が家に設定するのが典型例。返済できないと不動産を競売にかけられますが、返済中も住み続けられます。',
    relatedTerms: ['touki', 'ne-teitoken', 'bukken-hendou'],
  },
  {
    slug: 'ne-teitoken',
    term: '根抵当権',
    reading: 'ねていとうけん',
    category: 'kenri',
    definition:
      '一定の範囲の取引から生じる不特定の債権を、極度額（上限額）の範囲内で担保する抵当権。事業者が銀行と継続的に取引する場合に使われ、いちいち設定し直す手間が省けます。',
    relatedTerms: ['teitoken', 'touki'],
  },
  {
    slug: 'senyuu',
    term: '占有',
    reading: 'せんゆう',
    category: 'kenri',
    definition:
      '物を実際に持っている・使っている状態のこと。「占有者」はその物を実際に支配している人。所有権がなくても占有することは可能です（借りている場合など）。',
    relatedTerms: ['shutoku-jikou', 'chieki-ken'],
  },
  {
    slug: 'shutoku-jikou',
    term: '取得時効',
    reading: 'しゅとくじこう',
    category: 'kenri',
    definition:
      '他人の物を長期間占有し続けると、自分の物になる制度。自分の物だと信じて占有していた場合は10年、知っていた場合は20年で所有権を取得できます。',
    relatedTerms: ['senyuu', 'shoumetsu-jikou'],
  },
  {
    slug: 'shoumetsu-jikou',
    term: '消滅時効',
    reading: 'しょうめつじこう',
    category: 'kenri',
    definition:
      '一定期間、権利を行使しないと権利が消滅する制度。債権は「権利を行使できると知った時から5年」または「行使できる時から10年」で消滅します。',
    relatedTerms: ['shutoku-jikou', 'saikoku'],
  },
  {
    slug: 'kyouyuu',
    term: '共有',
    reading: 'きょうゆう',
    category: 'kenri',
    definition:
      '1つの物を複数人で所有すること。例えば兄弟で土地を半分ずつ持つ場合。共有物の変更は全員の同意、管理は過半数の同意が必要。自分の持分だけなら自由に売却できます。',
    relatedTerms: ['kubun-shoyuu'],
  },
  {
    slug: 'chieki-ken',
    term: '地役権',
    reading: 'ちえきけん',
    category: 'kenri',
    definition:
      '他人の土地を自分の土地の利便のために利用できる権利。隣の土地を通路として通行する「通行地役権」が典型例です。',
    relatedTerms: ['chijou-ken', 'teitoken'],
  },
  {
    slug: 'chijou-ken',
    term: '地上権',
    reading: 'ちじょうけん',
    category: 'kenri',
    definition:
      '他人の土地の上に建物を建てたり、木を植えたりして使用できる権利。借地権の一種で、土地の所有者の承諾なしに権利を譲渡できる強い権利です。',
    relatedTerms: ['chieki-ken', 'shakuchi-ken'],
  },

  // ── 債権・債務 ──
  {
    slug: 'saimu-furikou',
    term: '債務不履行',
    reading: 'さいむふりこう',
    category: 'kenri',
    definition:
      '契約で約束したことを果たさないこと。「お金を払わない」「商品を届けない」「約束の期日に間に合わない」などが該当します。相手は損害賠償請求や契約解除ができます。',
    relatedTerms: ['songai-baishou', 'saikoku', 'keiyaku-futekigou'],
  },
  {
    slug: 'saikoku',
    term: '催告',
    reading: 'さいこく',
    category: 'kenri',
    definition:
      '相手に対して「約束を果たしてください」と正式に求めること。契約を解除する前に催告が必要な場合があります。「〇日以内に払ってください」のような通知です。',
    relatedTerms: ['saimu-furikou', 'torikeshi'],
  },
  {
    slug: 'keiyaku-futekigou',
    term: '契約不適合',
    reading: 'けいやくふてきごう',
    category: 'kenri',
    definition:
      '引き渡された物が契約の内容に合っていないこと。買った家に雨漏りがあった場合など。買主は修理の請求・代金減額・損害賠償・契約解除ができます。旧法の「瑕疵担保責任」に代わる概念です。',
    relatedTerms: ['saimu-furikou', 'songai-baishou'],
  },
  {
    slug: 'songai-baishou',
    term: '損害賠償',
    reading: 'そんがいばいしょう',
    category: 'kenri',
    definition:
      '他人に与えた損害を金銭で償うこと。契約違反による損害賠償と、不法行為（交通事故など）による損害賠償があります。',
    relatedTerms: ['saimu-furikou', 'fuhou-koui'],
  },
  {
    slug: 'saiken-jyouto',
    term: '債権譲渡',
    reading: 'さいけんじょうと',
    category: 'kenri',
    definition:
      '「お金を返してもらう権利」を別の人に売ったり譲ったりすること。AがBに100万円貸している場合、Aがその「返してもらう権利」をCに譲渡できます。',
    relatedTerms: ['sousai'],
  },
  {
    slug: 'sousai',
    term: '相殺',
    reading: 'そうさい',
    category: 'kenri',
    definition:
      'お互いに同じ種類の債権を持っている場合に、差し引きして帳消しにすること。AがBに100万円、BがAに60万円の債務がある場合、相殺するとAの債権は40万円になります。',
    relatedTerms: ['saiken-jyouto'],
  },
  {
    slug: 'rentai-saimu',
    term: '連帯債務',
    reading: 'れんたいさいむ',
    category: 'kenri',
    definition:
      '複数の人が同じ債務を負い、債権者はどの人にも全額の支払いを請求できること。AとBが連帯して100万円借りた場合、貸主はAだけに100万円全額を請求することもできます。',
    relatedTerms: ['rentai-hoshou', 'kyuushou-ken'],
  },
  {
    slug: 'rentai-hoshou',
    term: '連帯保証',
    reading: 'れんたいほしょう',
    category: 'kenri',
    definition:
      '借りた人が返せない場合に、代わりに全額返済する義務を負うこと。普通の保証と違い「まず本人に請求して」と言えず、いきなり保証人に全額請求されることがあります。',
    relatedTerms: ['rentai-saimu', 'kyuushou-ken'],
  },
  {
    slug: 'kyuushou-ken',
    term: '求償権',
    reading: 'きゅうしょうけん',
    category: 'kenri',
    definition:
      '他人の借金を代わりに払った人が、本来の借主に「立て替えた分を返して」と請求できる権利。連帯保証人が代わりに返済した場合などに発生します。',
    relatedTerms: ['rentai-hoshou', 'rentai-saimu'],
  },
  {
    slug: 'fuhou-koui',
    term: '不法行為',
    reading: 'ふほうこうい',
    category: 'kenri',
    definition:
      '故意または過失により他人に損害を与えること。交通事故や建物の欠陥による被害などが典型例。加害者は被害者に損害賠償をしなければなりません。',
    relatedTerms: ['songai-baishou', 'shiyousha-sekinin'],
  },
  {
    slug: 'shiyousha-sekinin',
    term: '使用者責任',
    reading: 'しようしゃせきにん',
    category: 'kenri',
    definition:
      '従業員が仕事中に他人に損害を与えた場合、雇い主（会社）も責任を負うこと。配達員が事故を起こした場合、運送会社も賠償責任を負うのが典型例です。',
    relatedTerms: ['fuhou-koui', 'songai-baishou'],
  },

  // ── 相続 ──
  {
    slug: 'souzoku',
    term: '相続',
    reading: 'そうぞく',
    category: 'kenri',
    definition:
      '人が亡くなった時に、その人の財産（プラスもマイナスも）が家族などに引き継がれること。遺言がなければ法律で決まった割合（法定相続分）で分けます。',
    relatedTerms: ['houtei-souzoku-bun', 'iryuu-bun', 'isan-bunkatsu'],
  },
  {
    slug: 'houtei-souzoku-bun',
    term: '法定相続分',
    reading: 'ほうていそうぞくぶん',
    category: 'kenri',
    definition:
      '法律で決められた相続の割合。配偶者と子なら各1/2、配偶者と親なら配偶者2/3・親1/3、配偶者と兄弟なら配偶者3/4・兄弟1/4。遺言があればそちらが優先します。',
    relatedTerms: ['souzoku', 'iryuu-bun', 'isan-bunkatsu'],
  },
  {
    slug: 'iryuu-bun',
    term: '遺留分',
    reading: 'いりゅうぶん',
    category: 'kenri',
    definition:
      '遺言でも奪えない、相続人に最低限保障される取り分。遺言で「全財産を他人に」と書いても、配偶者や子は遺留分を請求できます。兄弟姉妹には遺留分はありません。',
    relatedTerms: ['souzoku', 'houtei-souzoku-bun'],
  },
  {
    slug: 'isan-bunkatsu',
    term: '遺産分割',
    reading: 'いさんぶんかつ',
    category: 'kenri',
    definition:
      '亡くなった人の財産を相続人たちで具体的にどう分けるか決めること。相続人全員の話し合い（協議）で決めるのが原則。まとまらなければ家庭裁判所に申し立てます。',
    relatedTerms: ['souzoku', 'houtei-souzoku-bun'],
  },
  {
    slug: 'daishuu-souzoku',
    term: '代襲相続',
    reading: 'だいしゅうそうぞく',
    category: 'kenri',
    definition:
      '本来の相続人が既に亡くなっている場合、その子（孫）が代わりに相続すること。例えば父が亡くなった時、既に息子が亡くなっていれば、息子の子（孫）が代わりに相続します。',
    relatedTerms: ['souzoku', 'houtei-souzoku-bun'],
  },

  // =============================================================
  // 宅建業法 (takkengyoho)
  // =============================================================
  {
    slug: 'menkyo',
    term: '免許',
    reading: 'めんきょ',
    category: 'takkengyoho',
    definition:
      '不動産業（宅建業）を営むために必要な許可。1つの都道府県だけなら知事免許、複数の都道府県にまたがるなら国土交通大臣免許が必要です。有効期間は5年で更新が必要。',
    relatedTerms: ['kekkaku-jiyuu', 'takuchi-tatemono-torihikishi'],
  },
  {
    slug: 'kekkaku-jiyuu',
    term: '欠格事由',
    reading: 'けっかくじゆう',
    category: 'takkengyoho',
    definition:
      '免許や登録を受けられない理由のこと。禁錮以上の刑を受けて5年経っていない人、不正手段で免許を取った人などが該当します。該当すると免許の申請ができません。',
    relatedTerms: ['menkyo', 'takuchi-tatemono-torihikishi'],
  },
  {
    slug: 'takuchi-tatemono-torihikishi',
    term: '宅地建物取引士',
    reading: 'たくちたてものとりひきし',
    category: 'takkengyoho',
    definition:
      '国家資格を持つ不動産取引の専門家。重要事項の説明、35条書面・37条書面への記名は宅建士しかできない独占業務です。事務所には5人に1人以上の専任の宅建士が必要です。',
    relatedTerms: ['juuyou-jikou-setsumei', '37jou-shomen', 'menkyo'],
  },
  {
    slug: 'juuyou-jikou-setsumei',
    term: '重要事項説明',
    reading: 'じゅうようじこうせつめい',
    category: 'takkengyoho',
    definition:
      '契約する前に、物件や取引条件の重要な情報を買主・借主に説明すること。宅建士が宅建士証を見せながら説明し、35条書面を交付します。契約後ではなく契約前に行うのがポイントです。',
    relatedTerms: ['takuchi-tatemono-torihikishi', '37jou-shomen', '35jou-shomen'],
  },
  {
    slug: '35jou-shomen',
    term: '35条書面',
    reading: 'さんじゅうごじょうしょめん',
    category: 'takkengyoho',
    definition:
      '重要事項説明書のこと。宅建業法35条に基づき、契約前に買主・借主に交付する書面。物件の権利関係、法令制限、代金以外のお金など、取引に関する重要事項が記載されています。',
    relatedTerms: ['juuyou-jikou-setsumei', '37jou-shomen', 'takuchi-tatemono-torihikishi'],
  },
  {
    slug: '37jou-shomen',
    term: '37条書面',
    reading: 'さんじゅうななじょうしょめん',
    category: 'takkengyoho',
    definition:
      '契約書に相当する書面。契約が成立した後に交付します。35条書面が「契約前の説明」なのに対し、37条書面は「契約後の確認」です。宅建士の記名が必要です。',
    relatedTerms: ['juuyou-jikou-setsumei', '35jou-shomen', 'takuchi-tatemono-torihikishi'],
  },
  {
    slug: 'eigyou-hoshyoukin',
    term: '営業保証金',
    reading: 'えいぎょうほしょうきん',
    category: 'takkengyoho',
    definition:
      '不動産会社が開業前に供託所に預けるお金。お客さんが損害を受けた時の補償に使います。本店1,000万円、支店1か所につき500万円。保証協会に入れば大幅に減額されます。',
    relatedTerms: ['hoshyou-kyoukai', 'kyoutaku'],
  },
  {
    slug: 'kyoutaku',
    term: '供託',
    reading: 'きょうたく',
    category: 'takkengyoho',
    definition:
      '法律に基づいて、金銭や有価証券を国の機関（供託所）に預けること。営業保証金の供託が典型例で、お客さんの損害を補償するための制度です。',
    relatedTerms: ['eigyou-hoshyoukin', 'hoshyou-kyoukai'],
  },
  {
    slug: 'hoshyou-kyoukai',
    term: '保証協会',
    reading: 'ほしょうきょうかい',
    category: 'takkengyoho',
    definition:
      '不動産会社が加入すると、営業保証金の供託が免除される団体。代わりに弁済業務保証金分担金（本店60万円、支店30万円）を納付。1,000万円が60万円で済むので、ほとんどの業者が加入しています。',
    relatedTerms: ['eigyou-hoshyoukin', 'kyoutaku'],
  },
  {
    slug: 'baikai-keiyaku',
    term: '媒介契約',
    reading: 'ばいかいけいやく',
    category: 'takkengyoho',
    definition:
      '不動産の売主（貸主）が不動産会社に「買主（借主）を探して」と依頼する契約。一般媒介（複数社に依頼可）、専任媒介（1社のみ）、専属専任媒介（1社のみ＋自分で探すのも不可）の3種類があります。',
    relatedTerms: ['juuyou-jikou-setsumei', 'shitei-ryuutsuu-kikou'],
  },
  {
    slug: 'shitei-ryuutsuu-kikou',
    term: '指定流通機構',
    reading: 'していりゅうつうきこう',
    category: 'takkengyoho',
    definition:
      '不動産情報を共有するネットワーク（通称レインズ）。専任媒介では7日以内、専属専任媒介では5日以内に物件を登録する義務があります。多くの不動産会社が物件情報を検索できます。',
    relatedTerms: ['baikai-keiyaku'],
  },
  {
    slug: 'cooling-off',
    term: 'クーリング・オフ',
    reading: 'くーりんぐおふ',
    category: 'takkengyoho',
    definition:
      '不動産会社から直接購入する場合で、事務所以外の場所（喫茶店や自宅など）で契約した場合に、8日以内なら無条件で解約できる制度。書面で通知が必要です。買主保護の重要な制度です。',
    relatedTerms: ['tebiki-seigen', 'juuyou-jikou-setsumei'],
  },
  {
    slug: 'tebiki-seigen',
    term: '手付の額の制限',
    reading: 'てつけのがくのせいげん',
    category: 'takkengyoho',
    definition:
      '不動産会社が売主の場合、手付金は売買代金の20%が上限。手付は「解約手付」として扱われ、相手が履行に着手するまでは、買主は手付放棄で、売主は手付の倍返しで解約できます。',
    relatedTerms: ['cooling-off'],
  },
  {
    slug: 'jiko-shoyuu-ni-zoku-shinai',
    term: '自己の所有に属しない',
    reading: 'じこのしょゆうにぞくしない',
    category: 'takkengyoho',
    definition:
      '「自分のものではない」という意味。宅建業者が自ら売主の場合、原則として他人物売買（自分の物でない不動産の売買）は禁止されています。8種制限の1つです。',
    relatedTerms: ['tebiki-seigen', 'cooling-off'],
  },
  {
    slug: 'kantoku-shobun',
    term: '監督処分',
    reading: 'かんとくしょぶん',
    category: 'takkengyoho',
    definition:
      '宅建業者や宅建士が法律違反をした場合に行政機関が行う処分。指示処分（注意）、業務停止処分（一定期間営業禁止）、免許取消処分（免許を剥奪）の3段階があります。',
    relatedTerms: ['menkyo', 'kekkaku-jiyuu'],
  },

  // =============================================================
  // 法令上の制限 (horei_seigen)
  // =============================================================
  {
    slug: 'toshi-keikaku-hou',
    term: '都市計画法',
    reading: 'としけいかくほう',
    category: 'horei_seigen',
    definition:
      '街づくりのルールを定めた法律。どこに住宅を建てていいか、どこを商業地にするかなどを計画的に決めます。用途地域・開発許可・市街化区域など、宅建の重要テーマの根拠法です。',
    relatedTerms: ['youto-chiiki', 'shigaika-kuiki', 'kaihatsu-kyoka'],
  },
  {
    slug: 'shigaika-kuiki',
    term: '市街化区域',
    reading: 'しがいかくいき',
    category: 'horei_seigen',
    definition:
      '既に市街地になっている区域、またはこれから10年以内に市街化を進める区域。建物をどんどん建てて街を発展させるエリアです。用途地域が必ず定められます。',
    relatedTerms: ['shigaika-chousei-kuiki', 'youto-chiiki', 'toshi-keikaku-hou'],
  },
  {
    slug: 'shigaika-chousei-kuiki',
    term: '市街化調整区域',
    reading: 'しがいかちょうせいくいき',
    category: 'horei_seigen',
    definition:
      '市街化を抑制する区域。原則として建物を建てられません。農地や自然を守るためのエリアです。開発許可のハードルがとても高いのが特徴です。',
    relatedTerms: ['shigaika-kuiki', 'kaihatsu-kyoka', 'toshi-keikaku-hou'],
  },
  {
    slug: 'youto-chiiki',
    term: '用途地域',
    reading: 'ようとちいき',
    category: 'horei_seigen',
    definition:
      '「ここは住宅地」「ここは商業地」のように、土地の使い方を13種類に分けたルール。住居系8種・商業系2種・工業系3種があり、それぞれ建てられる建物の種類が異なります。',
    relatedTerms: ['kenpei-ritsu', 'youseki-ritsu', 'toshi-keikaku-hou'],
  },
  {
    slug: 'kaihatsu-kyoka',
    term: '開発許可',
    reading: 'かいはつきょか',
    category: 'horei_seigen',
    definition:
      '一定以上の規模の土地を造成して建物を建てる場合に必要な許可。市街化区域では1,000㎡以上、市街化調整区域では原則すべてに必要です。都道府県知事等に申請します。',
    relatedTerms: ['youto-chiiki', 'shigaika-kuiki', 'shigaika-chousei-kuiki'],
  },
  {
    slug: 'kenpei-ritsu',
    term: '建ぺい率',
    reading: 'けんぺいりつ',
    category: 'horei_seigen',
    definition:
      '敷地面積のうち建物を建てていい割合。60%なら、100㎡の土地に最大60㎡の建物が建てられます。残りは庭や駐車場。日当たりや風通しを確保するための規制です。',
    relatedTerms: ['youseki-ritsu', 'youto-chiiki'],
  },
  {
    slug: 'youseki-ritsu',
    term: '容積率',
    reading: 'ようせきりつ',
    category: 'horei_seigen',
    definition:
      '敷地面積に対する延べ床面積（全階の合計面積）の割合。200%なら、100㎡の土地に延べ200㎡の建物（例：各階50㎡の4階建て）が建てられます。建物のボリュームを制限します。',
    relatedTerms: ['kenpei-ritsu', 'youto-chiiki', 'zenmen-douro'],
  },
  {
    slug: 'zenmen-douro',
    term: '前面道路',
    reading: 'ぜんめんどうろ',
    category: 'horei_seigen',
    definition:
      '敷地に面している道路のこと。前面道路の幅が12m未満の場合、容積率が制限されます。また、建築基準法では敷地は幅4m以上の道路に2m以上接していなければなりません（接道義務）。',
    relatedTerms: ['youseki-ritsu', 'setsudou-gimu'],
  },
  {
    slug: 'setsudou-gimu',
    term: '接道義務',
    reading: 'せつどうぎむ',
    category: 'horei_seigen',
    definition:
      '建物を建てる敷地は、幅4m以上の道路に2m以上接していなければならないというルール。消防車や救急車が入れるようにするためです。これを満たさないと建築確認が下りません。',
    relatedTerms: ['zenmen-douro', 'setback'],
  },
  {
    slug: 'setback',
    term: 'セットバック',
    reading: 'せっとばっく',
    category: 'horei_seigen',
    definition:
      '幅4m未満の古い道路に面した土地で、道路の中心から2m後退した線を道路境界線とみなすルール。後退した部分には建物を建てられず、建ぺい率・容積率の計算にも入れられません。',
    relatedTerms: ['setsudou-gimu', 'zenmen-douro'],
  },
  {
    slug: 'bouka-chiiki',
    term: '防火地域',
    reading: 'ぼうかちいき',
    category: 'horei_seigen',
    definition:
      '火災を防ぐため、建物に厳しい防火基準が課される地域。駅前や繁華街など建物が密集するエリアに指定されます。原則として耐火建築物または準耐火建築物しか建てられません。',
    relatedTerms: ['youto-chiiki', 'kenpei-ritsu'],
  },
  {
    slug: 'nouchi-hou',
    term: '農地法',
    reading: 'のうちほう',
    category: 'horei_seigen',
    definition:
      '農地を守るための法律。農地の売買（3条）、農地を宅地に変える（4条）、農地を買って宅地にする（5条）にはそれぞれ許可が必要。食料生産を守るための重要な規制です。',
    relatedTerms: ['kaihatsu-kyoka', 'kokudo-riyou-keikaku-hou'],
  },
  {
    slug: 'kokudo-riyou-keikaku-hou',
    term: '国土利用計画法',
    reading: 'こくどりようけいかくほう',
    category: 'horei_seigen',
    definition:
      '大規模な土地取引を監視する法律。一定面積以上の土地を買った場合、契約後2週間以内に届出が必要（事後届出）。市街化区域2,000㎡以上、それ以外の都市計画区域5,000㎡以上、都市計画区域外10,000㎡以上が対象。',
    relatedTerms: ['kaihatsu-kyoka', 'nouchi-hou'],
  },
  {
    slug: 'kenchiku-kijun-hou',
    term: '建築基準法',
    reading: 'けんちくきじゅんほう',
    category: 'horei_seigen',
    definition:
      '建物の安全・衛生・防火などの最低基準を定めた法律。建ぺい率・容積率・接道義務・高さ制限など、建物を建てる時の細かいルールが規定されています。',
    relatedTerms: ['kenpei-ritsu', 'youseki-ritsu', 'setsudou-gimu'],
  },

  // =============================================================
  // 税・その他 (tax_other)
  // =============================================================
  {
    slug: 'fudousan-shutokuzei',
    term: '不動産取得税',
    reading: 'ふどうさんしゅとくぜい',
    category: 'tax_other',
    definition:
      '不動産を買った時や建てた時に1回だけかかる都道府県の税金。相続で取得した場合は非課税。税率は原則4%ですが、住宅と土地は3%に軽減されています。',
    relatedTerms: ['kotei-shisanzei', 'touroku-menkyozei'],
  },
  {
    slug: 'kotei-shisanzei',
    term: '固定資産税',
    reading: 'こていしさんぜい',
    category: 'tax_other',
    definition:
      '毎年1月1日時点で不動産を持っている人にかかる市町村の税金。税率は1.4%（標準）。住宅用の土地は最大1/6に軽減されるので、家を壊すと税金が跳ね上がることがあります。',
    relatedTerms: ['fudousan-shutokuzei', 'toshi-keikaku-zei'],
  },
  {
    slug: 'touroku-menkyozei',
    term: '登録免許税',
    reading: 'とうろくめんきょぜい',
    category: 'tax_other',
    definition:
      '不動産の登記をする時にかかる国の税金。所有権の移転登記や抵当権の設定登記などで発生します。住宅用には軽減税率が適用される場合があります。',
    relatedTerms: ['touki', 'fudousan-shutokuzei'],
  },
  {
    slug: 'toshi-keikaku-zei',
    term: '都市計画税',
    reading: 'としけいかくぜい',
    category: 'tax_other',
    definition:
      '市街化区域内の不動産にかかる市町村の税金。固定資産税と一緒に課税されます。税率は最大0.3%。都市計画事業（道路・公園の整備など）の費用に使われます。',
    relatedTerms: ['kotei-shisanzei', 'shigaika-kuiki'],
  },
  {
    slug: 'jyouto-shotoku',
    term: '譲渡所得',
    reading: 'じょうとしょとく',
    category: 'tax_other',
    definition:
      '不動産を売って得た利益にかかる税金。売却価格から取得費と譲渡費用を引いた金額が課税対象。所有期間5年超なら税率約20%、5年以下なら約39%と大きく異なります。',
    relatedTerms: ['sanzenman-koujo'],
  },
  {
    slug: 'sanzenman-koujo',
    term: '3,000万円特別控除',
    reading: 'さんぜんまんえんとくべつこうじょ',
    category: 'tax_other',
    definition:
      '自宅（マイホーム）を売った時の利益から3,000万円を差し引ける特例。利益が3,000万円以下なら税金ゼロになります。所有期間の長短を問わず適用できる非常に有利な特例です。',
    relatedTerms: ['jyouto-shotoku'],
  },
  {
    slug: 'shakuchi-ken',
    term: '借地権',
    reading: 'しゃくちけん',
    category: 'tax_other',
    definition:
      '建物を建てるために他人の土地を借りる権利。存続期間は最低30年。契約更新を拒否するには「正当事由」が必要なので、借主は強く保護されています。',
    relatedTerms: ['chijou-ken', 'seitou-jiyuu', 'teiki-shakuchi-ken'],
  },
  {
    slug: 'teiki-shakuchi-ken',
    term: '定期借地権',
    reading: 'ていきしゃくちけん',
    category: 'tax_other',
    definition:
      '契約期間が終わったら必ず土地を返す借地権。更新がないので地主も安心して貸せます。一般定期借地権（50年以上）、建物譲渡特約付借地権（30年以上）などがあります。',
    relatedTerms: ['shakuchi-ken', 'seitou-jiyuu'],
  },
  {
    slug: 'seitou-jiyuu',
    term: '正当事由',
    reading: 'せいとうじゆう',
    category: 'tax_other',
    definition:
      '賃貸借契約の更新を拒否したり、解約を申し入れる時に必要な「もっともな理由」。単に「自分で使いたい」だけでは不十分で、立退き料の提供なども考慮されます。',
    relatedTerms: ['shakuchi-ken', 'teiki-shakuchi-ken'],
  },
  {
    slug: 'kubun-shoyuu',
    term: '区分所有',
    reading: 'くぶんしょゆう',
    category: 'tax_other',
    definition:
      'マンションのように1つの建物を複数の人がそれぞれの部屋（専有部分）を所有する形態。廊下やエレベーターなどの共用部分は全員で共有します。管理組合が建物全体を管理します。',
    relatedTerms: ['kyouyuu'],
  },
  {
    slug: 'fudousan-kantei-hyouka',
    term: '不動産鑑定評価',
    reading: 'ふどうさんかんていひょうか',
    category: 'tax_other',
    definition:
      '不動産鑑定士が不動産の適正価格を判定する専門的評価。取引事例比較法（似た物件と比較）、原価法（建て直す費用から計算）、収益還元法（将来の収益から計算）の3つの方法を使います。',
    relatedTerms: ['fudousan-shutokuzei', 'kotei-shisanzei'],
  },
];
