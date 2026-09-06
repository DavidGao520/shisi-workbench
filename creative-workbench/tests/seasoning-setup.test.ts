import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { SeasoningChecklist } from '../components/seasoning-checklist';
import {
  confirmSeasoningSetup,
  needsSeasoningOnboarding,
  ownedSeasonings,
} from '../lib/seasoning-setup';
import { PRESENT_QUANTITY, seasonings } from '../lib/seasonings';
import { names, recipes } from '../lib/recipes';
import { IndexedDbStore } from '../lib/store';
import {
  confirmCandidate,
  emptyState,
  matching,
  parseImport,
  quantityText,
  recommendations,
  remainingPlan,
  reviewRecipe,
  stage,
  startCooking,
  type KitchenState,
  type Batch,
} from '../lib/kitchen';

const at = '2026-09-05T20:00:00Z',
  date = '2026-09-05';
function confirm(
  state: KitchenState,
  selectedIds = ['oil', 'salt'],
  operationId = 'setup-1',
) {
  return confirmSeasoningSetup(
    state,
    { dataset: state.dataset, selectedIds, operationId },
    at,
    date,
  );
}
function batch(id: string, amount = 100, unit = '克'): Batch {
  return {
    id: 'batch-' + id,
    displayName: names[id],
    canonicalIngredientId: id,
    amount,
    unit,
    revision: 3,
    confirmed: true,
    createdAt: at,
    updatedAt: at,
  };
}
function mealWithUnknownSeasoning() {
  const state = emptyState('real');
  state.inventory = [
    batch('tomato', 800),
    batch('egg', 8, '个'),
    batch('green_pepper', 200),
    batch('water', 1000, '毫升'),
  ];
  state.preferences.equipment = ['炒锅', '汤锅'];
  confirm(state, ['oil', 'salt', 'soy_sauce']);
  return state;
}

void test('catalog has 24 distinct canonical seasonings, not fresh food or staples', () => {
  assert.equal(seasonings.length, 24);
  assert.equal(new Set(seasonings.map((item) => item.id)).size, 24);
  for (const item of seasonings) assert.equal(names[item.id], item.name);
  assert.ok(seasonings.some((item) => item.id === 'rosemary'));
  assert.ok(
    !seasonings.some((item) =>
      ['rice', 'cooked_rice', 'egg', 'tomato'].includes(item.id),
    ),
  );
});
void test('first-render checklist is unchecked and inert until confirmation', () => {
  const state = emptyState('real'),
    before = structuredClone(state);
  let writes = 0;
  const html = renderToStaticMarkup(
    createElement(SeasoningChecklist, {
      state,
      busy: false,
      firstRun: true,
      mutate: async () => {
        writes++;
        return true;
      },
      done: () => {},
    }),
  );
  assert.equal(writes, 0);
  assert.deepEqual(state, before);
  assert.equal((html.match(/aria-checked="false"/g) || []).length, 24);
  assert.ok(!html.includes('aria-checked="true"'));
  assert.match(html, /确认加入 0 种调料/);
  assert.match(html, /暂时跳过/);
});
void test('only selected seasonings are saved with existence, never invented quantities', () => {
  const state = emptyState('real');
  assert.equal(confirm(state, ['salt', 'vinegar', 'rosemary', 'salt']), 3);
  assert.deepEqual(
    state.inventory.map((item) => item.canonicalIngredientId),
    ['salt', 'vinegar', 'rosemary'],
  );
  for (const item of state.inventory) {
    assert.equal(item.amountBand, PRESENT_QUANTITY);
    assert.equal(quantityText(item), PRESENT_QUANTITY);
    assert.equal(item.amount, undefined);
    assert.equal(item.unit, undefined);
    assert.equal(item.expiryDate, undefined);
    assert.equal(item.confirmed, true);
  }
  assert.equal(state.candidates.length, 0);
  assert.equal(state.seasoningSetup?.skipped, false);
});
void test('new and legacy empty real kitchens onboard, existing kitchens and demos do not get interrupted', () => {
  const state = emptyState('real');
  assert.ok(needsSeasoningOnboarding(state));
  delete state.seasoningSetup;
  assert.ok(needsSeasoningOnboarding(state));
  state.inventory.push(batch('egg'));
  assert.ok(!needsSeasoningOnboarding(state));
  assert.ok(!needsSeasoningOnboarding(emptyState('demo')));
});
void test('skip is durable without adding inventory and the checklist can be used later', async () => {
  const store = new IndexedDbStore('skip', new IDBFactory());
  await store.change('real', (state) =>
    confirmSeasoningSetup(
      state,
      {
        dataset: 'real',
        selectedIds: [],
        operationId: 'skip-1',
        skip: true,
      },
      at,
      date,
    ),
  );
  store.close();
  const saved = await store.read('real');
  assert.equal(saved.inventory.length, 0);
  assert.equal(saved.seasoningSetup?.skipped, true);
  assert.ok(!needsSeasoningOnboarding(saved));
  await store.change('real', (state) => confirm(state));
  assert.equal((await store.read('real')).inventory.length, 2);
  store.close();
});
void test('unknown IDs, no selection and a switched kitchen fail without partial mutation', () => {
  const state = emptyState('real'),
    before = structuredClone(state);
  assert.throws(() => confirm(state, ['salt', 'egg']), /未知调料/);
  assert.throws(() => confirm(state, ['salt', '__proto__']), /未知调料/);
  assert.throws(() => confirm(state, []), /勾选/);
  assert.throws(
    () =>
      confirmSeasoningSetup(state, {
        dataset: 'demo',
        selectedIds: ['salt'],
        operationId: 'switched',
      }),
    /厨房已切换/,
  );
  assert.deepEqual(state, before);
});
void test('existing exact and band batches are preserved including dates and revisions', () => {
  const state = emptyState('real');
  state.inventory = [
    batch('salt'),
    { ...batch('oil'), amount: undefined, amountBand: '少量', unit: undefined },
  ];
  state.inventory[0].expiryDate = '2027-01-01';
  const before = structuredClone(state.inventory);
  assert.equal(confirm(state, ['salt', 'oil', 'sugar']), 1);
  assert.deepEqual(state.inventory.slice(0, 2), before);
  assert.equal(ownedSeasonings(state, date).size, 3);
});
void test('expired and exhausted batches are not reused or silently edited', () => {
  const state = emptyState('real');
  state.inventory = [
    { ...batch('salt'), expiryDate: '2026-09-04' },
    batch('oil', 0, '毫升'),
    {
      ...batch('soy_sauce'),
      amount: undefined,
      unit: undefined,
      amountBand: '用完',
    },
  ];
  const before = structuredClone(state.inventory);
  assert.equal(confirm(state, ['salt', 'oil', 'soy_sauce']), 3);
  assert.deepEqual(state.inventory.slice(0, 3), before);
  assert.equal(state.inventory.length, 6);
});
void test('same operation does not add inventory after replay or after a later clear', () => {
  const state = emptyState('real');
  confirm(state);
  const before = structuredClone(state);
  assert.equal(confirm(state), 0);
  assert.deepEqual(state, before);
  state.inventory = [];
  assert.equal(confirm(state), 0);
  assert.equal(state.inventory.length, 0);
  assert.equal(confirm(state, ['salt'], 'new-explicit-selection'), 1);
});
void test('two connections confirming the same or overlapping selections never duplicate ownership', async () => {
  const factory = new IDBFactory();
  const a = new IndexedDbStore('setup-race', factory),
    b = new IndexedDbStore('setup-race', factory);
  await Promise.all([
    a.change('real', (state) => confirm(state, ['oil', 'salt'], 'browser-a')),
    b.change('real', (state) => confirm(state, ['salt', 'sugar'], 'browser-b')),
  ]);
  a.close();
  b.close();
  const saved = await a.read('real');
  assert.equal(saved.inventory.length, 3);
  assert.equal(
    saved.inventory.filter((item) => item.canonicalIngredientId === 'salt')
      .length,
    1,
  );
  assert.equal(saved.seasoningSetup?.receipts.length, 2);
  a.close();
});
void test('setup metadata and inventory roll back together after a late IndexedDB failure', async () => {
  const store = new IndexedDbStore('setup-rollback', new IDBFactory());
  const before = await store.read('real');
  // oxlint-disable-next-line typescript/unbound-method -- Restore after scoped failure injection.
  const original = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (
    ...args: Parameters<IDBObjectStore['put']>
  ) {
    if (this.name === 'meta') throw new Error('injected setup meta failure');
    return original.apply(this, args);
  };
  try {
    await assert.rejects(
      store.change('real', (state) => confirm(state)),
      /injected/,
    );
  } finally {
    IDBObjectStore.prototype.put = original;
  }
  store.close();
  assert.deepEqual(await store.read('real'), before);
  await store.change('real', (state) => confirm(state));
  assert.equal((await store.read('real')).inventory.length, 2);
  store.close();
});
void test('sample reset clears setup metadata without changing the real kitchen', async () => {
  const store = new IndexedDbStore('setup-isolation', new IDBFactory());
  await store.change('real', (state) => confirm(state));
  const real = await store.read('real');
  await store.change('demo', (state) => confirm(state));
  await store.change('demo', (state) =>
    Object.assign(state, emptyState('demo')),
  );
  assert.equal((await store.read('demo')).seasoningSetup, null);
  assert.equal((await store.read('demo')).inventory.length, 0);
  assert.deepEqual(await store.read('real'), real);
  store.close();
});
void test('owned seasonings keep recipes discoverable, but do not authorize cooking or fake deduction', () => {
  const state = mealWithUnknownSeasoning();
  const suggested = recommendations(state, date);
  assert.equal(suggested.length, 3);
  assert.ok(suggested.every((item) => item.missing.length > 0));
  const oil = matching(state, recipes[0], date).find(
    (item) => item.id === 'oil',
  )!;
  assert.equal(oil.enough, false);
  assert.equal(oil.presenceOnly, true);
  assert.equal(oil.have, 0);
  reviewRecipe(state, 'tomato_egg', 'Fixture review');
  assert.throws(
    () => startCooking(state, 'tomato_egg', 'not-ready', date),
    /重新核对/,
  );
  const plan = remainingPlan(state, recipes[0], 1, date);
  assert.ok(
    plan.every(
      (item) =>
        !state.inventory.some(
          (b) => b.id === item.batchId && b.amountBand === PRESENT_QUANTITY,
        ),
    ),
  );
});
void test('missing food and expired seasoning constrain inventory-only suggestions', () => {
  const state = mealWithUnknownSeasoning();
  const baseline = recommendations(state, date);
  assert.ok(baseline.length > 0);
  state.preferences.allergens = ['鸡蛋'];
  state.preferences.equipment = [];
  assert.deepEqual(recommendations(state, date), baseline);
  for (const item of state.inventory.filter(
    (b) => b.amountBand === PRESENT_QUANTITY,
  ))
    item.expiryDate = '2026-09-04';
  assert.equal(recommendations(state, date).length, 0);
  state.inventory = state.inventory.filter(
    (b) => b.amountBand === PRESENT_QUANTITY,
  );
  assert.equal(recommendations(state, date).length, 0);
});
void test('existing manual calibration turns presence into an exact usable amount, without a duplicate batch', () => {
  const state = mealWithUnknownSeasoning();
  for (const id of ['oil', 'salt']) {
    const target = state.inventory.find((b) => b.canonicalIngredientId === id)!;
    const candidates = parseImport(
      JSON.stringify({
        schemaVersion: '1.0',
        requestId: 'calibrate-' + id,
        source: 'manual-form',
        createdAt: at,
        candidates: [
          {
            candidateId: id,
            displayName: names[id],
            amount: 100,
            unit: id === 'oil' ? '毫升' : '克',
          },
        ],
      }),
      'real',
      'stocktake',
    );
    stage(state, candidates);
    confirmCandidate(state, candidates[0].key, {
      name: names[id],
      ingredientId: id,
      quantity: { amount: 100, unit: id === 'oil' ? '毫升' : '克' },
      targetId: target.id,
      targetRevision: target.revision,
    });
    assert.equal(target.amountBand, undefined);
  }
  reviewRecipe(state, 'tomato_egg', 'Fixture review');
  startCooking(state, 'tomato_egg', 'now-ready', date);
  assert.equal(state.sessions.length, 1);
  assert.equal(state.inventory.length, 7);
});
