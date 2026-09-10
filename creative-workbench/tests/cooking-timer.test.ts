import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { recipes } from '../lib/recipes';
import { formatCountdown } from '../lib/cooking-timer';

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
const pauseStart = page.lastIndexOf(
  '<button',
  page.indexOf("if (v.status === 'paused')"),
);
const pauseEnd = page.indexOf('</button>', pauseStart) + '</button>'.length;
assert.ok(
  pauseStart >= 0 && pauseEnd > pauseStart,
  'locate the pause/resume control',
);
const pauseCode = ts.transpileModule(
  `function renderTimer() { return (${page.slice(pauseStart, pauseEnd)}); }`,
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
  clock = { rendered: now, actual: now },
  showPauseControl = false,
) {
  let updatedNow = clock.rendered;
  const node: React.ReactElement = runInNewContext(
    `${showPauseControl ? pauseCode : timerCode}; renderTimer()`,
    {
      React,
      Clock3: () => null,
      Play: () => null,
      Pause: () => null,
      currentStep: minutes === undefined ? undefined : { minutes },
      session,
      busy,
      now: clock.rendered,
      Date: { now: () => clock.actual },
      setNow: (value: number) => {
        updatedNow = value;
      },
      formatCountdown,
      activeSession: () => active,
      mutate: (change: (state: object) => void) => change({}),
    },
  );
  return {
    html: renderToStaticMarkup(node),
    controls: buttons(node),
    currentNow: () => updatedNow,
  };
}
const freshSession = (): TimerSession => ({
  id: 'meal',
  step: 2,
  status: 'cooking',
});

void test('all preset steps expose only their own duration timer, without custom minutes', () => {
  assert.equal(recipes.length, 72);
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
    assert.ok(running.html.includes(`${String(minutes).padStart(2, '0')}:00`));
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

void test('running countdown advances every second and catches up after a delayed tick without changing the session', () => {
  const session = { ...freshSession(), timerEnd: now + 600000 };
  const original = { ...session };
  for (const [elapsed, label] of [
    [0, '10:00'],
    [1000, '09:59'],
    [2000, '09:58'],
    [75000, '08:45'],
    [600000, '00:00'],
    [601000, '00:00'],
  ] as const) {
    const clock = { rendered: now + elapsed, actual: now + elapsed };
    const { html } = renderTimer(10, session, false, session, clock);
    assert.ok(html.includes(label), `${elapsed} ms: ${label}`);
    assert.equal(html.includes('时间到了'), elapsed >= 600000);
    assert.deepEqual(session, original);
  }
});

void test('starting a timer synchronizes a stale display clock without adding an extra second', () => {
  const session = freshSession();
  const clock = { rendered: now, actual: now + 999 };
  const timer = renderTimer(10, session, false, session, clock);
  timer.controls[0].props.onClick!();
  assert.equal(timer.currentNow(), clock.actual);
  assert.equal(session.timerEnd, clock.actual + 600000);
  const started = renderTimer(10, session, false, session, {
    rendered: timer.currentNow(),
    actual: clock.actual,
  });
  assert.match(started.html, />10:00</);
});

void test('pause holds exact remaining milliseconds and resume keeps the same seconds display', () => {
  const session: TimerSession = { ...freshSession(), timerEnd: now + 600000 };
  const pausedAt = now + 12345;
  renderTimer(
    10,
    session,
    false,
    session,
    { rendered: now + 12000, actual: pausedAt },
    true,
  ).controls[0].props.onClick!();
  assert.equal(session.status, 'paused');
  assert.equal(session.timerEnd, undefined);
  assert.equal(session.timerRemaining, 587655);
  for (const elapsed of [0, 300000]) {
    const at = pausedAt + elapsed;
    assert.match(
      renderTimer(10, session, false, session, { rendered: at, actual: at })
        .html,
      />09:48</,
    );
  }
  const resumedAt = pausedAt + 300999;
  const resume = renderTimer(
    10,
    session,
    false,
    session,
    { rendered: resumedAt - 999, actual: resumedAt },
    true,
  );
  resume.controls[0].props.onClick!();
  assert.equal(session.status, 'cooking');
  assert.equal(session.timerEnd, resumedAt + 587655);
  assert.equal(session.timerRemaining, undefined);
  assert.equal(resume.currentNow(), resumedAt);
  assert.match(
    renderTimer(10, session, false, session, {
      rendered: resume.currentNow(),
      actual: resumedAt,
    }).html,
    />09:48</,
  );
});
