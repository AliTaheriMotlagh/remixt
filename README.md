# Remixt

[![Remixt — split any song into vocals and beat, then remix it your way. Click to watch the video.](remixt-share-1920x1080.png)](https://remixt-free.vercel.app)

**[Try it free → remixt-free.vercel.app](https://remixt-free.vercel.app)** · [▶ Watch the 16-second video](https://remixt-free.vercel.app)

A browser-based DAW for remixing songs: upload a track, it's automatically
split into a vocal stem and a beat (instrumental) stem, both land in a
shared library, and the Studio lets you pull any vocal onto any beat, match
their BPMs, adjust pitch, mix levels, and publish the result as a remix
under your artist name.

Songs are split **in the browser** — the same Demucs model the project
used to run in Python, exported to ONNX and run with ONNX Runtime Web
(WebGPU where available, WebAssembly otherwise). The server never touches
an AI model, which is what lets the whole thing run on free hosting.

## Architecture

- **`web/`** — Next.js (TypeScript) app: auth, upload, library, the Studio
  DAW UI (Web Audio API + SoundTouch for pitch/tempo), remix gallery, artist
  profiles, and the in-browser song splitter.
- **Postgres** — accounts, tracks, stems, remixes. Local Docker container
  in development; Neon (or the one inside the Docker image) when deployed.
- **Stem storage** — Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set,
  Cloudflare R2 when `R2_*` is, otherwise local disk under
  `storage/stems/<track-id>/` (gitignored).
- **`separation-service/`** — the old Python/Demucs splitter. Nothing uses
  it any more; it's kept only for reference and can be deleted.

Upload flow, all in the browser tab:

1. The file is decoded and resampled to 44.1 kHz (`lib/client/splitter.ts`).
2. A Web Worker (`lib/client/splitter.worker.ts`) runs Demucs, sums
   drums + bass + other into the beat, encodes both stems to 192 kbps MP3,
   and computes waveform peaks and the BPM.
3. `POST /api/tracks` creates the track and returns an upload URL per stem
   — a signed R2 URL, or `PUT /api/tracks/<id>/stems/<kind>` locally.
4. The browser uploads both MP3s, then `POST /api/tracks/<id>/complete`
   checks they're there and marks the track ready.

The original song never leaves the user's device. The model (~172 MB) and
ONNX Runtime (~28 MB) download once — only when the user adds a song or
starts mining, never just for opening a page, with a progress pill in the
corner — and are kept in Cache Storage, so later visits load them from disk. Playback goes
through `/api/audio/stem/<id>`: a redirect to R2's public URL, or a
Range-capable stream from disk.

Pages are served cross-origin isolated (COOP `same-origin`, COEP
`credentialless`, in `next.config.ts`) so the WebAssembly fallback can use
every CPU core.

## Deploying it

Free on Vercel (with Neon and Vercel Blob, all from Vercel's dashboard),
or as one Docker image on any server — step by step in [DEPLOY.md](DEPLOY.md).

## Running it

You need Docker (for Postgres) and Node 20+.

```bash
./start-dev.sh
```

That starts the Postgres container (creating it and applying the schema on
first run) and the Next.js app on `:3000`. Open http://localhost:3000.

To run the pieces separately instead:

```bash
docker start remixt-test-pg      # Postgres on :5433
cd web && npm run dev            # Next.js app on :3000
```

If the database container doesn't exist yet, `start-dev.sh` creates it and
runs the schema. To do it by hand:

```bash
docker run -d --name remixt-test-pg -e POSTGRES_PASSWORD=devpassword \
  -e POSTGRES_DB=remixt -p 5433:5432 postgres:16-alpine
cd web && node scripts/migrate.mjs
```

### Configuration

`web/.env.local` holds everything:

| Variable | Meaning |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `SESSION_SECRET` | signs session cookies |
| `STORAGE_DIR` | where stems go when R2 isn't configured (`../storage`) |
| `BLOB_READ_WRITE_TOKEN` | store stems in Vercel Blob (Vercel sets it when a Blob store is connected) |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` | store stems in Cloudflare R2 instead (see DEPLOY.md) |
| `NEXT_PUBLIC_STEM_BITRATE` | MP3 bitrate of the stems, kbit/s (default 192; 128 saves ~30% space) |
| `NEXT_PUBLIC_DEMUCS_MODEL_URL` | where browsers download the model (default: Hugging Face) |
| `NEXT_PUBLIC_ORT_BASE_URL` | where browsers load ONNX Runtime from (default: `/ort/`, copied from `node_modules` before dev/build) |

## The Studio

Everything below the transport is a project on one timeline, measured
against a project tempo you set (type it, or tap it in). It's laid out like
a DAW: slim lane headers (name, mute, solo, level) beside one zoomable
timeline, and an inspector under it for whichever lane you clicked — mix,
tempo & key, effects, edit tools and matching (a sheet on phones).
(`components/studio/Arrangement.tsx`, `LaneInspector.tsx`)

- **Selecting and editing clips** — click a clip, Shift/⌘-click to add
  more, or drag across empty space to lasso clips across lanes; on a touch
  screen tap, or turn on ☑ Select to tap several. Then move them together,
  Alt-drag a copy, or use the toolbar, the keyboard, or **right-click
  (long-press on touch)** for everything: split here / at the playhead,
  copy, cut, paste at the playhead, duplicate, repeat ×2/×4/×8 or loop to
  fill 16 bars, reverse, ½×/2× speed, quantize to the beat or bar, stutter,
  loop the selection, send to a sample pad, cut out silences, back to the
  whole take, delete. Lanes, the empty timeline and the ruler have menus
  of their own. Every edit is one undo step. The editing itself is pure
  functions in `lib/client/clipEdit.ts` (tested in `tests/clip-edit.test.ts`),
  shared by the menu, the toolbar and the shortcuts (`clipCommands.ts`).
- **Shaping and chopping clips** — every clip has its own level (±3 dB
  steps), mute (⇧M) and fade in/out, drawn on the clip and heard in the
  export. Slice a clip at every bar, beat, 1/8 or 1/16 (⇧X slices at the
  grid), join pieces that follow on back into one (⌘J), trim the start or
  end at the playhead, or fit a loop to exactly 1, 2, 4 or 8 bars (it's
  sped up or slowed down, pitch unchanged). The grid snapping uses is a
  bar, ½ bar, beat, 1/8 or 1/16 (the transport, or G to step through it).
- **Whole track or clips** — every lane header shows ▬ (one whole
  track) or ✂ and its number of clips; click it (or use the lane menu, a
  clip's menu or the inspector's Edit tab) to split the lane into clips —
  phrase by phrase at its silences, or every 1, 2, 4 or 8 bars — or to
  make it one whole track again (the first clip stays where it is).
- **Time** — right-click the ruler to insert 1–8 bars of space into the
  whole song, or, with a loop set, delete the loop's time from every lane
  (ripple delete): clips, automation and sections all move to close the
  gap.
- **Lanes** — rename them (lane menu, or the inspector's Mix tab) and move
  them up and down; names are saved with the remix.
- **Rhythm** — the lane menu (and the inspector's Edit tab) draws a
  sidechain-style pump on every beat or a 1/8 or 1/16 trance gate onto
  the lane's volume — over the loop when one is set, else the whole lane.
  (`lib/client/automationPatterns.ts`)
- **Master** — the transport's 🎚 Master: one-tap mastering presets
  (Clean, Loud, Warm, Bright, Club) and the low, high and glue (bus
  compression with make-up gain) behind them, in front of the fader and
  the safety limiter. Saved with the remix; single-lane exports stay clean.
- **Zoom** — ⌘/Ctrl-scroll, a trackpad pinch or two fingers on a touch
  screen; Z fits the whole song again. The view follows the playhead.
- **✨ AI producer** — made for people who've never used a music app. A
  vocal from one song over a beat from another rarely sounds good as it
  lands, so the panel opens, listens to both (speed, key, bars, the
  vocal's chorus, the beat's drop) and shows:
  - a **Mix check** in plain words — speed, on the beat, key, volume, the
    ending — each green, amber or red with a **Fix**. Fixes change timing,
    key and volumes only, never effects (how the vocal sounds is yours).
    Fixes build on each other: pressing a second one adds it to the first,
    all worked out together, so fixing the ending never undoes the timing;
  - **✨ Make it sound good** — one tap: speeds matched, every line on the
    beat (the chorus on the beat's drop when there is one), key fixed, the
    beat looped or the outro trimmed, volumes evened — no effects added;
  - **🔗 Sync templates** — the goal of every remix is the vocal, the
    beat and every other lane moving as one, so these come first: Perfect
    sync (least stretching — the best start), Beat leads, Vocal leads
    (the beat and everything else follow the singer's speed and key),
    Meet halfway, Vocal from bar 1, 8-bar intro and No gaps. Each matches
    tempo, key and timing for **all** lanes: the beat's own drums, bass
    and melody (and a vocal's clean split) follow the lane they came from;
    any other beat or vocal is stretched to the project tempo (half or
    double time when that bends it less), started on the beat's nearest
    bar and shifted into key; vocal layers follow their lead. The Mix
    check's "Every lane" row names any lane at another speed, and its Fix
    (and ✨ Make it sound good) syncs them the same way;
  - **Styles** — a whole remix in one tap: Radio, Club, TikTok cut, Lo-fi,
    Chill, Hard bootleg, Festival, **Slowed + reverb** and **Sped up**
    (the whole song slower and lower, or faster and higher, like a record
    at another speed) — and **🎲 Surprise me**;
  - **Drops & moments** — chorus on the drop, the big drop (build-up, cut,
    stutter), a build-up, stutters, a reverse swell, a muffled intro, an
    acapella moment, a chorus lift, a beat switch — and drum drops, a
    melody-only intro and breakdowns made with the beat's own drums, bass
    and melody: songs are already split into those on upload, so trying one
    simply swaps the beat for its parts from the library (undo puts it
    back) — nothing is split again;
  - **Vocal layers** — a double (two quiet copies panned left and right,
    a few milliseconds late), an octave underneath, an airy octave above:
    extra lanes that follow the vocal wherever the AI moves or re-keys it,
    and can be stacked on top of any style;
  - **Rhythm moments** — a pumping beat (a dip on every beat) and a gated
    build into the drop (or the vocal's entrance);
  - **Master it** — the mastering presets, with the one that suits the
    style you're trying (or kept) marked as the AI's pick;
  - **Find a match** — library beats (or vocals) ranked by how little
    they'd need stretching to fit, half and double time included, to
    preview and add in one tap (`lib/client/matchFinder.ts`);
  - **Fine-tune** — the vocal (and its layers) earlier/later (½ or ⅛ beat), louder/softer,
    higher/lower; the beat's level; the whole song faster/slower (the
    arrangement keeps its shape); how much space around the voice;
  - **More options** — song shapes, speed choices, mix sounds, other fixes.

  The AI lays a vocal out one clip per section ("Verse 1", "Chorus"…,
  named on the timeline), splitting a section into lines only where the
  beat's tempo moves enough to need it. A vocal over its own song's beat
  goes back exactly as sung.
- **🧩 Split with Demucs** — on any lane (right-click → Split with
  Demucs…): pick vocals, drums, bass and/or melody, and they're laid on the
  timeline exactly where the lane is, optionally replacing it. If the
  song's parts are already in the library they're added instantly;
  otherwise the same in-browser model as uploads runs on this computer and
  the result is saved to your library. (`lib/client/laneSplit.ts`,
  `lib/client/beatParts.ts`, `components/studio/SplitLaneDialog.tsx`)

  At the top of the panel, **✂ Cut into lines / ▬ Keep tracks whole**
  decides how the AI may edit: cut the vocal at its silences and lock
  every line to the beat (the tightest fit), or never cut anything — then
  tracks are only moved, stretched, re-keyed and levelled, ideas that
  only work by chopping (stutters, swells, chorus loops) aren't offered,
  and the vocal plays as sung from where its first line lands on the
  beat. The choice is remembered.

  The panel has four tabs — **Sync** (Mix check, Make it sound good,
  cutting, sync templates, find a beat), **Styles**, **Moments** (drops,
  vocal layers, other fixes) and **Mix** (mastering, sounds, fine-tune) —
  each showing how many of its ideas are on. **Options stack**: choosing
  one never throws the others away; only the same kind of choice makes
  way (one timing — a style or song shape; one sound; the Mix check's
  fixes merge into one), and the bottom bar says when that happens. The
  sync template you pick is a setting every idea uses, so a style picked
  afterwards is synced your way, and changing the sync or the cutting
  mode works whatever is on out again instead of taking it off. ◀ ▶ step
  through ideas of the same kind as the last one tried.

  Tapping anything plays it straight away from where the playhead is —
  an idea never moves it (one that makes the whole song faster or
  slower keeps you on the same spot in the song); ⤒ Best part in the
  bottom bar jumps to the best moment to hear the idea. It's heard from
  the original mix; a moment
  tapped while a style is on joins it. The bar at the bottom flips
  **Before / After**, says what changed, and **Keep it** makes it one undo
  step (⌘Z while trying just goes back). It's all the studio's own
  analysis, in the browser — nothing to install.
  (`lib/client/aiIdeas.ts`, `lib/client/aiTrial.ts`, `components/studio/AiProducer.tsx`)

- **Timing** — each lane has its own start position on the timeline. Drag
  the clip, nudge it by a beat or a bar, or drop it at the playhead; with
  Snap on, drags move in whole beats. Moving a clip while the transport
  runs is heard immediately — no need to pause and play again.
- **Tempo & key** — per-lane BPM (editable, since detection sometimes
  halves or doubles), "Match" to stretch one lane to the project tempo,
  "Match all lanes" for the whole project, plus pitch in semitones and a
  free speed control.
- **Key** — each lane's key is detected in the browser when it's added
  (shown as e.g. "A min · 8A" with its Camelot code, and editable), and
  "Match" / "Match keys" pitch-shifts lanes onto the project key — the
  key of the first beat lane. Relative major/minor count as a match.
- **The arrangement engine** (behind the AI producer and each lane's
  Match) — listens to every lane once and fits them together,
  without ever changing pitch (keys are only reported; the lane's Key →
  Match shifts one if you want). It sharpens each BPM against the song's
  real hits, locks tempo to the beat (reading a vocal as half/double time
  when that needs less stretching), puts the beat's downbeats on the bar
  lines, then **arranges each vocal phrase by phrase**: the vocal is cut
  at its silences (which also drops the original song's bleed between
  lines), and every phrase is placed on the matching bar of the beat at
  the same spot in the bar it was sung, re-locked to the beat's actual
  hits so live or drifting recordings stay together. It comes in after
  the beat's intro, keeps the original song's spacing, shortens long
  instrumental breaks, and leaves out sections that run past the end of
  the beat. The vocal's bar lines come from its original beat stem (the
  other half of its song, via `/api/stems/<id>/partner`); without it,
  each section is kept as sung and slid onto the beat by its syllables.
  Levels and a starting FX chain round it off. It lists every change and
  can be undone. It's signal analysis (`web/src/lib/client/analysis.ts`,
  `arrange.ts`), not a remote model — nothing leaves the browser.
  Each phrase is also stretched a little (up to 8%, pitch unchanged) to
  follow a beat whose tempo drifts, long unbroken phrases are cut at a
  breath every couple of bars so they stay locked too, and the report
  warns when it couldn't tell which beat is the "one" (the lane's ±½bar
  nudges fix that in one click).
- **🎚 Match on each lane** — pair a vocal with a beat and pick how they
  fit: which tempo to keep (or meet in the middle — pitch never changes),
  when the vocal comes in, the song's shape (as sung, no long breaks,
  chorus first, fill the beat with the chorus, a short version, or the
  chorus looped), a timing fix of a beat or half a bar, vocal level and
  sound. The chorus is found as the section whose notes come back most.
  Apply, change a choice and apply again to compare, undo to go back.
  (`lib/client/matchOptions.ts`, `pairMatch.ts`, `components/LaneMatchPanel.tsx`)
- **Clips** — a lane plays its whole stem until it's cut: then each clip
  can be moved, trimmed by its edges, reversed or sped up on its own, and
  "whole take" goes back to the uncut stem. Arrangements are saved with
  the remix.
- **Mixing** — volume, mute, solo, pan, stereo width, a 3-band EQ, high-
  and low-pass filters, saturation, fades in/out, and a master fader that
  runs into a safety limiter.
- **Effects** — per-lane reverb (adjustable room size) and a delay that
  locks to the project tempo (1/2 through 1/16, dotted included), with
  feedback. One-click presets per lane type: Air, Hall, Slapback, Dub
  throw, Radio and Wide double for vocals; Punch, Lo-fi and Underbed for
  beats. Vocal presets also switch on a levelling compressor and a
  high-pass, which is what a raw separated vocal usually needs.
- **Transport** — play/pause (space), stop (Esc), a bars.beats counter,
  a loop region you drag across the ruler (L toggles it), a metronome
  click, and the project tempo and key with one-tap "fit every lane". ?
  lists every keyboard shortcut.
- **Export** — "Export WAV" bounces the project through the same graph you
  just heard into a 16-bit stereo WAV, including the reverb/delay tails;
  with a loop set you can export just that region, and each lane has its
  own export button for pulling out a single treated acapella or beat.

Previews (the ▶ buttons in the library) all run through one shared player,
so only one thing plays at a time and the bar along the bottom of the
window always has a stop button for it.

## Community

- **Follow artists** — a follow button and follower counts on every artist
  page; the Remixes page has Latest, 🔥 Trending (likes and comments from
  others in the last 7 days) and Following tabs.
- **Comments** on remixes — anyone can read, signed-in listeners can post
  (up to 500 characters, 5 a minute); authors and the remix's owner can
  delete them.
- **XP and levels** — worked out live from what an artist has done:
  publishing a remix 100, uploading a song 25, a like from someone else 15,
  a follower 20, liking others' remixes 2, commenting on others' remixes 5,
  every 5 plays 1. Nothing done to your own work counts. Eleven levels,
  Newcomer to Icon, with a progress bar on the artist page.
- **Badges** — First Remix, Prolific, Crate Digger, First Fan, Hit Maker,
  Crowd Pleaser, Viral, Scene Builder, Tastemaker, In the Mix; artists see
  their progress towards the ones they don't have yet.
- **Leaderboard** (`/leaderboard`, "Top" in the nav) — top artists by XP,
  trending remixes this week and the most played.

All of it is in `web/src/lib/social.ts`; the `follows` and `remix_comments`
tables are created on first use (and are in `schema.sql`).

## Notes

- Splitting speed depends on the visitor's device: about 1–2 minutes per
  song with WebGPU, several minutes on the CPU. A track whose upload never
  finishes (tab closed mid-way) is swept to "failed" after 20 minutes.
- `web/.npmrc` points npm's cache at a project-local folder — this repo's
  dev environment had a permissions issue with the global npm cache; this
  sidesteps it and isn't required elsewhere.
- Sessions are a signed JWT in an HTTP-only cookie.
- Songs can be up to 15 minutes; any format the browser can decode (mp3,
  wav, m4a, flac, ogg, aac in current browsers).
- Remix lanes persist their effect rack and BPM override in
  `remix_lanes.settings_json`, and the project tempo, master level and loop
  region live in `remixes.project_json` — JSON columns so the mixer can
  grow without a migration per knob. Older remixes fall back to defaults.
- Pitch and BPM-matching run client-side (SoundTouch, offline-rendered —
  not a live audio-worklet) — changing a lane's pitch or tempo re-renders
  that stem's buffer once, like a DAW "freeze" operation, then plays back
  normally. Keeps multi-lane sync simple.

ali