import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { recipes } from '../lib/recipes';

// Render the actual timer JSX so a second input or an empty timer row cannot
// reappear unnoticed. The session fixture stays in memory, never in user storage.
const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const start = page.indexOf('{currentStep &&');
const end = page.indexOf('<div className="step-actions">', start);
assert.ok(start >= 0 && end > start, 'locate the cooking timer controls');
const timerCode = ts.transpileModule(
  `function renderTimer() { return <>${page.slice(start, end)}</>; }`,
  {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  },
).outputText;
const now = 1800000000000;
type TimerSession = {
  id: string;
  step: number;
  status: 'cooking' | 'paused';
  timerEnd?: number;
  timerRemaining?: number;
};
type ButtonProps = {
  children?: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
};
function buttons(node: React.ReactNode): React.ReactElement<ButtonProps>[] {
  return React.Children.toArray(node).flatMap((child) => {
    if (!React.isValidElement<ButtonProps>(child)) return [];
    return child.type === 'button' ? [child] : buttons(child.props.children);
  });
}
function renderTimer(
  minutes: number | undefined,
  session: TimerSession,
  busy = false,
  active = session,
) {
  const node: React.ReactElement = runInNewContext(
    `${timerCode}; renderTimer()`,
    {
      React,
      Clock3: () => null,
      currentStep: minutes === undefined ? undefined : { minutes },
      session,
      busy,
      now,
      Date: { now: () => now },
      activeSession: () => active,
      mutate: (change: (state: object) => void) => change({}),
    },
  );
  return { html: renderToStaticMarkup(node), controls: buttons(node) };
}
const freshSession = (): TimerSession => ({
  id: 'meal',
  step: 2,
  status: 'cooking',
});

void test('all preset steps expose only their own duration timer, without custom minutes', () => {
  assert.equal(recipes.length, 70);
  for (const recipe of recipes) {
    for (const step of recipe.detailSteps || []) {
      const { html, controls } = renderTimer(step.minutes, freshSession());
      assert.equal(controls.length, 1, `${recipe.id}/${step.title}`);
      assert.ok(html.includes(`按本步 ${step.minutes} 分钟计时`));
      assert.doesNotMatch(html, /<input|分钟后提醒|开始计时|class="timer"/);
    }
  }
  assert.doesNotMatch(page, /timerMinutes|setTimerMinutes|提醒分钟数/);
  assert.equal(renderTimer(undefined, freshSession()).html, '');
  assert.equal(
    renderTimer(undefined, { ...freshSession(), timerRemaining: 0 }).html,
    '',
  );
});

void test('the step button starts exactly its duration and an existing timer replaces it', () => {
  for (const minutes of [2, 15, 30]) {
    const session = freshSession();
    renderTimer(minutes, session).controls[0].props.onClick!();
    assert.equal(session.timerEnd, now + minutes * 60000);
    const running = renderTimer(minutes, session);
    assert.match(running.html, /class="timer"/);
    assert.ok(running.html.includes(`${minutes} 分钟`));
    assert.doesNotMatch(running.html, /按本步|<input/);
    assert.equal(running.controls.length, 1);
    running.controls[0].props.onClick!();
    assert.equal(session.timerEnd, undefined);
    assert.equal(session.timerRemaining, undefined);
    assert.match(renderTimer(minutes, session).html, /按本步/);
  }
});

void test('paused and legacy saved timers remain visible and cancellable without detailed steps', () => {
  for (const session of [
    { ...freshSession(), timerEnd: now + 15 * 60000 },
    {
      ...freshSession(),
      status: 'paused' as const,
      timerRemaining: 15 * 60000,
    },
    { ...freshSession(), timerEnd: now - 1000 },
  ]) {
    const { html, controls } = renderTimer(undefined, session);
    assert.match(html, /class="timer"/);
    assert.doesNotMatch(html, /按本步|<input/);
    if (session.timerEnd && session.timerEnd < now)
      assert.match(html, /时间到了/);
    controls[0].props.onClick!();
    assert.equal(renderTimer(undefined, session).html, '');
  }
});

void test('preset timers retain pause, busy and stale session guards', () => {
  assert.equal(
    renderTimer(15, freshSession(), true).controls[0].props.disabled,
    true,
  );
  const paused = { ...freshSession(), status: 'paused' as const };
  assert.equal(renderTimer(15, paused).controls[0].props.disabled, true);
  for (const active of [
    paused,
    { ...freshSession(), step: 3 },
    { ...freshSession(), id: 'other-meal' },
  ]) {
    renderTimer(15, freshSession(), false, active).controls[0].props.onClick!();
    assert.equal(active.timerEnd, undefined);
  }
});
