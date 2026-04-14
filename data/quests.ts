// ============================================================
// クエスト学習 - チャプター & ミッション定義
// ============================================================
// 設計思想: 「クエストモードを全クリアしたら基礎はバッチリ」
// 各カテゴリを 入門→基礎→応用→実戦 の4段階で構成
// 合格すれば次のミッションへ、つまずいたら復習して再挑戦
//
// 学習順序: 宅建業法(配点最大20問)→法令制限(8問)→権利関係(14問・最難関)→税その他(8問)
// 段階: 入門(difficulty 1, 合格60%) → 基礎(difficulty 1-2, 合格65%)
//       → 応用(difficulty 2, 合格70%) → 実戦(difficulty 2-3, 合格75%)

import { QuestChapter, QuestMission } from '../types';
import { ALL_QUESTIONS } from './index';

// ╔═══════════════════════════════════════════════════════════╗
// ║  第1部: 宅建業法（全20ミッション）                         ║
// ╚═══════════════════════════════════════════════════════════╝

// ── 第1章: 宅建業法 入門 ── まずは「宅建業」って何？から
const ch1Missions: QuestMission[] = [
  {
    id: 'quest-ch1-m1',
    title: '宅建業とは？免許の仕組み',
    description: '宅建業の定義と知事免許・大臣免許の違い',
    matchTags: ['免許', '知事免許', '大臣免許', '有効期間'],
    questionCount: 8,
    passingRate: 0.6,
    category: 'takkengyoho',
    difficulty: 1,
    icon: '📄',
  },
  {
    id: 'quest-ch1-m2',
    title: '欠格事由の基本',
    description: '免許をもらえない人の条件を押さえよう',
    matchTags: ['欠格事由', '免許換え'],
    questionCount: 8,
    passingRate: 0.6,
    category: 'takkengyoho',
    difficulty: 1,
    icon: '🚫',
  },
  {
    id: 'quest-ch1-m3',
    title: '宅建取引士って何する人？',
    description: '登録・取引士証・専任の取引士',
    matchTags: ['宅地建物取引士', '取引士証', '登録', '法定講習', '専任の宅地建物取引士'],
    questionCount: 8,
    passingRate: 0.6,
    category: 'takkengyoho',
    difficulty: 1,
    icon: '👤',
  },
  {
    id: 'quest-ch1-m4',
    title: '営業保証金のしくみ',
    description: '開業に必要なお金の供託ルール',
    matchTags: ['営業保証金', '供託'],
    questionCount: 8,
    passingRate: 0.6,
    category: 'takkengyoho',
    difficulty: 1,
    icon: '💰',
  },
];

// ── 第2章: 宅建業法 基礎 ── 実務で使う基本ルール
const ch2Missions: QuestMission[] = [
  {
    id: 'quest-ch2-m1',
    title: '保証協会と弁済業務保証金',
    description: '保証協会への加入・分担金のルール',
    matchTags: ['保証協会', '弁済業務保証金'],
    questionCount: 8,
    passingRate: 0.65,
    category: 'takkengyoho',
    difficulty: 1,
    icon: '🏛️',
  },
  {
    id: 'quest-ch2-m2',
    title: '事務所と届出のルール',
    description: '事務所の設置基準・届出・標識・帳簿',
    matchTags: ['事務所', '案内所', '届出', '標識', '従業者名簿', '帳簿'],
    questionCount: 8,
    passingRate: 0.65,
    category: 'takkengyoho',
    difficulty: 2,
    icon: '🏢',
  },
  {
    id: 'quest-ch2-m3',
    title: '媒介契約の3タイプ',
    description: '一般・専任・専属専任の違いを完全理解',
    matchTags: ['媒介契約', '専任媒介', '専属専任媒介', '一般媒介', '指定流通機構'],
    questionCount: 8,
    passingRate: 0.65,
    category: 'takkengyoho',
    difficulty: 2,
    icon: '📋',
  },
  {
    id: 'quest-ch2-m4',
    title: '広告と業務のルール',
    description: '誇大広告の禁止・守秘義務・不当勧誘',
    matchTags: ['広告', '誇大広告', '広告開始時期', '断定的判断', '守秘義務'],
    questionCount: 8,
    passingRate: 0.65,
    category: 'takkengyoho',
    difficulty: 2,
    icon: '📢',
  },
];

// ── 第3章: 宅建業法 応用 ── 重説・契約書・8種制限
const ch3Missions: QuestMission[] = [
  {
    id: 'quest-ch3-m1',
    title: '重要事項説明（35条書面）前編',
    description: '説明の方法・タイミング・記載事項の基本',
    matchTags: ['重要事項説明', '35条書面'],
    questionCount: 10,
    passingRate: 0.7,
    category: 'takkengyoho',
    difficulty: 2,
    icon: '📑',
  },
  {
    id: 'quest-ch3-m2',
    title: '重要事項説明（35条書面）後編',
    description: 'インスペクション・第三者管理方式の説明',
    matchTags: ['重要事項説明', '35条書面', 'インスペクション', '第三者管理'],
    questionCount: 10,
    passingRate: 0.7,
    category: 'takkengyoho',
    difficulty: 2,
    icon: '📖',
  },
  {
    id: 'quest-ch3-m3',
    title: '37条書面（契約書）',
    description: '契約成立後に交付する書面の記載事項',
    matchTags: ['37条書面', '契約書'],
    questionCount: 8,
    passingRate: 0.7,
    category: 'takkengyoho',
    difficulty: 2,
    icon: '📃',
  },
  {
    id: 'quest-ch3-m4',
    title: 'クーリングオフ制度',
    description: '買主を守る8日間の撤回権',
    matchTags: ['クーリングオフ', '自ら売主制限'],
    questionCount: 8,
    passingRate: 0.7,
    category: 'takkengyoho',
    difficulty: 2,
    icon: '❄️',
  },
  {
    id: 'quest-ch3-m5',
    title: '手付金と損害賠償',
    description: '手付の額の制限・保全措置・損害賠償額の予定',
    matchTags: ['手付', '解約手付', '手付金等の保全措置', '手付の額の制限', '損害賠償額の予定', '違約金', '契約不適合責任'],
    questionCount: 8,
    passingRate: 0.7,
    category: 'takkengyoho',
    difficulty: 2,
    icon: '🛡️',
  },
];

// ── 第4章: 宅建業法 実戦 ── 報酬計算・監督処分・総合問題
const ch4Missions: QuestMission[] = [
  {
    id: 'quest-ch4-m1',
    title: '報酬額の計算（売買）',
    description: '売買の報酬上限・空家特例800万円',
    matchTags: ['報酬', '報酬額の制限', '媒介報酬'],
    questionCount: 10,
    passingRate: 0.75,
    category: 'takkengyoho',
    difficulty: 2,
    icon: '💴',
  },
  {
    id: 'quest-ch4-m2',
    title: '報酬額の計算（賃貸）',
    description: '賃貸の報酬上限・居住用と非居住用の違い',
    matchTags: ['報酬', '報酬額の制限', '媒介報酬'],
    questionCount: 8,
    passingRate: 0.75,
    category: 'takkengyoho',
    difficulty: 3,
    icon: '🧮',
  },
  {
    id: 'quest-ch4-m3',
    title: '監督処分と罰則',
    description: '指示処分・業務停止・免許取消の要件',
    matchTags: ['監督処分', '指示処分', '業務停止処分', '免許取消', '罰則'],
    questionCount: 8,
    passingRate: 0.75,
    category: 'takkengyoho',
    difficulty: 3,
    icon: '🔨',
  },
  {
    id: 'quest-ch4-m4',
    title: '住宅瑕疵担保履行法',
    description: '資力確保措置・供託と保険',
    matchTags: ['住宅瑕疵担保履行法', '資力確保措置'],
    questionCount: 8,
    passingRate: 0.75,
    category: 'takkengyoho',
    difficulty: 2,
    icon: '🏗️',
  },
  {
    id: 'quest-ch4-m5',
    title: '🏆 宅建業法 総まとめ',
    description: '全範囲から出題！ここを突破すれば宅建業法はバッチリ',
    matchTags: ['免許', '欠格事由', '宅地建物取引士', '営業保証金', '保証協会', '媒介契約', '重要事項説明', '37条書面', 'クーリングオフ', '手付', '報酬', '監督処分'],
    questionCount: 12,
    passingRate: 0.75,
    category: 'takkengyoho',
    difficulty: 3,
    icon: '🏆',
  },
];

// ╔═══════════════════════════════════════════════════════════╗
// ║  第2部: 法令上の制限（全16ミッション）                      ║
// ╚═══════════════════════════════════════════════════════════╝

// ── 第5章: 法令制限 入門 ── 都市計画の全体像をつかむ
const ch5Missions: QuestMission[] = [
  {
    id: 'quest-ch5-m1',
    title: '都市計画って何？',
    description: '都市計画区域・市街化区域・調整区域の違い',
    matchTags: ['都市計画法', '市街化区域', '市街化調整区域'],
    questionCount: 8,
    passingRate: 0.6,
    category: 'horei_seigen',
    difficulty: 1,
    icon: '🗺️',
  },
  {
    id: 'quest-ch5-m2',
    title: '用途地域の基本',
    description: '13種類の用途地域を整理しよう',
    matchTags: ['用途地域', '地区計画', '用途制限', '第一種低層住居専用地域', '田園住居地域'],
    questionCount: 8,
    passingRate: 0.6,
    category: 'horei_seigen',
    difficulty: 1,
    icon: '🏘️',
  },
  {
    id: 'quest-ch5-m3',
    title: '開発許可の基本',
    description: '開発行為の定義と許可が不要なケース',
    matchTags: ['開発許可', '開発行為'],
    questionCount: 8,
    passingRate: 0.6,
    category: 'horei_seigen',
    difficulty: 1,
    icon: '🚧',
  },
];

// ── 第6章: 法令制限 基礎 ── 建築基準法をしっかり理解
const ch6Missions: QuestMission[] = [
  {
    id: 'quest-ch6-m1',
    title: '建ぺい率のルール',
    description: '敷地面積に対する建築面積の制限',
    matchTags: ['建ぺい率'],
    questionCount: 8,
    passingRate: 0.65,
    category: 'horei_seigen',
    difficulty: 2,
    icon: '📐',
  },
  {
    id: 'quest-ch6-m2',
    title: '容積率のルール',
    description: '延べ面積の制限・前面道路による制限',
    matchTags: ['容積率', '前面道路'],
    questionCount: 8,
    passingRate: 0.65,
    category: 'horei_seigen',
    difficulty: 2,
    icon: '📏',
  },
  {
    id: 'quest-ch6-m3',
    title: '道路制限と接道義務',
    description: '2項道路・セットバック・接道要件',
    matchTags: ['道路', '接道義務', '2項道路', 'セットバック'],
    questionCount: 8,
    passingRate: 0.65,
    category: 'horei_seigen',
    difficulty: 2,
    icon: '🛣️',
  },
  {
    id: 'quest-ch6-m4',
    title: '防火地域と高さ制限',
    description: '防火・準防火地域のルールと斜線制限',
    matchTags: ['防火地域', '準防火地域', '耐火建築物', '高さ制限', '日影規制', '北側斜線', '道路斜線'],
    questionCount: 8,
    passingRate: 0.65,
    category: 'horei_seigen',
    difficulty: 2,
    icon: '🔥',
  },
];

// ── 第7章: 法令制限 応用 ── 建築確認・その他の法令
const ch7Missions: QuestMission[] = [
  {
    id: 'quest-ch7-m1',
    title: '建築確認の手続き',
    description: '確認済証・完了検査・建築協定',
    matchTags: ['建築確認', '確認済証', '完了検査', '建築協定'],
    questionCount: 8,
    passingRate: 0.7,
    category: 'horei_seigen',
    difficulty: 2,
    icon: '✅',
  },
  {
    id: 'quest-ch7-m2',
    title: '【2026改正】新2号建築物',
    description: '4号特例廃止・新2号の定義・審査期間35日',
    matchTags: ['省エネ基準', '4号特例', '新2号建築物', '新3号建築物'],
    questionCount: 8,
    passingRate: 0.7,
    category: 'horei_seigen',
    difficulty: 2,
    icon: '🌿',
  },
  {
    id: 'quest-ch7-m3',
    title: '国土利用計画法',
    description: '事後届出の要件・面積基準・届出義務者',
    matchTags: ['国土利用計画法', '事後届出', '注視区域', '監視区域'],
    questionCount: 8,
    passingRate: 0.7,
    category: 'horei_seigen',
    difficulty: 2,
    icon: '🗾',
  },
  {
    id: 'quest-ch7-m4',
    title: '農地法の許可制度',
    description: '3条・4条・5条の許可と届出',
    matchTags: ['農地法', '3条許可', '4条許可', '5条許可'],
    questionCount: 8,
    passingRate: 0.7,
    category: 'horei_seigen',
    difficulty: 2,
    icon: '🌾',
  },
];

// ── 第8章: 法令制限 実戦 ── 区画整理・盛土・総合
const ch8Missions: QuestMission[] = [
  {
    id: 'quest-ch8-m1',
    title: '土地区画整理法',
    description: '換地処分・仮換地・建築制限',
    matchTags: ['土地区画整理法', '換地処分', '仮換地'],
    questionCount: 8,
    passingRate: 0.75,
    category: 'horei_seigen',
    difficulty: 2,
    icon: '📊',
  },
  {
    id: 'quest-ch8-m2',
    title: '盛土規制法',
    description: '規制区域・許可制度・土地所有者の責務',
    matchTags: ['盛土規制法', '宅地造成', '切土', '盛土'],
    questionCount: 8,
    passingRate: 0.75,
    category: 'horei_seigen',
    difficulty: 2,
    icon: '⛰️',
  },
  {
    id: 'quest-ch8-m3',
    title: '🏆 法令制限 総まとめ',
    description: '全範囲から出題！ここを突破すれば法令制限はバッチリ',
    matchTags: ['都市計画法', '開発許可', '用途制限', '建ぺい率', '容積率', '道路', '防火地域', '建築確認', '4号特例', '国土利用計画法', '農地法', '土地区画整理法', '盛土規制法'],
    questionCount: 12,
    passingRate: 0.75,
    category: 'horei_seigen',
    difficulty: 3,
    icon: '🏆',
  },
];

// ╔═══════════════════════════════════════════════════════════╗
// ║  第3部: 権利関係（全20ミッション）                         ║
// ╚═══════════════════════════════════════════════════════════╝

// ── 第9章: 権利関係 入門 ── 民法の基本概念を理解
const ch9Missions: QuestMission[] = [
  {
    id: 'quest-ch9-m1',
    title: '意思表示とは？',
    description: '詐欺・強迫・錯誤・虚偽表示の基本',
    matchTags: ['意思表示', '詐欺', '強迫', '心裡留保', '虚偽表示', '錯誤', '取消し'],
    questionCount: 8,
    passingRate: 0.6,
    category: 'kenri',
    difficulty: 1,
    icon: '📝',
  },
  {
    id: 'quest-ch9-m2',
    title: '代理のしくみ',
    description: '有権代理・無権代理・表見代理の違い',
    matchTags: ['代理', '無権代理', '表見代理', '復代理', '自己契約', '双方代理'],
    questionCount: 8,
    passingRate: 0.6,
    category: 'kenri',
    difficulty: 1,
    icon: '🤝',
  },
  {
    id: 'quest-ch9-m3',
    title: '時効の基本',
    description: '取得時効・消滅時効のルール',
    matchTags: ['取得時効', '消滅時効', '時効の援用', '時効の更新', '時効の完成猶予'],
    questionCount: 8,
    passingRate: 0.6,
    category: 'kenri',
    difficulty: 1,
    icon: '⏳',
  },
];

// ── 第10章: 権利関係 基礎 ── 物権・債権の基本
const ch10Missions: QuestMission[] = [
  {
    id: 'quest-ch10-m1',
    title: '物権変動と対抗要件',
    description: '二重譲渡・登記の基本ルール',
    matchTags: ['物権変動', '対抗要件', '登記', '二重譲渡', '共有', '地役権', '地上権'],
    questionCount: 8,
    passingRate: 0.65,
    category: 'kenri',
    difficulty: 2,
    icon: '🏠',
  },
  {
    id: 'quest-ch10-m2',
    title: '抵当権の基本',
    description: '抵当権の設定・効力・物上代位',
    matchTags: ['抵当権', '物上代位'],
    questionCount: 8,
    passingRate: 0.65,
    category: 'kenri',
    difficulty: 2,
    icon: '🔒',
  },
  {
    id: 'quest-ch10-m3',
    title: '担保物権いろいろ',
    description: '根抵当権・法定地上権・留置権・先取特権',
    matchTags: ['根抵当権', '法定地上権', '留置権', '先取特権', '質権'],
    questionCount: 8,
    passingRate: 0.65,
    category: 'kenri',
    difficulty: 2,
    icon: '🔐',
  },
  {
    id: 'quest-ch10-m4',
    title: '債務不履行と解除',
    description: '履行遅滞・履行不能・損害賠償・契約解除',
    matchTags: ['債務不履行', '解除', '損害賠償', '金銭債務'],
    questionCount: 8,
    passingRate: 0.65,
    category: 'kenri',
    difficulty: 2,
    icon: '⚡',
  },
  {
    id: 'quest-ch10-m5',
    title: '弁済・相殺・債権譲渡',
    description: '債権の消滅原因と債権譲渡のルール',
    matchTags: ['弁済', '相殺', '債権譲渡'],
    questionCount: 8,
    passingRate: 0.65,
    category: 'kenri',
    difficulty: 2,
    icon: '💳',
  },
];

// ── 第11章: 権利関係 応用 ── 保証・賃貸借・特別法
const ch11Missions: QuestMission[] = [
  {
    id: 'quest-ch11-m1',
    title: '保証と連帯債務',
    description: '連帯保証・個人根保証・求償権のルール',
    matchTags: ['連帯保証', '連帯債務', '保証契約', '個人根保証', '求償権'],
    questionCount: 8,
    passingRate: 0.7,
    category: 'kenri',
    difficulty: 2,
    icon: '🤲',
  },
  {
    id: 'quest-ch11-m2',
    title: '賃貸借の基本ルール',
    description: '民法の賃貸借・敷金・原状回復',
    matchTags: ['賃貸借', '建物賃貸借', '敷金'],
    questionCount: 8,
    passingRate: 0.7,
    category: 'kenri',
    difficulty: 2,
    icon: '🏘️',
  },
  {
    id: 'quest-ch11-m3',
    title: '借地借家法（借地権）',
    description: '普通借地権・定期借地権・事業用定期借地権',
    matchTags: ['借地権', '普通借地権', '定期借地権'],
    questionCount: 8,
    passingRate: 0.7,
    category: 'kenri',
    difficulty: 2,
    icon: '🏡',
  },
  {
    id: 'quest-ch11-m4',
    title: '借地借家法（借家権）',
    description: '普通借家・定期借家・法定更新',
    matchTags: ['定期借家', '建物賃貸借', '賃貸借'],
    questionCount: 8,
    passingRate: 0.7,
    category: 'kenri',
    difficulty: 2,
    icon: '🔑',
  },
  {
    id: 'quest-ch11-m5',
    title: '不法行為',
    description: '使用者責任・工作物責任・共同不法行為',
    matchTags: ['不法行為', '使用者責任', '工作物責任', '過失相殺', '共同不法行為'],
    questionCount: 8,
    passingRate: 0.7,
    category: 'kenri',
    difficulty: 2,
    icon: '⚠️',
  },
];

// ── 第12章: 権利関係 実戦 ── 相続・区分所有法・登記法・総合
const ch12Missions: QuestMission[] = [
  {
    id: 'quest-ch12-m1',
    title: '相続の基本',
    description: '法定相続分・代襲相続・相続放棄',
    matchTags: ['相続', '法定相続分', '相続放棄', '代襲相続'],
    questionCount: 8,
    passingRate: 0.75,
    category: 'kenri',
    difficulty: 2,
    icon: '📜',
  },
  {
    id: 'quest-ch12-m2',
    title: '遺言と遺留分',
    description: '遺言の方式・遺留分・配偶者居住権',
    matchTags: ['遺言', '遺留分', '配偶者居住権'],
    questionCount: 8,
    passingRate: 0.75,
    category: 'kenri',
    difficulty: 2,
    icon: '✍️',
  },
  {
    id: 'quest-ch12-m3',
    title: '区分所有法',
    description: '管理組合・規約・集会・建替え決議',
    matchTags: ['区分所有法', '規約', '管理組合', '集会', '建替え', '敷地売却決議'],
    questionCount: 8,
    passingRate: 0.75,
    category: 'kenri',
    difficulty: 3,
    icon: '🏢',
  },
  {
    id: 'quest-ch12-m4',
    title: '【2026改正】不動産登記法',
    description: '住所変更登記の義務化・職権登記',
    matchTags: ['不動産登記法', '住所変更登記', '職権登記'],
    questionCount: 8,
    passingRate: 0.75,
    category: 'kenri',
    difficulty: 2,
    icon: '📋',
  },
  {
    id: 'quest-ch12-m5',
    title: '🏆 権利関係 総まとめ',
    description: '全範囲から出題！ここを突破すれば権利関係はバッチリ',
    matchTags: ['意思表示', '代理', '物権変動', '抵当権', '取得時効', '消滅時効', '債務不履行', '連帯保証', '賃貸借', '借地権', '不法行為', '相続', '遺言', '区分所有法', '不動産登記法'],
    questionCount: 12,
    passingRate: 0.75,
    category: 'kenri',
    difficulty: 3,
    icon: '🏆',
  },
];

// ╔═══════════════════════════════════════════════════════════╗
// ║  第4部: 税・その他（全14ミッション）                       ║
// ╚═══════════════════════════════════════════════════════════╝

// ── 第13章: 税 入門 ── 不動産にかかる税金の基本
const ch13Missions: QuestMission[] = [
  {
    id: 'quest-ch13-m1',
    title: '不動産取得税',
    description: '課税主体・税率・非課税・特例措置',
    matchTags: ['不動産取得税', '課税標準の特例'],
    questionCount: 8,
    passingRate: 0.6,
    category: 'tax_other',
    difficulty: 1,
    icon: '🏷️',
  },
  {
    id: 'quest-ch13-m2',
    title: '固定資産税',
    description: '賦課期日・税率・住宅用地の特例',
    matchTags: ['固定資産税', '評価替え', '住宅用地の特例'],
    questionCount: 8,
    passingRate: 0.6,
    category: 'tax_other',
    difficulty: 1,
    icon: '🏠',
  },
  {
    id: 'quest-ch13-m3',
    title: '登録免許税と印紙税',
    description: '登記にかかる税・契約書にかかる税',
    matchTags: ['登録免許税', '印紙税', '非課税文書'],
    questionCount: 8,
    passingRate: 0.6,
    category: 'tax_other',
    difficulty: 1,
    icon: '📝',
  },
];

// ── 第14章: 税 基礎 ── 所得税・住宅ローン控除
const ch14Missions: QuestMission[] = [
  {
    id: 'quest-ch14-m1',
    title: '譲渡所得税の基本',
    description: '長期・短期の区分と3,000万円特別控除',
    matchTags: ['譲渡所得', '3000万円特別控除', '長期譲渡所得', '短期譲渡所得'],
    questionCount: 8,
    passingRate: 0.65,
    category: 'tax_other',
    difficulty: 2,
    icon: '💹',
  },
  {
    id: 'quest-ch14-m2',
    title: '住宅ローン控除【2026最新】',
    description: '控除率0.7%・最大13年・2030年末まで延長',
    matchTags: ['住宅ローン控除', '住宅借入金等特別控除'],
    questionCount: 8,
    passingRate: 0.65,
    category: 'tax_other',
    difficulty: 2,
    icon: '🏡',
  },
  {
    id: 'quest-ch14-m3',
    title: '贈与税と都市計画税',
    description: '住宅取得資金の贈与の特例・都市計画税',
    matchTags: ['贈与税', '相続税', '住宅取得等資金', '都市計画税'],
    questionCount: 8,
    passingRate: 0.65,
    category: 'tax_other',
    difficulty: 2,
    icon: '🎁',
  },
];

// ── 第15章: その他 応用 ── 鑑定評価・地価公示
const ch15Missions: QuestMission[] = [
  {
    id: 'quest-ch15-m1',
    title: '不動産鑑定評価の3手法',
    description: '原価法・取引事例比較法・収益還元法',
    matchTags: ['不動産鑑定評価', '原価法', '取引事例比較法', '収益還元法'],
    questionCount: 8,
    passingRate: 0.7,
    category: 'tax_other',
    difficulty: 2,
    icon: '🔍',
  },
  {
    id: 'quest-ch15-m2',
    title: '地価公示法',
    description: '標準地・土地鑑定委員会・公示価格の役割',
    matchTags: ['地価公示法', '標準地', '土地鑑定委員会'],
    questionCount: 8,
    passingRate: 0.7,
    category: 'tax_other',
    difficulty: 2,
    icon: '📊',
  },
];

// ── 第16章: その他 実戦 ── 住宅金融・景表法・総合
const ch16Missions: QuestMission[] = [
  {
    id: 'quest-ch16-m1',
    title: '住宅金融支援機構',
    description: 'フラット35・証券化支援業務の仕組み',
    matchTags: ['住宅金融支援機構', 'フラット35', '証券化支援業務'],
    questionCount: 8,
    passingRate: 0.75,
    category: 'tax_other',
    difficulty: 2,
    icon: '🏦',
  },
  {
    id: 'quest-ch16-m2',
    title: '景品表示法と公正競争規約',
    description: 'おとり広告・不当表示・80m=1分ルール',
    matchTags: ['景品表示法', '公正競争規約', 'おとり広告', '不当表示'],
    questionCount: 8,
    passingRate: 0.75,
    category: 'tax_other',
    difficulty: 2,
    icon: '📢',
  },
  {
    id: 'quest-ch16-m3',
    title: '🏆 税・その他 総まとめ',
    description: '全範囲から出題！ここを突破すれば税・その他はバッチリ',
    matchTags: ['不動産取得税', '固定資産税', '登録免許税', '印紙税', '譲渡所得', '住宅ローン控除', '不動産鑑定評価', '地価公示法', '住宅金融支援機構', '景品表示法'],
    questionCount: 12,
    passingRate: 0.75,
    category: 'tax_other',
    difficulty: 3,
    icon: '🏆',
  },
];

// ── 全チャプター定義 ──
export const QUEST_CHAPTERS: QuestChapter[] = [
  // 第1部: 宅建業法（本試験20問、最も配点が高い）
  { id: 'quest-ch1', title: '第1章: 宅建業法 入門', description: '宅建業の基本ルールを理解しよう', category: 'takkengyoho', icon: '🏢', missions: ch1Missions, order: 1 },
  { id: 'quest-ch2', title: '第2章: 宅建業法 基礎', description: '実務で必要な制度をマスター', category: 'takkengyoho', icon: '💼', missions: ch2Missions, order: 2 },
  { id: 'quest-ch3', title: '第3章: 宅建業法 応用', description: '重説・契約・8種制限を攻略', category: 'takkengyoho', icon: '📑', missions: ch3Missions, order: 3 },
  { id: 'quest-ch4', title: '第4章: 宅建業法 実戦', description: '報酬計算と監督処分で仕上げ', category: 'takkengyoho', icon: '⚖️', missions: ch4Missions, order: 4 },

  // 第2部: 法令上の制限（本試験8問）
  { id: 'quest-ch5', title: '第5章: 法令制限 入門', description: '都市計画と開発許可の全体像', category: 'horei_seigen', icon: '🗺️', missions: ch5Missions, order: 5 },
  { id: 'quest-ch6', title: '第6章: 法令制限 基礎', description: '建築基準法の数字を正確に', category: 'horei_seigen', icon: '🏗️', missions: ch6Missions, order: 6 },
  { id: 'quest-ch7', title: '第7章: 法令制限 応用', description: '建築確認・農地法・国土法', category: 'horei_seigen', icon: '⛰️', missions: ch7Missions, order: 7 },
  { id: 'quest-ch8', title: '第8章: 法令制限 実戦', description: '区画整理・盛土規制で完成', category: 'horei_seigen', icon: '🏆', missions: ch8Missions, order: 8 },

  // 第3部: 権利関係（本試験14問、最難関）
  { id: 'quest-ch9', title: '第9章: 権利関係 入門', description: '民法の基本概念をつかもう', category: 'kenri', icon: '📝', missions: ch9Missions, order: 9 },
  { id: 'quest-ch10', title: '第10章: 権利関係 基礎', description: '物権・債権の基本を固める', category: 'kenri', icon: '🔒', missions: ch10Missions, order: 10 },
  { id: 'quest-ch11', title: '第11章: 権利関係 応用', description: '保証・賃貸借・借地借家法', category: 'kenri', icon: '🏘️', missions: ch11Missions, order: 11 },
  { id: 'quest-ch12', title: '第12章: 権利関係 実戦', description: '相続・区分所有法・登記法', category: 'kenri', icon: '🏆', missions: ch12Missions, order: 12 },

  // 第4部: 税・その他（本試験8問）
  { id: 'quest-ch13', title: '第13章: 税 入門', description: '不動産にかかる税金の基本', category: 'tax_other', icon: '🏷️', missions: ch13Missions, order: 13 },
  { id: 'quest-ch14', title: '第14章: 税 基礎', description: '所得税・住宅ローン控除', category: 'tax_other', icon: '💹', missions: ch14Missions, order: 14 },
  { id: 'quest-ch15', title: '第15章: その他 応用', description: '鑑定評価・地価公示法', category: 'tax_other', icon: '🔍', missions: ch15Missions, order: 15 },
  { id: 'quest-ch16', title: '第16章: その他 実戦', description: '住宅金融・景表法・総まとめ', category: 'tax_other', icon: '🏆', missions: ch16Missions, order: 16 },
];

// ── 全ミッションをフラット化（順序通り） ──
export const ALL_QUEST_MISSIONS: QuestMission[] = QUEST_CHAPTERS.flatMap((ch) => ch.missions);

/**
 * ミッションIDから問題を選出する
 * matchTags に一致する問題をランダムに questionCount 分だけ返す
 */
export function getQuestQuestions(missionId: string): string[] {
  const mission = ALL_QUEST_MISSIONS.find((m) => m.id === missionId);
  if (!mission) return [];

  const tagSet = new Set(mission.matchTags);
  const matched = ALL_QUESTIONS.filter(
    (q) => q.category === mission.category && q.tags.some((t) => tagSet.has(t)),
  );

  // シャッフルして指定数だけ返す
  const shuffled = [...matched].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, mission.questionCount).map((q) => q.id);
}

/**
 * ミッションIDからミッション定義を取得
 */
export function getQuestMission(missionId: string): QuestMission | undefined {
  return ALL_QUEST_MISSIONS.find((m) => m.id === missionId);
}
