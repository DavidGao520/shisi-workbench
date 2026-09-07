import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { releaseFiles } from './release-files.mjs';
const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'release');
await mkdir(output, { recursive: true });
let html = await readFile(resolve(root, 'dist-local/index.html'), 'utf8');
const scripts = [
  ...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g),
];
for (const match of scripts) {
  const js = await readFile(resolve(root, 'dist-local', match[1]), 'utf8');
  html = html.replace(
    match[0],
    () =>
      '<script type="module">' +
      js.replace(/<\/script/gi, '<\\/script') +
      '</script>',
  );
}
const styles = [...html.matchAll(/<link\b[^>]*href="([^"]+\.css)"[^>]*>/g)];
for (const match of styles) {
  const css = await readFile(resolve(root, 'dist-local', match[1]), 'utf8');
  html = html.replace(
    match[0],
    () => '<style>' + css.replace(/<\/style/gi, '<\\/style') + '</style>',
  );
}
html = html.replace(/<link\b[^>]*rel="modulepreload"[^>]*>/g, '');
if (/<(script|link)\b[^>]*(src|href)="(?!data:)/.test(html))
  throw new Error(
    'External application resource remains in standalone artifact',
  );
await writeFile(resolve(output, '中华食肆.html'), html);
for (const [source, destination] of releaseFiles) {
  const target = resolve(output, destination);
  await mkdir(dirname(target), { recursive: true });
  let content = await readFile(resolve(root, source));
  if (destination.endsWith('.cmd'))
    content = Buffer.from(content.toString('utf8').replace(/\r?\n/g, '\r\n'));
  await writeFile(target, content);
  if (destination.endsWith('.command')) await chmod(target, 0o755);
}
console.log(
  'Self-contained HTML written: ' +
    resolve(output, '中华食肆.html') +
    ' (' +
    (Buffer.byteLength(html) / 1024 / 1024).toFixed(2) +
    ' MB)',
);
