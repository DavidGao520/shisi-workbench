export function requireNode(version = process.versions.node) {
  const [major, minor] = version.split('.').map(Number);
  if (!(major > 22 || (major === 22 && minor >= 13)))
    throw new Error(
      '需要 Node.js 22.13 或更新版本。请安装后重开终端 / WorkBuddy。',
    );
}
