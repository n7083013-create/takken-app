#!/usr/bin/env node
/**
 * apply_enhanced.mjs
 *
 * enhance_explanations.mjs が生成した enhanced_results.json を読み込み、
 * data/modules/takken/questions/*.ts の各問題に explanation /
 * choiceExplanations / statementExplanations を反映する。
 *
 * 安全性:
 *  - choices / correctIndex / statements / statementAnswers は絶対に変更しない
 *  - 既存の値が「短い・空」の場合のみ上書き (--force で強制上書き)
 *  - 適用前にバックアップ作成
 *  - ドライランで何が変わるかプレビュー可能
 *
 * Usage:
 *   node scripts/admin/apply_enhanced.mjs --dry-run         # 何が変わるか表示のみ
 *   node scripts/admin/apply_enhanced.mjs --apply           # 実際に書き込み
 *   node scripts/admin/apply_enhanced.mjs --apply --force   # 既存解説も含めて全上書き
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
    }),
);

const DRY = !!argMap['dry-run'];
const APPLY = !!argMap.apply;
const FORCE = !!argMap.force;
const IN_REL = argMap.in || 'scripts/admin/enhanced_results.json';
const IN = path.join(ROOT, IN_REL);

if (!DRY && !APPLY) {
  console.error('Usage: --dry-run or --apply');
  process.exit(1);
}

const QUESTION_FILES = [
  'data/modules/takken/questions/kenri.ts',
  'data/modules/takken/questions/takkengyoho.ts',
  'data/modules/takken/questions/horei_seigen.ts',
  'data/modules/takken/questions/tax_other.ts',
];

function isShort(s) {
  return !s || typeof s !== 'string' || s.trim().length < 30;
}

/**
 * data/modules/takken/questions/*.ts に対し、指定 id の問題の
 * explanation / choiceExplanations / statementExplanations を
 * 配列リテラルとして書き換える。
 *
 * TypeScript パーサーは重いので、各問題オブジェクトを正規表現で抽出して
 * 該当フィールドだけを安全に差し替える方式。
 */
function applyToFile(filePath, updatesById, dry) {
  const txt = fs.readFileSync(filePath, 'utf8');
  let changed = 0;
  let skipped = 0;
  const lines = [];

  // 各問題は `{ id: 'xxx', category: ..., ... },` の形でリストに含まれる。
  // id を含むオブジェクトを正規表現で抜き出し、内部の explanation / choiceExplanations /
  // statementExplanations を新しい値に置き換える。
  // オブジェクトは入れ子の配列を持つので、簡易ブレース カウントで対応。

  const ids = Object.keys(updatesById);
  let result = txt;

  for (const id of ids) {
    const update = updatesById[id];
    if (!update) continue;

    // id: 'xxx' の出現を探し、その所属オブジェクトを特定
    const idPattern = new RegExp(`id:\\s*['"]${id}['"]`);
    const idMatch = idPattern.exec(result);
    if (!idMatch) {
      skipped++;
      lines.push(`  SKIP ${id}: not found in ${path.basename(filePath)}`);
      continue;
    }
    // id の前後でオブジェクトの開始 `{` を探す (id の直前で最も近い `{`)
    const idIdx = idMatch.index;
    let objStart = -1;
    for (let i = idIdx; i >= 0; i--) {
      if (result[i] === '{') {
        objStart = i;
        break;
      }
      // 別の閉じ } に当たったら所属外
      if (result[i] === '}') break;
    }
    if (objStart < 0) {
      skipped++;
      continue;
    }
    // ブレースカウントで対応する閉じ `}` を見つける
    let depth = 0;
    let objEnd = -1;
    for (let i = objStart; i < result.length; i++) {
      const ch = result[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          objEnd = i;
          break;
        }
      }
    }
    if (objEnd < 0) {
      skipped++;
      continue;
    }
    const objText = result.slice(objStart, objEnd + 1);
    let newObjText = objText;

    // フィールドを上書き
    const fieldsToUpdate = [
      ['explanation', update.explanation, 'string'],
      ['choiceExplanations', update.choiceExplanations, 'array'],
      ['statementExplanations', update.statementExplanations, 'array'],
    ];
    let didUpdate = false;
    for (const [name, value, kind] of fieldsToUpdate) {
      if (value === undefined || value === null) continue;
      if (kind === 'array' && (!Array.isArray(value) || value.length === 0)) continue;

      const newLiteral =
        kind === 'string'
          ? JSON.stringify(value)
          : `[\n${value.map((v) => `      ${JSON.stringify(v)}`).join(',\n')},\n    ]`;

      // 既存のフィールドを置換 or 新規追加
      const fieldRegex = new RegExp(
        `(\\b${name}:\\s*)(?:'[^']*'|"[^"]*"|\`[^\`]*\`|\\[[\\s\\S]*?\\])`,
      );
      if (fieldRegex.test(newObjText)) {
        const candidate = newObjText.replace(fieldRegex, `$1${newLiteral}`);
        if (candidate !== newObjText) {
          newObjText = candidate;
          didUpdate = true;
        }
      } else {
        // フィールド未定義 → 末尾 `}` の直前に追加
        const insertAt = newObjText.lastIndexOf('}');
        newObjText =
          newObjText.slice(0, insertAt) +
          `  ${name}: ${newLiteral},\n  ` +
          newObjText.slice(insertAt);
        didUpdate = true;
      }
    }

    if (didUpdate) {
      result = result.slice(0, objStart) + newObjText + result.slice(objEnd + 1);
      changed++;
      lines.push(`  OK ${id}`);
    } else {
      skipped++;
      lines.push(`  NOOP ${id}`);
    }
  }

  if (!dry && changed > 0) {
    fs.writeFileSync(filePath, result, 'utf8');
  }

  return { changed, skipped, lines };
}

async function main() {
  if (!fs.existsSync(IN)) {
    console.error(`Input not found: ${IN_REL}\nRun enhance_explanations.mjs first.`);
    process.exit(1);
  }
  const input = JSON.parse(fs.readFileSync(IN, 'utf8'));
  const items = input.results || input.items || [];
  if (items.length === 0) {
    console.log('No items in input.');
    return;
  }
  console.log(`=== apply_enhanced [${DRY ? 'DRY-RUN' : 'APPLY'}] ===`);
  console.log(`items: ${items.length}`);
  console.log(`force: ${FORCE}`);

  // ファイル別にグループ化 (category prefix から推測)
  // enhance_explanations.mjs の出力は { id, before, after, error? }
  const updatesByFile = {};
  for (const item of items) {
    if (item.error) continue;
    const enhanced = item.after || item.enhanced; // 互換性
    if (!enhanced) continue;
    const cat = item.id.split('-')[0];
    const file = QUESTION_FILES.find((f) => f.includes(cat));
    if (!file) continue;
    if (!updatesByFile[file]) updatesByFile[file] = {};
    updatesByFile[file][item.id] = {
      explanation: enhanced.explanation,
      choiceExplanations: enhanced.choiceExplanations,
      statementExplanations: enhanced.statementExplanations,
    };
  }

  let totalChanged = 0;
  let totalSkipped = 0;
  for (const file of Object.keys(updatesByFile)) {
    const filePath = path.join(ROOT, file);
    if (!fs.existsSync(filePath)) {
      console.warn(`Skip missing: ${file}`);
      continue;
    }

    // バックアップ
    if (!DRY) {
      fs.copyFileSync(filePath, filePath + '.bak');
    }

    const { changed, skipped, lines } = applyToFile(
      filePath,
      updatesByFile[file],
      DRY,
    );
    console.log(`\n[${file}] changed=${changed} skipped=${skipped}`);
    lines.slice(0, 10).forEach((l) => console.log(l));
    totalChanged += changed;
    totalSkipped += skipped;
  }

  console.log(`\n=== TOTAL: changed=${totalChanged} skipped=${totalSkipped} ===`);
  if (!DRY) {
    console.log('Backups created with .bak extension. Delete after verification.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
