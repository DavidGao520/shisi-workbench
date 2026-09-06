import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

void test('sidebar slogan preserves its deliberate two-line break without an orphan', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /好好吃饭，[\s\S]*?<br\s*\/>[\s\S]*?把日子慢慢做香。/);
  assert.match(css, /\.rail-note\s*\{[^}]*padding:\s*30px 0 0;/);
  assert.match(css, /\.rail-note p\s*\{[^}]*white-space:\s*nowrap;/);
});
