import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { startBridge } from '../skills/zhonghua-shisi/scripts/kitchen-bridge.mjs';
import {
  createLocalSpeech,
  readAudio,
  MAX_AUDIO_BYTES,
} from '../skills/zhonghua-shisi/scripts/local-speech.mjs';

const audioRequest = (content: Buffer, type = 'audio/webm') =>
  Object.assign(Readable.from([content]), {
    headers: { 'content-type': type },
  });
void test('audio upload validates media type, empty and oversized payloads', async () => {
  assert.equal((await readAudio(audioRequest(Buffer.alloc(100)))).length, 100);
  await assert.rejects(
    readAudio(audioRequest(Buffer.alloc(100), 'text/plain')),
    /格式/,
  );
  await assert.rejects(readAudio(audioRequest(Buffer.alloc(0))), /有效录音/);
  await assert.rejects(
    readAudio(audioRequest(Buffer.alloc(MAX_AUDIO_BYTES + 1))),
    /太大/,
  );
});
void test('model not initialized is a clear unavailable result, never a fake transcript', async () => {
  const root = await mkdtemp(join(tmpdir(), 'shisi-no-model-'));
  try {
    const service = createLocalSpeech(root);
    assert.equal((await service.status()).ready, false);
    await assert.rejects(
      service.transcribe(
        audioRequest(Buffer.alloc(100)),
        new AbortController().signal,
      ),
      /尚未准备好/,
    );
    assert.equal((await service.status()).busy, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
void test('same-origin voice request reaches ASR, cross-site and unmarked callers are blocked', async () => {
  const root = await mkdtemp(join(tmpdir(), 'shisi-speech-http-'));
  await writeFile(
    join(root, '中华食肆.html'),
    '<html><head></head><body>fixture</body></html>',
  );
  let calls = 0;
  const speech = {
    status: async () => ({ ready: true, busy: false }),
    transcribe: async (req: Readable & { headers: Record<string, string> }) => {
      await readAudio(req);
      calls++;
      return { transcript: '两个番茄', engine: 'test-fixture' };
    },
  };
  const server = await startBridge({ workspace: root, port: 0, speech });
  const headers = {
    'X-Kitchen-Client': randomUUID(),
    'Content-Type': 'audio/webm',
  };
  try {
    const denied = await fetch(server.origin + '/voice/transcribe', {
      method: 'POST',
      headers: { ...headers, Origin: 'https://unrelated.example' },
      body: Buffer.alloc(100),
    });
    assert.equal(denied.status, 403);
    assert.equal(calls, 0);
    assert.equal((await fetch(server.origin + '/voice/status')).status, 403);
    const response = await fetch(server.origin + '/voice/transcribe', {
      method: 'POST',
      headers,
      body: Buffer.alloc(100),
    });
    assert.equal(response.status, 200);
    assert.equal(calls, 1);
    assert.deepEqual(await response.json(), {
      transcript: '两个番茄',
      engine: 'test-fixture',
    });
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});
