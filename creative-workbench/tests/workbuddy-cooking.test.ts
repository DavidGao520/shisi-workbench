import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { IDBFactory } from 'fake-indexeddb';
import {
  startBridge,
  agentRequest,
} from '../skills/zhonghua-shisi/scripts/kitchen-bridge.mjs';
import {
  validateCookingRequest,
  validateCookingResult,
} from '../skills/zhonghua-shisi/scripts/cooking-contract.mjs';
import { WorkBuddyBridge } from '../lib/workbuddy-bridge';
import {
  cookingRequest,
  checkCookingDelivery,
  receiveCookingSteps,
  ignoreCookingTicket,
  type CookingDelivery,
  type CookingTicket,
} from '../lib/workbuddy-cooking';
import {
  emptyState,
  recipeFor,
  sessionRecipe,
  detailRecipe,
  reviewRecipe,
  reviewed,
  startCooking,
  stepSession,
  remainingPlan,
  completeCooking,
  archive,
  stage,
  parseImport,
  demoImport,
  confirmCandidate,
} from '../lib/kitchen';
import { IndexedDbStore } from '../lib/store';
import { recipes, RECIPE_VERSION } from '../lib/recipes';
import { renderBaiweiEntry } from '../lib/archive-export';

const request = () => cookingRequest('demo', 'tomato_egg');
const result = () => ({
  schemaVersion: '1.0',
  recipeId: 'tomato_egg',
  title: recipes[0].title,
  steps: Array.from(
    { length: 7 },
    (_, n) => `测试夹具步骤${n + 1}，不是实际 WorkBuddy 模型输出。`,
  ),
  warnings: ['仅用于连接测试，不作为真实烹饪说明。'],
});
const delivery = (): CookingDelivery => ({
  ticketId: randomUUID(),
  request: request(),
  result: validateCookingResult(result(), request()),
  createdAt: new Date().toISOString(),
});
function kitchen() {
  const s = emptyState('demo');
  stage(s, parseImport(demoImport(), 'demo', 'stocktake'));
  for (const c of s.candidates)
    confirmCandidate(s, c.key, {
      name: c.displayName,
      ingredientId: c.canonicalIngredientId!,
      quantity: { amount: c.amount, unit: c.unit },
    });
  return s;
}
async function fixture(t: TestContext, now?: () => number) {
  const workspace = await mkdtemp(join(tmpdir(), 'shisi-cooking-test-'));
  await writeFile(
    join(workspace, '中华食肆.html'),
    '<html><head></head><body>isolated fixture</body></html>',
  );
  let server = await startBridge({ workspace, port: 0, now });
  const client = randomUUID();
  t.after(async () => {
    await server.close();
    await rm(workspace, { recursive: true, force: true });
  });
  return {
    workspace,
    client,
    get origin() {
      return server.origin;
    },
    get api() {
      return new WorkBuddyBridge(client, server.origin);
    },
    begin: async () =>
      (
        await new WorkBuddyBridge(client, server.origin).call<{
          ticket: CookingTicket;
        }>('cooking/begin', request())
      ).ticket,
    publish: (ticketId: string, value: unknown = result()) =>
      agentRequest(workspace, '/bridge/cooking/submit', {
        ticketId,
        result: value,
      }),
    restart: async () => {
      await server.close();
      server = await startBridge({ workspace, port: 0, now });
    },
  };
}
void test('cooking contract is limited to the selected dish and rejects inventory commands', () => {
  const data = request();
  assert.equal(data.ingredients.length, recipes[0].ingredients.length);
  assert.equal('inventory' in data, false);
  assert.equal('steps' in data, false);
  assert.throws(
    () => validateCookingRequest({ ...data, sessions: [] }),
    /不完整/,
  );
  assert.throws(
    () => validateCookingResult({ ...result(), confirmed: true }, data),
    /不一致/,
  );
  assert.throws(
    () => validateCookingResult({ ...result(), title: '另一道菜' }, data),
    /不一致/,
  );
  assert.throws(
    () => validateCookingResult({ ...result(), steps: ['只有一步'] }, data),
    /不完整/,
  );
});
void test('photo ticket and cooking task coexist; only authorized agent can read cooking input', async (t) => {
  const f = await fixture(t);
  const photo = await f.api.begin('demo', 'stocktake'),
    cook = await f.begin();
  assert.notEqual(photo.ticket.id, cook.ticketId);
  assert.equal((await f.api.status()).active!.id, photo.ticket.id);
  const task = await agentRequest(f.workspace, '/bridge/cooking/task');
  assert.deepEqual(task.task.request, request());
  assert.equal(task.task.ticketId, cook.ticketId);
  const denied = await fetch(f.origin + '/bridge/cooking/task', {
    headers: { 'X-Kitchen-Client': f.client },
  });
  assert.equal(denied.status, 401);
  const cross = await fetch(f.origin + '/bridge/cooking/begin', {
    method: 'POST',
    headers: {
      Origin: 'https://unrelated.example',
      'X-Kitchen-Client': f.client,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request()),
  });
  assert.equal(cross.status, 403);
  await f.publish(cook.ticketId);
  assert.equal((await f.api.next()).entry, null);
  const other = new WorkBuddyBridge(randomUUID(), f.origin);
  assert.equal(
    (await other.call<{ entry: unknown }>('cooking/next')).entry,
    null,
  );
});
void test('request and result survive restart; replay is idempotent and ACK clears private payload', async (t) => {
  const f = await fixture(t),
    ticket = await f.begin();
  await f.restart();
  assert.equal(
    (await agentRequest(f.workspace, '/bridge/cooking/task')).task.ticketId,
    ticket.ticketId,
  );
  await f.publish(ticket.ticketId);
  await f.restart();
  assert.equal((await f.publish(ticket.ticketId)).duplicate, true);
  await assert.rejects(
    f.publish(ticket.ticketId, { ...result(), steps: ['一', '二', '三'] }),
    /不同做法/,
  );
  const { entry } = await f.api.call<{ entry: CookingDelivery }>(
    'cooking/next',
  );
  assert.equal(entry.ticketId, ticket.ticketId);
  const store = new IndexedDbStore('wb-cooking-fixture', new IDBFactory());
  try {
    await assert.rejects(
      store.change('demo', (s) => {
        receiveCookingSteps(s, entry);
        throw new Error('synthetic disk failure');
      }),
    );
    assert.equal(
      (await f.api.call<{ entry: CookingDelivery }>('cooking/next')).entry
        .ticketId,
      ticket.ticketId,
    );
    await store.change('demo', (s) => {
      receiveCookingSteps(s, entry);
    });
    store.close();
    assert.equal(
      (await store.read('demo')).workbuddySteps!.tomato_egg.steps.length,
      7,
    );
    await f.api.call('cooking/ack', {
      ticketId: ticket.ticketId,
      status: 'received',
    });
    assert.equal((await f.publish(ticket.ticketId)).duplicate, true);
    const queue = JSON.parse(
      await readFile(join(f.workspace, '.kitchen-bridge/queue.json'), 'utf8'),
    );
    assert.equal('ingredients' in queue.cookingJobs[0].request, false);
    assert.equal('result' in queue.cookingJobs[0], false);
  } finally {
    store.close();
  }
});
void test('cancel, expiry and reset reject late responses without affecting a newer task', async (t) => {
  let now = Date.now();
  const f = await fixture(t, () => now);
  const cancelled = await f.begin();
  await f.api.call('cooking/cancel', { ticketId: cancelled.ticketId });
  await assert.rejects(f.publish(cancelled.ticketId), /取消/);
  const expired = await f.begin();
  now += 31 * 60 * 1000;
  await assert.rejects(f.publish(expired.ticketId), /过期/);
  const old = await f.begin(),
    preview = await f.api.resetPreview('demo');
  assert.ok(preview.ticketIds.includes(old.ticketId));
  await f.api.discard('demo', preview.ticketIds);
  const fresh = await f.begin();
  await f.api.discard('demo', preview.ticketIds);
  await assert.rejects(f.publish(old.ticketId), /取消/);
  assert.equal(
    (await agentRequest(f.workspace, '/bridge/cooking/task')).task.ticketId,
    fresh.ticketId,
  );
});
void test('cross-kitchen, stale recipe versions and replay cannot overwrite accepted steps', () => {
  const state = kitchen(),
    entry = delivery(),
    before = structuredClone(state.inventory);
  assert.throws(() => checkCookingDelivery(entry, 'real'), /厨房/);
  assert.throws(
    () =>
      checkCookingDelivery(
        { ...entry, request: { ...entry.request, baseVersion: 'old' } },
        'demo',
      ),
    /版本/,
  );
  assert.equal(receiveCookingSteps(state, entry), true);
  const saved = structuredClone(state);
  assert.equal(receiveCookingSteps(state, entry), false);
  assert.deepEqual(state, saved);
  assert.deepEqual(state.inventory, before);
  const reset = emptyState('demo');
  reset.bridgeIgnoredTicketIds = [entry.ticketId];
  assert.equal(receiveCookingSteps(reset, entry), false);
});
void test('generated steps invalidate old review, freeze cooking snapshot and complete through 百味图', () => {
  const state = kitchen();
  state.dataset = 'real';
  reviewRecipe(state, 'tomato_egg', '测试核对者');
  const entry = delivery();
  entry.request.dataset = 'real';
  receiveCookingSteps(state, entry);
  const recipe = recipeFor(state, 'tomato_egg');
  assert.equal(reviewed(state, recipe), false);
  assert.throws(() => startCooking(state, recipe.id), /审校/);
  reviewRecipe(state, recipe.id, '测试核对者', recipe.workbuddyVersion);
  startCooking(state, recipe.id, 'meal');
  const newer = delivery();
  newer.request.dataset = 'real';
  newer.result.steps = ['新步骤一', '新步骤二', '新步骤三'];
  receiveCookingSteps(state, newer);
  assert.equal(sessionRecipe(state, state.sessions[0]).steps.length, 7);
  assert.equal(detailRecipe(state, recipe.id, 'meal').steps.length, 7);
  assert.equal(detailRecipe(state, recipe.id).steps.length, 3);
  stepSession(state, 'meal', 7);
  completeCooking(state, 'meal', {
    rating: 4,
    memory: '测试回顾',
    consumption: remainingPlan(state, recipe, 1),
  });
  assert.equal(archive(state).length, 1);
  const html = renderBaiweiEntry(
    recipeFor(state, recipe.id),
    state.sessions[0],
    'real',
  );
  assert.ok(html.includes('测试夹具步骤7'));
  assert.equal(html.includes('新步骤一'), false);
  assert.ok(html.includes('基础配方参考'));
});
void test('review and start reject a version the visible page has not seen', () => {
  const state = kitchen();
  const first = delivery();
  receiveCookingSteps(state, first);
  const newer = delivery();
  receiveCookingSteps(state, newer);
  assert.throws(
    () => reviewRecipe(state, 'tomato_egg', '审校者', first.ticketId),
    /版本/,
  );
  assert.throws(
    () => reviewRecipe(state, 'tomato_egg', '审校者', RECIPE_VERSION),
    /版本/,
  );
  assert.equal(state.reviews.tomato_egg, undefined);
  assert.throws(
    () => startCooking(state, 'tomato_egg', 'stale', undefined, first.ticketId),
    /版本/,
  );
  assert.equal(state.sessions.length, 0);
  reviewRecipe(state, 'tomato_egg', '审校者', newer.ticketId);
  assert.equal(reviewed(state, recipeFor(state, 'tomato_egg')), true);
});
void test('local cancellation tombstone blocks a delivery already fetched in another tab', () => {
  const state = kitchen();
  const old = delivery();
  const ticket: CookingTicket = {
    ticketId: old.ticketId,
    dataset: 'demo',
    recipeId: old.request.recipeId,
    title: old.request.title,
    status: 'pending',
    expiresAt: Date.now() + 30000,
  };
  ignoreCookingTicket(state, ticket);
  const newer = delivery();
  receiveCookingSteps(state, newer);
  const saved = structuredClone(state);
  assert.equal(receiveCookingSteps(state, old), false);
  assert.deepEqual(state, saved);
  assert.throws(
    () => ignoreCookingTicket(state, { ...ticket, dataset: 'real' }),
    /厨房/,
  );
});
void test('legacy session keeps original steps and latest inventory is checked before cooking', () => {
  const s = kitchen();
  startCooking(s, 'tomato_egg', 'old');
  delete s.sessions[0].recipeSnapshot;
  receiveCookingSteps(s, delivery());
  assert.deepEqual(sessionRecipe(s, s.sessions[0]).steps, recipes[0].steps);
  const fresh = kitchen();
  receiveCookingSteps(fresh, delivery());
  fresh.inventory = [];
  assert.throws(() => startCooking(fresh, 'tomato_egg'), /库存/);
});
void test('Skill CLI reads one dish and submits its steps without API or model runtime', async (t) => {
  const f = await fixture(t),
    ticket = await f.begin(),
    run = promisify(execFile);
  const cli = fileURLToPath(
    new URL(
      '../skills/zhonghua-shisi/scripts/kitchen-bridge.mjs',
      import.meta.url,
    ),
  );
  const task = await run(process.execPath, [
    cli,
    'cooking-task',
    '--workspace',
    f.workspace,
  ]);
  assert.equal(JSON.parse(task.stdout).task.ticketId, ticket.ticketId);
  const path = join(f.workspace, '测试做法.json');
  await writeFile(path, JSON.stringify(result()));
  const submit = await run(process.execPath, [
    cli,
    'cooking-submit',
    '--workspace',
    f.workspace,
    '--ticket',
    ticket.ticketId,
    '--file',
    path,
  ]);
  assert.equal(JSON.parse(submit.stdout).status, 'pending');
});
