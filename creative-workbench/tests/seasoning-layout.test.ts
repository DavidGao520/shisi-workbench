import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SeasoningChecklist } from '../components/seasoning-checklist';
import { emptyState } from '../lib/kitchen';

void test('seasoning onboarding keeps the choices and one confirmation without repeated instructions', () => {
  const html = renderToStaticMarkup(createElement(SeasoningChecklist, {
    state: emptyState('real'), busy: false, firstRun: true,
    mutate: async () => true, done: () => {},
  }));
  assert.ok(!html.includes('确认前不会入库'));
  assert.ok(!html.includes('不估重量或余量'));
  assert.ok(!html.includes('待加入'));
  assert.match(html, /<legend>[\s\S]*选中常用 8 项[\s\S]*<\/legend>/);
  assert.match(html, /确认加入 0 种调料/);
  assert.match(html, /暂时跳过，先录入食材/);
  assert.equal((html.match(/aria-checked="false"/g) || []).length, 30);
});
