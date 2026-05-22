// ============================================================
// paywall.tsx の stale closure リグレッション検知 (静的解析)
// ============================================================
//
// 2026-05-22 に発生した実バグの再発防止:
//   `handleStartTrial = useCallback(async () => { ... }, [user, session, router, verifySubscription])`
//   と billingCycle を deps に含めずに API に送信していたため、
//   初回マウントの 'annual' で memo 化されたまま月額タブを選んでも 'annual' が送られていた。
//
// ESLint react-hooks/exhaustive-deps が無いため、ソース文字列のパターンマッチで検出する。

import fs from 'node:fs';
import path from 'node:path';

const PAYWALL_PATH = path.join(__dirname, '..', '..', 'app', 'paywall.tsx');
const SRC = fs.readFileSync(PAYWALL_PATH, 'utf8');

describe('paywall.tsx - handleStartTrial の stale closure 防止', () => {
  test('handleStartTrial が定義されている', () => {
    expect(SRC).toMatch(/const handleStartTrial = useCallback/);
  });

  test('handleStartTrial 内で billingCycle を読んでいる', () => {
    // body: JSON.stringify({ billingCycle }) を含む
    expect(SRC).toMatch(/billingCycle\s*\}/);
  });

  test('handleStartTrial の deps に billingCycle が含まれている', () => {
    // useCallback(..., [..., billingCycle]) のパターンを探す
    // handleStartTrial の useCallback ブロック内 (大まかに) で deps に billingCycle が無いと失敗
    //
    // 簡易戦略: handleStartTrial 〜 次の `const ` か `}, [` までを抽出し
    // 最後の deps 配列に 'billingCycle' を含むかチェック。
    const startIdx = SRC.indexOf('const handleStartTrial = useCallback');
    expect(startIdx).toBeGreaterThan(-1);

    // handleStartTrial の useCallback 閉じ括弧 + deps を探す
    // パターン: `}, [...]);` で最初に出てくるもの
    const after = SRC.slice(startIdx);
    const depsMatch = after.match(/\},\s*\[([^\]]*)\]\)/);
    expect(depsMatch).toBeTruthy();

    const deps = depsMatch![1];
    // billingCycle が deps 配列に含まれていることを保証
    expect(deps).toMatch(/billingCycle/);
  });
});

describe('paywall.tsx - subscribe フロー堅牢性', () => {
  test('alreadyActive のレスポンスをハンドリングしている (silent fail 防止)', () => {
    // 2026-05-22: 既存 active sub があると approvalUrl 無しで返るが、
    // フロント側で window.location.href = undefined となり何も起きなかった
    expect(SRC).toMatch(/alreadyActive/);
  });

  test('approvalUrl が無い場合のフォールバックがある', () => {
    // !data.approvalUrl のガードがあること
    expect(SRC).toMatch(/!data\.approvalUrl|approvalUrl\s*\)/);
  });
});
