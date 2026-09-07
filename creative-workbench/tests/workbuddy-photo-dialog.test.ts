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
function evaluate(code: string, context: Record<string, unknown>) {
  return runInNewContext(
    ts.transpileModule(`(${code})`, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.React,
      },
    }).outputText,
    { React, ...context },
  );
}

void test('only local photo hides the mode selector; manual, voice and cloud photo retain it', () => {
  const selector = nodes.find(
    (node) =>
      ts.isBinaryExpression(node) &&
      node.getText(file).includes('这次是在盘点，还是补货？'),
  );
  assert.ok(selector);
  for (const [dialog, photoService, visible] of [
    ['workbuddy', 'local', false],
    ['manual', 'local', true],
    ['voice', 'local', true],
    ['workbuddy', 'cloud', true],
  ]) {
    const result = evaluate(selector.getText(file), {
      dialog,
      photoService,
      mode: 'restock',
      setMode: () => {},
      Choice: () => null,
    });
    assert.equal(!!result, visible);
  }
});

void test('new local photo tasks use stocktake for both kitchens regardless of prior input mode', () => {
  const button = nodes.find(
    (node) =>
      ts.isJsxElement(node) &&
      node.openingElement.tagName.getText(file) === 'button' &&
      node.getText(file).includes('bridge.begin('),
  ) as ts.JsxElement;
  assert.ok(button);
  const attribute = (name: string) => {
    const attr = button.openingElement.attributes.properties.find(
      (p) => ts.isJsxAttribute(p) && p.name.getText(file) === name,
    ) as ts.JsxAttribute;
    return (attr.initializer as ts.JsxExpression).expression!.getText(file);
  };
  for (const dataset of ['real', 'demo']) {
    const calls: unknown[][] = [];
    const bridge = {
      connection: 'connected',
      busy: false,
      status: { active: null, otherActive: false },
      begin: (...args: unknown[]) => calls.push(args),
    };
    const context = { dataset, mode: 'restock', bridge };
    assert.equal(evaluate(attribute('disabled'), context), false);
    evaluate(attribute('onClick'), context)();
    assert.deepEqual(calls, [[dataset, 'stocktake']]);
    for (const lock of [
      { busy: true },
      { connection: 'offline' },
      { status: { active: { mode: 'restock' } } },
      { status: { otherActive: true } },
    ]) {
      assert.equal(
        evaluate(attribute('disabled'), {
          ...context,
          bridge: { ...bridge, ...lock },
        }),
        true,
      );
    }
  }
});

void test('prompt copies exact visible text and reports clipboard failure without false success', async () => {
  const component = nodes.find(
    (node) =>
      ts.isFunctionDeclaration(node) &&
      node.name?.text === 'WorkBuddyPhotoPrompt',
  );
  assert.ok(component);
  for (const clipboardAvailable of [true, false]) {
    let state = 'idle';
    const copied: string[] = [];
    const render = evaluate(component.getText(file), {
      Check: () => null,
      Copy: () => null,
      useState: () => [
        state,
        (next: string) => {
          state = next;
        },
      ],
      navigator: clipboardAvailable
        ? {
            clipboard: {
              writeText: async (text: string) => {
                copied.push(text);
              },
            },
          }
        : {},
    });
    const tree = render();
    const markup = renderToStaticMarkup(tree);
    assert.match(markup, /当前的照片识别任务/);
    assert.match(markup, /待确认区/);
    assert.match(markup, /看不清的内容请留空/);
    const header = tree.props.children[0];
    const button = header.props.children[1];
    const prompt = tree.props.children[1].props.children;
    await button.props.onClick();
    if (clipboardAvailable) {
      assert.deepEqual(copied, [prompt]);
      assert.match(renderToStaticMarkup(render()), /已复制/);
    } else {
      assert.equal(copied.length, 0);
      assert.match(renderToStaticMarkup(render()), /请选中上方提示词手动复制/);
      assert.doesNotMatch(renderToStaticMarkup(render()), /已复制/);
    }
  }
});

void test('local photo dialog has the concise prompt, centered action and no old review shortcut', () => {
  assert.match(source, /本地连接已就绪/);
  assert.match(
    source,
    /先点「准备接收照片识别」，再把照片和下方提示词一起发给 WorkBuddy/,
  );
  assert.match(source, /<WorkBuddyPhotoPrompt\s*\/>/);
  assert.match(source, /className="actions workbuddy-photo-actions"/);
  assert.match(
    css,
    /\.actions\.workbuddy-photo-actions\s*\{[^}]*justify-content:\s*center/,
  );
  assert.match(
    css,
    /\.workbuddy-photo-prompt-text\s*\{[^}]*user-select:\s*text/,
  );
  assert.doesNotMatch(
    source,
    /查看待确认食材|在这里准备接收，锁定本次厨房和盘点方式|修改上方选项不会改变/,
  );
  assert.match(source, /bridge\.cancel\(\)/);
  assert.match(source, /bridge\.status\.active\.mode === 'restock'/);
});
