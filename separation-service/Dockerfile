FROM python:3.11-slim

WORKDIR /app

# libsndfile covers soundfile on platforms where its wheel doesn't bundle it.
# build-essential is needed because some transitive deps (e.g. librosa's
# Rust-based `sphn`) ship no prebuilt wheel for every platform and fall
# back to compiling from source.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 build-essential \
    && rm -rf /var/lib/apt/lists/*

# CPU-only torch/torchaudio first — the default PyPI build pulls in a much
# larger CUDA-enabled wheel that's dead weight on a CPU-only host.
RUN pip install --no-cache-dir --timeout 120 --retries 10 torch==2.8.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir --timeout 120 --retries 10 -r requirements.txt

COPY app.py .

# Pre-warm the htdemucs model weights (~80MB) into the image so the first
# real request doesn't pay a one-time download + doesn't need runtime
# internet access to Meta's servers.
RUN python3 -c "\
import numpy as np, soundfile as sf; \
sf.write('/tmp/warmup.wav', np.zeros((44100, 2), dtype=np.float32), 44100)" \
    && python3 -m demucs.separate -n htdemucs --two-stems vocals -o /tmp/warmup_out /tmp/warmup.wav \
    && rm -rf /tmp/warmup.wav /tmp/warmup_out

EXPOSE 8000
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}"]
