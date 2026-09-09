import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { IDBFactory } from 'fake-indexeddb';
import { IndexedDbStore } from '../lib/store';
import { recipes, RECIPE_VERSION } from '../lib/recipes';
import {
  archive,
  emptyState,
  finishCooking,
  mealIngredients,
  startCooking,
  stepSession,
  type Batch,
  type KitchenState,
} from '../lib/kitchen';

const r = recipes.find((recipe) => recipe.id === 'golden_egg')!;
const date = '2026-09-06';
const feedback = {
  ratings: {
    taste: 4,
    difficulty: 2,
    appearance: 5,
    difficultyScale: 'easy-high' as const,
  },
  memory: '下次再试试',
  photo: 'data:image/png;base64,AA==',
};
function stock(
  ingredientId: string,
  amount: number,
  unit: string,
  id = ingredientId,
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
function prepared(full = false): KitchenState {
  const s = emptyState('real');
  if (full)
    s.inventory = r.ingredients.map((i) => stock(i.id, i.amount * 2, i.unit));
  return s;
}
function ready(s: KitchenState) {
  const confirmed = mealIngredients(s, r, [], date)
    .filter((i) => !i.present)
    .map((i) => ({ ingredientId: i.id, token: i.token }));
  startCooking(s, r.id, 'meal', date, RECIPE_VERSION, confirmed);
  s.sessions[0].createdAt = date + 'T12:00:00+08:00';
  stepSession(s, 'meal', r.steps.length);
  return s.sessions[0];
}

void test('review has only photo, score and comment fields, with no stock controls or hidden confirmation gate', async () => {
  const page = await readFile(
    new URL('../app/page.tsx', import.meta.url),
    'utf8',
  );
  const form = page
    .split('function ReviewForm(')[1]
    .split('export default function Home')[0];
  assert.doesNotMatch(
    form,
    /尚未扣减库存|本餐临时用料|只在本机保存|确认实际剩余|另用到一个批次|加入核对|按最新库存重新预填|我已核对实际消耗|本餐无需扣减冰箱库存|<Tick|<Choice|setRows|setExtra|setConfirmed|!confirmed/,
  );
  assert.match(form, /留张成品照（可跳过）/);
  assert.match(form, /<MealRatingInput/);
  assert.match(form, /留一句家庭记忆或下次改进（可选）/);
  assert.match(form, /disabled=\{busy \|\| photoBusy \|\| !ratingsComplete\}/);
  assert.match(
    form,
    /if \(busy \|\| photoBusy \|\| !ratingsComplete\) return;/,
  );
  assert.match(form, /finishCooking\(state, session.id,/);
  assert.match(form, /保存草稿/);
  assert.doesNotMatch(form, /setPhoto\(await photoData\(f\)\)[\s\S]*fetch\(/);
  for (const field of ['ratings', 'memory', 'photo'])
    assert.ok(form.includes(`session.reviewDraft?.${field}`));
  const css = await readFile(
    new URL('../app/globals.css', import.meta.url),
    'utf8',
  );
  assert.match(
    css,
    /\.review-fields\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/,
  );
  assert.doesNotMatch(css, /\.consume-row|\.remaining-field|\.review-grid/);
});

void test('full-stock meal saves a plan and finishes with feedback alone, deducting once', () => {
  const s = prepared(true);
  const session = ready(s);
  assert.equal(session.stockAllocation!.length, 3);
  finishCooking(s, 'meal', feedback);
  assert.deepEqual(
    s.inventory.map((b) => b.amount),
    r.ingredients.map((i) => i.amount),
  );
  assert.deepEqual(session.ratings, feedback.ratings);
  assert.equal(session.userRating, undefined);
  assert.equal(session.familyMemory, feedback.memory);
  assert.equal(session.photo, feedback.photo);
  assert.equal(session.consumptionMode, 'recipe-plan');
  assert.equal(archive(s).length, 1);
  const finished = structuredClone(s);
  finishCooking(s, 'meal', {
    ratings: { ...feedback.ratings, taste: 0 },
    memory: '',
  });
  assert.deepEqual(s, finished);
});

void test('all-temporary and mixed meals complete without creating or double-deducting inventory', () => {
  for (const partial of [false, true]) {
    const s = prepared();
    if (partial) s.inventory = [stock('egg', 1, '个')];
    ready(s);
    finishCooking(s, 'meal', { ratings: feedback.ratings, memory: '' });
    assert.equal(s.inventory.length, partial ? 1 : 0);
    assert.deepEqual(
      s.inventory.map((b) => b.amount),
      partial ? [0] : [],
    );
    assert.deepEqual(s.candidates, []);
    assert.equal(archive(s).length, 1);
  }
});

void test('later restocks remain intact for both fully stocked and partly temporary meals', () => {
  for (const full of [false, true]) {
    const s = prepared(full);
    if (!full) s.inventory = [stock('egg', 1.0004, '个')];
    const session = ready(s);
    const original = s.inventory[0];
    const planned = session.stockAllocation![0].amount;
    original.amount! += 5.0004;
    original.revision++;
    s.inventory.push(stock('egg', 12, '个', 'new-eggs'));
    const expected = original.amount! - planned;
    finishCooking(s, 'meal', feedback);
    assert.equal(original.amount, expected);
    assert.equal(s.inventory.at(-1)!.amount, 12);
    assert.equal(s.inventory.at(-1)!.revision, 1);
  }
});

void test('deleted, retyped, renamed or imprecise original stock never blocks completion or selects a replacement', () => {
  for (const change of ['deleted', 'unit', 'identity', 'band']) {
    const s = prepared();
    s.inventory = [stock('egg', 1, '个')];
    ready(s);
    if (change === 'deleted') s.inventory = [];
    else {
      const b = s.inventory[0];
      if (change === 'unit') b.unit = '盒';
      if (change === 'identity') b.canonicalIngredientId = 'tomato';
      if (change === 'band') {
        delete b.amount;
        b.amountBand = '少量';
      }
      b.revision++;
    }
    s.inventory.push(stock('egg', 10, '个', 'new'));
    const before = structuredClone(s.inventory);
    finishCooking(s, 'meal', feedback);
    assert.deepEqual(s.inventory, before);
    assert.equal(s.sessions[0].status, 'completed');
  }
});

void test('smaller current amounts clamp at zero; already consumed stock is not changed again', () => {
  for (const amount of [0, 0.4]) {
    const s = prepared(true);
    ready(s);
    s.inventory[0].amount = amount;
    s.inventory[0].revision = 3;
    finishCooking(s, 'meal', feedback);
    assert.equal(s.inventory[0].amount, 0);
    assert.equal(s.inventory[0].revision, amount ? 4 : 3);
  }
});

void test('legacy session fallback uses its snapshot and start date, not new stock or stale manual draft', () => {
  const s = prepared(true);
  s.inventory[0].expiryDate = date;
  const session = ready(s);
  delete session.stockAllocation;
  s.inventory.push(stock('egg', 10, '个', 'new'));
  session.reviewDraft = {
    ...feedback,
    consumption: [
      {
        batchId: 'new',
        expectedRevision: 1,
        remaining: { amount: 0, unit: '个' },
      },
    ],
  };
  finishCooking(
    s,
    'meal',
    {
      ratings: session.reviewDraft.ratings!,
      memory: session.reviewDraft.memory,
      photo: session.reviewDraft.photo,
    },
    '2026-09-07T12:00:00+08:00',
  );
  assert.equal(s.inventory[0].amount, 2);
  assert.equal(s.inventory.at(-1)!.amount, 10);
  assert.equal(session.reviewDraft, undefined);
  assert.equal(session.familyMemory, feedback.memory);
});

void test('empty saved plan and empty legacy snapshot never fall back to the current fridge', () => {
  for (const legacy of [false, true]) {
    const s = prepared(true);
    const session = ready(s);
    if (legacy) {
      delete session.stockAllocation;
      session.inventorySnapshot = [];
    } else session.stockAllocation = [];
    const before = structuredClone(s.inventory);
    finishCooking(s, 'meal', feedback);
    assert.deepEqual(s.inventory, before);
  }
});

void test('bad feedback or unfinished steps leave stock, fallback plan and session unchanged', () => {
  const s = prepared(true);
  const session = ready(s);
  delete session.stockAllocation;
  for (const bad of [
    { ...feedback, ratings: { ...feedback.ratings, taste: 0 } },
    { ...feedback, memory: 'x'.repeat(2001) },
    { ...feedback, photo: 'javascript:bad' },
  ]) {
    const before = structuredClone(s);
    assert.throws(() => finishCooking(s, 'meal', bad));
    assert.deepEqual(s, before);
  }
  session.status = 'cooking';
  const before = structuredClone(s);
  assert.throws(() => finishCooking(s, 'meal', feedback), /完成跟做/);
  assert.deepEqual(s, before);
});

void test('draft reopen and two connections finish atomically once without another stock-confirmation step', async () => {
  const factory = new IDBFactory();
  const first = new IndexedDbStore('simple-review', factory);
  await first.change('real', (s) => {
    s.inventory = [stock('egg', 1, '个')];
    ready(s).reviewDraft = feedback;
  });
  first.close();
  const a = new IndexedDbStore('simple-review', factory);
  const b = new IndexedDbStore('simple-review', factory);
  const loaded = await a.read('real');
  assert.deepEqual(loaded.sessions[0].reviewDraft, feedback);
  await b.change('real', (s) => {
    s.inventory[0].amount = 6;
    s.inventory[0].revision++;
  });
  await assert.rejects(
    a.change('real', (s) =>
      finishCooking(s, 'meal', {
        ...feedback,
        ratings: { ...feedback.ratings, taste: 0 },
      }),
    ),
  );
  assert.equal((await a.read('real')).inventory[0].amount, 6);
  await Promise.all(
    [a, b].map((store) =>
      store.change('real', (s) => finishCooking(s, 'meal', feedback)),
    ),
  );
  const finished = await a.read('real');
  assert.equal(finished.inventory[0].amount, 5);
  assert.equal(finished.inventory[0].revision, 3);
  assert.equal(archive(finished)[0].history.length, 1);
  assert.equal((await a.read('demo')).sessions.length, 0);
  a.close();
  b.close();
});
