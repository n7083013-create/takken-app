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

  test('too_expensive は「半額」オファー', () => {
    const o = getCounterOffer('too_expensive');
    expect(o.offerType).toBe('half_price_one_month');
    const text = `${o.title} ${o.subtitle} ${o.acceptCta}`;
    expect(text).toMatch(/半額|¥490/);
  });

  test('exam_done は「一時停止」オファー (試験は年1回の文脈)', () => {
    const o = getCounterOffer('exam_done');
    expect(o.offerType).toBe('pause_subscription');
    const text = `${o.title} ${o.subtitle}`;
    expect(text).toMatch(/一時停止|休止|来年|次の試験/);
  });

  test('gave_up は応援メッセージ + 30日無料延長', () => {
    const o = getCounterOffer('gave_up');
    expect(o.offerType).toBe('free_extension_30days');
    const text = `${o.title} ${o.subtitle}`;
    expect(text).toMatch(/30日|延長|諦める|来年/);
  });

  test('no_time も一時停止 (短期版)', () => {
    const o = getCounterOffer('no_time');
    expect(o.offerType).toBe('pause_short');
    expect(`${o.title} ${o.subtitle}`).toMatch(/一時停止|休止/);
  });

  test('features は要望ヒアリングへ誘導', () => {
    const o = getCounterOffer('features');
    expect(o.offerType).toBe('support_form');
    expect(`${o.title} ${o.subtitle} ${o.acceptCta}`).toMatch(/要望|改善|教えて/);
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
      'free_extension_30days',
      'pause_short',
      'support_form',
      'no_offer',
    ];
    for (const t of types) {
      expect(offerEventLabel(t)).toBe(t);
    }
  });
});
