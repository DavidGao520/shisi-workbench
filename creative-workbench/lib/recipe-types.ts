export type RecipeSource = {
  title: string;
  url: string;
  author: string;
  site: string;
  language: 'zh';
  accessedAt: string;
  supports: string;
};
export type RecipeIngredient = {
  id: string;
  amount: number;
  unit: string;
  name?: string;
  kind?: 'food' | 'seasoning';
  note?: string;
};
export type DetailedStep = {
  title: string;
  minutes: number;
  heat: string;
  uses: { id: string; amount: number; unit: string }[];
  instruction: string;
  checkpoint: string;
};
export type HomeRecipe = {
  id: string;
  title: string;
  baseServings: number;
  yield: string;
  equipment: string;
  allergens: string[];
  ingredients: (RecipeIngredient & {
    name: string;
    kind: 'food' | 'seasoning';
  })[];
  steps: DetailedStep[];
  sources: RecipeSource[];
  adaptation: string;
  safetyTips: string[];
};
export type Recipe = {
  id: string;
  title: string;
  subtitle: string;
  minutes: number;
  equipment: string;
  allergens: string[];
  ingredients: RecipeIngredient[];
  // String steps remain the state-machine contract for older snapshots / WorkBuddy.
  steps: string[];
  detailSteps?: DetailedStep[];
  baseServings?: number;
  yield?: string;
  sources?: RecipeSource[];
  safetyTips?: string[];
  source: string;
  author: string;
  knowledge: string;
  image: string;
  workbuddyVersion?: string;
  workbuddyWarnings?: string[];
};
