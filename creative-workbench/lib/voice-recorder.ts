export const RECORDING_LIMIT_MS = 60000;
export const AUDIO_LIMIT_BYTES = 3 * 1024 * 1024;

export function microphoneError(error: unknown) {
  const name = (error as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return '没有麦克风权限。请在浏览器和系统设置中允许麦克风，再点开始录音。';
  if (name === 'NotFoundError') return '没有找到麦克风，请连接麦克风后再试。';
  if (name === 'NotReadableError')
    return '麦克风被占用或无法读取，请关闭其他录音应用后再试。';
  return '录音没有启动，请检查麦克风后重试。';
}

// A controller owns exactly one permission request/stream. Cancelling even while
// permission is pending invalidates it and stops any subsequently granted tracks.
export class VoiceRecorder {
  private cancelled = false;
  private started = false;
  private delivered = false;
  private recorder?: MediaRecorder;
  private stream?: MediaStream;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(
    private callbacks: {
      recording: () => void;
      audio: (blob: Blob) => void;
      error: (message: string) => void;
    },
    private mediaDevices: Pick<MediaDevices, 'getUserMedia'>,
    private Recorder: typeof MediaRecorder,
    private limitMs = RECORDING_LIMIT_MS,
  ) {}
  private release() {
    clearTimeout(this.timer);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
  }
  async start() {
    if (this.started || this.cancelled) return;
    this.started = true;
    try {
      const stream = await this.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      if (this.cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/mp4',
        'audio/webm',
        'audio/ogg;codecs=opus',
      ].find((type) => this.Recorder.isTypeSupported(type));
      const recorder = (this.recorder = new this.Recorder(
        stream,
        mimeType ? { mimeType } : undefined,
      ));
      const chunks: Blob[] = [];
      let bytes = 0;
      recorder.ondataavailable = (event) => {
        if (this.cancelled || !event.data.size) return;
        bytes += event.data.size;
        if (bytes > AUDIO_LIMIT_BYTES) {
          this.cancel();
          this.callbacks.error('录音太大，请分成更短的几段。');
          return;
        }
        chunks.push(event.data);
      };
      recorder.onerror = () => {
        if (!this.cancelled) {
          this.cancel();
          this.callbacks.error('录音中断，请重新录制。');
        }
      };
      recorder.onstop = () => {
        this.release();
        if (this.cancelled || this.delivered) return;
        this.delivered = true;
        if (bytes < 32) this.callbacks.error('没有录到声音，请再说一次。');
        else
          this.callbacks.audio(
            new Blob(chunks, {
              type: recorder.mimeType || mimeType || 'audio/webm',
            }),
          );
      };
      recorder.start(250);
      this.callbacks.recording();
      this.timer = setTimeout(() => this.stop(), this.limitMs);
    } catch (error) {
      this.release();
      if (!this.cancelled) this.callbacks.error(microphoneError(error));
    }
  }
  stop() {
    clearTimeout(this.timer);
    if (this.recorder?.state === 'recording') this.recorder.stop();
  }
  cancel() {
    this.cancelled = true;
    this.stop();
    this.release();
  }
}
