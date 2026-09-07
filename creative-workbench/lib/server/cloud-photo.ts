import { MAX_PHOTO_BYTES, validatePhotoJpeg } from '../photo-image';
import {
  PhotoServiceError,
  recognizeTencentPhoto,
  PHOTO_MODEL,
} from './tencent-photo';
import { reservePhotoQuota } from './photo-quota';
import type { VoiceDatabase } from './voice-quota';

export type PhotoEnvironment = {
  TOKENHUB_API_KEY?: string;
  KITCHEN_PHOTO_ENABLED?: string;
  KITCHEN_PHOTO_DAILY_LIMIT?: string;
  VOICE_LIMITS?: VoiceDatabase;
};
let activeRequests = 0;
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
const configured = (env: PhotoEnvironment) =>
  env.KITCHEN_PHOTO_ENABLED === '1' &&
  !!env.TOKENHUB_API_KEY?.trim() &&
  !!env.VOICE_LIMITS;
export function cloudPhotoStatus(env: PhotoEnvironment) {
  return json({
    ready: configured(env),
    engine: 'tencent-tokenhub',
    model: PHOTO_MODEL,
  });
}

async function readPhoto(request: Request, signal: AbortSignal) {
  const declared = request.headers.get('content-length');
  if (
    declared &&
    (!/^\d+$/.test(declared) || Number(declared) > MAX_PHOTO_BYTES)
  )
    throw new PhotoServiceError('照片太大，请重新选择。', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new PhotoServiceError('没有收到照片，请重新选择。', 400);
  const chunks: Uint8Array[] = [];
  let length = 0;
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      length += value.length;
      if (length > MAX_PHOTO_BYTES)
        throw new PhotoServiceError('照片太大，请重新选择。', 413);
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    validatePhotoJpeg(bytes);
  } catch (error) {
    throw new PhotoServiceError((error as Error).message, 422);
  }
  return bytes;
}

export async function cloudPhotoRecognize(
  request: Request,
  env: PhotoEnvironment,
  send: typeof fetch = fetch,
) {
  const url = new URL(request.url);
  if (request.method !== 'POST') return json({ error: '不支持此请求。' }, 405);
  if (
    request.headers.get('origin') !== url.origin ||
    request.headers.get('X-Kitchen-Photo') !== '1' ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    return json({ error: '请从工作台选择照片。' }, 403);
  if (!configured(env))
    return json({ error: '照片识别暂未开通，可以先用语音或手动录入。' }, 503);
  if (
    request.headers.get('content-type')?.split(';')[0].trim() !== 'image/jpeg'
  )
    return json({ error: '照片格式不正确，请重新选择。' }, 415);
  const ip =
    request.headers.get('cf-connecting-ip') ||
    (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      ? 'local-development'
      : '');
  if (!ip) return json({ error: '照片识别暂时无法连接，请稍后重试。' }, 503);
  const limit = Number(env.KITCHEN_PHOTO_DAILY_LIMIT || '100');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
    return json({ error: '照片识别服务配置尚未就绪。' }, 503);
  if (activeRequests >= 2)
    return json({ error: '照片识别暂时繁忙，请稍后重试。' }, 429);
  activeRequests++;
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener('abort', abort, { once: true });
  if (request.signal.aborted) abort();
  let timeout = setTimeout(abort, 10000);
  try {
    const bytes = await readPhoto(request, controller.signal);
    clearTimeout(timeout);
    timeout = setTimeout(abort, 45000);
    controller.signal.throwIfAborted();
    const allowed = await reservePhotoQuota(
      env.VOICE_LIMITS!,
      ip,
      env.TOKENHUB_API_KEY!,
      limit,
    );
    controller.signal.throwIfAborted();
    if (!allowed)
      return json(
        { error: '照片识别次数已达上限，请稍后重试，或用语音和手动录入。' },
        429,
      );
    const candidates = await recognizeTencentPhoto(
      bytes,
      env.TOKENHUB_API_KEY!,
      controller.signal,
      send,
    );
    controller.signal.throwIfAborted();
    return json({ candidates });
  } catch (error) {
    if (controller.signal.aborted)
      return json({ error: '识别超时或已取消，请重试。' }, 504);
    if (error instanceof PhotoServiceError)
      return json({ error: error.message }, error.status);
    // Never log or expose images, model payloads, credentials or inventory.
    return json({ error: '照片识别暂时不可用，请稍后重试或手动录入。' }, 503);
  } finally {
    activeRequests--;
    clearTimeout(timeout);
    request.signal.removeEventListener('abort', abort);
  }
}
