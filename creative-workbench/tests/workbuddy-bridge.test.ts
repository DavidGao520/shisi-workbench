import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { request } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { IDBFactory } from 'fake-indexeddb';
import {
  startBridge,
  agentRequest,
  validateExtraction,
} from '../skills/zhonghua-shisi/scripts/kitchen-bridge.mjs';
import {
  WorkBuddyBridge,
  deliveryCandidates,
  stageDelivery,
  type Delivery,
} from '../lib/workbuddy-bridge';
import { IndexedDbStore } from '../lib/store';
import { confirmCandidate, emptyState, rejectCandidate } from '../lib/kitchen';

const extraction = () => ({
  schemaVersion: '1.0',
  source: 'workbuddy-voice-transcript',
  transcript: '冰箱有两个番茄、一盒鸡蛋和剩饭',
  warnings: [],
  candidates: [
    {
      candidateId: 'tomato',
      displayName: '番茄',
      rawMention: '两个番茄',
      amount: 2,
      unit: '个',
      warnings: [],
    },
    {
      candidateId: 'egg',
      displayName: '鸡蛋',
      rawMention: '一盒鸡蛋',
      amount: 1,
      unit: '盒',
      warnings: ['盒内枚数需确认'],
    },
    {
      candidateId: 'rice',
      displayName: '熟米饭',
      rawMention: '剩饭',
      warnings: ['数量与保存情况需确认'],
    },
  ],
});
async function fixture(t: TestContext, now?: () => number) {
  const workspace = await mkdtemp(join(tmpdir(), '厨房 bridge-test-'));
  await writeFile(
    join(workspace, '中华食肆.html'),
    '<!doctype html><html><head></head><body>fixture</body></html>',
  );
  let server = await startBridge({ workspace, port: 0, now });
  const clientId = randomUUID();
  t.after(async () => {
    await server.close();
    await rm(workspace, { recursive: true, force: true });
  });
  return {
    workspace,
    clientId,
    get api() {
      return new WorkBuddyBridge(clientId, server.origin);
    },
    get origin() {
      return server.origin;
    },
    get workspaceId() {
      return server.workspaceId;
    },
    publish: (id: string, value: unknown = extraction()) =>
      agentRequest(workspace, '/bridge/submit', {
        ticketId: id,
        extraction: value,
      }),
    restart: async () => {
      await server.close();
      server = await startBridge({ workspace, port: 0, now });
    },
  };
}

void test('HTTP → durable candidate transaction → ack → manual confirmation; no AI claim', async (t) => {
  const f = await fixture(t);
  const store = new IndexedDbStore('bridge-flow', new IDBFactory());
  t.after(() => store.close());
  const { ticket } = await f.api.begin('real', 'stocktake');
  const receipt = await f.publish(ticket.id);
  assert.equal(receipt.status, 'pending');
  const { entry } = await f.api.next();
  assert.ok(entry);
  assert.equal(entry.envelope.requestId, 'wb-' + ticket.id);
  const state = await store.change('real', (s) => stageDelivery(s, entry));
  assert.equal(state.candidates.length, 3);
  assert.equal(state.inventory.length, 0);
  assert.equal(state.candidates[2].amount, undefined);
  assert.equal(state.candidates[2].amountBand, undefined);
  await f.api.ack(ticket.id, 'staged');
  assert.equal((await f.api.next()).entry, null);
  const confirmed = await store.change('real', (s) =>
    confirmCandidate(s, s.candidates[0].key, {
      name: '番茄',
      ingredientId: 'tomato',
      quantity: { amount: 2, unit: '个' },
    }),
  );
  assert.equal(confirmed.inventory.length, 1);
  assert.equal(confirmed.inventory[0].amount, 2);
  const disk = await readFile(
    join(f.workspace, '.kitchen-bridge/queue.json'),
    'utf8',
  );
  assert.ok(!disk.includes('两个番茄'));
  assert.ok(!disk.includes('envelope'));
});
void test('unacked results survive restart with same workspace and replay identity', async (t) => {
  const f = await fixture(t);
  const id = f.workspaceId;
  const { ticket } = await f.api.begin('real', 'restock');
  await f.publish(ticket.id);
  const before = await f.api.next();
  await f.restart();
  assert.equal(f.workspaceId, id);
  assert.deepEqual(await f.api.next(), before);
  assert.equal((await f.publish(ticket.id)).duplicate, true);
});
void test('committed transaction with missing ack replays without extra stock or resurrecting decisions', async (t) => {
  const f = await fixture(t);
  const { ticket } = await f.api.begin('real', 'restock');
  await f.publish(ticket.id);
  const entry = (await f.api.next()).entry!;
  const state = emptyState('real');
  stageDelivery(state, entry);
  confirmCandidate(state, state.candidates[0].key, {
    name: '番茄',
    ingredientId: 'tomato',
    quantity: { amount: 2, unit: '个' },
  });
  rejectCandidate(state, state.candidates[1].key);
  stageDelivery(state, entry);
  stageDelivery(state, entry);
  assert.equal(state.candidates.length, 3);
  assert.equal(state.candidates[1].status, 'rejected');
  assert.equal(state.inventory[0].amount, 2);
  await f.api.ack(ticket.id, 'staged');
  await f.api.ack(ticket.id, 'staged');
  assert.equal((await f.publish(ticket.id)).status, 'staged');
});
void test('IndexedDB failure leaves message available and real/demo isolation holds', async (t) => {
  const f = await fixture(t);
  const { ticket } = await f.api.begin('real', 'stocktake');
  await f.publish(ticket.id);
  const entry = (await f.api.next()).entry!;
  const store = new IndexedDbStore('failed-bridge', new IDBFactory());
  t.after(() => store.close());
  await assert.rejects(
    store.change('real', (s) => {
      stageDelivery(s, entry);
      throw new Error('injected failure');
    }),
  );
  assert.equal((await store.read('real')).candidates.length, 0);
  assert.ok((await f.api.next()).entry);
  await assert.rejects(
    store.change('demo', (s) => stageDelivery(s, entry)),
    /另一厨房/,
  );
  assert.equal((await store.read('demo')).candidates.length, 0);
  const state = await store.change('real', (s) => stageDelivery(s, entry));
  assert.equal(state.candidates[0].mode, 'stocktake');
});
void test('different payload for same ticket is rejected even after ack', async (t) => {
  const f = await fixture(t);
  const { ticket } = await f.api.begin('real', 'stocktake');
  await f.publish(ticket.id);
  await f.api.ack(ticket.id, 'staged');
  const changed = extraction();
  changed.candidates[0].amount = 99;
  await assert.rejects(f.publish(ticket.id, changed), /不同结果/);
});
void test('cancelled or expired ticket cannot deliver into a newer waiting task', async (t) => {
  let time = Date.now();
  const f = await fixture(t, () => time);
  const { ticket } = await f.api.begin('real', 'stocktake');
  await f.api.cancel(ticket.id);
  const fresh = (await f.api.begin('demo', 'restock')).ticket;
  await assert.rejects(f.publish(ticket.id), /对应的等待/);
  time += 31 * 60 * 1000;
  await assert.rejects(f.publish(fresh.id), /过期/);
  assert.equal((await f.api.status()).active, null);
});
void test('one active ticket; repeated begin reuses binding and other browsers cannot take results', async (t) => {
  const f = await fixture(t);
  const { ticket } = await f.api.begin('real', 'stocktake');
  assert.equal((await f.api.begin('real', 'stocktake')).ticket.id, ticket.id);
  await assert.rejects(f.api.begin('demo', 'restock'), /另一次/);
  const other = new WorkBuddyBridge(randomUUID(), f.origin);
  assert.equal((await other.status()).otherActive, true);
  await assert.rejects(other.cancel(ticket.id));
  await f.publish(ticket.id);
  assert.equal((await other.next()).entry, null);
  await assert.rejects(other.ack(ticket.id, 'staged'));
});
void test('reset discards old queued delivery and persistent tombstone rejects an in-flight copy', async (t) => {
  const f = await fixture(t);
  const { ticket } = await f.api.begin('demo', 'stocktake');
  await f.publish(ticket.id);
  const entry = (await f.api.next()).entry!;
  const { ticketIds } = await f.api.resetPreview('demo');
  await f.api.discard('demo', ticketIds);
  assert.ok(ticketIds.includes(ticket.id));
  assert.equal((await f.api.next()).entry, null);
  const state = emptyState('demo');
  state.bridgeIgnoredTicketIds = ticketIds;
  assert.equal(stageDelivery(state, entry), 0);
  assert.equal(state.candidates.length, 0);
  assert.equal((await f.publish(ticket.id)).status, 'discarded');
});
void test('empty recognition delivers an explicit empty result without fabricated food', async (t) => {
  const f = await fixture(t);
  const { ticket } = await f.api.begin('real', 'stocktake');
  await f.publish(ticket.id, {
    schemaVersion: '1.0',
    source: 'workbuddy-image',
    warnings: ['照片过暗'],
    candidates: [],
  });
  const entry = (await f.api.next()).entry!;
  assert.equal(deliveryCandidates(entry, 'real').length, 0);
  await f.api.ack(ticket.id, 'empty');
  assert.equal((await f.api.next()).entry, null);
});
void test('model output cannot override ticket routing, identity, or inject confirmed state', () => {
  const ticket = {
    id: randomUUID(),
    dataset: 'real',
    mode: 'stocktake',
    createdAt: new Date().toISOString(),
  };
  const base = extraction();
  assert.throws(
    () => validateExtraction({ ...base, dataset: 'demo' }, ticket),
    /不一致/,
  );
  assert.throws(
    () =>
      validateExtraction(
        { ...base, candidates: [{ ...base.candidates[0], confirmed: true }] },
        ticket,
      ),
    /未知字段/,
  );
  assert.throws(() => validateExtraction({ ...base, source: 'demo' }, ticket));
  assert.throws(() =>
    validateExtraction(
      { ...base, candidates: [{ ...base.candidates[0], amount: -1 }] },
      ticket,
    ),
  );
  assert.throws(() =>
    validateExtraction(
      {
        ...base,
        candidates: [{ ...base.candidates[0], rawMention: '西红柿' }],
      },
      ticket,
    ),
  );
  const safe = validateExtraction(
    { ...base, requestId: 'malicious-id', createdAt: 'fake' },
    ticket,
  );
  assert.equal(safe.requestId, 'wb-' + ticket.id);
  assert.equal(safe.createdAt, ticket.createdAt);
});
void test('browser rejects a forged envelope before staging', () => {
  const ticket = {
    id: randomUUID(),
    dataset: 'real',
    mode: 'stocktake',
    createdAt: new Date().toISOString(),
  };
  const envelope = validateExtraction(extraction(), ticket);
  const entry: Delivery = { ticketId: ticket.id, envelope };
  assert.throws(
    () =>
      stageDelivery(emptyState('real'), { ...entry, ticketId: randomUUID() }),
    /不一致/,
  );
  assert.throws(() =>
    deliveryCandidates(
      { ...entry, envelope: { ...envelope, schemaVersion: '0' } },
      'real',
    ),
  );
});
void test('cross-site/null origins, DNS rebinding and uncredentialed publishers are rejected', async (t) => {
  const f = await fixture(t);
  for (const origin of ['https://evil.example', 'null']) {
    const response = await fetch(f.origin + '/bridge/status', {
      headers: { Origin: origin, 'X-Kitchen-Client': f.clientId },
    });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
  assert.equal((await fetch(f.origin + '/bridge/status')).status, 403);
  assert.equal(
    (
      await fetch(f.origin + '/bridge/submit', {
        method: 'POST',
        headers: { 'X-Kitchen-Client': f.clientId },
      })
    ).status,
    401,
  );
  assert.equal(
    (await fetch(f.origin + '/bridge/status', { method: 'OPTIONS' })).status,
    403,
  );
  const hostStatus = await new Promise((resolveStatus) => {
    const req = request(
      f.origin + '/bridge/status',
      { headers: { host: 'evil.example', 'X-Kitchen-Client': f.clientId } },
      (res) => {
        res.resume();
        resolveStatus(res.statusCode);
      },
    );
    req.end();
  });
  assert.equal(hostStatus, 403);
  const privateFile = await fetch(f.origin + '/.kitchen-bridge/runtime.json', {
    headers: { 'X-Kitchen-Client': f.clientId },
  });
  assert.equal(privateFile.status, 404);
});
void test('page response embeds workspace identity but no writer token; status has no private inventory', async (t) => {
  const f = await fixture(t);
  const html = await (await fetch(f.origin)).text();
  assert.ok(html.includes(f.workspaceId));
  assert.ok(!html.includes('token'));
  const status = await agentRequest(f.workspace, '/bridge/agent-status');
  assert.ok(!('token' in status));
  assert.ok(!('inventory' in status));
});
void test('Skill CLI can reuse a running connection, get ticket, submit a file and see receipt without exposing token', async (t) => {
  const f = await fixture(t);
  const script = fileURLToPath(
    new URL(
      '../skills/zhonghua-shisi/scripts/kitchen-bridge.mjs',
      import.meta.url,
    ),
  );
  const run = async (...args: string[]) => {
    const { stdout } = await promisify(execFile)(process.execPath, [
      script,
      ...args,
      '--workspace',
      f.workspace,
    ]);
    const result = JSON.parse(stdout);
    assert.ok(!stdout.includes('token'));
    return result;
  };
  assert.equal((await run('start')).origin, f.origin);
  const { ticket } = await f.api.begin('real', 'stocktake');
  assert.equal((await run('status')).active.id, ticket.id);
  const path = join(
    f.workspace,
    '.kitchen-bridge',
    'extraction-' + ticket.id + '.json',
  );
  await writeFile(path, JSON.stringify(extraction()));
  assert.equal(
    (await run('submit', '--ticket', ticket.id, '--file', path)).status,
    'pending',
  );
  assert.ok((await f.api.next()).entry);
  await f.api.ack(ticket.id, 'staged');
  assert.equal((await run('status')).receipts.at(-1).status, 'staged');
});
void test('opening the public shell from a link is allowed; cross-site API reads stay blocked', async (t) => {
  const f = await fixture(t);
  const shell = await fetch(f.origin, {
    headers: { 'Sec-Fetch-Site': 'cross-site' },
  });
  assert.equal(shell.status, 200);
  assert.match(
    shell.headers.get('content-security-policy') || '',
    /frame-ancestors 'none'/,
  );
  const privateData = await fetch(f.origin + '/bridge/status', {
    headers: { 'Sec-Fetch-Site': 'cross-site', 'X-Kitchen-Client': f.clientId },
  });
  assert.equal(privateData.status, 403);
});

void test('reset preflight is read-only when the database reset fails; discard cannot cancel a newer ticket', async (t) => {
  const f = await fixture(t);
  const { ticket } = await f.api.begin('demo', 'stocktake');
  await f.publish(ticket.id);
  const { ticketIds } = await f.api.resetPreview('demo');
  const store = new IndexedDbStore('reset-failure', new IDBFactory());
  t.after(() => store.close());
  await assert.rejects(
    store.change('demo', () => {
      throw new Error('disk unavailable');
    }),
  );
  assert.equal((await f.api.next()).entry?.ticketId, ticket.id);
  await f.api.ack(ticket.id, 'staged');
  const newer = (await f.api.begin('demo', 'stocktake')).ticket;
  await f.api.discard('demo', ticketIds);
  assert.equal((await f.api.status()).active?.id, newer.id);
});

void test('accepted extraction limits match page validation at warning and amount boundaries', () => {
  const ticket = {
    id: randomUUID(),
    dataset: 'real',
    mode: 'stocktake',
    createdAt: new Date().toISOString(),
  };
  const base = extraction();
  base.candidates[0].warnings = ['字'.repeat(300)];
  base.candidates[0].amount = 1000000;
  const envelope = validateExtraction(base, ticket);
  assert.equal(
    deliveryCandidates({ ticketId: ticket.id, envelope }, 'real').length,
    3,
  );
  base.candidates[0].warnings = ['字'.repeat(301)];
  assert.throws(() => validateExtraction(base, ticket));
  base.candidates[0].warnings = [];
  base.candidates[0].amount = 1000001;
  assert.throws(() => validateExtraction(base, ticket));
});
