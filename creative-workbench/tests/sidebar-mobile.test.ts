import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

void test('phone tabs stack icon and label and keep pending badges out of row sizing', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  const mobile = css.slice(css.indexOf('@media (max-width: 700px)'));
  const row = mobile.match(/\.side-tabs \[data-slot='tabs-trigger'\]\s*\{([^}]+)\}/)?.[1] ?? '';
  assert.match(row, /flex-direction:\s*column;/);
  assert.match(row, /min-width:\s*0;/);
  assert.match(row, /min-height:\s*60px;/);
  assert.match(css, /\.side-tabs \.nav-count\s*\{[^}]*position:\s*absolute/);
  assert.match(css, /transition-property:\s*background-color, color, box-shadow;/);
});
