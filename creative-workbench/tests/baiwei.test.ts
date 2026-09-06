import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { IDBFactory } from 'fake-indexeddb';
import { BaiweiGallery, BaiweiDishArt } from '../components/baiwei-gallery';
import {
  baiweiDishes,
  baiweiCollection,
  completedHistory,
  otherBaiweiRecords,
  savedRecipe,
} from '../lib/baiwei';
import {
  emptyState,
  completeCooking,
  confirmCandidate,
  demoImport,
  parseImport,
  remainingPlan,
  stage,
  startCooking,
  stepSession,
  type KitchenState,
} from '../lib/kitchen';
import { IndexedDbStore } from '../lib/store';
import { recipes, RECIPE_VERSION } from '../lib/recipes';

const date = '2026-09-06';
function golden() {
  const state = emptyState('demo');
  stage(state, parseImport(demoImport(), 'demo', 'stocktake'));
  for (const candidate of state.candidates)
    confirmCandidate(state, candidate.key, {
      name: candidate.displayName,
      ingredientId: candidate.canonicalIngredientId!,
      quantity: { amount: candidate.amount, unit: candidate.unit },
    });
  return state;
}
function finish(state: KitchenState, id: string, recipeId = 'tomato_egg') {
  const recipe = recipes.find((recipe) => recipe.id === recipeId)!;
  startCooking(state, recipeId, id, date);
  stepSession(state, id, recipe.steps.length);
  const review = {
    rating: 4,
    memory: id,
    consumption: remainingPlan(state, recipe, 1, date),
  };
  completeCooking(state, id, review);
  return review;
}
const images = Object.fromEntries(
  baiweiDishes.map((dish) => [dish.id, `/${dish.id}.webp`]),
);

void test('catalog has exactly 70 stable game IDs, stories and matching immutable art', () => {
  assert.equal(baiweiDishes.length, 70);
  assert.equal(new Set(baiweiDishes.map((dish) => dish.id)).size, 70);
  assert.equal(
    readdirSync(new URL('../assets/baiwei/dishes/', import.meta.url)).length,
    70,
  );
  for (const dish of baiweiDishes) {
    assert.ok(dish.name && dish.description && dish.story);
    const bytes = readFileSync(
      new URL(`../${dish.imageFile}`, import.meta.url),
    );
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    assert.equal(
      createHash('sha1')
        .update(`blob ${bytes.length}\0`)
        .update(bytes)
        .digest('hex'),
      dish.imageGitSha,
    );
  }
});

void test('21 self-contained dishes do not receive a second plate, other 49 do', () => {
  assert.equal(baiweiDishes.filter((dish) => dish.selfContained).length, 21);
  assert.equal(baiweiDishes.filter((dish) => dish.soup).length, 14);
  for (const dish of baiweiDishes) {
    const html = renderToStaticMarkup(
      createElement(BaiweiDishArt, {
        dish,
        src: images[dish.id],
        plate: '/plate.webp',
      }),
    );
    assert.equal(html.includes('class="baiwei-plate"'), !dish.selfContained);
    assert.match(html, /class="baiwei-food"/);
    assert.match(html, /is-unlit/);
    assert.ok(html.includes(`width:${dish.rect.width}`));
  }
  assert.equal(
    baiweiDishes.find((dish) => dish.id === 'steamed_rice')!.rect.width,
    '82%',
  );
});

void test('new kitchen renders all 70 unlit dishes without seeding any data', () => {
  const state = emptyState('real');
  const before = structuredClone(state);
  const html = renderToStaticMarkup(
    createElement(BaiweiGallery, {
      state,
      images,
      plate: '/plate.webp',
      onOpenRecipe() {},
    }),
  );
  assert.equal((html.match(/data-dish-id=/g) || []).length, 70);
  assert.equal((html.match(/data-lit="false"/g) || []).length, 70);
  assert.equal((html.match(/is-unlit/g) || []).length, 70);
  assert.match(html, /value="0" max="70"/);
  assert.equal(html.includes('data-lit="true"'), false);
  assert.deepEqual(state, before);
});

void test('cooking, paused and reviewing never light a dish; only completion does', () => {
  const state = golden();
  startCooking(state, 'tomato_egg', 'first', date);
  for (const status of ['cooking', 'paused', 'reviewing'] as const) {
    state.sessions[0].status = status;
    assert.equal(
      baiweiCollection(state).filter((entry) => entry.history.length).length,
      0,
    );
  }
  completeCooking(state, 'first', {
    rating: 5,
    memory: '第一次',
    consumption: remainingPlan(state, recipes[0], 1, date),
  });
  const html = renderToStaticMarkup(
    createElement(BaiweiGallery, {
      state,
      images,
      plate: '/plate.webp',
      onOpenRecipe() {},
    }),
  );
  assert.equal((html.match(/data-lit="true"/g) || []).length, 1);
  assert.match(html, /value="1" max="70"/);
});

void test('repeat completion is idempotent; repeated meals preserve sorted individual records', () => {
  const state = golden();
  const first = finish(state, 'first');
  completeCooking(state, 'first', first);
  state.sessions[0].completedAt = '2026-09-05T10:00:00Z';
  finish(state, 'second');
  state.sessions.find((session) => session.id === 'second')!.completedAt =
    '2026-09-06T10:00:00Z';
  const before = structuredClone(state);
  const entries = baiweiCollection(state);
  assert.equal(entries.filter((entry) => entry.history.length).length, 1);
  assert.deepEqual(
    completedHistory(state, 'tomato_egg').map(
      (session) => session.familyMemory,
    ),
    ['second', 'first'],
  );
  assert.deepEqual(state, before);
});

void test('all 70 preset recipe IDs map to the game catalog, retaining the original soup ID', () => {
  assert.equal(recipes.length, 70);
  assert.equal(RECIPE_VERSION, '2026-09-06-home.1');
  const state = golden();
  finish(state, 'soup', 'tomato_egg_soup');
  const entries = baiweiCollection(state);
  for (const recipe of recipes)
    assert.ok(entries.find((entry) => entry.dish.id === recipe.id)?.recipe);
  assert.equal(
    entries.find((entry) => entry.dish.id === 'tomato_egg_soup')!.history
      .length,
    1,
  );
  assert.equal(
    entries.find((entry) => entry.dish.id === 'tomato_egg')!.history.length,
    0,
  );
  assert.equal(otherBaiweiRecords(state).length, 0);
});

void test('all catalog recipes have methods but never bypass real-kitchen stock checks', () => {
  const state = emptyState('real');
  assert.equal(
    baiweiCollection(state).filter((entry) => !entry.recipe).length,
    0,
  );
  assert.throws(() => startCooking(state, 'boiled_fish', 'fake', date), /库存/);
  assert.equal(state.sessions.length, 0);
});

void test('saved recipes outside the catalog remain reachable without inflating 70-dish progress', () => {
  const state = golden();
  finish(state, 'custom');
  state.sessions[0].recipeId = 'family_special';
  state.sessions[0].recipeSnapshot = {
    ...recipes[0],
    id: 'family_special',
    title: '家传小炒',
    steps: ['当时保存的做法'],
  };
  assert.equal(
    baiweiCollection(state).filter((entry) => entry.history.length).length,
    0,
  );
  const other = otherBaiweiRecords(state);
  assert.equal(other.length, 1);
  assert.equal(other[0].title, '家传小炒');
  assert.deepEqual(savedRecipe(other[0].history[0])!.steps, ['当时保存的做法']);
});

void test('reload keeps completion and legacy snapshots; sample never lights real kitchen', async () => {
  const store = new IndexedDbStore('baiwei-regression', new IDBFactory());
  const state = golden();
  finish(state, 'old-soup', 'tomato_egg_soup');
  delete state.sessions[0].recipeSnapshot;
  const before = structuredClone(state);
  await store.change('demo', (saved) => Object.assign(saved, state));
  store.close();
  const loaded = await store.read('demo');
  assert.deepEqual(loaded.sessions, before.sessions);
  assert.equal(savedRecipe(loaded.sessions[0])!.id, 'tomato_egg_soup');
  assert.equal(
    baiweiCollection(loaded).filter((entry) => entry.history.length).length,
    1,
  );
  assert.equal(
    baiweiCollection(await store.read('real')).filter(
      (entry) => entry.history.length,
    ).length,
    0,
  );
  store.close();
});
