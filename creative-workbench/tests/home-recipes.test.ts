import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { IDBFactory } from 'fake-indexeddb';
import {
  recipes,
  RECIPE_VERSION,
  cookingSteps,
  detailedCookingSteps,
  recipePeople,
  storedRecipe,
  inventoryIngredientId,
  names,
} from '../lib/recipes';
import { legacyRecipes, LEGACY_RECIPE_VERSION } from '../lib/legacy-recipes';
import {
  emptyState,
  matching,
  recommendations,
  reviewed,
  reviewRecipe,
  recipeFor,
  startCooking,
  sessionRecipe,
  stepSession,
  remainingPlan,
  completeCooking,
} from '../lib/kitchen';
import { cookingRequest, receiveCookingSteps } from '../lib/workbuddy-cooking';
import { validateCookingRequest } from '../skills/zhonghua-shisi/scripts/cooking-contract.mjs';
import { IndexedDbStore } from '../lib/store';
import {
  RecipeInstructions,
  RecipeSources,
} from '../components/recipe-instructions';
import { renderBaiweiEntry } from '../lib/archive-export';
import { baiweiDishes, baiweiCollection } from '../lib/baiwei';
import { validateHomeRecipes } from '../lib/recipe-validation';
import type { HomeRecipe, Recipe } from '../lib/recipe-types';
import {
  candidateReview,
  confirmReviewedCandidate,
} from '../lib/candidate-review';
import { extractIngredients, prepareVoiceDraft } from '../lib/voice-intake';

const today = '2026-09-06';
function stocked(recipe: Recipe) {
  const state = emptyState('demo');
  state.inventory = recipe.ingredients.map((ingredient) => ({
    id: ingredient.id,
    displayName: ingredient.name || names[ingredient.id],
    canonicalIngredientId: ingredient.id,
    amount: ingredient.amount * 3,
    unit: ingredient.unit,
    revision: 1,
    confirmed: true,
    createdAt: today,
    updatedAt: today,
  }));
  return state;
}

void test('all 70 dishes have a complete quantitative Chinese-source home recipe', () => {
  const content = JSON.parse(
    readFileSync(new URL('../lib/home-recipes.json', import.meta.url), 'utf8'),
  ) as HomeRecipe[];
  assert.deepEqual(
    validateHomeRecipes(
      content,
      baiweiDishes.map((dish) => dish.id),
    ),
    [],
  );
  assert.equal(recipes.length, 70);
  assert.equal(RECIPE_VERSION, '2026-09-06-home.1');
  assert.equal(new Set(recipes.map((recipe) => recipe.id)).size, 70);
  for (const recipe of recipes) {
    assert.equal(
      recipe.minutes,
      recipe.detailSteps!.reduce((sum, step) => sum + step.minutes, 0),
    );
    assert.equal(recipe.steps.length, recipe.detailSteps!.length);
    assert.equal(recipe.sources![0].language, 'zh');
    assert.equal(recipe.source, recipe.sources![0].url);
    assert.ok(recipe.ingredients.every((item) => !!names[item.id]));
    assert.deepEqual(
      cookingRequest('demo', recipe.id).ingredients,
      recipe.ingredients.map((item) => ({
        id: item.id,
        name: item.name || names[item.id],
        amount: item.amount,
        unit: item.unit,
      })),
    );
    assert.equal(
      cookingRequest('demo', recipe.id).servings,
      recipe.baseServings,
    );
  }
});

void test('every dish renders step time, material amounts, heat, completion cue and clickable Chinese citations', () => {
  for (const recipe of recipes) {
    const html = renderToStaticMarkup(
      createElement(RecipeInstructions, { recipe }),
    );
    const citations = renderToStaticMarkup(
      createElement(RecipeSources, { recipe }),
    );
    for (const step of recipe.detailSteps!) {
      assert.ok(html.includes(step.title));
      assert.ok(html.includes(`约 ${step.minutes} 分钟`));
      assert.ok(html.includes(step.heat));
    }
    assert.match(html, /本步用料/);
    assert.match(html, /做到这样/);
    for (const source of recipe.sources!) {
      assert.ok(citations.includes(source.url.replace(/&/g, '&amp;')));
      assert.ok(citations.includes(source.author));
    }
  }
});

void test('all 70 recipes complete without any model request and survive IndexedDB reopen', async () => {
  const store = new IndexedDbStore('home-cookbook-test', new IDBFactory());
  for (const recipe of recipes) {
    const state = stocked(recipe);
    const realState = structuredClone(state);
    realState.dataset = 'real';
    startCooking(realState, recipe.id, recipe.id, today);
    assert.equal(realState.sessions[0].status, 'cooking');
    assert.deepEqual(realState.reviews, {});
    assert.ok(matching(state, recipe, today).every((item) => item.enough));
    assert.ok(
      recommendations(state, today).every(
        (entry) => !!entry.recipe.detailSteps,
      ),
      'recommendations use the same preset cookbook',
    );
    const original = structuredClone(state.inventory);
    startCooking(state, recipe.id, recipe.id, today);
    assert.deepEqual(state.inventory, original);
    for (let step = 1; step <= recipe.steps.length; step++)
      stepSession(state, recipe.id, step);
    const consumption = remainingPlan(state, recipe, 1, today);
    completeCooking(state, recipe.id, {
      rating: 4,
      memory: '自动化数据夹具，不代表实做',
      consumption,
    });
    const once = structuredClone(state);
    completeCooking(state, recipe.id, { rating: 4, memory: '', consumption });
    assert.deepEqual(state, once);
    assert.equal(
      baiweiCollection(state).filter((entry) => entry.history.length).length,
      1,
    );
    const html = renderBaiweiEntry(recipe, state.sessions[0], 'demo');
    assert.ok(html.includes(recipe.detailSteps![0].title));
    assert.ok(html.includes('本步用料'));
    assert.ok(html.includes(recipe.sources![0].url.replace(/&/g, '&amp;')));
    await store.change('demo', (saved) => Object.assign(saved, state));
    store.close();
    const restored = await store.read('demo');
    assert.deepEqual(restored.sessions, state.sessions);
    assert.deepEqual(restored.inventory, state.inventory);
    assert.equal((await store.read('real')).sessions.length, 0);
  }
  store.close();
});

void test('Chinese cookbook update preserves old snapshots and unsnapshotted legacy portions', () => {
  const state = stocked(legacyRecipes[0]);
  state.sessions = [
    {
      id: 'legacy',
      recipeId: 'tomato_egg',
      recipeVersion: LEGACY_RECIPE_VERSION,
      servings: 2,
      status: 'cooking',
      step: 3,
      createdAt: today,
      inventorySnapshot: [],
    },
  ];
  assert.deepEqual(sessionRecipe(state, state.sessions[0]), legacyRecipes[0]);
  assert.equal(recipePeople(sessionRecipe(state, state.sessions[0]), 2), 2);
  assert.match(
    cookingSteps(sessionRecipe(state, state.sessions[0]), 2)[3],
    /60 毫升/,
  );
  assert.equal(
    storedRecipe(state.sessions[0])!.source,
    legacyRecipes[0].source,
  );
  state.reviews.tomato_egg = {
    by: '旧记录测试夹具',
    at: today,
    version: LEGACY_RECIPE_VERSION,
  };
  assert.equal(reviewed(state, recipes[0]), false);
  assert.equal(state.reviews.tomato_egg.version, LEGACY_RECIPE_VERSION);
  state.sessions[0].recipeSnapshot = structuredClone(legacyRecipes[0]);
  assert.deepEqual(sessionRecipe(state, state.sessions[0]), legacyRecipes[0]);
});

void test('new batch quantities scale but timer estimates and temperatures never multiply', () => {
  for (const recipe of recipes) {
    const base = detailedCookingSteps(recipe)!;
    const doubled = detailedCookingSteps(recipe, 2)!;
    assert.equal(recipePeople(recipe, 2), recipe.baseServings! * 2);
    base.forEach((step, index) => {
      assert.equal(doubled[index].minutes, step.minutes);
      assert.equal(doubled[index].heat, step.heat);
      assert.equal(doubled[index].checkpoint, step.checkpoint);
      step.uses.forEach((item, part) =>
        assert.equal(
          doubled[index].uses[part].amount,
          Math.round(item.amount * 2000) / 1000,
        ),
      );
    });
  }
});

void test('empty pantry and seasoning-only pantry never invent a main ingredient', () => {
  assert.deepEqual(recommendations(emptyState('real'), today), []);
  const state = stocked(recipes[0]);
  state.inventory = state.inventory.filter((item) =>
    ['salt', 'oil', 'water'].includes(item.canonicalIngredientId),
  );
  assert.deepEqual(recommendations(state, today), []);
});

void test('whole, boneless, dried, hydrated and cooked foods never count as equal-weight substitutes', () => {
  for (const [displayName, id] of Object.entries({
    草鱼: 'grass_carp',
    鱼片: 'fish_fillet',
    干木耳: 'dried_wood_ear',
    泡发木耳: 'rehydrated_wood_ear',
    大米: 'rice',
    熟米饭: 'cooked_rice',
    面条: 'noodle',
    挂面: 'dry_noodles',
    半壳生蚝: 'oyster',
    蚝肉: 'oyster_meat',
  }))
    assert.equal(inventoryIngredientId({ displayName }), id, displayName);
  const fishRecipe = recipes.find((r) => r.id === 'boiled_fish')!;
  const state = stocked(fishRecipe);
  const fish = state.inventory.find(
    (item) => item.canonicalIngredientId === 'fish_fillet',
  )!;
  fish.canonicalIngredientId = 'grass_carp';
  fish.displayName = '草鱼';
  assert.equal(
    matching(state, fishRecipe, today).find(
      (item) => item.id === 'fish_fillet',
    )!.enough,
    false,
  );
  assert.equal(
    remainingPlan(state, fishRecipe, 1, today).some(
      (item) => item.batchId === fish.id,
    ),
    false,
  );
});

void test('legacy other-name inventory matches without read migration or duplicate stocktake records', () => {
  const recipe = recipes.find((r) => r.id === 'green_pepper_pork')!;
  const state = stocked(recipe);
  const pork = state.inventory.find(
    (item) => item.canonicalIngredientId === 'pork',
  )!;
  pork.canonicalIngredientId = 'other';
  pork.displayName = '猪肉';
  const before = structuredClone(state);
  assert.equal(
    matching(state, recipe, today).find((item) => item.id === 'pork')!.enough,
    true,
  );
  assert.deepEqual(state, before);
  const draft = prepareVoiceDraft(
    '猪肉还有300克',
    state,
    'stocktake',
    'legacy-alias',
  );
  assert.equal(draft.rows[0].targetId, pork.id);
  const candidate = draft.rows[0].candidate;
  state.candidates.push(candidate);
  const review = candidateReview(state, candidate);
  assert.equal(review.targetId, pork.id);
  confirmReviewedCandidate(state, candidate.key, review, {
    quantity: { amount: 300, unit: '克' },
  });
  assert.equal(state.inventory.length, before.inventory.length);
  assert.equal(pork.amount, 300);
  assert.equal(pork.canonicalIngredientId, 'other');
  assert.equal(inventoryIngredientId(pork), 'pork');
  assert.equal(
    extractIngredients('猪肉300克').items[0].canonicalIngredientId,
    'pork',
  );
});

void test('WorkBuddy enhancement stays optional and does not borrow preset timing for generated prose', () => {
  const source = readFileSync(
    new URL('../app/page.tsx', import.meta.url),
    'utf8',
  );
  assert.equal((source.match(/cooking\.begin\(/g) || []).length, 1);
  assert.match(source, /<details className="paper workbuddy-cooking">/);
  const state = stocked(recipes[0]);
  const request = cookingRequest('demo', recipes[0].id);
  for (const servings of [0, -1, 1.5, 13])
    assert.throws(() => validateCookingRequest({ ...request, servings }));
  receiveCookingSteps(state, {
    ticketId: '00000000-0000-4000-8000-000000000000',
    request,
    createdAt: new Date().toISOString(),
    result: {
      schemaVersion: '1.0',
      recipeId: request.recipeId,
      title: request.title,
      steps: ['步骤甲测试夹具', '步骤乙测试夹具', '步骤丙测试夹具'],
      warnings: [],
    },
  });
  reviewRecipe(
    state,
    recipes[0].id,
    '测试夹具',
    recipeFor(state, recipes[0].id).workbuddyVersion,
  );
  startCooking(state, recipes[0].id, 'optional', today);
  assert.equal(
    detailedCookingSteps(sessionRecipe(state, state.sessions[0])),
    undefined,
  );
  assert.deepEqual(cookingSteps(sessionRecipe(state, state.sessions[0]), 1), [
    '步骤甲测试夹具',
    '步骤乙测试夹具',
    '步骤丙测试夹具',
  ]);
});
