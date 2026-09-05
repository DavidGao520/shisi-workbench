"""Bounded, offline CPU transcription. Audio lives only in this process's memory."""
import io
import json
import sys
from pathlib import Path

MAX_BYTES = 3 * 1024 * 1024
MAX_SAMPLES = 65 * 16000


def transcribe(runtime, payload):
    import av
    import numpy as np
    from faster_whisper import WhisperModel
    from opencc import OpenCC

    if not payload or len(payload) > MAX_BYTES:
        raise ValueError("录音为空或太大，请控制在一分钟内。")
    frames, count = [], 0
    with av.open(io.BytesIO(payload)) as container:
        resampler = av.AudioResampler(format="s16", layout="mono", rate=16000)
        for frame in container.decode(audio=0):
            for output in resampler.resample(frame):
                samples = output.to_ndarray().reshape(-1)
                count += samples.size
                if count > MAX_SAMPLES:
                    raise ValueError("录音超过一分钟，请分两次说。")
                frames.append(samples)
        for output in resampler.resample(None):
            samples = output.to_ndarray().reshape(-1)
            count += samples.size
            if count > MAX_SAMPLES:
                raise ValueError("录音超过一分钟，请分两次说。")
            frames.append(samples)
    if not frames or count < 1600:
        raise ValueError("录音太短，请再说一次食材。")
    audio = np.concatenate(frames).astype(np.float32) / 32768.0
    if float(np.sqrt(np.mean(audio * audio))) < 0.001:
        return {"transcript": "", "engine": "whisper-base-local"}
    model = WhisperModel(
        "base", device="cpu", compute_type="int8", cpu_threads=4,
        download_root=str(Path(runtime) / "models"), local_files_only=True,
    )
    segments, _ = model.transcribe(
        audio, language="zh", beam_size=5, vad_filter=True,
        condition_on_previous_text=False,
        initial_prompt="以下是普通话食材盘点，数量单位包括：个、盒、袋、斤、公斤、克、毫升、份。",
        vad_parameters={"min_silence_duration_ms": 350},
    )
    text = "".join(s.text for s in segments if s.no_speech_prob < 0.8).strip()
    return {"transcript": OpenCC("t2s").convert(text)[:10000], "engine": "whisper-base-local"}


if __name__ == "__main__":
    try:
        result = transcribe(sys.argv[1], sys.stdin.buffer.read(MAX_BYTES + 1))
        print(json.dumps(result, ensure_ascii=False))
    except ValueError as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False))
        sys.exit(1)
    except Exception:
        # Do not put audio, paths or model internals into browser errors.
        print(json.dumps({"error": "没能识别这段录音，请检查麦克风后重新录制。"}, ensure_ascii=False))
        sys.exit(1)
