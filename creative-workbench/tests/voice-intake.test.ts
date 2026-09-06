import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { IndexedDbStore } from '../lib/store';
import { emptyState } from '../lib/kitchen';
import {
  confirmVoiceDraft,
  extractIngredients,
  prepareVoiceDraft,
  spokenNumber,
} from '../lib/voice-intake';

void test('spoken quantities: Chinese, decimals, halves, mass conversion, no invented package size', () => {
  assert.equal(spokenNumber('十一'), 11);
  assert.equal(spokenNumber('二十五'), 25);
  assert.equal(spokenNumber('一百零二'), 102);
  assert.equal(spokenNumber('两三'), undefined);
  assert.equal(spokenNumber('一点五'), 1.5);
  assert.equal(spokenNumber('一千五'), undefined);
  assert.equal(spokenNumber('一百二'), undefined);
  const { items } = extractIngredients(
    '两个番茄和三个鸡蛋，还有半斤猪肉，一公斤土豆，一盒豆腐',
  );
  assert.deepEqual(
    items.map((i) => [i.displayName, i.amount, i.unit]),
    [
      ['番茄', 2, '个'],
      ['鸡蛋', 3, '个'],
      ['猪肉', 250, '克'],
      ['土豆', 1000, '克'],
      ['豆腐', 1, '盒'],
    ],
  );
});
void test('postfix quantities do not leak into next food', () => {
  assert.deepEqual(
    extractIngredients('鸡蛋有十一个，豆腐半盒').items.map((i) => i.amount),
    [11, 0.5],
  );
  assert.deepEqual(
    extractIngredients('鸡蛋两个和番茄三个').items.map((i) => i.amount),
    [2, 3],
  );
  assert.deepEqual(
    extractIngredients('鸡蛋和两个番茄').items.map((i) => i.amount),
    [undefined, 2],
  );
});
void test('negatives and plans do not become inventory; cooking dish names are not stock', () => {
  assert.deepEqual(
    extractIngredients('没有鸡蛋和盐，有两个番茄').items.map(
      (i) => i.displayName,
    ),
    ['番茄'],
  );
  assert.equal(extractIngredients('猪肉用完了，鸡蛋没有了').items.length, 0);
  assert.deepEqual(
    extractIngredients('我想做西红柿炒鸡蛋，冰箱有两个土豆').items.map(
      (i) => i.displayName,
    ),
    ['土豆'],
  );
  assert.deepEqual(
    extractIngredients('不要记鸡蛋，只记两个番茄').items.map(
      (i) => i.displayName,
    ),
    ['番茄'],
  );
  assert.equal(extractIngredients('鸡蛋和番茄都没有').items.length, 0);
  assert.equal(extractIngredients('鸡蛋番茄都用完了').items.length, 0);
  assert.equal(extractIngredients('不要鸡蛋').items.length, 0);
});
void test('longest food match preserves sauces and cooked rice identities', () => {
  const items = extractIngredients(
    '番茄酱一袋，辣椒油少量，大米一袋，剩饭',
  ).items;
  assert.deepEqual(
    items.map((i) => i.canonicalIngredientId),
    ['ketchup', 'chili_oil', 'rice', 'cooked_rice'],
  );
  assert.equal(items[3].amount, undefined);
  assert.equal(items[3].amountBand, undefined);
});

void test('processed-food names never become raw tofu or overwrite its stocktake record', () => {
  assert.deepEqual(
    extractIngredients('鱼豆腐500克，毛豆腐300克，臭豆腐200克').items.map(
      (item) => [item.displayName, item.canonicalIngredientId, item.amount],
    ),
    [
      ['鱼豆腐', 'other', 500],
      ['毛豆腐', 'other', 300],
      ['臭豆腐', 'other', 200],
    ],
  );
  const state = emptyState('real');
  state.inventory = [
    {
      id: 'plain',
      canonicalIngredientId: 'tofu',
      displayName: '豆腐',
      amount: 100,
    },
    {
      id: 'prepared',
      canonicalIngredientId: 'other',
      displayName: '毛豆腐',
      amount: 300,
    },
    {
      id: 'custom',
      canonicalIngredientId: 'other',
      displayName: '自家卤豆腐(袋装)',
      amount: 200,
    },
  ].map((item) => ({
    ...item,
    unit: '克',
    revision: 1,
    confirmed: true,
    createdAt: '2026-09-06',
    updatedAt: '2026-09-06',
  }));
  const { rows } = prepareVoiceDraft(
    '毛豆腐500克，自家卤豆腐(袋装)还有250克',
    state,
    'stocktake',
  );
  assert.deepEqual(
    rows.map((row) => [row.name, row.ingredientId, row.targetId]),
    [
      ['毛豆腐', 'other', 'prepared'],
      ['自家卤豆腐(袋装)', 'other', 'custom'],
    ],
  );
  confirmVoiceDraft(state, 'real', rows);
  assert.deepEqual(
    state.inventory.map((item) => item.amount),
    [100, 500, 250],
  );
});
void test('uncertain, repeated and corrected quantities remain for explicit review', () => {
  for (const text of [
    '鸡蛋两三个',
    '鸡蛋两个，不对，三个',
    '鸡蛋两个，鸡蛋三个',
    '大半斤猪肉',
  ]) {
    const { items } = extractIngredients(text);
    assert.equal(items.length, 1, text);
    assert.equal(items[0].amount, undefined, text);
  }
  assert.equal(extractIngredients('两瓶水').items[0].amount, undefined);
  assert.ok(extractIngredients('一些不认识的东西').warnings.length);
  for (const text of [
    '五到六个鸡蛋',
    '12-15个鸡蛋',
    '负三个鸡蛋',
    '一千五克猪肉',
  ]) {
    assert.equal(extractIngredients(text).items[0].amount, undefined, text);
  }
  assert.ok(
    extractIngredients('鸡蛋两个番茄三个').items.every(
      (item) => item.amount === undefined,
    ),
  );
});
void test('voice preview is inert; explicit confirmation writes all rows once, edits included', async () => {
  const store = new IndexedDbStore('voice-confirm', new IDBFactory());
  const state = await store.read('real');
  const draft = prepareVoiceDraft(
    '两个番茄，一盒鸡蛋，还有猪肉',
    state,
    'stocktake',
    'voice-fixed',
  );
  assert.equal((await store.read('real')).inventory.length, 0);
  draft.rows[0].amount = '3';
  draft.rows[1].selected = false;
  await store.change('real', (s) => {
    assert.equal(confirmVoiceDraft(s, 'real', draft.rows), 2);
  });
  await store.change('real', (s) => {
    assert.equal(confirmVoiceDraft(s, 'real', draft.rows), 0);
  });
  const saved = await store.read('real');
  assert.equal(saved.inventory.length, 2);
  assert.equal(saved.inventory[0].amount, 3);
  assert.equal(saved.inventory[1].displayName, '猪肉');
  assert.equal(saved.inventory[1].amountBand, '有，数量待确认');
  assert.equal((await store.read('demo')).inventory.length, 0);
  store.close();
});
void test('stocktake preserves expiry and checks snapshot revision; all-row failure rolls back', async () => {
  const store = new IndexedDbStore('voice-atomic', new IDBFactory());
  const state = await store.change('real', (s) => {
    s.inventory.push({
      id: 'egg-old',
      displayName: '鸡蛋',
      canonicalIngredientId: 'egg',
      amount: 10,
      unit: '个',
      revision: 1,
      expiryDate: '2099-01-01',
      confirmed: true,
      createdAt: '2026-09-05',
      updatedAt: '2026-09-05',
    });
  });
  const draft = prepareVoiceDraft('两个番茄，鸡蛋三个', state, 'stocktake');
  assert.equal(draft.rows[1].targetId, 'egg-old');
  await store.change('real', (s) => {
    s.inventory[0].revision++;
  });
  await assert.rejects(
    store.change('real', (s) => confirmVoiceDraft(s, 'real', draft.rows)),
    /库存已变化/,
  );
  const failed = await store.read('real');
  assert.equal(failed.inventory.length, 1);
  assert.equal(failed.candidates.length, 0);
  assert.ok(draft.rows.every((r) => r.candidate.status === 'pending'));
  draft.rows[1].targetRevision = 2;
  draft.rows.forEach((row) => {
    row.expectedInventoryRevision = failed.revision;
  });
  await store.change('real', (s) => confirmVoiceDraft(s, 'real', draft.rows));
  const saved = await store.read('real');
  assert.equal(saved.inventory[0].amount, 3);
  assert.equal(saved.inventory[0].expiryDate, '2099-01-01');
  assert.equal(saved.inventory.length, 2);
  store.close();
});
void test('concurrent voice stocktakes cannot silently add duplicate batches', async () => {
  const store = new IndexedDbStore('concurrent-voice', new IDBFactory());
  const state = await store.read('real');
  const a = prepareVoiceDraft('鸡蛋三个', state, 'stocktake');
  const b = prepareVoiceDraft('鸡蛋五个', state, 'stocktake');
  await store.change('real', (s) => confirmVoiceDraft(s, 'real', b.rows));
  await assert.rejects(
    store.change('real', (s) => confirmVoiceDraft(s, 'real', a.rows)),
    /库存已变化/,
  );
  assert.equal((await store.read('real')).inventory.length, 1);
  store.close();
});
void test('batch choice, foreign kitchen and invalid quantities fail safely', () => {
  const state = emptyState('real');
  const draft = prepareVoiceDraft('两个番茄', state, 'stocktake');
  assert.throws(
    () => confirmVoiceDraft(emptyState('demo'), 'real', draft.rows),
    /厨房已切换/,
  );
  draft.rows[0].amount = '-1';
  assert.throws(() => confirmVoiceDraft(state, 'real', draft.rows), /非负/);
  assert.equal(state.inventory.length, 0);
  draft.rows[0].amount = '2';
  draft.rows[0].targetId = 'choose';
  assert.throws(() => confirmVoiceDraft(state, 'real', draft.rows), /库存卡片/);
});

void test('a stocktake without spoken quantity preserves an existing known amount', () => {
  const state = emptyState('real');
  state.inventory.push({
    id: 'known-eggs',
    displayName: '鸡蛋',
    canonicalIngredientId: 'egg',
    amount: 8,
    unit: '个',
    revision: 1,
    expiryDate: '2099-01-01',
    confirmed: true,
    createdAt: '2026-09-05',
    updatedAt: '2026-09-05',
  });
  const draft = prepareVoiceDraft('还有鸡蛋', state, 'stocktake');
  assert.equal(draft.rows[0].amount, '8');
  confirmVoiceDraft(state, 'real', draft.rows);
  assert.equal(state.inventory.length, 1);
  assert.equal(state.inventory[0].amount, 8);
});

void test('restock starts a new batch by default and explicit compatible merge adds once', async () => {
  const store = new IndexedDbStore('voice-restock', new IDBFactory());
  const state = await store.change('real', (s) => {
    s.inventory.push({
      id: 'eggs',
      displayName: '鸡蛋',
      canonicalIngredientId: 'egg',
      amount: 8,
      unit: '个',
      revision: 1,
      confirmed: true,
      createdAt: '2026-09-05',
      updatedAt: '2026-09-05',
    });
  });
  const draft = prepareVoiceDraft('三个鸡蛋', state, 'restock');
  assert.equal(draft.rows[0].targetId, '');
  draft.rows[0].targetId = 'eggs';
  draft.rows[0].targetRevision = 1;
  await store.change('real', (s) => confirmVoiceDraft(s, 'real', draft.rows));
  await store.change('real', (s) => confirmVoiceDraft(s, 'real', draft.rows));
  assert.equal((await store.read('real')).inventory[0].amount, 11);
  store.close();
});
