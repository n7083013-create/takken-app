#!/bin/bash
# ============================================================
# エッセンス生成: 全問題バッチ実行
# ============================================================

set -e

ADMIN_SECRET="c51499ba55f083f52a27e6ca032b91407c3b63a48d22f80b"
BASE_URL="https://takken-app-olive.vercel.app/api/admin/generate-essences"
OUTPUT_FILE="scripts/core-essences-output.json"
TEMP_FILE="scripts/_batch-response.json"
TOTAL=820
BATCH_SIZE=50

# 既存出力が無ければ初期化
if [ ! -f "$OUTPUT_FILE" ]; then
  echo "[]" > "$OUTPUT_FILE"
fi

echo "🚀 エッセンス生成開始: ${TOTAL}問（${BATCH_SIZE}問ずつ、17バッチ）"

for offset in $(seq 0 $BATCH_SIZE $((TOTAL - 1))); do
  batch_num=$((offset / BATCH_SIZE + 1))
  echo ""
  echo "📝 Batch ${batch_num}/17: offset=${offset}"

  # API呼び出し → 一時ファイルに保存
  curl -s -X POST "${BASE_URL}?limit=${BATCH_SIZE}&offset=${offset}" \
    -H "Authorization: Bearer ${ADMIN_SECRET}" \
    --max-time 180 > "$TEMP_FILE"

  # エラーチェック
  if ! python3 -c "
import json
d = json.load(open('${TEMP_FILE}', encoding='utf-8'))
if 'error' in d:
    print(f'❌ Error: {d[\"error\"]}', flush=True)
    exit(1)
print(f\"  ✅ {d.get('meta', {}).get('generated', 0)}問生成\", flush=True)
"; then
    echo "⚠️ バッチ ${batch_num} スキップ"
    continue
  fi

  # マージ処理（Python別スクリプトで）
  python3 scripts/merge-batch.py "$OUTPUT_FILE" "$TEMP_FILE"

  # レート制限対策
  sleep 2
done

# 一時ファイル削除
rm -f "$TEMP_FILE"

echo ""
echo "✨ 全バッチ完了"
python3 -c "
import json
d = json.load(open('${OUTPUT_FILE}', encoding='utf-8'))
print(f'   最終累積数: {len(d)}問')
"
