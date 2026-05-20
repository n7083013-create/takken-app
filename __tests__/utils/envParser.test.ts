// ============================================================
// utils/envParser.ts テスト
// ============================================================
//
// 仕様の核心 (Bugfix 2026-05):
// - .env のクオート付き値はクオートを剥がして渡す
// - 同じロジックが scripts/admin/enhance_explanations.mjs にも inline 実装
//   されており、両者の挙動を一致させるためのリグレッションテスト

import { parseEnvLine, parseEnvFile } from '../../utils/envParser';

describe('parseEnvLine - 1 行の env パース', () => {
  // ----------------------------------------------------------
  // 基本ケース: クオートなし
  // ----------------------------------------------------------

  test('クオートなしの値はそのまま', () => {
    expect(parseEnvLine('API_KEY=sk-ant-abc123')).toEqual({
      key: 'API_KEY',
      value: 'sk-ant-abc123',
    });
  });

  test('値が空の場合', () => {
    expect(parseEnvLine('API_KEY=')).toEqual({ key: 'API_KEY', value: '' });
  });

  // ----------------------------------------------------------
  // クオート除去 (このバグで 401 が出ていた)
  // ----------------------------------------------------------

  describe('クオート除去 (Bugfix 2026-05)', () => {
    test('ダブルクオート付きの値からクオートを除去する', () => {
      expect(parseEnvLine('API_KEY="sk-ant-abc123"')).toEqual({
        key: 'API_KEY',
        value: 'sk-ant-abc123',
      });
    });

    test('シングルクオート付きの値からクオートを除去する', () => {
      expect(parseEnvLine("API_KEY='sk-ant-abc123'")).toEqual({
        key: 'API_KEY',
        value: 'sk-ant-abc123',
      });
    });

    test('リグレッション: クオートが残ったら API リクエストで 401 になる', () => {
      // この値が "sk-ant-..." のまま Anthropic API に渡ると invalid x-api-key で
      // 401 が返る。テストは値に余計なクオートが残っていないことを保証する。
      const result = parseEnvLine('ANTHROPIC_API_KEY="sk-ant-test"');
      expect(result?.value.startsWith('"')).toBe(false);
      expect(result?.value.endsWith('"')).toBe(false);
      expect(result?.value).toBe('sk-ant-test');
    });

    test('前後の空白を trim してからクオート判定', () => {
      expect(parseEnvLine('API_KEY=  "sk-ant-abc"  ')).toEqual({
        key: 'API_KEY',
        value: 'sk-ant-abc',
      });
    });
  });

  // ----------------------------------------------------------
  // エッジケース: 片方しかクオートがない壊れた入力
  // ----------------------------------------------------------

  describe('壊れた入力 (片方クオート)', () => {
    test('左クオートのみ → 剥がさない (入力を尊重)', () => {
      expect(parseEnvLine('API_KEY="abc')).toEqual({ key: 'API_KEY', value: '"abc' });
    });

    test('右クオートのみ → 剥がさない', () => {
      expect(parseEnvLine('API_KEY=abc"')).toEqual({ key: 'API_KEY', value: 'abc"' });
    });

    test('ダブルとシングルが混在 → 剥がさない', () => {
      // ダブル "..." またはシングル '...' のペアのみ剥がす
      expect(parseEnvLine(`API_KEY="abc'`)).toEqual({ key: 'API_KEY', value: `"abc'` });
    });

    test('値が " のみ (長さ 1) → そのまま', () => {
      expect(parseEnvLine('API_KEY="')).toEqual({ key: 'API_KEY', value: '"' });
    });
  });

  // ----------------------------------------------------------
  // 該当しない行
  // ----------------------------------------------------------

  describe('該当しない行', () => {
    test('空行は null', () => {
      expect(parseEnvLine('')).toBeNull();
    });

    test('# コメント行は null', () => {
      expect(parseEnvLine('# this is a comment')).toBeNull();
    });

    test('小文字キーは null (.env 標準: 大文字+アンダースコアのみ)', () => {
      expect(parseEnvLine('lowercase=value')).toBeNull();
    });

    test('= を含まない行は null', () => {
      expect(parseEnvLine('NO_EQUALS_HERE')).toBeNull();
    });
  });

  // ----------------------------------------------------------
  // 値に = を含む特殊ケース
  // ----------------------------------------------------------

  test('値に = を含んでもパース可能 (Base64 など)', () => {
    expect(parseEnvLine('JWT=eyJhbGciOiJIUzI1NiJ9=')).toEqual({
      key: 'JWT',
      value: 'eyJhbGciOiJIUzI1NiJ9=',
    });
  });
});

describe('parseEnvFile - ファイル全体パース', () => {
  test('複数行を Record に変換', () => {
    const content = `API_KEY=sk-ant-abc
SECRET="hush"
DEBUG=true`;
    expect(parseEnvFile(content)).toEqual({
      API_KEY: 'sk-ant-abc',
      SECRET: 'hush',
      DEBUG: 'true',
    });
  });

  test('コメント・空行を無視', () => {
    const content = `# secret keys

API_KEY=value1
# another comment
OTHER=value2
`;
    expect(parseEnvFile(content)).toEqual({
      API_KEY: 'value1',
      OTHER: 'value2',
    });
  });

  test('同名キーは後勝ち', () => {
    const content = `KEY=first
KEY=second`;
    expect(parseEnvFile(content)).toEqual({ KEY: 'second' });
  });

  test('実際の .env.local 想定: クオート付きキーが正しく剥がれる', () => {
    const content = `# auto-generated
ANTHROPIC_API_KEY="sk-ant-real-key"
ENHANCE_MODEL='claude-haiku-4-5'
`;
    const parsed = parseEnvFile(content);
    expect(parsed.ANTHROPIC_API_KEY).toBe('sk-ant-real-key');
    expect(parsed.ENHANCE_MODEL).toBe('claude-haiku-4-5');
    // クオートが残っていないこと
    expect(parsed.ANTHROPIC_API_KEY).not.toContain('"');
    expect(parsed.ENHANCE_MODEL).not.toContain("'");
  });
});
