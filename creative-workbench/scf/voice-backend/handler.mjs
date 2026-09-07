// SCF Function URL accepts ASCII JSON with an explicit Base64 WAV envelope.
// The browser-to-local-bridge contract remains audio/wav. Secrets never go there.
import { isIP } from 'node:net';
import { MAX_WAV_BYTES, validateVoiceWav } from './wav.mjs';
import { recognizeTencentSpeech, SpeechServiceError } from './speech.mjs';
import { createQuotaChecker } from './quota.mjs';
import { createCosSlotStore } from './cos-store.mjs';

export const MAX_ENVELOPE_BYTES = 4 * Math.ceil(MAX_WAV_BYTES / 3) + 64;
function json(data, statusCode = 200) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
    body: JSON.stringify(data),
  };
}
const unavailable = () =>
  json({ error: '语音服务暂时无法连接，请稍后重试。' }, 503);
function validOrigin(origin) {
  try {
    const url = new URL(origin);
    return (
      url.origin === origin &&
      url.protocol === 'https:' &&
      /^[a-z0-9-]+\.[a-z0-9-]+\.tencentscf\.com$/.test(url.hostname)
    );
  } catch {
    return false;
  }
}

/**
 * @typedef {{ claim: (key: string, signal?: AbortSignal) => Promise<boolean>, check?: (signal?: AbortSignal) => Promise<void> }} QuotaStore
 * @typedef {Record<string, string | undefined>} VoiceEnvironment
 * @param {{env: VoiceEnvironment, docStore?: QuotaStore, storeForContext?: (context?: VoiceEnvironment) => QuotaStore, send?: typeof fetch}} options
 */
export function createVoiceHandler({
  env,
  docStore,
  storeForContext,
  send = fetch,
}) {
  let activeRequests = 0;
  const occupied = new Map();
  const dailyLimit = Number(env.KITCHEN_VOICE_DAILY_LIMIT || '100');
  const configured = () =>
    env.KITCHEN_VOICE_ENABLED === '1' &&
    validOrigin(env.VOICE_ORIGIN) &&
    !!env.TENCENT_SECRET_ID?.trim() &&
    !!env.TENCENT_SECRET_KEY?.trim() &&
    Number.isSafeInteger(dailyLimit) &&
    dailyLimit >= 1 &&
    dailyLimit <= 1000;
  /**
   * @param {{httpMethod?: string, path?: string, headers?: Record<string, unknown>, body?: unknown, isBase64Encoded?: boolean}} event
   * @param {VoiceEnvironment} [context]
   */
  return async function main_handler(event, context) {
    const headers = Object.fromEntries(
      Object.entries(event?.headers || {}).map(([k, v]) => [
        k.toLowerCase(),
        String(v),
      ]),
    );
    const method = event?.httpMethod;
    const path = event?.path;
    const status = path === '/api/voice/status';
    if (!status && path !== '/api/voice/transcribe')
      return json({ error: '不支持此请求。' }, 404);
    if (method !== (status ? 'GET' : 'POST'))
      return json({ error: '不支持此请求。' }, 405);
    if (!status && !configured()) return unavailable();
    if (
      !status &&
      (headers.origin !== env.VOICE_ORIGIN ||
        headers['x-kitchen-voice'] !== '1' ||
        headers['sec-fetch-site'] === 'cross-site')
    )
      return json({ error: '请从工作台页面开始录音。' }, 403);
    let store;
    try {
      store = storeForContext ? storeForContext(context) : docStore;
    } catch {
      /* fail closed */
    }
    const ready = !!(configured() && store?.claim);
    if (status) {
      let checked = ready;
      if (checked)
        try {
          await store.check?.(AbortSignal.timeout(6000));
        } catch {
          checked = false;
        }
      return json({
        ready: checked,
        engine: 'tencent-cloud-asr',
        maxSeconds: 60,
      });
    }
    if (!ready) return unavailable();
    if (
      headers['content-type']?.split(';')[0].trim().toLowerCase() !==
      'application/json'
    )
      return json({ error: '录音格式不正确，请重新录制。' }, 415);
    // Ignore X-Forwarded-For/Host/client-provided identities. Only SCF supplies IP.
    const ip = headers['x-scf-remote-addr'];
    if (!isIP(ip || '')) return unavailable();
    if (activeRequests >= 2)
      return json({ error: '语音服务暂时繁忙，请稍后重试。' }, 429);
    activeRequests++;
    try {
      const declared = headers['content-length'];
      if (
        (declared &&
          (!/^\d+$/.test(declared) || Number(declared) > MAX_ENVELOPE_BYTES)) ||
        (typeof event.body === 'string' &&
          Buffer.byteLength(event.body) > MAX_ENVELOPE_BYTES)
      )
        throw new SpeechServiceError('录音太大，请分成更短的几段。', 413);
      if (
        typeof event.body !== 'string' ||
        !event.body ||
        event.isBase64Encoded === true
      )
        throw new SpeechServiceError('没有收到有效录音，请重新录制。', 400);
      let payload;
      try {
        payload = JSON.parse(event.body);
      } catch {
        throw new SpeechServiceError('录音数据无效。', 400);
      }
      if (
        !payload ||
        typeof payload !== 'object' ||
        Array.isArray(payload) ||
        Object.keys(payload).length !== 1 ||
        typeof payload.audio !== 'string' ||
        !payload.audio.length ||
        payload.audio.length % 4 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(payload.audio)
      )
        throw new SpeechServiceError('录音数据无效。', 400);
      const bytes = Buffer.from(payload.audio, 'base64');
      if (bytes.length > MAX_WAV_BYTES)
        throw new SpeechServiceError('录音太大，请分成更短的几段。', 413);
      if (bytes.toString('base64') !== payload.audio)
        throw new SpeechServiceError('录音数据无效。', 400);
      try {
        validateVoiceWav(bytes);
      } catch (e) {
        throw new SpeechServiceError(e.message, 422);
      }
      let allowed;
      try {
        const quotaSignal = AbortSignal.timeout(8000);
        await store.check?.(quotaSignal);
        allowed = await createQuotaChecker({ claim: store.claim, occupied })(
          ip,
          env.TENCENT_SECRET_KEY,
          dailyLimit,
          Math.floor(Date.now() / 1000),
          quotaSignal,
        );
      } catch {
        return unavailable();
      }
      if (!allowed)
        return json(
          { error: '语音识别次数已达上限，请稍后重试，或直接输入食材。' },
          429,
        );
      const transcript = await recognizeTencentSpeech(
        bytes,
        {
          secretId: env.TENCENT_SECRET_ID,
          secretKey: env.TENCENT_SECRET_KEY,
          token: env.TENCENT_SESSION_TOKEN,
        },
        AbortSignal.timeout(45000),
        send,
      );
      return json({ transcript, engine: 'tencent-cloud-asr' });
    } catch (error) {
      if (error instanceof SpeechServiceError)
        return json({ error: error.message }, error.status);
      if (error?.name === 'TimeoutError')
        return json({ error: '识别超时，请重新录制。' }, 504);
      return unavailable();
    } finally {
      activeRequests--;
    }
  };
}

/** @param {VoiceEnvironment} [processEnv] */
export function createVoiceHandlerFromEnv(
  processEnv = process.env,
  { fetchImpl = fetch, send = fetch } = {},
) {
  return createVoiceHandler({
    env: processEnv,
    send,
    storeForContext(context) {
      // SCF Node.js supplies per-invocation role credentials in a JSON string.
      // Parse afresh on warm calls; never use process.env's cold-start snapshot.
      let credentials = context;
      if (context && Object.hasOwn(context, 'environment')) {
        if (typeof context.environment !== 'string')
          throw new Error('scf-context-environment-invalid');
        credentials = JSON.parse(context.environment);
        if (
          !credentials ||
          typeof credentials !== 'object' ||
          Array.isArray(credentials)
        )
          throw new Error('scf-context-environment-invalid');
      }
      const value = (key) =>
        typeof credentials?.[key] === 'string' ? credentials[key].trim() : '';
      const secretId = value('TENCENTCLOUD_SECRETID');
      const secretKey = value('TENCENTCLOUD_SECRETKEY');
      const token = value('TENCENTCLOUD_SESSIONTOKEN');
      if (!secretId || !secretKey || !token)
        throw new Error('scf-context-credentials-required');
      return createCosSlotStore({
        bucket: processEnv.VOICE_QUOTA_BUCKET,
        region: processEnv.VOICE_QUOTA_REGION || 'ap-guangzhou',
        secretId,
        secretKey,
        token,
        fetchImpl,
      });
    },
  });
}
