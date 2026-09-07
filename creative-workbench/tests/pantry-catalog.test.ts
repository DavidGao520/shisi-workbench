import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { IDBFactory } from 'fake-indexeddb';
import {
  baiweiIngredients,
  baiweiPantry,
  baiweiPantryAliases,
  baiweiPantryById,
  baiweiSeasonings,
} from '../lib/pantry-catalog';
import {
  names,
  ingredientAliases,
  inventoryIngredientId,
  recipes,
} from '../lib/recipes';
import { isSeasoning, seasonings } from '../lib/seasonings';
import {
  parseImport,
  emptyState,
  normalizePantryIdentities,
  matching,
} from '../lib/kitchen';
import { IndexedDbStore } from '../lib/store';
import { restoreDemoKitchen } from '../lib/demo-kitchen';
import { pantryArtId } from '../lib/pantry-art';

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

void test('legacy pantry aliases keep the same identity before and after normalization', () => {
  for (const [displayName, id] of Object.entries({
    米饭: 'cooked_rice',
    剩饭: 'cooked_rice',
    油: 'oil',
  })) {
    const state = emptyState('real');
    state.inventory = [
      {
        id: 'legacy',
        displayName,
        canonicalIngredientId: 'other',
        amount: 400,
        unit: '克',
        confirmed: true,
        revision: 1,
        createdAt: '2026-09-06',
        updatedAt: '2026-09-06',
      },
    ];
    const snapshot = structuredClone(state.inventory[0]);
    assert.equal(inventoryIngredientId(snapshot), id);
    const riceRecipe = recipes.find((recipe) => recipe.id === 'steamed_rice')!;
    const before = matching(state, riceRecipe).find(
      (item) => item.id === 'rice',
    )!.have;
    normalizePantryIdentities(state);
    assert.equal(inventoryIngredientId(state.inventory[0]), id);
    assert.equal(inventoryIngredientId(snapshot), id);
    assert.equal(state.inventory[0].revision, snapshot.revision);
    assert.equal(state.inventory[0].amount, snapshot.amount);
    assert.equal(before, 0);
    assert.equal(
      matching(state, riceRecipe).find((item) => item.id === 'rice')!.have,
      before,
    );
  }
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

void test('workbench-only staples have distinct inline card art without changing the compendium', async () => {
  const artSource = await readFile(
    new URL('../lib/art.ts', import.meta.url),
    'utf8',
  );
  const supplementalCards = [
    {
      id: 'chicken_wings',
      kind: 'ingredient',
      theme: 'meat',
      frame: 'meatCardFrame',
      image: 'cardChickenWings',
    },
    {
      id: 'cola',
      kind: 'ingredient',
      theme: 'vegetable',
      frame: 'vegetableCardFrame',
      image: 'cardCola',
    },
    {
      id: 'oil',
      kind: 'seasoning',
      theme: 'spice',
      frame: 'spiceCardFrame',
      image: 'cardOil',
    },
    {
      id: 'cooking_wine',
      kind: 'seasoning',
      theme: 'spice',
      frame: 'spiceCardFrame',
      image: 'cardCookingWine',
    },
    {
      id: 'starch',
      kind: 'seasoning',
      theme: 'spice',
      frame: 'spiceCardFrame',
      image: 'cardStarch',
    },
    {
      id: 'cooked_rice',
      kind: 'ingredient',
      theme: 'vegetable',
      frame: 'vegetableCardFrame',
      image: 'cardCookedRice',
    },
    {
      id: 'white_pepper',
      kind: 'seasoning',
      theme: 'spice',
      frame: 'spiceCardFrame',
      image: 'cardWhitePepper',
    },
    {
      id: 'dried_chili',
      kind: 'seasoning',
      theme: 'spice',
      frame: 'spiceCardFrame',
      image: 'cardDriedChili',
    },
    {
      id: 'sesame_oil',
      kind: 'seasoning',
      theme: 'spice',
      frame: 'spiceCardFrame',
      image: 'cardSesameOil',
    },
    {
      id: 'water',
      kind: 'ingredient',
      theme: 'vegetable',
      frame: 'vegetableCardFrame',
      image: 'cardWater',
    },
  ] as const;

  assert.equal(baiweiPantry.length, 63);
  for (const item of supplementalCards) {
    const imageBytes = await readFile(
      new URL('../public/art/cards/' + item.id + '.webp', import.meta.url),
    );
    assert.equal(imageBytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(imageBytes.toString('ascii', 8, 12), 'WEBP');
    assert.equal(imageBytes.toString('ascii', 12, 16), 'VP8X');
    assert.ok(imageBytes[20] & 0x10, item.id + ' must retain an alpha channel');
    assert.equal(imageBytes.readUIntLE(24, 3) + 1, 512);
    assert.equal(imageBytes.readUIntLE(27, 3) + 1, 512);
    assert.ok(
      artSource.includes('/cards/' + item.id + '.webp?inline'),
      item.id + ' must be part of the self-contained build',
    );
    const cardBlock = artSource.split(`  ${item.id}: {`)[1]?.split('  },')[0];
    assert.ok(cardBlock, item.id + ' must have supplemental card metadata');
    assert.ok(cardBlock.includes(`frame: ${item.frame}`));
    assert.ok(cardBlock.includes(`image: ${item.image}`));
    assert.ok(cardBlock.includes(`kind: '${item.kind}'`));
    assert.ok(cardBlock.includes(`theme: '${item.theme}'`));
    if (item.id === 'cooked_rice') {
      assert.ok(cardBlock.includes('image: cardCookedRice'));
      assert.ok(!cardBlock.includes('image: cardRice,'));
    }
  }
});

void test('every item in the guided sample pantry has an inline card illustration', async () => {
  const state = emptyState('demo');
  restoreDemoKitchen(state, '2026-09-07');
  const artSource = await readFile(
    new URL('../lib/art.ts', import.meta.url),
    'utf8',
  );
  for (const batch of state.inventory) {
    const id = pantryArtId(batch.canonicalIngredientId, batch.displayName);
    await access(
      new URL('../public/art/cards/' + id + '.webp', import.meta.url),
    );
    assert.ok(
      artSource.includes('/cards/' + id + '.webp?inline'),
      batch.displayName + ' must have artwork in the web and offline builds',
    );
  }
});

void test('wings and cola reuse the exact original game artwork bytes', async () => {
  const originals = {
    chicken_wings:
      'e753e2f9a7bd5d810bc36efadc5647732884936e9644b79665abee8afd8f0c44',
    cola: 'a846457a7d9c90283e39b29558fb2a680fbf88a8472963ec3d79c581fe5b6703',
  };
  for (const [id, hash] of Object.entries(originals)) {
    const bytes = await readFile(
      new URL('../public/art/cards/' + id + '.webp', import.meta.url),
    );
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash);
  }
});

void test('photo artwork aliases work for existing records without changing food identities', () => {
  for (const [name, artId] of Object.entries({
    鸡翅: 'chicken_wings',
    鸡中翅: 'chicken_wings',
    鸡翅中: 'chicken_wings',
    可乐: 'cola',
    可口可乐: 'cola',
    普通可乐: 'cola',
    普通含糖可乐: 'cola',
    生菜: 'chinese_cabbage',
  })) {
    assert.equal(pantryArtId('other', ' ' + name + ' '), artId);
  }
  assert.equal(pantryArtId('chicken_wings', '鸡翅'), 'chicken_wings');
  assert.equal(pantryArtId('cola', '普通含糖可乐'), 'cola');
  assert.equal(pantryArtId('other', '鸡肉'), 'whole_chicken');
  assert.equal(pantryArtId('fish_fillet', '去骨鱼片'), 'fish');
  assert.equal(pantryArtId('other', '可乐鸡翅'), 'other');
  assert.equal(pantryArtId('other', '生菜沙拉'), 'other');
  assert.equal(pantryArtId('other', 'constructor'), 'other');
  assert.equal(pantryArtId('lamb_lettuce', '油麦菜'), 'lamb_lettuce');
  assert.equal(pantryArtId('chinese_cabbage', '白菜'), 'chinese_cabbage');

  const state = emptyState('real');
  state.inventory = ['生菜', '可口可乐'].map((displayName) => ({
    id: displayName,
    displayName,
    canonicalIngredientId: 'other',
    amount: 2,
    unit: '个' as const,
    revision: 1,
    confirmed: true as const,
    createdAt: '2026-09-07',
    updatedAt: '2026-09-07',
  }));
  const before = structuredClone(state);
  state.inventory.forEach((batch) =>
    pantryArtId(batch.canonicalIngredientId, batch.displayName),
  );
  normalizePantryIdentities(state);
  assert.deepEqual(
    state,
    before,
    'borrowing illustrations must not rename, reclassify or alter stock',
  );
  const soup = recipes.find((recipe) => recipe.id === 'cabbage_tofu_soup')!;
  assert.equal(
    matching(state, soup).find((item) => item.id === 'chinese_cabbage')!.have,
    0,
  );
  const wings = recipes.find((recipe) => recipe.id === 'cola_chicken_wings')!;
  assert.equal(
    matching(state, wings).find((item) => item.id === 'cola')!.have,
    0,
    'brand alone does not establish sugary cola',
  );
});
