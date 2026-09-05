export const PRESENT_QUANTITY = '有，数量待确认';

export const seasoningGroups = [
  {
    id: 'everyday',
    label: '常用调料',
    items: [
      { id: 'oil', name: '食用油' },
      { id: 'salt', name: '盐' },
      { id: 'sugar', name: '白糖' },
      { id: 'vinegar', name: '醋' },
      { id: 'soy_sauce', name: '生抽' },
      { id: 'dark_soy_sauce', name: '老抽' },
      { id: 'cooking_wine', name: '料酒' },
      { id: 'starch', name: '淀粉' },
    ],
  },
  {
    id: 'sauces',
    label: '酱料与风味油',
    items: [
      { id: 'oyster_sauce', name: '蚝油' },
      { id: 'sesame_oil', name: '香油' },
      { id: 'chili_oil', name: '辣椒油' },
      { id: 'doubanjiang', name: '豆瓣酱' },
      { id: 'sesame_paste', name: '芝麻酱' },
      { id: 'ketchup', name: '番茄酱' },
    ],
  },
  {
    id: 'spices',
    label: '香料与调味粉',
    items: [
      { id: 'sichuan_pepper', name: '花椒' },
      { id: 'dried_chili', name: '干辣椒' },
      { id: 'chili_powder', name: '辣椒粉' },
      { id: 'cumin_powder', name: '孜然粉' },
      { id: 'white_pepper', name: '白胡椒粉' },
      { id: 'black_pepper', name: '黑胡椒粉' },
      { id: 'five_spice', name: '五香粉' },
      { id: 'star_anise', name: '八角' },
      { id: 'bay_leaf', name: '香叶' },
      { id: 'rosemary', name: '迷迭香' },
    ],
  },
] as const;

export const seasonings = seasoningGroups.flatMap((group) => [...group.items]);
export const seasoningNames: Record<string, string> = Object.fromEntries(
  seasonings.map((item) => [item.id, item.name]),
);
export const isSeasoning = (id: string) => Object.hasOwn(seasoningNames, id);
