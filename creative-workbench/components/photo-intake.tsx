'use client';
/* oxlint-disable next/no-img-element -- This is a local, temporary photo preview. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, LoaderCircle, RotateCcw } from 'lucide-react';
import { type KitchenState, type Mode, uid } from '@/lib/kitchen';
import { normalizePhoto } from '@/lib/photo-image';
import { checkPhotoService, recognizePhoto } from '@/lib/photo-service';
import { stagePhotoDraft, type PhotoDraft } from '@/lib/photo-intake';
import './photo-intake.css';

type Phase =
  | 'checking'
  | 'idle'
  | 'processing'
  | 'recognizing'
  | 'saving'
  | 'unavailable';
export function PhotoIntake({
  state,
  mode,
  service,
  busy,
  mutate,
  done,
  manual,
}: {
  state: KitchenState;
  mode: Mode;
  service: 'cloud' | 'unavailable';
  busy: boolean;
  mutate: (apply: (current: KitchenState) => void) => Promise<boolean>;
  done: (count: number) => void;
  manual: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [error, setError] = useState('');
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState('');
  const [draft, setDraft] = useState<PhotoDraft | null>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const saving = useRef(false);
  const photoUrl = useRef('');
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const current = useRef({ dataset: state.dataset, mode });
  useEffect(() => {
    current.current = { dataset: state.dataset, mode };
  }, [state.dataset, mode]);
  const cancel = useCallback(() => {
    generation.current++;
    request.current?.abort();
  }, []);
  const check = useCallback(async () => {
    cancel();
    const version = generation.current;
    const abort = (request.current = new AbortController());
    const timeout = setTimeout(() => abort.abort(), 5000);
    setPhase('checking');
    setError('');
    try {
      if (service === 'unavailable')
        throw new Error(
          '请从 HTTPS 工作台打开照片识别；独立 HTML 没有云端服务。',
        );
      await checkPhotoService(abort.signal);
      if (version === generation.current) setPhase('idle');
    } catch (reason) {
      if (version === generation.current) {
        setError(
          abort.signal.aborted
            ? '连接较慢，请重试或手动录入。'
            : (reason as Error).message,
        );
        setPhase('unavailable');
      }
    } finally {
      clearTimeout(timeout);
    }
  }, [service, cancel]);
  useEffect(() => {
    let stopped = false;
    queueMicrotask(() => {
      if (!stopped) void check();
    });
    return () => {
      stopped = true;
      cancel();
      URL.revokeObjectURL(photoUrl.current);
    };
  }, [check, cancel]);

  const choose = async (file?: File) => {
    if (!file || busy || saving.current) return;
    cancel();
    const version = generation.current;
    const abort = (request.current = new AbortController());
    const timeout = setTimeout(() => abort.abort(), 20000);
    setError('');
    setPhase('processing');
    setPhoto(null);
    setDraft(null);
    setPreview('');
    URL.revokeObjectURL(photoUrl.current);
    photoUrl.current = '';
    try {
      const blob = await normalizePhoto(file, abort.signal);
      if (version !== generation.current) return;
      photoUrl.current = URL.createObjectURL(blob);
      setPreview(photoUrl.current);
      setPhoto(blob);
      setPhase('idle');
    } catch (reason) {
      if (version === generation.current) {
        setError(
          abort.signal.aborted
            ? '照片处理超时，请重新拍摄。'
            : (reason as Error).message,
        );
        setPhase('idle');
      }
    } finally {
      clearTimeout(timeout);
    }
  };
  const save = async (
    next: PhotoDraft,
    version: number,
    signal: AbortSignal,
  ) => {
    if (saving.current || version !== generation.current || signal.aborted)
      return;
    saving.current = true;
    setPhase('saving');
    try {
      const saved = await mutate((latest) => {
        signal.throwIfAborted();
        if (
          version !== generation.current ||
          current.current.dataset !== next.dataset ||
          current.current.mode !== next.mode
        )
          throw new Error('照片任务已取消或厨房已切换，请重新识别。');
        stagePhotoDraft(latest, next);
      });
      if (version !== generation.current) return;
      if (saved) done(next.candidates.length);
      else {
        setPhase('idle');
        setError('识别结果还在，保存失败时可以重试，不会再次上传照片。');
      }
    } finally {
      saving.current = false;
    }
  };
  const start = async () => {
    if (phase !== 'idle' || busy || !photo || saving.current) return;
    cancel();
    const version = generation.current;
    const abort = (request.current = new AbortController());
    setError('');
    if (draft) {
      await save(draft, version, abort.signal);
      return;
    }
    const context = { ...current.current };
    const requestId = uid();
    const timeout = setTimeout(() => abort.abort(), 65000);
    setPhase('recognizing');
    try {
      const candidates = await recognizePhoto(photo, abort.signal);
      if (version !== generation.current) return;
      if (!candidates.length)
        throw new Error('没有识别到清晰的食材，请靠近一点重新拍摄。');
      const next = { ...context, requestId, candidates };
      setDraft(next);
      await save(next, version, abort.signal);
    } catch (reason) {
      if (version === generation.current) {
        setError(
          abort.signal.aborted
            ? '识别时间较长，请稍后重试。'
            : (reason as Error).message,
        );
        setPhase('idle');
      }
    } finally {
      clearTimeout(timeout);
    }
  };
  const locked = busy || phase !== 'idle';
  const waiting = ['processing', 'recognizing', 'saving'].includes(phase);
  return (
    <section className="photo-intake">
      <input
        className="photo-file-input"
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="拍摄食材照片"
        disabled={locked}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          void choose(file);
        }}
      />
      <input
        className="photo-file-input"
        ref={library}
        type="file"
        accept="image/*"
        aria-label="选择食材照片"
        disabled={locked}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          void choose(file);
        }}
      />
      <div className="photo-capture-area">
        {preview ? (
          <img
            className="photo-capture-preview"
            src={preview}
            alt="本次待识别的食材照片"
          />
        ) : (
          <div className="photo-capture-empty">
            <Camera size={36} />
            <span>把食材拍清楚，一次一张</span>
          </div>
        )}
        <div className="photo-capture-actions">
          <button
            className="secondary"
            disabled={locked}
            onClick={() => camera.current?.click()}
          >
            <Camera size={18} />
            拍照
          </button>
          <button
            className="secondary"
            disabled={locked}
            onClick={() => library.current?.click()}
          >
            <ImagePlus size={18} />
            从相册选择
          </button>
        </div>
      </div>
      <p className="muted photo-privacy">
        点击识别后，照片会发送至腾讯云；结果由你核对后入库，工作台不留存原图。
      </p>
      {error && (
        <p className="warning-text" role="alert">
          {error}
        </p>
      )}
      <output aria-live="polite" className="photo-status">
        {phase === 'checking'
          ? '正在连接照片识别…'
          : phase === 'processing'
            ? '正在处理照片…'
            : phase === 'recognizing'
              ? '正在识别食材，请稍候…'
              : phase === 'saving'
                ? '正在准备待确认清单…'
                : ''}
      </output>
      <div className="actions">
        {phase === 'unavailable' ? (
          <button className="secondary" onClick={() => void check()}>
            <RotateCcw size={18} />
            重新连接
          </button>
        ) : (
          <button
            className="primary"
            disabled={locked || !photo}
            onClick={() => void start()}
          >
            {waiting ? (
              <LoaderCircle className="photo-spinner" size={18} />
            ) : (
              <Camera size={18} />
            )}
            {draft ? '重试保存识别结果' : '开始识别'}
          </button>
        )}
        {waiting && phase !== 'saving' && (
          <button
            className="secondary"
            onClick={() => {
              cancel();
              setPhase('idle');
              setError('');
            }}
          >
            取消
          </button>
        )}
        <button
          className="text-button"
          disabled={phase === 'saving' || busy}
          onClick={manual}
        >
          手动录入
        </button>
      </div>
    </section>
  );
}
