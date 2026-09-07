#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireNode } from './runtime-paths.mjs';

// Shared by macOS and Windows launchers; never interpolate workspace into a shell.
async function main() {
  requireNode();
  const [action, directory] = process.argv.slice(2);
  if (!['start', 'stop', 'setup-voice'].includes(action) || !directory)
    throw new Error(
      '用法：node workbench.mjs start|stop|setup-voice "完整工作台目录"',
    );
  const workspace = resolve(directory);
  await access(join(workspace, '中华食肆.html')).catch(() => {
    throw new Error(
      '没有找到中华食肆.html。请先完整解压 ZIP，不要单独移动启动文件。',
    );
  });
  const script = fileURLToPath(
    new URL(
      action === 'setup-voice' ? './setup-voice.mjs' : './kitchen-bridge.mjs',
      import.meta.url,
    ),
  );
  if (action === 'setup-voice') {
    const check = spawnSync('uv', ['--version'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    if (check.error || check.status !== 0)
      throw new Error(
        '尚未找到 uv。请按 README 安装 uv，重开终端 / WorkBuddy 后再初始化语音。',
      );
    console.log(
      '首次准备语音需要联网下载 Python 依赖与模型，请等待完成；不会读取库存或配置 API Key。',
    );
  }
  const run = spawnSync(
    process.execPath,
    [
      script,
      ...(action === 'setup-voice'
        ? [workspace]
        : [action, '--workspace', workspace]),
    ],
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
  } else if (action === 'setup-voice') {
    console.log('语音准备完成。请刷新厨房页面，点击「语音录入」。');
  } else console.log('厨房连接已停止；没有删除库存或记录。');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
