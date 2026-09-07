#!/bin/sh
set -eu
kitchen_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' '需要 Node.js 22.13 或更新版本，请按 README 安装。'
  exit 1
fi
node "$kitchen_dir/skills/zhonghua-shisi/scripts/workbench.mjs" stop "$kitchen_dir"
