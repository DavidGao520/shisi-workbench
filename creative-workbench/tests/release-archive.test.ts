import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import { createReleaseArchive } from '../scripts/package-release.mjs';
import { releasePaths } from '../scripts/release-files.mjs';

const commit = 'a'.repeat(40);
const fixture = () =>
  Object.fromEntries(
    releasePaths.map((path) => [
      path,
      new TextEncoder().encode('中文 fixture: ' + path),
    ]),
  );

void test('judge archive contains only allowlisted files and a byte-verifiable Git manifest', () => {
  const entries = fixture();
  entries['.env'] = new TextEncoder().encode('private fixture');
  entries['.kitchen-bridge/queue.json'] = new Uint8Array([1]);
  const zipped = createReleaseArchive(entries, {
    commit,
    branch: 'main',
    remoteVerified: true,
  });
  const restored = unzipSync(zipped);
  assert.deepEqual(
    Object.keys(restored).sort(),
    [...releasePaths, 'VERSION.json'].sort(),
  );
  const version = JSON.parse(
    new TextDecoder().decode(restored['VERSION.json']),
  );
  assert.equal(version.commit, commit);
  assert.equal(version.remoteVerified, true);
  for (const path of releasePaths) {
    assert.deepEqual(restored[path], entries[path]);
    assert.equal(version.files[path].bytes, entries[path].length);
    assert.equal(
      version.files[path].sha256,
      createHash('sha256').update(restored[path]).digest('hex'),
    );
  }
  assert.ok(
    new DataView(zipped.buffer, zipped.byteOffset, zipped.byteLength).getUint16(
      6,
      true,
    ) & 0x800,
  );
  // Check central-directory UNIX mode, not only in-memory unzip contents.
  const view = new DataView(
    zipped.buffer,
    zipped.byteOffset,
    zipped.byteLength,
  );
  let executableCount = 0;
  for (let offset = 0; offset < zipped.length - 46; offset++) {
    if (view.getUint32(offset, true) !== 0x02014b50) continue;
    const length = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(
      zipped.subarray(offset + 46, offset + 46 + length),
    );
    if (name.endsWith('.command')) {
      assert.equal(view.getUint16(offset + 4, true) >> 8, 3);
      assert.equal(view.getUint32(offset + 38, true) >>> 16, 0o100755);
      executableCount++;
    }
  }
  assert.equal(executableCount, 2);
});

void test('judge archive rejects missing files and invalid revision metadata', () => {
  const entries = fixture();
  delete entries['中华食肆.html'];
  assert.throws(
    () => createReleaseArchive(entries, { commit }),
    /Missing release file/,
  );
  assert.throws(
    () => createReleaseArchive(fixture(), { commit: 'short' }),
    /full Git commit/,
  );
});
