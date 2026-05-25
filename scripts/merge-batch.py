#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
エッセンスバッチ結果を累積ファイルにマージ
使い方: python3 merge-batch.py <output_file> <batch_response_file>
"""
import json
import sys


def main():
    if len(sys.argv) < 3:
        print("Usage: merge-batch.py <output_file> <batch_file>")
        sys.exit(1)

    output_file = sys.argv[1]
    batch_file = sys.argv[2]

    # 既存読み込み
    try:
        with open(output_file, "r", encoding="utf-8") as f:
            existing = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        existing = []

    # 新規バッチ結果読み込み
    with open(batch_file, "r", encoding="utf-8") as f:
        batch = json.load(f)

    new_results = batch.get("results", [])

    # ID ベースでマージ（重複は新しいもので上書き）
    id_map = {e["id"]: e for e in existing if "id" in e}
    added = 0
    for item in new_results:
        if "id" in item and "coreEssence" in item:
            if item["id"] not in id_map:
                added += 1
            id_map[item["id"]] = item

    merged = list(id_map.values())

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)

    print(f"  💾 +{added}件追加 (累積: {len(merged)}問)")


if __name__ == "__main__":
    main()
