import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { recipes, safetyNote } from '../lib/recipes';
import { legacyRecipes } from '../lib/legacy-recipes';
import {
  RecipeDetailSections,
  RecipeInstructions,
  RecipeSources,
} from '../components/recipe-instructions';

void test('all 70 dish previews have three independently collapsed native disclosures with all original content', () => {
  assert.equal(recipes.length, 70);
  for (const recipe of recipes) {
    const html = renderToStaticMarkup(
      createElement(RecipeDetailSections, { recipe, batches: 2 }),
    );
    const openings = [...html.matchAll(/<details\b[^>]*>/g)].map(
      (match) => match[0],
    );
    assert.equal(openings.length, 3);
    assert.ok(openings.every((tag) => !/\s(?:open|name)(?:=|\s|>)/.test(tag)));
    assert.match(html, /<summary><span>烹饪流程<\/span>/);
    assert.match(html, /<summary><span>温馨提示<\/span>/);
    assert.match(html, /<summary><span>参考文献<\/span>/);
    assert.ok(html.indexOf('温馨提示') < html.indexOf('参考文献'));
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
    for (const tip of [...(recipe.safetyTips || []), safetyNote])
      assert.ok(
        html.includes(
          renderToStaticMarkup(
            createElement('p', { className: 'safety-note' }, tip),
          ),
        ),
      );
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
    for (const warning of recipe.workbuddyWarnings || [])
      assert.ok(html.includes(warning));
  }
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
