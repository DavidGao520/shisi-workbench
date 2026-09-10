import photos from './demo-meal-photos.json';
import type { KitchenState, Session } from './kitchen';
import { recipes, RECIPE_VERSION } from './recipes';

// Genuine photos and first-person memories supplied by 高源 on 2026-09-10.
// No ratings, ingredient consumption, or in-app cooking progress were supplied.
const entries = [
  {
    id: 'twice_cooked_pork',
    memory: '回锅肉那真的是香啊，太香了，这一道菜我就可以吃两碗饭。',
    captured: '2026-09-09T12:01:07+08:00',
  },
  {
    id: 'spicy_chicken',
    memory: '那辣子鸡呀，真的是四川人的最爱。',
    captured: '2026-09-08T12:16:54+08:00',
  },
  {
    id: 'green_pepper_eggplant',
    memory: '这是我做的最好吃的素菜。',
    captured: '2026-09-08T12:17:41+08:00',
  },
  {
    id: 'sweet_sour_ribs',
    memory: '奶奶做的味道。',
    captured: '2026-09-10T12:25:32+08:00',
  },
  {
    id: 'green_pepper_pork',
    memory: '下饭之王。',
    captured: '2026-09-08T12:17:21+08:00',
  },
  { id: 'cola_chicken_wings', memory: '从小到大最爱吃的', captured: undefined },
] as const;

export const authoredMealRecipeIds: readonly string[] = entries.map(
  (entry) => entry.id,
);

/** Append once to the sample dataset only. Never rewrite a user's existing record. */
export function appendAuthoredMeals(state: KitchenState) {
  if (state.dataset !== 'demo')
    throw new Error('作者展示记录只能加入样例厨房。');
  for (const entry of entries) {
    const id = 'demo-authored-v1-' + entry.id;
    if (state.sessions.some((session) => session.id === id)) continue;
    const recipe = recipes.find((item) => item.id === entry.id);
    if (!recipe) throw new Error('实做展示菜谱缺失：' + entry.id);
    const addedAt = '2026-09-10';
    const session: Session = {
      id,
      recipeId: entry.id,
      recipeVersion: RECIPE_VERSION,
      // Snapshot is a reference recipe, explicitly not evidence of steps followed.
      recipeSnapshot: structuredClone(recipe),
      servings: 1,
      status: 'completed',
      step: 0,
      createdAt: addedAt,
      completedAt: addedAt,
      authoredRecord: {
        author: '高源',
        addedAt,
        ...(entry.captured ? { photoCapturedAt: entry.captured } : {}),
      },
      familyMemory: entry.memory,
      photo: photos[entry.id],
      inventorySnapshot: [],
    };
    state.sessions.push(session);
  }
}
