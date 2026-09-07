// Explicit allowlist: never walk a user's release directory or private runtimes.
export const releaseFiles = [
  ['docs/JUDGE-GUIDE.md', 'README.md'],
  ['docs/ASSET-SOURCES.md', 'ASSET-SOURCES.md'],
  ['docs/CHINESE-RECIPE-SOURCES.md', 'CHINESE-RECIPE-SOURCES.md'],
  ['docs/IMPLEMENTATION-STATUS.md', 'IMPLEMENTATION-STATUS.md'],
  ...[
    '启动厨房.command',
    '初始化语音.command',
    '停止厨房.command',
    'Start-Windows.cmd',
    'Setup-Voice-Windows.cmd',
    'Stop-Windows.cmd',
  ].map((name) => ['scripts/' + name, name]),
  ...[
    'SKILL.md',
    'references/inventory-contract.md',
    'references/theme-assets.md',
    'references/local-bridge.md',
    'references/cooking-handoff.md',
    'scripts/kitchen-bridge.mjs',
    'scripts/cooking-contract.mjs',
    'scripts/local-speech.mjs',
    'scripts/runtime-paths.mjs',
    'scripts/workbench.mjs',
    'scripts/transcribe.py',
    'scripts/setup-voice.mjs',
  ].map((path) => [
    'skills/zhonghua-shisi/' + path,
    'skills/zhonghua-shisi/' + path,
  ]),
];

export const releasePaths = [
  '中华食肆.html',
  ...releaseFiles.map(([, dest]) => dest),
];
