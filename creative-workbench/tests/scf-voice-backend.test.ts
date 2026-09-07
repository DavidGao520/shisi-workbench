import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { encodeVoiceWav, MAX_WAV_BYTES } from '../lib/voice-audio';
import { createVoiceHandler } from '../scf/voice-backend/handler.mjs';
import { tencentSpeechHeaders } from '../scf/voice-backend/speech.mjs';
import { createQuotaChecker } from '../scf/voice-backend/quota.mjs';
import { cosAuthorization } from '../scf/voice-backend/cos-store.mjs';

const HOST = 'service-fixture.gz.tencentscf.com';
const ORIGIN = 'https://' + HOST;
const wav = () => encodeVoiceWav([new Float32Array(1600).fill(0.1)], 16000);

function memoryStore() {
  const slots = new Set<string>();
  return {
    dump: () => [...slots],
    claim: async (key: string) => {
      if (slots.has(key)) return false;
      slots.add(key);
      return true;
    },
  };
}
function environment(extra: Record<string, string> = {}) {
  return {
    TENCENT_SECRET_ID: 'test-id',
    TENCENT_SECRET_KEY: 'test-key',
    KITCHEN_VOICE_ENABLED: '1',
    VOICE_ORIGIN: ORIGIN,
    ...extra,
  };
}
function event(bytes = wav(), headers: Record<string, string> = {}) {
  return {
    httpMethod: 'POST',
    path: '/api/voice/transcribe',
    headers: {
      host: HOST,
      origin: ORIGIN,
      'x-kitchen-voice': '1',
      'x-scf-remote-addr': '192.0.2.1',
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ audio: Buffer.from(bytes).toString('base64') }),
  };
}
const success = (text = '两个番茄，一盒鸡蛋') =>
  (async () =>
    Response.json({
      Response: { Result: text, RequestId: 'fixture-only' },
    })) as typeof fetch;

type ScfResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};
const body = (response: ScfResponse) => JSON.parse(response.body);

void test('SCF TC3 signing matches independent Node crypto computation', async () => {
  const bodyText = '{"Data":"fixture"}';
  const timestamp = 1700000000;
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const digest = (s: string) => createHash('sha256').update(s).digest('hex');
  const hmac = (key: string | Buffer, value: string) =>
    createHmac('sha256', key).update(value).digest();
  const canonical =
    'POST\n/\n\ncontent-type:application/json; charset=utf-8\nhost:asr.tencentcloudapi.com\n\ncontent-type;host\n' +
    digest(bodyText);
  const scope = date + '/asr/tc3_request';
  const key = hmac(hmac(hmac('TC3secret', date), 'asr'), 'tc3_request');
  const signature = hmac(
    key,
    `TC3-HMAC-SHA256\n${timestamp}\n${scope}\n${digest(canonical)}`,
  ).toString('hex');
  const headers = await tencentSpeechHeaders(
    bodyText,
    { secretId: 'id', secretKey: 'secret' },
    timestamp,
  );
  assert.equal(
    headers.Authorization,
    `TC3-HMAC-SHA256 Credential=id/${scope}, SignedHeaders=content-type;host, Signature=${signature}`,
  );
});

void test('COS request signing matches independent HMAC-SHA1 computation', () => {
  const now = 1700000000;
  const keyTime = `${now - 60};${now + 600}`;
  const signKey = createHmac('sha1', 'secret').update(keyTime).digest('hex');
  const headerString = `host=${encodeURIComponent('bucket-123.cos.ap-guangzhou.myqcloud.com')}&x-cos-security-token=${encodeURIComponent('tok en')}`;
  const httpString = `put\n/voice-usage/usage.json\n\n${headerString}\n`;
  const stringToSign = `sha1\n${keyTime}\n${createHash('sha1').update(httpString).digest('hex')}\n`;
  const signature = createHmac('sha1', signKey)
    .update(stringToSign)
    .digest('hex');
  const auth = cosAuthorization({
    method: 'PUT',
    pathname: '/voice-usage/usage.json',
    host: 'bucket-123.cos.ap-guangzhou.myqcloud.com',
    headers: { 'x-cos-security-token': 'tok en' },
    secretId: 'id',
    secretKey: 'secret',
    now,
  });
  assert.equal(
    auth,
    `q-sign-algorithm=sha1&q-ak=id&q-sign-time=${keyTime}&q-key-time=${keyTime}` +
      `&q-header-list=host;x-cos-security-token&q-url-param-list=&q-signature=${signature}`,
  );
});

void test('COS bucket configuration query parameters are signed independently', () => {
  const now = 1700000000;
  const keyTime = `${now - 60};${now + 600}`;
  const signKey = createHmac('sha1', 'secret').update(keyTime).digest('hex');
  const host = 'fixture-123.cos.ap-guangzhou.myqcloud.com';
  const canonical = `get\n/\nlifecycle=\nhost=${host}\n`;
  const toSign = `sha1\n${keyTime}\n${createHash('sha1').update(canonical).digest('hex')}\n`;
  const signature = createHmac('sha1', signKey).update(toSign).digest('hex');
  const authorization = cosAuthorization({
    method: 'GET',
    pathname: '/',
    host,
    query: { lifecycle: '' },
    secretId: 'id',
    secretKey: 'secret',
    now,
  });
  assert.ok(
    authorization.endsWith(
      `&q-url-param-list=lifecycle&q-signature=${signature}`,
    ),
  );
});

void test('quota windows: per-IP minute cap 5, day cap 30, shared global cap and UTC reset', async () => {
  const store = memoryStore();
  const reserve = createQuotaChecker(store);
  const now = 1700000000;
  for (let i = 0; i < 5; i++)
    assert.equal(await reserve('10.0.0.1', 'secret', 100, now), true);
  assert.equal(await reserve('10.0.0.1', 'secret', 100, now), false);
  // A different client is still admitted against the shared global window.
  assert.equal(await reserve('10.0.0.2', 'secret', 100, now), true);
  // Minute window resets at the next boundary.
  assert.equal(await reserve('10.0.0.1', 'secret', 100, now + 60), true);
  for (let i = 7; i <= 30; i++)
    assert.equal(await reserve('10.0.0.1', 'secret', 100, now + i * 60), true);
  assert.equal(await reserve('10.0.0.1', 'secret', 100, now + 31 * 60), false);
  // Global cap is shared across clients.
  const small = createQuotaChecker(memoryStore());
  assert.equal(await small('a', 'secret', 2, now), true);
  assert.equal(await small('b', 'secret', 2, now), true);
  assert.equal(await small('c', 'secret', 2, now), false);
  // New UTC windows have independent keys; COS lifecycle cleans old objects.
  const fresh = createQuotaChecker(store);
  assert.equal(await fresh('10.0.0.9', 'secret', 100, now + 90000), true);
  const serialized = JSON.stringify(store.dump());
  assert.doesNotMatch(serialized, /10\.0\.0|secret/);
});

void test('quota store failure fails closed and never reaches paid ASR', async () => {
  let calls = 0;
  const handler = createVoiceHandler({
    env: environment(),
    docStore: {
      claim: async () => {
        throw new Error('cos down');
      },
    },
    send: (async () => {
      calls++;
      return Response.json({});
    }) as typeof fetch,
  });
  const response: ScfResponse = await handler(event());
  assert.equal(response.statusCode, 503);
  assert.equal(calls, 0);
});

void test('not configured, wrong origin, bad headers and invalid uploads never call paid ASR', async () => {
  let calls = 0;
  const send = (async () => {
    calls++;
    return Response.json({});
  }) as typeof fetch;
  const withEnv = (env: Record<string, string>) =>
    createVoiceHandler({ env, docStore: memoryStore(), send });
  const unconfigured = createVoiceHandler({
    env: {},
    docStore: memoryStore(),
    send,
  });
  const status: ScfResponse = await unconfigured({
    httpMethod: 'GET',
    path: '/api/voice/status',
    headers: { host: HOST },
    body: '',
    isBase64Encoded: false,
  });
  assert.deepEqual(body(status), {
    ready: false,
    engine: 'tencent-cloud-asr',
    maxSeconds: 60,
  });
  assert.equal((await unconfigured(event())).statusCode, 503);
  assert.equal(
    (
      await withEnv(environment())(
        event(wav(), { origin: 'https://evil.example' }),
      )
    ).statusCode,
    403,
  );
  assert.equal(
    (await withEnv(environment())(event(wav(), { 'x-kitchen-voice': '' })))
      .statusCode,
    403,
  );
  assert.equal(
    (await withEnv(environment())(event(wav(), { 'x-scf-remote-addr': '' })))
      .statusCode,
    503,
  );
  assert.equal(
    (
      await withEnv(environment())(
        event(wav(), { 'content-type': 'audio/mp4' }),
      )
    ).statusCode,
    415,
  );
  assert.equal(
    (await withEnv(environment())(event(new Uint8Array(MAX_WAV_BYTES + 2))))
      .statusCode,
    413,
  );
  assert.equal(
    (await withEnv(environment())(event(new Uint8Array(100)))).statusCode,
    422,
  );
  assert.equal(calls, 0);
  assert.equal(JSON.stringify(memoryStore().dump()), '[]');
});

void test('successful transcription returns provider text and consumes quota', async () => {
  const store = memoryStore();
  let received = 0;
  const send = (async (url: string, init?: RequestInit) => {
    assert.equal(url, 'https://asr.tencentcloudapi.com/');
    const payload = JSON.parse(init?.body as string);
    assert.equal(payload.VoiceFormat, 'wav');
    assert.equal(payload.SourceType, 1);
    assert.equal(Buffer.from(payload.Data, 'base64').length, payload.DataLen);
    received++;
    return Response.json({ Response: { Result: '两个番茄，一盒鸡蛋' } });
  }) as unknown as typeof fetch;
  const handler = createVoiceHandler({
    env: environment(),
    docStore: store,
    send,
  });
  const response: ScfResponse = await handler(event());
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.deepEqual(body(response), {
    transcript: '两个番茄，一盒鸡蛋',
    engine: 'tencent-cloud-asr',
  });
  assert.equal(received, 1);
  const serialized = JSON.stringify(store.dump());
  assert.doesNotMatch(serialized, /192\.0\.2|番茄|test-key/);
  assert.match(serialized, /voice-usage\/global\//);
});

void test('per-IP minute quota returns 429 and stops paid calls', async () => {
  let received = 0;
  const send = (async () => {
    received++;
    return Response.json({ Response: { Result: '番茄' } });
  }) as typeof fetch;
  const handler = createVoiceHandler({
    env: environment(),
    docStore: memoryStore(),
    send,
  });
  for (let i = 0; i < 5; i++)
    assert.equal((await handler(event())).statusCode, 200);
  const sixth: ScfResponse = await handler(event());
  assert.equal(sixth.statusCode, 429);
  assert.equal(received, 5);
  assert.doesNotMatch(body(sixth).error, /test-key/);
});

void test('global daily cap is enforced across different client IPs', async () => {
  let received = 0;
  const send = (async () => {
    received++;
    return Response.json({ Response: { Result: '番茄' } });
  }) as typeof fetch;
  const handler = createVoiceHandler({
    env: environment({ KITCHEN_VOICE_DAILY_LIMIT: '2' }),
    docStore: memoryStore(),
    send,
  });
  assert.equal((await handler(event())).statusCode, 200);
  assert.equal(
    (await handler(event(wav(), { 'x-scf-remote-addr': '192.0.2.2' })))
      .statusCode,
    200,
  );
  assert.equal(
    (await handler(event(wav(), { 'x-scf-remote-addr': '192.0.2.3' })))
      .statusCode,
    429,
  );
  assert.equal(received, 2);
});

void test('provider errors keep the existing taxonomy and never leak details', async () => {
  for (const [payload, expected] of [
    [
      {
        Response: {
          Error: {
            Code: 'AuthFailure.SecretIdNotFound',
            Message: 'secret detail',
          },
        },
      },
      503,
    ],
    [{ Response: { Error: { Code: 'RequestLimitExceeded' } } }, 429],
    [
      {
        Response: {
          Error: { Code: 'InvalidParameterValue.ErrorInvalidVoicedata' },
        },
      },
      422,
    ],
    [{ Response: { Result: 'x'.repeat(10001) } }, 502],
  ] as const) {
    const handler = createVoiceHandler({
      env: environment(),
      docStore: memoryStore(),
      send: (async () => Response.json(payload)) as typeof fetch,
    });
    const response: ScfResponse = await handler(event());
    assert.equal(response.statusCode, expected);
    assert.doesNotMatch(response.body, /secret detail|test-key|SecretId/);
  }
});

void test('memory guard rejects a third concurrent recording and releases afterwards', async () => {
  const finish: ((response: Response) => void)[] = [];
  let ready!: () => void;
  const started = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const send = (() => {
    if (finish.length >= 2)
      return Promise.resolve(
        Response.json({ Response: { Result: '两个番茄' } }),
      );
    return new Promise<Response>((resolve) => {
      finish.push(resolve);
      if (finish.length === 2) ready();
    });
  }) as typeof fetch;
  const handler = createVoiceHandler({
    env: environment(),
    docStore: memoryStore(),
    send,
  });
  const first = handler(event());
  const second = handler(event());
  await started;
  assert.equal((await handler(event())).statusCode, 429);
  for (const resolve of finish)
    resolve(Response.json({ Response: { Result: '两个番茄' } }));
  assert.deepEqual(
    (await Promise.all([first, second])).map(
      (response: ScfResponse) => response.statusCode,
    ),
    [200, 200],
  );
  assert.equal((await handler(event())).statusCode, 200);
});

void test('unknown paths and wrong methods are rejected without side effects', async () => {
  const handler = createVoiceHandler({
    env: environment(),
    docStore: memoryStore(),
    send: success(),
  });
  assert.equal(
    (
      await handler({
        httpMethod: 'GET',
        path: '/api/voice/other',
        headers: { host: HOST },
        body: '',
        isBase64Encoded: false,
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await handler({
        httpMethod: 'GET',
        path: '/api/voice/transcribe',
        headers: { host: HOST, origin: ORIGIN, 'x-kitchen-voice': '1' },
        body: '',
        isBase64Encoded: false,
      })
    ).statusCode,
    405,
  );
});
