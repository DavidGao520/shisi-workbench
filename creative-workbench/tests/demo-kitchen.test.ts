import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { IndexedDbStore } from '../lib/store';
import {
  openDemoKitchen,
  restoreDemoKitchen,
  saveTourStep,
  demoRecipeIds,
} from '../lib/demo-kitchen';
import {
  activeSession,
  emptyState,
  finishCooking,
  recommendations,
  startCooking,
  stepSession,
} from '../lib/kitchen';
import { baiweiCollection, savedRecipe } from '../lib/baiwei';
import { renderBaiweiEntry } from '../lib/archive-export';
import { recipes } from '../lib/recipes';
import { pantryArtId } from '../lib/pantry-art';

const date = '2026-09-07';
const ratings = {
  taste: 4,
  difficulty: 4,
  appearance: 5,
  difficultyScale: 'easy-high' as const,
};
const litCount = (state: ReturnType<typeof emptyState>) =>
  baiweiCollection(state).filter((entry) => entry.history.length).length;

void test('entering a fresh demo directly supplies a ready pantry and half-lit history, never real stock', async () => {
  const store = new IndexedDbStore('first-visit', new IDBFactory());
  const real = await store.read('real');
  const state = await openDemoKitchen(store, date);
  assert.equal(state.inventory.length, 22);
  const fish = state.inventory.find(
    (batch) => batch.canonicalIngredientId === 'fish_fillet',
  )!;
  assert.equal(
    pantryArtId(fish.canonicalIngredientId, fish.displayName),
    'fish',
  );
  assert.equal(fish.canonicalIngredientId, 'fish_fillet');
  assert.equal(
    new Set(state.inventory.map((batch) => batch.canonicalIngredientId)).size,
    22,
  );
  assert.ok(
    state.inventory.every((batch) => batch.confirmed && batch.amount! > 0),
  );
  assert.deepEqual(state.candidates, []);
  assert.deepEqual(
    recommendations(state, date).map((entry) => entry.recipe.id),
    ['boiled_fish', 'braised_pork', 'cabbage_tofu_soup'],
  );
  assert.ok(
    recommendations(state, date).every((entry) => entry.missing.length === 0),
  );
  assert.equal(litCount(state), 35);
  assert.equal(activeSession(state), undefined);
  assert.equal(state.demoExperience?.tourStep, 0);
  assert.deepEqual(await store.read('real'), real);
  store.close();
});

void test('seed history is coherent, explicitly fictional, exportable, and leaves all three featured dishes unlit', () => {
  const state = emptyState('demo');
  restoreDemoKitchen(state, date);
  assert.equal(state.sessions.length, 35);
  for (const session of state.sessions) {
    assert.equal(session.status, 'completed');
    assert.equal(session.sampleRecord, true);
    assert.ok(
      session.completedAt! < date && session.createdAt < session.completedAt!,
    );
    assert.ok(!demoRecipeIds.includes(session.recipeId));
    assert.equal(session.photo, undefined);
    const recipe = savedRecipe(session)!;
    assert.equal(session.recipeSnapshot?.id, recipe.id);
    assert.equal(session.step, recipe.steps.length);
    assert.ok(session.actualConsumption?.length);
    const html = renderBaiweiEntry(recipe, session, 'demo');
    assert.match(html, /预置样例食忆 · 非真实做菜记录/);
    assert.doesNotMatch(html, /个人记忆 · 用户自述/);
  }
});

void test('three featured meals can finish in any order, consume exact stock, and each light a new dish', () => {
  const [a, b, c] = demoRecipeIds;
  for (const order of [
    [a, b, c],
    [a, c, b],
    [b, a, c],
    [b, c, a],
    [c, a, b],
    [c, b, a],
  ]) {
    const state = emptyState('demo');
    restoreDemoKitchen(state, date);
    const initial = structuredClone(state.inventory);
    order.forEach((id, index) => {
      startCooking(state, id, 'try-' + id, date);
      stepSession(
        state,
        'try-' + id,
        recipes.find((recipe) => recipe.id === id)!.steps.length,
      );
      finishCooking(state, 'try-' + id, { ratings, memory: '我试着做的一餐' });
      assert.equal(litCount(state), 36 + index);
    });
    for (const batch of state.inventory) {
      const used = demoRecipeIds
        .flatMap(
          (id) => recipes.find((recipe) => recipe.id === id)!.ingredients,
        )
        .filter((ingredient) => ingredient.id === batch.canonicalIngredientId)
        .reduce((sum, ingredient) => sum + ingredient.amount, 0);
      assert.ok(
        Math.abs(
          batch.amount! -
            (initial.find((item) => item.id === batch.id)!.amount! - used),
        ) < 1e-8,
      );
      assert.ok(batch.amount! >= 0);
    }
  }
});

void test('concurrent entry seeds once; edits and saved tour step survive reopen without reseeding', async () => {
  const factory = new IDBFactory();
  const one = new IndexedDbStore('two-tabs', factory);
  const two = new IndexedDbStore('two-tabs', factory);
  await Promise.all([openDemoKitchen(one, date), openDemoKitchen(two, date)]);
  await one.change('demo', (state) => {
    state.inventory[0].amount = 123;
    state.inventory[0].revision += 1;
    saveTourStep(state, 3, 'boiled_fish');
  });
  const edited = await one.read('demo');
  assert.deepEqual(await openDemoKitchen(two, '2026-09-20'), edited);
  assert.equal(edited.inventory.length, 22);
  assert.equal(edited.sessions.length, 35);
  one.close();
  two.close();
  const reopened = new IndexedDbStore('two-tabs', factory);
  assert.deepEqual(await openDemoKitchen(reopened, date), edited);
  reopened.close();
});

void test('visiting/skipping/replaying the tour writes no inventory, meal or timer changes', async () => {
  const store = new IndexedDbStore('tour', new IDBFactory());
  await openDemoKitchen(store, date);
  await store.change('demo', (state) => {
    startCooking(state, 'braised_pork', 'already-cooking', date);
    activeSession(state)!.timerRemaining = 90000;
    activeSession(state)!.status = 'paused';
  });
  const before = await store.read('demo');
  for (const step of [0, 1, 2, 3, 4, null, 0]) {
    await store.change('demo', (state) =>
      saveTourStep(state, step, 'boiled_fish'),
    );
  }
  const after = await openDemoKitchen(store, date);
  assert.deepEqual(after.inventory, before.inventory);
  assert.deepEqual(after.sessions, before.sessions);
  assert.deepEqual(after.candidates, before.candidates);
  assert.throws(() => saveTourStep(emptyState('real'), 0), /样例厨房/);
  assert.throws(() => saveTourStep(after, 5), /无效/);
  store.close();
});

void test('nonempty legacy sample is preserved; a deliberately cleared new sample stays empty', async () => {
  const store = new IndexedDbStore('legacy', new IDBFactory());
  await store.change('demo', (state) => {
    state.inventory.push({
      id: 'old-eggs',
      canonicalIngredientId: 'egg',
      displayName: '鸡蛋',
      amount: 9,
      unit: '个',
      revision: 3,
      confirmed: true,
      createdAt: date,
      updatedAt: date,
    });
    state.preferences.minutes = 10;
  });
  const old = await store.read('demo');
  const opened = await openDemoKitchen(store, date);
  assert.deepEqual(opened.inventory, old.inventory);
  assert.deepEqual(opened.preferences, old.preferences);
  assert.equal(opened.demoExperience?.tourStep, null);
  await store.change('demo', (state) => {
    state.inventory = [];
  });
  assert.deepEqual((await openDemoKitchen(store, date)).inventory, []);
  store.close();
});

void test('explicit restore refreshes only the demo, keeps revision monotonic and preserves delivery receipts', async () => {
  const store = new IndexedDbStore('restore', new IDBFactory());
  const real = await store.change('real', (state) => {
    state.preferences.minutes = 35;
  });
  await openDemoKitchen(store, date);
  await store.change('demo', (state) => {
    saveTourStep(state, null);
    state.inventory = [];
    state.bridgeIgnoredTicketIds = ['old-photo'];
    state.workbuddyReceivedTickets = ['old-recipe'];
    state.workbuddySteps = {
      braised_pork: {
        ticketId: 'old-recipe',
        baseVersion: 'old',
        steps: ['旧步骤'],
        warnings: [],
        createdAt: date,
      },
    };
  });
  const previous = await store.read('demo');
  const restored = await store.change('demo', (state) =>
    restoreDemoKitchen(state, '2026-10-01'),
  );
  assert.equal(restored.revision, previous.revision + 1);
  assert.equal(restored.inventory.length, 22);
  assert.equal(litCount(restored), 35);
  assert.equal(restored.demoExperience?.tourStep, 0);
  assert.equal(restored.demoExperience?.referenceDate, '2026-10-01');
  assert.deepEqual(restored.bridgeIgnoredTicketIds, ['old-photo']);
  assert.deepEqual(restored.workbuddyReceivedTickets, ['old-recipe']);
  assert.equal(restored.workbuddySteps, undefined);
  assert.deepEqual(await store.read('real'), real);
  await assert.rejects(
    store.change('real', (state) => restoreDemoKitchen(state, date)),
    /只能恢复样例/,
  );
  assert.deepEqual(await store.read('real'), real);
  store.close();
});
