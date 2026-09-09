import { Check } from 'lucide-react';
import { ingredientName, type Recipe } from '../lib/recipes';
import { type mealIngredients, type MealOnlyIngredient } from '../lib/kitchen';

export function MealIngredients({
  recipe,
  rows,
  onToggle,
  disabled = false,
  history,
}: {
  recipe: Recipe;
  rows: ReturnType<typeof mealIngredients>;
  onToggle?: (id: string, token: string) => void;
  disabled?: boolean;
  history?: MealOnlyIngredient[];
}) {
  return (
    <div className="ingredient-list">
      {rows.map((i) => {
        const temporary = history?.find((p) => p.ingredientId === i.id);
        return (
          <div key={i.id}>
            <span>
              {ingredientName(recipe, i.id)}
              {i.note && <small>{i.note}</small>}
            </span>
            <strong title="参考用量，不要求库存精确到克或毫升">
              {i.need} {i.unit}
            </strong>
            <div className="meal-ingredient-status">
              {!onToggle ? (
                <small>
                  {temporary
                    ? `本餐临时备齐 ${temporary.amount} ${temporary.unit}`
                    : '本餐用料'}
                </small>
              ) : i.present ? (
                <span className="meal-owned">
                  <Check size={16} aria-hidden="true" />
                  已拥有
                </span>
              ) : (
                <>
                  <button
                    type="button"
                    className={`meal-ownership ${i.confirmed ? 'is-owned' : 'needs-confirmation'}`}
                    aria-pressed={i.confirmed}
                    aria-label={`${ingredientName(recipe, i.id)}：${i.confirmed ? '已拥有，点击取消本餐确认' : '确认拥有'}`}
                    disabled={disabled}
                    onClick={() => onToggle(i.id, i.token)}
                  >
                    {i.confirmed && <Check size={16} aria-hidden="true" />}
                    {i.confirmed ? '已拥有' : '确认拥有'}
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
