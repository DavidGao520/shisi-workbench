import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkVoiceService,
  transcribeVoice,
  voiceServiceForPage,
} from '../lib/voice-service';
import { validateVoiceWav } from '../lib/voice-audio';

void test('public, preview and ZIP origins use cloud; only the local transport differs', () => {
  assert.deepEqual(voiceServiceForPage('https://kitchen.example', false), {
    kind: 'cloud',
    base: '/api/voice',
  });
  assert.equal(
    voiceServiceForPage('http://localhost:5173', false).kind,
    'cloud',
  );
  assert.deepEqual(voiceServiceForPage('http://127.0.0.1:43117', true), {
    kind: 'cloud',
    base: '/voice',
  });
  assert.equal(
    voiceServiceForPage('http://127.0.0.1:43117', false).base,
    '/api/voice',
  );
  assert.throws(() => voiceServiceForPage('null', false), /HTTPS/);
});

void test('cloud service checks failures and normalizes both Chrome and Safari containers before upload', async () => {
  const originalFetch = globalThis.fetch;
  const originalOffline = globalThis.OfflineAudioContext;
  let uploads = 0;
  let base = '/api/voice';
  try {
    globalThis.OfflineAudioContext = class {
      async decodeAudioData() {
        return {
          numberOfChannels: 1,
          sampleRate: 16000,
          getChannelData: () => new Float32Array(1600),
        };
      }
    } as unknown as typeof OfflineAudioContext;
    globalThis.fetch = (async (url, init) => {
      assert.equal(url, base + '/transcribe');
      assert.ok(init);
      assert.equal(
        (init.headers as Record<string, string>)['Content-Type'],
        'audio/wav',
      );
      validateVoiceWav(new Uint8Array(await (init.body as Blob).arrayBuffer()));
      uploads++;
      return Response.json({ transcript: '两个番茄' });
    }) as typeof fetch;
    for (base of ['/api/voice', '/voice']) {
      for (const type of ['audio/webm;codecs=opus', 'audio/mp4']) {
        assert.equal(
          await transcribeVoice(
            { kind: 'cloud', base },
            new Blob(['container fixture'], { type }),
            'client',
            new AbortController().signal,
          ),
          '两个番茄',
        );
      }
    }
    assert.equal(uploads, 4);
    globalThis.fetch = (async () =>
      Response.json({ ready: false })) as typeof fetch;
    await assert.rejects(
      checkVoiceService(
        { kind: 'cloud', base: '/api/voice' },
        'client',
        new AbortController().signal,
      ),
      /尚未开通/,
    );
    globalThis.fetch = (async () =>
      new Response('<html>not api</html>')) as typeof fetch;
    await assert.rejects(
      checkVoiceService(
        { kind: 'cloud', base: '/api/voice' },
        'client',
        new AbortController().signal,
      ),
      /暂时无法连接/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.OfflineAudioContext = originalOffline;
  }
});

void test('cancelled upload ignores a late successful transcription even if transport ignores abort', async () => {
  const originalFetch = globalThis.fetch;
  const originalOffline = globalThis.OfflineAudioContext;
  let release!: (response: Response) => void;
  let began!: () => void;
  const started = new Promise<void>((resolve) => {
    began = resolve;
  });
  try {
    globalThis.OfflineAudioContext = class {
      async decodeAudioData() {
        return {
          numberOfChannels: 1,
          sampleRate: 16000,
          getChannelData: () => new Float32Array(100),
        };
      }
    } as unknown as typeof OfflineAudioContext;
    globalThis.fetch = (() =>
      new Promise((resolve) => {
        release = resolve;
        began();
      })) as typeof fetch;
    const controller = new AbortController();
    const pending = transcribeVoice(
      { kind: 'cloud', base: '/voice' },
      new Blob(['fixture']),
      'client',
      controller.signal,
    );
    await started;
    controller.abort();
    release(Response.json({ transcript: '迟到的食材' }));
    await assert.rejects(pending, { name: 'AbortError' });
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.OfflineAudioContext = originalOffline;
  }
});

void test('cancelling while decoding drops the late audio without upload', async () => {
  const originalFetch = globalThis.fetch;
  const originalOffline = globalThis.OfflineAudioContext;
  let release!: (audio: unknown) => void,
    began!: () => void,
    uploads = 0;
  const ready = new Promise<void>((resolve) => {
    began = resolve;
  });
  try {
    globalThis.OfflineAudioContext = class {
      decodeAudioData() {
        began();
        return new Promise((resolve) => {
          release = resolve;
        });
      }
    } as unknown as typeof OfflineAudioContext;
    globalThis.fetch = (async () => {
      uploads++;
      return Response.json({ transcript: 'late' });
    }) as typeof fetch;
    const controller = new AbortController();
    const pending = transcribeVoice(
      { kind: 'cloud', base: '/api/voice' },
      new Blob(['fixture']),
      'client',
      controller.signal,
    );
    await ready;
    controller.abort();
    release({
      numberOfChannels: 1,
      sampleRate: 16000,
      getChannelData: () => new Float32Array(100),
    });
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(uploads, 0);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.OfflineAudioContext = originalOffline;
  }
});
