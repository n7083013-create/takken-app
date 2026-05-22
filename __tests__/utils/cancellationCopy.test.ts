// ============================================================
// utils/cancellationCopy.ts テスト
// ============================================================
//
// 世界基準の解約防止フロー (Spotify / Netflix / NYT / Audible) の
// 設計原則がコードに焼き込まれていることを保証する:
//
// 1. 全 6 理由に対し counter-offer が定義されている (網羅性)
// 2. 「お引き止め」ではなく「ユーザー状況に合った代替案」(文言検証)
// 3. 最終確認画面では「失うもの」を明示 (loss aversion)
// 4. ドメイン固有の文脈 (試験は年1回・10月) が反映されている

import {
  REASON_CHOICES,
  getCounterOffer,
  getFinalConfirmCopy,
  offerEventLabel,
  type CancellationReason,
  type OfferType,
} from '../../utils/cancellationCopy';

describe('REASON_CHOICES - 解約理由の選択肢', () => {
  test('6 種類の理由が定義されている', () => {
    expect(REASON_CHOICES).toHaveLength(6);
  });

  test('すべての理由に label / emoji がある', () => {
    for (const c of REASON_CHOICES) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.emoji.length).toBeGreaterThan(0);
    }
  });

  test('宅建士アプリ固有の理由「試験が終わった」が含まれる', () => {
    const found = REASON_CHOICES.find((c) => c.reason === 'exam_done');
    expect(found).toBeDefined();
    expect(found?.label).toContain('試験');
  });

  test('宅建士アプリ固有の理由「今年は諦めた」が含まれる', () => {
    const found = REASON_CHOICES.find((c) => c.reason === 'gave_up');
    expect(found).toBeDefined();
  });

  test('reason の値はすべてユニーク', () => {
    const reasons = REASON_CHOICES.map((c) => c.reason);
    const uniq = new Set(reasons);
    expect(uniq.size).toBe(reasons.length);
  });
});

describe('getCounterOffer - 理由別 counter-offer 生成', () => {
  const allReasons: CancellationReason[] = [
    'too_expensive',
    'exam_done',
    'gave_up',
    'no_time',
    'features',
    'other',
  ];

  // ----------------------------------------------------------
  // 網羅性: すべての理由に offer が定義されている
  // ----------------------------------------------------------

  test.each(allReasons)('reason=%s に対し counter-offer が返る', (reason) => {
    const offer = getCounterOffer(reason);
    expect(offer).toBeDefined();
    expect(offer.title.length).toBeGreaterThan(0);
    expect(offer.subtitle.length).toBeGreaterThan(0);
    expect(offer.acceptCta.length).toBeGreaterThan(0);
    expect(offer.declineCta.length).toBeGreaterThan(0);
    expect(offer.emoji.length).toBeGreaterThan(0);
  });

  // ----------------------------------------------------------
  // 文言の方向性: ドメイン文脈が反映されている
  // ----------------------------------------------------------

  test('too_expensive (monthly) は年額アップグレード提案 (Spotify trade-up)', () => {
    // [2026-05-22] 1ヶ月半額 は手動運用負担で廃止。
    // 代わりに「年額にアップグレード ¥498/月相当」を自動提案する世界基準パターン。
    const o = getCounterOffer('too_expensive');
    expect(o.offerType).toBe('upgrade_to_annual');
    const text = `${o.title} ${o.subtitle} ${o.acceptCta}`;
    expect(text).toMatch(/年額|¥498|49%/);
  });

  test('exam_done (monthly) は no_offer + 残り期間案内 (一時停止廃止)', () => {
    // [2026-05-22] 一時停止 (pause_subscription) は手動運用負担で廃止 → no_offer に
    const o = getCounterOffer('exam_done');
    expect(o.offerType).toBe('no_offer');
    const text = `${o.title} ${o.subtitle}`;
    expect(text).toMatch(/次回更新日|来年|学習データ|残り期間/);
  });

  test('gave_up は応援メッセージで no_offer (2026-05-22 14日延長を廃止)', () => {
    // 14日無料延長 offer は手動運用負担が大きいため廃止。
    // 代わりに「次回更新日まで全機能使える」+ 励まし文言を提示。
    const o = getCounterOffer('gave_up');
    expect(o.offerType).toBe('no_offer');
    const text = `${o.title} ${o.subtitle}`;
    expect(text).toMatch(/諦める|来年|続け/);
  });

  test('gave_up の subtitle に「次回更新日まで使える」が含まれる (loss aversion)', () => {
    const o = getCounterOffer('gave_up');
    expect(o.subtitle).toMatch(/次回更新日|来年|学習データ/);
  });

  test('no_time (monthly) も no_offer + 残り期間案内 (短期一時停止廃止)', () => {
    // [2026-05-22] pause_short は手動運用負担で廃止 → no_offer に
    const o = getCounterOffer('no_time');
    expect(o.offerType).toBe('no_offer');
    expect(`${o.title} ${o.subtitle}`).toMatch(/次回更新日|残り期間|余裕/);
  });

  test('features は要望ヒアリングへ誘導 (30日返金保証は削除)', () => {
    const o = getCounterOffer('features');
    expect(o.offerType).toBe('support_form');
    expect(`${o.title} ${o.subtitle} ${o.acceptCta}`).toMatch(/要望|改善|教えて/);
    // [2026-05-22] 30日返金保証の文言は削除 (手動運用が必要・現状未対応)
    expect(o.subtitle).not.toMatch(/30日.*返金|返金保証/);
  });

  test('other は offer なし (no_offer)', () => {
    const o = getCounterOffer('other');
    expect(o.offerType).toBe('no_offer');
  });

  // ----------------------------------------------------------
  // declineCta: 「やはり解約する」相当の文言
  // ----------------------------------------------------------

  test('decline CTA は「解約」を含む (other を除く)', () => {
    const reasonsWithOffer: CancellationReason[] = [
      'too_expensive',
      'exam_done',
      'gave_up',
      'no_time',
      'features',
    ];
    for (const r of reasonsWithOffer) {
      const o = getCounterOffer(r);
      expect(o.declineCta).toMatch(/解約/);
    }
  });

  // ----------------------------------------------------------
  // リグレッション防止: 否定的・押し付けがましい文言を出さない
  // ----------------------------------------------------------

  test('押し付けがましい文言 (「絶対に」「必ず」) を含まない', () => {
    for (const r of [
      'too_expensive',
      'exam_done',
      'gave_up',
      'no_time',
      'features',
      'other',
    ] as CancellationReason[]) {
      const o = getCounterOffer(r);
      const text = `${o.title} ${o.subtitle} ${o.acceptCta}`;
      expect(text).not.toMatch(/絶対に|必ず[^成]/); // 「必ず合格」のような前向き文言は OK
    }
  });
});

describe('getFinalConfirmCopy - 最終確認画面の文言', () => {
  const copy = getFinalConfirmCopy();

  test('タイトルに「本当に」を含む (loss aversion 強化)', () => {
    expect(copy.title).toContain('本当に');
  });

  test('「失うもの」リスト (losses) が 3 件以上', () => {
    expect(copy.losses.length).toBeGreaterThanOrEqual(3);
  });

  test('全 losses が具体的 (820/100/模試など数字や固有名を含む)', () => {
    const text = copy.losses.join(' ');
    expect(text).toMatch(/820|100|模試|模擬試験|AI/);
  });

  test('primaryCta は「続ける」系 (= 解約しない選択)', () => {
    expect(copy.primaryCta).toMatch(/続ける|やはり/);
  });

  test('secondaryCta は「解約」系', () => {
    expect(copy.secondaryCta).toMatch(/解約/);
  });
});

describe('offerEventLabel - GA4 イベントラベル', () => {
  test('snake_case をそのまま返す', () => {
    const types: OfferType[] = [
      'half_price_one_month',
      'pause_subscription',
      'free_extension_14days',
      'pause_short',
      'support_form',
      'no_offer',
    ];
    for (const t of types) {
      expect(offerEventLabel(t)).toBe(t);
    }
  });
});

describe('getCounterOffer - 年額/月額 で分岐 (2026-05 追加)', () => {
  // ----------------------------------------------------------
  // 年額契約者には「半額」が意味をなさないので別文言
  // ----------------------------------------------------------

  test('annual + too_expensive は「既に最大割引」と説明 (no_offer)', () => {
    const o = getCounterOffer('too_expensive', 'annual');
    expect(o.offerType).toBe('no_offer');
    expect(o.title).toMatch(/最大割引|割引|49%/);
  });

  test('monthly + too_expensive は年額アップグレード (Spotify trade-up)', () => {
    // [2026-05-22] 半額 (手動運用) → 年額アップグレード (自動・PayPal Revise) に変更
    const o = getCounterOffer('too_expensive', 'monthly');
    expect(o.offerType).toBe('upgrade_to_annual');
    expect(o.title).toMatch(/年額|49%/);
  });

  // ----------------------------------------------------------
  // 年額契約者は「一時停止」が不要 (残り期間を使えばよい)
  // 月額契約者も 2026-05-22 以降は手動運用負担廃止のため no_offer
  // ----------------------------------------------------------

  test('annual + exam_done は「残り期間で次の試験まで使える」', () => {
    const o = getCounterOffer('exam_done', 'annual');
    expect(o.offerType).toBe('no_offer');
    const text = `${o.title} ${o.subtitle}`;
    expect(text).toMatch(/残り|次の試験|来年/);
  });

  test('monthly + exam_done は no_offer + 残り期間案内 (一時停止廃止)', () => {
    // [2026-05-22] pause_subscription 廃止 → no_offer
    const o = getCounterOffer('exam_done', 'monthly');
    expect(o.offerType).toBe('no_offer');
  });

  test('annual + gave_up は「来年に向けて使い続けて」', () => {
    const o = getCounterOffer('gave_up', 'annual');
    expect(o.offerType).toBe('no_offer');
    const text = `${o.title} ${o.subtitle}`;
    expect(text).toMatch(/来年|残り期間/);
  });

  test('annual + no_time は「いつでも戻れる」', () => {
    const o = getCounterOffer('no_time', 'annual');
    expect(o.offerType).toBe('no_offer');
    expect(`${o.title} ${o.subtitle}`).toMatch(/戻れ|残り期間/);
  });

  // ----------------------------------------------------------
  // features (機能不満) は cycle 不問
  // ----------------------------------------------------------

  test('features は annual/monthly どちらも support_form offer', () => {
    expect(getCounterOffer('features', 'monthly').offerType).toBe('support_form');
    expect(getCounterOffer('features', 'annual').offerType).toBe('support_form');
  });

  // ----------------------------------------------------------
  // 後方互換: billingCycle 省略時は monthly 扱い
  // ----------------------------------------------------------

  test('billingCycle 省略時は monthly と同じ結果', () => {
    expect(getCounterOffer('too_expensive')).toEqual(
      getCounterOffer('too_expensive', 'monthly'),
    );
    expect(getCounterOffer('exam_done')).toEqual(
      getCounterOffer('exam_done', 'monthly'),
    );
  });

  // ----------------------------------------------------------
  // すべての理由 × 両 cycle で valid な offer が返る (網羅性)
  // ----------------------------------------------------------

  test.each([
    ['too_expensive', 'monthly'],
    ['too_expensive', 'annual'],
    ['exam_done', 'monthly'],
    ['exam_done', 'annual'],
    ['gave_up', 'monthly'],
    ['gave_up', 'annual'],
    ['no_time', 'monthly'],
    ['no_time', 'annual'],
    ['features', 'monthly'],
    ['features', 'annual'],
    ['other', 'monthly'],
    ['other', 'annual'],
  ] as const)('reason=%s cycle=%s で全フィールドが埋まる', (reason, cycle) => {
    const o = getCounterOffer(reason, cycle);
    expect(o.title.length).toBeGreaterThan(0);
    expect(o.subtitle.length).toBeGreaterThan(0);
    expect(o.acceptCta.length).toBeGreaterThan(0);
    expect(o.declineCta.length).toBeGreaterThan(0);
    expect(o.emoji.length).toBeGreaterThan(0);
  });
});
