# Remixt — the one plan

The only to-do list. Everything unfinished and every note lives here. Read this first in a new session, then `git status`.
Update it before a session ends: tick boxes, add what was found, move finished parts to "Done" at the bottom.

- History and measurements of the AI producer: `AI_REMIX_PLAN.md` (finished; reference only).
- `HANDOVER.md` was merged into this file on 2026-11-17 and deleted.

Written 2026-11-17. Last commit at that time: `0fee2ca` (all earlier work committed, tree clean).

---

## Decisions for the owner (answer when you can; work starts with the recommended option)

1. **"Kill the app and it keeps playing."** If the app is *swiped away* (force-closed), no web app or PWA can keep playing on iPhone or Android. The phone ends the page, and the sound with it. What a web app *can* do is keep playing when the screen locks, when you switch to another app, or when you go to the home screen. Only a native wrapper (for example Capacitor, with a background audio service) survives a swipe-away.
   - Recommended: do phase 2 (locked screen / other app / home screen) now. Decide about a native wrapper later; it needs App Store and Play Store accounts.
2. **DJ section: real tool or training game?** Today `/dj` is mainly a training game: lessons, missions, a made-up crowd (`crowd.ts`), and an "AI DJ" that only plays the synthesised demo songs (`aiDj.ts`).
   - Recommended: make the real 2-deck player with your library songs the first thing `/dj` opens. Keep training as a clearly named "Learn" section. Remove the fake crowd outside missions.
3. **Song artwork source.** Recommended: take the cover picture that is already inside the uploaded file (MP3/M4A tags). If there is none, use the cover from the music site the song came from. If there is still none, draw one from the waveform and colours.

---

## Phase 1 — finish what's half done (carried over from HANDOVER.md)

### 1a. Clip editor (`web/src/components/studio/ClipDialog.tsx`)
The library parts are done and tested; they aren't connected to the dialog yet.
- [x] Pass `places` to `clipLyrics` (2026-11-18).
- [x] Pass `peaks` to `clipParts` ("The loudest 30/15 s" show).
- [x] Credits: `laneCredits` in `clipSources.ts` (tested); a take is the user's artist name. The share caption says "Vocal × Beat" too. Story/portrait/square layouts moved so credits no longer touch the link.
- [x] Part picker: section bands over a vocals row and a beat row (`groupPeaks`, `mixPeaks(…, only)`).
- [x] Export in the background: `clipJob.ts`; `makeSocialClip` pauses recorder + AudioContext while hidden. The editor closes while recording; the clip button shows "42%" then "Ready". Checked in Chrome.
- [x] Song artwork as the clip's background or picture card ("Picture" → Song artwork / Your photo; `mixArtPicture`). A thumbnail can't be set: MediaRecorder has no cover track, and the apps pick their own frame.

### 1b. Lyrics finding and editing (not started)
- [x] Search results ranked against the vocal: `lyricsFit.ts` (tested) — first/last timestamp against where singing starts/stops, line count against sung phrases, length. "Fits the vocal" badge in the picker.
- [x] Easier editing: the phone screenshot showed timestamps tangled with right-to-left words. A timed sheet is now edited as words only (`lyricsEdit.ts`, tested): a line typed over keeps its time, a new line goes between its neighbours. "Show times" edits the stamps. Checked by typing in Chrome.

### 1c. AI producer leftovers
- [x] Duet one way only: `duetTurns` (tested) falls back to the host's strongest sections when strict turns find none.

---

## Phase 2 — keep playing in the background (PWA)

What happens today:
- Library and Upload previews play through an `<audio>` element (`previewPlayer.ts`). These usually continue with the screen locked.
- The Studio, the remix pages and the embed play the mix through Web Audio (`audioEngine.ts`). On iPhone, the AudioContext is interrupted when the page goes to the background, and the engine then pauses itself on purpose (`statechange` listener in `getContext`, about line 432).
- Lock-screen controls already exist (`mediaSession.ts`).

Steps:
- [x] "playback" audio session: was already done (`applyAudioSession` in `audioEngine.ts`).
- [x] Listening mode (remix page, embed): `renderedPlayback.ts` + engine. Play starts live at once; the mix renders in pieces (`renderMixWav`) and playback moves to an `<audio>` element at the same spot (~5 s later in Chrome). Pause/play then starts on the file; any change to the mix goes back to live. Not in the Studio (it's being edited).
- [ ] Live-engine MediaStream fallback: not done. The silent `nowPlayingAnchor` element already marks the page as playing media, and the latency can only be judged on a real phone. Revisit only if the device check below shows the Studio stopping when locked.
- [x] Hidden is not paused: when the context stops while the page is hidden, the engine waits and resumes on return (`resumeAfterHidden`); a call (page visible) still pauses.
- [x] Lock-screen next/previous: the Library list is a queue (`previewPlayer` toggle/play with `queue`, tested) and plays on to the next song; previous restarts or goes back. The mix gets "previous" (from the top).
- [ ] Check on real devices: iPhone (installed PWA and Safari tab) and Android Chrome. Lock the screen, switch app, go home, take a call. Write the results here. Swipe-away is expected to stop (see Decision 1).

---

## Phase 3 — phones and AI features: say clearly what works

Nothing in the app checks what the device can do today. Heavy AI work on a phone is slow, can run out of memory, and is stopped when the screen locks.

- [x] `deviceClass()` / `classify()` in `device.ts` (tested).
- [~] Measured on a simulated phone (`scripts/phone-measure.mjs`, Chrome as Android, CPU 4× slower), two songs: add 6 s, first sound 4 s, AI producer hearing 4.4 s (computer 47 s: it runs the neural beat model, phones skip it), Make it sound good + Pro mix 2 s, WAV export 13 s, page peak ≈650 MB (computer ≈800 MB). CPU throttling doesn't slow the audio thread, so exports are optimistic. **Real phone still to do.**
- [x] Labels in `deviceFeatures.ts` (tested): split slow (helper computer), lane split computer-only, mashup slow from 3 songs on phones, new song slow (computer-only from 4 songs), the rest works.
- [x] `DeviceNotice` / `StudioDeviceNotice`: what happens, and "Continue on a computer" with the address, Copy and Send (share sheet: AirDrop/email to yourself). No QR: a computer can't scan one. In the lane split dialog and the Mashup tab.
- [x] A saved remix opens on a computer: `/api/remixes/[id]` lets the owner open private remixes, `/studio?remix=` loads it. Unsaved work is only on the phone, so the Studio notice says to save first. (Not checked with a real account.)
- [x] `SplitQueue.tsx` phone notice uses the same wording (`FEATURES.split.slow`).

---

## Phase 4 — song artwork for clips and remix covers

Today only remixes have covers (`remixes.cover_key`, uploaded by the owner, `lib/cover.ts`). Songs have no picture.

- [x] Database: `tracks.cover_key`, `split_jobs.cover_key` (schema.sql + ensureSchema/ensureSplitQueueSchema; local DB migrated).
- [x] Reader `src/lib/audioCover.ts` (tested: ID3 v2.2/2.3/2.4, M4A covr with moov at the end, FLAC, Ogg across pages). At upload `songCovers.ts` squares it to 600 px and PUTs `/api/tracks/[id]/cover`; a song queued from a phone sends it for its split job (`/api/split-jobs/[id]/cover`) and the track takes it when split.
- [x] Music sites: the page's `og:image` (`pageImageOf`) when the file has no cover; queued links store it server-side.
- [x] No cover: `songArt.ts` draws one from the waveform and a colour from the title (`SongArt` component). Covers are served per stem (`/api/stems/[id]/cover`, 204 when none).
- [x] Shown in the Library, Studio lanes (not on phones: no room) and library panel, DJ track list and both deck layouts, lock screen (previews: the song; the mix: its cover or the drawn one).
- [x] Clips: see 1a.
- [x] Remix artwork: `drawCover` in `exportMeta.ts` now draws over a collage of the songs (1 = full, 2 = halves, 3 = one big two small, 4 = grid) with the title; the remix page shows it when the owner hasn't uploaded one, and exports carry it.
- [ ] Not checked with a real upload (needs a signed-in account): a tagged MP3 should show its cover in the Library after splitting.

---

## Session 2026-11-18 (2) — owner's list

- [x] Lyrics right to left: `lineDirection` (rtlText.ts, tested) goes by the line's main script, so "Yeah, من…" is still a Persian line. The lyric list's progress bar, the stage wipe (VocalStage), clip karaoke (socialClip) and the line text all follow it; English stays left to right.
- [x] AI panel kept its state: closing (X / Esc) no longer keeps the idea — it stays on, so reopening shows the same ideas on, the new-song map and its Undo (which used to re-listen from scratch). The panel's choices and what it heard survive leaving the Studio (`remembered` + `heard` in AiProducer). The AI button has a dot while an idea is on with the panel closed. Not yet clicked through in a browser with real lanes.
- [x] Song artwork online: `coverSearch.ts` (tested) + `coverLookup.ts` + `/api/covers/search` — Apple's catalogue (iTunes Search API, free, no key, pictures CORS-open) by artist and name; Persian names asked in Finglish and matched by sound; karaoke/tribute/live versions and artist-only matches refused. Third fallback at upload (`songCovers.ts`). Library songs with no cover get one the first time they're shown (`/api/stems/[id]/cover`; `tracks.cover_searched_at` so a miss isn't asked again for 30 days; 15 asks a minute). Checked live: Bazam Kalan, Blinding Lights, Amire Bi Gazand (Latin and Persian file names). Not checked: the lazy fill on a real library.
- [x] Download-site names dropped from titles (`splitSongTitle`, tested): Ganja2Music, RadioJavan, Nex1Music, UpMusic… without their .com, track numbers ("01 "), "Artist-Song-320" joined by dashes, a site's name in front. Helps lyrics and covers.
- [x] Lyrics follow the vocal: `mixSongsOf` puts songs whose vocal is in the mix first; `sungSongs` (tested) — with a vocal in the mix, only sung songs get lyrics looked up or kept open (no more the beat's song's lyrics).
- [x] Lyrics on phones: the line editor sits under the whole row (it was squeezed in the words column, nudges overflowed), nudges stretch across, Split/Join/Repeat/Line after in a grid, the line's text box follows its direction; Edit tab section chips in one swipeable row. Screenshots checked at 390 px.
- [ ] **Genius**: finds nothing without `GENIUS_ACCESS_TOKEN` (not set in `.env.local`). Free token from genius.com/api-clients ("Client Access Token"); then Genius results show in the lyrics picker. Scraping Genius's own search without a token is blocked by Cloudflare and not done.
- Known: a mixed line in the Edit box (one textarea) can't be laid out per line — "Yeah, من…" shows left to right there; everywhere else it's right.

---

## Session 2026-11-18 — where it stopped (read first)

Committed on branch `plan-phases-1-5` (not merged to main). Next: phase 5 leftovers below, then phases 6–8. Unit tests: 726 passed before phase 5; new-song tests 12/12 since. tsc + lint clean on touched files at last check.

**Phase 5 status (in progress):**
- Done: `newSong.ts` planner (tested, `tests/new-song.test.ts`), builder `newSongIdea` in `aiIdeas.ts` (id `new-song`, listed in the Mashup tab), `steadyStructure` in `arrange.ts`, `newSongLyrics.ts` (chorus from repeated lyric lines), song map + tools `components/studio/ai/NewSongMap.tsx` (swap singer/beat per part, try again, longer/shorter, more of a singer, drops on a beat, Undo), tweaks in `IdeaOptions.newSong`, `MasterIt` shown under the map.
- Rig run, 3 songs (Ye Rooze Khoob, Kid Cudi, Dorcci — vocal + beat each): 3:50 at 93 BPM, score 70 → 94, Dorcci left out (would need 18% faster — said in notes). After "Streaming" master: **−14.2 LUFS, peak −1.14 dB, 0 clipped ✓** (fixed: `masterSpan` in `ai/extras.tsx` only matched clips labelled exactly "Chorus"; it now matches any chorus label).
- To do: run with 4 songs; check by numbers that no section is cut mid-line and every drop starts on a bar line; one merged lyric sheet for the new song (not built); measure "new song" on the emulated phone (`scripts/phone-measure.mjs`) and set its label from that.
- Rig steps file used: tracks above, then `{"ai":true},{"tab":"Mashup"},{"switch":"^A new song from everything"},{"wait":12000},{"stop":true},{"click":"button:visible:has-text('Streaming')"},{"wait":45000},{"export":"x"}`.

---

## Phase 5 — a new song from everything in the mix

Goal: put several songs in the Studio (several vocals, several beats, with or without lyrics). The AI hears all of it and builds **one new, listenable song**: who sings when, which beat plays under which part, real drops, keys that agree, mixed and mastered. Then the user can improve it with tools.

What exists to build on:
- One vocal over one beat: `pairMatch.ts`, `arrange.ts` (sections, drops, beat reprise so the whole song survives).
- Two songs: `mashup.ts` and the `mash-swap` / `mash-duet` / `mash-blend` ideas in `aiIdeas.ts` (pairs only).
- Mix and master by measurement: `mixEngineer.ts`, `laneTones.ts`, Master to target.
- Lyrics with timing that follow edits: `lyricsFollow.ts`, `vocalTime.ts`, `sungAt`.

Steps:
- [ ] **Inventory**: list every vocal and beat in the mix with tempo, key, sections (`hearVocal`), energy, and lyrics if timed (which lines are a chorus, which are verses: repeated lines = chorus).
- [ ] **Compatibility**: score every vocal against every beat (tempo stretch needed, key distance after shifting, energy). Choose one tempo and key for the new song; drop a part only if it would sound bad, and say why.
- [ ] **Song plan** (`newSong.ts`, pure, tested): intro → verse → build → drop/chorus → verse → bridge → final chorus → outro, about 3–4 minutes. Fill each slot from the best vocal section (lyrics: choruses on drops, verses on calmer parts) and the best beat for its energy. Beat changes only on 8- or 16-bar lines, with a build before each drop (filter rise, a bar of silence, or a riser).
- [ ] **Harmony**: shift parts to the shared key (`matchOptions.ts` key logic); where two vocals overlap (chorus doubling, call-and-response), allow it only when their notes agree (chroma against chroma), otherwise take turns.
- [ ] **Lyrics of the new song**: one lyric sheet built from the lines that are actually sung, timed to the new places (`sungAt`), so Live, clips and the lyric view show the new song correctly.
- [ ] **Mix and master**: run `engineerMix` and Master to target on the result.
- [ ] **Show it**: a song map (sections across, one row per source song, drops marked, lyric line under each part) — extends `MashupMap.tsx`. Every decision has a plain sentence ("Chorus of song B on the drop at 1:12, because it is the loudest part and its key matches").
- [ ] **Tools to make it better**: swap a section's source, move a drop, longer/shorter, "more of singer A", regenerate one part only. Each is undoable (history exists).
- [ ] **Check by numbers** with the rig (`scripts/ai-drive.mjs`, `scripts/measure-wav.mjs`): 3 and 4 songs; length 3–4 min, −14 LUFS ±1, peak under −1 dB, no clipping, no section cut mid-line, every drop on a bar line.
- [ ] Phones: label it per phase 3.

---

## Phase 6 — DJ section that is real, not a simulation

What's simulated today (found 2026-11-17):
- `crowd.ts` — a made-up crowd energy meter with random requests ("drop the vocals!").
- `aiDj.ts` — the back-to-back "AI DJ" only picks synthesised demo songs (`demoSongs.ts`), never your library.
- `scenarios.ts`, `curriculum.ts`, `MissionSession.tsx` — training missions and a "flight school".
- `DjHome.tsx` says a 4-deck controller isn't simulated, only 2 channels.

Real parts that work: the engine (`djEngine.ts`: key lock, scratching, headphone cue, MIDI in `djMidi.ts`), library songs as tracks (`djLibraryTracks.ts`), beat grid and sections (`djLibrary.ts`), auto-mix (`autoMix.ts`).

Steps (following Decision 2):
- [ ] `/dj` opens the real decks with the Library tab first; demo songs only when the library is empty.
- [ ] AI DJ / auto-mix picks from the library (tempo, key, energy), with demo songs only as a fallback.
- [ ] Crowd meter and requests only inside missions, labelled as a game. Outside missions, show real measurements instead: tempo difference, beat drift, key clash, clipping on the master.
- [ ] Training moves under "Learn", reachable from `/dj`, not in the way.
- [ ] Record a set and save it as a mix (WAV/MP3 with the songs' covers and a track list).
- [ ] Check with real songs: two library songs synced by auto-mix for 3 minutes, beats stay together (measure drift), no clicks at loop points, MIDI controller still works.

---

## Phase 7 — every page works and makes sense

Pages: `/` `studio` `library` `upload` `remixes` `remixes/[id]` `r` `embed` `artist` `dj` `live` `live/new` `live/[id]` `challenges` `leaderboard` `notifications` `invite` `examples` `login` `signup` `storage` `takedown` `admin`.

For each page, on phone and computer:
- [ ] Screenshot it (`npm run shot -- /path /tmp/x.png phone` and `desktop`) with real data and with an empty account.
- [ ] Every number is real (counts, plays, scores, live viewers) — no made-up or random values. Known random: floating reactions in `live/Reactions.tsx` (fine, it's decoration).
- [ ] Every button does what it says. Empty states say what to do next.
- [ ] `/examples` uses synthesised demo songs (`demoSongs.ts`) next to real library songs; it should say clearly which is which.
- [ ] Write a line per page here: OK, or what's wrong.

---

## Phase 8 — checks before every commit

- [ ] `cd web && npx tsc --noEmit && npm run lint && npm test -- --brief` (stop any `next dev` in `web/` first; they share `.next`).
- [ ] Each phase adds unit tests for its pure parts (`newSong.ts`, `deviceClass`, tag reader, DJ library pick).
- [ ] Phone screenshots of every new screen.

---

## Notes and tools (from earlier sessions)

- Cheap tests: `cd web && npm test -- --unit --brief` (no server); `npm test -- --brief tests/<file>.test.ts`.
- New network problems: add a case to `tests/upload-sim.test.ts` with `tests/support/line.ts`; don't test by hand.
- Phone upload in real Chrome on a slow line: `node scripts/phone-upload.mjs` (`CUT=20`, `RELOAD=1`, `MB=`, `UP_KBPS=`). Needs the app running.
- Library playback check: `node scripts/preview-play.mjs` (`ENGINE=webkit` for Safari's engine).
- AI rig: `BASE_URL=http://localhost:3100 OUT_DIR=/tmp node scripts/ai-drive.mjs steps.json`, then `node scripts/measure-wav.mjs /tmp/x.wav`. Steps format is in `AI_REMIX_PLAN.md`. `window.__remixt` (development only) holds the stores.
- AI calibration (measured): `VOCAL_OFFSET_DB` −1.5, `BACKING_LUFS` −17, compressor model peaks at LUFS+4.
- Port 3000 is often another project: check with `curl -s localhost:3000 | head -c 300`; else `npx next dev -p 3100`.
- Live site `remixt-free.vercel.app`: look and listen only; never save or delete there. The test login was given in chat and is not stored here.
- Not checkable from here: the production store (Vercel Blob) for phone uploads.
- 3 lint errors are old, in vendored files under `public/`.
- Read `web/AGENTS.md` before touching Next.js code.

---

## Done (committed in `0fee2ca` and earlier)

- Phone uploads reach the split queue (relay slices, resume, honest stall timer).
- Library / Upload play stopping after a few songs (Safari typeless blobs; one keep-download at a time).
- "Refresh request" missing on phones (version check time limit and retries).
- Lyrics drifting off the vocal after edits.
- AI producer stages 1–3: whole song survives, measured pro mix and mastering, songs together (two songs).
