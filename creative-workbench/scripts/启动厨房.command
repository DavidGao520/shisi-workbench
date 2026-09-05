#!/bin/sh
set -eu
kitchen_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' '需要 Node.js 22+。也可请 WorkBuddy 加载中华食肆 Skill 后启动此完整包。'
  exit 1
fi
node "$kitchen_dir/skills/zhonghua-shisi/scripts/kitchen-bridge.mjs" start --workspace "$kitchen_dir"
if command -v open >/dev/null 2>&1; then
  open 'http://127.0.0.1:43117/'
else
  printf '%s\n' '请打开 http://127.0.0.1:43117/'
fi
