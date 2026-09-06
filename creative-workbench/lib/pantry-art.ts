/** Presentation only: never use artwork aliases to normalize pantry or recipe data. */
export function pantryArtId(ingredientId: string, displayName: string): string {
  if (ingredientId === 'other' && displayName.trim() === '鸡肉')
    return 'whole_chicken';
  return ingredientId;
}
