import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { IDBFactory } from 'fake-indexeddb';
import {
  cloudPhotoRecognize,
  cloudPhotoStatus,
  type PhotoEnvironment,
} from '../lib/server/cloud-photo';
import {
  recognizeTencentPhoto,
  PHOTO_MODEL,
} from '../lib/server/tencent-photo';
import { reservePhotoQuota } from '../lib/server/photo-quota';
import {
  reserveVoiceQuota,
  type VoiceDatabase,
} from '../lib/server/voice-quota';
import { MAX_PHOTO_BYTES, validatePhotoJpeg } from '../lib/photo-image';
import {
  parsePhotoIngredients,
  stagePhotoDraft,
  type PhotoDraft,
} from '../lib/photo-intake';
import { photoServiceForPage, recognizePhoto } from '../lib/photo-service';
import { IndexedDbStore } from '../lib/store';
import { emptyState, type KitchenState, type Mode } from '../lib/kitchen';
import {
  candidateReview,
  confirmReviewedCandidate,
} from '../lib/candidate-review';

// Header-only structural fixture, not an image-recognition/real-camera acceptance test.
const jpeg = () =>
  Uint8Array.from([
    0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0, 10, 0, 10, 3, 1, 0x11, 0, 2, 0x11, 0,
    3, 0x11, 0, 0xff, 0xda, 0, 8, 1, 1, 0, 0, 0, 0, 0xff, 0xd9,
  ]);
function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url))
    .filter((x) => x.endsWith('.sql'))
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
  return { db, sqlite };
}
const origin = 'https://kitchen.example';
function request(
  bytes = jpeg(),
  headers: Record<string, string> = {},
  signal?: AbortSignal,
) {
  return new Request(origin + '/api/photo/recognize', {
    method: 'POST',
    signal,
    headers: {
      Origin: origin,
      'X-Kitchen-Photo': '1',
      'Content-Type': 'image/jpeg',
      'cf-connecting-ip': '192.0.2.1',
      ...headers,
    },
    body: bytes,
  });
}
const env = (db: VoiceDatabase): PhotoEnvironment => ({
  TOKENHUB_API_KEY: 'fixture-token',
  KITCHEN_PHOTO_ENABLED: '1',
  VOICE_LIMITS: db,
});
const result = (
  candidates: unknown = [{ displayName: '鸡蛋', amount: 2, unit: '个' }],
) =>
  Response.json({
    choices: [
      {
        finish_reason: 'stop',
        message: { content: JSON.stringify({ candidates }) },
      },
    ],
  });
function stageEggs(
  state: KitchenState,
  mode: Mode = 'stocktake',
  amount: number | null = 4,
) {
  const draft: PhotoDraft = {
    requestId: crypto.randomUUID(),
    dataset: state.dataset,
    mode,
    candidates: [
      {
        displayName: '鸡蛋',
        ...(amount === null ? {} : { amount, unit: '个' }),
      },
    ],
  };
  stagePhotoDraft(state, draft);
  return state.candidates.at(-1)!;
}

void test('photo routing preserves only the exact local bridge and hosted pages select cloud', () => {
  assert.equal(photoServiceForPage('https://kitchen.example', false), 'cloud');
  assert.equal(photoServiceForPage('http://127.0.0.1:43117', true), 'local');
  assert.equal(photoServiceForPage('http://127.0.0.1:43117', false), 'cloud');
  assert.equal(photoServiceForPage('null', false), 'unavailable');
});

void test('photo aliases cannot create duplicate batches from one model result', () => {
  assert.throws(
    () =>
      parsePhotoIngredients({
        candidates: [
          { displayName: '西红柿', amount: 2, unit: '个' },
          { displayName: '番茄', amount: 3, unit: '个' },
        ],
      }),
    /重复/,
  );
  assert.equal(
    parsePhotoIngredients({
      candidates: [
        { displayName: '紫色胡萝卜' },
        { displayName: '黄色胡萝卜' },
      ],
    }).length,
    2,
  );
});
void test('photo validation rejects oversized, non-JPEG, missing frame and huge dimensions', () => {
  assert.deepEqual(validatePhotoJpeg(jpeg()), { width: 10, height: 10 });
  for (const b of [
    new Uint8Array(MAX_PHOTO_BYTES + 1),
    new TextEncoder().encode('<svg>not a photo</svg>'),
    jpeg().slice(0, -2),
  ])
    assert.throws(() => validatePhotoJpeg(b));
  const big = jpeg();
  big[9] = 0x40;
  assert.throws(() => validatePhotoJpeg(big));
  const broken = jpeg();
  broken[4] = 255;
  assert.throws(() => validatePhotoJpeg(broken));
});
void test('photo gateway rejects missing configuration, wrong origin and malformed images before model calls', async () => {
  const { db, sqlite } = database();
  let calls = 0;
  const send = (async () => {
    calls++;
    return result();
  }) as typeof fetch;
  try {
    assert.equal(
      ((await cloudPhotoStatus({}).json()) as { ready: boolean }).ready,
      false,
    );
    assert.equal((await cloudPhotoRecognize(request(), {}, send)).status, 503);
    const wrongHeaders: Record<string, string>[] = [
      { Origin: 'https://other.example' },
      { 'X-Kitchen-Photo': '' },
      { 'sec-fetch-site': 'cross-site' },
    ];
    for (const headers of wrongHeaders)
      assert.equal(
        (await cloudPhotoRecognize(request(jpeg(), headers), env(db), send))
          .status,
        403,
      );
    assert.equal(
      (
        await cloudPhotoRecognize(
          request(jpeg(), { 'cf-connecting-ip': '' }),
          env(db),
          send,
        )
      ).status,
      503,
    );
    assert.equal(
      (
        await cloudPhotoRecognize(
          request(jpeg(), { 'Content-Type': 'text/plain' }),
          env(db),
          send,
        )
      ).status,
      415,
    );
    assert.equal(
      (
        await cloudPhotoRecognize(
          request(new Uint8Array(MAX_PHOTO_BYTES + 1)),
          env(db),
          send,
        )
      ).status,
      413,
    );
    assert.equal(
      (await cloudPhotoRecognize(request(new Uint8Array(20)), env(db), send))
        .status,
      422,
    );
    assert.equal(
      (
        await cloudPhotoRecognize(
          request(),
          { ...env(db), KITCHEN_PHOTO_DAILY_LIMIT: '0' },
          send,
        )
      ).status,
      503,
    );
    assert.equal(calls, 0);
    assert.equal(
      sqlite.prepare('SELECT count(*) AS count FROM photo_usage').get()?.count,
      0,
    );
  } finally {
    sqlite.close();
  }
});
void test('photo model call is fixed, bounded and does not forward client routing or permit image URLs', async () => {
  const { db, sqlite } = database();
  try {
    const send = (async (url, init) => {
      assert.equal(url, 'https://tokenhub.tencentmaas.com/v1/chat/completions');
      assert.equal(init?.redirect, 'error');
      assert.equal(
        new Headers(init?.headers).get('Authorization'),
        'Bearer fixture-token',
      );
      assert.equal(typeof init?.body, 'string');
      const body = JSON.parse(init?.body as string);
      assert.equal(body.model, PHOTO_MODEL);
      assert.equal(body.stream, false);
      assert.equal(body.max_tokens, 2048);
      assert.match(
        body.messages[0].content[1].image_url.url,
        /^data:image\/jpeg;base64,/,
      );
      return result([
        {
          displayName: '鸡蛋',
          amount: 2,
          unit: '个',
          expiryDate: '2099-01-01',
          canonicalIngredientId: 'beef',
          confirmed: true,
          stocktakeTarget: { id: 'victim' },
          dataset: 'demo',
        },
      ]);
    }) as typeof fetch;
    const response = await cloudPhotoRecognize(request(), env(db), send);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      candidates: [{ displayName: '鸡蛋', amount: 2, unit: '个' }],
    });
  } finally {
    sqlite.close();
  }
});
void test('uncertain quantities remain unknown; no model mass/volume, dates, IDs or instructions become writes', () => {
  assert.deepEqual(
    parsePhotoIngredients({
      candidates: [
        {
          displayName: '鸡肉',
          amount: 400,
          unit: '克',
          expiryDate: '2099-01-01',
        },
      ],
    }),
    [{ displayName: '鸡肉' }],
  );
  assert.deepEqual(
    parsePhotoIngredients({
      candidates: [{ displayName: '食用油', amount: 100, unit: '毫升' }],
    }),
    [{ displayName: '食用油' }],
  );
  assert.deepEqual(
    parsePhotoIngredients({
      candidates: [{ displayName: '鸡蛋', amount: 0, unit: '个' }],
    }),
    [{ displayName: '鸡蛋' }],
  );
  assert.deepEqual(parsePhotoIngredients({ candidates: [] }), []);
  for (const input of [
    null,
    { candidates: 'bad' },
    { candidates: [{ displayName: '<script>' }] },
    { candidates: Array.from({ length: 41 }, () => ({ displayName: '鸡蛋' })) },
    { candidates: [{ displayName: '鸡蛋' }, { displayName: '鸡蛋' }] },
  ])
    assert.throws(() => parsePhotoIngredients(input));
});
void test('provider failures and unfinished/malformed content never invent food or leak secrets', async () => {
  const { db, sqlite } = database();
  try {
    for (const [providerStatus, expected] of [
      [401, 503],
      [403, 503],
      [402, 503],
      [429, 429],
      [500, 502],
    ]) {
      const response = await cloudPhotoRecognize(
        request(jpeg(), { 'cf-connecting-ip': String(providerStatus) }),
        env(db),
        (async () =>
          new Response('fixture-token private-provider-details', {
            status: providerStatus,
          })) as typeof fetch,
      );
      assert.equal(response.status, expected);
      assert.doesNotMatch(
        await response.text(),
        /fixture-token|private-provider/,
      );
    }
    for (const value of [
      { error: { message: 'fixture-token' } },
      {
        choices: [
          {
            finish_reason: 'length',
            message: { content: '{"candidates":[]}' },
          },
        ],
      },
      {
        choices: [{ finish_reason: 'stop', message: { content: 'not JSON' } }],
      },
    ]) {
      await assert.rejects(
        () =>
          recognizeTencentPhoto(
            jpeg(),
            'fixture-token',
            new AbortController().signal,
            (async () => Response.json(value)) as typeof fetch,
          ),
        /照片/,
      );
    }
    assert.deepEqual(
      await recognizeTencentPhoto(
        jpeg(),
        'fixture-token',
        new AbortController().signal,
        (async () => result([])) as typeof fetch,
      ),
      [],
    );
  } finally {
    sqlite.close();
  }
});
void test('photo budget is durable, shared globally, separate from speech and fails closed without schema', async () => {
  const { db, sqlite } = database();
  try {
    assert.equal(await reservePhotoQuota(db, 'ip-one', 'key', 2, 172800), true);
    assert.equal(await reservePhotoQuota(db, 'ip-two', 'key', 2, 172800), true);
    assert.equal(
      await reservePhotoQuota(db, 'ip-three', 'key', 2, 172800),
      false,
    );
    assert.equal(
      await reserveVoiceQuota(db, 'ip-three', 'key', 2, 172800),
      true,
    );
    assert.equal(await reservePhotoQuota(db, 'ip-one', 'key', 2, 259200), true);
    const rows = sqlite.prepare('SELECT key FROM photo_usage').all();
    assert.doesNotMatch(JSON.stringify(rows), /ip-one|ip-two|ip-three/);
    sqlite.exec('DROP TABLE photo_usage');
    let calls = 0;
    const response = await cloudPhotoRecognize(
      request(),
      env(db),
      (async () => {
        calls++;
        return result();
      }) as typeof fetch,
    );
    assert.equal(response.status, 503);
    assert.equal(calls, 0);
  } finally {
    sqlite.close();
  }
});
void test('photo per-IP caps persist and provider failures still consume the photo budget', async () => {
  const { db, sqlite } = database();
  try {
    for (let n = 0; n < 5; n++)
      assert.equal(
        await reservePhotoQuota(db, 'same-ip', 'key', 100, 172800),
        true,
      );
    assert.equal(
      await reservePhotoQuota(db, 'same-ip', 'key', 100, 172800),
      false,
    );
    for (let n = 0; n < 25; n++)
      assert.equal(
        await reservePhotoQuota(db, 'same-ip', 'key', 100, 172860 + 60 * n),
        true,
      );
    assert.equal(
      await reservePhotoQuota(db, 'same-ip', 'key', 100, 180000),
      false,
    );
    const response = await cloudPhotoRecognize(
      request(),
      { ...env(db), KITCHEN_PHOTO_DAILY_LIMIT: '1' },
      (async () => new Response('', { status: 500 })) as typeof fetch,
    );
    assert.equal(response.status, 502);
    let calls = 0;
    const next = await cloudPhotoRecognize(
      request(jpeg(), { 'cf-connecting-ip': 'new-ip' }),
      { ...env(db), KITCHEN_PHOTO_DAILY_LIMIT: '1' },
      (async () => {
        calls++;
        return result();
      }) as typeof fetch,
    );
    assert.equal(next.status, 429);
    assert.equal(calls, 0);
  } finally {
    sqlite.close();
  }
});
void test('cancellation before and during recognition cannot return successful photo candidates', async () => {
  const { db, sqlite } = database();
  try {
    const abort = new AbortController();
    abort.abort();
    let calls = 0;
    assert.equal(
      (
        await cloudPhotoRecognize(
          request(jpeg(), {}, abort.signal),
          env(db),
          (async () => {
            calls++;
            return result();
          }) as typeof fetch,
        )
      ).status,
      504,
    );
    assert.equal(calls, 0);
    const later = new AbortController();
    const response = await cloudPhotoRecognize(
      request(jpeg(), {}, later.signal),
      env(db),
      (async () => {
        later.abort();
        return result();
      }) as typeof fetch,
    );
    assert.equal(response.status, 504);
    const before = globalThis.fetch;
    try {
      const cancelled = new AbortController();
      globalThis.fetch = (async () => {
        cancelled.abort();
        return Response.json({ candidates: [{ displayName: '鸡蛋' }] });
      }) as typeof fetch;
      await assert.rejects(
        () => recognizePhoto(new Blob([jpeg()]), cancelled.signal),
        /abort/i,
      );
    } finally {
      globalThis.fetch = before;
    }
  } finally {
    sqlite.close();
  }
});
void test('cloud photos stage only pending candidates, survive reopen, and never touch the other kitchen', async () => {
  const factory = new IDBFactory();
  const store = new IndexedDbStore('cloud-photo', factory);
  const draft: PhotoDraft = {
    requestId: 'one-photo',
    dataset: 'real',
    mode: 'stocktake',
    candidates: [{ displayName: '鸡蛋', amount: 2, unit: '个' }],
  };
  await store.change('real', (state) => stagePhotoDraft(state, draft));
  await store.change('real', (state) => stagePhotoDraft(state, draft));
  store.close();
  const reopened = new IndexedDbStore('cloud-photo', factory);
  try {
    const state = await reopened.read('real');
    assert.equal(state.candidates.length, 1);
    assert.equal(state.candidates[0].status, 'pending');
    assert.deepEqual(state.inventory, []);
    assert.deepEqual((await reopened.read('demo')).candidates, []);
    await assert.rejects(
      () => reopened.change('demo', (state) => stagePhotoDraft(state, draft)),
      /厨房/,
    );
    await reopened.change('real', (s) => {
      const c = s.candidates[0];
      confirmReviewedCandidate(s, c.key, candidateReview(s, c), {
        quantity: { amount: 2, unit: '个' },
      });
    });
    assert.equal((await reopened.read('real')).inventory[0].amount, 2);
  } finally {
    reopened.close();
  }
});
void test('photo stocktake retains unknown quantity and expiry, restock creates a separate batch, stale review blocks', () => {
  const state = emptyState('real');
  const first = stageEggs(state);
  confirmReviewedCandidate(state, first.key, candidateReview(state, first), {
    quantity: { amount: 8, unit: '个' },
    expiryDate: '2026-09-01',
  });
  const unknown = stageEggs(state, 'stocktake', null);
  const review = candidateReview(state, unknown);
  assert.deepEqual(review.quantity, {
    amount: 8,
    unit: '个',
    amountBand: undefined,
  });
  assert.equal(review.expiryDate, '2026-09-01');
  const next = stageEggs(state);
  const old = candidateReview(state, next);
  confirmReviewedCandidate(state, next.key, old, {
    quantity: { amount: 4, unit: '个' },
    expiryDate: old.expiryDate,
  });
  assert.equal(state.inventory[0].amount, 4);
  assert.throws(
    () =>
      confirmReviewedCandidate(state, unknown.key, review, {
        quantity: review.quantity,
        expiryDate: review.expiryDate,
      }),
    /库存已变化/,
  );
  const restock = stageEggs(state, 'restock', 2);
  confirmReviewedCandidate(
    state,
    restock.key,
    candidateReview(state, restock),
    { quantity: { amount: 2, unit: '个' } },
  );
  assert.equal(state.inventory.length, 2);
  assert.equal(state.inventory[0].amount, 4);
  assert.match(candidateReview(state, stageEggs(state)).problem, /多份/);
});
void test('cloud photo UI binds lifecycle and context, exposes camera and album, retains local WorkBuddy', () => {
  const source = readFileSync(
    new URL('../components/photo-intake.tsx', import.meta.url),
    'utf8',
  );
  const page = readFileSync(
    new URL('../app/page.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /capture="environment"/);
  assert.match(source, /从相册选择/);
  assert.match(source, /version !== generation.current/);
  assert.match(source, /current.current.mode !== next.mode/);
  assert.match(source, /current.current.dataset !== next.dataset/);
  assert.match(source, /signal.throwIfAborted\(\)/);
  assert.match(source, /stagePhotoDraft\(latest, next\)/);
  assert.doesNotMatch(source, /confirmCandidate|confirmReviewedCandidate/);
  assert.match(page, /photoService !== 'local'/);
  assert.match(page, /<PhotoIntake[\s\S]*?key=\{dataset \+ ':' \+ mode\}/);
  assert.match(page, /准备接收照片识别/);
});
