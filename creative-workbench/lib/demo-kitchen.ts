import {
  emptyState,
  finishCooking,
  startCooking,
  stepSession,
  today,
  type Batch,
  type KitchenState,
} from './kitchen';
import { names, recipes, type Recipe } from './recipes';
import { baiweiDishes } from './baiwei';
import type { IndexedDbStore } from './store';

export const demoRecipeIds = [
  'braised_pork',
  'boiled_fish',
  'cabbage_tofu_soup',
];
export const tourPages = ['today', 'inventory', 'today', 'cooking', 'archive'];
const demoHistoryRecipeIds = [
  'char_siu',
  'cola_chicken_wings',
  'cold_wood_ear',
  'fish_fragrant_pork',
  'fish_head_chili',
  'golden_egg',
  'green_pepper_egg',
  'green_pepper_pork',
  'jiuzhuan_intestine',
  'lions_head',
  'longjing_shrimp',
  'mapo_tofu',
  'onion_beef',
  'pineapple_pork',
  'roast_goose',
  'saliva_chicken',
  'spicy_crayfish',
  'sweet_sour_carp',
  'sweet_sour_ribs',
  'tomato_egg',
  'tomato_egg_soup',
  'carrot_ribs_soup',
  'soybean_trotter_soup',
  'chicken_mushroom_soup',
  'west_lake_beef_soup',
  'steamed_rice',
  'clay_pot_rice',
  'egg_fried_rice',
  'mantou',
  'yangchun_noodle',
  'jianbing',
  'scallion_sea_cucumber',
  'shiitake_lettuce',
  'garlic_oyster',
  'cumin_lamb',
];

function dayOffset(date: string, days: number) {
  const value = new Date(date + 'T12:00:00Z');
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function batch(
  id: string,
  amount: number,
  unit: string,
  date: string,
  key: string,
): Batch {
  return {
    id: key,
    canonicalIngredientId: id,
    displayName: names[id] || id,
    amount,
    unit,
    revision: 1,
    confirmed: true,
    createdAt: date + 'T08:00:00Z',
    updatedAt: date + 'T08:00:00Z',
  };
}

// Explicit sample quantities, not defaults for anyone's real kitchen.
const pantry: [string, number, string, number?][] = [
  ['pork_belly', 800, '克', 4],
  ['fish_fillet', 600, '克', 4],
  ['chinese_cabbage', 1000, '克', 7],
  ['tofu', 500, '克', 4],
  ['ginger', 100, '克', 10],
  ['garlic', 100, '克', 10],
  ['spring_onion', 100, '克', 7],
  ['oil', 500, '毫升'],
  ['salt', 100, '克'],
  ['sugar', 200, '克'],
  ['soy_sauce', 300, '毫升'],
  ['dark_soy_sauce', 150, '毫升'],
  ['cooking_wine', 300, '毫升'],
  ['starch', 200, '克'],
  ['white_pepper', 30, '克'],
  ['doubanjiang', 200, '克'],
  ['dried_chili', 50, '克'],
  ['sichuan_pepper', 30, '克'],
  ['star_anise', 20, '克'],
  ['bay_leaf', 5, '克'],
  ['sesame_oil', 100, '毫升'],
  ['water', 5000, '毫升'],
];

function sampleMeal(recipe: Recipe, date: string, index: number) {
  // Historical meals have their own past inventory snapshots. They never consume
  // today's sample pantry, and remain valid exports through the usual meal flow.
  const scratch = emptyState('demo');
  const day = dayOffset(date, -(index + 1) * 2);
  const id = `demo-history-v1-${recipe.id}`;
  scratch.inventory = recipe.ingredients.map((ingredient, i) =>
    batch(ingredient.id, ingredient.amount, ingredient.unit, day, `${id}-${i}`),
  );
  startCooking(scratch, recipe.id, id, day);
  scratch.sessions[0].createdAt = day + 'T09:00:00Z';
  stepSession(scratch, id, recipe.steps.length);
  finishCooking(
    scratch,
    id,
    {
      ratings: {
        taste: index % 3 === 0 ? 5 : 4,
        difficulty: 4,
        appearance: 4,
        difficultyScale: 'easy-high',
      },
      memory: [
        '样例食忆：下班后做的一顿家常晚饭。',
        '样例食忆：周末慢慢做，和家人一起吃。',
        '样例食忆：又学会一道，下回还想再做。',
      ][index % 3],
    },
    day + 'T10:00:00Z',
  );
  scratch.sessions[0].sampleRecord = true;
  return scratch.sessions[0];
}

/** Only an explicit reset or a genuinely untouched demo gets this baseline. */
export function restoreDemoKitchen(state: KitchenState, date = today()) {
  if (state.dataset !== 'demo') throw new Error('只能恢复样例厨房。');
  const revision = state.revision;
  const ignored = state.bridgeIgnoredTicketIds;
  const received = state.workbuddyReceivedTickets;
  Object.assign(state, emptyState('demo'));
  state.revision = revision;
  delete state.workbuddySteps;
  // Keep consumed/ignored delivery receipts so old external tasks cannot replay.
  state.bridgeIgnoredTicketIds = ignored;
  state.workbuddyReceivedTickets = received;
  state.inventory = pantry.map(([id, amount, unit, days]) => ({
    ...batch(id, amount, unit, date, `demo-pantry-v1-${id}`),
    ...(days ? { expiryDate: dayOffset(date, days) } : {}),
  }));
  const catalog = new Set(baiweiDishes.map((dish) => dish.id));
  state.sessions = demoHistoryRecipeIds.map((id, index) => {
    const recipe = recipes.find((item) => item.id === id);
    if (!recipe || !catalog.has(id)) throw new Error('样例菜谱缺失：' + id);
    return sampleMeal(recipe, date, index);
  });
  state.demoExperience = {
    version: 1,
    referenceDate: date,
    tourStep: 0,
    recipeId: demoRecipeIds[0],
  };
}

export async function openDemoKitchen(store: IndexedDbStore, date = today()) {
  const previous = await store.read('demo');
  if (previous.demoExperience) return previous;
  // Recheck inside the single read/write transaction: two tabs must not seed twice.
  return store.change('demo', (state) => {
    if (state.demoExperience) return;
    const hasLegacyContent =
      state.inventory.length ||
      state.candidates.length ||
      state.sessions.length ||
      Object.keys(state.reviews).length ||
      Object.keys(state.workbuddySteps || {}).length ||
      state.seasoningSetup ||
      JSON.stringify(state.preferences) !==
        JSON.stringify(emptyState('demo').preferences);
    if (!hasLegacyContent) {
      restoreDemoKitchen(state, date);
    } else {
      // Preserve nonempty legacy samples. New-version empty samples are already
      // protected by the marker above, including intentionally cleared pantries.
      state.demoExperience = {
        version: 1,
        referenceDate: date,
        tourStep: null,
        recipeId: demoRecipeIds[0],
      };
    }
  });
}

export function saveTourStep(
  state: KitchenState,
  step: number | null,
  recipeId?: string,
) {
  if (state.dataset !== 'demo' || !state.demoExperience)
    throw new Error('请先进入样例厨房。');
  if (
    step !== null &&
    (!Number.isInteger(step) || step < 0 || step >= tourPages.length)
  )
    throw new Error('无效参观步骤。');
  if (recipeId && !recipes.some((recipe) => recipe.id === recipeId))
    throw new Error('菜谱不存在。');
  state.demoExperience.tourStep = step;
  if (recipeId) state.demoExperience.recipeId = recipeId;
}
