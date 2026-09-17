#!/bin/bash
# Starts the vocal/beat separation microservice (FastAPI + Demucs) on port 8000.
set -e
cd "$(dirname "$0")"
source venv/bin/activate
export PATH="$(dirname "$(python3 -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())')"):$PATH"
exec uvicorn app:app --host 127.0.0.1 --port 8000
