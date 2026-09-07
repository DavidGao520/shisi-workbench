#!/bin/sh
set -eu
kitchen_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' '需要 Node.js 22.13+。也可请 WorkBuddy 加载中华食肆 Skill 后启动此完整包。'
  exit 1
fi
node "$kitchen_dir/skills/zhonghua-shisi/scripts/workbench.mjs" start "$kitchen_dir"
