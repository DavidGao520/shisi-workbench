import { ChevronDown } from 'lucide-react';
import {
  cookingSteps,
  detailedCookingSteps,
  ingredientName,
  safetyNote,
  safetySource,
  type Recipe,
} from '../lib/recipes';

/** Details previews are collapsible; the live cooking step stays directly visible. */
export function RecipeDetailSections({
  recipe,
  batches = 1,
}: {
  recipe: Recipe;
  batches?: number;
}) {
  return (
    <>
      <details className="recipe-disclosure recipe-disclosure--steps">
        <summary>
          <span>烹饪流程</span>
          <ChevronDown size={20} aria-hidden="true" />
        </summary>
        <div className="recipe-disclosure__content">
          {recipe.workbuddyWarnings?.map((warning, index) => (
            <p className="warning-text" key={index}>
              {warning}
            </p>
          ))}
          <RecipeInstructions recipe={recipe} batches={batches} />
        </div>
      </details>
      <details className="recipe-disclosure recipe-disclosure--tips">
        <summary>
          <span>温馨提示</span>
          <ChevronDown size={20} aria-hidden="true" />
        </summary>
        <div className="recipe-disclosure__content">
          {recipe.safetyTips?.map((tip) => (
            <p className="safety-note" key={tip}>
              {tip}
            </p>
          ))}
          <p className="safety-note">{safetyNote}</p>
        </div>
      </details>
      <RecipeSources recipe={recipe} />
    </>
  );
}

export function RecipeInstructions({
  recipe,
  batches = 1,
  stepIndex,
}: {
  recipe: Recipe;
  batches?: number;
  stepIndex?: number;
}) {
  const details = detailedCookingSteps(recipe, batches);
  const plain = cookingSteps(recipe, batches);
  const indexes =
    stepIndex === undefined ? plain.map((_, index) => index) : [stepIndex];
  return (
    <ol
      className="instructions recipe-instructions"
      start={(stepIndex ?? 0) + 1}
    >
      {indexes.map((index) => {
        const step = details?.[index];
        return (
          <li key={index}>
            {step ? (
              <>
                <div className="recipe-step-heading">
                  <h3>{step.title}</h3>
                  <span className="recipe-step-time">
                    约 {step.minutes} 分钟
                  </span>
                </div>
                <p className="recipe-step-heat">{step.heat}</p>
                <div className="recipe-step-materials">
                  <strong>本步用料</strong>
                  {step.uses.length ? (
                    <ul>
                      {step.uses.map((item, itemIndex) => (
                        <li key={itemIndex}>
                          {ingredientName(recipe, item.id)}{' '}
                          <b>
                            {item.amount} {item.unit}
                          </b>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span>沿用已处理食材，无新增用料</span>
                  )}
                </div>
                <p className="recipe-step-instruction">{step.instruction}</p>
                <p className="recipe-step-check">
                  <strong>做到这样：</strong>
                  {step.checkpoint}
                </p>
              </>
            ) : (
              <p className="recipe-step-instruction">{plain[index]}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function RecipeSources({ recipe }: { recipe: Recipe }) {
  return (
    <details className="recipe-disclosure recipe-disclosure--sources">
      <summary>
        <span>参考文献</span>
        <ChevronDown size={20} aria-hidden="true" />
      </summary>
      <div className="recipe-disclosure__content">
        <section className="culture-panel recipe-sources">
          <p>{recipe.knowledge}</p>
          {recipe.sources?.length ? (
            <ul>
              {recipe.sources.map((source) => (
                <li key={source.url}>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.title} ↗
                  </a>
                  <small>
                    {source.author} · {source.site} · 中文 · 核对于{' '}
                    {source.accessedAt}
                  </small>
                  <p>{source.supports}</p>
                </li>
              ))}
            </ul>
          ) : (
            <a href={recipe.source} target="_blank" rel="noreferrer">
              {recipe.author} ↗
            </a>
          )}
          <small>
            {recipe.workbuddyVersion
              ? '当前步骤由 WorkBuddy 生成；上述链接是基础配方参考，并非生成内容的逐项验证。'
              : '食材用量与步骤为家庭改编；每步分钟数是操作估时，含等待时间，不代表原作者精确计时或本平台已实做审校。'}
          </small>
          <a
            className="recipe-safety-source"
            href={safetySource}
            target="_blank"
            rel="noreferrer"
          >
            通用熟度依据：香港食物安全中心《烹煮及翻热》 ↗
          </a>
        </section>
      </div>
    </details>
  );
}
