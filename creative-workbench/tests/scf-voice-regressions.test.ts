import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeVoiceWav } from '../lib/voice-audio';
import { createVoiceHandler } from '../scf/voice-backend/handler.mjs';
import { createVoiceHandlerFromEnv } from '../scf/voice-backend/handler.mjs';
import {
  createCosSlotStore,
  QUOTA_LIFECYCLE,
  configXml,
} from '../scf/voice-backend/cos-store.mjs';
import { createQuotaChecker } from '../scf/voice-backend/quota.mjs';
import { createCloudSpeech } from '../skills/zhonghua-shisi/scripts/cloud-speech.mjs';
import { Readable } from 'node:stream';

const origin = 'https://fixture.ap-guangzhou.tencentscf.com';
const audio = Buffer.from(
  encodeVoiceWav([new Float32Array(1600).fill(0.3)], 16000),
);
const event = () => ({
  httpMethod: 'POST',
  path: '/api/voice/transcribe',
  headers: {
    origin,
    'x-scf-request-domain': new URL(origin).host,
    'x-scf-remote-addr': '192.0.2.1',
    'x-kitchen-voice': '1',
    'content-type': 'application/json',
  },
  // Function URL event has no isBase64Encoded. Our envelope is ASCII JSON.
  body: JSON.stringify({ audio: audio.toString('base64') }),
});
const env = {
  VOICE_ORIGIN: origin,
  TENCENT_SECRET_ID: 'fixture-id',
  TENCENT_SECRET_KEY: 'fixture-key',
  KITCHEN_VOICE_ENABLED: '1',
  KITCHEN_VOICE_DAILY_LIMIT: '2',
};

void test('SCF accepts a documented event carrying an explicit JSON audio envelope', async () => {
  const handler = createVoiceHandler({
    env,
    docStore: { claim: async () => true },
    send: async (_url: unknown, init?: RequestInit) => {
      assert.ok(typeof init?.body === 'string');
      assert.deepEqual(
        Buffer.from(JSON.parse(init.body).Data, 'base64'),
        audio,
      );
      return Response.json({ Response: { Result: '两个番茄' } });
    },
  });
  assert.equal((await handler(event())).statusCode, 200);
});

function fakeCos() {
  const slots = new Set<string>();
  const requests: { url: string; headers: Headers }[] = [];
  const state = {
    versioning: '<VersioningConfiguration/>',
    lifecycle: QUOTA_LIFECYCLE,
    versionId: false,
  };
  const fetchImpl = async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const headers = new Headers(init?.headers);
    requests.push({ url: url.href, headers });
    if (url.searchParams.has('versioning'))
      return new Response(state.versioning);
    if (url.searchParams.has('lifecycle')) return new Response(state.lifecycle);
    assert.equal(init?.method, 'PUT');
    assert.equal(headers.get('x-cos-forbid-overwrite'), 'true');
    assert.match(
      headers.get('authorization')!,
      /q-header-list=content-type;host;x-cos-forbid-overwrite;x-cos-security-token/,
    );
    assert.equal(init?.body, '1');
    if (slots.has(url.pathname))
      return new Response('<Error><Code>FileAlreadyExists</Code></Error>', {
        status: 409,
      });
    slots.add(url.pathname);
    return new Response('', {
      headers: state.versionId ? { 'x-cos-version-id': 'fixture' } : {},
    });
  };
  return { slots, requests, state, fetchImpl };
}
const context = (suffix = '1') => ({
  TENCENTCLOUD_SECRETID: 'fixture-id-' + suffix,
  TENCENTCLOUD_SECRETKEY: 'fixture-secret-' + suffix,
  TENCENTCLOUD_SESSIONTOKEN: 'fixture-token-' + suffix,
});
const runtimeEnv = {
  ...env,
  VOICE_QUOTA_BUCKET: 'fixture-123',
  VOICE_QUOTA_REGION: 'ap-guangzhou',
};

void test('independent handlers competing for the last durable slot admit at most one ASR call', async () => {
  const cos = fakeCos();
  let paid = 0;
  const make = () =>
    createVoiceHandlerFromEnv(
      { ...runtimeEnv, KITCHEN_VOICE_DAILY_LIMIT: '1' },
      {
        fetchImpl: cos.fetchImpl,
        send: async () => {
          paid++;
          return Response.json({ Response: { Result: '番茄' } });
        },
      },
    );
  const statuses = await Promise.all([
    make()(event(), context()),
    make()(event(), context('2')),
  ]);
  assert.deepEqual(
    statuses.map((r) => r.statusCode).sort((a, b) => a - b),
    [200, 429],
  );
  assert.equal(paid, 1);
  assert.equal([...cos.slots].filter((k) => k.includes('/global/')).length, 1);
});

void test('each warm invocation signs COS with current context credentials; missing context never falls back to env', async () => {
  const cos = fakeCos();
  const handler = createVoiceHandlerFromEnv(
    { ...runtimeEnv, ...context('stale') },
    {
      fetchImpl: cos.fetchImpl,
      send: async () => Response.json({ Response: { Result: '番茄' } }),
    },
  );
  assert.equal((await handler(event(), context('first'))).statusCode, 200);
  const start = cos.requests.length;
  assert.equal((await handler(event(), context('second'))).statusCode, 200);
  for (const request of cos.requests.slice(start)) {
    assert.match(
      request.headers.get('authorization')!,
      /q-ak=fixture-id-second&/,
    );
    assert.equal(
      request.headers.get('x-cos-security-token'),
      'fixture-token-second',
    );
  }
  const calls = cos.requests.length;
  assert.equal((await handler(event(), {})).statusCode, 503);
  assert.equal(cos.requests.length, calls);
});

void test('unsafe versioning, malformed config or premature lifecycle expiration fails before slots or ASR', async () => {
  for (const state of [
    {
      versioning:
        '<VersioningConfiguration><Status>Enabled</Status></VersioningConfiguration>',
    },
    {
      versioning:
        '<VersioningConfiguration><Status>Suspended</Status></VersioningConfiguration>',
    },
    {
      versioning:
        '<VersioningConfiguration><Status/></VersioningConfiguration>',
    },
    { versioning: 'null' },
    { lifecycle: QUOTA_LIFECYCLE.replace('<Days>2</Days>', '<Days>1</Days>') },
    {
      lifecycle: QUOTA_LIFECYCLE.replace(
        '</LifecycleConfiguration>',
        '<Rule/></LifecycleConfiguration>',
      ),
    },
    { lifecycle: '<LifecycleConfiguration/>' },
    { versioning: '<VersioningConfiguration xmlns="http://cos.example\' />' },
    {
      lifecycle: QUOTA_LIFECYCLE.replace(
        '<Prefix>voice-usage/',
        '<Prefix> voice-usage/',
      ),
    },
    {
      lifecycle: QUOTA_LIFECYCLE.replace(
        'voice-usage/</Prefix>',
        'voice-usage/ </Prefix>',
      ),
    },
  ]) {
    const cos = fakeCos();
    Object.assign(cos.state, state);
    const handler = createVoiceHandlerFromEnv(runtimeEnv, {
      fetchImpl: cos.fetchImpl,
      send: async () => assert.fail('paid call forbidden'),
    });
    assert.equal((await handler(event(), context())).statusCode, 503);
    assert.equal(cos.slots.size, 0);
    const status = await handler(
      { path: '/api/voice/status', httpMethod: 'GET' },
      context(),
    );
    assert.equal(JSON.parse(status.body).ready, false);
  }
});

void test('COS config comparison allows reordered XML children without weakening exact leaf values', () => {
  const reordered =
    '<?xml version="1.0"?><LifecycleConfiguration xmlns="http://cos.example">\n' +
    '<Rule><Expiration><Days>2</Days></Expiration><Status>Enabled</Status>' +
    '<Filter><Prefix>voice-usage/</Prefix></Filter><ID>voice-usage-expiration</ID></Rule>\n</LifecycleConfiguration>';
  assert.equal(configXml(reordered), configXml(QUOTA_LIFECYCLE));
  assert.throws(() => configXml('<VersioningConfiguration xmlns="mixed\'/>'));
  assert.throws(() => configXml('<!DOCTYPE x><VersioningConfiguration/>'));
});

void test('cancellation immediately after the final durable slot never grants admission', async () => {
  const controller = new AbortController();
  const keys: string[] = [];
  const reserve = createQuotaChecker({
    claim: async (key: string) => {
      keys.push(key);
      if (key.includes('/global/')) controller.abort();
      return true;
    },
  });
  await assert.rejects(
    reserve('192.0.2.1', 'key', 1, 1700000000, controller.signal),
  );
  assert.equal(keys.length, 3);
});

void test('versioning changes between requests or during a PUT cannot grant paid access', async () => {
  const cos = fakeCos();
  let paid = 0;
  const handler = createVoiceHandlerFromEnv(runtimeEnv, {
    fetchImpl: cos.fetchImpl,
    send: async () => {
      paid++;
      return Response.json({ Response: { Result: '番茄' } });
    },
  });
  assert.equal((await handler(event(), context())).statusCode, 200);
  cos.state.versioning =
    '<VersioningConfiguration><Status>Enabled</Status></VersioningConfiguration>';
  assert.equal((await handler(event(), context())).statusCode, 503);
  cos.state.versioning = '<VersioningConfiguration/>';
  cos.state.versionId = true;
  assert.equal((await handler(event(), context())).statusCode, 503);
  assert.equal(paid, 1);
});

void test('only an explicit COS FileAlreadyExists conflict counts as occupied; unknown responses fail closed', async () => {
  for (const reply of [
    () =>
      new Response('<Error><Code>FileAlreadyExists</Code></Error>', {
        status: 409,
      }),
    () =>
      new Response('<Error><Code>OtherConflict</Code></Error>', {
        status: 409,
      }),
    () => new Response('private provider detail', { status: 503 }),
    () => {
      throw new Error('write result lost');
    },
    () => new Response('<Code>' + 'x'.repeat(20000), { status: 409 }),
  ]) {
    const store = createCosSlotStore({
      bucket: 'fixture-123',
      region: 'ap-guangzhou',
      secretId: 'id',
      secretKey: 'key',
      fetchImpl: async () => reply(),
    });
    if (reply.toString().includes('FileAlreadyExists'))
      assert.equal(await store.claim('voice-usage/global/1/1'), false);
    else await assert.rejects(store.claim('voice-usage/global/1/1'));
  }
});

void test('quota errors, cancellation and partial reservations never refund or call ASR', async () => {
  const keys: string[] = [];
  const quota = createQuotaChecker({
    claim: async (key: string) => {
      keys.push(key);
      if (key.includes('/global/')) throw new Error('lost PUT');
      return true;
    },
  });
  await assert.rejects(quota('192.0.2.1', 'key', 1, 1700000000));
  assert.equal(keys.length, 3);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    quota('192.0.2.2', 'key', 1, 1700000000, controller.signal),
  );
  assert.equal(keys.length, 3);
  const handler = createVoiceHandler({
    env,
    docStore: {
      claim: async () => {
        throw new Error('uncertain');
      },
    },
    send: async () => assert.fail('paid call forbidden'),
  });
  assert.equal((await handler(event())).statusCode, 503);
});

void test('malformed envelopes and forged origin/IP are rejected before COS or ASR', async () => {
  const handler = createVoiceHandler({
    env,
    docStore: { claim: async () => assert.fail('quota forbidden') },
    send: async () => assert.fail('ASR forbidden'),
  });
  for (const body of [
    'null',
    '[]',
    '{}',
    '{bad',
    '{"audio":"===="}',
    '{"audio":"YQ=A"}',
    '{"audio":"YQ==","url":"https://invalid"}',
  ])
    assert.equal((await handler({ ...event(), body })).statusCode, 400);
  assert.equal(
    (
      await handler({
        ...event(),
        headers: {
          ...event().headers,
          origin: 'https://evil.invalid',
          host: 'evil.invalid',
        },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await handler({
        ...event(),
        headers: {
          ...event().headers,
          'x-scf-remote-addr': '',
          'x-forwarded-for': '192.0.2.1',
        },
      })
    ).statusCode,
    503,
  );
});

void test('ZIP relay to Function URL envelope round-trips a full 60-second binary WAV without platform encoding flags', async () => {
  const bytes = Buffer.from(
    encodeVoiceWav([new Float32Array(960000).fill(-0.31)], 16000),
  );
  let paid = 0;
  const handler = createVoiceHandler({
    env,
    docStore: { claim: async () => true },
    send: async (_url: unknown, init?: RequestInit) => {
      paid++;
      assert.ok(typeof init?.body === 'string');
      assert.deepEqual(
        Buffer.from(JSON.parse(init.body).Data, 'base64'),
        bytes,
      );
      return Response.json({ Response: { Result: '两个番茄' } });
    },
  });
  const relay = createCloudSpeech({
    endpoint: { origin, transport: 'json-base64' },
    fetchImpl: async (url: unknown, init?: RequestInit) => {
      assert.equal(new URL(String(url)).origin, origin);
      assert.equal(init?.redirect, 'error');
      assert.equal(init?.credentials, 'omit');
      const result = await handler({
        httpMethod: init?.method,
        path: new URL(String(url)).pathname,
        headers: {
          ...Object.fromEntries(new Headers(init?.headers)),
          'x-scf-remote-addr': '192.0.2.1',
        },
        body: init?.body,
      });
      return new Response(result.body, {
        status: result.statusCode,
        headers: result.headers,
      });
    },
  });
  const request = Object.assign(Readable.from([bytes]), {
    headers: { 'content-type': 'audio/wav' },
  });
  assert.deepEqual(
    await relay.transcribe(request, new AbortController().signal),
    { transcript: '两个番茄', engine: 'tencent-cloud-asr' },
  );
  assert.equal(paid, 1);
});

void test('two instances sharing atomic quota slots cannot overspend on A-B-A', async () => {
  const slots = new Set<string>();
  const store = {
    // Atomic create-if-absent, even when callers read no shared state.
    claim: async (key: string) => {
      if (slots.has(key)) return false;
      slots.add(key);
      return true;
    },
  };
  let paid = 0;
  const make = () =>
    createVoiceHandler({
      env,
      docStore: store,
      send: async () => {
        paid++;
        return Response.json({ Response: { Result: '番茄' } });
      },
    });
  const a = make();
  const b = make();
  assert.deepEqual(
    [
      (await a(event())).statusCode,
      (await b(event())).statusCode,
      (await a(event())).statusCode,
    ],
    [200, 200, 429],
  );
  assert.equal(paid, 2);
});
