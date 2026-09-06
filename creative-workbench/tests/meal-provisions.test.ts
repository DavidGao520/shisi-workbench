import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { IDBFactory } from 'fake-indexeddb';
import { MealIngredients } from '../components/meal-ingredients';
import { recipes, RECIPE_VERSION } from '../lib/recipes';
import { IndexedDbStore } from '../lib/store';
import {
  archive,
  completeCooking,
  emptyState,
  mealIngredients,
  mealStockLimit,
  recommendations,
  sessionRemainingPlan,
  startCooking,
  stepSession,
  type Batch,
  type KitchenState,
  type MealConfirmation,
} from '../lib/kitchen';

const date = '2026-09-06';
const recipe = recipes.find((r) => r.id === 'golden_egg')!;
void test('all 70 preset dishes can complete with explicit meal-only provisions and no inventory writes', () => {
  const s = emptyState('real');
  for (const r of recipes) {
    const drafts = mealIngredients(s, r, [], date).map((i) => ({
      ingredientId: i.id,
      token: i.token,
    }));
    startCooking(s, r.id, r.id, date, RECIPE_VERSION, drafts);
    const session = s.sessions[0];
    stepSession(s, session.id, r.steps.length);
    completeCooking(s, session.id, {
      rating: 4,
      memory: '',
      consumption: sessionRemainingPlan(s, session),
    });
    assert.deepEqual(s.inventory, []);
    assert.deepEqual(s.candidates, []);
  }
  assert.equal(archive(s).length, 70);
});
function batch(
  id: string,
  ingredientId = 'egg',
  amount = 1,
  unit = '个',
): Batch {
  return {
    id,
    canonicalIngredientId: ingredientId,
    displayName: ingredientId,
    amount,
    unit,
    revision: 1,
    confirmed: true,
    createdAt: date,
    updatedAt: date,
  };
}
function confirmed(s: KitchenState): MealConfirmation[] {
  return mealIngredients(s, recipe, [], date)
    .filter((i) => !i.enough)
    .map((i) => ({ ingredientId: i.id, token: i.token }));
}
function start(s: KitchenState, confirmations = confirmed(s), id = 'meal') {
  startCooking(s, recipe.id, id, date, RECIPE_VERSION, confirmations);
  return s.sessions[0];
}
function ready(s: KitchenState) {
  const session = start(s);
  stepSession(s, session.id, recipe.steps.length);
  return session;
}
function finish(s: KitchenState) {
  completeCooking(s, s.sessions[0].id, {
    rating: 5,
    memory: '',
    consumption: sessionRemainingPlan(s, s.sessions[0]),
  });
}

void test('empty fridge: confirmations unlock one meal without writing candidates or inventory', () => {
  const s = emptyState('real');
  const drafts = confirmed(s);
  assert.equal(drafts.length, 3);
  assert.ok(mealIngredients(s, recipe, drafts, date).every((i) => i.ready));
  assert.equal(recommendations(s, date).length, 0);
  assert.deepEqual(s.inventory, []);
  assert.deepEqual(s.candidates, []);
  const session = start(s, drafts);
  assert.deepEqual(session.mealOnlyIngredients, [
    { ingredientId: 'egg', amount: 2, unit: '个' },
    { ingredientId: 'oil', amount: 10, unit: '毫升' },
    { ingredientId: 'salt', amount: 1, unit: '克' },
  ]);
  assert.deepEqual(sessionRemainingPlan(s, session), []);
  assert.equal(archive(s).length, 0);
  stepSession(s, session.id, recipe.steps.length);
  finish(s);
  assert.deepEqual(s.inventory, []);
  assert.deepEqual(s.candidates, []);
  assert.equal(archive(s)[0].recipe.id, recipe.id);
  assert.equal(archive(s)[0].history.length, 1);
  finish(s);
  assert.equal(archive(s)[0].history.length, 1);
  assert.ok(
    mealIngredients(s, recipe, [], date).every((i) => !i.ready),
    'next meal starts unconfirmed',
  );
});

void test('partial stock: only the missing portion is temporary and only original stock is deducted', () => {
  const s = emptyState('real');
  s.inventory = [
    batch('one-egg'),
    batch('oil', 'oil', 30, '毫升'),
    batch('salt', 'salt', 5, '克'),
  ];
  const before = structuredClone(s.inventory);
  const session = ready(s);
  assert.deepEqual(session.mealOnlyIngredients, [
    { ingredientId: 'egg', amount: 1, unit: '个' },
  ]);
  assert.deepEqual(s.inventory, before, 'start never deducts or inserts');
  assert.equal(
    session.stockAllocation!.find((i) => i.batchId === 'one-egg')!.amount,
    1,
  );
  finish(s);
  assert.deepEqual(
    s.inventory.map((b) => b.amount),
    [0, 20, 4],
  );
  assert.equal(s.inventory.length, 3);
});

void test('restocking during cooking cannot be consumed again to cover a temporary portion', () => {
  const s = emptyState('real');
  s.inventory = [batch('original')];
  const session = ready(s);
  s.inventory[0].amount = 6;
  s.inventory[0].revision++;
  s.inventory.push(
    batch('new-eggs', 'egg', 5),
    batch('new-oil', 'oil', 100, '毫升'),
  );
  const plan = sessionRemainingPlan(s, session);
  assert.deepEqual(plan, [
    {
      batchId: 'original',
      expectedRevision: 2,
      remaining: { amount: 5, unit: '个' },
    },
  ]);
  assert.equal(mealStockLimit(session, s.inventory[1]), 0);
  finish(s);
  assert.deepEqual(
    s.inventory.map((b) => b.amount),
    [5, 5, 100],
  );
});

void test('fractional stock and later fractional restocks preserve precision without blocking default completion', () => {
  for (const [initial, added] of [
    [1.0004, 0],
    [1, 5.0004],
    [1.0004, 5.0004],
  ]) {
    const s = emptyState('real');
    s.inventory = [batch('oil', 'oil', initial, '毫升')];
    const session = ready(s);
    assert.equal(session.stockAllocation![0].amount, initial);
    assert.equal(
      session.mealOnlyIngredients!.find((i) => i.ingredientId === 'oil')!
        .amount,
      10 - initial,
    );
    s.inventory[0].amount! += added;
    s.inventory[0].revision++;
    finish(s);
    assert.ok(Math.abs(s.inventory[0].amount! - added) < 1e-12);
  }
});

void test('missing, duplicate, forged and stale confirmations cannot bypass readiness', () => {
  const s = emptyState('real');
  const drafts = confirmed(s);
  for (const bad of [
    [],
    drafts.slice(1),
    [...drafts, drafts[0]],
    drafts.map((c, n) => (n ? c : { ...c, token: 'forged' })),
    [...drafts, { ingredientId: 'not-in-recipe', token: 'forged' }],
  ]) {
    assert.throws(() => start(s, bad), /确认/);
    assert.equal(s.sessions.length, 0);
    assert.equal(s.inventory.length, 0);
  }
  s.inventory.push(batch('arrived'));
  assert.throws(() => start(s, drafts), /重新确认/);
  start(s, confirmed(s));
  assert.equal(s.sessions[0].mealOnlyIngredients![0].amount, 1);
});

void test('confirmation binds recipe, dataset, version, amounts and relevant inventory only', () => {
  const s = emptyState('real');
  const drafts = confirmed(s);
  const isReady = (state = s, r = recipe) =>
    mealIngredients(state, r, drafts, date).every((i) => i.ready);
  assert.equal(isReady(emptyState('demo')), false);
  assert.equal(isReady(s, { ...recipe, id: 'another' }), false);
  assert.equal(isReady(s, { ...recipe, workbuddyVersion: 'new-steps' }), false);
  assert.equal(
    isReady(s, {
      ...recipe,
      ingredients: recipe.ingredients.map((i) => ({
        ...i,
        amount: i.amount * 2,
      })),
    }),
    false,
  );
  s.inventory.push(batch('unrelated', 'tomato', 100, '克'));
  assert.equal(isReady(), true);
  s.inventory.push(batch('egg'));
  assert.equal(isReady(), false);
});

void test('expired or imprecise stock is not promoted to exact usable inventory by a meal confirmation', () => {
  const s = emptyState('real');
  s.inventory = [
    { ...batch('expired'), expiryDate: '2026-09-05' },
    batch('boxed-eggs', 'egg', 1, '盒'),
    {
      ...batch('unknown-oil', 'oil', 1, '毫升'),
      amount: undefined,
      amountBand: '有，数量待确认',
    },
  ];
  const before = structuredClone(s.inventory);
  const session = ready(s);
  assert.equal(
    session.mealOnlyIngredients!.find((i) => i.ingredientId === 'egg')!.amount,
    2,
  );
  assert.deepEqual(sessionRemainingPlan(s, session), []);
  finish(s);
  assert.deepEqual(s.inventory, before);
});

void test('cross-midnight expiry invalidates a pre-cook confirmation', () => {
  const s = emptyState('real');
  s.inventory = [{ ...batch('egg'), expiryDate: date }];
  const drafts = confirmed(s);
  assert.ok(mealIngredients(s, recipe, drafts, date).every((i) => i.ready));
  assert.equal(
    mealIngredients(s, recipe, drafts, '2026-09-07')[0].confirmed,
    false,
  );
  assert.throws(
    () =>
      startCooking(s, recipe.id, 'later', '2026-09-07', RECIPE_VERSION, drafts),
    /重新确认/,
  );
});

void test('deleted or retyped original batches remain stale instead of being silently replaced', () => {
  for (const retype of [false, true]) {
    const s = emptyState('real');
    s.inventory = [batch('original')];
    const session = ready(s);
    if (retype) {
      s.inventory[0].unit = '盒';
      s.inventory[0].revision++;
    } else s.inventory = [];
    s.inventory.push(batch('new', 'egg', 5));
    const plan = sessionRemainingPlan(s, session);
    assert.equal(plan[0].batchId, 'original');
    assert.equal(plan[0].expectedRevision, -1);
    assert.throws(() => finish(s), /变化/);
    completeCooking(s, session.id, { rating: 4, memory: '', consumption: [] });
    assert.equal(s.inventory.at(-1)!.amount, 5);
  }
});

void test('manual consumption cannot double-deduct temporary ingredients; failure is atomic', () => {
  const s = emptyState('real');
  s.inventory = [batch('original'), batch('oil', 'oil', 20, '毫升')];
  const session = ready(s);
  s.inventory[0].amount = 6;
  s.inventory[0].revision++;
  s.inventory.push(batch('new', 'egg', 5));
  const before = structuredClone(s);
  const plan = sessionRemainingPlan(s, session);
  const badPlans = [
    plan.map((r) =>
      r.batchId === 'original'
        ? { ...r, remaining: { amount: 4, unit: '个' } }
        : r,
    ),
    [
      ...plan,
      {
        batchId: 'new',
        expectedRevision: 1,
        remaining: { amount: 4, unit: '个' },
      },
    ],
    [...plan, plan[0]],
  ];
  for (const consumption of badPlans) {
    assert.throws(
      () =>
        completeCooking(s, session.id, { rating: 5, memory: '', consumption }),
      /临时确认|重复/,
    );
    assert.deepEqual(s, before);
  }
});

void test('IndexedDB reopen keeps meal-only allocation, draft, atomic stale-write guard and dataset isolation', async () => {
  const factory = new IDBFactory();
  let store = new IndexedDbStore('meal-only', factory);
  await store.change('real', (s) => {
    s.inventory = [batch('original')];
    const session = ready(s);
    session.reviewDraft = {
      rating: 4,
      memory: '一餐',
      consumption: sessionRemainingPlan(s, session),
    };
  });
  store.close();
  store = new IndexedDbStore('meal-only', factory);
  const saved = await store.read('real');
  assert.equal(saved.sessions[0].mealOnlyIngredients!.length, 3);
  await store.change('real', (s) => {
    s.inventory[0].amount = 6;
    s.inventory[0].revision++;
  });
  await assert.rejects(
    store.change('real', (s) =>
      completeCooking(s, 'meal', saved.sessions[0].reviewDraft!),
    ),
    /变化/,
  );
  assert.equal((await store.read('real')).inventory[0].amount, 6);
  await store.change('real', finish);
  assert.equal((await store.read('real')).inventory[0].amount, 5);
  assert.equal((await store.read('demo')).sessions.length, 0);
  assert.equal((await store.read('demo')).inventory.length, 0);
  store.close();
});

void test('ingredient actions are red confirmation and green toggle; history stays read-only', () => {
  const s = emptyState('real');
  const render = (drafts: MealConfirmation[], interactive = true) =>
    renderToStaticMarkup(
      createElement(MealIngredients, {
        recipe,
        rows: mealIngredients(s, recipe, drafts, date),
        onToggle: interactive ? () => {} : undefined,
      }),
    );
  const red = render([]);
  assert.equal((red.match(/needs-confirmation/g) || []).length, 3);
  assert.equal((red.match(/aria-pressed="false"/g) || []).length, 3);
  assert.match(red, />确认拥有</);
  const green = render(confirmed(s));
  assert.equal((green.match(/is-owned/g) || []).length, 3);
  assert.equal((green.match(/aria-pressed="true"/g) || []).length, 3);
  assert.match(green, /已拥有/);
  assert.doesNotMatch(render([], false), /<button|aria-pressed/);
  s.inventory.push(batch('one-egg'));
  assert.match(render([]), /另备 1 个/);
});

void test('page resets per-meal drafts on open, close and dataset change; final checkbox remains required', async () => {
  const page = await readFile(
    new URL('../app/page.tsx', import.meta.url),
    'utf8',
  );
  for (const [begin, end] of [
    ['const openRecipe =', 'const closeRecipe ='],
    ['const closeRecipe =', 'const ingredientRows ='],
    ['const changeDataset =', 'return ('],
  ]) {
    const section = page.split(begin)[1].split(end)[0];
    assert.match(section, /setMealConfirmations\(\[\]\)/);
    assert.match(section, /setFoodChecked\(''\)/);
  }
  assert.match(page, /if \(!foodChecked\) return;/);
  assert.match(page, /ingredientRows\.some\(\(item\) => !item.ready\)/);
  assert.match(page, /sessionRemainingPlan\(s, session\)/);
  assert.doesNotMatch(page, /remainingPlan\(s, r, session.servings\)/);
});
