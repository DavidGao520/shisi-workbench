import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { IndexedDbStore } from '../lib/store';
import { recipes, cookingSteps } from '../lib/recipes';
import { legacyRecipes } from '../lib/legacy-recipes';
import { renderBaiweiEntry } from '../lib/archive-export';
import {
  archive,
  completeCooking,
  confirmCandidate,
  demoImport,
  emptyState,
  matching,
  parseImport,
  recommendations,
  rejectCandidate,
  remainingPlan,
  reviewRecipe,
  stage,
  startCooking,
  stepSession,
  type KitchenState,
} from '../lib/kitchen';

const date = '2026-09-05';
void test('legacy two servings still scale their original exact step quantities', () => {
  assert.match(cookingSteps(legacyRecipes[0], 2)[1], /20 毫升/);
  assert.match(cookingSteps(legacyRecipes[0], 2)[3], /60 毫升/);
  assert.match(cookingSteps(legacyRecipes[2], 2)[2], /600 毫升/);
});
void test('archive HTML escapes memories and omits private inventory snapshots', () => {
  const s = ready();
  completeCooking(s, 'meal-1', {
    ...review(s),
    memory: '<script>private()</script>',
  });
  s.sessions[0].inventorySnapshot[0].displayName = 'PRIVATE-INVENTORY-MARKER';
  const html = renderBaiweiEntry(recipes[0], s.sessions[0], 'demo');
  assert.ok(html.includes('&lt;script&gt;private()&lt;/script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('PRIVATE-INVENTORY-MARKER'));
  assert.ok(html.includes('体验样例'));
});
void test('unfinished sessions cannot produce a completed archive export', () => {
  const s = ready();
  assert.throws(
    () => renderBaiweiEntry(recipes[0], s.sessions[0], 'demo'),
    /已完成/,
  );
});
function golden() {
  const s = emptyState('demo');
  stage(s, parseImport(demoImport(), 'demo', 'stocktake'));
  for (const c of s.candidates)
    confirmCandidate(s, c.key, {
      name: c.displayName,
      ingredientId: c.canonicalIngredientId!,
      quantity: { amount: c.amount, unit: c.unit },
    });
  s.preferences.equipment = ['炒锅', '汤锅'];
  return s;
}
function ready(s = golden()) {
  startCooking(s, 'tomato_egg', 'meal-1', date);
  stepSession(s, 'meal-1', recipes[0].steps.length);
  return s;
}
function review(s: KitchenState) {
  return {
    rating: 4,
    memory: '奶奶家的晚饭',
    consumption: remainingPlan(s, recipes[0], 1, date),
  };
}
function input(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({ ...JSON.parse(demoImport()), ...overrides });
}
void test('pending candidates are not inventory or recommendations', () => {
  const s = emptyState('demo');
  stage(s, parseImport(demoImport(), 'demo', 'stocktake'));
  assert.equal(s.inventory.length, 0);
  assert.equal(recommendations(s, date).length, 0);
});
void test('per-candidate confirmation does not lock the remaining envelope', () => {
  const s = emptyState('demo');
  stage(s, parseImport(demoImport(), 'demo', 'stocktake'));
  for (const c of s.candidates.slice(0, 2))
    confirmCandidate(s, c.key, {
      name: c.displayName,
      ingredientId: c.canonicalIngredientId!,
      quantity: { amount: c.amount, unit: c.unit },
    });
  assert.equal(s.inventory.length, 2);
  assert.equal(s.candidates.filter((c) => c.status === 'pending').length, 5);
});
void test('duplicate import and confirmation never adds inventory again', () => {
  const s = golden();
  stage(s, parseImport(demoImport(), 'demo', 'stocktake'));
  const c = s.candidates[0];
  confirmCandidate(s, c.key, {
    name: c.displayName,
    ingredientId: 'tomato',
    quantity: { amount: 999, unit: '克' },
  });
  assert.equal(s.inventory.length, 7);
  assert.equal(s.inventory[0].amount, 800);
});
void test('rejected candidates stay rejected when reimported', () => {
  const s = emptyState('demo'),
    cs = parseImport(demoImport(), 'demo', 'stocktake');
  stage(s, cs);
  rejectCandidate(s, cs[0].key);
  stage(s, parseImport(demoImport(), 'demo', 'stocktake'));
  assert.equal(s.candidates[0].status, 'rejected');
});
void test('import refuses a foreign dataset or operation', () => {
  assert.throws(() => parseImport(demoImport(), 'real', 'stocktake'), /不同/);
  assert.throws(() => parseImport(demoImport(), 'demo', 'restock'), /不一致/);
});
void test('missing adapter metadata is supplied, never trusted as a storage target', () => {
  const d = JSON.parse(demoImport());
  delete d.dataset;
  delete d.mode;
  const cs = parseImport(JSON.stringify(d), 'demo', 'stocktake');
  assert.equal(cs.length, 7);
  assert.equal(cs[0].mode, 'stocktake');
});
void test('import rejects duplicate ids, negative quantities and invalid raw mentions', () => {
  const d = JSON.parse(demoImport());
  d.candidates[1].candidateId = d.candidates[0].candidateId;
  assert.throws(
    () => parseImport(JSON.stringify(d), 'demo', 'stocktake'),
    /重复/,
  );
  assert.throws(
    () =>
      parseImport(
        input({
          candidates: [
            {
              candidateId: 'a',
              displayName: '鸡蛋',
              amount: -1,
              unit: '个',
              warnings: [],
            },
          ],
        }),
        'demo',
        'stocktake',
      ),
    /非负/,
  );
  assert.throws(
    () =>
      parseImport(
        input({
          transcript: '有点青椒',
          candidates: [
            {
              candidateId: 'a',
              displayName: '青椒',
              rawMention: '一点青椒',
              warnings: [],
            },
          ],
        }),
        'demo',
        'stocktake',
      ),
    /不在转写/,
  );
});
void test('unknown quantities and unsupported units are not silently inferred', () => {
  const cs = parseImport(
    input({
      candidates: [
        {
          candidateId: 'a',
          displayName: '剩饭',
          rawMention: '剩饭',
          warnings: [],
        },
        {
          candidateId: 'b',
          displayName: '水',
          amount: 1,
          unit: '瓶',
          warnings: [],
        },
      ],
    }),
    'demo',
    'stocktake',
  );
  assert.equal(cs[0].amount, undefined);
  assert.equal(cs[0].amountBand, undefined);
  assert.equal(cs[0].canonicalIngredientId, 'cooked_rice');
  assert.equal(cs[1].amount, undefined);
  assert.match(cs[1].warnings.join(), /原单位/);
});
void test('incoming confirmed flag never becomes a confirmation', () => {
  const cs = parseImport(
    input({
      candidates: [
        {
          candidateId: 'x',
          displayName: '鸡蛋',
          amount: 2,
          unit: '个',
          confirmed: true,
          warnings: [],
        },
      ],
    }),
    'demo',
    'stocktake',
  );
  assert.equal(cs[0].status, 'pending');
});
void test('stocktake calibrates instead of restocking and preserves unseen food', () => {
  const s = golden(),
    b = s.inventory[0];
  stage(s, parseImport(input({ requestId: 'new-photo' }), 'demo', 'stocktake'));
  const c = s.candidates.find((c) => c.requestId === 'new-photo')!;
  confirmCandidate(s, c.key, {
    name: '番茄',
    ingredientId: 'tomato',
    quantity: { amount: 200, unit: '克' },
    targetId: b.id,
    targetRevision: b.revision,
  });
  assert.equal(s.inventory[0].amount, 200);
  assert.equal(s.inventory.length, 7);
});
void test('restocking adds only compatible units and dates', () => {
  const s = golden(),
    b = s.inventory[0];
  stage(
    s,
    parseImport(
      input({ requestId: 'restock', mode: 'restock' }),
      'demo',
      'restock',
    ),
  );
  const c = s.candidates.find((c) => c.requestId === 'restock')!;
  assert.throws(
    () =>
      confirmCandidate(s, c.key, {
        name: '番茄',
        ingredientId: 'tomato',
        quantity: { amount: 2, unit: '个' },
        targetId: b.id,
        targetRevision: b.revision,
      }),
    /相同/,
  );
  confirmCandidate(s, c.key, {
    name: '番茄',
    ingredientId: 'tomato',
    quantity: { amount: 200, unit: '克' },
    targetId: b.id,
    targetRevision: b.revision,
  });
  assert.equal(b.amount, 1000);
});
void test('ten golden runs produce identical three recommendations', () => {
  const s = golden();
  const baseline = recommendations(s, date).map((x) => [
    x.recipe.id,
    x.score,
    x.missing.length,
  ]);
  assert.equal(baseline.length, 3);
  for (let i = 0; i < 10; i++)
    assert.deepEqual(
      recommendations(s, date).map((x) => [
        x.recipe.id,
        x.score,
        x.missing.length,
      ]),
      baseline,
    );
});
void test('inventory-only recommendations and cooking ignore legacy hidden preferences', () => {
  const s = golden();
  const baseline = recommendations(s, date);
  s.preferences.allergens = ['鸡蛋'];
  s.preferences.equipment = [];
  s.preferences.dislikedIngredients = ['green_pepper'];
  s.preferences.minutes = 0;
  s.preferences.servings = 2;
  assert.deepEqual(recommendations(s, date), baseline);
  startCooking(s, 'tomato_egg', 'new-meal', date);
  assert.equal(s.sessions[0].servings, 1);
  assert.deepEqual(
    matching(s, recipes[0], date),
    baseline.find((r) => r.recipe.id === 'tomato_egg')!.matches,
  );
});
void test('existing cooking sessions retain their saved portions after preference UI removal', () => {
  const s = golden();
  startCooking(s, 'tomato_egg', 'saved-meal', date);
  s.sessions[0].servings = 2;
  const restored = structuredClone(s);
  assert.equal(restored.sessions[0].servings, 2);
  assert.match(
    cookingSteps(recipes[0], restored.sessions[0].servings)[1],
    /20 毫升/,
  );
});
void test('expired batch is excluded while another valid batch still counts', () => {
  const s = golden();
  const b = s.inventory.find((b) => b.canonicalIngredientId === 'egg')!;
  b.expiryDate = '2026-09-04';
  assert.equal(
    matching(s, recipes[0], date).find((m) => m.id === 'egg')!.enough,
    false,
  );
  s.inventory.push({ ...b, id: 'fresh-eggs', expiryDate: '2026-09-10' });
  assert.equal(
    matching(s, recipes[0], date).find((m) => m.id === 'egg')!.enough,
    true,
  );
});
void test('ambiguous bands and boxes do not count as exact eggs', () => {
  const s = golden(),
    b = s.inventory.find((b) => b.canonicalIngredientId === 'egg')!;
  b.unit = '盒';
  assert.equal(
    matching(s, recipes[0], date).find((m) => m.id === 'egg')!.enough,
    false,
  );
});
void test('draft recipes cannot start real cooking until actual review is recorded', () => {
  const s = golden();
  s.dataset = 'real';
  assert.throws(() => startCooking(s, 'tomato_egg', 'real-1', date), /人工/);
  reviewRecipe(s, 'tomato_egg', '测试审校人');
  startCooking(s, 'tomato_egg', 'real-1', date);
  assert.equal(s.sessions[0].status, 'cooking');
});
void test('progress never consumes food; only confirmed completion does', () => {
  const s = ready();
  assert.equal(
    s.inventory.find((b) => b.canonicalIngredientId === 'egg')!.amount,
    8,
  );
  completeCooking(s, 'meal-1', review(s));
  assert.equal(
    s.inventory.find((b) => b.canonicalIngredientId === 'egg')!.amount,
    8 - recipes[0].ingredients.find((item) => item.id === 'egg')!.amount,
  );
  assert.equal(archive(s).length, 1);
});
void test('duplicate completion is idempotent even with stale original quantities', () => {
  const s = ready(),
    payload = review(s);
  completeCooking(s, 'meal-1', payload);
  completeCooking(s, 'meal-1', payload);
  assert.equal(
    s.inventory.find((b) => b.canonicalIngredientId === 'egg')!.amount,
    8 - recipes[0].ingredients.find((item) => item.id === 'egg')!.amount,
  );
  assert.equal(s.sessions.filter((x) => x.status === 'completed').length, 1);
});
void test('revision conflict does not partially change any earlier batch', () => {
  const s = ready(),
    payload = review(s);
  s.inventory.find((b) => b.id === payload.consumption.at(-1)!.batchId)!
    .revision++;
  const before = structuredClone(s);
  assert.throws(() => completeCooking(s, 'meal-1', payload), /已变化/);
  assert.deepEqual(s, before);
});
void test('negative or inflated remaining quantities abort completion', () => {
  const s = ready(),
    payload = review(s);
  payload.consumption[0].remaining.amount = -1;
  assert.throws(() => completeCooking(s, 'meal-1', payload), /非负/);
  payload.consumption[0].remaining.amount = 99999;
  assert.throws(() => completeCooking(s, 'meal-1', payload), /大于/);
  assert.equal(archive(s).length, 0);
});
void test('same dish twice creates history but just one archive entry', () => {
  const s = ready();
  completeCooking(s, 'meal-1', review(s));
  startCooking(s, 'tomato_egg', 'meal-2', date);
  stepSession(s, 'meal-2', recipes[0].steps.length);
  completeCooking(s, 'meal-2', review(s));
  assert.equal(archive(s).length, 1);
  assert.equal(archive(s)[0].history.length, 2);
});
void test('HTML-like user memories stay inert data; active content cannot be a photo', () => {
  const s = ready();
  const payload = {
    ...review(s),
    memory: '<script>alert(1)</script>',
    photo: 'data:image/svg+xml;base64,AAAA',
  };
  assert.throws(() => completeCooking(s, 'meal-1', payload), /照片/);
  delete (payload as { photo?: string }).photo;
  completeCooking(s, 'meal-1', payload);
  assert.equal(s.sessions[0].familyMemory, '<script>alert(1)</script>');
});
void test('IndexedDB closes and reopens with exact confirmed marker and progress', async () => {
  const f = new IDBFactory(),
    store = new IndexedDbStore('reopen', f);
  await store.change('demo', (s) => Object.assign(s, ready()));
  store.close();
  const reopened = new IndexedDbStore('reopen', f);
  const saved = await reopened.read('demo');
  assert.equal(saved.sessions[0].id, 'meal-1');
  assert.equal(saved.sessions[0].status, 'reviewing');
  assert.equal(saved.inventory.length, 7);
  reopened.close();
});
void test('real and sample stores are isolated and reset preserves real data', async () => {
  const store = new IndexedDbStore('isolation', new IDBFactory());
  await store.change('real', (s) => {
    s.preferences.minutes = 30;
  });
  await store.change('demo', (s) => Object.assign(s, golden()));
  await store.change('demo', (s) => Object.assign(s, emptyState('demo')));
  assert.equal((await store.read('real')).preferences.minutes, 30);
  assert.equal((await store.read('demo')).inventory.length, 0);
  store.close();
});
void test('four-store transaction abort rolls back inventory and archive after write failure', async () => {
  const store = new IndexedDbStore('atomic', new IDBFactory());
  await store.change('demo', (s) => Object.assign(s, ready()));
  const before = await store.read('demo');
  // oxlint-disable-next-line typescript/unbound-method -- Captured solely for apply(this, args) and restoring the prototype after failure injection.
  const original = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (
    ...args: Parameters<IDBObjectStore['put']>
  ) {
    if (this.name === 'sessions')
      throw new Error('injected failure after inventory put');
    return original.apply(this, args);
  };
  try {
    await assert.rejects(
      store.change('demo', (s) => completeCooking(s, 'meal-1', review(s))),
      /injected/,
    );
  } finally {
    IDBObjectStore.prototype.put = original;
  }
  store.close();
  const after = await store.read('demo');
  assert.deepEqual(after, before);
  assert.equal(archive(after).length, 0);
  store.close();
});
void test('concurrent repeated completion commits once across connections', async () => {
  const f = new IDBFactory(),
    a = new IndexedDbStore('race', f),
    b = new IndexedDbStore('race', f);
  await a.change('demo', (s) => Object.assign(s, ready()));
  const snapshot = await a.read('demo'),
    payload = review(snapshot);
  await Promise.all([
    a.change('demo', (s) => completeCooking(s, 'meal-1', payload)),
    b.change('demo', (s) => completeCooking(s, 'meal-1', payload)),
  ]);
  const final = await a.read('demo');
  assert.equal(
    final.inventory.find((b) => b.canonicalIngredientId === 'egg')!.amount,
    8 - recipes[0].ingredients.find((item) => item.id === 'egg')!.amount,
  );
  assert.equal(archive(final)[0].history.length, 1);
  a.close();
  b.close();
});
