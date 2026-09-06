import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

void test('sidebar names the workbench while preserving the game attribution', () => {
  const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /className="brand">\s*<span className="brand-seal">食<\/span>\s*<div>食肆工作台<\/div>/);
  assert.ok(page.includes('<small>国宴队 · 中华食肆</small>'));
});

void test('sidebar rows override the shared tab percentage height and centered list', () => {
  const list = css.match(/\.side-tabs\s*\{([^}]+)\}/)?.[1] ?? '';
  const row = css.match(/\.side-tabs \[data-slot='tabs-trigger'\]\s*\{([^}]+)\}/)?.[1] ?? '';
  assert.match(list, /height:\s*auto/);
  assert.match(list, /flex:\s*0 0 auto/);
  assert.match(list, /justify-content:\s*flex-start/);
  assert.match(row, /height:\s*auto/);
  assert.match(row, /min-height:\s*49px/);
  assert.ok(css.includes(".side-tabs [data-slot='tabs-trigger'][data-active]"));
});
