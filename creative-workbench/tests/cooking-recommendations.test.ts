import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { emptyState, recommendations } from '../lib/kitchen';
import { restoreDemoKitchen } from '../lib/demo-kitchen';
import { names, type Recipe } from '../lib/recipes';

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
const component = nodes.find(
  (node) =>
    ts.isFunctionDeclaration(node) &&
    node.name?.text === 'RecipeRecommendations',
)!;
assert.ok(component);
const usages = nodes.filter(
  (node): node is ts.JsxSelfClosingElement =>
    ts.isJsxSelfClosingElement(node) &&
    node.tagName.getText(file) === 'RecipeRecommendations',
);
const idleBranch = nodes.find(
  (node): node is ts.ConditionalExpression =>
    ts.isConditionalExpression(node) &&
    node.condition.getText(file) === '!session',
)!;
assert.ok(idleBranch);

function harness(rec: ReturnType<typeof recommendations>, inventoryUsed = 0) {
  const opened: string[] = [];
  let inventoryOpens = 0;
  const context = {
    React,
    names,
    rec,
    inventoryUsed,
    CookingPot: () => null,
    ChefHat: () => null,
    ArrowUpRight: () => null,
    RecipeArt: ({ recipe }: { recipe: Recipe }) =>
      React.createElement('span', { 'data-dish': recipe.id }),
    openRecipe: (recipe: Recipe) => {
      opened.push(recipe.id);
    },
    navigate: (page: string) => {
      assert.equal(page, 'inventory');
      inventoryOpens++;
    },
  };
  const evaluate = (code: string) =>
    runInNewContext(
      ts.transpileModule(code, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.React,
        },
      }).outputText,
      context,
    );
  evaluate(component.getText(file));
  const views = usages.map(
    (node) => evaluate('(' + node.getText(file) + ')') as React.ReactElement,
  );
  const tree = evaluate(
    'RecipeRecommendations({ rec, inventoryUsed, onOpenRecipe: openRecipe, onOpenInventory: () => navigate("inventory") })',
  ) as React.ReactElement;
  const buttons: React.ReactElement<{
    onClick: () => void;
    children?: React.ReactNode;
  }>[] = [];
  function collect(children: React.ReactNode) {
    React.Children.forEach(children, (child) => {
      if (
        !React.isValidElement<{
          onClick: () => void;
          children?: React.ReactNode;
        }>(child)
      )
        return;
      if (child.type === 'button') buttons.push(child);
      collect(child.props.children);
    });
  }
  collect(tree);
  return { views, buttons, opened, inventoryOpens: () => inventoryOpens };
}

void test('today and idle cooking render the same three recommendations for the selected kitchen', () => {
  const demo = emptyState('demo');
  restoreDemoKitchen(demo, '2026-09-07');
  // Both datasets pass their selected state through the same selector and UI.
  for (const state of [
    demo,
    { ...structuredClone(demo), dataset: 'real' as const },
  ]) {
    const before = structuredClone(state);
    const rec = recommendations(state, '2026-09-07');
    const view = harness(rec, state.inventory.length);
    assert.equal(view.views.length, 2);
    const markup = view.views.map((element) => renderToStaticMarkup(element));
    assert.equal(markup[0], markup[1]);
    assert.equal(markup[0].match(/class="recipe-card"/g)?.length, 3);
    assert.equal(markup[0].match(/食材已齐/g)?.length, 3);
    assert.ok(markup[0].indexOf('水煮鱼') < markup[0].indexOf('红烧肉'));
    assert.ok(markup[0].indexOf('红烧肉') < markup[0].indexOf('白菜豆腐汤'));
    view.buttons.forEach((button) => button.props.onClick());
    assert.deepEqual(
      view.opened,
      rec.flatMap(({ recipe }) => [recipe.id, recipe.id]),
    );
    assert.deepEqual(
      state,
      before,
      'display and selection must not start a meal or change stock',
    );
  }
});

void test('shared recommendations preserve empty and missing-ingredient states', () => {
  for (const inventoryUsed of [0, 2]) {
    const view = harness([], inventoryUsed);
    const markup = renderToStaticMarkup(view.views[1]);
    assert.ok(
      markup.includes(
        inventoryUsed ? '暂时没有符合条件的推荐' : '先确认食材，再给你推荐',
      ),
    );
    assert.doesNotMatch(markup, /recipe-card/);
    view.buttons[0].props.onClick();
    assert.equal(view.inventoryOpens(), 1);
  }
  const demo = emptyState('demo');
  restoreDemoKitchen(demo, '2026-09-07');
  const rec = recommendations(demo, '2026-09-07').slice(0, 1);
  rec[0].missing = [{ ...rec[0].matches[0], enough: false, have: 0 }];
  const view = harness(rec, 1);
  const markup = renderToStaticMarkup(view.views[1]);
  assert.match(markup, /还需确认食材/);
  assert.match(markup, /还缺 \/ 待确认/);
  assert.doesNotMatch(markup, /食材已齐/);
});

void test('cooking recommendations follow the choose button only in the idle branch, with one original tour target', () => {
  assert.equal(usages.length, 2);
  assert.ok(
    usages[1].pos > idleBranch.whenTrue.pos &&
      usages[1].end < idleBranch.whenTrue.end,
  );
  const idle = idleBranch.whenTrue.getText(file);
  assert.ok(
    idle.indexOf('去选一道菜') < idle.indexOf('<RecipeRecommendations'),
  );
  assert.match(idle, /<\/div>\s*<div className="section-head">/);
  assert.doesNotMatch(
    idleBranch.whenFalse.getText(file),
    /RecipeRecommendations/,
  );
  const parent = idleBranch.parent as ts.ConditionalExpression;
  assert.ok(ts.isConditionalExpression(parent));
  assert.equal(parent.condition.getText(file), 'tourStep === 3');
  assert.doesNotMatch(parent.whenTrue.getText(file), /RecipeRecommendations/);
  assert.equal(source.match(/id="tour-stop-2"/g)?.length, 1);
  assert.doesNotMatch(
    component.getText(file),
    /startCooking|mutate|stepSession|setSession/,
  );
});
