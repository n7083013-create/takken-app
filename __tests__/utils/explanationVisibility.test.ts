// ============================================================
// utils/explanationVisibility.ts テスト
// ============================================================
//
// 仕様 (2026-05 ユーザー報告に基づく):
// - 個数問題・組み合わせ問題は statementExplanations (ア/イ/ウ/エ) で完結する
// - 数字選択肢 (1つ/2つ/3つ/4つ) に解説を重複表示しない (ごちゃごちゃ防止)
// - 通常 4 択 (standard) では従来通り choiceExplanations を表示
// - 未解答時は何も返さない (null)
// - データが空文字 / undefined のとき null を返す

import {
  isCountOrCombinationQuestion,
  shouldShowChoiceExplanation,
  getStatementExplanation,
} from '../../utils/explanationVisibility';

describe('isCountOrCombinationQuestion - 個数/組み合わせ問題判定', () => {
  test('count は true', () => {
    expect(isCountOrCombinationQuestion({ questionFormat: 'count' })).toBe(true);
  });

  test('combination は true', () => {
    expect(isCountOrCombinationQuestion({ questionFormat: 'combination' })).toBe(true);
  });

  test('standard は false', () => {
    expect(isCountOrCombinationQuestion({ questionFormat: 'standard' })).toBe(false);
  });

  test('questionFormat 未指定 (undefined) は false (通常 4 択扱い)', () => {
    expect(isCountOrCombinationQuestion({ questionFormat: undefined })).toBe(false);
  });
});

describe('shouldShowChoiceExplanation - 選択肢解説の表示判定', () => {
  // ----------------------------------------------------------
  // 未解答時は常に非表示
  // ----------------------------------------------------------

  describe('未解答時', () => {
    test('未解答なら standard でも null', () => {
      expect(
        shouldShowChoiceExplanation(
          {
            questionFormat: 'standard',
            choiceExplanations: ['A 解説', 'B 解説', 'C 解説', 'D 解説'],
          },
          false,
          0,
        ),
      ).toBeNull();
    });

    test('未解答なら count でも null', () => {
      expect(
        shouldShowChoiceExplanation(
          {
            questionFormat: 'count',
            choiceExplanations: ['1つ', '2つ', '3つ', '4つ'],
          },
          false,
          1,
        ),
      ).toBeNull();
    });
  });

  // ----------------------------------------------------------
  // 個数/組み合わせ問題は解答後も非表示
  // ----------------------------------------------------------

  describe('個数/組み合わせ問題 (解答後も非表示)', () => {
    test('count 問題は解答後も null (statementExplanations で完結するため)', () => {
      expect(
        shouldShowChoiceExplanation(
          {
            questionFormat: 'count',
            choiceExplanations: ['1つ目', '2つ目', '3つ目', '4つ目'],
          },
          true,
          0,
        ),
      ).toBeNull();
    });

    test('combination 問題は解答後も null', () => {
      expect(
        shouldShowChoiceExplanation(
          {
            questionFormat: 'combination',
            choiceExplanations: ['ア・イ', 'ア・ウ', 'イ・エ', 'ウ・エ'],
          },
          true,
          2,
        ),
      ).toBeNull();
    });

    test('count 問題で choiceIndex 全パターンを試しても null', () => {
      const q = {
        questionFormat: 'count' as const,
        choiceExplanations: ['1つ', '2つ', '3つ', '4つ'] as [string, string, string, string],
      };
      [0, 1, 2, 3].forEach((idx) => {
        expect(shouldShowChoiceExplanation(q, true, idx)).toBeNull();
      });
    });
  });

  // ----------------------------------------------------------
  // 通常 4 択 (standard) は表示
  // ----------------------------------------------------------

  describe('通常 4 択 (standard, 解答後)', () => {
    const q = {
      questionFormat: 'standard' as const,
      choiceExplanations: ['ア解説', 'イ解説', 'ウ解説', 'エ解説'] as [
        string,
        string,
        string,
        string,
      ],
    };

    test('解答後 standard は対応する choiceExplanation を返す', () => {
      expect(shouldShowChoiceExplanation(q, true, 0)).toBe('ア解説');
      expect(shouldShowChoiceExplanation(q, true, 1)).toBe('イ解説');
      expect(shouldShowChoiceExplanation(q, true, 2)).toBe('ウ解説');
      expect(shouldShowChoiceExplanation(q, true, 3)).toBe('エ解説');
    });

    test('questionFormat 未指定 (undefined) は standard 扱いで表示', () => {
      expect(
        shouldShowChoiceExplanation(
          {
            questionFormat: undefined,
            choiceExplanations: ['x', 'y', 'z', 'w'],
          },
          true,
          0,
        ),
      ).toBe('x');
    });
  });

  // ----------------------------------------------------------
  // データ欠損時は null
  // ----------------------------------------------------------

  describe('データ欠損', () => {
    test('choiceExplanations が undefined なら null', () => {
      expect(
        shouldShowChoiceExplanation(
          { questionFormat: 'standard', choiceExplanations: undefined },
          true,
          0,
        ),
      ).toBeNull();
    });

    test('該当 index のテキストが空文字なら null', () => {
      expect(
        shouldShowChoiceExplanation(
          {
            questionFormat: 'standard',
            choiceExplanations: ['', 'B', 'C', 'D'],
          },
          true,
          0,
        ),
      ).toBeNull();
    });

    test('該当 index のテキストが空白のみなら null (trim 後 0 文字)', () => {
      expect(
        shouldShowChoiceExplanation(
          {
            questionFormat: 'standard',
            choiceExplanations: ['   \n  ', 'B', 'C', 'D'],
          },
          true,
          0,
        ),
      ).toBeNull();
    });
  });
});

describe('getStatementExplanation - 個別 statement 解説の取得', () => {
  test('解答後でデータがあれば取得できる', () => {
    expect(
      getStatementExplanation(
        { statementExplanations: ['ア解説', 'イ解説', 'ウ解説', 'エ解説'] },
        true,
        0,
      ),
    ).toBe('ア解説');
  });

  test('未解答なら null', () => {
    expect(
      getStatementExplanation(
        { statementExplanations: ['ア解説', 'イ解説', 'ウ解説', 'エ解説'] },
        false,
        0,
      ),
    ).toBeNull();
  });

  test('statementExplanations が undefined なら null', () => {
    expect(
      getStatementExplanation({ statementExplanations: undefined }, true, 0),
    ).toBeNull();
  });

  test('該当 index が空文字なら null', () => {
    expect(
      getStatementExplanation({ statementExplanations: ['', 'B', 'C', 'D'] }, true, 0),
    ).toBeNull();
  });

  test('該当 index が空白のみなら null', () => {
    expect(
      getStatementExplanation(
        { statementExplanations: ['   ', 'B', 'C', 'D'] },
        true,
        0,
      ),
    ).toBeNull();
  });

  test('全 statement (ア〜エ) を取得できる', () => {
    const q = { statementExplanations: ['A', 'B', 'C', 'D'] };
    expect(getStatementExplanation(q, true, 0)).toBe('A');
    expect(getStatementExplanation(q, true, 1)).toBe('B');
    expect(getStatementExplanation(q, true, 2)).toBe('C');
    expect(getStatementExplanation(q, true, 3)).toBe('D');
  });
});
