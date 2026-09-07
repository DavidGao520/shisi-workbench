import { parsePhotoIngredients } from './photo-intake';
export function photoServiceForPage(
  origin: string,
  hasLocalWorkspace: boolean,
) {
  if (origin === 'http://127.0.0.1:43117' && hasLocalWorkspace) return 'local';
  return origin === 'null' ? 'unavailable' : 'cloud';
}
async function readResult(response: Response) {
  let value: { error?: unknown; ready?: unknown; candidates?: unknown };
  try {
    value = (await response.json()) as typeof value;
  } catch {
    throw new Error('照片识别暂时无法连接，请稍后重试。');
  }
  if (!response.ok)
    throw new Error(
      typeof value?.error === 'string' ? value.error : '照片识别暂时不可用。',
    );
  return value;
}
export async function checkPhotoService(signal: AbortSignal) {
  const data = await readResult(
    await fetch('/api/photo/status', { signal, cache: 'no-store' }),
  );
  if (data?.ready !== true)
    throw new Error('照片识别暂未开通，可以先用语音或手动录入食材。');
}
export async function recognizePhoto(blob: Blob, signal: AbortSignal) {
  signal.throwIfAborted();
  const result = await readResult(
    await fetch('/api/photo/recognize', {
      method: 'POST',
      signal,
      cache: 'no-store',
      headers: { 'Content-Type': 'image/jpeg', 'X-Kitchen-Photo': '1' },
      body: blob,
    }),
  );
  signal.throwIfAborted();
  return parsePhotoIngredients(result);
}
