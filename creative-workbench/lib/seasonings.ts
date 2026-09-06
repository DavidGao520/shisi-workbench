import { baiweiPantryById } from './pantry-catalog';

export const PRESENT_QUANTITY = '有，数量待确认';

function baiweiSeasoning(id: string) {
  const item = baiweiPantryById[id];
  if (!item || item.kind !== 'seasoning')
    throw new Error('未知百味图调料：' + id);
  return { id: item.id, name: item.name };
}

export const seasoningGroups = [
  {
    id: 'everyday',
    label: '常用调料',
    items: [
      { id: 'oil', name: '食用油' },
      baiweiSeasoning('salt'),
      baiweiSeasoning('sugar'),
      baiweiSeasoning('vinegar'),
      baiweiSeasoning('soy_sauce'),
      baiweiSeasoning('dark_soy_sauce'),
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
      baiweiSeasoning('chili_oil'),
      baiweiSeasoning('doubanjiang'),
      { id: 'sesame_paste', name: '芝麻酱' },
      { id: 'ketchup', name: '番茄酱' },
    ],
  },
  {
    id: 'aromatics',
    label: '鲜香配料',
    items: [
      baiweiSeasoning('garlic'),
      baiweiSeasoning('ginger'),
      baiweiSeasoning('spring_onion'),
      baiweiSeasoning('cilantro'),
    ],
  },
  {
    id: 'spices',
    label: '香料与调味粉',
    items: [
      baiweiSeasoning('sichuan_pepper'),
      baiweiSeasoning('chili'),
      { id: 'dried_chili', name: '干辣椒' },
      { id: 'chili_powder', name: '辣椒粉' },
      baiweiSeasoning('cumin'),
      { id: 'cumin_powder', name: '孜然粉' },
      { id: 'white_pepper', name: '白胡椒粉' },
      { id: 'black_pepper', name: '黑胡椒粉' },
      { id: 'five_spice', name: '五香粉' },
      baiweiSeasoning('star_anise'),
      baiweiSeasoning('bay_leaf'),
      { id: 'rosemary', name: '迷迭香' },
    ],
  },
];

export const seasonings = seasoningGroups.flatMap((group) => [...group.items]);
export const seasoningNames: Record<string, string> = Object.fromEntries(
  seasonings.map((item) => [item.id, item.name]),
);
export const isSeasoning = (id: string) => Object.hasOwn(seasoningNames, id);
