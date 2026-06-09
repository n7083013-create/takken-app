// ============================================================
// StreakCelebration 表示ライフサイクル Unit Test
// ============================================================
// 背景: 2026-06-09 ユーザー報告
//   「ストリーク祝福（連続学習日数のお祝いポップ）が一瞬で表示されて消え、
//    文字が読めない」(実機/Web 両方)。
//
// 根本原因:
//   ① HomeScreen は HomeScreenWrapper 配下で onboarding/sync 確定時に
//      再マウントされ、初回の祝福が unmount されてフラッシュして消える。
//   ② 祝福にフェードアウトが無く return null で即消滅。
//   ③ 表示中に stats.streak が同期で変わると milestone=undefined となり
//      その瞬間に return null で消える。
//
// JSX を含む AnswerFeedback.tsx は ts-jest(node) では描画 evaluate できないため、
// 修正後の構造保証をソース静的検査で担保する (Input.test.tsx と同方針)。

import fs from 'fs';
import path from 'path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'components', 'AnswerFeedback.tsx'),
  'utf-8',
);

// StreakCelebration 関数本体だけを抽出 (他コンポーネントの誤マッチ防止)
function streakBody(): string {
  const start = SRC.indexOf('export function StreakCelebration');
  expect(start).toBeGreaterThan(-1);
  // 次の top-level const (styles 定義) までを本体とみなす
  const after = SRC.indexOf('\nconst streakStyles', start);
  expect(after).toBeGreaterThan(start);
  return SRC.slice(start, after);
}

describe('StreakCelebration - 表示ライフサイクル (回帰: 一瞬で消える)', () => {
  test('③対策: 表示開始時に milestone をキャプチャして state で保持する', () => {
    const body = streakBody();
    // shown state を持ち、emoji/title/sub をキャプチャしている
    expect(body).toMatch(/setShown\(\s*\{\s*emoji:\s*milestone\.emoji/);
    expect(body).toMatch(/const \[shown, setShown\]/);
    // 描画は live な milestone ではなく キャプチャした shown を使う
    expect(body).toMatch(/\{shown\.emoji\}/);
    expect(body).toMatch(/\{shown\.title\}/);
    expect(body).toMatch(/\{shown\.sub\}/);
  });

  test('③対策: streak を effect の依存配列に含めない (同期で消えない)', () => {
    const body = streakBody();
    // メイン effect の deps は [visible] のみ。
    expect(body).toMatch(/\}, \[visible\]\);/);
    // 旧バグ実装の [visible, milestone] が残っていないこと
    expect(body).not.toMatch(/\[visible, milestone\]/);
  });

  test('②対策: フェードアウトしてから onDismiss を呼ぶ (突然消えない)', () => {
    const body = streakBody();
    expect(body).toMatch(/dismissWithFade/);
    // opacity を 0 へアニメ → 完了コールバックで onDismiss
    expect(body).toMatch(/toValue:\s*0[\s\S]*?STREAK_FADE_OUT_MS/);
  });

  test('最重要: タップで閉じられる (オーバーレイに onTouchEnd)', () => {
    const body = streakBody();
    expect(body).toMatch(/onTouchEnd=\{dismissWithFade\}/);
    expect(body).toMatch(/pointerEvents="auto"/);
    expect(body).toMatch(/タップして閉じる/);
  });

  test('読了に十分な表示時間 (>=3.5秒)', () => {
    const m = SRC.match(/STREAK_DISPLAY_MS\s*=\s*(\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(3500);
  });

  test('二重発火防止 (closingRef ガード)', () => {
    const body = streakBody();
    expect(body).toMatch(/if \(closingRef\.current\) return;/);
  });

  test('animationLevel=off は「最初から出さない」(一瞬チラ見えゼロ)', () => {
    const body = streakBody();
    // off 時は setShown せず即 close、描画も return null
    expect(body).toMatch(/level === 'off'/);
    expect(body).toMatch(/if \(level === 'off'\) return null;/);
  });
});
