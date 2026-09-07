// Maintainer-owned build configuration. Change only after a real SCF acceptance test.
// Never take the target/transport from a browser request, environment or upstream response.
/** @type {Readonly<{origin: string, transport: 'wav' | 'json-base64'}>} */
export const VOICE_ENDPOINT = Object.freeze({
  origin: 'https://shisi-kitchen-workbench.yuangao021804.chatgpt.site',
  transport: 'wav',
});
export const VOICE_ORIGIN = VOICE_ENDPOINT.origin;
export const MAX_WAV_BYTES = 1920044;
const problem = (message, status = 400) =>
  Object.assign(new Error(message), { status });
const messages = {
  400: '录音格式不正确，请重新录制。',
  403: '云端语音拒绝了这次请求，请联系工作台维护者；无需安装本机模型。',
  413: '录音太大，请分成一分钟以内的几段。',
  415: '录音格式不支持，请在页面重新录制。',
  422: '这段录音无法识别，请重新录制或直接输入食材。',
  429: '语音调用过于频繁或今日额度已用完，请稍后重试，或直接输入食材。',
  503: '云端语音服务暂时不可用，请稍后重试，或直接输入食材。',
  504: '云端语音识别超时，请稍后重试。',
};

async function readWav(req, signal) {
  signal.throwIfAborted();
  if (String(req.headers['content-type'] || '').split(';')[0] !== 'audio/wav')
    throw problem(messages[415], 415);
  if (Number(req.headers['content-length']) > MAX_WAV_BYTES)
    throw problem(messages[413], 413);
  const cancel = () => req.destroy(signal.reason);
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      signal.throwIfAborted();
      size += chunk.length;
      if (size > MAX_WAV_BYTES) throw problem(messages[413], 413);
      chunks.push(chunk);
    }
    signal.throwIfAborted();
    const audio = Buffer.concat(chunks);
    // Same canonical 16 kHz mono PCM16 layout as the browser encoder.
    if (
      size <= 44 ||
      size % 2 ||
      audio.toString('ascii', 0, 4) !== 'RIFF' ||
      audio.toString('ascii', 8, 16) !== 'WAVEfmt ' ||
      audio.toString('ascii', 36, 40) !== 'data' ||
      audio.readUInt32LE(4) !== size - 8 ||
      audio.readUInt32LE(16) !== 16 ||
      audio.readUInt16LE(20) !== 1 ||
      audio.readUInt16LE(22) !== 1 ||
      audio.readUInt32LE(24) !== 16000 ||
      audio.readUInt32LE(28) !== 32000 ||
      audio.readUInt16LE(32) !== 2 ||
      audio.readUInt16LE(34) !== 16 ||
      audio.readUInt32LE(40) !== size - 44
    )
      throw problem(messages[400]);
    return audio;
  } finally {
    signal.removeEventListener('abort', cancel);
  }
}

async function readResult(response, signal) {
  if (!response.ok) {
    await response.body?.cancel();
    // A Cloudflare header alone is not evidence of a WAF block: the actual API
    // also runs behind Cloudflare and can return its own JSON 403.
    if (
      response.status === 403 &&
      response.headers.get('server')?.toLowerCase() === 'cloudflare' &&
      response.headers
        .get('content-type')
        ?.split(';')[0]
        .trim()
        .toLowerCase() === 'text/html'
    ) {
      const ray = response.headers.get('cf-ray') || '';
      // Only expose the bounded correlation ID, never the upstream HTML or IP.
      const reference = /^[a-f0-9]{16}(?:-[A-Z]{3})?$/.test(ray)
        ? `（请求编号 ${ray}）`
        : '';
      throw problem(
        `网站访问层拒绝了语音连接${reference}，需由托管平台排查；无需安装本机模型。`,
        403,
      );
    }
    const status = Object.hasOwn(messages, response.status)
      ? response.status
      : 502;
    throw problem(messages[status] || '语音服务返回异常，请稍后重试。', status);
  }
  const reader = response.body?.getReader();
  if (!reader) throw problem('语音服务没有返回结果。', 502);
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.length;
      if (size > 64000) throw problem('语音返回结果过长，请分批录入。', 502);
      chunks.push(value);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw problem('无法读取云端语音结果，请稍后重试。', 502);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

// Dependency injection is for tests; kitchen-bridge always uses the fixed default.
export function createCloudSpeech({
  fetchImpl = fetch,
  endpoint = VOICE_ENDPOINT,
} = {}) {
  const origin = endpoint.origin;
  const transport = endpoint.transport;
  const url = new URL(origin);
  if (
    url.origin !== origin ||
    url.protocol !== 'https:' ||
    !(
      (origin === VOICE_ORIGIN && transport === 'wav') ||
      (/^[a-z0-9-]+\.[a-z0-9-]+\.tencentscf\.com$/.test(url.hostname) &&
        transport === 'json-base64')
    )
  )
    throw problem('语音接入配置无效，请联系工作台维护者。', 503);
  let busy = false;
  async function request(path, signal, audio) {
    signal.throwIfAborted();
    const jsonAudio = transport === 'json-base64';
    const response = await fetchImpl(origin + '/api/voice/' + path, {
      method: audio ? 'POST' : 'GET',
      headers: {
        Origin: origin,
        'X-Kitchen-Voice': '1',
        ...(audio
          ? { 'Content-Type': jsonAudio ? 'application/json' : 'audio/wav' }
          : {}),
      },
      ...(audio
        ? {
            body: jsonAudio
              ? JSON.stringify({ audio: audio.toString('base64') })
              : audio,
          }
        : {}),
      signal,
      redirect: 'error',
      credentials: 'omit',
      cache: 'no-store',
    });
    return readResult(response, signal);
  }
  function failure(e, caller) {
    if (caller.aborted) return problem('已取消识别。', 499);
    if (e.name === 'TimeoutError') return problem(messages[504], 504);
    return e.status
      ? e
      : problem('无法连接云端语音，请检查网络或直接输入食材。', 502);
  }
  return {
    async status(caller = new AbortController().signal) {
      try {
        const result = await request(
          'status',
          AbortSignal.any([caller, AbortSignal.timeout(8000)]),
        );
        if (
          typeof result?.ready !== 'boolean' ||
          result.engine !== 'tencent-cloud-asr'
        )
          throw problem('云端语音状态异常，请稍后重试。', 502);
        return {
          ready: result.ready,
          busy,
          engine: 'tencent-cloud-asr',
          maxSeconds: 60,
        };
      } catch (e) {
        throw failure(e, caller);
      }
    },
    async transcribe(req, caller) {
      if (busy) throw problem('正在识别上一段录音，请稍后重试。', 429);
      busy = true;
      try {
        const audio = await readWav(
          req,
          AbortSignal.any([caller, AbortSignal.timeout(10000)]),
        );
        const result = await request(
          'transcribe',
          AbortSignal.any([caller, AbortSignal.timeout(60000)]),
          audio,
        );
        if (
          typeof result?.transcript !== 'string' ||
          result.transcript.length > 10000 ||
          result.engine !== 'tencent-cloud-asr'
        )
          throw problem('没有收到有效文字，请重新录制。', 502);
        return { transcript: result.transcript, engine: 'tencent-cloud-asr' };
      } catch (e) {
        throw failure(e, caller);
      } finally {
        busy = false;
      }
    },
  };
}
