import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { recipes, type Recipe } from '../lib/recipes';

const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const css = readFileSync(
  new URL('../app/globals.css', import.meta.url),
  'utf8',
);
const start = page.indexOf('<div className="cooking-art cooking-art--active">');
const end = page.indexOf('</div>', start) + '</div>'.length;
assert.ok(start >= 0 && end > start, 'locate the actual active dish caption');
const code = ts.transpileModule(`(${page.slice(start, end)})`, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;

void test('all cooking dish captions show only art, title and the current session source link', () => {
  for (const dataset of ['demo', 'real']) {
    for (const status of ['cooking', 'paused']) {
      for (const recipe of [
        ...recipes,
        { ...recipes[0], id: 'custom', title: '自定义的很长菜名'.repeat(6) },
      ]) {
        const session = { id: 'saved-meal', servings: 2, status };
        const s = { dataset };
        let opened: unknown[] = [];
        const node: React.ReactElement<{ children: React.ReactElement[] }> =
          runInNewContext(code, {
            React,
            s,
            session,
            dataset,
            RecipeArt: ({ recipe }: { recipe: Recipe }) =>
              React.createElement('span', { 'data-recipe-art': recipe.id }),
            sessionRecipe: (state: unknown, active: unknown) => {
              assert.equal(state, s);
              assert.equal(active, session);
              return recipe;
            },
            openRecipe: (...args: unknown[]) => {
              opened = args;
            },
          });
        const children = React.Children.toArray(node.props.children).filter(
          React.isValidElement,
        );
        assert.equal(children.length, 3, 'no extra label, paragraph or spacer');
        assert.equal(children[1].type, 'h2');
        const button = children[2] as React.ReactElement<{
          onClick: () => void;
        }>;
        assert.equal(button.type, 'button');
        const html = renderToStaticMarkup(node);
        assert.ok(html.includes(`<h2>${recipe.title}</h2>`));
        assert.match(html, /查看食材与来源/);
        assert.doesNotMatch(
          html,
          /eyebrow|体验演练|无需真的开火|已确认的一餐|人份/,
        );
        button.props.onClick();
        assert.deepEqual(opened, [recipe, session.id]);
      }
    }
  }
});

void test('caption alignment is scoped to active cooking and overrides the mobile two-column layout', () => {
  assert.equal(page.match(/cooking-art--active/g)?.length, 1);
  assert.match(
    page,
    /<div className="cooking-art">\s*<RecipeArt recipe=\{tourRecipe\}/,
  );
  const active =
    css.match(/\.cooking-art\.cooking-art--active\s*\{([^}]+)\}/)?.[1] ?? '';
  assert.match(active, /display:\s*block;/);
  assert.match(active, /text-align:\s*center;/);
  assert.match(active, /min-width:\s*0;/);
  assert.match(active, /overflow-wrap:\s*anywhere;/);
  assert.match(
    css,
    /\.cooking-art\.cooking-art--active > \.baiwei-art,\s*\.cooking-art\.cooking-art--active > img\s*\{\s*margin:\s*0 auto 12px;/,
  );
  assert.match(
    css,
    /\.cooking-art--active > \.text-button\s*\{[^}]*justify-content:\s*center;[^}]*text-align:\s*center;/,
  );
  assert.match(
    page,
    /<h3>需要的食材 · \{recipePeople\(recipe, detailServings\)\} 人份<\/h3>/,
  );
});
