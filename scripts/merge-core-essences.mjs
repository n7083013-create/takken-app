#!/usr/bin/env node
// ============================================================
// 1行エッセンスを問題データファイルにマージ
// ============================================================
// 使い方:
//   node scripts/merge-core-essences.mjs
//
// 前提:
//   scripts/core-essences-output.json が存在する
//   (generate-core-essences.mjs で生成済み)
//
// 処理:
//   - 各問題ファイル (data/modules/takken/questions/*.ts) を読み込み
//   - coreEssence を各問題に追加
//   - 既存の coreEssence は上書きしない（人間編集を保護）
//   - 元ファイルのバックアップを .bak として保存

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ESSENCES_PATH = path.join(ROOT, 'scripts', 'core-essences-output.json');
const QUESTIONS_DIR = path.join(ROOT, 'data', 'modules', 'takken', 'questions');

function main() {
  if (!fs.existsSync(ESSENCES_PATH)) {
    console.error(`❌ ${ESSENCES_PATH} が見つかりません`);
    console.error('   先に: node scripts/generate-core-essences.mjs を実行してください');
    process.exit(1);
  }

  /** @type {Array<{id: string, coreEssence: string}>} */
  const essences = JSON.parse(fs.readFileSync(ESSENCES_PATH, 'utf8'));
  const essenceMap = new Map();
  for (const e of essences) {
    if (e.id && e.coreEssence && e.coreEssence.trim()) {
      essenceMap.set(e.id, e.coreEssence.trim());
    }
  }

  console.log(`📋 マージ対象: ${essenceMap.size}問のエッセンス`);

  const files = fs.readdirSync(QUESTIONS_DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.bak'));
  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const file of files) {
    const fullPath = path.join(QUESTIONS_DIR, file);
    let content = fs.readFileSync(fullPath, 'utf8');
    const originalContent = content;

    let fileUpdated = 0;
    let fileSkipped = 0;

    for (const [id, essence] of essenceMap) {
      // 問題のIDブロックを探す
      // 例:  id: 'q_kenri_xxx',
      const idPattern = new RegExp(
        `(id:\\s*['\"\`]${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['\"\`],[\\s\\S]*?)(\\n\\s*(?:tags|sourceExamYear|lastVerifiedAt|lawEffectiveFrom|expiresAt|lawAmendments|needsReview|reviewReason)\\s*:)`,
        'm',
      );

      const match = content.match(idPattern);
      if (!match) continue;

      // 既に coreEssence がある場合はスキップ
      if (match[1].includes('coreEssence:')) {
        fileSkipped++;
        continue;
      }

      // coreEssence を挿入（エスケープ処理）
      const escapedEssence = essence
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\n/g, '\\n');

      const coreEssenceLine = `\n    coreEssence: '${escapedEssence}',`;
      const replacement = match[1] + coreEssenceLine + match[2];

      content = content.replace(match[0], replacement);
      fileUpdated++;
    }

    if (fileUpdated > 0) {
      // バックアップ保存
      fs.writeFileSync(fullPath + '.bak', originalContent, 'utf8');
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`  ✅ ${file}: ${fileUpdated}問更新 (${fileSkipped}問スキップ)`);
      totalUpdated += fileUpdated;
      totalSkipped += fileSkipped;
    } else if (fileSkipped > 0) {
      console.log(`  ⏭  ${file}: 全${fileSkipped}問スキップ（既に設定済み）`);
      totalSkipped += fileSkipped;
    }
  }

  console.log(`\n✨ マージ完了:`);
  console.log(`   ${totalUpdated}問にエッセンスを追加`);
  console.log(`   ${totalSkipped}問は既存のためスキップ`);
  console.log(`\n📝 次のステップ:`);
  console.log(`   1. git diff で変更内容を確認`);
  console.log(`   2. 問題なければ .bak ファイルを削除: rm data/modules/takken/questions/*.bak`);
  console.log(`   3. コミット＆デプロイ`);
}

main();
