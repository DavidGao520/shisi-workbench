// Only format conversion happens in the browser; speech recognition is remote.
export const VOICE_SAMPLE_RATE = 16000;
export const MAX_VOICE_SECONDS = 60;
export const MAX_WAV_BYTES = 44 + VOICE_SAMPLE_RATE * MAX_VOICE_SECONDS * 2;

export function encodeVoiceWav(channels: Float32Array[], sampleRate: number) {
  const length = channels[0]?.length || 0;
  if (
    sampleRate !== VOICE_SAMPLE_RATE ||
    !length ||
    channels.some((channel) => channel.length !== length) ||
    length > VOICE_SAMPLE_RATE * MAX_VOICE_SECONDS
  )
    throw new Error('录音需在一分钟以内，请分成更短的几段。');
  const bytes = new Uint8Array(44 + length * 2);
  const view = new DataView(bytes.buffer);
  const label = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++)
      bytes[offset + i] = value.charCodeAt(i);
  };
  label(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  label(8, 'WAVE');
  label(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  label(36, 'data');
  view.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) {
    const value =
      channels.reduce((sum, channel) => sum + channel[i], 0) / channels.length;
    const sample = Math.max(
      -1,
      Math.min(1, Number.isFinite(value) ? value : 0),
    );
    view.setInt16(
      44 + i * 2,
      Math.round(sample * (sample < 0 ? 32768 : 32767)),
      true,
    );
  }
  return bytes;
}

export async function normalizeVoiceAudio(blob: Blob, signal: AbortSignal) {
  signal.throwIfAborted();
  // decodeAudioData resamples the complete MediaRecorder file to this context's
  // rate. An offline context needs no audio playback or additional permission.
  const decoder = new OfflineAudioContext(1, 1, VOICE_SAMPLE_RATE);
  let audio: AudioBuffer;
  try {
    audio = await decoder.decodeAudioData(await blob.arrayBuffer());
  } catch {
    signal.throwIfAborted();
    throw new Error('无法处理这段录音，请重新录制，或直接输入食材。');
  }
  signal.throwIfAborted();
  const channels = Array.from({ length: audio.numberOfChannels }, (_, i) =>
    audio.getChannelData(i),
  );
  const bytes = encodeVoiceWav(channels, audio.sampleRate);
  return new Blob([bytes], { type: 'audio/wav' });
}

// Accept only the canonical PCM layout produced above; never trust a MIME label
// or caller-supplied duration to bound a paid recognition request.
export function validateVoiceWav(bytes: Uint8Array) {
  if (bytes.length <= 44 || bytes.length > MAX_WAV_BYTES || bytes.length % 2)
    throw new Error('录音为空或超过一分钟。');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const label = (offset: number, size: number) =>
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
