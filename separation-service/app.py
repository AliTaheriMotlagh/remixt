import base64
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Optional

import imageio_ffmpeg
import librosa
import numpy as np
import requests
import soundfile as sf
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Remix Studio Separation Service")

MODEL_NAME = "htdemucs"
FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()
FFMPEG_DIR = os.path.dirname(FFMPEG_EXE)


class SeparateRequest(BaseModel):
    track_id: str
    input_url: str


def compute_peaks(mono: np.ndarray, buckets: int = 600) -> list[float]:
    n = len(mono)
    if n == 0:
        return [0.0] * buckets
    bucket_size = max(1, n // buckets)
    peaks: list[float] = []
    for i in range(0, n, bucket_size):
        chunk = mono[i : i + bucket_size]
        if chunk.size == 0:
            continue
        peaks.append(float(np.max(np.abs(chunk))))
    peaks = peaks[:buckets]
    while len(peaks) < buckets:
        peaks.append(0.0)
    peak_max = max(peaks) or 1.0
    return [round(p / peak_max, 4) for p in peaks]


def load_and_encode(src_path: Path) -> tuple[float, list[float], np.ndarray, int, str]:
    data, sr = sf.read(str(src_path))
    mono = data.mean(axis=1) if data.ndim > 1 else data
    duration = len(mono) / sr

    # Stems get shipped as base64 over JSON and then re-uploaded to Blob
    # storage, so encoding to mp3 here (vs. raw PCM wav) cuts that transfer
    # by ~85-90% — the dominant cost once a track is more than a minute or
    # two long.
    with tempfile.NamedTemporaryFile(suffix=".mp3") as tmp:
        env = os.environ.copy()
        env["PATH"] = FFMPEG_DIR + os.pathsep + env.get("PATH", "")
        result = subprocess.run(
            [FFMPEG_EXE, "-y", "-i", str(src_path), "-b:a", "192k", tmp.name],
            env=env,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg mp3 encode failed: {result.stderr[-2000:]}")
        tmp.seek(0)
        encoded = base64.b64encode(tmp.read()).decode("ascii")

    return duration, compute_peaks(mono), mono, sr, encoded


def detect_bpm(mono: np.ndarray, sr: int) -> Optional[float]:
    try:
        # Beat stem's percussive content tracks tempo far more reliably
        # than a full mix or vocals-only signal.
        harmonic_free = librosa.effects.percussive(mono.astype(np.float32))
        tempo, _ = librosa.beat.beat_track(y=harmonic_free, sr=sr)
        bpm = float(np.atleast_1d(tempo)[0])
        if not np.isfinite(bpm) or bpm <= 0:
            return None
        return round(bpm, 1)
    except Exception:
        return None


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_NAME}


@app.post("/separate")
def separate(req: SeparateRequest):
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)

        try:
            download = requests.get(req.input_url, timeout=120)
        except requests.RequestException as exc:
            raise HTTPException(
                status_code=400, detail=f"could not reach input_url: {exc}"
            )
        if download.status_code != 200:
            raise HTTPException(
                status_code=400,
                detail=f"could not download input_url: HTTP {download.status_code}",
            )
        input_path = tmp_path / "input_audio"
        input_path.write_bytes(download.content)

        env = os.environ.copy()
        env["PATH"] = FFMPEG_DIR + os.pathsep + env.get("PATH", "")

        cmd = [
            sys.executable,
            "-m",
            "demucs.separate",
            "-n",
            MODEL_NAME,
            "--two-stems",
            "vocals",
            "-o",
            tmp,
            str(input_path),
        ]
        result = subprocess.run(cmd, env=env, capture_output=True, text=True)
        if result.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=f"demucs failed: {result.stderr[-4000:]}",
            )

        src_dir = tmp_path / MODEL_NAME / input_path.stem
        vocals_src = src_dir / "vocals.wav"
        beat_src = src_dir / "no_vocals.wav"

        if not vocals_src.exists() or not beat_src.exists():
            raise HTTPException(
                status_code=500,
                detail=f"demucs did not produce expected output in {src_dir}",
            )

        duration, vocals_peaks, _, _, vocals_b64 = load_and_encode(vocals_src)
        _, beat_peaks, beat_mono, beat_sr, beat_b64 = load_and_encode(beat_src)
        bpm = detect_bpm(beat_mono, beat_sr)

    return {
        "status": "ok",
        "duration": duration,
        "bpm": bpm,
        "vocals_mp3_base64": vocals_b64,
        "beat_mp3_base64": beat_b64,
        "vocals_peaks": vocals_peaks,
        "beat_peaks": beat_peaks,
    }
