import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IDBFactory } from 'fake-indexeddb';
import {
  confirmCandidate,
  defaultExpiryDate,
  emptyState,
  isExpired,
  parseImport,
  stage,
  type KitchenState,
  type Mode,
} from '../lib/kitchen';
import {
  candidateReview,
  confirmReviewedCandidate,
} from '../lib/candidate-review';
import { prepareVoiceDraft, confirmVoiceDraft } from '../lib/voice-intake';
import { confirmSeasoningSetup } from '../lib/seasoning-setup';
import { IndexedDbStore } from '../lib/store';

const at = '2026-09-10T12:00:00Z';
function incoming(
  state: KitchenState,
  source = 'manual-form',
  mode: Mode = 'restock',
) {
  const [candidate] = parseImport(
    JSON.stringify({
      schemaVersion: '1.0',
      requestId: crypto.randomUUID(),
      source,
      // Recognition may have happened days before the user confirms.
      createdAt: '2026-09-01T00:00:00Z',
      candidates: [
        { candidateId: 'one', displayName: '鸡蛋', amount: 2, unit: '个' },
      ],
    }),
    state.dataset,
    mode,
  );
  stage(state, [candidate]);
  return candidate;
}
function confirm(
  state: KitchenState,
  candidate: ReturnType<typeof incoming>,
  expiryDate?: string,
  when = at,
) {
  confirmReviewedCandidate(
    state,
    candidate.key,
    candidateReview(state, candidate),
    {
      quantity: { amount: 2, unit: '个' },
      expiryDate,
    },
    when,
  );
}

void test('seven calendar days handles local midnight, month/year rollover, leap years and DST', () => {
  assert.equal(defaultExpiryDate('2026-09-10'), '2026-09-17');
  assert.equal(defaultExpiryDate('2026-01-28'), '2026-02-04');
  assert.equal(defaultExpiryDate('2026-12-28'), '2027-01-04');
  assert.equal(defaultExpiryDate('2028-02-23'), '2028-03-01');
  assert.equal(defaultExpiryDate('2026-02-23'), '2026-03-02');
  assert.throws(() => defaultExpiryDate('not-a-date'), /入库时间/);
  const originalZone = process.env.TZ;
  try {
    process.env.TZ = 'Asia/Shanghai';
    assert.equal(defaultExpiryDate('2026-09-10T16:30:00Z'), '2026-09-18');
    process.env.TZ = 'America/Los_Angeles';
    assert.equal(defaultExpiryDate('2026-09-10T01:30:00Z'), '2026-09-16');
    assert.equal(defaultExpiryDate('2026-03-08T07:30:00Z'), '2026-03-14');
    assert.equal(defaultExpiryDate('2026-11-01T06:30:00Z'), '2026-11-07');
    assert.equal(defaultExpiryDate('2026-09-10'), '2026-09-17');
  } finally {
    if (originalZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalZone;
  }
});

void test('every intake source defaults new batches only when confirmed and preserves explicit dates', () => {
  for (const dataset of ['real', 'demo'] as const) {
    for (const mode of ['stocktake', 'restock'] as const) {
      for (const source of [
        'manual-form',
        'manual-text',
        'workbuddy-image',
        'gateway-image',
        'gateway-text',
        'workbuddy-voice-transcript',
        'browser-speech-transcript',
      ]) {
        const state = emptyState(dataset);
        const candidate = incoming(state, source, mode);
        assert.equal(state.inventory.length, 0);
        confirm(state, candidate);
        assert.equal(state.inventory[0].expiryDate, defaultExpiryDate(at));
        assert.equal(state.inventory[0].createdAt, at);
        const saved = structuredClone(state.inventory);
        confirm(state, candidate, undefined, '2026-10-01T12:00:00Z');
        assert.deepEqual(state.inventory, saved);
        const explicit = emptyState(dataset);
        confirm(explicit, incoming(explicit, source, mode), '2020-01-01');
        assert.equal(explicit.inventory[0].expiryDate, '2020-01-01');
        assert.ok(isExpired(explicit.inventory[0], '2026-09-10'));
      }
    }
  }
});

void test('voice multi-row confirmation shares one intake time, defaults blanks and keeps user dates', () => {
  const state = emptyState('real');
  const { rows } = prepareVoiceDraft(
    '鸡蛋2个，牛奶1盒，食用油',
    state,
    'restock',
  );
  assert.equal(rows.length, 3);
  rows[1].expiryDate = '2026-09-11';
  rows[2].expiryDate = '';
  confirmVoiceDraft(state, 'real', rows, at);
  assert.deepEqual(
    state.inventory.map((batch) => batch.expiryDate),
    [defaultExpiryDate(at), '2026-09-11', defaultExpiryDate(at)],
  );
  assert.ok(state.inventory.every((batch) => batch.createdAt === at));
  assert.equal(state.inventory[2].amount, undefined);
});

void test('stocktake/calibration never refreshes a known or unknown old expiry; new restock uses its own date', () => {
  for (const original of [undefined, '2020-01-01', '2026-09-12']) {
    const state = emptyState('real');
    confirm(state, incoming(state));
    state.inventory[0].expiryDate = original;
    const oldCreatedAt = state.inventory[0].createdAt;
    confirm(state, incoming(state, 'workbuddy-image', 'stocktake'));
    assert.equal(state.inventory[0].expiryDate, original);
    assert.equal(state.inventory[0].createdAt, oldCreatedAt);
    const { rows } = prepareVoiceDraft('鸡蛋3个', state, 'stocktake');
    rows[0].expiryDate = undefined;
    confirmVoiceDraft(state, 'real', rows, at);
    assert.equal(state.inventory[0].expiryDate, original);
    const saved = structuredClone(state.inventory[0]);
    confirm(state, incoming(state));
    assert.deepEqual(state.inventory[0], saved);
    assert.equal(state.inventory[1].expiryDate, defaultExpiryDate(at));
  }
});

void test('restock merging compares the effective default date and never hides a date mismatch', () => {
  const state = emptyState('real');
  confirm(state, incoming(state));
  const target = state.inventory[0];
  const same = incoming(state);
  const input = {
    name: '鸡蛋',
    ingredientId: 'egg',
    quantity: { amount: 2, unit: '个' },
    targetId: target.id,
    targetRevision: target.revision,
  };
  confirmCandidate(state, same.key, input, at);
  assert.equal(target.amount, 4);
  const later = incoming(state);
  const before = structuredClone(state);
  assert.throws(
    () =>
      confirmCandidate(
        state,
        later.key,
        { ...input, targetRevision: target.revision },
        '2026-09-11T12:00:00Z',
      ),
    /到期日期不同/,
  );
  assert.deepEqual(state, before);
});

void test('seasoning additions use the same default and duplicate receipts never extend it', () => {
  const state = emptyState('real');
  const input = {
    dataset: 'real' as const,
    selectedIds: ['salt', 'oil'],
    operationId: 'default-date',
  };
  confirmSeasoningSetup(state, input, at, '2026-09-10');
  assert.ok(
    state.inventory.every(
      (batch) => batch.expiryDate === defaultExpiryDate(at),
    ),
  );
  const before = structuredClone(state);
  confirmSeasoningSetup(state, input, '2026-10-10T12:00:00Z', '2026-10-10');
  assert.deepEqual(state, before);
});

void test('stored defaults survive reload; reading legacy inventory never adds or rolls dates forward', async () => {
  const store = new IndexedDbStore('default-expiry', new IDBFactory());
  const saved = await store.change('real', (state) =>
    confirm(state, incoming(state)),
  );
  assert.deepEqual(await store.read('real'), saved);
  assert.equal(
    isExpired(saved.inventory[0], saved.inventory[0].expiryDate!),
    false,
  );
  assert.equal(isExpired(saved.inventory[0], '2026-10-10'), true);
  const legacy = await store.change('real', (state) => {
    delete state.inventory[0].expiryDate;
  });
  assert.deepEqual(await store.read('real'), legacy);
  assert.equal((await store.read('demo')).inventory.length, 0);
  store.close();
});

void test('intake copy explains blank defaults without claiming seven days of food safety', () => {
  for (const file of ['app/page.tsx', 'components/voice-intake.tsx']) {
    const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    assert.match(source, /到期日期（留空默认7天后）/);
    assert.match(source, /到期日期（留空不修改）/);
    assert.match(source, /默认日期仅作提醒/);
    assert.doesNotMatch(source, /到期日期（不知道可留空）/);
  }
});
