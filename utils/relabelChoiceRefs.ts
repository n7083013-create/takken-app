// ============================================================
// 解説文の選択肢番号 → シャッフル後の表示ラベルへ変換
// ------------------------------------------------------------
// 【背景・重大バグ(2026-06-10)】
//   問題の選択肢は位置暗記防止のため毎回シャッフル表示するが、
//   解説(explanation/choiceExplanations)は「選択肢3が正しい」のように
//   データ上の元の番号(1-based)で書かれている。シャッフルで表示位置が
//   変わると「選択肢4は誤りと書いてあるのに画面では正解」のように
//   解説と画面が矛盾し、正確性への信頼を即失う。
//
// 【対策】表示時に解説中の「選択肢N」「肢N」(N=元順1-based)を、
//   現在のシャッフル表示位置のラベル(A〜E)へ動的変換する。データは不変。
//   shuffledMap[displayPos] = origIdx (表示位置→元index) を逆引きする。
//   例: 解説「選択肢3」(元順3=origIdx 2) が表示位置 index3 にある → 「選択肢D」。
//
// 誤変換防止: 「選択肢」または「肢」直後の 1〜5 の1桁数字のみ対象
//   (2桁・数量詞『3つ』等は対象外。実データに該当0件を確認済)。
// ============================================================

const LABELS = ['A', 'B', 'C', 'D', 'E'] as const;
const ZEN = '１２３４５';

/**
 * 解説テキスト中の選択肢番号参照を、シャッフル後の表示ラベルへ変換する。
 * @param text 解説本文 (explanation / choiceExplanations の要素)
 * @param shuffledMap 表示位置→元index のマッピング (例: [2,0,3,1])
 * @returns 変換後テキスト。shuffledMap が無効なら原文をそのまま返す。
 */
export function relabelChoiceRefs(text: string | undefined | null, shuffledMap: number[] | undefined | null): string {
  if (!text) return text ?? '';
  if (!shuffledMap || shuffledMap.length === 0) return text;
  return text.replace(/(選択肢|肢)([1-5１-５])(?![0-9０-９])/g, (full, prefix: string, numRaw: string) => {
    const half = ZEN.indexOf(numRaw) >= 0 ? String(ZEN.indexOf(numRaw) + 1) : numRaw;
    const origIdx = parseInt(half, 10) - 1;
    if (Number.isNaN(origIdx)) return full;
    const displayPos = shuffledMap.indexOf(origIdx);
    // マップ外(=その選択肢が今表示されていない/番号が選択肢数を超える)は安全側で原文維持。
    if (displayPos < 0 || displayPos >= LABELS.length) return full;
    return `${prefix}${LABELS[displayPos]}`;
  });
}
