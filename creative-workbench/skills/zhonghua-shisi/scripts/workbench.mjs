#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireNode } from './node-runtime.mjs';

// Shared by macOS and Windows launchers; never interpolate workspace into a shell.
async function main() {
  requireNode();
  const [action, directory] = process.argv.slice(2);
  if (action === 'setup-voice')
    throw new Error(
      '新版语音直接使用云端 API，无需初始化或安装本机模型。请启动厨房后点击「语音录入」。',
    );
  if (!['start', 'stop'].includes(action) || !directory)
    throw new Error('用法：node workbench.mjs start|stop "完整工作台目录"');
  const workspace = resolve(directory);
  await access(join(workspace, '中华食肆.html')).catch(() => {
    throw new Error(
      '没有找到中华食肆.html。请先完整解压 ZIP，不要单独移动启动文件。',
    );
  });
  const script = fileURLToPath(
    new URL('./kitchen-bridge.mjs', import.meta.url),
  );
  const run = spawnSync(
    process.execPath,
    [script, action, '--workspace', workspace],
    { stdio: 'inherit', windowsHide: true },
  );
  if (run.error || run.status !== 0)
    throw new Error('操作未完成，请查看上方提示和 README 的排查说明。');
  if (action === 'start') {
    console.log(
      '厨房已启动。请打开 http://127.0.0.1:43117/ ，照片在 WorkBuddy 对话中上传。',
    );
    // Only a fixed public loopback URL enters the Windows command interpreter.
    if (process.platform === 'win32')
      spawnSync(
        'cmd.exe',
        ['/d', '/c', 'start', '', 'http://127.0.0.1:43117/'],
        { windowsHide: true },
      );
    else if (process.platform === 'darwin')
      spawnSync('open', ['http://127.0.0.1:43117/']);
  } else console.log('厨房连接已停止；没有删除库存或记录。');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
