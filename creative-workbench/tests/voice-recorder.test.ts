import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceRecorder, microphoneError } from '../lib/voice-recorder';

function fixture() {
  let stopped = 0,
    started = 0,
    audioCount = 0;
  const errors: string[] = [];
  const instances: FakeRecorder[] = [];
  const stream = {
    getTracks: () => [{ stop: () => stopped++ }],
  } as unknown as MediaStream;
  class FakeRecorder {
    state = 'inactive';
    mimeType = 'audio/webm';
    ondataavailable?: (event: { data: Blob }) => void;
    onstop?: () => void;
    onerror?: () => void;
    constructor() {
      instances.push(this);
    }
    static isTypeSupported(type: string) {
      return type === 'audio/webm;codecs=opus';
    }
    start() {
      this.state = 'recording';
      started++;
    }
    stop() {
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob(['x'.repeat(100)]) });
      this.onstop?.();
    }
  }
  const callbacks = {
    recording: () => {},
    audio: () => audioCount++,
    error: (e: string) => errors.push(e),
  };
  const make = (getUserMedia = async () => stream, limitMs = 60000) =>
    new VoiceRecorder(
      callbacks,
      { getUserMedia },
      FakeRecorder as unknown as typeof MediaRecorder,
      limitMs,
    );
  return {
    make,
    stream,
    errors,
    get stopped() {
      return stopped;
    },
    get started() {
      return started;
    },
    get audioCount() {
      return audioCount;
    },
    get recorder() {
      return instances[instances.length - 1];
    },
  };
}
void test('record once, finish once, release tracks even with repeated stop event', async () => {
  const f = fixture(),
    controller = f.make();
  await controller.start();
  await controller.start();
  assert.equal(f.started, 1);
  controller.stop();
  f.recorder.onstop?.();
  assert.equal(f.audioCount, 1);
  assert.equal(f.stopped, 1);
});
void test('cancel during pending permission never starts a recorder or retains microphone', async () => {
  const f = fixture();
  let grant!: (value: MediaStream) => void;
  const c = f.make(
    () =>
      new Promise((resolve) => {
        grant = resolve;
      }),
  );
  const pending = c.start();
  c.cancel();
  grant(f.stream);
  await pending;
  assert.equal(f.started, 0);
  assert.equal(f.stopped, 1);
  assert.equal(f.audioCount, 0);
});
void test('cancel discards recorded audio and late events', async () => {
  const f = fixture(),
    c = f.make();
  await c.start();
  c.cancel();
  f.recorder.onstop?.();
  assert.equal(f.stopped, 1);
  assert.equal(f.audioCount, 0);
});
void test('permission denial produces actionable error and never starts', async () => {
  const f = fixture(),
    c = f.make(async () => {
      throw { name: 'NotAllowedError' };
    });
  await c.start();
  assert.equal(f.started, 0);
  assert.match(f.errors[0], /麦克风权限/);
  assert.match(microphoneError({ name: 'NotFoundError' }), /没有找到/);
});
void test('maximum recording duration stops and releases capture', async () => {
  const f = fixture(),
    c = f.make(undefined, 10);
  await c.start();
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(f.stopped, 1);
  assert.equal(f.audioCount, 1);
});
