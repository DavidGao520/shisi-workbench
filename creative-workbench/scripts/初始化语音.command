#!/bin/bash
set -euo pipefail
VOICE_WORKSPACE="$(cd "$(dirname "$0")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
  echo "需要 Node.js 22.13 或更新版本，请按 README 安装。"
  exit 1
fi
node "$VOICE_WORKSPACE/skills/zhonghua-shisi/scripts/workbench.mjs" setup-voice "$VOICE_WORKSPACE"
