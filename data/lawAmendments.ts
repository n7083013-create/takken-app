// ============================================================
// 法改正レジストリ
// 宅建試験に影響する主要な法改正を管理
// 問題の鮮度チェック・法改正アラート表示に使用
// ============================================================

import { LawAmendment } from '../types';

/**
 * 2024〜2026年の主要法改正一覧
 * 新しい法改正が施行されたら、ここに追加してOTAで配信
 */
export const LAW_AMENDMENTS: LawAmendment[] = [
  // ── 民法関連 ──
  {
    id: 'minpo-2020',
    lawName: '民法（債権法）改正',
    effectiveDate: '2020-04-01',
    summary: '債権法の大幅改正。消滅時効の統一（知った時から5年/権利行使可能時から10年）、契約不適合責任、定型約款、保証人保護の強化等',
    affectedCategories: ['kenri'],
    affectedTags: ['消滅時効', '契約不適合', '債務不履行', '保証', '錯誤', '危険負担', '解除'],
    examImpact: 'high',
  },
  {
    id: 'minpo-2023-inheritance',
    lawName: '民法（相続法）改正 — 相続土地国庫帰属法',
    effectiveDate: '2023-04-27',
    summary: '不要な相続土地を国に返還できる制度。一定の要件の下で法務大臣の承認を得て国庫に帰属',
    affectedCategories: ['kenri'],
    affectedTags: ['相続', '土地', '国庫帰属'],
    examImpact: 'medium',
  },
  {
    id: 'minpo-2025-koseishousho',
    lawName: '民法改正 — 公正証書遺言の証人要件緩和',
    effectiveDate: '2025-10-01',
    summary: '公正証書遺言の作成時、証人の出席要件が緩和。リモート立会いが可能に',
    affectedCategories: ['kenri'],
    affectedTags: ['遺言', '公正証書', '相続'],
    examImpact: 'medium',
  },

  // ── 宅建業法関連 ──
  {
    id: 'takkengyoho-2022-digital',
    lawName: '宅建業法改正 — 電子化対応',
    effectiveDate: '2022-05-18',
    summary: '重要事項説明書・契約書面の電子交付が可能に。IT重説の本格運用開始',
    affectedCategories: ['takkengyoho'],
    affectedTags: ['重要事項説明', '37条書面', '電子交付', 'IT重説'],
    examImpact: 'high',
  },

  // ── 建築基準法関連 ──
  {
    id: 'kenchiku-2025',
    lawName: '建築基準法改正 — 4号特例廃止・新分類',
    effectiveDate: '2025-04-01',
    summary: '旧4号建築物（木造2階建て等）の確認申請特例を廃止。新2号・新3号建築物に再分類。審査期間を35日に延長',
    affectedCategories: ['horei_seigen'],
    affectedTags: ['建築確認', '4号特例', '4号建築物', '新2号建築物', '新3号建築物', '法改正2025'],
    examImpact: 'high',
  },

  // ── 都市計画法・その他法令 ──
  {
    id: 'morido-2023',
    lawName: '盛土規制法（旧・宅地造成等規制法改正）',
    effectiveDate: '2023-05-26',
    summary: '宅地造成等規制法が「盛土規制法」に改題・改正。規制区域の拡大、罰則強化',
    affectedCategories: ['horei_seigen'],
    affectedTags: ['宅地造成', '盛土規制', '法改正2023'],
    examImpact: 'high',
  },

  // ── 税制関連（年度更新が必要） ──
  {
    id: 'tax-2024-jutaku',
    lawName: '令和6年度税制改正 — 住宅ローン控除',
    effectiveDate: '2024-01-01',
    summary: '住宅ローン控除の控除率0.7%は維持。合計所得金額2,000万円以下要件。省エネ基準適合住宅のみ新築で適用',
    affectedCategories: ['tax_other'],
    affectedTags: ['住宅ローン控除', '所得税'],
    examImpact: 'high',
  },
  {
    id: 'tax-fudousan-tokubetsu',
    lawName: '不動産取得税の特例税率延長',
    effectiveDate: '2024-04-01',
    summary: '不動産取得税の特例税率3%（本則4%）が令和9年3月31日まで延長',
    affectedCategories: ['tax_other'],
    affectedTags: ['不動産取得税', '特例税率'],
    examImpact: 'medium',
  },
  {
    id: 'tax-gift-2026',
    lawName: '住宅取得等資金の贈与税非課税措置延長',
    effectiveDate: '2024-01-01',
    summary: '住宅取得資金の贈与税非課税措置が令和8年12月31日まで延長。省エネ住宅1,000万円、その他500万円',
    affectedCategories: ['tax_other'],
    affectedTags: ['贈与税', '住宅取得', '非課税'],
    examImpact: 'medium',
  },
];

/**
 * 問題の鮮度チェック
 * - expiresAt が過ぎている → 期限切れ（要レビュー）
 * - lastVerifiedAt が1年以上前 → 古い（要確認）
 * - needsReview が true → 手動フラグ済み
 */
export type QuestionFreshness = 'fresh' | 'aging' | 'expired' | 'flagged';

export function checkQuestionFreshness(question: {
  lastVerifiedAt?: string;
  expiresAt?: string;
  needsReview?: boolean;
}): QuestionFreshness {
  if (question.needsReview) return 'flagged';

  const now = Date.now();

  // 特例の期限切れチェック
  if (question.expiresAt) {
    const expires = new Date(question.expiresAt).getTime();
    if (now > expires) return 'expired';
  }

  // 検証日の古さチェック（365日以上前 = aging）
  if (question.lastVerifiedAt) {
    const verified = new Date(question.lastVerifiedAt).getTime();
    const daysSinceVerified = (now - verified) / (1000 * 60 * 60 * 24);
    if (daysSinceVerified > 365) return 'aging';
  }

  return 'fresh';
}

/**
 * 問題に関連する法改正を取得
 */
export function getRelatedAmendments(questionTags: string[]): LawAmendment[] {
  return LAW_AMENDMENTS.filter((amendment) =>
    amendment.affectedTags.some((tag) => questionTags.includes(tag)),
  );
}

/**
 * 今年の試験に特に重要な法改正を取得
 */
export function getHighImpactAmendments(): LawAmendment[] {
  return LAW_AMENDMENTS.filter((a) => a.examImpact === 'high');
}
