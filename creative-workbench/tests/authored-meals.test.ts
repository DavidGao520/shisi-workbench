import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  BaiweiDishArt,
  BaiweiGallery,
  BaiweiHistory,
} from '../components/baiwei-gallery';
import {
  appendAuthoredMeals,
  authoredMealRecipeIds,
} from '../lib/authored-meals';
import { baiweiCollection, baiweiDishes, savedRecipe } from '../lib/baiwei';
import { openDemoKitchen, restoreDemoKitchen } from '../lib/demo-kitchen';
import { emptyState, startCooking, activeSession } from '../lib/kitchen';
import { IndexedDbStore } from '../lib/store';
import { renderBaiweiEntry } from '../lib/archive-export';
import { homeRecipes } from '../lib/recipes';
import { validateHomeRecipes } from '../lib/recipe-validation';
import provenance from '../docs/demo-meal-provenance.json';

void test('six genuine memories coexist with 35 fictional sessions without invented ratings or inventory changes', () => {
  const state = emptyState('demo');
  restoreDemoKitchen(state, '2026-09-10');
  const genuine = state.sessions.filter((session) => session.authoredRecord);
  assert.equal(genuine.length, 6);
  assert.equal(
    state.sessions.filter((session) => session.sampleRecord).length,
    35,
  );
  assert.equal(state.sessions.length, 41);
  assert.equal(
    baiweiCollection(state).filter((entry) => entry.history.length).length,
    38,
  );
  assert.equal(baiweiDishes.length, 72);
  const memories = [
    '回锅肉那真的是香啊，太香了，这一道菜我就可以吃两碗饭。',
    '那辣子鸡呀，真的是四川人的最爱。',
    '这是我做的最好吃的素菜。',
    '奶奶做的味道。',
    '下饭之王。',
    '从小到大最爱吃的',
  ];
  assert.deepEqual(
    genuine.map((session) => session.familyMemory),
    memories,
  );
  for (const session of genuine) {
    assert.equal(session.sampleRecord, undefined);
    assert.equal(session.authoredRecord!.author, '高源');
    assert.equal(session.ratings, undefined);
    assert.equal(session.userRating, undefined);
    assert.equal(session.actualConsumption, undefined);
    assert.equal(session.stockAllocation, undefined);
    assert.equal(session.consumptionMode, undefined);
    assert.deepEqual(session.inventorySnapshot, []);
    assert.equal(session.step, 0);
    assert.match(session.photo!, /^data:image\/webp;base64,/);
    const record = provenance.photos.find(
      (photo) => photo.recipeId === session.recipeId,
    )!;
    const bytes = readFileSync(
      new URL('../' + record.imageFile, import.meta.url),
    );
    assert.equal(
      session.photo,
      'data:image/webp;base64,' + bytes.toString('base64'),
    );
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      record.sha256,
    );
    assert.equal(record.width, 900);
    assert.equal(record.height, 1200);
    assert.equal(
      session.authoredRecord?.photoCapturedAt,
      record.photoCapturedAt || undefined,
    );
  }
  assert.throws(() => appendAuthoredMeals(emptyState('real')), /只能加入样例/);
});

void test('older sample upgrades once, keeping inventory, active cooking, edits and delivery receipts', async () => {
  const factory = new IDBFactory();
  const one = new IndexedDbStore('author-upgrade', factory);
  const two = new IndexedDbStore('author-upgrade', factory);
  await openDemoKitchen(one, '2026-09-10');
  await one.change('demo', (state) => {
    state.sessions = state.sessions.filter(
      (session) => !session.authoredRecord,
    );
    delete state.demoExperience!.authoredMealsVersion;
    state.inventory[0].amount = 777;
    state.demoExperience!.tourStep = 4;
    state.workbuddyReceivedTickets = ['preserve-receipt'];
    state.sessions[0].familyMemory = '保留我修改的文字';
    startCooking(state, 'braised_pork', 'existing-cooking', '2026-09-10');
    activeSession(state)!.status = 'paused';
    activeSession(state)!.timerRemaining = 1234;
  });
  const before = await one.read('demo');
  const real = await one.read('real');
  await Promise.all([openDemoKitchen(one), openDemoKitchen(two)]);
  const after = await two.read('demo');
  assert.deepEqual(after.inventory, before.inventory);
  assert.deepEqual(
    after.sessions.filter((session) => !session.authoredRecord),
    before.sessions,
  );
  assert.deepEqual(
    after.workbuddyReceivedTickets,
    before.workbuddyReceivedTickets,
  );
  assert.equal(after.demoExperience?.tourStep, 4);
  assert.equal(
    after.sessions.filter((session) => session.authoredRecord).length,
    6,
  );
  assert.equal(
    new Set(after.sessions.map((session) => session.id)).size,
    after.sessions.length,
  );
  assert.deepEqual(await openDemoKitchen(one, '2026-10-10'), after);
  assert.deepEqual(await one.read('real'), real);
  // Once upgraded, deliberately removed records must not regrow on refresh.
  await one.change('demo', (state) => {
    state.sessions = [];
    state.inventory = [];
  });
  assert.deepEqual((await openDemoKitchen(two)).sessions, []);
  assert.deepEqual((await openDemoKitchen(two)).inventory, []);
  one.close();
  two.close();
});

void test('genuine records appear first, remain distinct from fictional examples, and export full photos as testimony', () => {
  const state = emptyState('demo');
  restoreDemoKitchen(state, '2026-10-10');
  const entries = baiweiCollection(state);
  assert.deepEqual(
    new Set(entries.slice(0, 6).map((entry) => entry.dish.id)),
    new Set(authoredMealRecipeIds),
  );
  const gallery = renderToStaticMarkup(
    createElement(BaiweiGallery, {
      state,
      images: {},
      plate: '/plate.webp',
      onOpenRecipe() {},
    }),
  );
  assert.match(gallery, /max="72"/);
  assert.match(gallery, /value="38"/);
  assert.equal((gallery.match(/实做 · 照片与食忆/g) || []).length, 6);
  assert.doesNotMatch(gallery, /高源/);
  assert.ok(baiweiDishes.every((dish) => !dish.story.includes('高源')));
  for (const entry of entries.slice(0, 6)) {
    const session = entry.history[0];
    assert.ok(session.authoredRecord);
    const history = renderToStaticMarkup(
      createElement(BaiweiHistory, {
        history: [session],
        sample: true,
        onOpenRecipe() {},
      }),
    );
    assert.match(history, /本人提供照片与食忆/);
    assert.doesNotMatch(history, /样例演练|未评分|这次做法与记录|高源/);
    const exported = renderBaiweiEntry(savedRecipe(session)!, session, 'demo');
    assert.ok(exported.includes(session.photo!));
    assert.match(exported, /预设参考做法/);
    assert.match(exported, /不代表本次实拍完整操作记录/);
    assert.doesNotMatch(exported, /非真实做菜记录|本次跟做步骤|未评分|高源/);
    if (entry.dish.id === 'cola_chicken_wings')
      assert.match(exported, /拍摄日期未记录/);
    else assert.match(exported, /拍摄于 2026-09-/);
  }
});

void test('eggplant uses its own plated illustration while its genuine photo remains a single record thumbnail', () => {
  const dish = baiweiDishes.find(
    (item) => item.id === 'green_pepper_eggplant',
  )!;
  const photo = provenance.photos.find((item) => item.recipeId === dish.id)!;
  assert.equal(
    dish.imageFile,
    'assets/baiwei/dishes/green_pepper_eggplant.webp',
  );
  assert.notEqual(dish.imageFile, photo.imageFile);
  assert.notEqual(dish.assetKind, 'photo');
  assert.equal(dish.selfContained, false);
  const imports = readFileSync(
    new URL('../lib/baiwei-art.ts', import.meta.url),
    'utf8',
  );
  assert.ok(imports.includes("from '../" + dish.imageFile + "?url'"));
  assert.ok(!imports.includes("from '../" + photo.imageFile + "?url'"));
  const art = renderToStaticMarkup(
    createElement(BaiweiDishArt, {
      dish,
      src: '/' + dish.imageFile,
      plate: '/plate.webp',
    }),
  );
  assert.match(art, /class="baiwei-plate"/);
  assert.match(art, /alt="青椒茄子工作台插画"/);
  assert.doesNotMatch(art, /作者实拍/);
  const state = emptyState('demo');
  restoreDemoKitchen(state, '2026-09-10');
  const session = state.sessions.find(
    (item) => item.recipeId === dish.id && item.authoredRecord,
  )!;
  const gallery = renderToStaticMarkup(
    createElement(BaiweiGallery, {
      state,
      images: { [dish.id]: '/' + dish.imageFile },
      plate: '/plate.webp',
      onOpenRecipe() {},
    }),
  );
  assert.equal(gallery.split(session.photo!).length - 1, 1);
  assert.equal(session.familyMemory, '这是我做的最好吃的素菜。');
});

void test('new home recipes accept truthful later source dates while invalid dates are rejected', () => {
  const additions = homeRecipes.filter((recipe) =>
    ['spicy_chicken', 'green_pepper_eggplant'].includes(recipe.id),
  );
  assert.equal(additions.length, 2);
  assert.deepEqual(
    validateHomeRecipes(
      additions,
      additions.map((recipe) => recipe.id),
    ),
    [],
  );
  assert.ok(
    additions.every((recipe) =>
      recipe.sources.every((source) => source.accessedAt === '2026-09-10'),
    ),
  );
  const malformed = structuredClone(additions);
  malformed[0].sources[0].accessedAt = '2026-02-30';
  assert.ok(
    validateHomeRecipes(
      malformed,
      additions.map((recipe) => recipe.id),
    ).some((error) => error.includes('attribution')),
  );
});
