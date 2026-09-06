export type PantryCardKind = 'ingredient' | 'seasoning';
export type PantryCardFrame = 'vegetable' | 'meat' | 'spice';

export type BaiweiPantryItem = {
  id: string;
  name: string;
  sourceName: string;
  aliases: readonly string[];
  kind: PantryCardKind;
  frame: PantryCardFrame;
};

const ingredient = (
  id: string,
  name: string,
  options: {
    sourceName?: string;
    aliases?: readonly string[];
    meat?: boolean;
  } = {},
): BaiweiPantryItem => ({
  id,
  name,
  sourceName: options.sourceName || name,
  aliases: options.aliases || [],
  kind: 'ingredient',
  frame: options.meat ? 'meat' : 'vegetable',
});

const seasoning = (
  id: string,
  name: string,
  options: { sourceName?: string; aliases?: readonly string[] } = {},
): BaiweiPantryItem => ({
  id,
  name,
  sourceName: options.sourceName || name,
  aliases: options.aliases || [],
  kind: 'seasoning',
  frame: 'spice',
});

/**
 * The 47 ingredient cards in Chinese-Cuisine's beta 0.6 compendium.
 * Names stay practical for a real pantry where the game wording is ambiguous.
 */
export const baiweiIngredients = [
  ingredient('tomato', '番茄', { sourceName: '西红柿' }),
  ingredient('egg', '鸡蛋'),
  ingredient('potato', '土豆'),
  ingredient('pork', '猪肉', { meat: true }),
  ingredient('rice', '生大米', { sourceName: '米饭', aliases: ['大米'] }),
  ingredient('tofu', '豆腐'),
  ingredient('green_pepper', '青椒'),
  ingredient('onion', '洋葱'),
  ingredient('shiitake_mushrooms', '香菇'),
  ingredient('lamb_lettuce', '油麦菜'),
  ingredient('carrot', '胡萝卜'),
  ingredient('chinese_cabbage', '大白菜', { aliases: ['白菜'] }),
  ingredient('eggplant', '茄子'),
  ingredient('green_beans', '四季豆', { aliases: ['豆角'] }),
  ingredient('soy_beans', '黄豆'),
  ingredient('flour', '面粉'),
  ingredient('noodle', '面条'),
  ingredient('lemon', '柠檬'),
  ingredient('milk', '牛奶'),
  ingredient('chicken_drum', '鸡腿', { meat: true }),
  ingredient('pork_ribs', '排骨', { meat: true }),
  ingredient('steak', '牛肉', { meat: true }),
  ingredient('fish', '鱼', { aliases: ['鱼肉'], meat: true }),
  ingredient('shrimp', '虾', { meat: true }),
  ingredient('pork_belly', '五花肉', { meat: true }),
  ingredient('whole_chicken', '整鸡', {
    aliases: ['整只鸡', '整只生鸡'],
    meat: true,
  }),
  ingredient('crayfish', '小龙虾', { meat: true }),
  ingredient('wood_ear', '黑木耳', { aliases: ['木耳'] }),
  ingredient('cucumber', '黄瓜'),
  ingredient('pineapple', '菠萝'),
  ingredient('scallion', '大葱'),
  ingredient('tea_leaves', '龙井茶叶', { aliases: ['茶叶'] }),
  ingredient('clam', '蛤蜊', { meat: true }),
  ingredient('sea_cucumber', '海参', { meat: true }),
  ingredient('pork_intestine', '大肠', {
    aliases: ['猪大肠'],
    meat: true,
  }),
  ingredient('pig_trotter', '猪蹄', { aliases: ['猪脚'], meat: true }),
  ingredient('goose', '大鹅', { aliases: ['鹅'], meat: true }),
  ingredient('crab', '大闸蟹', { aliases: ['螃蟹'], meat: true }),
  ingredient('squid', '鱿鱼', { meat: true }),
  ingredient('oyster', '生蚝', { aliases: ['牡蛎'], meat: true }),
  ingredient('scallop', '扇贝', { meat: true }),
  ingredient('lamb', '羊肉', { meat: true }),
  ingredient('lotus_root', '莲藕'),
  ingredient('matsutake', '松茸'),
  ingredient('pickled_cabbage', '酸菜'),
  ingredient('coconut', '椰子'),
  ingredient('cured_sausage', '腊肠', { meat: true }),
] as const satisfies readonly BaiweiPantryItem[];

/** The 16 seasoning cards in the same compendium. */
export const baiweiSeasonings = [
  seasoning('salt', '盐'),
  seasoning('chili', '辣椒'),
  seasoning('vinegar', '醋'),
  seasoning('sugar', '白糖', { sourceName: '糖' }),
  seasoning('bay_leaf', '香叶'),
  seasoning('chili_oil', '辣椒油'),
  seasoning('cumin', '孜然'),
  seasoning('dark_soy_sauce', '老抽'),
  seasoning('doubanjiang', '豆瓣酱'),
  seasoning('garlic', '大蒜', { aliases: ['蒜'] }),
  seasoning('ginger', '生姜', { aliases: ['姜'] }),
  seasoning('spring_onion', '小葱', { aliases: ['香葱'] }),
  seasoning('sichuan_pepper', '花椒'),
  seasoning('soy_sauce', '生抽', { aliases: ['酱油'] }),
  seasoning('star_anise', '八角'),
  seasoning('cilantro', '香菜'),
] as const satisfies readonly BaiweiPantryItem[];

export const baiweiPantry = [
  ...baiweiIngredients,
  ...baiweiSeasonings,
] as const;

export const baiweiIngredientNames: Record<string, string> = Object.fromEntries(
  baiweiIngredients.map((item) => [item.id, item.name]),
);

export const baiweiPantryAliases: Record<string, string> = Object.fromEntries(
  baiweiPantry.flatMap((item) =>
    [...new Set([item.name, item.sourceName, ...item.aliases])].map((name) => [
      name,
      item.id,
    ]),
  ),
);

export const baiweiPantryById: Record<string, BaiweiPantryItem> =
  Object.fromEntries(baiweiPantry.map((item) => [item.id, item]));
