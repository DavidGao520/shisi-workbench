import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(
  new URL('../app/globals.css', import.meta.url),
  'utf8',
);

void test('sidebar names the workbench while preserving the game attribution', () => {
  const page = readFileSync(
    new URL('../app/page.tsx', import.meta.url),
    'utf8',
  );
  assert.match(
    page,
    /className="brand">\s*<span className="brand-seal">\s*<span className="brand-seal-glyph">食<\/span>\s*<\/span>\s*<div className="brand-title">食肆工作台<\/div>/,
  );
  assert.ok(page.includes('<small>国宴队 · 中华食肆</small>'));
});

void test('brand aligns compact glyph and title line boxes without shifting the seal', () => {
  const brand = css.match(/\.brand\s*\{([^}]+)\}/)?.[1] ?? '';
  const seal = css.match(/\.brand-seal\s*\{([^}]+)\}/)?.[1] ?? '';
  const glyph = css.match(/\.brand-seal-glyph\s*\{([^}]+)\}/)?.[1] ?? '';
  assert.match(brand, /align-items:\s*center/);
  assert.match(seal, /place-items:\s*center/);
  assert.match(seal, /height:\s*46px/);
  assert.doesNotMatch(seal, /transform|translate/);
  assert.match(glyph, /line-height:\s*1;/);
  assert.match(glyph, /transform:\s*translateY\(-0\.06em\)/);
  assert.match(css, /\.brand-title\s*\{\s*line-height:\s*1;/);
});

void test('footer keeps one centered sentence without a local version label or mobile hiding', () => {
  const page = readFileSync(
    new URL('../app/page.tsx', import.meta.url),
    'utf8',
  );
  assert.match(
    page,
    /<footer className="footer">菜谱有来源，食忆属于你<\/footer>/,
  );
  assert.doesNotMatch(
    page,
    /中华食肆 HTML · 本地工作版|菜谱有来源，食忆属于你。/,
  );
  const footer = css.match(/\.footer\s*\{([^}]+)\}/)?.[1] ?? '';
  assert.match(footer, /text-align:\s*center/);
  assert.doesNotMatch(footer, /space-between/);
  assert.doesNotMatch(css, /\.footer(?:\s+span)?\s*\{[^}]*display:\s*none/);
});

void test('sidebar rows override the shared tab percentage height and centered list', () => {
  const list = css.match(/\.side-tabs\s*\{([^}]+)\}/)?.[1] ?? '';
  const row =
    css.match(/\.side-tabs \[data-slot='tabs-trigger'\]\s*\{([^}]+)\}/)?.[1] ??
    '';
  assert.match(list, /height:\s*auto/);
  assert.match(list, /flex:\s*0 0 auto/);
  assert.match(list, /justify-content:\s*flex-start/);
  assert.match(row, /height:\s*auto/);
  assert.match(row, /min-height:\s*49px/);
  assert.ok(css.includes(".side-tabs [data-slot='tabs-trigger'][data-active]"));
});
