import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const dishes = JSON.parse(
  await readFile(new URL('lib/baiwei-dishes.json', root), 'utf8'),
);
const provenance = JSON.parse(
  await readFile(new URL('docs/baiwei-provenance.json', root), 'utf8'),
);
const html = process.argv.includes('--html')
  ? await readFile(new URL('release/中华食肆.html', root), 'utf8')
  : null;
const artModule = await readFile(new URL('lib/baiwei-art.ts', root), 'utf8');
if (dishes.length !== 70 || new Set(dishes.map((dish) => dish.id)).size !== 70)
  throw new Error('Expected exactly 70 unique game dishes');
const assets = [
  ...dishes.map((dish) => ({ path: dish.imageFile, sha: dish.imageGitSha })),
  {
    path: 'assets/baiwei/plates/plate_1.webp',
    sha: provenance.plate.imageGitSha,
  },
];
for (const asset of assets) {
  const bytes = await readFile(new URL(asset.path, root));
  const hash = createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
  if (hash !== asset.sha) throw new Error('Asset hash mismatch: ' + asset.path);
  if (!artModule.includes(`../${asset.path}?url`))
    throw new Error('Missing Vite import: ' + asset.path);
  if (
    html !== null &&
    !html.includes('data:image/webp;base64,' + bytes.toString('base64'))
  )
    throw new Error('Missing offline image: ' + asset.path);
}
console.log(
  `Verified ${assets.length} original game assets${html === null ? '' : ' and all image bytes embedded in standalone HTML'}.`,
);
