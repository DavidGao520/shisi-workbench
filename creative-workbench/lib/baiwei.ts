import catalog from './baiwei-dishes.json';
import workbenchDishes from './workbench-dishes.json';
import { recipes, storedRecipe } from './recipes';
import type { KitchenState, Session } from './kitchen';

export type BaiweiDish = {
  id: string;
  name: string;
  description: string;
  story: string;
  selfContained: boolean;
  soup: boolean;
  rect: { left: string; top: string; width: string; height: string };
  imageFile: string;
  imageGitSha: string;
  origin?: string;
  assetKind?: string;
};

// Catalog assets are public knowledge; completion belongs exclusively to this kitchen.
// Do not turn game ingredients / prices into real recipes or seed user sessions.
export const baiweiDishes: BaiweiDish[] = [...catalog, ...workbenchDishes];

export function completedHistory(state: KitchenState, recipeId: string) {
  return state.sessions
    .filter(
      (session) =>
        session.recipeId === recipeId && session.status === 'completed',
    )
    .sort(
      (a, b) =>
        (state.dataset === 'demo'
          ? Number(!!b.authoredRecord) - Number(!!a.authoredRecord)
          : 0) ||
        (b.completedAt || b.createdAt).localeCompare(
          a.completedAt || a.createdAt,
        ) ||
        b.id.localeCompare(a.id),
    );
}

export function baiweiCollection(state: KitchenState) {
  const entries = baiweiDishes.map((dish) => ({
    dish,
    history: completedHistory(state, dish.id),
    recipe: recipes.find((recipe) => recipe.id === dish.id),
  }));
  // Surface the author's genuine examples first, without reordering a real kitchen.
  return state.dataset === 'demo'
    ? entries.sort(
        (a, b) =>
          Number(!!b.history[0]?.authoredRecord) -
          Number(!!a.history[0]?.authoredRecord),
      )
    : entries;
}

// Older personal dishes outside the catalog must not vanish or inflate its progress.
export function otherBaiweiRecords(state: KitchenState) {
  const catalogIds = new Set(baiweiDishes.map((dish) => dish.id));
  const ids = [
    ...new Set(
      state.sessions
        .filter(
          (session) =>
            session.status === 'completed' && !catalogIds.has(session.recipeId),
        )
        .map((session) => session.recipeId),
    ),
  ];
  return ids.map((id) => {
    const history = completedHistory(state, id);
    return {
      id,
      title: savedRecipe(history[0])?.title || '我的家常菜',
      history,
    };
  });
}

export function savedRecipe(session: Session) {
  return storedRecipe(session);
}
