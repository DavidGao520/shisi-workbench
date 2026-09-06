import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');

void test('confirmed inventory heading omits the batch-count explanation', () => {
  assert.match(page, /<h2>已确认的厨房库存<\/h2>\s*<\/div>/);
  assert.ok(!page.includes('个批次 · 未拍到的不会自动删除'));
});

void test('shared page heading is centered without the decorative chapter label', () => {
  assert.match(css, /\.intro\s*\{[^}]*text-align:\s*center;/);
  assert.ok(!page.includes('className="chapter"'));
  assert.ok(!page.includes('壹 / 家常'));
  assert.ok(!css.includes('.chapter'));
});

void test('kitchen entry actions stay centered independently of the backup button', () => {
  assert.match(css, /\.inventory-tools\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto minmax\(0, 1fr\);/);
  assert.match(css, /\.inventory-tools > \.actions\s*\{[^}]*grid-column:\s*2;[^}]*justify-content:\s*center;/);
  assert.match(css, /\.inventory-tools > \.text-button\s*\{[^}]*justify-self:\s*end;/);
  assert.match(css, /@media \(max-width: 1050px\)\s*\{\s*\.inventory-tools\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\);/);
});
