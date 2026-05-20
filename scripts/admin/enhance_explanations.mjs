#!/usr/bin/env node
/**
 * enhance_explanations.mjs
 *
 * priority_review.json（audit_explanation_depth.mjs の出力）を読み込み、
 * 各問題の explanation / choiceExplanations / statementExplanations を
 * Claude Haiku で再生成して「合格率日本一の品質」に底上げする。
 *
 * 安全性:
 *  - choices / correctIndex / statements / statementAnswers は変更しない
 *  - 法令の正確性は最優先。古法情報（民法改正前、宅建業法旧法等）の混入禁止
 *  - 著作権セーフ（過去問・市販書籍の文言コピー禁止 → オリジナル解説のみ）
 *  - 結果は JSON で保存し、人間レビュー後に手動で適用する
 *
 * モード:
 *  --dry-run   : 5問サンプルだけ実行して before/after を表示（API 呼ばない）
 *                ※ API_KEY を使わないモック（決定的な擬似拡張）で動作確認
 *  --sample=N  : 先頭 N 問だけ Claude API で実行
 *  --apply     : 全 priority_review.json をAPI実行し、結果を enhanced_results.json へ
 *  --in=PATH   : 入力 JSON
 *  --out=PATH  : 出力 JSON
 *
 * Usage:
 *   node scripts/admin/enhance_explanations.mjs --dry-run
 *   node scripts/admin/enhance_explanations.mjs --sample=5
 *   node scripts/admin/enhance_explanations.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');

const args = process.argv.slice(2);
const argMap = Object.fromEntries(
  args
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=');
      return [k, v ?? true];
    })
);

const DRY = !!argMap['dry-run'];
const APPLY = !!argMap.apply;
const SAMPLE = argMap.sample ? parseInt(argMap.sample, 10) : null;
const IN_REL = argMap.in || 'scripts/admin/priority_review.json';
const OUT_REL = argMap.out || 'scripts/admin/enhanced_results.json';
const IN = path.join(ROOT, IN_REL);
const OUT = path.join(ROOT, OUT_REL);

if (!DRY && !APPLY && SAMPLE == null) {
  console.error(
    'Specify one of: --dry-run | --sample=N | --apply\n' +
      '  --dry-run : 5問だけモック拡張（APIなし、コストゼロ）\n' +
      '  --sample=N: 先頭 N 問だけ Claude API\n' +
      '  --apply   : 全件を Claude API'
  );
  process.exit(1);
}

// .env.local から ANTHROPIC_API_KEY を読み込み
// [Bugfix] 値が "..." で囲まれている場合はクオートを除去する。
// 旧: m[2] = `"sk-ant-..."` (クオート付き) → API リクエストで 401 になっていた
function loadEnv() {
  const candidates = ['.env.local', '.env.production', '.env'];
  for (const f of candidates) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    const txt = fs.readFileSync(p, 'utf8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) {
        let val = m[2].trim();
        // 前後のクオートを除去 (シングル / ダブル両対応)
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        process.env[m[1]] = val;
      }
    }
  }
}
loadEnv();

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ENHANCE_MODEL || 'claude-haiku-4-5';

// ─────────────────────────────────────────────────────────────
// プロンプト
// ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `あなたは宅地建物取引士試験の最高レベルの講師です。受験生が試験で「なぜそう答えるか」を完全に理解し、再現できる解説を書きます。

【絶対遵守ルール】
1. 法令の正確性 100%。2026年5月時点で施行されている現行法に基づく。古い法律（民法改正前など）の知識は絶対に書かない。
2. 著作権セーフ。市販書籍や過去問解説の文言を絶対に転用しない。完全オリジナルの言い回しで書く。
3. 与えられた choices / correctIndex / statements / statementAnswers は絶対に変更しない。これらの正誤判断と矛盾する解説は書かない。
4. 受験生が誤解しやすいポイントを先回り（「混同注意」など）。
5. 関連する条文番号・判例（「最判昭○○・○・○」等）は具体的に記載するが、条文番号だけ書いて内容説明をしない解説は禁止。

【目標品質】
- explanation: 200〜400字程度。論理の流れ「(1)問題の論点 → (2)正解の根拠条文・判例 → (3)誤りの選択肢の落とし穴」を含める。
- choiceExplanations: 各選択肢 60〜120字。「正しい」「誤り」だけで終わらせず、必ず「なぜそうか」の理由を入れる。条文番号 + 内容要点 + 受験ポイントの順。
- 個数問題（questionFormat:count）の場合は statementExplanations を強化。各記述が独立した論点であることを示す。

出力は厳密な JSON のみ。前置きや後書きの説明は一切書かない。`;

function buildUserPrompt(q) {
  const o = q.original;
  const fmt = o.questionFormat || 'standard';
  let body = '';
  body += '【問題ID】' + q.id + '\n';
  body += '【カテゴリ】' + q.category + '\n';
  body += '【問題形式】' + fmt + '\n';
  body += '【タグ】' + (o.tags || []).join(', ') + '\n\n';
  body += '【問題文】\n' + o.text + '\n\n';
  body += '【選択肢】\n';
  (o.choices || []).forEach((c, i) => {
    body +=
      String(i + 1) +
      (i === o.correctIndex ? ' [正解]' : '') +
      '. ' +
      c +
      '\n';
  });
  if (fmt === 'count' || fmt === 'combination') {
    body += '\n【記述ア〜エ】\n';
    (o.statements || []).forEach((s, i) => {
      const label = ['ア', 'イ', 'ウ', 'エ'][i] || String(i + 1);
      body += `${label}: ${s}\n`;
    });
    body += '\n（このフォーマットでは statementExplanations を強化してください）\n';
  }
  body += '\n【既存の浅い解説】\n';
  body += 'explanation: ' + (o.explanation || '(空)') + '\n';
  body += 'choiceExplanations:\n';
  (o.choiceExplanations || []).forEach((c, i) => {
    body += `  [${i}] ${c}\n`;
  });

  body += `\n【出力フォーマット】次の JSON 形式で出力してください（コードフェンス不要）:
{
  "explanation": "...",
  "choiceExplanations": ["...", "...", "...", "..."]${
    fmt === 'count' || fmt === 'combination'
      ? ',\n  "statementExplanations": ["...", "...", "...", "..."]'
      : ''
  }
}`;
  return body;
}

// ─────────────────────────────────────────────────────────────
// API 呼び出し
// ─────────────────────────────────────────────────────────────
async function callClaude(q) {
  if (!API_KEY) throw new Error('ANTHROPIC_API_KEY not set');
  const body = {
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(q) }],
  };
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = (data.content || []).map((c) => c.text || '').join('');
  // JSON 抽出
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart < 0 || jsonEnd < 0)
    throw new Error('No JSON in response: ' + text.slice(0, 200));
  const json = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  return {
    explanation: json.explanation,
    choiceExplanations: json.choiceExplanations,
    statementExplanations: json.statementExplanations,
    usage: data.usage || null,
  };
}

// dry-run 用モック: API は呼ばず、構造だけ提示。コストゼロ。
function mockEnhance(q) {
  const o = q.original;
  const correct = o.correctIndex;
  const fmt = o.questionFormat || 'standard';
  const enhanced = {
    explanation:
      `[MOCK拡張デモ] 本問の論点は「${(o.tags || [])[0] || '宅建知識'}」。` +
      `正解は選択肢${correct + 1}。` +
      `(1)条文・判例の根拠を明示、(2)誤答選択肢の落とし穴を示し、` +
      `(3)受験生が混同しやすいポイント（例: 善意/悪意、登記の要否）を先回りで指摘する` +
      `200〜400字構成にAI拡張する想定。実際のAPI呼び出しは --sample=N または --apply で実行。`,
    choiceExplanations: (o.choices || []).map(
      (_, i) =>
        `[MOCK ${i === correct ? '○正' : '×誤'}] 選択肢${i + 1}は` +
        `${i === correct ? '正解。理由: 条文Xに合致し、要件A・B・Cを満たすため。' : '誤り。理由: 〜の点で条文Xに反する／〜の判例（最判○○）と矛盾するため。'}` +
        `受験対策: 〜と混同しないこと。（60〜120字想定）`
    ),
  };
  if (fmt === 'count' || fmt === 'combination') {
    enhanced.statementExplanations = (o.statements || []).map(
      (_, i) =>
        `[MOCK 記述${['ア', 'イ', 'ウ', 'エ'][i]}] 各記述独立の論点として、` +
        `根拠条文・判例を具体的に示す解説に拡張。`
    );
  }
  return enhanced;
}

// ─────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(IN)) {
    console.error(
      `Input not found: ${IN_REL}\nRun audit first: node scripts/admin/audit_explanation_depth.mjs`
    );
    process.exit(1);
  }
  const input = JSON.parse(fs.readFileSync(IN, 'utf8'));
  const items = input.top || [];
  const targets = SAMPLE != null ? items.slice(0, SAMPLE) : DRY ? items.slice(0, 5) : items;

  const mode = DRY
    ? `DRY-RUN(mock, ${targets.length}件)`
    : APPLY
      ? `APPLY(API, ${targets.length}件)`
      : `SAMPLE(API, ${targets.length}件)`;
  console.log(`\n=== enhance_explanations [${mode}] ===`);
  console.log(`model: ${MODEL}`);
  console.log(`API_KEY: ${API_KEY ? '(set)' : '(missing)'}`);
  console.log(`input : ${IN_REL}`);
  console.log(`output: ${OUT_REL}\n`);

  const results = [];
  let idx = 0;
  for (const q of targets) {
    idx++;
    process.stdout.write(`[${idx}/${targets.length}] ${q.id} ... `);
    try {
      const enhanced = DRY ? mockEnhance(q) : await callClaude(q);
      results.push({
        id: q.id,
        file: q.file,
        score: q.score,
        before: {
          explanation: q.original.explanation,
          choiceExplanations: q.original.choiceExplanations,
          statementExplanations: q.original.statementExplanations,
        },
        after: {
          explanation: enhanced.explanation,
          choiceExplanations: enhanced.choiceExplanations,
          statementExplanations: enhanced.statementExplanations,
        },
        usage: enhanced.usage || null,
      });
      console.log('OK');
    } catch (e) {
      console.log('ERR ' + e.message);
      results.push({
        id: q.id,
        file: q.file,
        score: q.score,
        error: e.message,
      });
    }
  }

  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        mode,
        model: MODEL,
        count: results.length,
        results,
      },
      null,
      2
    ),
    'utf8'
  );
  console.log(`\nWrote: ${OUT_REL}`);

  // before/after サマリー（先頭5問）
  console.log(`\n=== Sample before/after (first 5) ===`);
  for (const r of results.slice(0, 5)) {
    if (r.error) {
      console.log(`\n--- ${r.id} ERROR: ${r.error} ---`);
      continue;
    }
    console.log(`\n--- ${r.id} (score=${r.score}) ---`);
    console.log(
      `[BEFORE explanation ${(r.before.explanation || '').length}字]\n  ${r.before.explanation}`
    );
    console.log(
      `[AFTER  explanation ${(r.after.explanation || '').length}字]\n  ${r.after.explanation}`
    );
    console.log(`[BEFORE choiceExplanations]`);
    (r.before.choiceExplanations || []).forEach((c, i) =>
      console.log(`  [${i}] ${c}`)
    );
    console.log(`[AFTER  choiceExplanations]`);
    (r.after.choiceExplanations || []).forEach((c, i) =>
      console.log(`  [${i}] ${c}`)
    );
  }

  if (DRY) {
    console.log(
      `\n(dry-run) APIを呼ばずモックで構造を提示しました。` +
        `\n次に: --sample=5 で5問だけ実APIテスト → --apply で全件実行。`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
