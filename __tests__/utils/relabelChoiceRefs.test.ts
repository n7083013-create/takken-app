import { relabelChoiceRefs as relabel } from '../../utils/relabelChoiceRefs';

// shuffledMap[displayPos] = origIdx。relabel は origIdx の表示位置(indexOf)→ラベル(A-E)へ。
describe('relabelChoiceRefs (解説の選択肢番号をシャッフル表示位置に整合)', () => {
  it('単一の番号を表示位置ラベルへ変換', () => {
    // map[2,0,3,1]: 選択肢3=origIdx2 → 表示位置0 → A
    expect(relabel('選択肢3が正しい', [2, 0, 3, 1])).toBe('選択肢Aが正しい');
  });

  it('複数参照をそれぞれ変換', () => {
    // map[3,2,1,0]: 選択肢1=orig0→位置3(D) / 選択肢4=orig3→位置0(A)
    expect(relabel('選択肢1は誤り、選択肢4が正しい', [3, 2, 1, 0])).toBe('選択肢Dは誤り、選択肢Aが正しい');
  });

  it('全角数字・「肢」表記も対応', () => {
    expect(relabel('肢２は誤り', [1, 0, 2, 3])).toBe('肢Aは誤り'); // orig1→位置0(A)
    expect(relabel('選択肢３が正解', [0, 1, 2, 3])).toBe('選択肢Cが正解'); // orig2→位置2(C)
  });

  it('恒等マップ(非シャッフル)でも数字→位置ラベルに統一', () => {
    expect(relabel('選択肢1が正しい', [0, 1, 2, 3])).toBe('選択肢Aが正しい');
  });

  // [2026-06-16] 解答後は displayMap=恒等マップ で本文を元データ順ラベルに揃える。
  // 選択肢N(元順) がそのまま N番目ラベル(A/B/C/D)になり、列挙順も A→B→C→D で並ぶ。
  it('解答後の恒等マップ: 本文の選択肢列挙が元順 A→B→C→D で揃う', () => {
    const identity = [0, 1, 2, 3];
    expect(relabel('選択肢1は誤り、選択肢2は正しい、選択肢3と選択肢4も誤り', identity)).toBe(
      '選択肢Aは誤り、選択肢Bは正しい、選択肢Cと選択肢Dも誤り',
    );
  });

  it('選択肢以外の数字は絶対に変換しない(誤変換防止)', () => {
    expect(relabel('民法第3条により、3年間で3つの要件', [2, 0, 3, 1])).toBe('民法第3条により、3年間で3つの要件');
    expect(relabel('選択肢12', [0, 1, 2, 3])).toBe('選択肢12'); // 2桁はマッチさせない
  });

  it('shuffledMap が空/未指定なら原文を返す', () => {
    expect(relabel('選択肢3が正しい', [])).toBe('選択肢3が正しい');
    expect(relabel('選択肢3', undefined)).toBe('選択肢3');
    expect(relabel(undefined, [0, 1, 2, 3])).toBe('');
  });

  it('選択肢数を超える番号(マップ外)は安全に原文維持', () => {
    // 3択 map[2,0,1]: 選択肢4=orig3 は存在せず indexOf=-1 → 原文
    expect(relabel('選択肢4は誤り', [2, 0, 1])).toBe('選択肢4は誤り');
  });
});
