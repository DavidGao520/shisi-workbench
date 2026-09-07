import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  recipes,
  safetyNote,
  detailedCookingSteps,
  cookingSteps,
} from '../lib/recipes';
import { legacyRecipes } from '../lib/legacy-recipes';
import {
  RecipeDetailSections,
  RecipeInstructions,
  RecipeSources,
} from '../components/recipe-instructions';

function instructionLists(html: string) {
  return [
    ...html.matchAll(/<ul class="recipe-step-instruction">([\s\S]*?)<\/ul>/g),
  ].map((match) => match[1]);
}

void test('all 456 preset operations use sentence bullets in both preview and live steps without changing recipe data', () => {
  let steps = 0;
  for (const recipe of recipes) {
    const before = structuredClone(recipe);
    const details = detailedCookingSteps(recipe, 2)!;
    const preview = renderToStaticMarkup(
      createElement(RecipeInstructions, { recipe, batches: 2 }),
    );
    const lists = instructionLists(preview);
    assert.equal(lists.length, details.length);
    details.forEach((step, index) => {
      const expected = (step.instruction.match(/[^。；;\r\n]+[。；;]*/gu) || [])
        .map((point) => point.trim())
        .filter(Boolean)
        .map((point) => renderToStaticMarkup(createElement('li', null, point)))
        .join('');
      assert.equal(lists[index], expected, recipe.id + ' step ' + index);
      const live = renderToStaticMarkup(
        createElement(RecipeInstructions, {
          recipe,
          batches: 2,
          stepIndex: index,
        }),
      );
      assert.deepEqual(instructionLists(live), [expected]);
      assert.ok(live.includes('start="' + (index + 1) + '"'));
      assert.ok(
        live.includes(
          renderToStaticMarkup(createElement('h3', null, step.title)),
        ),
      );
      assert.ok(live.includes(step.checkpoint));
      assert.ok(live.includes('约 ' + step.minutes + ' 分钟'));
      steps++;
    });
    assert.deepEqual(recipe, before);
  }
  assert.equal(steps, 456);
});

void test('bullets split Chinese sentences, semicolons and newlines without breaking decimals or rendering text as HTML', () => {
  const recipe = {
    ...recipes[0],
    workbuddyVersion: 'test-bullets',
    steps: [
      '  切成0.5厘米片。 加盐0.5克；搅拌;\r\n\n静置15分钟。；\n；\n<strong>关火</strong>  ',
    ],
  };
  const expected = [
    '切成0.5厘米片。',
    '加盐0.5克；',
    '搅拌;',
    '静置15分钟。；',
    '<strong>关火</strong>',
  ]
    .map((point) => renderToStaticMarkup(createElement('li', null, point)))
    .join('');
  for (const stepIndex of [undefined, 0]) {
    const html = renderToStaticMarkup(
      createElement(RecipeInstructions, { recipe, batches: 2, stepIndex }),
    );
    assert.deepEqual(instructionLists(html), [expected]);
    assert.doesNotMatch(html, /<li>\s*<\/li>|<strong>关火/);
    assert.ok(
      html.includes('加盐0.5克'),
      'WorkBuddy quantities are not scaled',
    );
  }
  const single = { ...recipe, steps: ['没有分隔符的一条操作'] };
  assert.deepEqual(
    instructionLists(
      renderToStaticMarkup(
        createElement(RecipeInstructions, { recipe: single }),
      ),
    ),
    ['<li>没有分隔符的一条操作</li>'],
  );
});

void test('bullet formatting happens after existing quantity scaling and also covers legacy steps', () => {
  const recipe = structuredClone(recipes[0]);
  recipe.detailSteps![0].instruction = '加盐0.5克；切成0.5厘米片。等待15分钟。';
  const html = renderToStaticMarkup(
    createElement(RecipeInstructions, { recipe, batches: 2, stepIndex: 0 }),
  );
  assert.deepEqual(instructionLists(html), [
    '<li>加盐1 克；</li><li>切成0.5厘米片。</li><li>等待15分钟。</li>',
  ]);
  for (const legacy of legacyRecipes) {
    const lists = instructionLists(
      renderToStaticMarkup(
        createElement(RecipeInstructions, { recipe: legacy, batches: 2 }),
      ),
    );
    assert.equal(lists.length, legacy.steps.length);
    cookingSteps(legacy, 2).forEach((step, index) => {
      const restored = lists[index].replace(/<\/?li>/g, '');
      assert.equal(restored, step.replace(/\s+/g, ' ').trim());
    });
  }
  const css = readFileSync(
    new URL('../components/recipe-instructions.css', import.meta.url),
    'utf8',
  );
  assert.match(
    css,
    /\.recipe-step-instruction\s*\{[^}]*list-style:\s*disc outside/,
  );
  assert.match(
    css,
    /\.recipe-step-instruction > li \+ li\s*\{[^}]*margin-top:/,
  );
});

void test('all 70 dish previews keep only cooking and references disclosures without a tips panel', () => {
  assert.equal(recipes.length, 70);
  for (const recipe of recipes) {
    const html = renderToStaticMarkup(
      createElement(RecipeDetailSections, { recipe, batches: 2 }),
    );
    const openings = [...html.matchAll(/<details\b[^>]*>/g)].map(
      (match) => match[0],
    );
    assert.equal(openings.length, 2);
    assert.ok(openings.every((tag) => !/\s(?:open|name)(?:=|\s|>)/.test(tag)));
    assert.match(html, /<summary><span>烹饪流程<\/span>/);
    assert.match(html, /<summary><span>参考文献<\/span>/);
    assert.ok(html.indexOf('烹饪流程') < html.indexOf('参考文献'));
    assert.ok(
      html.includes(
        renderToStaticMarkup(createElement(RecipeSources, { recipe })),
      ),
    );
    assert.ok(
      html.includes(
        renderToStaticMarkup(
          createElement(RecipeInstructions, { recipe, batches: 2 }),
        ),
      ),
    );
    assert.doesNotMatch(html, /温馨提示|recipe-disclosure--tips|safety-note/);
    assert.ok(!html.includes(safetyNote));
    assert.ok(!html.includes('预设家常做法 · 每步都有用料与计时'));
  }
});

void test('legacy and WorkBuddy methods also keep complete steps and warnings inside disclosures', () => {
  const generated = {
    ...recipes[0],
    workbuddyVersion: 'test-version',
    workbuddyWarnings: ['请核对本次生成的用量。'],
    detailSteps: undefined,
    steps: ['准备这次的食材。', '按核对后的做法完成。'],
  };
  for (const recipe of [...legacyRecipes, generated]) {
    const html = renderToStaticMarkup(
      createElement(RecipeDetailSections, { recipe }),
    );
    assert.ok(
      html.includes(
        renderToStaticMarkup(createElement(RecipeInstructions, { recipe })),
      ),
    );
    assert.ok(!/<details[^>]*\sopen(?:=|\s|>)/.test(html));
    assert.doesNotMatch(html, /温馨提示|recipe-disclosure--tips|safety-note/);
    for (const warning of recipe.workbuddyWarnings || [])
      assert.ok(html.includes(warning));
  }
});

void test('every live recipe step retains its instructions without repeated tips, and page timers remain available', () => {
  for (const recipe of [...recipes, ...legacyRecipes]) {
    for (let stepIndex = 0; stepIndex < recipe.steps.length; stepIndex++) {
      const html = renderToStaticMarkup(
        createElement(RecipeInstructions, { recipe, stepIndex }),
      );
      assert.doesNotMatch(html, /温馨提示|safety-note|安全提示来源/);
      assert.ok(!html.includes(safetyNote));
      assert.match(html, /recipe-step-instruction/);
      if (recipe.detailSteps) {
        assert.match(html, /recipe-step-time/);
        assert.match(html, /recipe-step-materials/);
        assert.match(html, /recipe-step-heat/);
        assert.match(html, /recipe-step-check/);
      }
    }
  }
  const page = readFileSync(
    new URL('../app/page.tsx', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(page, /safetyTips|safetyNote|safety-note|安全提示来源/);
  assert.match(page, /按本步 \{currentStep\.minutes\}/);
  assert.match(page, /Date\.now\(\) \+ currentStep\.minutes \* 60000/);
  assert.match(page, /checked=\{foodChecked\}/);
});

void test('shared detail modal resets disclosures per recipe version and keeps live steps and safety confirmation outside', () => {
  const page = readFileSync(
    new URL('../app/page.tsx', import.meta.url),
    'utf8',
  );
  assert.equal((page.match(/<RecipeDetailSections\b/g) || []).length, 1);
  assert.ok(
    page.includes(
      "key={`${recipe.id}:${recipe.workbuddyVersion || RECIPE_VERSION}:${detail?.sessionId || ''}`}",
    ),
  );
  assert.match(
    page,
    /<RecipeInstructions\s+recipe=\{sessionRecipe\(s, session\)\}\s+batches=\{session.servings\}\s+stepIndex=\{session.step\}/,
  );
  assert.ok(
    page.includes('我已核对食材、到期信息与过敏原，确认具备所需厨具。'),
  );
  assert.ok(!page.includes('预设家常做法 · 每步都有用料与计时'));
  assert.ok(!page.includes('调料、焯水和烹煮用水均列入用料'));
  assert.ok(!page.includes('<RecipeSources'));
  const css = readFileSync(
    new URL('../components/recipe-instructions.css', import.meta.url),
    'utf8',
  );
  assert.ok(css.includes('.recipe-disclosure > summary:focus-visible'));
  assert.ok(css.includes('.recipe-disclosure[open] > summary svg'));
});

void test('reference disclosure preserves links, attribution and adaptation for preset, legacy and generated recipes', () => {
  for (const recipe of [
    recipes[0],
    ...legacyRecipes,
    { ...recipes[0], workbuddyVersion: 'test' },
  ]) {
    const html = renderToStaticMarkup(createElement(RecipeSources, { recipe }));
    assert.match(
      html,
      /^<details class="recipe-disclosure recipe-disclosure--sources"><summary><span>参考文献<\/span>/,
    );
    assert.ok(
      html.indexOf('</summary>') < html.indexOf('culture-panel recipe-sources'),
    );
    assert.ok(
      html.includes(
        renderToStaticMarkup(createElement('p', null, recipe.knowledge)),
      ),
    );
    assert.ok(html.includes(recipe.source.replace(/&/g, '&amp;')));
    assert.ok(html.includes(recipe.author));
    assert.ok(html.includes('通用熟度依据：香港食物安全中心'));
    if (recipe.workbuddyVersion)
      assert.ok(html.includes('当前步骤由 WorkBuddy 生成'));
    assert.ok(!html.includes('与改编说明'));
  }
});

void test('Baiwei story removes only the requested helper paragraphs and retains attribution and cooking history', () => {
  const gallery = readFileSync(
    new URL('../components/baiwei-gallery.tsx', import.meta.url),
    'utf8',
  );
  assert.ok(!gallery.includes('包含传说与文学表达，尚未逐条作史实考证'));
  assert.ok(
    !gallery.includes('还没做过。确认完成制作后，照片、评分和食忆会留在这里。'),
  );
  assert.ok(gallery.includes('《中华食肆》游戏原作故事 · 国宴队'));
  assert.ok(gallery.includes('{selected.dish.story}'));
  assert.ok(gallery.includes('history={selected.history}'));
  assert.ok(gallery.includes('selected.history.length > 0 &&'));
});
