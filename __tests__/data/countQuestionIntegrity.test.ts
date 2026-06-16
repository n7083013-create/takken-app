// ============================================================
// 個数問題の整合性 全問チェック (2026-06-10 作問ミス再発防止)
// ------------------------------------------------------------
// 背景: takkengyoho-014/044 で statementAnswers(各記述の正誤)と
//   correctIndex(正解の個数)が食い違う作問ミスを発見。
//   「正しいものはいくつ/誤っているものはいくつ/適合しないものはいくつ」型で、
//   正解選択肢が指す数 と statementAnswers の該当数 が一致することを全問保証する。
// ============================================================
import { ALL_QUESTIONS } from '../../data';

const ZEN = '０１２３４５６７８９';
const toHalf = (s: string) => (s || '').replace(/[０-９]/g, (c) => String(ZEN.indexOf(c)));
const KANJI: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5 };

/** 選択肢テキスト(例「3つ」「2」「なし」)から個数を抽出。判定不能は null。 */
function extractCount(choiceText: string): number | null {
  const s = toHalf(choiceText);
  const m = s.match(/([0-9])/);
  if (m) return parseInt(m[1], 10);
  for (const k in KANJI) if (s.includes(k)) return KANJI[k];
  if (/ない|無し|なし/.test(s)) return 0;
  return null;
}

describe('個数問題: 正解の個数 == statementAnswers の該当数 (全問)', () => {
  it('「正しい/適切/適合する」数を問う型 と「誤り/不適切/適合しない」数を問う型の両方で一致', () => {
    const bad: string[] = [];
    for (const q of ALL_QUESTIONS) {
      if (q.questionFormat !== 'count' || !q.statements || !q.statementAnswers) continue;
      const trueN = q.statementAnswers.filter(Boolean).length;
      const falseN = q.statementAnswers.length - trueN;
      const asksWrong = /誤|不適切|適合しない|正しくない/.test(q.text);
      const asksRight = /正しい|適切|適合する/.test(q.text);
      // 設問の問い方が一意に判定できる場合のみ検査(誤検出防止)
      let expected: number | null = null;
      if (asksWrong && !asksRight) expected = falseN;
      else if (asksRight && !asksWrong) expected = trueN;
      else continue;
      const n = extractCount(q.choices[q.correctIndex] ?? '');
      if (n !== null && n !== expected) {
        bad.push(`${q.id}: 正解"${q.choices[q.correctIndex]}"=${n} ≠ ${asksWrong ? '誤り' : '正しい'}の数${expected}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
