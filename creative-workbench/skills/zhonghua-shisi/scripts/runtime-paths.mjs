import { join, win32, posix } from 'node:path';

// Also accepts an explicit platform so both layouts are covered on either OS.
export function voicePython(runtime, platform = process.platform) {
  return platform === 'win32'
    ? win32.join(runtime, 'venv', 'Scripts', 'python.exe')
    : posix.join(runtime, 'venv', 'bin', 'python');
}

/** @param {string} workspace
 * @param {Record<string, string | undefined>} env
 * @returns {Record<string, string | undefined>} */
export function voiceEnvironment(workspace, env = process.env) {
  const runtime = join(workspace, '.kitchen-voice');
  return {
    ...env,
    PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8',
    PYTHONDONTWRITEBYTECODE: '1',
    HF_HUB_DISABLE_TELEMETRY: '1',
    UV_CACHE_DIR: join(runtime, 'uv-cache'),
    UV_PYTHON_INSTALL_DIR: join(runtime, 'python'),
  };
}

export function requireNode(version = process.versions.node) {
  const [major, minor] = version.split('.').map(Number);
  if (!(major > 22 || (major === 22 && minor >= 13)))
    throw new Error(
      '需要 Node.js 22.13 或更新版本。请安装后重开终端 / WorkBuddy。',
    );
}
