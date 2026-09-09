import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { IDBFactory } from 'fake-indexeddb';
import { MealIngredients } from '../components/meal-ingredients';
import { recipes } from '../lib/recipes';
import { IndexedDbStore } from '../lib/store';
import {
  emptyState,
  matching,
  mealIngredients,
  recommendations,
  startCooking,
  stepSession,
  finishCooking,
  type KitchenState,
  type Quantity,
} from '../lib/kitchen';

const date = '2026-09-09';
const recipe = recipes.find((r) => r.id === 'cola_chicken_wings')!;
function stocked(quantity: Quantity = { amountBand: '充足' }): KitchenState {
  const s = emptyState('real');
  s.inventory = recipe.ingredients.map((i) => ({
    id: i.id,
    canonicalIngredientId: i.id,
    displayName: i.name!,
    ...quantity,
    confirmed: true,
    revision: 1,
    createdAt: date,
    updatedAt: date,
  }));
  return s;
}
const feedback = {
  ratings: {
    taste: 5,
    difficulty: 5,
    appearance: 5,
    difficultyScale: 'easy-high' as const,
  },
  memory: '',
};

void test('all required names unlock recommendations and cooking without exact amounts', () => {
  for (const quantity of [
    {},
    { amountBand: '充足' },
    { amountBand: '少量' },
    { amountBand: '即将用完' },
    { amountBand: '有，数量待确认' },
    { amount: 1, unit: '克' },
    { amount: 2, unit: '个' },
  ]) {
    const s = stocked(quantity);
    const before = structuredClone(s.inventory);
    const rec = recommendations(s, date);
    assert.ok(rec.some((item) => item.recipe.id === recipe.id));
    assert.ok(rec.every((item) => item.missing.length === 0));
    assert.ok(
      mealIngredients(s, recipe, [], date).every((i) => i.ready && i.present),
    );
    startCooking(s, recipe.id, 'meal', date);
    assert.equal(s.sessions[0].mealOnlyIngredients, undefined);
    assert.deepEqual(
      s.inventory,
      before,
      'starting never invents stock or quantities',
    );
  }
});

void test('every required ingredient, including seasonings, must actually be available', () => {
  for (const ingredient of recipe.ingredients) {
    for (const reason of ['missing', 'zero', 'used-up', 'expired', 'pending']) {
      const s = stocked();
      const item = s.inventory.find((b) => b.id === ingredient.id)!;
      if (reason === 'missing')
        s.inventory = s.inventory.filter((b) => b !== item);
      if (reason === 'zero') {
        delete item.amountBand;
        item.amount = 0;
        item.unit = ingredient.unit;
      }
      if (reason === 'used-up') item.amountBand = '用完';
      if (reason === 'expired') item.expiryDate = '2026-09-08';
      if (reason === 'pending') Object.assign(item, { confirmed: false });
      assert.equal(
        matching(s, recipe, date).find((i) => i.id === ingredient.id)!.present,
        false,
      );
      assert.ok(
        !recommendations(s, date).some((i) => i.recipe.id === recipe.id),
      );
      assert.throws(() => startCooking(s, recipe.id, 'meal', date), /未备齐/);
      assert.equal(s.sessions.length, 0);
    }
  }
});

void test('legacy aliases and another available batch count without reviving depleted stock', () => {
  const s = stocked();
  const wings = s.inventory[0];
  wings.canonicalIngredientId = 'other';
  wings.displayName = '鸡中翅';
  s.inventory[1].canonicalIngredientId = 'other';
  s.inventory[1].displayName = '普通含糖可乐';
  s.inventory.unshift({ ...wings, id: 'used-up', amountBand: '用完' });
  assert.ok(recommendations(s, date).some((i) => i.recipe.id === recipe.id));
  s.inventory = s.inventory.filter((b) => b.id !== wings.id);
  assert.equal(matching(s, recipe, date)[0].present, false);
});

void test('screenshot quantities survive start, storage reopen and finish without guessed conversions', async () => {
  const s = stocked();
  delete s.inventory[1].amountBand;
  Object.assign(s.inventory[1], { amount: 2, unit: '个' });
  for (const id of ['soy_sauce', 'dark_soy_sauce', 'oil']) {
    const item = s.inventory.find((b) => b.id === id)!;
    const needed = recipe.ingredients.find((i) => i.id === id)!;
    delete item.amountBand;
    Object.assign(item, { amount: needed.amount * 2, unit: needed.unit });
  }
  const unknown = structuredClone(s.inventory.slice(0, 3));
  const factory = new IDBFactory();
  let store = new IndexedDbStore('presence-cooking', factory);
  await store.change('real', (state) => {
    Object.assign(state, s);
    startCooking(state, recipe.id, 'meal', date);
    assert.deepEqual(
      state.sessions[0].stockAllocation!.map((i) => i.batchId),
      ['soy_sauce', 'dark_soy_sauce', 'oil'],
    );
  });
  store.close();
  store = new IndexedDbStore('presence-cooking', factory);
  try {
    await store.change('real', (state) => {
      stepSession(state, 'meal', recipe.steps.length);
      finishCooking(state, 'meal', feedback);
    });
    const saved = await store.read('real');
    assert.deepEqual(saved.inventory.slice(0, 3), unknown);
    assert.equal(saved.sessions[0].status, 'completed');
    assert.equal(saved.sessions[0].mealOnlyIngredients, undefined);
    for (const item of saved.inventory.slice(3))
      assert.equal(
        item.amount,
        recipe.ingredients.find((i) => i.id === item.id)!.amount,
      );
    await store.change('real', (state) =>
      finishCooking(state, 'meal', feedback),
    );
    assert.deepEqual((await store.read('real')).inventory, saved.inventory);
  } finally {
    store.close();
  }
});

void test('unknown quantities render as owned, not as missing grams or per-item confirmations', () => {
  const s = stocked();
  const html = renderToStaticMarkup(
    createElement(MealIngredients, {
      recipe,
      rows: mealIngredients(s, recipe, [], date),
      onToggle: () => {},
    }),
  );
  assert.equal(
    (html.match(/class="meal-owned"/g) || []).length,
    recipe.ingredients.length,
  );
  assert.doesNotMatch(html, /<button|另备|needs-confirmation/);
  assert.match(html, /参考用量/);
});

void test('unconfirmed and depleted duplicates cannot affect ranking or deductions', () => {
  const s = stocked();
  const baseline = recommendations(s, date);
  s.inventory.push(
    Object.assign(
      {
        ...s.inventory[0],
        id: 'pending',
        amountBand: undefined,
        amount: 800,
        unit: '克',
        expiryDate: date,
      },
      { confirmed: false },
    ),
    {
      ...s.inventory[0],
      id: 'zero',
      amountBand: undefined,
      amount: 0,
      unit: '克',
      expiryDate: date,
    },
    { ...s.inventory[0], id: 'depleted', amountBand: '用完', expiryDate: date },
  );
  const before = structuredClone(s.inventory);
  assert.deepEqual(recommendations(s, date), baseline);
  startCooking(s, recipe.id, 'meal', date);
  assert.deepEqual(s.sessions[0].stockAllocation, []);
  stepSession(s, 'meal', recipe.steps.length);
  finishCooking(s, 'meal', feedback);
  assert.deepEqual(s.inventory, before);
});

void test('an empty saved deduction plan never borrows stock added after starting', () => {
  const s = stocked();
  startCooking(s, recipe.id, 'meal', date);
  assert.deepEqual(s.sessions[0].stockAllocation, []);
  s.inventory.push({
    ...s.inventory[0],
    id: 'new-wings',
    amountBand: undefined,
    amount: 800,
    unit: '克',
  });
  const before = structuredClone(s.inventory);
  stepSession(s, 'meal', recipe.steps.length);
  finishCooking(s, 'meal', feedback);
  assert.deepEqual(s.inventory, before);
});
