import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const source = readFileSync(
  new URL('../app/page.tsx', import.meta.url),
  'utf8',
);
const css = readFileSync(
  new URL('../app/globals.css', import.meta.url),
  'utf8',
);
const file = ts.createSourceFile(
  'page.tsx',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const nodes: ts.Node[] = [];
function visit(node: ts.Node) {
  nodes.push(node);
  ts.forEachChild(node, visit);
}
visit(file);
const header = nodes.find(
  (node) =>
    ts.isJsxElement(node) &&
    node.openingElement.tagName.getText(file) === 'header' &&
    node.openingElement.getText(file).includes('topbar'),
) as ts.JsxElement;
assert.ok(header);
const intro = nodes.find(
  (node) =>
    ts.isJsxElement(node) &&
    node.openingElement.getText(file) === '<div className="intro">',
) as ts.JsxElement;
assert.ok(intro);

function harness(overrides: Record<string, unknown> = {}) {
  const actions = { tourStep: -1, reset: false, dataset: '' };
  const context = {
    React,
    ArrowUpRight: () => null,
    RotateCcw: () => null,
    dataset: 'demo',
    s: { demoExperience: { tourStep: 3 } },
    busy: false,
    tourPaused: false,
    page: 'today',
    pages: [
      { id: 'today', name: '今日一餐' },
      { id: 'inventory', name: '我的厨房' },
      { id: 'cooking', name: '做菜模式' },
      { id: 'archive', name: '百味图' },
    ],
    moveTour: (step: number) => {
      actions.tourStep = step;
    },
    setReset: (value: boolean) => {
      actions.reset = value;
    },
    changeDataset: (dataset: string) => {
      actions.dataset = dataset;
    },
    ...overrides,
  };
  const evaluate = (expression: string) =>
    runInNewContext(
      ts.transpileModule(`(${expression})`, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.React,
        },
      }).outputText,
      context,
    );
  const markup = renderToStaticMarkup(evaluate(header.getText(file)));
  const introMarkup = renderToStaticMarkup(evaluate(intro.getText(file)));
  function click(label: string) {
    const button = nodes.find(
      (node) =>
        ts.isJsxElement(node) &&
        node.pos >= header.pos &&
        node.end <= header.end &&
        node.openingElement.tagName.getText(file) === 'button' &&
        node.getText(file).includes(label),
    ) as ts.JsxElement;
    assert.ok(button);
    const attribute = button.openingElement.attributes.properties.find(
      (property) =>
        ts.isJsxAttribute(property) &&
        property.name.getText(file) === 'onClick',
    ) as ts.JsxAttribute;
    const expression = (attribute.initializer as ts.JsxExpression).expression;
    assert.ok(expression);
    evaluate(expression.getText(file))();
  }
  return { markup, introMarkup, actions, click };
}

void test('demo header has one kitchen label and all three actions without the duplicate strip', () => {
  const { markup } = harness();
  assert.equal(markup.match(/<span>样例厨房<\/span>/g)?.length, 1);
  assert.doesNotMatch(markup, /体验样例厨房/);
  assert.equal(markup.match(/<button/g)?.length, 3);
  for (const label of ['重新参观', '恢复初始样例', '返回我的真实厨房'])
    assert.ok(markup.includes(label));
  assert.ok(markup.indexOf('重新参观') < markup.indexOf('恢复初始样例'));
  assert.ok(
    markup.indexOf('恢复初始样例') < markup.indexOf('返回我的真实厨房'),
  );
  assert.doesNotMatch(markup, /本机保存|class="dot"|食材与食忆均为样例/);
  assert.doesNotMatch(source, /className="dataset-banner"/);
  assert.doesNotMatch(css, /\.dataset-banner|\.dot\s*\{/);
});

void test('kitchen switching has the same prominent button treatment in both modes', () => {
  for (const dataset of ['demo', 'real']) {
    const { markup } = harness({ dataset });
    assert.equal(markup.match(/class="primary kitchen-switch"/g)?.length, 1);
    assert.match(
      markup,
      /class="primary kitchen-switch"[^>]*>(?:返回我的真实厨房|先逛逛样例厨房)<\/button>/,
    );
  }
});

void test('sample pages omit the extra eyebrow and today copy uses the requested punctuation', () => {
  for (const page of ['today', 'inventory', 'cooking', 'archive']) {
    const { introMarkup } = harness({ page });
    assert.doesNotMatch(introMarkup, /eyebrow|练习做一餐|不必真的开火/);
  }
  assert.match(harness({ dataset: 'real' }).introMarkup, /从手边食材开始/);
  for (const dataset of ['demo', 'real']) {
    assert.ok(
      harness({ dataset }).introMarkup.includes(
        '<p>冰箱有啥，今天吃啥，挑一道手边就能做的家常菜</p>',
      ),
    );
  }
});

void test('real kitchen does not show sample management and can still switch to demo', () => {
  const view = harness({ dataset: 'real' });
  assert.ok(view.markup.includes('<span>我的厨房</span>'));
  assert.doesNotMatch(view.markup, /我的家庭厨房/);
  assert.equal(view.markup.match(/<button/g)?.length, 1);
  assert.doesNotMatch(view.markup, /重新参观|继续参观|恢复初始样例|本机保存/);
  view.click('先逛逛样例厨房');
  assert.equal(view.actions.dataset, 'demo');
});

void test('moved actions preserve restart, resume, confirmation and kitchen switching', () => {
  const restarted = harness();
  restarted.click('重新参观');
  assert.equal(restarted.actions.tourStep, 0);
  const resumed = harness({ tourPaused: true });
  assert.ok(resumed.markup.includes('继续参观'));
  resumed.click('继续参观');
  assert.equal(resumed.actions.tourStep, 3);
  resumed.click('恢复初始样例');
  assert.equal(
    resumed.actions.reset,
    true,
    'only open the existing confirmation',
  );
  assert.equal(resumed.actions.dataset, '', 'reset does not switch kitchens');
  resumed.click('返回我的真实厨房');
  assert.equal(resumed.actions.dataset, 'real');
});

void test('loading feedback and busy protection remain while saved status is removed', () => {
  const loading = harness({ s: undefined });
  assert.match(loading.markup, /<output>正在打开厨房…<\/output>/);
  assert.doesNotMatch(harness().markup, /<output>/);
  assert.equal(harness({ busy: true }).markup.match(/disabled=""/g)?.length, 3);
});

void test('header can wrap without fixed-height clipping and actions keep usable touch targets', () => {
  const headerRule = css.match(/\.topbar\s*\{([^}]+)\}/)?.[1] ?? '';
  assert.match(headerRule, /min-height:\s*83px/);
  assert.match(headerRule, /flex-wrap:\s*wrap/);
  assert.doesNotMatch(headerRule, /(?:^|[;\n])\s*height:/);
  assert.match(
    css,
    /\.topbar-actions \.text-button\s*\{[^}]*min-height:\s*44px;[^}]*white-space:\s*nowrap;/,
  );
  assert.match(
    css,
    /\.topbar > \.topbar-actions\s*\{[^}]*flex-basis:\s*100%;[^}]*justify-content:\s*flex-start;/,
  );
});

void test('both recommendation headings are centered without their old caption or changing other section heads', () => {
  const headings = nodes.filter(
    (node) =>
      ts.isJsxElement(node) &&
      node.openingElement.tagName.getText(file) === 'div' &&
      node.children.some(
        (child) =>
          ts.isJsxElement(child) &&
          child.openingElement.tagName.getText(file) === 'h2' &&
          child.getText(file).includes('手边食材，能做这些'),
      ),
  );
  assert.equal(headings.length, 2);
  for (const tourStep of [null, 2]) {
    for (const heading of headings) {
      const html = renderToStaticMarkup(
        runInNewContext(
          ts.transpileModule(`(${heading.getText(file)})`, {
            compilerOptions: { jsx: ts.JsxEmit.React },
          }).outputText,
          { React, tourStep },
        ),
      );
      assert.match(
        html,
        /class="section-head recommendation-heading(?: tour-target)?"/,
      );
      assert.match(html, /<h2>手边食材，能做这些<\/h2>/);
      assert.doesNotMatch(html, /<span|规则推荐|最多三道/);
      if (heading === headings[0]) {
        assert.match(html, /id="tour-stop-2"/);
        assert.equal(html.includes('tour-target'), tourStep === 2);
      }
    }
  }
  assert.equal(source.match(/recommendation-heading/g)?.length, 2);
  assert.match(
    css,
    /\.section-head\.recommendation-heading\s*\{\s*justify-content: center;\s*text-align: center;\s*\}/,
  );
  assert.match(css, /\.section-head\s*\{[^}]*justify-content: space-between;/);
});

void test('requested secondary copy is removed while intake buttons and nonempty guidance remain', () => {
  assert.doesNotMatch(
    source,
    /国宴队 · 中华食肆|规则推荐 · 最多三道|食材、油盐和饮用水都需要确认，不会默认你已经拥有。/,
  );
  const panel = nodes.find(
    (node) =>
      ts.isJsxElement(node) &&
      node.openingElement.getText(file) === '<section className="start-panel">',
  );
  assert.ok(panel);
  for (const inventoryUsed of [0, 3]) {
    const html = renderToStaticMarkup(
      runInNewContext(
        ts.transpileModule(`(${panel.getText(file)})`, {
          compilerOptions: { jsx: ts.JsxEmit.React },
        }).outputText,
        { React, inventoryUsed, Mic: () => null, Camera: () => null },
      ),
    );
    assert.match(html, /语音录入食材/);
    assert.match(html, /拍照录入食材/);
    assert.equal(
      html.includes('只有确认过的食材才会出现在推荐里。'),
      inventoryUsed > 0,
    );
    assert.doesNotMatch(html, /<p><\/p>|<\/h2>0/);
  }
});
