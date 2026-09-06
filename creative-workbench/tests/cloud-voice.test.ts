import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { IDBFactory } from 'fake-indexeddb';
import {
  encodeVoiceWav,
  validateVoiceWav,
  MAX_WAV_BYTES,
} from '../lib/voice-audio';
import {
  cloudVoiceTranscribe,
  cloudVoiceStatus,
  type VoiceEnvironment,
} from '../lib/server/cloud-voice';
import {
  reserveVoiceQuota,
  type VoiceDatabase,
} from '../lib/server/voice-quota';
import { tencentSpeechHeaders } from '../lib/server/tencent-speech';
import { prepareVoiceDraft, confirmVoiceDraft } from '../lib/voice-intake';
import { IndexedDbStore } from '../lib/store';

const origin = 'https://kitchen.example';
const wav = () => encodeVoiceWav([new Float32Array(1600).fill(0.1)], 16000);
function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url))
    .filter((name) => name.endsWith('.sql'))
    .sort())
    sqlite.exec(
      readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8'),
    );
  const db = {
    prepare: (sql: string) => ({
      bind: (...args: (string | number)[]) => ({
        first: async () => sqlite.prepare(sql).get(...args) || null,
        run: async () => sqlite.prepare(sql).run(...args),
      }),
    }),
  } as unknown as VoiceDatabase;
  return { sqlite, db };
}
function environment(db: VoiceDatabase): VoiceEnvironment {
  return {
    TENCENT_SECRET_ID: 'test-id',
    TENCENT_SECRET_KEY: 'test-key',
    KITCHEN_VOICE_ENABLED: '1',
    VOICE_LIMITS: db,
  };
}
function request(bytes = wav(), headers: Record<string, string> = {}) {
  return new Request(origin + '/api/voice/transcribe', {
    method: 'POST',
    headers: {
      Origin: origin,
      'X-Kitchen-Voice': '1',
      'cf-connecting-ip': '192.0.2.1',
      'Content-Type': 'audio/wav',
      ...headers,
    },
    body: bytes,
  });
}
const success = (text = '两个番茄，一盒鸡蛋') =>
  (async () =>
    Response.json({
      Response: { Result: text, RequestId: 'fixture-only' },
    })) as typeof fetch;

void test('PCM conversion downmixes/clamps, preserves duration and rejects fake or overlong WAV', () => {
  const bytes = encodeVoiceWav(
    [new Float32Array([-1, 0, 1]), new Float32Array([-1, 0, 1])],
    16000,
  );
  assert.equal(validateVoiceWav(bytes), 3 / 16000);
  assert.equal(new DataView(bytes.buffer).getInt16(44, true), -32768);
  assert.equal(new DataView(bytes.buffer).getInt16(48, true), 32767);
  assert.throws(() => encodeVoiceWav([new Float32Array(960001)], 16000));
  assert.throws(() => encodeVoiceWav([new Float32Array(1)], 48000));
  assert.throws(() => validateVoiceWav(new Uint8Array(MAX_WAV_BYTES + 2)));
  const wrong = wav();
  wrong[24] = 0;
  assert.throws(() => validateVoiceWav(wrong));
  assert.throws(() =>
    validateVoiceWav(
      new TextEncoder().encode('not a WAV but labelled audio/wav'),
    ),
  );
  assert.equal(
    validateVoiceWav(encodeVoiceWav([new Float32Array(960000)], 16000)),
    60,
  );
});

void test('TC3 signs exact body with independent Node crypto, no browser credential', async () => {
  const body = '{"Data":"fixture"}',
    timestamp = 1700000000;
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const digest = (s: string) => createHash('sha256').update(s).digest('hex');
  const hmac = (key: string | Buffer, value: string) =>
    createHmac('sha256', key).update(value).digest();
  const canonical =
    'POST\n/\n\ncontent-type:application/json; charset=utf-8\nhost:asr.tencentcloudapi.com\n\ncontent-type;host\n' +
    digest(body);
  const scope = date + '/asr/tc3_request';
  const key = hmac(hmac(hmac('TC3secret', date), 'asr'), 'tc3_request');
  const signature = hmac(
    key,
    `TC3-HMAC-SHA256\n${timestamp}\n${scope}\n${digest(canonical)}`,
  ).toString('hex');
  const headers = await tencentSpeechHeaders(
    body,
    { secretId: 'id', secretKey: 'secret' },
    timestamp,
  );
  assert.equal(
    headers.Authorization,
    `TC3-HMAC-SHA256 Credential=id/${scope}, SignedHeaders=content-type;host, Signature=${signature}`,
  );
  assert.equal(headers['X-TC-Version'], '2019-06-14');
});

void test('not configured, wrong origin, oversized and invalid uploads never call paid ASR', async () => {
  const { db, sqlite } = database();
  let calls = 0;
  const send = (async () => {
    calls++;
    return Response.json({});
  }) as typeof fetch;
  try {
    assert.deepEqual(await cloudVoiceStatus({}).json(), {
      ready: false,
      engine: 'tencent-cloud-asr',
      maxSeconds: 60,
    });
    assert.equal((await cloudVoiceTranscribe(request(), {}, send)).status, 503);
    assert.equal(
      (
        await cloudVoiceTranscribe(
          request(wav(), { Origin: 'https://other.example' }),
          environment(db),
          send,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await cloudVoiceTranscribe(
          request(wav(), { 'X-Kitchen-Voice': '' }),
          environment(db),
          send,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await cloudVoiceTranscribe(
          request(wav(), { 'cf-connecting-ip': '' }),
          environment(db),
          send,
        )
      ).status,
      503,
    );
    assert.equal(
      (
        await cloudVoiceTranscribe(
          request(wav(), { 'Content-Type': 'audio/mp4' }),
          environment(db),
          send,
        )
      ).status,
      415,
    );
    assert.equal(
      (
        await cloudVoiceTranscribe(
          request(new Uint8Array(MAX_WAV_BYTES + 1)),
          environment(db),
          send,
        )
      ).status,
      413,
    );
    assert.equal(
      (
        await cloudVoiceTranscribe(
          request(new Uint8Array(100)),
          environment(db),
          send,
        )
      ).status,
      422,
    );
    assert.equal(calls, 0);
    assert.equal(
      sqlite.prepare('SELECT count(*) AS count FROM voice_usage').get()?.count,
      0,
    );
  } finally {
    sqlite.close();
  }
});

void test('cloud transcript only becomes inventory after existing explicit confirmation transaction', async () => {
  const { db, sqlite } = database();
  const store = new IndexedDbStore(
    'cloud-voice-test-' + crypto.randomUUID(),
    new IDBFactory(),
  );
  try {
    let received = 0;
    const send = (async (url, init) => {
      assert.equal(url, 'https://asr.tencentcloudapi.com/');
      const body = JSON.parse(init?.body as string);
      assert.equal(body.VoiceFormat, 'wav');
      assert.equal(body.SourceType, 1);
      assert.equal(Buffer.from(body.Data, 'base64').length, body.DataLen);
      assert.deepEqual(Buffer.from(body.Data, 'base64'), Buffer.from(wav()));
      received++;
      return success()(url, init);
    }) as typeof fetch;
    const response = await cloudVoiceTranscribe(
      request(),
      environment(db),
      send,
    );
    assert.equal(response.status, 200);
    assert.equal(received, 1);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const { transcript } = (await response.json()) as { transcript: string };
    const draft = prepareVoiceDraft(
      transcript,
      await store.read('real'),
      'stocktake',
    );
    assert.equal((await store.read('real')).inventory.length, 0);
    assert.deepEqual(
      draft.rows.map((r) => [r.name, r.amount, r.unit]),
      [
        ['番茄', '2', '个'],
        ['鸡蛋', '1', '盒'],
      ],
    );
    await store.change('real', (s) => confirmVoiceDraft(s, 'real', draft.rows));
    assert.equal((await store.read('real')).inventory.length, 2);
    const counters = JSON.stringify(
      sqlite.prepare('SELECT * FROM voice_usage').all(),
    );
    assert.doesNotMatch(counters, /192\.0\.2|番茄|鸡蛋|test-key/);
  } finally {
    sqlite.close();
    store.close();
  }
});

void test('HTTP-200 provider errors, invalid JSON and empty speech are not fabricated transcripts', async () => {
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
    const { db, sqlite } = database();
    try {
      const response = await cloudVoiceTranscribe(
        request(),
        environment(db),
        (async () => Response.json(payload)) as typeof fetch,
      );
      assert.equal(response.status, expected);
      assert.doesNotMatch(
        await response.text(),
        /secret detail|test-key|SecretId/,
      );
    } finally {
      sqlite.close();
    }
  }
  const { db, sqlite } = database();
  try {
    assert.equal(
      (
        await cloudVoiceTranscribe(
          request(),
          environment(db),
          (async () => new Response('not json')) as typeof fetch,
        )
      ).status,
      503,
    );
    const result = await cloudVoiceTranscribe(
      request(),
      environment(db),
      success(''),
    );
    assert.equal(
      ((await result.json()) as { transcript: string }).transcript,
      '',
    );
  } finally {
    sqlite.close();
  }
});

void test('durable quotas share global cap across clients and reset next day', async () => {
  const { db, sqlite } = database();
  const now = 1700000000;
  try {
    const results = await Promise.all(
      Array.from({ length: 15 }, (_, i) =>
        reserveVoiceQuota(db, 'fixture-' + i, 'secret', 3, now),
      ),
    );
    assert.equal(results.filter(Boolean).length, 3);
    assert.equal(
      sqlite
        .prepare("SELECT used FROM voice_usage WHERE key = 'global:day'")
        .get()?.used,
      3,
    );
    assert.equal(
      await reserveVoiceQuota(db, 'new-client', 'secret', 3, now + 86400),
      true,
    );
  } finally {
    sqlite.close();
  }
});

void test('per-IP minute cap and database failures fail closed', async () => {
  const { db, sqlite } = database();
  try {
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        reserveVoiceQuota(db, 'same-client', 'secret', 100, 1700000000),
      ),
    );
    assert.equal(results.filter(Boolean).length, 5);
    assert.equal(
      await reserveVoiceQuota(db, 'same-client', 'secret', 100, 1700000060),
      true,
    );
    sqlite.exec('DROP TABLE voice_usage');
    let calls = 0;
    const response = await cloudVoiceTranscribe(
      request(),
      environment(db),
      (async () => {
        calls++;
        return Response.json({});
      }) as typeof fetch,
    );
    assert.equal(response.status, 503);
    assert.equal(calls, 0);
  } finally {
    sqlite.close();
  }
});

void test('cancelled request cannot reach provider', async () => {
  const { db, sqlite } = database();
  try {
    const abort = new AbortController();
    abort.abort();
    const req = new Request(request(), { signal: abort.signal });
    let calls = 0;
    const response = await cloudVoiceTranscribe(
      req,
      environment(db),
      (async () => {
        calls++;
        return Response.json({});
      }) as typeof fetch,
    );
    assert.equal(response.status, 504);
    assert.equal(calls, 0);
  } finally {
    sqlite.close();
  }
});

void test('cancelling in-flight provider call does not return late success', async () => {
  const { db, sqlite } = database();
  const controller = new AbortController();
  let began!: () => void, finish!: (response: Response) => void;
  const ready = new Promise<void>((resolve) => {
    began = resolve;
  });
  try {
    const pending = cloudVoiceTranscribe(
      new Request(request(), { signal: controller.signal }),
      environment(db),
      (() => {
        began();
        return new Promise((resolve) => {
          finish = resolve;
        });
      }) as typeof fetch,
    );
    await ready;
    controller.abort();
    finish(Response.json({ Response: { Result: '迟到的食材' } }));
    const response = await pending;
    assert.equal(response.status, 504);
    assert.doesNotMatch(await response.text(), /迟到的食材/);
  } finally {
    sqlite.close();
  }
});

void test('per-isolate memory guard rejects a third concurrent recording and releases afterwards', async () => {
  const { db, sqlite } = database();
  const finish: ((response: Response) => void)[] = [];
  let ready!: () => void;
  const started = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const send = (() =>
    new Promise<Response>((resolve) => {
      finish.push(resolve);
      if (finish.length === 2) ready();
    })) as typeof fetch;
  try {
    const first = cloudVoiceTranscribe(request(), environment(db), send);
    const second = cloudVoiceTranscribe(request(), environment(db), send);
    await started;
    assert.equal(
      (await cloudVoiceTranscribe(request(), environment(db), send)).status,
      429,
    );
    for (const resolve of finish)
      resolve(Response.json({ Response: { Result: '两个番茄' } }));
    assert.deepEqual(
      (await Promise.all([first, second])).map((response) => response.status),
      [200, 200],
    );
    assert.equal(
      (await cloudVoiceTranscribe(request(), environment(db), success()))
        .status,
      200,
    );
  } finally {
    sqlite.close();
  }
});
