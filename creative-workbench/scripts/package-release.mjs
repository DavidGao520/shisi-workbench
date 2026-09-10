import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { zipSync, unzipSync } from 'fflate';
import { releasePaths } from './release-files.mjs';

export function createReleaseArchive(entries, revision) {
  const paths = releasePaths;
  if (!/^[a-f0-9]{40}$/.test(revision.commit))
    throw new Error('A full Git commit is required');
  for (const path of paths)
    if (!(entries[path] instanceof Uint8Array))
      throw new Error('Missing release file: ' + path);
  const version = {
    schemaVersion: 1,
    name: '食肆工作台 · 评委体验包',
    ...revision,
    files: Object.fromEntries(
      paths.map((path) => [
        path,
        {
          bytes: entries[path].byteLength,
          sha256: createHash('sha256').update(entries[path]).digest('hex'),
        },
      ]),
    ),
  };
  const packagedEntries = Object.fromEntries(
    paths.map((path) => [path, entries[path]]),
  );
  packagedEntries['VERSION.json'] = new TextEncoder().encode(
    JSON.stringify(version, null, 2) + '\n',
  );
  const archiveEntries = Object.fromEntries(
    Object.keys(packagedEntries).map((path) => [
      path,
      path.endsWith('.command')
        ? [packagedEntries[path], { os: 3, attrs: 0o100755 << 16 }]
        : packagedEntries[path],
    ]),
  );
  const zipped = zipSync(archiveEntries, { level: 6 });
  // The first entry intentionally has a Chinese name; assert the portable UTF-8 flag.
  if (
    !(
      new DataView(
        zipped.buffer,
        zipped.byteOffset,
        zipped.byteLength,
      ).getUint16(6, true) & 0x800
    )
  )
    throw new Error('Missing UTF-8 ZIP filename flag');
  const restored = unzipSync(zipped);
  for (const path of Object.keys(packagedEntries)) {
    if (
      !restored[path] ||
      !Buffer.from(restored[path]).equals(Buffer.from(packagedEntries[path]))
    )
      throw new Error('Archive round trip failed: ' + path);
  }
  return zipped;
}

async function packageRelease() {
  const root = resolve(import.meta.dirname, '..');
  const { values } = parseArgs({
    options: {
      output: { type: 'string' },
      'require-pushed': { type: 'boolean', default: false },
    },
  });
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  // Never stamp an archive as a committed version while tracked source is dirty.
  git('diff', '--quiet', 'HEAD', '--', '.');
  if (git('ls-files', '--others', '--exclude-standard', '--', '.'))
    throw new Error(
      'Commit or remove untracked project inputs before packaging',
    );
  const commit = git('rev-parse', 'HEAD');
  const branch = git('branch', '--show-current');
  if (values['require-pushed']) {
    const remote = git(
      'ls-remote',
      '--exit-code',
      'origin',
      'refs/heads/' + branch,
    ).split(/\s/)[0];
    if (commit !== remote)
      throw new Error('Local commit does not match the pushed branch');
  }
  // release/ is ignored and may contain old files. Always rebuild it from the
  // verified checkout, including when this script is invoked without npm.
  execSync('npm run build:html', { cwd: root, stdio: 'inherit' });
  git('diff', '--quiet', 'HEAD', '--', '.');
  if (git('ls-files', '--others', '--exclude-standard', '--', '.'))
    throw new Error(
      'Untracked project inputs appeared during the release build',
    );
  if (git('rev-parse', 'HEAD') !== commit)
    throw new Error('Git revision changed during the release build');
  const entries = Object.fromEntries(
    await Promise.all(
      releasePaths.map(async (path) => [
        path,
        new Uint8Array(await readFile(resolve(root, 'release', path))),
      ]),
    ),
  );
  const zipped = createReleaseArchive(entries, {
    commit,
    branch,
    sourceUrl:
      'https://github.com/DavidGao520/shisi-workbench/commit/' + commit,
    builtAt: new Date().toISOString(),
    remoteVerified: values['require-pushed'],
  });
  const destination = resolve(
    values.output ?? resolve(root, '食肆工作台-评委体验包.zip'),
  );
  // Refuse accidental overwrites. Old judge packages must be retired deliberately.
  await writeFile(destination, zipped, { flag: 'wx' });
  console.log(
    'Verified UTF-8 ZIP with ' +
      (releasePaths.length + 1) +
      ' exact round-trip files: ' +
      destination,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await packageRelease();
