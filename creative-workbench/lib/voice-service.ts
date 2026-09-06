import { normalizeVoiceAudio } from './voice-audio';

export type VoiceService = { kind: 'local' | 'cloud'; base: string };
export function voiceServiceForPage(
  origin: string,
  hasLocalWorkspace: boolean,
): VoiceService {
  if (origin === 'null')
    throw new Error(
      '请从部署后的 HTTPS 网站打开语音录入；独立 HTML 不包含云端服务。',
    );
  // Explicit legacy compatibility, never a silent cloud-to-local fallback.
  if (origin === 'http://127.0.0.1:43117' && hasLocalWorkspace)
    return { kind: 'local', base: '/voice' };
  return { kind: 'cloud', base: '/api/voice' };
}

async function readResult(response: Response) {
  let result: { error?: unknown; ready?: unknown; transcript?: unknown };
  try {
    result = await response.json();
  } catch {
    throw new Error('语音服务暂时无法连接，请稍后重试或直接输入食材。');
  }
  if (!response.ok)
    throw new Error(
      typeof result.error === 'string'
        ? result.error
        : '语音服务暂时不可用，请稍后重试。',
    );
  return result;
}

export async function checkVoiceService(
  service: VoiceService,
  clientId: string,
  signal: AbortSignal,
) {
  const result = await readResult(
    await fetch(service.base + '/status', {
      headers: { 'X-Kitchen-Client': clientId, 'X-Kitchen-Voice': '1' },
      signal,
      cache: 'no-store',
    }),
  );
  if (result.ready !== true)
    throw new Error(
      service.kind === 'cloud'
        ? '云端语音服务尚未开通，可以先直接输入食材。'
        : '本机语音服务未就绪，请使用部署后的网页版，或检查本地语音服务。',
    );
}

export async function transcribeVoice(
  service: VoiceService,
  blob: Blob,
  clientId: string,
  signal: AbortSignal,
) {
  const audio =
    service.kind === 'cloud' ? await normalizeVoiceAudio(blob, signal) : blob;
  signal.throwIfAborted();
  const result = await readResult(
    await fetch(service.base + '/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': audio.type,
        'X-Kitchen-Client': clientId,
        'X-Kitchen-Voice': '1',
      },
      body: audio,
      signal,
      cache: 'no-store',
    }),
  );
  signal.throwIfAborted();
  if (typeof result.transcript !== 'string' || result.transcript.length > 10000)
    throw new Error('没有收到有效文字，请重新录制。');
  return result.transcript;
}
