export type MealRatings = {
  taste: number;
  difficulty: number;
  appearance: number;
};

export const ratingDimensions = [
  { key: 'taste', label: '好吃程度', hint: '1 星不太满意，5 星非常好吃' },
  { key: 'difficulty', label: '制作难度', hint: '1 星简单，5 星困难' },
  { key: 'appearance', label: '卖相程度', hint: '1 星有待改进，5 星非常漂亮' },
] as const;

const validScore = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 1 &&
  value <= 5;

export function hasCompleteMealRatings(value: unknown): value is MealRatings {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    ratingDimensions.every(({ key }) => validScore((value as MealRatings)[key]))
  );
}

export function validateMealRatings(value: unknown): MealRatings {
  if (!hasCompleteMealRatings(value))
    throw new Error('请分别为好吃程度、制作难度和卖相程度选择 1–5 星。');
  return {
    taste: value.taste,
    difficulty: value.difficulty,
    appearance: value.appearance,
  };
}

/** Drafts may be incomplete. An old single score is not a taste/difficulty score. */
export function mealRatingsDraft(value?: Partial<MealRatings>): MealRatings {
  return {
    taste: validScore(value?.taste) ? value.taste : 0,
    difficulty: validScore(value?.difficulty) ? value.difficulty : 0,
    appearance: validScore(value?.appearance) ? value.appearance : 0,
  };
}

export function mealRatingSummary(record: {
  ratings?: MealRatings;
  userRating?: number;
}): string {
  if (hasCompleteMealRatings(record.ratings)) {
    const ratings = record.ratings;
    return ratingDimensions
      .map(
        ({ key, label }) =>
          `${label} ${ratings[key]} / 5${key === 'difficulty' ? '（越高越难）' : ''}`,
      )
      .join(' · ');
  }
  return validScore(record.userRating)
    ? `旧版评分：${record.userRating} / 5`
    : '未评分';
}
