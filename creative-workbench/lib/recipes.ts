import { baiweiIngredientNames, baiweiPantryAliases } from './pantry-catalog';
import { seasoningNames } from './seasonings';
import { legacyRecipes, LEGACY_RECIPE_VERSION } from './legacy-recipes';
import homeRecipeData from './home-recipes.json';
import gameDishes from './baiwei-dishes.json';
import type { Recipe, HomeRecipe } from './recipe-types';
export type {
  Recipe,
  RecipeSource,
  DetailedStep,
  HomeRecipe,
} from './recipe-types';

export const RECIPE_VERSION = '2026-09-06-home.1';
export const homeRecipes = homeRecipeData as HomeRecipe[];
const familiarFirst = ['tomato_egg', 'green_pepper_egg', 'tomato_egg_soup'];
export const recipes: Recipe[] = [
  ...familiarFirst,
  ...gameDishes
    .map((dish) => dish.id)
    .filter((id) => !familiarFirst.includes(id)),
].map((id) => {
  const home = homeRecipes.find((recipe) => recipe.id === id);
  const dish = gameDishes.find((dish) => dish.id === id);
  if (!home || !dish) throw new Error(`Missing complete home recipe: ${id}`);
  return {
    id,
    title: home.title,
    subtitle: dish.description,
    minutes: home.steps.reduce((sum, step) => sum + step.minutes, 0),
    equipment: home.equipment,
    allergens: home.allergens,
    ingredients: home.ingredients,
    steps: home.steps.map((step) => step.instruction),
    detailSteps: home.steps,
    baseServings: home.baseServings,
    yield: home.yield,
    sources: home.sources,
    safetyTips: home.safetyTips,
    source: home.sources[0].url,
    author: home.sources[0].author,
    knowledge: home.adaptation,
    image: id,
  };
});
export const names: Record<string, string> = {
  ...baiweiIngredientNames,
  ...Object.fromEntries(
    homeRecipes.flatMap((recipe) =>
      recipe.ingredients.map((item) => [item.id, item.name]),
    ),
  ),
  tomato: '番茄',
  egg: '鸡蛋',
  green_pepper: '青椒',
  water: '饮用水',
  cooked_rice: '熟米饭',
  tofu: '豆腐',
  potato: '土豆',
  pork: '猪肉',
  pork_belly: '五花肉',
  steak: '牛肉',
  lamb: '羊肉',
  pork_ribs: '排骨',
  pig_trotter: '猪蹄',
  pork_shank: '猪蹄髈',
  fish: '鱼',
  fish_fillet: '去骨鱼片',
  grass_carp: '草鱼',
  carp: '鲤鱼',
  crucian_carp: '鲫鱼',
  shrimp: '虾',
  peeled_shrimp: '虾仁',
  oyster: '半壳生蚝',
  oyster_meat: '去壳生蚝肉',
  crab: '大闸蟹',
  swimming_crab: '梭子蟹',
  squid: '鱿鱼',
  whole_chicken: '整鸡',
  chicken_drum: '带骨鸡腿',
  boneless_chicken_thigh: '去骨鸡腿肉',
  chicken_wings: '鸡翅',
  wood_ear: '黑木耳',
  dried_wood_ear: '干黑木耳',
  rehydrated_wood_ear: '泡发黑木耳',
  shiitake_mushrooms: '鲜香菇',
  dried_shiitake: '干香菇',
  soy_beans: '干黄豆',
  noodle: '鲜面条',
  dry_noodles: '干面条',
  fresh_huimian: '鲜烩面胚',
  coconut: '椰子',
  coconut_flesh: '鲜椰肉',
  coconut_water: '椰子水',
  coconut_milk: '椰浆',
  ginger: '生姜',
  garlic: '大蒜',
  spring_onion: '小葱',
  scallion: '大葱',
  chinese_cabbage: '大白菜',
  cabbage: '包菜',
  bok_choy: '小白菜',
  lamb_lettuce: '油麦菜',
  lotus_root: '莲藕',
  cured_sausage: '腊肠',
  cured_pork: '腊肉',
  pineapple: '去皮菠萝',
  matsutake: '鲜松茸',
  butter: '黄油',
  other: '其他食材',
  ...seasoningNames,
};

export const ingredientAliases: Record<string, string> = {
  ...baiweiPantryAliases,
  ...Object.fromEntries(
    homeRecipes.flatMap((recipe) =>
      recipe.ingredients.map((item) => [item.name, item.id]),
    ),
  ),
  ...Object.fromEntries(
    Object.entries(names)
      .filter(([id]) => id !== 'other')
      .map(([id, name]) => [name, id]),
  ),
  西红柿: 'tomato',
  白菜: 'chinese_cabbage',
  小油菜: 'bok_choy',
  青蒜: 'green_garlic',
  蒜苗: 'green_garlic',
  姜: 'ginger',
  蒜: 'garlic',
  香葱: 'spring_onion',
  酱油: 'soy_sauce',
  木耳: 'wood_ear',
  干木耳: 'dried_wood_ear',
  泡发木耳: 'rehydrated_wood_ear',
  香菇: 'shiitake_mushrooms',
  鸡腿: 'chicken_drum',
  鸡中翅: 'chicken_wings',
  普通含糖可乐: 'cola',
  猪肘: 'pork_shank',
  猪肘子: 'pork_shank',
  肉末: 'pork',
  猪肉末: 'pork',
  鱼片: 'fish_fillet',
  蛋: 'egg',
  黄豆: 'soy_beans',
  面条: 'noodle',
  挂面: 'dry_noodles',
  干挂面: 'dry_noodles',
  蚝肉: 'oyster_meat',
  海蛎肉: 'oyster_meat',
  椰肉: 'coconut_flesh',
  松茸: 'matsutake',
  粉藕: 'lotus_root',
  香油: 'sesame_oil',
  // Game source labels describe artwork; real inventory must keep cooked rice distinct.
  米饭: 'cooked_rice',
  剩饭: 'cooked_rice',
  油: 'oil',
};
/** Recognize exact legacy names without rewriting stored inventory on read. */
export function inventoryIngredientId(item: {
  canonicalIngredientId?: string;
  displayName: string;
}) {
  const id = item.canonicalIngredientId;
  return id && id !== 'other'
    ? id
    : ingredientAliases[item.displayName] || 'other';
}

export const safetyNote =
  '计时是操作估时，不是熟透保证。生熟用具分开；用食物温度计检查最厚处，中心达 75℃ 并维持至少 30 秒；鸡蛋须完全凝固。过敏原还需核对包装标签。';
export const safetySource =
  'https://www.cfs.gov.hk/sc_chi/trade_zone/safe_kitchen/Cooking_and_reheating.html';

export function recipePeople(recipe: Recipe, batches = 1) {
  return (recipe.baseServings || 1) * batches;
}
export function ingredientName(recipe: Recipe, id: string) {
  return (
    recipe.ingredients.find((item) => item.id === id)?.name || names[id] || id
  );
}
const scaled = (value: number, batches: number) =>
  Math.round(value * batches * 1000) / 1000;

export function detailedCookingSteps(recipe: Recipe, batches = 1) {
  if (recipe.workbuddyVersion || !recipe.detailSteps) return undefined;
  return recipe.detailSteps.map((step) => ({
    ...step,
    uses: step.uses.map((item) => ({
      ...item,
      amount: scaled(item.amount, batches),
    })),
    // Only measured food quantities scale; minutes, temperatures and knife dimensions do not.
    instruction: step.instruction.replace(
      /(\d+(?:\.\d+)?)\s*(克|毫升|个)/g,
      (_, amount: string, unit: string) =>
        `${scaled(Number(amount), batches)} ${unit}`,
    ),
  }));
}
export function cookingSteps(recipe: Recipe, batches: number) {
  const details = detailedCookingSteps(recipe, batches);
  if (details)
    return details.map(
      (step) =>
        `${step.title}｜约 ${step.minutes} 分钟 · ${step.heat}\n` +
        `本步用料：${step.uses.map((item) => `${ingredientName(recipe, item.id)} ${item.amount} ${item.unit}`).join('、') || '沿用上一步已处理食材，无新增用料'}\n` +
        `${step.instruction}\n完成判断：${step.checkpoint}`,
    );
  if (recipe.workbuddyVersion) return recipe.steps;
  return recipe.steps.map((step) =>
    step.replace(
      /(\d+) 毫升/g,
      (_, amount: string) => String(Number(amount) * batches) + ' 毫升',
    ),
  );
}

export function storedRecipe(session: {
  recipeId: string;
  recipeVersion: string;
  recipeSnapshot?: Recipe;
}) {
  if (session.recipeSnapshot) return session.recipeSnapshot;
  const catalog =
    session.recipeVersion === LEGACY_RECIPE_VERSION ? legacyRecipes : recipes;
  return catalog.find((recipe) => recipe.id === session.recipeId);
}
