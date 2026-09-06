'use client';
import { useId } from 'react';
import { Star } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ratingDimensions, type MealRatings } from '@/lib/meal-ratings';

export function MealRatingInput({
  value,
  onChange,
  disabled = false,
}: {
  value: MealRatings;
  onChange: (ratings: MealRatings) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <fieldset className="meal-ratings" disabled={disabled}>
      <legend>我的评分（每项必填）</legend>
      {ratingDimensions.map(({ key, label, hint }) => (
        <div className="meal-rating-dimension" key={key}>
          <div className="meal-rating-heading">
            <span id={`${id}-${key}-label`}>{label}</span>
            <small id={`${id}-${key}-hint`}>{hint}</small>
          </div>
          <div className="meal-rating-line">
            <RadioGroup
              className="meal-rating-options"
              value={value[key] ? String(value[key]) : ''}
              onValueChange={(score) =>
                onChange({ ...value, [key]: Number(score) })
              }
              aria-labelledby={`${id}-${key}-label`}
              aria-describedby={`${id}-${key}-hint`}
              aria-required="true"
              disabled={disabled}
            >
              {[1, 2, 3, 4, 5].map((score) => (
                <span className="meal-rating-choice" key={score}>
                  <RadioGroupItem
                    className="meal-rating-input"
                    value={String(score)}
                    aria-label={`${label} ${score} 星`}
                  />
                  <Star
                    className="meal-rating-star"
                    size={28}
                    fill={score <= value[key] ? '#bc8435' : 'none'}
                    color="#bc8435"
                    aria-hidden="true"
                  />
                </span>
              ))}
            </RadioGroup>
            <span className="meal-rating-value" aria-live="polite">
              {value[key] ? `${value[key]} / 5` : '未评分'}
            </span>
          </div>
        </div>
      ))}
    </fieldset>
  );
}
