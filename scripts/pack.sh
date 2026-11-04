#!/bin/bash
# Build the two submission zips: 完整版本 / 匿名版本.
# Usage: ./pack.sh <队伍名> <队长姓名>
set -euo pipefail

TEAM="${1:-队伍名}"
LEAD="${2:-队长姓名}"
GROUP="壹组"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAME="2026-零杯${GROUP}-${TEAM}-${LEAD}"
OUT="${ROOT}/dist"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$OUT"
rm -rf "$OUT/${NAME}-完整版本.zip" "$OUT/${NAME}-匿名版本.zip"

copy_tree() {
  local dst="$1"
  mkdir -p "$dst"
  (cd "$ROOT" && tar -c \
      --exclude=.git --exclude=dist --exclude=node_modules \
      --exclude='progress' --exclude='.prompt.md' .) | tar -x -C "$dst"
}

# 完整版本
copy_tree "$TMP/${NAME}-完整版本"
(cd "$TMP" && zip -qr "$OUT/${NAME}-完整版本.zip" "${NAME}-完整版本")

# 匿名版本：去掉个人信息与进展记录
copy_tree "$TMP/${NAME}-匿名版本"
ANON="$TMP/${NAME}-匿名版本"
python3 - "$ANON/README.md" <<'PY'
import re
import sys

path = sys.argv[1]
text = open(path, encoding="utf-8").read()
text = re.sub(r"## 一、队伍信息.*?(?=\n## )", "## 一、作品说明\n\n本作品为匿名提交版本，不含任何个人信息。\n\n", text, flags=re.S)
open(path, "w", encoding="utf-8").write(text)
PY
rm -rf "$ANON/progress" "$ANON/MISSION.md" "$ANON/STATE.md" "$ANON/BACKLOG.md"
(cd "$TMP" && zip -qr "$OUT/${NAME}-匿名版本.zip" "${NAME}-匿名版本")

echo "OK:"
ls -lh "$OUT"/*.zip
