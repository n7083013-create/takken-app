// ============================================================
// utils/paywallCopy.ts テスト
// ============================================================
//
// 世界基準のペイウォール UX 原則がコードに焼き込まれていることを保証する。
// 文言を変えるなら必ずテストも更新する = 「言い回し劣化」を CI で防止。
//
// 守りたい性質:
// 1. すべての主 CTA に「7日間無料」または「無料」の trial-first 文言が含まれる
// 2. 4 択 / 一問一答の上限は Celebration (🎉) で始まる (否定文言禁止)
// 3. 機能ロック (模試/AI分析) は具体的価値 (50問・120分 / 合格予測) を含む
// 4. streak shield は 2 日未満は null、2 日以上で表示

import { getLimitCopy, streakShieldText } from '../../utils/paywallCopy';

describe('getLimitCopy - モード別文言生成', () => {
  // ----------------------------------------------------------
  // 1. すべての主 CTA に trial-first 文言が入っている
  // ----------------------------------------------------------

  describe('全 CTA に trial-first 文言が含まれる', () => {
    const allModes = [
      { kind: 'daily_limit_question', streak: 0 } as const,
      { kind: 'daily_limit_quickquiz', streak: 0 } as const,
      { kind: 'feature_locked_exam' } as const,
      { kind: 'feature_locked_ai_analysis' } as const,
      { kind: 'daily_limit_ai_chat', usedToday: 3, limit: 3 } as const,
    ];

    test.each(allModes)('mode=$kind の primaryCta に「無料」が含まれる', (mode) => {
      const copy = getLimitCopy(mode);
      expect(copy.primaryCta).toMatch(/無料/);
    });

    test('主 CTA は決して「PREMIUMプランを見る」のような passive 文言にしない', () => {
      const allCopies = allModes.map((m) => getLimitCopy(m));
      for (const c of allCopies) {
        expect(c.primaryCta).not.toBe('PREMIUMプランを見る');
        expect(c.primaryCta).not.toBe('プレミアムに登録する');
      }
    });
  });

  // ----------------------------------------------------------
  // 2. 4 択 / 一問一答は Celebration (🎉) ファースト
  // ----------------------------------------------------------

  describe('Celebration ファースト (上限到達は祝う)', () => {
    test('4 択問題の上限到達は 🎉 で始まる', () => {
      const c = getLimitCopy({ kind: 'daily_limit_question', streak: 0 });
      expect(c.emoji).toBe('🎉');
      expect(c.title).toContain('達成');
    });

    test('一問一答の上限到達も 🎉 で始まる', () => {
      const c = getLimitCopy({ kind: 'daily_limit_quickquiz', streak: 0 });
      expect(c.emoji).toBe('🎉');
      expect(c.title).toContain('達成');
    });

    test('否定文言 (「使い切り」「無料枠」)はタイトルに含めない (4択)', () => {
      const c = getLimitCopy({ kind: 'daily_limit_question', streak: 0 });
      expect(c.title).not.toContain('使い切り');
      expect(c.title).not.toContain('無料枠');
    });

    test('否定文言はタイトルに含めない (一問一答)', () => {
      const c = getLimitCopy({ kind: 'daily_limit_quickquiz', streak: 0 });
      expect(c.title).not.toContain('使い切り');
      expect(c.title).not.toContain('無料枠');
    });
  });

  // ----------------------------------------------------------
  // 3. 機能ロックは具体的価値を含む
  // ----------------------------------------------------------

  describe('機能ロック画面の具体的価値訴求', () => {
    test('模試: 「50問」「120分」「時間配分」のいずれかが含まれる', () => {
      const c = getLimitCopy({ kind: 'feature_locked_exam' });
      const text = `${c.title} ${c.subtitle}`;
      expect(text).toMatch(/50問|120分|時間配分/);
    });

    test('AI 分析: 「合格予測」「弱点」のいずれかが含まれる', () => {
      const c = getLimitCopy({ kind: 'feature_locked_ai_analysis' });
      const text = `${c.title} ${c.subtitle}`;
      expect(text).toMatch(/合格予測|弱点|最短ルート/);
    });
  });

  // ----------------------------------------------------------
  // 4. streak shield の閾値
  // ----------------------------------------------------------

  describe('streakShield (sunk-cost 訴求)', () => {
    test('streak=0 は null (表示価値が低い)', () => {
      expect(streakShieldText(0)).toBeNull();
    });

    test('streak=1 も null', () => {
      expect(streakShieldText(1)).toBeNull();
    });

    test('streak=2 で初表示', () => {
      const t = streakShieldText(2);
      expect(t).not.toBeNull();
      expect(t).toContain('2日');
    });

    test('streak=3 以上は通常表示', () => {
      const t = streakShieldText(3);
      expect(t).toContain('3日');
      expect(t).toContain('🔥');
    });

    test('streak=7 以上で「勢いを止めない」追加メッセージ', () => {
      const t = streakShieldText(7);
      expect(t).toContain('勢い');
    });

    test('streak=30 以上で「偉業」', () => {
      const t = streakShieldText(30);
      expect(t).toContain('偉業');
    });
  });

  // ----------------------------------------------------------
  // 5. AI チャット inline 表示
  // ----------------------------------------------------------

  describe('AI チャット inline 上限', () => {
    test('使用回数 / 上限 を表示', () => {
      const c = getLimitCopy({ kind: 'daily_limit_ai_chat', usedToday: 3, limit: 3 });
      expect(c.title).toContain('3/3');
    });

    test('Premium の上限値 (100回) で表示', () => {
      const c = getLimitCopy({ kind: 'daily_limit_ai_chat', usedToday: 100, limit: 100 });
      expect(c.title).toContain('100/100');
    });

    test('CTA は「100回/日」など具体数字を含む', () => {
      const c = getLimitCopy({ kind: 'daily_limit_ai_chat', usedToday: 3, limit: 3 });
      expect(c.primaryCta).toContain('100');
    });
  });

  // ----------------------------------------------------------
  // 6. データ統合: モードに連動して streakShield を組み込む
  // ----------------------------------------------------------

  describe('streakShield は daily_limit 系のみに付く', () => {
    test('daily_limit_question + streak=5 → shield あり', () => {
      const c = getLimitCopy({ kind: 'daily_limit_question', streak: 5 });
      expect(c.streakShield).not.toBeNull();
      expect(c.streakShield).toContain('5日');
    });

    test('daily_limit_quickquiz + streak=5 → shield あり', () => {
      const c = getLimitCopy({ kind: 'daily_limit_quickquiz', streak: 5 });
      expect(c.streakShield).not.toBeNull();
    });

    test('daily_limit_question + streak=0 → shield なし', () => {
      const c = getLimitCopy({ kind: 'daily_limit_question', streak: 0 });
      expect(c.streakShield).toBeNull();
    });

    test('feature_locked_exam には streakShield 自体が undefined (型レベルで存在しない)', () => {
      const c = getLimitCopy({ kind: 'feature_locked_exam' });
      expect(c.streakShield).toBeUndefined();
    });

    test('daily_limit_ai_chat にも streakShield は付かない', () => {
      const c = getLimitCopy({ kind: 'daily_limit_ai_chat', usedToday: 3, limit: 3 });
      expect(c.streakShield).toBeUndefined();
    });
  });

  // ----------------------------------------------------------
  // 7. 各モードの emoji が定義されている (空文字や undefined 防止)
  // ----------------------------------------------------------

  test('全モードの emoji が空文字でない', () => {
    const modes = [
      { kind: 'daily_limit_question', streak: 0 } as const,
      { kind: 'daily_limit_quickquiz', streak: 0 } as const,
      { kind: 'feature_locked_exam' } as const,
      { kind: 'feature_locked_ai_analysis' } as const,
      { kind: 'daily_limit_ai_chat', usedToday: 3, limit: 3 } as const,
    ];
    for (const m of modes) {
      const c = getLimitCopy(m);
      expect(c.emoji.length).toBeGreaterThan(0);
    }
  });
});
