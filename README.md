# Remixt

A browser-based DAW for remixing songs: upload a track, it's automatically
split into a vocal stem and a beat (instrumental) stem, both land in a
shared library, and the Studio lets you pull any vocal onto any beat, match
their BPMs, adjust pitch, mix levels, and publish the result as a remix
under your artist name.

Everything runs on your own machine — local Postgres, local file storage,
local separation. No cloud accounts, no API keys, nothing leaves the
computer.

## Architecture

- **`web/`** — Next.js (TypeScript) app: auth, upload, library, the Studio
  DAW UI (Web Audio API + SoundTouch for pitch/tempo), remix gallery, artist
  profiles. Data lives in a local Postgres running in Docker.
- **`separation-service/`** — Python FastAPI microservice that runs
  [Demucs](https://github.com/facebookresearch/demucs) (`htdemucs`, two-stem
  mode) to split a song into vocals and beat, and detects BPM with
  `librosa`. It's stateless: given a URL, it downloads the audio, runs
  Demucs, and returns both stems as base64 mp3 plus waveform peaks and BPM.
- **`storage/`** — where audio actually lives: `uploads/` for the originals
  you upload, `stems/<track-id>/` for the separated vocals and beat. Git
  ignores it.

Upload flow: the browser posts the file to `/api/tracks/upload`, which
streams it to `storage/uploads/`. `/api/tracks/register` then creates the
track row and calls the separation service with a `http://127.0.0.1:3000/api/files/…`
URL pointing back at that file. When Demucs finishes, Next.js writes the two
stems to `storage/stems/<track-id>/` and records their keys. The UI polls
track status and flips to "ready" once both stems exist. Playback goes
through `/api/audio/stem/<id>`, which serves the file from disk with HTTP
Range support so seeking and scrubbing work.

## Running it

You need Docker (for Postgres) and Python 3.9+ with the separation
service's virtualenv already created (`separation-service/venv`).

```bash
./start-dev.sh
```

That starts the Postgres container (creating it and applying the schema on
first run), the separation service on `:8000`, and the Next.js app on
`:3000`. Open http://localhost:3000.

To run the pieces separately instead:

```bash
docker start remixt-test-pg      # Postgres on :5433
./separation-service/run.sh      # separation API on :8000
cd web && npm run dev            # Next.js app on :3000
```

### First-time setup

If `separation-service/venv` doesn't exist yet:

```bash
cd separation-service
python3 -m venv venv
venv/bin/pip install -r requirements.txt
```

If the database container doesn't exist yet, `start-dev.sh` creates it and
runs the schema. To do it by hand:

```bash
docker run -d --name remixt-test-pg -e POSTGRES_PASSWORD=devpassword \
  -e POSTGRES_DB=remixt -p 5433:5432 postgres:16-alpine
cd web && node scripts/migrate.mjs
```

### Configuration

`web/.env.local` holds everything, and the defaults already match the setup
above:

| Variable | Meaning |
| --- | --- |
| `DATABASE_URL` | local Postgres connection string |
| `STORAGE_DIR` | where uploads and stems are written (`../storage`) |
| `PUBLIC_BASE_URL` | this app's URL, used by the separation service to fetch originals |
| `SEPARATION_SERVICE_URL` | the separation service's URL |
| `SESSION_SECRET` | signs session cookies |

## Notes

- Separation runs on CPU. A ~3-4 minute song takes roughly 1-3 minutes to
  split; a track stuck in "processing" for over 20 minutes is swept to
  "failed" so it doesn't hang around forever.
- The `htdemucs` model (~80MB) downloads on the first separation request and
  is cached in `~/.cache/torch/` after that.
- `web/.npmrc` points npm's cache at a project-local folder — this repo's
  dev environment had a permissions issue with the global npm cache; this
  sidesteps it and isn't required elsewhere.
- Sessions are a signed JWT in an HTTP-only cookie.
- Max upload size is 60MB, audio formats: mp3, wav, m4a, flac, ogg, aac.
- Pitch and BPM-matching run client-side (SoundTouch, offline-rendered —
  not a live audio-worklet) — changing a lane's pitch or tempo re-renders
  that stem's buffer once, like a DAW "freeze" operation, then plays back
  normally. Keeps multi-lane sync simple.
