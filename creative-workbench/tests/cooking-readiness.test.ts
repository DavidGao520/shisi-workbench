import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { IDBFactory } from 'fake-indexeddb';
import { recipes, RECIPE_VERSION } from '../lib/recipes';
import {
  archive,
  completeCooking,
  emptyState,
  mealIngredients,
  recipeFor,
  sessionRecipe,
  sessionRemainingPlan,
  startCooking,
  stepSession,
} from '../lib/kitchen';
import {
  cookingRequest,
  receiveCookingSteps,
  type CookingDelivery,
} from '../lib/workbuddy-cooking';
import { IndexedDbStore } from '../lib/store';

// Exercise the actual JSX gate rather than a separate copy of its conditions.
const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const gate = page.match(
  /disabled=\{\s*(busy\s*\|\|\s*!!session[^{}]*?ingredientRows\.some\(\(item\) => !item\.ready\))\s*\}/,
);
assert.ok(gate, 'locate the recipe start button readiness expression');
const disabled = (context: Record<string, unknown>): boolean =>
  runInNewContext(`(${gate[1]})`, { ...context });
const date = '2026-09-06';

void test('all 70 preset start buttons unlock while WorkBuddy is waiting, without cancelling its request', () => {
  assert.equal(recipes.length, 70);
  for (const dataset of ['real', 'demo'] as const) {
    for (const recipe of recipes) {
      const state = emptyState(dataset);
      const confirmations = mealIngredients(state, recipe, [], date).map(
        (item) => ({ ingredientId: item.id, token: item.token }),
      );
      const context = {
        busy: false,
        session: null,
        cooking: {
          busy: true,
          ticket: { recipeId: recipe.id, dataset, status: 'waiting' },
        },
        recipe,
        dataset,
        foodChecked: true,
        ingredientRows: mealIngredients(state, recipe, confirmations, date),
      };
      const before = structuredClone(context);
      assert.equal(disabled(context), false, `${dataset}/${recipe.id}`);
      assert.deepEqual(context, before, 'readiness must not cancel a request');
      assert.equal(disabled({ ...context, busy: true }), true);
      assert.equal(
        disabled({ ...context, session: { id: 'active-meal' } }),
        true,
      );
      assert.equal(disabled({ ...context, foodChecked: false }), true);
      assert.equal(
        disabled({
          ...context,
          ingredientRows: mealIngredients(state, recipe, [], date),
        }),
        true,
      );
      assert.deepEqual(state.inventory, []);
    }
  }
});

const fish = recipes.find((recipe) => recipe.id === 'boiled_fish')!;
function lateDelivery(): CookingDelivery {
  return {
    ticketId: randomUUID(),
    request: cookingRequest('real', fish.id),
    result: {
      schemaVersion: '1.0',
      recipeId: fish.id,
      title: fish.title,
      steps: ['测试夹具步骤一', '测试夹具步骤二', '测试夹具步骤三'],
      warnings: ['仅为回归测试夹具，不是实际烹饪说明。'],
    },
    createdAt: new Date().toISOString(),
  };
}

void test('a late WorkBuddy delivery cannot change a started preset meal, its completion or its saved history', async () => {
  const factory = new IDBFactory();
  let store = new IndexedDbStore('late-cooking-delivery', factory);
  const deliveryStore = new IndexedDbStore('late-cooking-delivery', factory);
  try {
    const started = await store.change('real', (state) => {
      const confirmations = mealIngredients(state, fish, [], date).map(
        (item) => ({ ingredientId: item.id, token: item.token }),
      );
      startCooking(state, fish.id, 'meal', date, RECIPE_VERSION, confirmations);
    });
    const frozen = structuredClone(started.sessions[0]);
    const delivery = lateDelivery();
    const received = await deliveryStore.change('real', (state) => {
      assert.equal(receiveCookingSteps(state, delivery), true);
    });
    assert.deepEqual(received.sessions[0], frozen);
    assert.deepEqual(sessionRecipe(received, received.sessions[0]), fish);
    assert.deepEqual(recipeFor(received, fish.id).steps, delivery.result.steps);
    assert.deepEqual(received.inventory, []);
    store.close();
    store = new IndexedDbStore('late-cooking-delivery', factory);
    const reopened = await store.read('real');
    assert.deepEqual(reopened.sessions[0], frozen);
    const completed = await store.change('real', (state) => {
      stepSession(state, 'meal', fish.steps.length);
      completeCooking(state, 'meal', {
        rating: 4,
        memory: '预设做法测试',
        consumption: sessionRemainingPlan(state, state.sessions[0]),
      });
    });
    assert.deepEqual(sessionRecipe(completed, completed.sessions[0]), fish);
    assert.equal(archive(completed)[0].history.length, 1);
    assert.deepEqual(completed.inventory, []);
    assert.deepEqual(completed.candidates, []);
    assert.equal((await store.read('demo')).sessions.length, 0);
  } finally {
    store.close();
    deliveryStore.close();
  }
});

void test('a delivery committed before start still rejects stale preset confirmations atomically', async () => {
  const store = new IndexedDbStore('delivery-before-start', new IDBFactory());
  try {
    const initial = await store.read('real');
    const confirmations = mealIngredients(initial, fish, [], date).map(
      (item) => ({ ingredientId: item.id, token: item.token }),
    );
    const before = await store.change('real', (state) => {
      receiveCookingSteps(state, lateDelivery());
    });
    await assert.rejects(
      store.change('real', (state) => {
        startCooking(
          state,
          fish.id,
          'stale-meal',
          date,
          RECIPE_VERSION,
          confirmations,
        );
      }),
      /做法版本已更新/,
    );
    assert.deepEqual(await store.read('real'), before);
  } finally {
    store.close();
  }
});
