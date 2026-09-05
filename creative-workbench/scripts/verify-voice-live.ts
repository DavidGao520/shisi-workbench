// Real local model + synthetic speech fixture + HTTP + fake IndexedDB.
// Does not access the user's microphone, live inventory or WorkBuddy account.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import { startBridge } from '../skills/zhonghua-shisi/scripts/kitchen-bridge.mjs';
import { createLocalSpeech } from '../skills/zhonghua-shisi/scripts/local-speech.mjs';
import { prepareVoiceDraft, confirmVoiceDraft } from '../lib/voice-intake';
import { IndexedDbStore } from '../lib/store';

const run = promisify(execFile);
const workspace = await mkdtemp(join(tmpdir(), 'shisi-voice-live-'));
let server: Awaited<ReturnType<typeof startBridge>> | undefined;
const store = new IndexedDbStore('synthetic-voice-test', new IDBFactory());
try {
  await writeFile(
    join(workspace, '中华食肆.html'),
    '<html><head></head><body>test fixture</body></html>',
  );
  await run('/usr/bin/say', [
    '-v',
    'Tingting',
    '-r',
    '150',
    '-o',
    join(workspace, 'speech.aiff'),
    '冰箱里有两个番茄，一盒鸡蛋，还有半斤猪肉。',
  ]);
  await run('/usr/bin/afconvert', [
    '-f',
    'WAVE',
    '-d',
    'LEI16@16000',
    '-c',
    '1',
    join(workspace, 'speech.aiff'),
    join(workspace, 'speech.wav'),
  ]);
  server = await startBridge({
    workspace,
    port: 0,
    speech: createLocalSpeech(resolve('release')),
  });
  const began = Date.now();
  const response = await fetch(server.origin + '/voice/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'audio/wav', 'X-Kitchen-Client': randomUUID() },
    body: await readFile(join(workspace, 'speech.wav')),
    signal: AbortSignal.timeout(120000),
  });
  const result = (await response.json()) as {
    transcript: string;
    engine: string;
  };
  console.log(
    JSON.stringify({
      status: response.status,
      milliseconds: Date.now() - began,
      ...result,
    }),
  );
  assert.equal(response.status, 200);
  const draft = prepareVoiceDraft(
    result.transcript,
    await store.read('real'),
    'stocktake',
  );
  assert.deepEqual(
    draft.rows.map((r) => [r.name, r.amount, r.unit]),
    [
      ['番茄', '2', '个'],
      ['鸡蛋', '1', '盒'],
      ['猪肉', '250', '克'],
    ],
  );
  assert.equal((await store.read('real')).inventory.length, 0);
  await store.change('real', (s) => confirmVoiceDraft(s, 'real', draft.rows));
  store.close();
  const saved = await store.read('real');
  assert.equal(saved.inventory.length, 3);
  assert.deepEqual(
    saved.inventory.map((b) => b.amount),
    [2, 1, 250],
  );
  // Exercise the two compressed formats MediaRecorder normally emits.
  await run(resolve('release/.kitchen-voice/venv/bin/python'), [
    '-c',
    'import av,sys\nfor suffix,fmt,codec in [("webm","webm","libopus"),("mp4","mp4","aac")]:\n with av.open(sys.argv[1]) as src, av.open(sys.argv[2]+"/speech."+suffix,"w",format=fmt) as dst:\n  stream=dst.add_stream(codec,rate=48000)\n  stream.layout="mono"\n  for frame in src.decode(audio=0):\n   for packet in stream.encode(frame): dst.mux(packet)\n  for packet in stream.encode(None): dst.mux(packet)',
    join(workspace, 'speech.wav'),
    workspace,
  ]);
  for (const format of ['webm', 'mp4']) {
    const formatResponse: Response = await fetch(server.origin + '/voice/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'audio/' + format,
        'X-Kitchen-Client': randomUUID(),
      },
      body: await readFile(join(workspace, 'speech.' + format)),
      signal: AbortSignal.timeout(120000),
    });
    const result = (await formatResponse.json()) as { transcript: string };
    assert.equal(formatResponse.status, 200);
    const parsed = prepareVoiceDraft(
      result.transcript,
      await store.read('demo'),
      'stocktake',
    );
    assert.deepEqual(
      parsed.rows.map((r) => r.amount),
      ['2', '1', '250'],
    );
    console.log('PASS: real ASR decoded ' + format + ' audio.');
  }
  const invalid = await fetch(server.origin + '/voice/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'audio/webm', 'X-Kitchen-Client': randomUUID() },
    body: Buffer.alloc(100),
  });
  assert.equal(invalid.status, 400);
  console.log(
    'PASS: real AI transcription → ingredient preview → explicit confirmation → database close/reopen; 3 batches. Synthetic voice, not live microphone acceptance.',
  );
} finally {
  store.close();
  await server?.close();
  await rm(workspace, { recursive: true, force: true });
}
