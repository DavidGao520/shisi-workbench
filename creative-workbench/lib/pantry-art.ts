/** Presentation only: never use artwork aliases to normalize pantry or recipe data. */
export function pantryArtId(ingredientId: string, displayName: string): string {
  // The existing fish illustration depicts a boneless fillet. This is only an
  // artwork choice; fish_fillet remains a distinct stock and recipe identity.
  if (ingredientId === 'fish_fillet') return 'fish';
  if (ingredientId === 'other' && displayName.trim() === '鸡肉')
    return 'whole_chicken';
  return ingredientId;
}
