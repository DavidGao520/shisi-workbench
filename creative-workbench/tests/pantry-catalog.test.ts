import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { IDBFactory } from 'fake-indexeddb';
import {
  baiweiIngredients,
  baiweiPantry,
  baiweiPantryAliases,
  baiweiPantryById,
  baiweiSeasonings,
} from '../lib/pantry-catalog';
import { names, ingredientAliases } from '../lib/recipes';
import { isSeasoning, seasonings } from '../lib/seasonings';
import { parseImport } from '../lib/kitchen';
import { IndexedDbStore } from '../lib/store';

const ingredientIds = [
  'tomato',
  'egg',
  'potato',
  'pork',
  'rice',
  'tofu',
  'green_pepper',
  'onion',
  'shiitake_mushrooms',
  'lamb_lettuce',
  'carrot',
  'chinese_cabbage',
  'eggplant',
  'green_beans',
  'soy_beans',
  'flour',
  'noodle',
  'lemon',
  'milk',
  'chicken_drum',
  'pork_ribs',
  'steak',
  'fish',
  'shrimp',
  'pork_belly',
  'whole_chicken',
  'crayfish',
  'wood_ear',
  'cucumber',
  'pineapple',
  'scallion',
  'tea_leaves',
  'clam',
  'sea_cucumber',
  'pork_intestine',
  'pig_trotter',
  'goose',
  'crab',
  'squid',
  'oyster',
  'scallop',
  'lamb',
  'lotus_root',
  'matsutake',
  'pickled_cabbage',
  'coconut',
  'cured_sausage',
];

const seasoningIds = [
  'salt',
  'chili',
  'vinegar',
  'sugar',
  'bay_leaf',
  'chili_oil',
  'cumin',
  'dark_soy_sauce',
  'doubanjiang',
  'garlic',
  'ginger',
  'spring_onion',
  'sichuan_pepper',
  'soy_sauce',
  'star_anise',
  'cilantro',
];

void test('catalog mirrors all 47 ingredients and 16 seasonings from the compendium', () => {
  assert.deepEqual(
    baiweiIngredients.map((item) => item.id),
    ingredientIds,
  );
  assert.deepEqual(
    baiweiSeasonings.map((item) => item.id),
    seasoningIds,
  );
  assert.equal(baiweiPantry.length, 63);
  assert.equal(new Set(baiweiPantry.map((item) => item.id)).size, 63);
  assert.equal(
    baiweiIngredients.filter((item) => item.frame === 'meat').length,
    20,
  );
  assert.ok(baiweiSeasonings.every((item) => item.frame === 'spice'));
});

void test('catalog names, aliases and seasoning ownership share one identity', () => {
  for (const item of baiweiPantry) {
    assert.equal(baiweiPantryById[item.id], item);
    // Recipe labels can be more specific than game labels (e.g. 鲜香菇).
    assert.ok(names[item.id]);
    assert.equal(ingredientAliases[item.name], item.id);
    assert.equal(ingredientAliases[names[item.id]], item.id);
    assert.equal(baiweiPantryAliases[item.name], item.id);
  }
  for (const item of baiweiSeasonings) {
    assert.equal(isSeasoning(item.id), true);
    assert.ok(seasonings.some((seasoning) => seasoning.id === item.id));
  }
  assert.equal(baiweiPantryAliases.白菜, 'chinese_cabbage');
  assert.equal(baiweiPantryAliases.西红柿, 'tomato');
  assert.equal(baiweiPantryAliases.小葱, 'spring_onion');
  assert.equal(baiweiPantryAliases.大葱, 'scallion');
});

void test('photo and manual candidates resolve every displayed compendium name', () => {
  for (const item of baiweiPantry) {
    const [candidate] = parseImport(
      JSON.stringify({
        schemaVersion: '1.0',
        requestId: 'catalog-' + item.id,
        source: 'workbuddy-image',
        createdAt: '2026-09-06T15:00:00+08:00',
        warnings: [],
        candidates: [
          {
            candidateId: item.id,
            displayName: item.name,
            warnings: [],
          },
        ],
      }),
      'real',
      'stocktake',
    );
    assert.equal(candidate.canonicalIngredientId, item.id);
  }
});

void test('a conflicting supplied identity cannot put the wrong artwork on a known name', () => {
  const [candidate] = parseImport(
    JSON.stringify({
      schemaVersion: '1.0',
      requestId: 'conflicting-card-identity',
      source: 'workbuddy-image',
      createdAt: '2026-09-06T15:00:00+08:00',
      warnings: [],
      candidates: [
        {
          candidateId: 'egg-labelled-as-pork',
          displayName: '鸡蛋',
          canonicalIngredientId: 'pork',
          warnings: [],
        },
      ],
    }),
    'real',
    'stocktake',
  );
  assert.equal(candidate.canonicalIngredientId, 'egg');
  assert.ok(candidate.warnings.some((warning) => warning.includes('不一致')));
});

void test('legacy other batches gain their known card identity without merging or changing stock', async () => {
  const store = new IndexedDbStore('pantry-card-migration', new IDBFactory());
  await store.change('real', (state) => {
    state.inventory.push({
      id: 'legacy-onion',
      displayName: '洋葱',
      canonicalIngredientId: 'other',
      amount: 2,
      unit: '个',
      expiryDate: '2026-09-12',
      revision: 4,
      confirmed: true,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });
  });
  store.close();
  const loaded = await store.read('real');
  assert.equal(loaded.inventory[0].canonicalIngredientId, 'onion');
  assert.equal(loaded.inventory[0].amount, 2);
  assert.equal(loaded.inventory[0].expiryDate, '2026-09-12');
  assert.equal(loaded.inventory[0].revision, 4);
  assert.equal(loaded.inventory.length, 1);
  store.close();
});

void test('every compendium card and its three category frames are bundled inline', async () => {
  const artSource = await readFile(
    new URL('../lib/art.ts', import.meta.url),
    'utf8',
  );
  for (const item of baiweiPantry) {
    const asset = new URL(
      '../public/art/cards/' + item.id + '.webp',
      import.meta.url,
    );
    await access(asset);
    assert.ok(
      artSource.includes('/cards/' + item.id + '.webp?inline'),
      item.id + ' must be part of the self-contained build',
    );
  }
  for (const frame of ['card_frame_veg', 'card_frame_meat', 'card_frame_spice'])
    await access(
      new URL('../public/art/cards/' + frame + '.webp', import.meta.url),
    );
});
