import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { IndexedDbStore } from '../lib/store';
import {
  candidateReview,
  confirmReviewedCandidate,
  inventoryEditCandidate,
  stageInventoryEditCandidate,
} from '../lib/candidate-review';
import {
  emptyState,
  parseImport,
  stage,
  type KitchenState,
  type Mode,
} from '../lib/kitchen';
import { prepareVoiceDraft, confirmVoiceDraft } from '../lib/voice-intake';

function incoming(
  state: KitchenState,
  name = '鸡蛋',
  mode: Mode = 'stocktake',
  amount: number | undefined = 2,
) {
  const [candidate] = parseImport(
    JSON.stringify({
      schemaVersion: '1.0',
      requestId: crypto.randomUUID(),
      source: 'workbuddy-image',
      createdAt: new Date().toISOString(),
      candidates: [
        {
          candidateId: 'one',
          displayName: name,
          amount,
          unit: amount === undefined ? undefined : '个',
        },
      ],
    }),
    state.dataset,
    mode,
  );
  stage(state, [candidate]);
  return candidate;
}
function stocked() {
  const state = emptyState('real');
  const candidate = incoming(state);
  const review = candidateReview(state, candidate);
  confirmReviewedCandidate(state, candidate.key, review, {
    quantity: { amount: 8, unit: '个' },
    expiryDate: '2026-09-12',
  });
  return state;
}

void test('photo stocktake auto-links one existing food and never adds quantities or unseen changes', () => {
  const state = stocked();
  const potato = incoming(state, '土豆');
  confirmReviewedCandidate(state, potato.key, candidateReview(state, potato), {
    quantity: { amount: 3, unit: '个' },
  });
  const untouched = structuredClone(state.inventory[1]);
  const candidate = incoming(state);
  const review = candidateReview(state, candidate);
  assert.equal(review.targetId, state.inventory[0].id);
  assert.equal(review.expiryDate, '2026-09-12');
  confirmReviewedCandidate(state, candidate.key, review, {
    quantity: { amount: 4, unit: '个' },
    expiryDate: review.expiryDate,
  });
  assert.equal(state.inventory.length, 2);
  assert.equal(state.inventory[0].amount, 4);
  assert.equal(state.inventory[0].expiryDate, '2026-09-12');
  assert.deepEqual(state.inventory[1], untouched);
  confirmReviewedCandidate(state, candidate.key, review, {
    quantity: { amount: 99, unit: '个' },
  });
  assert.equal(state.inventory[0].amount, 4);
});

void test('explicit card edit remembers the exact batch even among identical names and after reopen', async () => {
  const store = new IndexedDbStore('candidate-review', new IDBFactory());
  const initial = stocked();
  initial.inventory.push({ ...initial.inventory[0], id: 'second', amount: 20 });
  const candidate = inventoryEditCandidate(initial, 'second');
  stage(initial, [candidate]);
  await store.change('real', (s) => Object.assign(s, initial));
  store.close();
  const saved = await store.read('real');
  const review = candidateReview(saved, saved.candidates.at(-1)!);
  assert.equal(review.targetId, 'second');
  assert.equal(review.quantity.amount, 20);
  await store.change('real', (s) =>
    confirmReviewedCandidate(s, candidate.key, review, {
      quantity: { amount: 10, unit: '个' },
      expiryDate: review.expiryDate,
    }),
  );
  const after = await store.read('real');
  assert.deepEqual(
    after.inventory.map((b) => b.amount),
    [8, 10],
  );
  store.close();
});

void test('reopening a card reuses only its current calibration draft', () => {
  const state = stocked();
  const id = state.inventory[0].id;
  const first = stageInventoryEditCandidate(state, id);
  assert.equal(stageInventoryEditCandidate(state, id).key, first.key);
  assert.equal(
    state.candidates.filter((candidate) => candidate.stocktakeTarget?.id === id)
      .length,
    1,
  );
  state.inventory[0].revision++;
  const current = stageInventoryEditCandidate(state, id);
  assert.notEqual(current.key, first.key);
  assert.equal(current.stocktakeTarget?.revision, state.inventory[0].revision);
});

void test('multiple matching batches block ambiguous photo or voice stocktake without a hidden chooser', () => {
  const state = stocked();
  state.inventory.push({ ...state.inventory[0], id: 'second' });
  const candidate = incoming(state);
  const review = candidateReview(state, candidate);
  const before = structuredClone(state);
  assert.match(review.problem, /库存卡片/);
  assert.throws(
    () =>
      confirmReviewedCandidate(state, candidate.key, review, {
        quantity: { amount: 2, unit: '个' },
      }),
    /库存卡片/,
  );
  assert.deepEqual(state, before);
  const draft = prepareVoiceDraft('两个鸡蛋', state, 'stocktake');
  assert.equal(draft.rows[0].targetId, 'choose');
  assert.throws(() => confirmVoiceDraft(state, 'real', draft.rows), /库存卡片/);
  assert.deepEqual(state, before);
});

void test('expired records remain linked and keep their date; mixed fresh and expired is ambiguous', () => {
  const state = stocked();
  state.inventory[0].expiryDate = '2020-01-01';
  const candidate = incoming(state);
  const review = candidateReview(state, candidate);
  assert.equal(review.expiryDate, '2020-01-01');
  const draft = prepareVoiceDraft('两个鸡蛋', state, 'stocktake');
  assert.equal(draft.rows[0].targetId, state.inventory[0].id);
  confirmVoiceDraft(state, 'real', draft.rows);
  assert.equal(state.inventory.length, 1);
  assert.equal(state.inventory[0].expiryDate, '2020-01-01');
  state.inventory.push({
    ...state.inventory[0],
    id: 'fresh',
    expiryDate: '2099-01-01',
  });
  assert.equal(
    prepareVoiceDraft('两个鸡蛋', state, 'stocktake').rows[0].targetId,
    'choose',
  );
});

void test('unknown quantity retains known stock; catalogued and unknown foods keep separate identities', () => {
  const state = stocked();
  const candidate = incoming(state, '鸡蛋', 'stocktake', undefined);
  // Delete explicit quantity to represent a photo with no reported quantity.
  delete candidate.amount;
  delete candidate.unit;
  assert.equal(candidateReview(state, candidate).quantity.amount, 8);
  const porkCandidate = incoming(state, '猪肉');
  assert.equal(porkCandidate.canonicalIngredientId, 'pork');
  assert.equal(candidateReview(state, porkCandidate).targetId, undefined);
  confirmReviewedCandidate(
    state,
    porkCandidate.key,
    candidateReview(state, porkCandidate),
    {
      quantity: { amount: 300, unit: '克' },
    },
  );
  const chicken = incoming(state, '鸡肉');
  assert.equal(chicken.canonicalIngredientId, 'other');
  assert.equal(candidateReview(state, chicken).targetId, undefined);
  confirmReviewedCandidate(
    state,
    chicken.key,
    candidateReview(state, chicken),
    { quantity: { amount: 300, unit: '克' } },
  );
  const pork = incoming(state, '猪肉');
  assert.equal(candidateReview(state, pork).targetId, state.inventory[1].id);
  const chickenAgain = incoming(state, '鸡肉');
  assert.equal(
    candidateReview(state, chickenAgain).targetId,
    state.inventory[2].id,
  );
});

void test('restock creates its own batch and does not overwrite old expiry or quantity', () => {
  const state = stocked();
  const old = structuredClone(state.inventory[0]);
  const candidate = incoming(state, '鸡蛋', 'restock');
  const review = candidateReview(state, candidate);
  assert.equal(review.targetId, undefined);
  assert.equal(review.expiryDate, undefined);
  confirmReviewedCandidate(state, candidate.key, review, {
    quantity: { amount: 3, unit: '个' },
  });
  assert.deepEqual(state.inventory[0], old);
  assert.equal(state.inventory.length, 2);
});

void test('stale review blocks concurrent duplicates and stale explicit targets', () => {
  const state = emptyState('real');
  const first = incoming(state),
    second = incoming(state);
  const firstReview = candidateReview(state, first),
    secondReview = candidateReview(state, second);
  confirmReviewedCandidate(state, first.key, firstReview, {
    quantity: { amount: 2, unit: '个' },
  });
  assert.throws(
    () =>
      confirmReviewedCandidate(state, second.key, secondReview, {
        quantity: { amount: 3, unit: '个' },
      }),
    /库存已变化/,
  );
  const edit = inventoryEditCandidate(state, state.inventory[0].id);
  stage(state, [edit]);
  const editReview = candidateReview(state, edit);
  state.inventory[0].revision++;
  assert.throws(
    () =>
      confirmReviewedCandidate(state, edit.key, editReview, {
        quantity: { amount: 1, unit: '个' },
      }),
    /已变化/,
  );
  assert.equal(state.inventory[0].amount, 2);
});
