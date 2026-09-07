import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { voicePython, voiceEnvironment } from './runtime-paths.mjs';

export const MAX_AUDIO_BYTES = 3 * 1024 * 1024;
const error = (message, status = 400) =>
  Object.assign(new Error(message), { status });

export async function readAudio(req) {
  const type = String(req.headers['content-type'] || '').split(';')[0];
  if (
    ![
      'audio/webm',
      'audio/mp4',
      'audio/ogg',
      'audio/wav',
      'audio/x-wav',
      'audio/mpeg',
      'video/webm',
    ].includes(type)
  )
    throw error('录音格式不支持，请在页面重新录制。', 415);
  if (Number(req.headers['content-length']) > MAX_AUDIO_BYTES)
    throw error('录音太大，请控制在一分钟内。', 413);
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_AUDIO_BYTES)
      throw error('录音太大，请控制在一分钟内。', 413);
    chunks.push(chunk);
  }
  if (size < 32) throw error('没有收到有效录音，请再试一次。');
  return Buffer.concat(chunks);
}

export function createLocalSpeech(workspace) {
  const runtime = join(workspace, '.kitchen-voice');
  const python = voicePython(runtime);
  const script = fileURLToPath(new URL('./transcribe.py', import.meta.url));
  let busy = false;
  const ready = async () => {
    try {
      await Promise.all([access(python), access(join(runtime, 'ready.json'))]);
      return true;
    } catch {
      return false;
    }
  };
  return {
    status: async () => ({
      ready: await ready(),
      busy,
      engine: 'whisper-base-local',
    }),
    async transcribe(req, signal) {
      if (busy) throw error('正在识别上一段录音，请稍后重试。', 429);
      busy = true;
      try {
        if (!(await ready()))
          throw error('本机语音模型尚未准备好，请先运行语音初始化。', 503);
        const audio = await readAudio(req);
        if (signal.aborted) throw error('已取消识别。', 499);
        return await new Promise((resolve, reject) => {
          const child = spawn(python, [script, runtime], {
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
            env: {
              ...voiceEnvironment(workspace),
              HF_HUB_OFFLINE: '1',
            },
          });
          let out = '',
            finished = false;
          child.stdout.setEncoding('utf8');
          const finish = (problem, result) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            signal.removeEventListener('abort', cancel);
            if (problem) {
              child.kill('SIGKILL');
              reject(problem);
            } else resolve(result);
          };
          const cancel = () => finish(error('已取消识别。', 499));
          const timer = setTimeout(
            () => finish(error('识别超时，请把录音分短一些再试。', 504)),
            120000,
          );
          signal.addEventListener('abort', cancel, { once: true });
          child.on('error', () =>
            finish(error('语音服务未能启动，请重新准备本机语音环境。', 503)),
          );
          child.stdout.on('data', (chunk) => {
            out += chunk.toString();
            if (out.length > 64000) finish(error('识别结果过长，请分批录入。'));
          });
          // Drain, but do not log private data or paths from decoder/model errors.
          child.stderr.resume();
          child.stdin.on('error', () => {});
          child.on('close', (code) => {
            if (finished) return;
            try {
              const result = JSON.parse(out);
              if (code !== 0 || result.error)
                throw error(result.error || '录音识别失败，请重试。');
              if (
                typeof result.transcript !== 'string' ||
                result.transcript.length > 10000 ||
                result.engine !== 'whisper-base-local'
              )
                throw error('识别结果异常，未改动库存。');
              finish(null, result);
            } catch (e) {
              finish(e.status ? e : error('录音识别失败，请重新录制。'));
            }
          });
          child.stdin.end(audio);
        });
      } finally {
        busy = false;
      }
    },
  };
}
