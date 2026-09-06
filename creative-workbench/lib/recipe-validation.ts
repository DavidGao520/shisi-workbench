import type { HomeRecipe } from './recipe-types';

/** Build/test-time content audit. Deliberately not a claim that a dish was cooked. */
export function validateHomeRecipes(
  entries: HomeRecipe[],
  expectedIds: string[],
) {
  const errors: string[] = [];
  const ids = new Set<string>();
  const allowedUnits = new Set(['克', '毫升', '个', '份']);
  for (const recipe of entries) {
    const check = (ok: unknown, message: string) => {
      if (!ok) errors.push(`${recipe.id}: ${message}`);
    };
    check(!ids.has(recipe.id), 'duplicate dish');
    ids.add(recipe.id);
    check(expectedIds.includes(recipe.id), 'not in game catalog');
    check(
      recipe.title && recipe.yield && recipe.equipment && recipe.adaptation,
      'missing description',
    );
    check(
      Number.isInteger(recipe.baseServings) &&
        recipe.baseServings > 0 &&
        recipe.baseServings <= 12,
      'invalid base servings',
    );
    check(
      recipe.ingredients.length > 0 && recipe.ingredients.length <= 30,
      'invalid ingredient count',
    );
    const ingredients = new Map(
      recipe.ingredients.map((item) => [item.id, item]),
    );
    check(
      ingredients.size === recipe.ingredients.length,
      'duplicate ingredient',
    );
    for (const item of recipe.ingredients) {
      check(
        /^[a-z][a-z0-9_]*$/.test(item.id) && !!item.name,
        `invalid ingredient ${item.id}`,
      );
      check(
        Number.isFinite(item.amount) &&
          item.amount > 0 &&
          item.amount <= 1000000 &&
          allowedUnits.has(item.unit),
        `invalid quantity ${item.id}`,
      );
      check(
        item.kind === 'food' || item.kind === 'seasoning',
        `invalid ingredient kind ${item.id}`,
      );
    }
    check(
      recipe.steps.length >= 4 && recipe.steps.length <= 20,
      'must have 4–20 detailed steps',
    );
    const used = new Set<string>();
    for (const [index, step] of recipe.steps.entries()) {
      check(
        step.title &&
          step.heat &&
          step.instruction.length >= 20 &&
          step.checkpoint.length >= 6,
        `step ${index + 1} incomplete`,
      );
      check(
        Number.isFinite(step.minutes) &&
          step.minutes > 0 &&
          step.minutes <= 1440,
        `step ${index + 1} invalid duration`,
      );
      check(
        !/适量|適量/.test(step.instruction),
        `step ${index + 1} contains unmeasured addition`,
      );
      for (const item of step.uses) {
        const ingredient = ingredients.get(item.id);
        check(ingredient, `step ${index + 1} undeclared ${item.id}`);
        check(
          Number.isFinite(item.amount) &&
            item.amount > 0 &&
            ingredient &&
            item.unit === ingredient.unit &&
            item.amount <= ingredient.amount,
          `step ${index + 1} invalid portion ${item.id}`,
        );
        used.add(item.id);
      }
    }
    for (const id of ingredients.keys())
      check(used.has(id), `ingredient never used: ${id}`);
    check(recipe.sources.length > 0, 'missing Chinese source');
    for (const source of recipe.sources) {
      let url: URL | undefined;
      try {
        url = new URL(source.url);
      } catch {
        /* reported below */
      }
      check(
        url?.protocol === 'https:' &&
          url.pathname !== '/' &&
          !/search/.test(url.pathname),
        'source must be direct HTTPS recipe page',
      );
      check(
        source.language === 'zh' &&
          source.accessedAt === '2026-09-06' &&
          source.title &&
          source.author &&
          source.site &&
          source.supports,
        'missing source attribution',
      );
    }
    check(recipe.safetyTips.length > 0, 'missing relevant caution');
  }
  for (const id of expectedIds)
    if (!ids.has(id)) errors.push(`${id}: missing recipe`);
  return errors;
}
