'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Mic, Square, RotateCcw } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { bands, uid, units, type KitchenState, type Mode } from '@/lib/kitchen';
import {
  checkVoiceService,
  transcribeVoice,
  voiceServiceForPage,
  type VoiceService,
} from '@/lib/voice-service';
import {
  prepareVoiceDraft,
  confirmVoiceDraft,
  type VoiceRow,
} from '@/lib/voice-intake';
import { VoiceRecorder } from '@/lib/voice-recorder';

type Phase =
  | 'checking'
  | 'idle'
  | 'permission'
  | 'recording'
  | 'recognizing'
  | 'review'
  | 'unavailable';
export function VoiceIntake({
  state,
  mode,
  busy,
  mutate,
  done,
}: {
  state: KitchenState;
  mode: Mode;
  busy: boolean;
  mutate: (apply: (current: KitchenState) => void) => Promise<boolean>;
  done: (count: number) => void;
}) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [text, setText] = useState('');
  const [rows, setRows] = useState<VoiceRow[]>([]);
  const [quantityKinds, setQuantityKinds] = useState<Record<string, string>>(
    {},
  );
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [clientId] = useState(uid);
  const [service, setService] = useState<VoiceService | null>(null);
  const controller = useRef<VoiceRecorder | null>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const saving = useRef(false);
  const current = useRef({ state, mode });
  useEffect(() => {
    current.current = { state, mode };
  }, [state, mode]);

  const check = useCallback(async () => {
    const version = ++generation.current;
    setPhase('checking');
    setService(null);
    setError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw new Error(
          '此浏览器无法录音，请用 Chrome 或 Safari 打开 HTTPS 工作台，或直接输入食材。',
        );
      const nextService = voiceServiceForPage(
        location.origin,
        !!document.querySelector('meta[name="kitchen-workspace"]'),
      );
      if (nextService.kind === 'cloud' && !window.OfflineAudioContext)
        throw new Error(
          '此浏览器暂不支持录音处理，请换用 Chrome 或 Safari，或直接输入食材。',
        );
      await checkVoiceService(nextService, clientId, AbortSignal.timeout(5000));
      if (version === generation.current) {
        setService(nextService);
        setPhase('idle');
      }
    } catch (e) {
      if (version === generation.current) {
        setError((e as Error).message);
        setPhase('unavailable');
      }
    }
  }, [clientId]);
  const cancelCapture = useCallback(() => {
    generation.current++;
    controller.current?.cancel();
    request.current?.abort();
  }, []);
  useEffect(() => {
    let stopped = false;
    queueMicrotask(() => {
      if (!stopped) void check();
    });
    return () => {
      stopped = true;
      cancelCapture();
    };
    // Remounting by kitchen and mode makes old microphone/response callbacks inert.
  }, [check, cancelCapture]);
  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);
  const analyze = (transcript: string) => {
    const result = prepareVoiceDraft(
      transcript,
      current.current.state,
      current.current.mode,
    );
    setRows(result.rows);
    setNotes(result.warnings);
    setPhase(service ? 'review' : 'unavailable');
    setError(
      result.rows.length
        ? ''
        : '这段话里没有识别到可入库的食材。请修改文字，或再说一次。',
    );
  };
  const start = () => {
    if (
      [
        'recording',
        'recognizing',
        'permission',
        'checking',
        'unavailable',
      ].includes(phase) ||
      busy ||
      !service
    )
      return;
    const version = ++generation.current;
    controller.current?.cancel();
    request.current?.abort();
    setError('');
    setRows([]);
    setNotes([]);
    setSeconds(0);
    setPhase('permission');
    controller.current = new VoiceRecorder(
      {
        recording: () => {
          if (version === generation.current) setPhase('recording');
        },
        error: (message) => {
          if (version === generation.current) {
            setError(message);
            setPhase('idle');
          }
        },
        audio: async (blob) => {
          if (version !== generation.current) return;
          setPhase('recognizing');
          const abort = (request.current = new AbortController());
          const timeout = setTimeout(
            () => abort.abort(),
            service.kind === 'cloud' ? 65000 : 125000,
          );
          try {
            const transcript = await transcribeVoice(
              service,
              blob,
              clientId,
              abort.signal,
            );
            if (version !== generation.current) return;
            setText(transcript);
            if (!transcript.trim()) {
              setError('没有听清食材，请靠近麦克风再说一次。');
              setPhase('idle');
              return;
            }
            analyze(transcript);
          } catch (e) {
            if (version === generation.current) {
              setError(
                abort.signal.aborted
                  ? '识别超时，可以重新录制。'
                  : (e as Error).message,
              );
              setPhase('idle');
            }
          } finally {
            clearTimeout(timeout);
          }
        },
      },
      navigator.mediaDevices,
      window.MediaRecorder,
      service.kind === 'cloud' ? 55000 : 60000,
    );
    void controller.current.start();
  };
  const cancel = () => {
    cancelCapture();
    setPhase('idle');
    setError('');
  };
  const update = (index: number, patch: Partial<VoiceRow>) =>
    setRows((previous) =>
      previous.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  const working = ['recording', 'permission', 'recognizing'].includes(phase);
  const selected = rows.filter((row) => row.selected).length;
  const quantityKind = (row: VoiceRow) =>
    quantityKinds[row.candidate.key] || (row.amount.trim() ? 'exact' : 'band');
  const blocked = rows.some(
    (row) =>
      row.selected &&
      (row.targetId === 'choose' ||
        (quantityKind(row) === 'exact' && !row.amount.trim())),
  );
  return (
    <section className="voice-intake">
      <div
        className={
          'voice-recorder' + (phase === 'recording' ? ' is-recording' : '')
        }
      >
        <Mic size={32} aria-hidden="true" />
        <p aria-live="polite">
          {phase === 'recording'
            ? `正在听 · ${seconds} 秒`
            : phase === 'recognizing'
              ? '正在识别食材…'
              : phase === 'permission'
                ? '请允许使用麦克风'
                : phase === 'checking'
                  ? '正在连接语音服务…'
                  : '说说你家有什么食材'}
        </p>
        <span>例如：“两个番茄，一盒鸡蛋，还有半斤猪肉。”</span>
        <div className="actions">
          {phase === 'recording' ? (
            <button
              className="primary"
              onClick={() => controller.current?.stop()}
            >
              <Square size={17} />
              说完了，识别食材
            </button>
          ) : (
            !working &&
            phase !== 'unavailable' && (
              <button
                className="primary"
                disabled={busy || phase === 'checking' || !service}
                onClick={start}
              >
                <Mic size={17} />
                {phase === 'review' ? '重新录音' : '开始录音'}
              </button>
            )
          )}
          {working && (
            <button className="text-button" onClick={cancel}>
              取消
            </button>
          )}
          {phase === 'unavailable' && (
            <>
              <button className="secondary" onClick={() => void check()}>
                <RotateCcw size={16} />
                重新连接
              </button>
            </>
          )}
        </div>
        <small>
          {service?.kind === 'local'
            ? '最多一分钟。本机转写；确认后才入库。'
            : '最多约一分钟。录音将发送至腾讯云转写，工作台不保存录音；确认后才入库。'}
        </small>
      </div>
      {error && (
        <p className="warning-text" role="alert">
          {error}
        </p>
      )}
      {!working && (
        <label className="field">
          {text ? '识别文字（可以修改）' : '也可以直接输入食材'}
          <textarea
            value={text}
            maxLength={10000}
            placeholder="两个番茄，一盒鸡蛋，还有半斤猪肉"
            disabled={busy}
            onChange={(e) => {
              setText(e.target.value);
              setRows([]);
              setNotes([]);
            }}
          />
          <button
            className="text-button"
            disabled={busy || !text.trim()}
            onClick={() => {
              try {
                analyze(text);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            识别食材
          </button>
        </label>
      )}
      {!!notes.length && (
        <ul className="voice-notes">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      {!!rows.length && (
        <>
          <p>识别到 {rows.length} 种食材。取消勾选不需要的，数量可直接修改。</p>
          <div className="voice-rows">
            {rows.map((row, index) => {
              return (
                <fieldset
                  key={row.candidate.key}
                  className={
                    'voice-row' + (!row.selected ? ' is-unselected' : '')
                  }
                  disabled={busy}
                >
                  <legend>
                    <label htmlFor={clientId + '-' + index}>
                      <Checkbox
                        id={clientId + '-' + index}
                        checked={row.selected}
                        onCheckedChange={(checked) =>
                          update(index, { selected: !!checked })
                        }
                      />
                      {row.candidate.displayName}
                    </label>
                  </legend>
                  <div className="form-grid stocktake-fields">
                    <div className="field">
                      <span>数量形式</span>
                      <Select
                        value={quantityKind(row)}
                        onValueChange={(value) => {
                          if (!value) return;
                          setQuantityKinds((previous) => ({
                            ...previous,
                            [row.candidate.key]: value,
                          }));
                          if (value === 'band') update(index, { amount: '' });
                        }}
                      >
                        <SelectTrigger aria-label={row.name + '数量形式'}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="exact">精确数量</SelectItem>
                          <SelectItem value="band">数量不确定</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div
                      className={
                        quantityKind(row) === 'exact' ? 'quantity-pair' : ''
                      }
                    >
                      {quantityKind(row) === 'exact' && (
                        <label className="field">
                          数量
                          <input
                            type="number"
                            min="0"
                            max="1000000"
                            step="any"
                            placeholder="没说数量，先记有"
                            value={row.amount}
                            onChange={(e) => {
                              setQuantityKinds((previous) => ({
                                ...previous,
                                [row.candidate.key]: 'exact',
                              }));
                              update(index, { amount: e.target.value });
                            }}
                          />
                        </label>
                      )}
                      <div className="field">
                        <span>
                          {quantityKind(row) === 'exact' ? '单位' : '数量档'}
                        </span>
                        <Select
                          value={
                            quantityKind(row) === 'exact'
                              ? row.unit
                              : row.amountBand
                          }
                          onValueChange={(value) => {
                            if (value)
                              update(
                                index,
                                quantityKind(row) === 'exact'
                                  ? { unit: value }
                                  : { amountBand: value },
                              );
                          }}
                        >
                          <SelectTrigger
                            aria-label={
                              row.name +
                              (quantityKind(row) === 'exact'
                                ? '单位'
                                : '数量档')
                            }
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(quantityKind(row) === 'exact'
                              ? units
                              : bands
                            ).map((value) => (
                              <SelectItem key={value} value={value}>
                                {value}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <label className="field">
                      到期日期（不知道可留空）
                      <input
                        type="date"
                        value={row.expiryDate || ''}
                        onChange={(e) =>
                          update(index, {
                            expiryDate: e.target.value || undefined,
                          })
                        }
                      />
                    </label>
                  </div>
                  <small>
                    {row.targetId === 'choose'
                      ? '已有多份同名食材，请取消这一项，并在库存卡片分别校准余量。'
                      : row.targetId
                        ? mode === 'stocktake'
                          ? '确认后更新已有数量，不累加。'
                          : '将增加所选批次，单位和日期须一致。'
                        : '确认后新增一批；未说数量的只记录“有”。'}
                  </small>
                  {!!row.candidate.warnings.length && (
                    <p className="muted">{row.candidate.warnings.join(' ')}</p>
                  )}
                </fieldset>
              );
            })}
          </div>
          <button
            className="primary voice-save"
            disabled={busy || !selected || blocked}
            onClick={async () => {
              if (saving.current) return;
              saving.current = true;
              setError('');
              let count = 0;
              try {
                const saved = await mutate((s) => {
                  count = confirmVoiceDraft(s, state.dataset, rows);
                });
                if (saved) done(count);
                else
                  setError('没有保存成功，清单已保留。请核对页面错误后重试。');
              } finally {
                saving.current = false;
              }
            }}
          >
            <Check size={17} />
            {busy ? '正在入库…' : `确认 ${selected} 种食材入库`}
          </button>
        </>
      )}
    </section>
  );
}
