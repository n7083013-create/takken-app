// ============================================================
// 宅建士 完全対策 - 型定義
// ============================================================

/** AI チャットメッセージ */
export interface AIChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// 試験カテゴリ（宅建試験4分野）
export type Category = 'kenri' | 'takkengyoho' | 'horei_seigen' | 'tax_other';

// 試験モジュールID（将来の拡張用）
export type ExamModuleId = 'takken';

// カテゴリ表示名
export const CATEGORY_LABELS: Record<Category, string> = {
  kenri: '権利関係',
  takkengyoho: '宅建業法',
  horei_seigen: '法令上の制限',
  tax_other: '税・その他',
};

// カテゴリアイコン
export const CATEGORY_ICONS: Record<Category, string> = {
  kenri: '⚖️',
  takkengyoho: '🏢',
  horei_seigen: '📋',
  tax_other: '💰',
};

// カテゴリカラー
export const CATEGORY_COLORS: Record<Category, string> = {
  kenri: '#1B7A3D',
  takkengyoho: '#1A6DC2',
  horei_seigen: '#C75A1A',
  tax_other: '#7B3FA0',
};

// 試験モジュール名
export const EXAM_MODULE_LABELS: Record<ExamModuleId, string> = {
  takken: '宅地建物取引士',
};

// サブカテゴリ定義
export interface Subcategory {
  key: string;
  label: string;
  icon: string;
  /** このサブカテゴリに属する問題のタグ（いずれかに一致すればOK） */
  matchTags: string[];
}

/**
 * 科目ごとのサブカテゴリ定義
 * タグベースで問題を自動分類
 */
export const SUBCATEGORIES: Record<Category, Subcategory[]> = {
  kenri: [
    { key: 'ishi', label: '意思表示・契約', icon: '📝', matchTags: ['意思表示', '詐欺', '強迫', '心裡留保', '虚偽表示', '錯誤', '取消し'] },
    { key: 'dairi', label: '代理', icon: '🤝', matchTags: ['代理', '無権代理', '表見代理', '復代理', '自己契約', '双方代理'] },
    { key: 'bukken', label: '物権・対抗要件', icon: '🏠', matchTags: ['物権変動', '対抗要件', '登記', '二重譲渡', '共有', '地役権', '地上権'] },
    { key: 'tanpo', label: '抵当権・担保', icon: '🔒', matchTags: ['抵当権', '根抵当権', '法定地上権', '留置権', '先取特権', '質権', '物上代位'] },
    { key: 'jikou', label: '時効', icon: '⏳', matchTags: ['取得時効', '消滅時効', '時効の援用', '時効の更新', '時効の完成猶予'] },
    { key: 'saiken', label: '債権・債務', icon: '💳', matchTags: ['債務不履行', '解除', '損害賠償', '弁済', '相殺', '債権譲渡', '金銭債務'] },
    { key: 'hosho', label: '保証・連帯債務', icon: '🤲', matchTags: ['連帯保証', '連帯債務', '保証契約', '個人根保証', '求償権'] },
    { key: 'chintai', label: '賃貸借・借地借家法', icon: '🏘️', matchTags: ['賃貸借', '建物賃貸借', '敷金', '借地権', '普通借地権', '定期借地権', '定期借家'] },
    { key: 'fuhou', label: '不法行為', icon: '⚠️', matchTags: ['不法行為', '使用者責任', '工作物責任', '過失相殺', '共同不法行為'] },
    { key: 'souzoku', label: '相続・遺言', icon: '📜', matchTags: ['相続', '法定相続分', '相続放棄', '遺言', '遺留分', '配偶者居住権', '代襲相続'] },
    { key: 'kubun', label: '区分所有法', icon: '🏢', matchTags: ['区分所有法', '規約', '管理組合', '集会', '建替え', '敷地売却決議'] },
    { key: 'touki', label: '不動産登記法', icon: '📋', matchTags: ['不動産登記法', '住所変更登記', '職権登記'] },
  ],
  takkengyoho: [
    { key: 'menkyo', label: '免許', icon: '📄', matchTags: ['免許', '知事免許', '大臣免許', '欠格事由', '免許換え', '有効期間'] },
    { key: 'torihikishi', label: '宅建取引士', icon: '👤', matchTags: ['宅地建物取引士', '取引士証', '登録', '法定講習'] },
    { key: 'hoshokin', label: '営業保証金・保証協会', icon: '💰', matchTags: ['営業保証金', '供託', '保証協会', '弁済業務保証金'] },
    { key: 'jimusho', label: '事務所・届出', icon: '🏢', matchTags: ['事務所', '案内所', '届出', '標識', '従業者名簿', '帳簿', '専任の宅地建物取引士'] },
    { key: 'baikai', label: '媒介契約', icon: '📋', matchTags: ['媒介契約', '専任媒介', '専属専任媒介', '一般媒介', '指定流通機構'] },
    { key: '35jou', label: '重要事項説明(35条)', icon: '📑', matchTags: ['重要事項説明', '35条書面', 'インスペクション'] },
    { key: '37jou', label: '契約書(37条)', icon: '📃', matchTags: ['37条書面', '契約書'] },
    { key: 'tetsukekin', label: '手付・保全措置', icon: '🛡️', matchTags: ['手付', '解約手付', '手付金等の保全措置', '手付の額の制限'] },
    { key: 'cooling', label: 'クーリングオフ', icon: '❄️', matchTags: ['クーリングオフ', '自ら売主制限'] },
    { key: 'songai', label: '損害賠償・違約金', icon: '⚖️', matchTags: ['損害賠償額の予定', '違約金', '契約不適合責任'] },
    { key: 'houshu', label: '報酬', icon: '💴', matchTags: ['報酬', '報酬額の制限', '媒介報酬'] },
    { key: 'koukoku', label: '広告・業務規制', icon: '📢', matchTags: ['広告', '誇大広告', '広告開始時期', '断定的判断', '守秘義務'] },
    { key: 'kantoku', label: '監督処分・罰則', icon: '🔨', matchTags: ['監督処分', '指示処分', '業務停止処分', '免許取消', '罰則'] },
    { key: 'kashi', label: '住宅瑕疵担保履行法', icon: '🏗️', matchTags: ['住宅瑕疵担保履行法', '資力確保措置'] },
  ],
  horei_seigen: [
    { key: 'toshi', label: '都市計画法', icon: '🗺️', matchTags: ['都市計画法', '市街化区域', '市街化調整区域', '用途地域', '地区計画'] },
    { key: 'kaihatsu', label: '開発許可', icon: '🚧', matchTags: ['開発許可', '開発行為'] },
    { key: 'youto', label: '用途制限', icon: '🏘️', matchTags: ['用途制限', '第一種低層住居専用地域', '田園住居地域'] },
    { key: 'kenpei', label: '建ぺい率・容積率', icon: '📐', matchTags: ['建ぺい率', '容積率', '前面道路'] },
    { key: 'douro', label: '道路・接道義務', icon: '🛣️', matchTags: ['道路', '接道義務', '2項道路', 'セットバック'] },
    { key: 'takasa', label: '高さ制限・日影規制', icon: '📏', matchTags: ['高さ制限', '日影規制', '北側斜線', '道路斜線'] },
    { key: 'bouka', label: '防火地域', icon: '🔥', matchTags: ['防火地域', '準防火地域', '耐火建築物'] },
    { key: 'kakunin', label: '建築確認', icon: '✅', matchTags: ['建築確認', '確認済証', '完了検査', '建築協定'] },
    { key: 'shoene', label: '省エネ基準(2025改正)', icon: '🌿', matchTags: ['省エネ基準', '4号特例', '新2号建築物', '新3号建築物'] },
    { key: 'kokudo', label: '国土利用計画法', icon: '🗾', matchTags: ['国土利用計画法', '事後届出', '注視区域', '監視区域'] },
    { key: 'nouchi', label: '農地法', icon: '🌾', matchTags: ['農地法', '3条許可', '4条許可', '5条許可'] },
    { key: 'kukaku', label: '土地区画整理法', icon: '📊', matchTags: ['土地区画整理法', '換地処分', '仮換地'] },
    { key: 'morido', label: '盛土規制法', icon: '⛰️', matchTags: ['盛土規制法', '宅地造成', '切土', '盛土'] },
    { key: 'sonota', label: 'その他の法令', icon: '📚', matchTags: ['単体規定', '景観法', '都市緑地法', '生産緑地法'] },
  ],
  tax_other: [
    { key: 'shutoku', label: '不動産取得税', icon: '🏷️', matchTags: ['不動産取得税', '課税標準の特例'] },
    { key: 'kotei', label: '固定資産税', icon: '🏠', matchTags: ['固定資産税', '評価替え', '住宅用地の特例'] },
    { key: 'touroku', label: '登録免許税', icon: '📝', matchTags: ['登録免許税'] },
    { key: 'inshi', label: '印紙税', icon: '📎', matchTags: ['印紙税', '非課税文書'] },
    { key: 'joto', label: '譲渡所得税', icon: '💹', matchTags: ['譲渡所得', '3000万円特別控除', '長期譲渡所得', '短期譲渡所得'] },
    { key: 'loan', label: '住宅ローン控除', icon: '🏡', matchTags: ['住宅ローン控除', '住宅借入金等特別控除'] },
    { key: 'zoyo', label: '贈与税・相続税', icon: '🎁', matchTags: ['贈与税', '相続税', '住宅取得等資金'] },
    { key: 'toshi_tax', label: '都市計画税', icon: '🏙️', matchTags: ['都市計画税'] },
    { key: 'kantei', label: '不動産鑑定評価', icon: '🔍', matchTags: ['不動産鑑定評価', '原価法', '取引事例比較法', '収益還元法'] },
    { key: 'chika', label: '地価公示法', icon: '📊', matchTags: ['地価公示法', '標準地', '土地鑑定委員会'] },
    { key: 'kikou', label: '住宅金融支援機構', icon: '🏦', matchTags: ['住宅金融支援機構', 'フラット35', '証券化支援業務'] },
    { key: 'keihin', label: '景品表示法', icon: '📢', matchTags: ['景品表示法', '公正競争規約', 'おとり広告', '不当表示'] },
  ],
};

// AI質問回数制限（月あたり・後方互換のため残置）
// 主ゲートは AI_DAILY_LIMITS（日次）。ここは月次の安全上限。
// free=93 は「1日3回 × 31日」の非拘束セーフティ上限（31日ある月でも日次3回が常に唯一の拘束。
//   ×30 だと31日目に月次が先に効く silent cap が残るため ×31）。
// (旧 free=3 は日次3より先に効き、コピー「1日3回」に反し実質「月3回」になる不具合だった)
// ※サーバー api/ai-chat.js は日次のみ管理（月次キャップなし）。この月次はクライアント予測用。
export const AI_QUERY_LIMITS: Record<SubscriptionPlan, number> = {
  free: 93,
  premium: 3000,
};

// 問題形式
export type QuestionFormat = 'standard' | 'count' | 'combination';

// 問題データ
export interface Question {
  id: string;
  moduleId: ExamModuleId;
  category: Category;
  year?: number;
  difficulty: 1 | 2 | 3;
  /** 問題形式: standard=通常4択, count=個数問題, combination=組み合わせ問題 */
  questionFormat?: QuestionFormat;
  text: string;
  /** 個数問題・組み合わせ問題で使用するア〜エの記述文 */
  statements?: string[];
  /** 各記述文の正誤（個数・組み合わせ問題用） */
  statementAnswers?: boolean[];
  choices: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  explanation: string;
  choiceExplanations?: [string, string, string, string];
  /** 各記述文ごとの解説（個数・組み合わせ問題用） */
  statementExplanations?: string[];
  /** 1行エッセンス: 論点の核心を1文で要約（試験直前復習用） */
  coreEssence?: string;
  tags: string[];
  imageUrl?: string;

  // ── 法改正・正確性トラッキング ──
  /** 出題元の試験年度（例: 2024 = 令和6年度本試験） */
  sourceExamYear?: number;
  /** 最終検証日（ISO 8601形式）: この日時点で法的に正確であることを確認 */
  lastVerifiedAt?: string;
  /** 関連法令の施行日（例: "2025-04-01"）: この日以降の法律に基づく */
  lawEffectiveFrom?: string;
  /** 特例・経過措置の期限（例: "2027-03-31"）: この日を過ぎたら要見直し */
  expiresAt?: string;
  /** 関連する法改正タグ（例: ["民法改正2020", "建築基準法改正2025"]） */
  lawAmendments?: string[];
  /** true = この問題は現在の法律と整合しない可能性がある（要レビュー） */
  needsReview?: boolean;
  /** レビュー理由（needsReview=true のとき） */
  reviewReason?: string;
}

/**
 * 法改正レジストリ
 * アプリ内で参照できる主要法改正の一覧
 */
export interface LawAmendment {
  id: string;
  /** 改正法の名称 */
  lawName: string;
  /** 施行日 */
  effectiveDate: string;
  /** 概要 */
  summary: string;
  /** 影響を受ける科目 */
  affectedCategories: Category[];
  /** 影響を受ける問題のタグ */
  affectedTags: string[];
  /** 試験への影響度: high=必ず出る, medium=出る可能性あり, low=参考 */
  examImpact: 'high' | 'medium' | 'low';
}

// 用語辞典
export interface GlossaryTerm {
  slug: string;
  term: string;
  reading: string;
  category: Category;
  definition: string;
  imageUrl?: string;
  relatedTerms: string[];
}

// 確信度（解答時のメタ認知）
export type ConfidenceLevel = 'high' | 'low' | 'none';

// 学習進捗（SM-2間隔反復 + 確信度ベース拡張）
export interface QuestionProgress {
  questionId: string;
  attempts: number;
  correctCount: number;
  correctStreak: number;  // SM-2: 連続正答数（不正解でリセット）
  lastAttemptAt: string;
  bookmarked: boolean;
  nextReviewAt: string;
  easeFactor: number;   // SM-2: 難易度係数（1.3〜2.5）
  interval: number;     // SM-2: 次の復習までの日数
  lastConfidence?: ConfidenceLevel; // 最後の確信度
  /**
   * ユーザーが「完全に理解した」と自己申告して復習から永久除外した問題。
   * - true: 復習・苦手リストから永久除外（ユーザー手動で解除可能）
   * - undefined/false: 通常 (SM-2 で復習対象)
   * 現状ローカル AsyncStorage のみ保存 (cloud sync は後追い対応)
   */
  mastered?: boolean;
}

// 学習セッション
export interface StudySession {
  id: string;
  startedAt: string;
  endedAt?: string;
  category?: Category;
  mode: 'practice' | 'exam' | 'flashcard';
  totalQuestions: number;
  correctCount: number;
  questionIds: string[];
}

// サブスクリプションプラン（2プラン構成: FREE / PREMIUM）
// 内部キーを 'premium' に統一（2026-06-07・gas-shunin と同一・DB値も premium）。
// 旧 'standard'/'unlimited' は normalizePlan() で premium に正規化し、課金者を free に落とさない。
export type SubscriptionPlan = 'free' | 'premium';

/**
 * プラン値の正規化。旧内部キー 'standard'/'unlimited'（および想定外の非 free 値）を
 * 'premium' に寄せ、'free'/未設定は 'free' にする。
 * 目的(P2 安全): 命名統一の移行期や永続/サーバ応答に 'standard' が残っても、
 * 課金者を絶対に free へ降格させない。最終的な Pro 認可はサーバ verify-subscription
 * + lastVerifiedAt が担うため、ここで非 free を premium 扱いにしても不正昇格にはならない。
 */
export function normalizePlan(p: string | null | undefined): SubscriptionPlan {
  return p && p !== 'free' ? 'premium' : 'free';
}

// 課金サイクル (2026-05 年額プラン追加)
// monthly: ¥980/月  /  annual: ¥5,980/年 (約 49% OFF / ¥498/月相当)
export type BillingCycle = 'monthly' | 'annual';

// サブスクリプション情報
export interface Subscription {
  plan: SubscriptionPlan;
  /** 課金サイクル。free または未設定の場合は undefined */
  billingCycle?: BillingCycle;
  expiresAt?: string;
  subscriptionStatus?: string;
  aiQueriesUsed: number;
  aiQueriesResetAt: string;
  // 1日あたり制限（フェア利用ポリシー）
  aiQueriesUsedToday: number;
  aiQueriesDayKey: string;     // YYYY-MM-DD
  // 継続割引判定用
  firstSubscribedAt?: string;  // 初回課金日（連続契約期間判定）
  renewalCount: number;        // 連続更新回数（0=初年度, 1+=継続割引対象）
  // 無料トライアル
  trialStartedAt?: string;     // トライアル開始日（廃止予定: 旧実装の名残。判定は trialEndsAt を使用）
  trialEndsAt?: string;        // トライアル終了日（サーバー verify-subscription 由来。残日数/バナー判定に使用）
  // セキュリティ: サーバー検証タイムスタンプ
  lastVerifiedAt?: string;     // 最後にサーバーでプラン検証した日時（ISO）
  // [Issue #13] 時計巻き戻し検知
  // 過去に観測した最大の Date.now() を保存。現在時刻がこれより 1h 以上前なら時計改ざん疑い
  clockMaxSeen?: string;       // 観測した最大時刻（ISO）
}

// プラン価格 (2026-05 年額プラン追加)
// 年額は約 49% OFF (6 ヶ月分強の価格で 12 ヶ月使える) で攻めた割引率。
// 宅建試験は年 1 回 (10 月) のため、年額プランは試験 1 サイクル分の利用権を提供する設計。
export const PLAN_PRICES = {
  monthly: 980,
  annual: 5980,
} as const;

// AI解説の1日あたり上限（フェア利用ポリシー）
// ※サーバー api/ai-chat.js PAID_DAILY_LIMIT=50 が真値。ここはクライアント表示・予測用で
//   必ず一致させること。コピーは具体数を出さず「実質無制限(Fair Use)」で表現する
//   (2026-05-30 決定A: 数値の過約束を避け gas-shunin と同方式に統一)。
export const AI_DAILY_LIMITS: Record<SubscriptionPlan, number> = {
  free: 3,        // 無料でも1日3回（体験してもらう）
  premium: 50,    // Fair Use 上限（通常学習で到達しない設計値）
};

// トライアル中のAI制限（コスト管理）
export const TRIAL_AI_DAILY_LIMIT = 10;

// 無料プランの上限（1日あたり）
export const FREE_LIMITS = {
  questionsPerDay: 10,      // 4択問題は1日10問まで
  quickQuizzesPerDay: 10,   // 一問一答は1日10問まで（2026-06-03: 20→10、4択と揃える）
  examMode: false,          // 模擬試験は不可
  aiAnalysis: false,        // AI苦手分析は不可
  cloudSync: false,         // クラウド同期は不可
} as const;

// ユーザー設定
export interface UserSettings {
  dailyGoal: number;
  notificationsEnabled: boolean;
  /** 学習リマインダー通知時刻（"HH:MM" の配列・複数時刻対応） */
  notificationTimes: string[];
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  studyReminderDays: number[];
  fontSize: 'small' | 'medium' | 'large';
  themeMode: 'system' | 'light' | 'dark';
  examDate?: string; // ISO string — 試験日
  /** アニメーション表示レベル
   * - full: 通常演出（コンボ・祝福・エフェクトすべて）
   * - subtle: 控えめ（コンボ数のみ・祝福なし）
   * - off: 最小限（チェックマークのみ・バイブと音は別設定）
   */
  animationLevel?: 'full' | 'subtle' | 'off';
}

// 一問一答（○✗クイズ）
export type QuickQuiz = {
  id: string;
  moduleId: ExamModuleId;
  category: Category;
  statement: string;        // The statement to judge true/false
  isCorrect: boolean;       // true = ○, false = ✗
  explanation: string;      // Brief explanation
  relatedQuestionId?: string; // Link to 4-choice question
  tags: string[];
  // ── 法改正・正確性トラッキング（Question と同じセマンティクス） ──
  /** true = 自動生成され人間レビュー未完了、または法改正で要見直し */
  needsReview?: boolean;
  /** レビュー理由（needsReview=true のとき） */
  reviewReason?: string;
};

// ============================================================
// クエスト学習（初学者ガイド付き学習パス）
// ============================================================

export interface QuestMission {
  id: string;                    // e.g. 'quest-ch1-m1'
  title: string;                 // e.g. '免許制度の基本'
  description: string;           // 学習内容の説明
  matchTags: string[];           // この分野の問題を自動選出するタグ
  questionCount: number;         // 出題数（10問程度）
  passingRate: number;           // 合格ライン（0.7 = 70%）
  category: Category;
  difficulty: 1 | 2 | 3;
  icon: string;
}

export interface QuestChapter {
  id: string;                    // e.g. 'quest-ch1'
  title: string;                 // e.g. '第1章: 宅建業法の基礎'
  description: string;
  category: Category;
  icon: string;
  missions: QuestMission[];
  order: number;                 // 全体の順序
}

export interface QuestMissionProgress {
  missionId: string;
  bestScore: number;             // 最高正答率（0-1）
  attempts: number;
  completedAt?: string;          // 初回合格日
  lastAttemptAt?: string;
}

// 学習統計
export interface StudyStats {
  totalQuestions: number;
  totalCorrect: number;
  totalStudyTime: number;
  streak: number;
  longestStreak: number;
  lastStudyAt?: string;
  categoryStats: Record<Category, { total: number; correct: number }>;
  /** 日別学習ログ: "YYYY-MM-DD" → 解答数（ヒートマップ用） */
  dailyLog?: Record<string, number>;
  /** ストリークフリーズ: 最後に使用した日 */
  streakFreezeUsedAt?: string;
  /** 利用可能なストリークフリーズ数（週1回自動補充、最大2） */
  streakFreezeCount?: number;
  /** ストリークフリーズ最終補充日 */
  streakFreezeRefilledAt?: string;
}

// ============================================================
// 実績バッジ（ゲーミフィケーション）
// ============================================================

export type AchievementId =
  // ストリーク系
  | 'streak_3' | 'streak_7' | 'streak_14' | 'streak_30' | 'streak_60' | 'streak_100'
  // 解答数系
  | 'answers_10' | 'answers_50' | 'answers_100' | 'answers_300' | 'answers_500' | 'answers_1000'
  // 正答率系
  | 'accuracy_70' | 'accuracy_80' | 'accuracy_90'
  // 模擬試験系
  | 'exam_first' | 'exam_pass' | 'exam_40' | 'exam_45' | 'exam_perfect'
  // クエスト系
  | 'quest_first' | 'quest_10' | 'quest_30' | 'quest_all'
  // カテゴリ制覇系
  | 'master_kenri' | 'master_takkengyoho' | 'master_horei' | 'master_tax'
  // 一問一答系
  | 'quick_50' | 'quick_100' | 'quick_500';

export interface Achievement {
  id: AchievementId;
  title: string;
  description: string;
  icon: string;
  condition: string;        // 達成条件の表示テキスト
  unlockedAt?: string;      // 達成日時（ISO string）
}

// ============================================================
// 模擬試験履歴
// ============================================================

export interface ExamResult {
  id: string;
  date: string;             // ISO string
  score: number;            // 正答数
  total: number;            // 出題数（通常50）
  passed: boolean;
  byCategory: Record<Category, { total: number; correct: number }>;
  durationSec: number;      // 所要時間（秒）
  /** この模試"直前"の本試験予測点 (個人γ較正の素データ)。Phase1.5 以降の模試のみ持つ */
  predictedBefore?: number;
}
