import { MAX_WAV_BYTES, validateVoiceWav } from '../voice-audio';
import { recognizeTencentSpeech, SpeechServiceError } from './tencent-speech';
import { reserveVoiceQuota, type VoiceDatabase } from './voice-quota';

export type VoiceEnvironment = {
  TENCENT_SECRET_ID?: string;
  TENCENT_SECRET_KEY?: string;
  TENCENT_SESSION_TOKEN?: string;
  KITCHEN_VOICE_ENABLED?: string;
  KITCHEN_VOICE_DAILY_LIMIT?: string;
  VOICE_LIMITS?: VoiceDatabase;
};
// A memory guard, not a billing limit. Billing limits are shared through D1.
let activeRequests = 0;
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
function configured(env: VoiceEnvironment) {
  return (
    env.KITCHEN_VOICE_ENABLED === '1' &&
    !!env.TENCENT_SECRET_ID?.trim() &&
    !!env.TENCENT_SECRET_KEY?.trim() &&
    !!env.VOICE_LIMITS
  );
}
export function cloudVoiceStatus(env: VoiceEnvironment) {
  return json({
    ready: configured(env),
    engine: 'tencent-cloud-asr',
    maxSeconds: 60,
  });
}

async function readWav(request: Request, signal: AbortSignal) {
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_WAV_BYTES))
    throw new SpeechServiceError('录音太大，请分成更短的几段。', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new SpeechServiceError('没有收到录音，请重新录制。', 400);
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.length;
      if (size > MAX_WAV_BYTES)
        throw new SpeechServiceError('录音太大，请分成更短的几段。', 413);
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    validateVoiceWav(bytes);
  } catch (error) {
    throw new SpeechServiceError((error as Error).message, 422);
  }
  return bytes;
}

export async function cloudVoiceTranscribe(
  request: Request,
  env: VoiceEnvironment,
  send: typeof fetch = fetch,
) {
  const url = new URL(request.url);
  if (request.method !== 'POST') return json({ error: '不支持此请求。' }, 405);
  if (
    request.headers.get('origin') !== url.origin ||
    request.headers.get('X-Kitchen-Voice') !== '1' ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    return json({ error: '请从工作台页面开始录音。' }, 403);
  if (!configured(env))
    return json({ error: '云端语音服务尚未开通，可以先直接输入食材。' }, 503);
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'audio/wav')
    return json({ error: '录音格式不正确，请重新录制。' }, 415);
  // Only Cloudflare's trusted client address, not user-supplied forwarded headers.
  const ip =
    request.headers.get('cf-connecting-ip') ||
    (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      ? 'local-development'
      : '');
  if (!ip) return json({ error: '语音服务暂时无法连接，请稍后重试。' }, 503);
  const configuredLimit = Number(env.KITCHEN_VOICE_DAILY_LIMIT || '100');
  if (
    !Number.isSafeInteger(configuredLimit) ||
    configuredLimit < 1 ||
    configuredLimit > 1000
  )
    return json({ error: '云端语音服务配置尚未就绪。' }, 503);
  if (activeRequests >= 2)
    return json({ error: '语音服务暂时繁忙，请稍后重试。' }, 429);
  activeRequests++;
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener('abort', abort, { once: true });
  if (request.signal.aborted) abort();
  let timeout = setTimeout(abort, 10000);
  try {
    const bytes = await readWav(request, controller.signal);
    clearTimeout(timeout);
    timeout = setTimeout(abort, 45000);
    const allowed = await reserveVoiceQuota(
      env.VOICE_LIMITS!,
      ip,
      env.TENCENT_SECRET_KEY!,
      configuredLimit,
    );
    controller.signal.throwIfAborted();
    if (!allowed)
      return json(
        { error: '语音识别次数已达上限，请稍后重试，或直接输入食材。' },
        429,
      );
    const transcript = await recognizeTencentSpeech(
      bytes,
      {
        secretId: env.TENCENT_SECRET_ID!,
        secretKey: env.TENCENT_SECRET_KEY!,
        token: env.TENCENT_SESSION_TOKEN,
      },
      controller.signal,
      send,
    );
    controller.signal.throwIfAborted();
    return json({ transcript, engine: 'tencent-cloud-asr' });
  } catch (error) {
    if (controller.signal.aborted)
      return json({ error: '识别超时或已取消，请重新录制。' }, 504);
    if (error instanceof SpeechServiceError)
      return json({ error: error.message }, error.status);
    // No provider payloads, credentials, audio or transcripts in logs/errors.
    return json(
      { error: '语音服务暂时不可用，请稍后重试或直接输入食材。' },
      503,
    );
  } finally {
    activeRequests--;
    clearTimeout(timeout);
    request.signal.removeEventListener('abort', abort);
  }
}
