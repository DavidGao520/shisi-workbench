import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

void test('sidebar slogan preserves its deliberate two-line break without an orphan', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /从游戏的一餐\s*<br\s*\/>\s*到生活的一餐/);
  const brand = page.slice(page.indexOf('<div className="brand">'), page.indexOf('<TabsList'));
  assert.ok(!brand.includes('从游戏的一餐'));
  assert.ok(!brand.includes('<small>'));
  assert.ok(!page.includes('好好吃饭'));
  assert.match(css, /\.rail-note\s*\{[^}]*padding:\s*30px 0 0;/);
  assert.match(css, /\.rail-note p\s*\{[^}]*white-space:\s*nowrap;/);
});
