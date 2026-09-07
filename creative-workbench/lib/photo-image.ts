export const MAX_PHOTO_BYTES = 1500000;
export const MAX_PHOTO_EDGE = 1600;

/** Bound encoded size and dimensions before forwarding anything to the model. */
export function validatePhotoJpeg(bytes: Uint8Array) {
  if (
    bytes.length < 20 ||
    bytes.length > MAX_PHOTO_BYTES ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes.at(-2) !== 0xff ||
    bytes.at(-1) !== 0xd9
  )
    throw new Error('照片格式或大小不正确，请重新选择照片。');
  let offset = 2;
  let size: { width: number; height: number } | undefined;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset++] !== 0xff) break;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda) {
      if (size) return size;
      break;
    }
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) break;
    if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) {
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      if (
        !width ||
        !height ||
        width > MAX_PHOTO_EDGE ||
        height > MAX_PHOTO_EDGE ||
        size
      )
        throw new Error('照片尺寸不正确，请重新选择照片。');
      size = { width, height };
    }
    offset += length;
  }
  throw new Error('照片内容不完整，请重新选择照片。');
}

export async function normalizePhoto(
  file: File,
  signal: AbortSignal,
): Promise<Blob> {
  signal.throwIfAborted();
  if (!file.size || file.size > 12 * 1024 * 1024)
    throw new Error('请选择不超过 12 MB 的照片。');
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type))
    throw new Error('请选择 JPG、PNG 或 WebP 照片，也可以重新拍摄。');
  const url = URL.createObjectURL(file);
  const img = new Image();
  const stop = () => {
    img.src = '';
  };
  try {
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        stop();
        reject(new DOMException('Cancelled', 'AbortError'));
      };
      signal.addEventListener('abort', abort, { once: true });
      const finish = (error?: Error) => {
        signal.removeEventListener('abort', abort);
        img.onload = null;
        img.onerror = null;
        if (error) reject(error);
        else resolve();
      };
      img.onload = () => finish();
      img.onerror = () =>
        finish(new Error('无法读取这张照片，请换成 JPG 或重新拍摄。'));
      img.src = url;
      if (signal.aborted) abort();
    });
    signal.throwIfAborted();
    if (
      !img.naturalWidth ||
      !img.naturalHeight ||
      img.naturalWidth * img.naturalHeight > 50000000
    )
      throw new Error('照片尺寸过大，请选择普通分辨率照片。');
    const scale = Math.min(
      1,
      MAX_PHOTO_EDGE / Math.max(img.naturalWidth, img.naturalHeight),
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    try {
      const context = canvas.getContext('2d');
      if (!context)
        throw new Error('此浏览器无法处理照片，请换用 Chrome 或 Safari。');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.85, 0.7, 0.5]) {
        signal.throwIfAborted();
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (value) =>
              value
                ? resolve(value)
                : reject(new Error('照片处理失败，请重新拍摄。')),
            'image/jpeg',
            quality,
          ),
        );
        signal.throwIfAborted();
        if (blob.size <= MAX_PHOTO_BYTES) {
          validatePhotoJpeg(new Uint8Array(await blob.arrayBuffer()));
          signal.throwIfAborted();
          return blob;
        }
      }
      throw new Error('照片细节太多，请靠近食材分开拍摄。');
    } finally {
      canvas.width = canvas.height = 0;
    }
  } finally {
    stop();
    URL.revokeObjectURL(url);
  }
}
