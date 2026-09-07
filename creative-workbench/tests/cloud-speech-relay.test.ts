import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable, PassThrough } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createCloudSpeech,
  VOICE_ORIGIN,
  MAX_WAV_BYTES,
} from '../skills/zhonghua-shisi/scripts/cloud-speech.mjs';
import { startBridge } from '../skills/zhonghua-shisi/scripts/kitchen-bridge.mjs';
import { encodeVoiceWav, validateVoiceWav } from '../lib/voice-audio';

const wav = () => Buffer.from(encodeVoiceWav([new Float32Array(1600)], 16000));
const signal = () => new AbortController().signal;
const request = (bytes = wav(), headers = {}) =>
  Object.assign(Readable.from([bytes]), {
    headers: { 'content-type': 'audio/wav', ...headers },
  });
const success = () =>
  Response.json({
    transcript: '两个番茄',
    engine: 'tencent-cloud-asr',
    ignored: 'not forwarded',
  });

void test('ZIP speech uses only the fixed cloud API and own headers, with no credentials or redirects', async () => {
  let calls = 0;
  const speech = createCloudSpeech({
    fetchImpl: async (url, init) => {
      calls++;
      assert.equal(init?.redirect, 'error');
      assert.equal(init?.credentials, 'omit');
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('origin'), VOICE_ORIGIN);
      assert.equal(headers.get('x-kitchen-voice'), '1');
      if (init?.method === 'GET') {
        assert.equal(url, VOICE_ORIGIN + '/api/voice/status');
        assert.equal([...headers].length, 2);
        return Response.json({
          ready: true,
          engine: 'tencent-cloud-asr',
          private: 'discard',
        });
      }
      assert.equal(url, VOICE_ORIGIN + '/api/voice/transcribe');
      assert.equal(headers.get('content-type'), 'application/json');
      assert.equal([...headers].length, 3);
      const envelope = JSON.parse(init!.body as string);
      assert.deepEqual(Object.keys(envelope), ['audio']);
      const forwarded = Buffer.from(envelope.audio, 'base64');
      assert.deepEqual(forwarded, wav());
      validateVoiceWav(forwarded);
      return success();
    },
  });
  assert.deepEqual(await speech.status(), {
    ready: true,
    busy: false,
    engine: 'tencent-cloud-asr',
    maxSeconds: 60,
  });
  assert.deepEqual(
    await speech.transcribe(
      request(wav(), {
        cookie: 'never-forward',
        authorization: 'never-forward',
        'cf-connecting-ip': 'fake',
        'x-forwarded-for': 'fake',
        origin: 'https://attacker.invalid',
      }),
      signal(),
    ),
    { transcript: '两个番茄', engine: 'tencent-cloud-asr' },
  );
  assert.equal(calls, 2);
});

void test('ZIP rejects unsupported, malformed or oversized audio without network calls', async () => {
  const speech = createCloudSpeech({
    fetchImpl: async () => {
      assert.fail('must not contact API');
    },
  });
  await assert.rejects(
    speech.transcribe(
      request(wav(), { 'content-type': 'audio/webm' }),
      signal(),
    ),
    { status: 415 },
  );
  await assert.rejects(
    speech.transcribe(
      request(wav(), { 'content-length': String(MAX_WAV_BYTES + 1) }),
      signal(),
    ),
    { status: 413 },
  );
  await assert.rejects(
    speech.transcribe(request(Buffer.alloc(MAX_WAV_BYTES + 1)), signal()),
    { status: 413 },
  );
  for (const bytes of [
    Buffer.alloc(0),
    Buffer.alloc(44),
    Buffer.alloc(80),
    wav().subarray(0, 51),
  ])
    await assert.rejects(speech.transcribe(request(bytes), signal()), {
      status: 400,
    });
  const stereo = wav();
  stereo.writeUInt16LE(2, 22);
  await assert.rejects(speech.transcribe(request(stereo), signal()), {
    status: 400,
  });
});

void test('ZIP keeps meaningful status codes, sanitizes upstream errors and never retries', async () => {
  for (const status of [400, 403, 413, 415, 422, 429, 503, 504, 500, 302]) {
    let calls = 0;
    const speech = createCloudSpeech({
      fetchImpl: async () => {
        calls++;
        return new Response('private-upstream-diagnostic', { status });
      },
    });
    await assert.rejects(
      speech.transcribe(request(), signal()),
      (e: unknown) => {
        assert.equal(
          (e as Error & { status: number }).status,
          [500, 302].includes(status) ? 502 : status,
        );
        assert.doesNotMatch((e as Error).message, /private-upstream/);
        return true;
      },
    );
    assert.equal(calls, 1);
  }
});

void test('ZIP distinguishes an HTML access-layer refusal from an API 403 without reading error bodies', async () => {
  for (const example of [
    {
      type: 'text/html; charset=UTF-8',
      server: 'cloudflare',
      ray: 'a3725f3b9b0f5cfd-LAX',
      edge: true,
      reference: true,
    },
    {
      type: 'application/json',
      server: 'cloudflare',
      ray: 'a3725f3b9b0f5cfd-LAX',
      edge: false,
      reference: false,
    },
    {
      type: 'text/html',
      server: 'other',
      ray: 'a3725f3b9b0f5cfd-LAX',
      edge: false,
      reference: false,
    },
    {
      type: 'TEXT/HTML',
      server: 'Cloudflare',
      ray: 'a3725f3b9b0f5cfd',
      edge: true,
      reference: true,
    },
    {
      type: 'text/html',
      server: 'cloudflare',
      ray: 'private-arbitrary-header',
      edge: true,
      reference: false,
    },
    {
      type: 'text/html',
      server: 'cloudflare',
      ray: 'a'.repeat(1024),
      edge: true,
      reference: false,
    },
    {
      type: 'text/html',
      server: 'cloudflare',
      ray: '',
      edge: true,
      reference: false,
    },
  ]) {
    let calls = 0;
    let cancelled = false;
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('private-response-body'));
        },
        cancel() {
          cancelled = true;
        },
      }),
      {
        status: 403,
        headers: {
          'content-type': example.type,
          server: example.server,
          'cf-ray': example.ray,
        },
      },
    );
    response.body!.getReader = () =>
      assert.fail('must not read the error body');
    const speech = createCloudSpeech({
      fetchImpl: async () => {
        calls++;
        return response;
      },
    });
    await assert.rejects(speech.status(), (error: unknown) => {
      const e = error as Error & { status: number };
      assert.equal(e.status, 403);
      assert.equal(e.message.includes('网站访问层'), example.edge);
      assert.equal(e.message.includes('请求编号'), example.reference);
      if (example.reference) assert.ok(e.message.includes(example.ray));
      assert.doesNotMatch(
        e.message,
        /private-response-body|private-arbitrary-header|a{100}/,
      );
      return true;
    });
    assert.equal(
      calls,
      1,
      'a refusal must not trigger retries or a route change',
    );
    assert.equal(cancelled, true);
  }
});

void test('ZIP rejects invalid or excessive API output and requires the cloud engine', async () => {
  for (const response of [
    new Response('<html>not API</html>'),
    new Response('x'.repeat(64001)),
    Response.json({
      transcript: 'x'.repeat(10001),
      engine: 'tencent-cloud-asr',
    }),
    Response.json({ transcript: 'fake', engine: 'whisper-base-local' }),
    Response.json(null),
  ]) {
    const speech = createCloudSpeech({ fetchImpl: async () => response });
    await assert.rejects(speech.transcribe(request(), signal()), {
      status: 502,
    });
  }
  const notReady = createCloudSpeech({
    fetchImpl: async () =>
      Response.json({ ready: false, engine: 'tencent-cloud-asr' }),
  });
  assert.equal((await notReady.status()).ready, false);
});

void test('ZIP serializes transcription, discards late results after cancellation, and releases busy', async () => {
  let release!: (response: Response) => void;
  let started!: () => void;
  const began = new Promise<void>((resolve) => {
    started = resolve;
  });
  const speech = createCloudSpeech({
    fetchImpl: async () => {
      started();
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    },
  });
  const controller = new AbortController();
  const pending = speech.transcribe(request(), controller.signal);
  await began;
  await assert.rejects(speech.transcribe(request(), signal()), { status: 429 });
  controller.abort();
  release(success());
  await assert.rejects(pending, { status: 499 });
  const second = speech.transcribe(request(), signal());
  // Wait for the resumed stream to reach the injected upstream.
  await new Promise<void>((resolve) => setImmediate(resolve));
  release(success());
  assert.equal((await second).transcript, '两个番茄');
});

void test('cancellation interrupts an unfinished local audio upload without contacting cloud', async () => {
  const speech = createCloudSpeech({
    fetchImpl: async () => {
      assert.fail('no API before complete audio');
    },
  });
  const stream = Object.assign(new PassThrough(), {
    headers: { 'content-type': 'audio/wav' },
  });
  const controller = new AbortController();
  const pending = speech.transcribe(stream, controller.signal);
  stream.write(wav().subarray(0, 44));
  controller.abort();
  await assert.rejects(pending, { status: 499 });
  assert.equal(stream.destroyed, true);
});

void test('local HTTP guards prevent cloud calls; closing bridge cancels a status check', async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), 'shisi-cloud-relay-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  await writeFile(
    join(workspace, '中华食肆.html'),
    '<html><head></head><body>fixture</body></html>',
  );
  let calls = 0,
    cancelled = false;
  let began!: () => void;
  const started = new Promise<void>((resolve) => {
    began = resolve;
  });
  const speech = createCloudSpeech({
    fetchImpl: async (_url, init) => {
      calls++;
      began();
      return new Promise<Response>((_resolve, reject) => {
        init!.signal!.addEventListener(
          'abort',
          () => {
            cancelled = true;
            reject(init!.signal!.reason);
          },
          { once: true },
        );
      });
    },
  });
  const bridge = await startBridge({ workspace, port: 0, speech });
  t.after(() => bridge.close());
  assert.equal((await fetch(bridge.origin + '/voice/status')).status, 403);
  assert.equal(
    (
      await fetch(bridge.origin + '/voice/status', {
        headers: {
          'X-Kitchen-Client': randomUUID(),
          Origin: 'https://another.invalid',
        },
      })
    ).status,
    403,
  );
  assert.equal(calls, 0);
  const pending = fetch(bridge.origin + '/voice/status', {
    headers: { 'X-Kitchen-Client': randomUUID() },
  }).catch(() => null);
  await started;
  await bridge.close();
  await pending;
  assert.equal(cancelled, true);
  assert.equal(calls, 1);
});
