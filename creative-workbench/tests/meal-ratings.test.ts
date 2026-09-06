import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { IDBFactory } from 'fake-indexeddb';
import { MealRatingInput } from '../components/meal-rating-input';
import { BaiweiGallery } from '../components/baiwei-gallery';
import { baiweiDishes } from '../lib/baiwei';
import { renderBaiweiEntry } from '../lib/archive-export';
import { IndexedDbStore } from '../lib/store';
import {
  emptyState,
  finishCooking,
  completeCooking,
  type Session,
} from '../lib/kitchen';
import { recipes, RECIPE_VERSION } from '../lib/recipes';
import {
  hasCompleteMealRatings,
  mealRatingsDraft,
  mealRatingSummary,
  ratingDimensions,
  validateMealRatings,
  type MealRatings,
} from '../lib/meal-ratings';

const ratings: MealRatings = {
  taste: 5,
  difficulty: 1,
  appearance: 3,
  difficultyScale: 'easy-high',
};
const recipe = recipes.find((r) => r.id === 'golden_egg')!;
function reviewing(): Session {
  return {
    id: 'meal',
    recipeId: recipe.id,
    recipeVersion: RECIPE_VERSION,
    recipeSnapshot: structuredClone(recipe),
    servings: 1,
    status: 'reviewing',
    step: recipe.steps.length,
    createdAt: '2026-09-06T12:00:00+08:00',
    inventorySnapshot: [],
    stockAllocation: [],
  };
}
function validState() {
  const state = emptyState('real');
  state.sessions.push(reviewing());
  return state;
}

void test('three independent scores validate and copy without inventing an overall score', () => {
  const result = validateMealRatings(ratings);
  assert.deepEqual(result, ratings);
  assert.notEqual(result, ratings);
  assert.equal(hasCompleteMealRatings(ratings), true);
  assert.equal(
    mealRatingSummary({ ratings }),
    '好吃程度 5 / 5 · 制作难度 1 / 5（越高越简单） · 卖相程度 3 / 5',
  );
  const state = validState();
  finishCooking(state, 'meal', { ratings, memory: '好吃，做法简单' });
  assert.deepEqual(state.sessions[0].ratings, ratings);
  assert.notEqual(state.sessions[0].ratings, ratings);
  assert.equal('userRating' in state.sessions[0], false);
});

void test('every missing or invalid dimension rejects atomically, even with a valid legacy scalar', () => {
  for (const { key } of ratingDimensions) {
    for (const invalid of [
      undefined,
      null,
      0,
      6,
      1.5,
      '3',
      NaN,
      Infinity,
      true,
    ]) {
      const value = { ...ratings, [key]: invalid } as MealRatings;
      assert.equal(hasCompleteMealRatings(value), false);
      const state = validState();
      state.inventory.push({
        id: 'egg',
        displayName: '鸡蛋',
        canonicalIngredientId: 'egg',
        amount: 2,
        unit: '个',
        revision: 1,
        confirmed: true,
        createdAt: '2026-09-06',
        updatedAt: '2026-09-06',
      });
      state.sessions[0].reviewDraft = { rating: 4, memory: '保留旧草稿' };
      const before = structuredClone(state);
      assert.throws(
        () => finishCooking(state, 'meal', { ratings: value, memory: '' }),
        /分别/,
      );
      assert.deepEqual(state, before);
      assert.throws(
        () =>
          completeCooking(state, 'meal', {
            ratings: value,
            rating: 5,
            memory: '',
            consumption: [
              {
                batchId: 'egg',
                expectedRevision: 1,
                remaining: { amount: 0, unit: '个' },
              },
            ],
          }),
        /分别/,
      );
      assert.deepEqual(state, before);
    }
  }
  for (const value of [undefined, null, [], {}, 5]) {
    const state = validState();
    const before = structuredClone(state);
    assert.throws(
      () =>
        finishCooking(state, 'meal', {
          ratings: value as MealRatings,
          memory: '',
        }),
      /分别/,
    );
    assert.deepEqual(state, before);
  }
});

void test('partial draft keeps each value and old single-score drafts do not prefill dimensions', () => {
  assert.deepEqual(mealRatingsDraft(), {
    taste: 0,
    difficulty: 0,
    appearance: 0,
    difficultyScale: 'easy-high',
  });
  const old = {
    rating: 4,
    memory: '旧食忆',
    photo: 'data:image/png;base64,AA==',
  };
  const draft: Session['reviewDraft'] = { ...old };
  assert.deepEqual(mealRatingsDraft(draft.ratings), {
    taste: 0,
    difficulty: 0,
    appearance: 0,
    difficultyScale: 'easy-high',
  });
  assert.deepEqual(draft, old);
  assert.deepEqual(mealRatingsDraft({ taste: 5, difficulty: 0 }), {
    taste: 5,
    difficulty: 0,
    appearance: 0,
    difficultyScale: 'easy-high',
  });
  assert.deepEqual(
    mealRatingsDraft({ taste: 6, difficulty: 2, appearance: NaN }),
    { taste: 0, difficulty: 4, appearance: 0, difficultyScale: 'easy-high' },
  );
});

void test('new partial drafts and completed three-dimensional records survive IndexedDB reopen', async () => {
  const factory = new IDBFactory();
  let store = new IndexedDbStore('meal-rating-reopen', factory);
  const partial = {
    ratings: { ...ratings, difficulty: 0 },
    memory: '再试一次',
    photo: 'data:image/png;base64,AA==',
  };
  await store.change('real', (state) => {
    const session = reviewing();
    session.reviewDraft = partial;
    state.sessions.push(session);
  });
  store.close();
  store = new IndexedDbStore('meal-rating-reopen', factory);
  assert.deepEqual((await store.read('real')).sessions[0].reviewDraft, partial);
  await assert.rejects(
    store.change('real', (state) => finishCooking(state, 'meal', partial)),
    /分别/,
  );
  assert.deepEqual((await store.read('real')).sessions[0].reviewDraft, partial);
  await store.change('real', (state) =>
    finishCooking(state, 'meal', { ...partial, ratings }),
  );
  store.close();
  store = new IndexedDbStore('meal-rating-reopen', factory);
  const completed = (await store.read('real')).sessions[0];
  assert.deepEqual(completed.ratings, ratings);
  assert.equal(completed.userRating, undefined);
  assert.equal(completed.reviewDraft, undefined);
  assert.equal(completed.photo, partial.photo);
  assert.equal(completed.familyMemory, partial.memory);
  assert.equal((await store.read('demo')).sessions.length, 0);
  store.close();
});

void test('old completed scores remain legacy scores in storage and exports without guessed dimensions', async () => {
  const factory = new IDBFactory();
  const store = new IndexedDbStore('legacy-rating', factory);
  const old: Session = {
    ...reviewing(),
    status: 'completed',
    userRating: 4,
    completedAt: '2026-09-05',
  };
  await store.change('real', (state) => state.sessions.push(old));
  await store.change('real', (state) =>
    finishCooking(state, 'meal', { ratings, memory: '不能覆盖' }),
  );
  const loaded = (await store.read('real')).sessions[0];
  assert.deepEqual(loaded, old);
  assert.equal(mealRatingSummary(loaded), '旧版评分：4 / 5');
  const html = renderBaiweiEntry(recipe, loaded, 'real');
  assert.match(html, /旧版评分：4 \/ 5/);
  assert.doesNotMatch(html, /好吃程度|制作难度|卖相程度|undefined/);
  store.close();
});

void test('rating control renders three named groups with five independent choices and clear difficulty direction', () => {
  const html = renderToStaticMarkup(
    createElement(MealRatingInput, { value: ratings, onChange() {} }),
  );
  assert.equal((html.match(/role="radiogroup"/g) || []).length, 3);
  assert.equal((html.match(/role="radio"/g) || []).length, 15);
  assert.equal((html.match(/aria-required="true"/g) || []).length, 3);
  assert.equal((html.match(/aria-checked="true"/g) || []).length, 3);
  assert.equal((html.match(/fill="#bc8435"/g) || []).length, 9);
  for (const { key, label } of ratingDimensions) {
    for (let score = 1; score <= 5; score++) {
      const tag = html.match(
        new RegExp(
          `<[^>]+role="radio"[^>]+aria-label="${label} ${score} 星"[^>]*>`,
        ),
      )![0];
      assert.ok(tag.includes(`aria-checked="${score === ratings[key]}"`));
    }
    assert.ok(html.includes(`-${key}-label`));
    assert.ok(html.includes(`-${key}-hint`));
  }
  assert.match(html, /1 星困难，5 星简单/);
  const empty = renderToStaticMarkup(
    createElement(MealRatingInput, {
      value: mealRatingsDraft(),
      onChange() {},
      disabled: true,
    }),
  );
  assert.doesNotMatch(empty, /aria-checked="true"/);
  assert.equal(
    (empty.match(/class="meal-rating-value" aria-live="polite">未评分/g) || [])
      .length,
    3,
  );
  assert.match(empty, /<fieldset[^>]*disabled/);
});

void test('gallery and exported record show all dimensions without a synthetic overall rating', () => {
  const state = validState();
  finishCooking(state, 'meal', { ratings, memory: '<script>example</script>' });
  const session = state.sessions[0];
  const summary = mealRatingSummary(session);
  const gallery = renderToStaticMarkup(
    createElement(BaiweiGallery, {
      state,
      images: Object.fromEntries(
        baiweiDishes.map((dish) => [dish.id, `/${dish.id}.webp`]),
      ),
      plate: '/plate.webp',
      onOpenRecipe() {},
    }),
  );
  assert.ok(gallery.includes(summary));
  const html = renderBaiweiEntry(recipe, session, 'real');
  assert.ok(html.includes(summary));
  assert.match(html, /&lt;script&gt;example&lt;\/script&gt;/);
  assert.doesNotMatch(html, /undefined|旧版评分|综合评分/);
  const page = readFileSync(
    new URL('../app/page.tsx', import.meta.url),
    'utf8',
  );
  assert.match(page, /mealRatingSummary\(x\)/);
  assert.match(page, /ratingsComplete = hasCompleteMealRatings\(ratings\)/);
  const source = readFileSync(
    new URL('../components/baiwei-gallery.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /mealRatingSummary\(session\)/);
  assert.match(source, /mealRatingSummary\(latest\)/);
});

void test('unknown or malformed archived score never renders undefined or untrusted markup', () => {
  assert.equal(mealRatingSummary({}), '未评分');
  assert.equal(mealRatingSummary({ userRating: NaN }), '未评分');
  assert.equal(
    mealRatingSummary({
      ratings: { ...ratings, taste: '<script>' } as unknown as MealRatings,
    }),
    '未评分',
  );
});

void test('old difficulty scale reverses once in drafts, history and export without mutating originals', () => {
  for (let difficulty = 1; difficulty <= 5; difficulty++) {
    const old = { taste: 5, difficulty, appearance: 3 };
    const before = structuredClone(old);
    const normalized = mealRatingsDraft(old);
    assert.deepEqual(normalized, {
      ...old,
      difficulty: 6 - difficulty,
      difficultyScale: 'easy-high',
    });
    assert.deepEqual(mealRatingsDraft(normalized), normalized);
    assert.deepEqual(validateMealRatings(validateMealRatings(old)), normalized);
    const session: Session = {
      ...reviewing(),
      status: 'completed',
      ratings: old,
    };
    assert.ok(
      mealRatingSummary(session).includes(
        `制作难度 ${6 - difficulty} / 5（越高越简单）`,
      ),
    );
    assert.ok(
      renderBaiweiEntry(recipe, session, 'real').includes(
        `制作难度 ${6 - difficulty} / 5（越高越简单）`,
      ),
    );
    assert.deepEqual(old, before);
    const state = validState();
    finishCooking(state, 'meal', { ratings: old, memory: '' });
    assert.deepEqual(state.sessions[0].ratings, normalized);
  }
});

void test('easy-high draft persists and finishes without another reversal; unknown scales reject', async () => {
  const store = new IndexedDbStore('difficulty-direction', new IDBFactory());
  const old = { taste: 2, difficulty: 1, appearance: 4 };
  const converted = mealRatingsDraft(old);
  await store.change('real', (state) => {
    state.sessions.push({
      ...reviewing(),
      reviewDraft: { ratings: converted, memory: '容易上手' },
    });
  });
  store.close();
  const draft = (await store.read('real')).sessions[0].reviewDraft!;
  const restored = mealRatingsDraft(draft.ratings);
  assert.equal(restored.difficulty, 5);
  await store.change('real', (state) =>
    finishCooking(state, 'meal', { ratings: restored, memory: draft.memory }),
  );
  const finished = (await store.read('real')).sessions[0];
  assert.deepEqual(finished.ratings, converted);
  assert.match(mealRatingSummary(finished), /制作难度 5 \/ 5（越高越简单）/);
  assert.throws(
    () => validateMealRatings({ ...ratings, difficultyScale: 'unknown' }),
    /分别/,
  );
  store.close();
});
