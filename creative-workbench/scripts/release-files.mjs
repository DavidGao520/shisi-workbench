// Explicit allowlist: never walk a user's release directory or private runtimes.
export const releaseFiles = [
  ['docs/JUDGE-GUIDE.md', 'README.md'],
  ['docs/ASSET-SOURCES.md', 'ASSET-SOURCES.md'],
  ['docs/CHINESE-RECIPE-SOURCES.md', 'CHINESE-RECIPE-SOURCES.md'],
  ['docs/IMPLEMENTATION-STATUS.md', 'IMPLEMENTATION-STATUS.md'],
  ['docs/demo-meal-provenance.json', 'demo-meal-provenance.json'],
  ['docs/DISH-ART-PROMPTS-2026-09-10.md', 'DISH-ART-PROMPTS-2026-09-10.md'],
  ...[
    '启动厨房.command',
    '停止厨房.command',
    'Start-Windows.cmd',
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
    'scripts/cloud-speech.mjs',
    'scripts/node-runtime.mjs',
    'scripts/workbench.mjs',
  ].map((path) => [
    'skills/zhonghua-shisi/' + path,
    'skills/zhonghua-shisi/' + path,
  ]),
];

export const releasePaths = [
  '中华食肆.html',
  ...releaseFiles.map(([, dest]) => dest),
];
