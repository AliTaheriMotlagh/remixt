# Remixt

A browser-based DAW for remixing songs: upload a track, it's automatically
split into a vocal stem and a beat (instrumental) stem, both land in a
shared library, and the Studio lets you pull any vocal onto any beat, match
their BPMs, adjust pitch, mix levels, and publish the result as a remix
under your artist name.

## Architecture

- **`web/`** — Next.js (TypeScript) app: auth, upload, library, the Studio
  DAW UI (Web Audio API + SoundTouch for pitch/tempo), remix gallery, artist
  profiles. Data lives in Postgres (works with any Postgres — built and
  tested against [Neon](https://neon.tech), which is what Vercel's Storage
  tab offers today). Audio files live in [Vercel Blob](https://vercel.com/docs/vercel-blob).
- **`separation-service/`** — Python FastAPI microservice that runs
  [Demucs](https://github.com/facebookresearch/demucs) (`htdemucs`, two-stem
  mode) to split a song into `vocals.wav` and `beat.wav`, and detects BPM
  with `librosa`. It's stateless: given a URL, it downloads the audio, runs
  Demucs, and returns the two stems as base64 WAV data plus waveform peaks
  and BPM — no disk persistence, no Blob credentials needed there. Deploys
  as a Docker container to Railway, Render, or anywhere else that runs one.

Upload flow: the browser uploads the original file directly to Vercel Blob
(bypassing Vercel's ~4.5MB function body limit), then tells Next.js the
resulting URL. Next.js creates the track row and calls the separation
service with that URL. When separation finishes, Next.js uploads the two
returned stems to Blob itself (via the official `@vercel/blob` SDK) and
records their URLs. The UI polls track status and flips to "ready" once
both stems exist.

## Running it locally

You need a Postgres database. Easiest local option — Docker:

```bash
docker run -d --name remixt-pg -e POSTGRES_PASSWORD=devpassword \
  -e POSTGRES_DB=remixt -p 5433:5432 postgres:16-alpine
```

Then, in `web/`:

```bash
cp .env.example .env.local
# edit .env.local: DATABASE_URL, and BLOB_READ_WRITE_TOKEN once you have one
node scripts/migrate.mjs   # creates tables
```

Start everything:

```bash
./start-dev.sh
```

This starts the separation service on `:8000` and the Next.js app on
`:3000`. Open http://localhost:3000. Or run them separately in two
terminals:

```bash
./separation-service/run.sh   # separation API on :8000
cd web && npm run dev         # Next.js app on :3000
```

### About uploads in local dev

Uploading a song requires a real Vercel Blob store (client uploads go
straight to Blob, there's no local-disk fallback). Everything else —
signup, the studio, browsing an existing library, remixing, publishing —
works with just the local Postgres database. To test uploads locally, add
a Blob store to a Vercel project (see below) and pull its token into
`.env.local` with `vercel env pull`.

### First separation run

- The Docker image for `separation-service` pre-downloads the ~80MB
  `htdemucs` model at build time, so it's ready immediately — no first-
  request delay in production. Running it locally via `venv` instead (as
  `run.sh` does) downloads the model on the very first request.
- Separation runs on CPU. A ~3-4 minute song takes roughly 30-90s to split.

## Deploying

### 1. Database — Neon (via Vercel's Storage tab, or neon.com directly)

Create a Postgres database, grab its connection string, and run the schema
against it once:

```bash
DATABASE_URL="postgresql://...?sslmode=require" node web/scripts/migrate.mjs
```

### 2. File storage — Vercel Blob

In your Vercel project → Storage → Create Database → Blob. This adds
`BLOB_READ_WRITE_TOKEN` to your project's environment variables
automatically.

### 3. Separation service — Railway or Render

Point either at the `separation-service/` directory (it has a Dockerfile,
so "deploy from Dockerfile" works out of the box on both). No environment
variables are required — it's stateless. Note the public URL it gives you.

### 4. Web app — Vercel

Import the repo, set the **root directory to `web/`**, and add these
environment variables:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | your Neon connection string |
| `BLOB_READ_WRITE_TOKEN` | added automatically by the Blob store, above |
| `SEPARATION_SERVICE_URL` | your Railway/Render service's public URL |
| `SESSION_SECRET` | a long random string |

Deploy. That's it — `next build` on Vercel handles the rest.

## Notes

- `web/.npmrc` points npm's cache at a project-local folder — this repo's
  dev environment had a permissions issue with the global npm cache; this
  sidesteps it and isn't required elsewhere.
- Sessions are a signed JWT in an HTTP-only cookie.
- Max upload size is 60MB, audio formats: mp3, wav, m4a, flac, ogg, aac.
- Pitch and BPM-matching run client-side (SoundTouch, offline-rendered —
  not a live audio-worklet) — changing a lane's pitch or tempo re-renders
  that stem's buffer once, like a DAW "freeze" operation, then plays back
  normally. Keeps multi-lane sync simple.
