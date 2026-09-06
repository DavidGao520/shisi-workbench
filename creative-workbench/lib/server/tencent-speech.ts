const encoder = new TextEncoder();
const hex = (value: ArrayBuffer) =>
  Array.from(new Uint8Array(value), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
const hash = async (text: string) =>
  hex(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
export async function voiceHmac(key: string | ArrayBuffer, text: string) {
  const imported = await crypto.subtle.importKey(
    'raw',
    typeof key === 'string' ? encoder.encode(key) : key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', imported, encoder.encode(text));
}

export type TencentSpeechCredentials = {
  secretId: string;
  secretKey: string;
  token?: string;
};
export async function tencentSpeechHeaders(
  body: string,
  credentials: TencentSpeechCredentials,
  timestamp: number,
) {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const scope = `${date}/asr/tc3_request`;
  const contentType = 'application/json; charset=utf-8';
  const canonical = `POST\n/\n\ncontent-type:${contentType}\nhost:asr.tencentcloudapi.com\n\ncontent-type;host\n${await hash(body)}`;
  const toSign = `TC3-HMAC-SHA256\n${timestamp}\n${scope}\n${await hash(canonical)}`;
  const key = await voiceHmac(
    await voiceHmac(
      await voiceHmac('TC3' + credentials.secretKey, date),
      'asr',
    ),
    'tc3_request',
  );
  return {
    'Content-Type': contentType,
    'X-TC-Action': 'SentenceRecognition',
    'X-TC-Version': '2019-06-14',
    'X-TC-Timestamp': String(timestamp),
    Authorization: `TC3-HMAC-SHA256 Credential=${credentials.secretId}/${scope}, SignedHeaders=content-type;host, Signature=${hex(await voiceHmac(key, toSign))}`,
    ...(credentials.token ? { 'X-TC-Token': credentials.token } : {}),
  };
}

export class SpeechServiceError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

export async function recognizeTencentSpeech(
  bytes: Uint8Array,
  credentials: TencentSpeechCredentials,
  signal: AbortSignal,
  send: typeof fetch = fetch,
) {
  // Chunk conversion avoids large spread arguments. No audio URL is accepted.
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const body = JSON.stringify({
    EngSerViceType: '16k_zh',
    SourceType: 1,
    VoiceFormat: 'wav',
    Data: btoa(binary),
    DataLen: bytes.length,
  });
  const headers = await tencentSpeechHeaders(
    body,
    credentials,
    Math.floor(Date.now() / 1000),
  );
  signal.throwIfAborted();
  const response = await send('https://asr.tencentcloudapi.com/', {
    method: 'POST',
    headers,
    body,
    signal,
  });
  if (!response.ok)
    throw new SpeechServiceError('语音服务暂时繁忙，请稍后重试。');
  const payload = (await response.json()) as {
    Response?: { Result?: unknown; Error?: { Code?: string } };
  };
  const code = payload.Response?.Error?.Code;
  if (payload.Response?.Error) {
    if (
      code?.startsWith('AuthFailure') ||
      code?.startsWith('UnauthorizedOperation') ||
      code?.startsWith('FailedOperation.Service')
    )
      throw new SpeechServiceError(
        '云端语音服务配置尚未就绪，请联系工作台维护者。',
        503,
      );
    if (
      code?.startsWith('LimitExceeded') ||
      code?.startsWith('RequestLimitExceeded')
    )
      throw new SpeechServiceError('语音服务暂时繁忙，请稍后重试。', 429);
    if (code?.startsWith('InvalidParameter'))
      throw new SpeechServiceError('这段录音无法识别，请重新录制。', 422);
    throw new SpeechServiceError('语音识别未完成，请稍后重试。');
  }
  const text = payload.Response?.Result;
  if (typeof text !== 'string' || text.length > 10000)
    throw new SpeechServiceError('语音服务返回了无效结果，请重新录制。');
  return text.trim();
}
