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
      --exclude='.prompt.md' .) | tar -x -C "$dst"
}

# 优先用 zip；没有 zip 命令时用 Python 标准库生成同样的目录结构
make_zip() {
  local src="$1" out="$2"
  if command -v zip >/dev/null 2>&1; then
    (cd "$(dirname "$src")" && zip -qr "$out" "$(basename "$src")")
  else
    python3 - "$src" "$out" <<'PY'
import os, sys, zipfile
src, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(src):
        dirs.sort()
        for name in sorted(files):
            path = os.path.join(root, name)
            z.write(path, os.path.relpath(path, os.path.dirname(src)))
PY
  fi
}

# 完整版本
copy_tree "$TMP/${NAME}-完整版本"
make_zip "$TMP/${NAME}-完整版本" "$OUT/${NAME}-完整版本.zip"

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
make_zip "$TMP/${NAME}-匿名版本" "$OUT/${NAME}-匿名版本.zip"

echo "OK:"
ls -lh "$OUT"/*.zip
