/** Presentation only: never use artwork aliases to normalize pantry or recipe data. */
export function pantryArtId(ingredientId: string, displayName: string): string {
  // The existing fish illustration depicts a boneless fillet. This is only an
  // artwork choice; fish_fillet remains a distinct stock and recipe identity.
  if (ingredientId === 'fish_fillet') return 'fish';
  // Photo imports may already be saved as "other". Resolve their artwork only,
  // without changing names, quantities or eligibility for a recipe.
  if (ingredientId === 'other') {
    const aliases: Record<string, string> = {
      鸡肉: 'whole_chicken',
      鸡翅: 'chicken_wings',
      鸡中翅: 'chicken_wings',
      鸡翅中: 'chicken_wings',
      可乐: 'cola',
      可口可乐: 'cola',
      普通可乐: 'cola',
      普通含糖可乐: 'cola',
      // The user explicitly chose cabbage art for lettuce; not a stock alias.
      生菜: 'chinese_cabbage',
    };
    return Object.hasOwn(aliases, displayName.trim())
      ? aliases[displayName.trim()]
      : ingredientId;
  }
  return ingredientId;
}
