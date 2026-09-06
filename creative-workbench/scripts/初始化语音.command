#!/bin/bash
set -euo pipefail
VOICE_WORKSPACE="$(cd "$(dirname "$0")" && pwd)"
if ! command -v uv >/dev/null 2>&1; then
  echo "语音初始化需要 uv。请先安装 uv，再重新打开这个文件。"
  exit 1
fi
node "$VOICE_WORKSPACE/skills/zhonghua-shisi/scripts/setup-voice.mjs" "$VOICE_WORKSPACE"
echo "准备好了。请刷新厨房页面，点击「语音录入」。"
