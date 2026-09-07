// Port of lib/voice-audio.ts validation constants for the SCF runtime.
// Accept only the canonical 16 kHz mono PCM16 layout the browser encoder emits.
export const VOICE_SAMPLE_RATE = 16000;
export const MAX_VOICE_SECONDS = 60;
export const MAX_WAV_BYTES = 44 + VOICE_SAMPLE_RATE * MAX_VOICE_SECONDS * 2;

export function validateVoiceWav(bytes) {
  if (bytes.length <= 44 || bytes.length > MAX_WAV_BYTES || bytes.length % 2)
    throw new Error('录音为空或超过一分钟。');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const label = (offset, size) =>
    String.fromCharCode(...bytes.subarray(offset, offset + size));
  if (
    label(0, 4) !== 'RIFF' ||
    label(8, 4) !== 'WAVE' ||
    label(12, 4) !== 'fmt ' ||
    label(36, 4) !== 'data' ||
    view.getUint32(4, true) !== bytes.length - 8 ||
    view.getUint32(16, true) !== 16 ||
    view.getUint16(20, true) !== 1 ||
    view.getUint16(22, true) !== 1 ||
    view.getUint32(24, true) !== VOICE_SAMPLE_RATE ||
    view.getUint32(28, true) !== VOICE_SAMPLE_RATE * 2 ||
    view.getUint16(32, true) !== 2 ||
    view.getUint16(34, true) !== 16 ||
    view.getUint32(40, true) !== bytes.length - 44
  )
    throw new Error('录音格式不正确，请重新录制。');
  return (bytes.length - 44) / (VOICE_SAMPLE_RATE * 2);
}
