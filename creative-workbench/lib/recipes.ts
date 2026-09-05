export const RECIPE_VERSION = '2026-09-05-draft.1';
export const names: Record<string, string> = {
  tomato: '番茄',
  egg: '鸡蛋',
  green_pepper: '青椒',
  oil: '食用油',
  salt: '盐',
  soy_sauce: '生抽',
  water: '饮用水',
  rice: '生大米',
  cooked_rice: '熟米饭',
  tofu: '豆腐',
  potato: '土豆',
  other: '其他食材',
};
export type Recipe = {
  id: string;
  title: string;
  subtitle: string;
  minutes: number;
  equipment: string;
  allergens: string[];
  ingredients: { id: string; amount: number; unit: string }[];
  steps: string[];
  source: string;
  author: string;
  knowledge: string;
  image: string;
};
export const recipes: Recipe[] = [
  {
    id: 'tomato_egg',
    title: '西红柿炒鸡蛋',
    subtitle: '酸甜相逢，最熟悉的家常味',
    minutes: 15,
    equipment: '炒锅',
    allergens: ['鸡蛋'],
    ingredients: [
      { id: 'tomato', amount: 250, unit: '克' },
      { id: 'egg', amount: 2, unit: '个' },
      { id: 'oil', amount: 15, unit: '毫升' },
      { id: 'salt', amount: 1, unit: '克' },
      { id: 'water', amount: 30, unit: '毫升' },
    ],
    steps: [
      '番茄洗净去蒂，切小块。鸡蛋打散，加入一半盐。接触生蛋后清洁双手和用具。',
      '中火温锅，加入约 10 毫升油。倒入蛋液，轻推成块，凝固后盛出。',
      '加剩余油，下番茄，翻炒至变软、开始出汁。',
      '加 30 毫升水和剩余盐，把鸡蛋倒回锅中。',
      '翻炒至番茄软烂、鸡蛋彻底熟透，无流动生蛋液。按喜好略收汁，关火盛出。',
    ],
    source: 'https://thewoksoflife.com/stir-fried-tomato-and-egg/',
    author: 'Sarah · The Woks of Life',
    knowledge:
      '先炒蛋、再炒番茄，最后合炒，是把两种食材分阶段处理的一种家常做法。',
    image: 'tomato_egg',
  },
  {
    id: 'green_pepper_egg',
    title: '青椒炒鸡蛋',
    subtitle: '青椒的清香，裹进金黄蛋香',
    minutes: 15,
    equipment: '炒锅',
    allergens: ['鸡蛋', '大豆', '小麦'],
    ingredients: [
      { id: 'green_pepper', amount: 100, unit: '克' },
      { id: 'egg', amount: 2, unit: '个' },
      { id: 'oil', amount: 10, unit: '毫升' },
      { id: 'soy_sauce', amount: 5, unit: '毫升' },
    ],
    steps: [
      '不辣青椒洗净，去蒂去籽，切细小块。',
      '鸡蛋充分打散，将青椒拌入蛋液。接触生蛋后清洁双手和用具。',
      '中火温锅，加油铺开，倒入混合蛋液。',
      '待底部定形，用锅铲轻推、分块并翻面，让未凝固的蛋液接触锅面。',
      '煎炒至鸡蛋内外熟透、没有流动蛋液，青椒达到喜欢的软度。淋生抽拌匀，关火盛出。',
    ],
    source: 'https://www.chinasichuanfood.com/egg-and-pepper-stir-fry/',
    author: 'Elaine · China Sichuan Food',
    knowledge:
      '青椒炒蛋也有先把青椒拌入蛋液再煎炒的版本；这里呈现的是作者的一种做法，而非唯一正宗。',
    image: 'green_pepper_egg',
  },
  {
    id: 'tomato_egg_soup',
    title: '番茄蛋汤',
    subtitle: '一碗热汤，给这一餐收个尾',
    minutes: 15,
    equipment: '汤锅',
    allergens: ['鸡蛋'],
    ingredients: [
      { id: 'tomato', amount: 150, unit: '克' },
      { id: 'egg', amount: 1, unit: '个' },
      { id: 'water', amount: 300, unit: '毫升' },
      { id: 'oil', amount: 5, unit: '毫升' },
      { id: 'salt', amount: 1, unit: '克' },
    ],
    steps: [
      '番茄洗净去蒂切小块；鸡蛋充分打散。接触生蛋后清洁双手和用具。',
      '锅中加油，中火炒番茄至软、出汁。',
      '加 300 毫升水，煮开后调至持续微沸，加盐。',
      '将蛋液缓慢细流淋入汤中，先让蛋花凝固，再轻轻搅动。',
      '继续加热至蛋花完全熟透，关火盛出，小心热汤。',
    ],
    source: 'https://omnivorescookbook.com/tomato-egg-drop-soup/',
    author: 'Maggie Zhu · Omnivore’s Cookbook',
    knowledge: '缓慢淋入蛋液，稍等凝固再搅动，有助于形成较完整的蛋花。',
    image: 'tomato',
  },
];
export const safetyNote =
  '含鸡蛋；请核对调味品标签中的过敏原。接触生蛋后清洁双手和用具，含蛋食物须充分煮熟，勿试吃生蛋液。计时仅作提醒，不代表已经熟透。';
export const safetySource =
  'https://www.fda.gov/food/buy-store-serve-safe-food/what-you-need-know-about-egg-safety';
export function cookingSteps(recipe: Recipe, servings: number) {
  return recipe.steps.map((step) =>
    step.replace(
      /(\d+) 毫升/g,
      (_, amount: string) => String(Number(amount) * servings) + ' 毫升',
    ),
  );
}
