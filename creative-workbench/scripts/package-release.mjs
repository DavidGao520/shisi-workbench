import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { zipSync, unzipSync } from 'fflate';

const root = resolve(import.meta.dirname, '..');
const paths = [
  '中华食肆.html',
  '启动厨房.command',
  'README.md',
  'ASSET-SOURCES.md',
  'IMPLEMENTATION-STATUS.md',
  'skills/zhonghua-shisi/SKILL.md',
  'skills/zhonghua-shisi/references/inventory-contract.md',
  'skills/zhonghua-shisi/references/theme-assets.md',
  'skills/zhonghua-shisi/references/local-bridge.md',
  'skills/zhonghua-shisi/scripts/kitchen-bridge.mjs',
];
const entries = Object.fromEntries(
  await Promise.all(
    paths.map(async (path) => [
      path,
      new Uint8Array(await readFile(resolve(root, 'release', path))),
    ]),
  ),
);
const archiveEntries = {
  ...entries,
  '启动厨房.command': [
    entries['启动厨房.command'],
    { os: 3, attrs: 0o100755 << 16 },
  ],
};
const zipped = zipSync(archiveEntries, { level: 6 });
// The first entry intentionally has a Chinese name; assert the portable UTF-8 flag.
if (
  !(
    new DataView(zipped.buffer, zipped.byteOffset, zipped.byteLength).getUint16(
      6,
      true,
    ) & 0x800
  )
)
  throw new Error('Missing UTF-8 ZIP filename flag');
const restored = unzipSync(zipped);
for (const path of paths) {
  if (
    !restored[path] ||
    !Buffer.from(restored[path]).equals(Buffer.from(entries[path]))
  )
    throw new Error('Archive round trip failed: ' + path);
}
const destination = resolve(root, '中华食肆-创意工作台-v0.3.zip');
await writeFile(destination, zipped);
console.log(
  'Verified UTF-8 ZIP with ' +
    paths.length +
    ' exact round-trip files: ' +
    destination,
);
