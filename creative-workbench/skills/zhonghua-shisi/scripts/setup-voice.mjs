#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdir, access, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import {
  requireNode,
  voicePython,
  voiceEnvironment,
} from './runtime-paths.mjs';

requireNode();
const workspace = resolve(process.argv[2] || 'release');
const runtime = join(workspace, '.kitchen-voice');
await mkdir(runtime, { recursive: true, mode: 0o700 });
const python = voicePython(runtime);
const run = (command, args) => {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    windowsHide: true,
    env: voiceEnvironment(workspace),
  });
  if (result.error || result.status !== 0)
    throw new Error(
      '语音环境准备失败。请确认 uv、网络和磁盘空间；Windows 若提示 DLL 缺失，请按 README 安装微软 VC++ x64 运行库后重试。',
    );
};
try {
  await access(python);
} catch {
  run('uv', ['venv', '--python', '3.12', join(runtime, 'venv')]);
}
run('uv', [
  'pip',
  'install',
  '--python',
  python,
  'faster-whisper==1.2.1',
  'opencc-python-reimplemented==0.1.7',
]);
run(python, [
  '-c',
  'from faster_whisper import WhisperModel; import sys; WhisperModel("base", device="cpu", compute_type="int8", download_root=sys.argv[1]); print("中文语音模型已就绪")',
  join(runtime, 'models'),
]);
await writeFile(
  join(runtime, 'ready.json'),
  JSON.stringify({ version: 1, engine: 'whisper-base-local' }),
  { mode: 0o600 },
);
console.log('语音准备完成；模型留在本机，不进入 Git 或交付包。');
