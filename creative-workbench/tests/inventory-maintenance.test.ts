import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { IDBFactory } from 'fake-indexeddb';
import * as kitchen from '../lib/kitchen';
import { IndexedDbStore } from '../lib/store';
import { recipes } from '../lib/recipes';
import type { Batch, KitchenState, Session } from '../lib/kitchen';

const source = readFileSync(
  new URL('../app/page.tsx', import.meta.url),
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
const inventoryNode = [...nodes]
  .reverse()
  .find(
    (node) =>
      ts.isConditionalExpression(node) &&
      node.getText(file).includes('className="inventory-grid"'),
  )!;
const clearNode = nodes.find(
  (node) =>
    ts.isJsxElement(node) &&
    node.openingElement.tagName.getText(file) === 'AlertDialogContent',
)!;
assert.ok(inventoryNode && clearNode);

function batch(id: string, quantity: kitchen.Quantity): Batch {
  return {
    id,
    displayName: id,
    canonicalIngredientId: id,
    ...quantity,
    confirmed: true,
    revision: 1,
    createdAt: '2026-09-08',
    updatedAt: '2026-09-08',
  };
}
function meal(status: Session['status']): Session {
  return {
    id: 'meal-1',
    recipeId: recipes[0].id,
    recipeVersion: 'test',
    recipeSnapshot: recipes[0],
    servings: 1,
    status,
    step: 0,
    createdAt: '2026-09-08',
    inventorySnapshot: [],
  };
}
function evaluate(node: ts.Node, context: Record<string, unknown>) {
  return runInNewContext(
    ts.transpileModule(`(${node.getText(file)})`, {
      compilerOptions: {
        jsx: ts.JsxEmit.React,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    { React, ...context },
  );
}
function inventoryMarkup(s: KitchenState, useArtwork: boolean) {
  return renderToStaticMarkup(
    evaluate(inventoryNode, {
      s,
      inventory: kitchen.remainingInventory(s),
      busy: false,
      isExpired: kitchen.isExpired,
      quantityText: kitchen.quantityText,
      getPantryCardArt: () => useArtwork,
      KitchenIngredientCard: ({ name }: { name: string }) =>
        React.createElement('article', null, name),
      Refrigerator: () => null,
      calibrateBatch: () => {},
    }),
  );
}
function clearDialog(s: KitchenState, busy = false, reset = false) {
  const actions = { clear: true, reset, page: 'inventory' };
  const session = kitchen.activeSession(s);
  const context = {
    s,
    session,
    sessionDish: recipes[0],
    dataset: s.dataset,
    busy,
    reset,
    AlertDialogContent: 'section',
    AlertDialogTitle: 'h2',
    AlertDialogDescription: 'p',
    AlertDialogCancel: 'button',
    setClear: (value: boolean) => {
      actions.clear = value;
    },
    setReset: (value: boolean) => {
      actions.reset = value;
    },
    navigate: (page: string) => {
      actions.page = page;
    },
  };
  return {
    actions,
    context,
    html: renderToStaticMarkup(evaluate(clearNode, context)),
  };
}

void test('depleted stock disappears from artwork and fallback cards without deleting records', () => {
  assert.match(
    source,
    /const inventory = s \? remainingInventory\(s\) : \[\];/,
  );
  assert.match(source, /const inventoryUsed = inventory.length;/);
  const s = kitchen.emptyState('real');
  s.inventory = [
    batch('鸡蛋', { amount: 3, unit: '个' }),
    batch('食用油', { amountBand: '用完' }),
    batch('零数量', { amount: 0, unit: '克' }),
    batch('有待核对', { amountBand: '有，数量待确认' }),
    batch('即将用完', { amountBand: '即将用完' }),
    { ...batch('已过期', { amount: 1, unit: '克' }), expiryDate: '2020-01-01' },
  ];
  const before = structuredClone(s);
  for (const artwork of [true, false]) {
    const html = inventoryMarkup(s, artwork);
    assert.doesNotMatch(html, /食用油|零数量/);
    for (const name of ['鸡蛋', '有待核对', '即将用完', '已过期'])
      assert.ok(html.includes(name));
  }
  assert.deepEqual(
    s,
    before,
    'display filtering keeps audit history and backups intact',
  );
});

void test('an entirely depleted pantry renders the empty state after saving and reloading', async () => {
  const db = new IndexedDbStore('depleted-pantry', new IDBFactory());
  try {
    await db.change('demo', (s) => {
      s.inventory = [
        batch('食用油', { amountBand: '用完' }),
        batch('鸡蛋', { amount: 0, unit: '个' }),
      ];
    });
    const loaded = await db.read('demo');
    assert.equal(kitchen.remainingInventory(loaded).length, 0);
    assert.match(inventoryMarkup(loaded, true), /冰箱还空着/);
    assert.doesNotMatch(inventoryMarkup(loaded, true), /inventory-grid/);
  } finally {
    db.close();
  }
});

void test('clear dialog explains every unfinished meal state and links back to that meal', () => {
  for (const status of ['cooking', 'paused', 'reviewing'] as const) {
    const s = kitchen.emptyState('real');
    s.sessions = [meal(status)];
    const { html, context, actions } = clearDialog(s);
    assert.ok(html.includes(recipes[0].title));
    assert.match(html, /备份不会结束这餐/);
    assert.match(html, /<button[^>]*disabled=""[^>]*>确认清空库存<\/button>/);
    const buttonNode = nodes.find(
      (node) =>
        ts.isJsxElement(node) &&
        node.pos > clearNode.pos &&
        node.end < clearNode.end &&
        node.openingElement.tagName.getText(file) === 'button' &&
        node.getText(file).includes("navigate('cooking')"),
    );
    assert.ok(
      buttonNode,
      'provide a working recovery action, not only disabled text',
    );
    const button = evaluate(buttonNode, context) as React.ReactElement<{
      onClick: () => void;
      disabled: boolean;
    }>;
    assert.equal(button.props.disabled, false);
    button.props.onClick();
    assert.deepEqual(actions, { clear: false, reset: false, page: 'cooking' });
  }
});

void test('completed meals do not block clearing, while busy state still does', () => {
  const s = kitchen.emptyState('real');
  s.sessions = [meal('completed')];
  assert.doesNotMatch(clearDialog(s).html, /disabled|备份不会结束这餐/);
  assert.match(
    clearDialog(s, true).html,
    /<button[^>]*disabled=""[^>]*>确认清空库存<\/button>/,
  );
  s.sessions = [meal('paused')];
  assert.doesNotMatch(clearDialog(s, false, true).html, /备份不会结束这餐/);
});

void test('clear guard rejects unfinished meals even after a backup, without partial writes', async () => {
  const db = new IndexedDbStore('clear-guard', new IDBFactory());
  try {
    for (const status of ['cooking', 'paused', 'reviewing'] as const) {
      const before = await db.change('real', (s) => {
        s.inventory = [batch('egg', { amount: 3, unit: '个' })];
        s.sessions = [meal(status)];
      });
      JSON.stringify({
        format: 'zhonghua-shisi-backup',
        version: 1,
        state: before,
      });
      await assert.rejects(
        db.change('real', kitchen.clearKitchenInventory),
        /请先完成/,
      );
      assert.deepEqual(await db.read('real'), before);
    }
  } finally {
    db.close();
  }
});

void test('clear removes only current inventory and pending candidates, retaining completed meals and the other kitchen', async () => {
  const db = new IndexedDbStore('clear-preserves-records', new IDBFactory());
  try {
    const demo = await db.change('demo', (s) => {
      s.inventory = [batch('demo-egg', { amount: 3, unit: '个' })];
    });
    const before = await db.change('real', (s) => {
      s.inventory = [batch('egg', { amount: 3, unit: '个' })];
      s.sessions = [meal('completed')];
      kitchen.stage(
        s,
        kitchen.parseImport(kitchen.demoImport(), 'demo', 'stocktake'),
      );
      s.candidates[0].status = 'rejected';
      s.candidates[1].status = 'confirmed';
      s.bridgeIgnoredTicketIds = ['ignore-old-photo'];
    });
    const result = await db.change('real', kitchen.clearKitchenInventory);
    assert.deepEqual(result.inventory, []);
    assert.deepEqual(
      result.candidates,
      before.candidates.filter((c) => c.status !== 'pending'),
    );
    assert.deepEqual(result.sessions, before.sessions);
    assert.deepEqual(
      result.bridgeIgnoredTicketIds,
      before.bridgeIgnoredTicketIds,
    );
    assert.deepEqual(await db.read('demo'), demo);
    assert.match(
      source,
      /clearKitchenInventory\(state\)/,
      'UI uses the same guarded operation',
    );
  } finally {
    db.close();
  }
});
