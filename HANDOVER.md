# Handover — what's in flight

The running to-do list across sessions. Read this first, then `git status`. Update it before a session ends.
The AI producer's own history and measurements are in `AI_REMIX_PLAN.md`.

## The owner's list (2026-11-16)

1. Phone uploads never reaching the split queue ("told you 10 times").
2. Library and Upload pages: play stops working after playing a few songs.
3. Clip: beat and vocal artist labels; a part picker that shows the waveforms; more options; lyrics mistimed after the vocal is edited; export in the background; the Studio playable while a clip exports.
4. Lyrics: smarter finding (judged against the vocal in the lane, its length); easier editing; timing kept after vocal edits.
5. "Refresh request" sometimes not happening on phones.
6. AI remix: finish last session's checks (see `AI_REMIX_PLAN.md` → STATUS → Left).
7. Tests for every part so nothing breaks again; a cheap way to test on a simulated phone, written down.

## Status

### 1. Phone uploads — DONE (uncommitted)

Cause found, three parts:
- The stall timer counted "bytes handed to the phone" as progress. On a slow line the last megabyte is still in the phone's buffers when the browser says 100%, so the request was stopped after 45 s and sent again from 0 — for ever, because a try that "made headway" never counted against the retries.
- The store only takes a song whole (or in 8 MB parts): any stall cost the lot.
- Two requests (create job, mark queued) had no time limit and could hang on a half-dead line.

What changed:
- `web/src/lib/client/directUpload.ts`: `tailWait`/`stallWatch` (honest wait once the body is handed over), `retrying` (headway restarts are limited), a `Wire` under `sender()` so tests can play a line, and the relay rebuilt: slices keyed by byte offset, cut to about 5 s of what the line really carries (64 KB–3 MB, measured from answers), a size ceiling learned from failures, resume (`RelayResume`), phones and tablets go relay-first.
- `web/src/lib/uploadRelay.ts`: `?relay=<s>&at=<byte>` slices, a join by list that is idempotent and names missing slices. The old `part=`/`parts=` calls still work.
- `web/src/lib/client/splitQueue.ts` `queueFile`: time limits (`postRetrying`), keeps the job on a line failure and carries on into it (`resume` on `POST /api/split-jobs`).
- `web/src/lib/client/uploads.ts`: resume state in localStorage (`remixt.upload.resume.<id>`), a try that saved more isn't counted as a failure, an abort nobody asked for is retried instead of freezing the row.
- `web/src/lib/storage.ts`: the local-disk target has a relay too, so development runs the phone's real path.
- `web/src/lib/splitQueue.ts`: an uploading job is abandoned after an hour of *silence* (`stillUploading`), not an hour after it was made.
- Queue card says when no computer is helping (`SplitQueue.tsx`).

Checked: `tests/upload-sim.test.ts` (21 cases in made-up time), `tests/direct-upload.test.ts`, relay cases in `tests/split-queue.test.ts`, and `scripts/phone-upload.mjs` in real Chrome (dead line for 25 s, reload half-way: nothing sent twice).

Not checkable from here: the production store (Vercel Blob). The relay writes each slice with `putObject` and joins by reading them back; that code path is the same one the old relay used.

### 2. Library / Upload play stops after a few — DONE (uncommitted)

Cause, confirmed in WebKit (Safari's engine, so every iPhone browser): a stem kept on the device is stored as bare bytes with no type, and Safari refuses to play a typeless blob (`NotSupportedError`). So a stem played once on Upload (which keeps it) or opened in the Studio would not play again; the player then stopped silently instead of streaming it. Also: stems were being downloaded for keeping alongside the stream, six requests at a time, starving playback on a phone.

- `web/src/lib/client/previewPlayer.ts`: `playable()` types the blob; sources are tried in order (kept copy → store → through the app) on a failed start and on a mid-stream error; `loading` and `error` in the state; a double tap no longer cancels; keeping is queued, one at a time, in 512 KB slices, only while nothing plays (`untilQuiet`, `Pace` in `stemFetch.ts`).
- `PreviewBar`, Upload rows and Library rows show a spinner while loading; the bar says when a stem couldn't be played.
- Tests: `tests/preview-player.test.ts` (12). Browser check: `node scripts/preview-play.mjs` (`ENGINE=webkit` for Safari's engine).

### 5. "Refresh request" (the update prompt) missing on phones — DONE (uncommitted)

Cause: the version check had no time limit, so a request frozen when the phone suspended the page left it "busy" for good; and a check that failed as the app resumed (network not back yet) counted as done, the next being ten minutes away.

- `web/src/lib/client/versionCheck.ts` (new) + `UpdatePrompt.tsx`: time limit, a stuck request is asked again, failed checks retried after 3/10/30 s, also checks on `focus` and `pageshow`.
- Tests: `tests/version-check.test.ts` (7).

### 4a. Lyrics drifting off the vocal after edits — DONE (uncommitted)

Cause, found by simulation (`tests/lyrics-follow.test.ts`: random vocal edits through the real store and follower): `parseLyrics` sorts a fully timed sheet by time, but the follower kept each line's place in the vocal by line *number*. After any edit that put lines out of written order (a clip dragged earlier, time cut out, an AI rearrangement), the next edit gave every line another line's place. Three smaller ones on top: a line right at a cut was tied to the clip that ended there instead of the one that starts; a clip grown back by an undo wasn't taken as the line's; a line whose clip was deleted never followed a surviving copy.

- `web/src/lib/client/lyricsFollow.ts` (`inReadingOrder`), `web/src/lib/client/vocalTime.ts` (`placeAnchor` rewritten with a stated order, `clipKeys` now a Map with what each clip played, `anchorAt` tie-breaks, new `sungAt`).
- `web/src/lib/lyrics.ts` `sectionsOf`: a section's start/end come from when its lines play (new `last`), not the order written.
- `web/src/lib/clipLyrics.ts`: `clipLyrics(..., places)` shows a line at every audible copy of its singing and fills at the vocal's speed; `clipParts` sections in playing order, plus "The loudest 30/15 s" (`loudestStretch`, needs `peaks`) and "From the first words".
- Tests: lyrics-follow (36, 30 seeded sessions of 60 edits; 300 sessions were run once clean), vocal-time, clip-lyrics, lyrics-timing.

### 3. Clip editor — PART DONE (uncommitted; the app builds and works as is)

Done in the libraries, NOT yet wired into `web/src/components/studio/ClipDialog.tsx`:
- [ ] pass `places` to `clipLyrics`: `(t) => sungAt(lanes, t, rankFor(sheet))`.
- [ ] pass `peaks: mixPeaks(lanes, duration, 600)` to `clipParts`.
- [ ] credits: `clipDesign.ts` has elements `vocalBy` / `beatBy` (drawn by `drawCredit` in `socialClip.ts`) and `clipCredits(voices, beats)`; the dialog must pass them to `withWords` (voices/beats = artists of audible vocal / other lanes via `splitSongTitle(lane.trackTitle).artist`; a take is the user).
- [ ] part picker with waveforms: replace `RangeBar`'s plain bar with two rows (vocals, beat) from `mixPeaks` of each group, section bands on top.
- [ ] background export: a `clipJob` store like `exportJob.ts`; `makeSocialClip` should pause the recorder and suspend its AudioContext while the page is hidden; the dialog closable while it records, a chip in the Studio to come back to it.

### 4b. Lyrics finding / editing — not started

- [ ] Search ranked against the vocal lane (length vs last timestamp, line count vs phrases).
- [ ] Easier editing (look at the editor on a phone first: `npm run shot`).

### 6. AI remix — DONE (uncommitted)

Every check left from last session ran clean (numbers in `AI_REMIX_PLAN.md` → STATUS → Left). One bug found and fixed: mastering while ideas were being tried showed no result card (`useMastered` in `components/studio/ai/extras.tsx`). Optional and still open: the duet offered one way only for some pairs.

### 7. Before committing

- [ ] `cd web && npx tsc --noEmit && npm run lint && npm test -- --brief` (stop any `next dev` in `web/` first).

## Cheap ways to test (use these first)

- `cd web && npm test -- --unit --brief` — every test that needs no server; prints only failures and a total.
- `npm test -- --brief tests/<file>.test.ts` — just those files; starts a server only if one needs it.
- `node scripts/phone-upload.mjs` — a phone's upload in real Chrome on a throttled line (`CUT=20`, `RELOAD=1`, `MB=`, `UP_KBPS=`). Needs the app running.
- `npm run shot -- /path /tmp/x.png phone` — a screenshot instead of reading UI code.
- For a new kind of network trouble, add a case to `tests/upload-sim.test.ts` with `tests/support/line.ts`; do not test it by hand.
