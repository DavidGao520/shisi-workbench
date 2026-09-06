import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BaiweiGallery } from '../components/baiwei-gallery';
import { emptyState } from '../lib/kitchen';

void test('gallery leaves the page title to its shell and retains collection progress', () => {
  const html = renderToStaticMarkup(createElement(BaiweiGallery, {
    state: emptyState('real'), images: {}, plate: '/plate.webp', onOpenRecipe() {},
  }));
  assert.ok(!html.includes('<h1'));
  assert.ok(!html.includes('中华食肆 · 食肆菜单'));
  assert.match(html, /aria-label="百味图"/);
  assert.match(html, /value="0" max="70"/);
  assert.match(html, /亲手做一道，点亮一道/);
  assert.equal((html.match(/data-dish-id=/g) || []).length, 70);
});
