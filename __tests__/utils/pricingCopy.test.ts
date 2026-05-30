// ============================================================
// utils/pricingCopy.ts テスト
// ============================================================
//
// 2026-05 年額プラン (¥5,980/年) 追加に伴う価格表示・割引率の正当性を CI で保証。
// 価格やラベル文言の劣化を防ぐリグレッションテスト。

import {
  formatYen,
  planPriceLabel,
  planPriceWithUnit,
  monthlyEquivalent,
  monthlyEquivalentLabel,
  annualSavingsPercent,
  annualSavingsLabel,
  annualSavingsYen,
  ctaLabel,
  postTrialDescription,
  annualBadgeLabel,
  monthlyTotalForYear,
} from '../../utils/pricingCopy';
import { PLAN_PRICES } from '../../types';

describe('formatYen - 円表示フォーマット', () => {
  test('3 桁: ¥980', () => {
    expect(formatYen(980)).toBe('¥980');
  });

  test('4 桁: 千の位カンマ ¥5,980', () => {
    expect(formatYen(5980)).toBe('¥5,980');
  });

  test('5 桁: ¥11,760', () => {
    expect(formatYen(11760)).toBe('¥11,760');
  });

  test('0: ¥0', () => {
    expect(formatYen(0)).toBe('¥0');
  });
});

describe('planPriceLabel - プラン絶対価格', () => {
  test('monthly: ¥980', () => {
    expect(planPriceLabel('monthly')).toBe('¥980');
  });

  test('annual: ¥5,980', () => {
    expect(planPriceLabel('annual')).toBe('¥5,980');
  });

  test('PLAN_PRICES と一致する (SSOT 保証)', () => {
    expect(planPriceLabel('monthly')).toBe(formatYen(PLAN_PRICES.monthly));
    expect(planPriceLabel('annual')).toBe(formatYen(PLAN_PRICES.annual));
  });
});

describe('planPriceWithUnit - 単位付き価格', () => {
  test('monthly: ¥980/月', () => {
    expect(planPriceWithUnit('monthly')).toBe('¥980/月');
  });

  test('annual: ¥5,980/年', () => {
    expect(planPriceWithUnit('annual')).toBe('¥5,980/年');
  });
});

describe('monthlyEquivalent - 月換算', () => {
  test('monthly はそのまま 980', () => {
    expect(monthlyEquivalent('monthly')).toBe(980);
  });

  test('annual は floor(5980/12) = 498', () => {
    expect(monthlyEquivalent('annual')).toBe(498);
  });
});

describe('monthlyEquivalentLabel - 月換算ラベル', () => {
  test('monthly: ¥980/月', () => {
    expect(monthlyEquivalentLabel('monthly')).toBe('¥980/月');
  });

  test('annual: ¥498/月相当 (年額からの換算であることが分かる)', () => {
    expect(monthlyEquivalentLabel('annual')).toBe('¥498/月相当');
  });
});

describe('annualSavingsPercent - 年額の割引率', () => {
  test('現状の価格 (¥980/月 / ¥5,980/年) で 49%', () => {
    // (11760 - 5980) / 11760 = 0.49149... → 49% (四捨五入)
    expect(annualSavingsPercent()).toBe(49);
  });

  test('45% 以上であること (攻めた割引率の保証 = Headspace/Duolingo 水準)', () => {
    expect(annualSavingsPercent()).toBeGreaterThanOrEqual(45);
  });

  test('60% 以下であること (利益率を守る上限)', () => {
    expect(annualSavingsPercent()).toBeLessThanOrEqual(60);
  });
});

describe('annualSavingsLabel - savings 表示文言', () => {
  test('「約 49% OFF」を含む', () => {
    expect(annualSavingsLabel()).toBe('約 49% OFF');
  });

  test('「OFF」キーワードを含む (UI 検索性のため)', () => {
    expect(annualSavingsLabel()).toContain('OFF');
  });
});

describe('annualSavingsYen - 円換算 savings', () => {
  test('¥11,760 - ¥5,980 = ¥5,780', () => {
    expect(annualSavingsYen()).toBe(5780);
  });
});

describe('monthlyTotalForYear - 月額×12 (比較用)', () => {
  test('¥11,760', () => {
    expect(monthlyTotalForYear()).toBe(11760);
  });
});

describe('ctaLabel - CTA 文言', () => {
  test('monthly: 「7日間無料で始める」', () => {
    expect(ctaLabel('monthly')).toBe('7日間無料で始める');
  });

  test('annual: 「7日間無料で始める」(同じ trial 経験)', () => {
    expect(ctaLabel('annual')).toBe('7日間無料で始める');
  });

  test('両モードで「無料」を必ず含む (trial-first CTA 原則)', () => {
    expect(ctaLabel('monthly')).toMatch(/無料/);
    expect(ctaLabel('annual')).toMatch(/無料/);
  });
});

describe('postTrialDescription - トライアル後課金説明', () => {
  test('monthly に「月額 ¥980」を含む', () => {
    const d = postTrialDescription('monthly');
    expect(d).toContain('¥980');
    expect(d).toContain('月額');
  });

  test('annual に「年額 ¥5,980」と「¥498/月相当」を併記 (price anchoring)', () => {
    const d = postTrialDescription('annual');
    expect(d).toContain('¥5,980');
    expect(d).toContain('年額');
    expect(d).toContain('¥498');
  });

  test('両モードで「8日目から自動更新」相当の文言が含まれる', () => {
    expect(postTrialDescription('monthly')).toMatch(/8日目|自動更新/);
    expect(postTrialDescription('annual')).toMatch(/8日目|自動更新/);
  });
});

describe('annualBadgeLabel - 年額タブのバッジ', () => {
  // [2026-05-22] バッジは narrow phone で2行折返し「年額」と重なるため1行に収める。
  // [2026-05-30] 景表法 (No.1表示の客観的根拠なし) のため「人気No.1」→「おすすめ」に是正。
  //   割引率は ¥498/月相当 サブラベルで伝わるため、中立的な推奨表現に振る。
  test('「おすすめ」を含む (景表法是正: 根拠なき No.1 表現を撤去)', () => {
    expect(annualBadgeLabel()).toContain('おすすめ');
  });

  test('1行に収まる短さ (10 文字以内)', () => {
    expect(annualBadgeLabel().length).toBeLessThanOrEqual(10);
  });
});

describe('リグレッション防止: 価格データの不変条件', () => {
  test('年額は月額×12 より必ず安い (= savings > 0)', () => {
    expect(PLAN_PRICES.annual).toBeLessThan(PLAN_PRICES.monthly * 12);
  });

  test('月額は ¥0 より大きい', () => {
    expect(PLAN_PRICES.monthly).toBeGreaterThan(0);
  });

  test('年額は月額より大きい (1 回課金で 1 年分の権利)', () => {
    expect(PLAN_PRICES.annual).toBeGreaterThan(PLAN_PRICES.monthly);
  });
});
