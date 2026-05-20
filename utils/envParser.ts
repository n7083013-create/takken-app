// ============================================================
// .env ファイル解析の純関数
// ============================================================
//
// 経緯:
// scripts/admin/enhance_explanations.mjs の loadEnv() で
// 値が "sk-ant-..." のようにダブルクオート付きのまま process.env に
// 入れられて API リクエストが 401 になるバグがあった (2026-05)。
// 同じパースロジックを script (.mjs) とテスト (.ts) で二重に持つのは
// 同期がずれるリスクが高いため、ここに canonical 実装を置く。
//
// script 側 (enhance_explanations.mjs) は同じ仕様を inline で持っているが、
// 本ファイルがその仕様書として機能する。両方を変更する場合は両方更新すること。

export interface EnvKeyValue {
  key: string;
  value: string;
}

/**
 * .env スタイルの 1 行をパースし、{key, value} を返す。
 * 該当しない行 (コメント・空行・KEY=value 形式でない) は null。
 *
 * 仕様:
 * - キーは大文字英字とアンダースコアのみ ([A-Z_]+)
 * - 値の前後の空白は trim
 * - 値が "..." または '...' で囲まれていればクオートを除去
 * - 片方しかクオートがない場合 (例: `KEY="abc`) はそのまま (壊れた入力を尊重)
 * - = を含む値は最初の = 以降を全部値として扱う
 *
 * @example
 *   parseEnvLine('API_KEY=sk-ant-abc')       // → { key: 'API_KEY', value: 'sk-ant-abc' }
 *   parseEnvLine('API_KEY="sk-ant-abc"')     // → { key: 'API_KEY', value: 'sk-ant-abc' }
 *   parseEnvLine("API_KEY='sk-ant-abc'")     // → { key: 'API_KEY', value: 'sk-ant-abc' }
 *   parseEnvLine('# comment')                // → null
 *   parseEnvLine('')                         // → null
 */
export function parseEnvLine(line: string): EnvKeyValue | null {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (!m) return null;
  let val = m[2].trim();
  if (
    (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
    (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
  ) {
    val = val.slice(1, -1);
  }
  return { key: m[1], value: val };
}

/**
 * .env ファイルの全文をパースしてキー / 値の Map を返す。
 * 同名キーの場合、後勝ち (=ファイル下方の定義が優先) する点に注意。
 */
export function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const kv = parseEnvLine(line);
    if (kv) out[kv.key] = kv.value;
  }
  return out;
}
