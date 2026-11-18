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

## Clips — artwork and visualizers (2026-11-18)

- [x] A new clip starts with the songs' artwork as its background (`ClipDialog`): the vocal's and the beat's covers — one picture when they're the same song, side by side or a grid when not (`mixArtSongs` up to 9, `drawCollage` 3×3 for 5–9). Card or "Your photo" still selectable. Checked in Chrome (Hichkas vocal + Kid Cudi beat: two halves).
- [x] Four more clip visualizers (`socialClip.ts`, `clipDesign.ts`): LED dots, Spectrum (filled, glowing, mirrored), Pulse rings, Sun rays. Not yet looked at in an exported video.

## Phase 5 — a new song from everything in the mix (done 2026-11-18)

Several songs in the Studio → one new song: who sings when, which beat under which part, drops on choruses, one tempo and key, mixed and mastered, with tools to improve it.

- [x] Plan (`newSong.ts`, tested), builder `newSongIdea` (`aiIdeas.ts`, Mashup tab), song map + tools (`ai/NewSongMap.tsx`: swap singer/beat per part, try again, longer/shorter, more of a singer, drops on a beat, Undo), `MasterIt` under the map.
- [x] Hearing covers 4 songs now (`prepareSession` pairs; swap/duet/blend ideas still use the first 3).
- [x] One lyric sheet for the new song: `linesInEveryPlay` (`vocalTime.ts`, tested) puts each singer's timed lines at every place they're sung; `newSongSheet.ts` opens it as "A new song" while the idea is on, rewrites it on a tweak, keeps it on Keep, and on switch-off reopens the old sheet with its old times. Checked in Chrome.
- [x] Checked by numbers (rig + `check.js`-style eval of `__remixt.aiTrial`): 4 songs (Ye Rooze Khoob, Kid Cudi, Tofanag Abpaash, Tehran Gonahkar) → 3:50 at 93 BPM, Tehran left out (18% faster, said in notes). Every drop's beat starts 12 ms before its bar line (the planned fade-in lead), no section runs past its part (no line cut by the next part). After "Streaming": **−14.4 LUFS, peak −1.14 dB, 0 clipped ✓**. 3 songs earlier: −14.2 LUFS, peak −1.14 dB.
- [x] Phone (emulated, `NEWSONG=3|4 node scripts/phone-measure.mjs`): hearing 10–14 s, building ~1 s, export 27–67 s, page peak ≈1.1 GB (3 songs) / 1.2 GB (4). Label: slow (memory warning) from 2 songs, computer-only from 4 (`deviceFeatures.ts`).
- Rig steps: add `{"add":["Vocals",song]},{"add":["Beats",song]}` per song, then `{"ai":true},{"tab":"Mashup"},{"switch":"^A new song from everything","settle":15000},{"stop":true},{"click":"button:visible:has-text('Streaming')"},{"wait":45000},{"export":"x"}`. `window.__remixt.aiTrial` (dev only) has the trial: the idea's `song.plan` and `song.sheet`.

---

## Phase 6 — DJ section that is real (done 2026-11-18, two device checks left)

Decision 2 taken as recommended.
- [x] `/dj` opens on the decks (`DjApp.tsx`: engine made on arrival, the first tap unlocks sound) with two library songs that fit (`openingPair` in `djLibrary.ts`, tested: newest full song ≥ 90 s + best tempo/key fit). Demo songs only when the library has fewer than two, and the page says so. Nav, home page and page title say "DJ decks".
- [x] Auto DJ (`EasyDecks.tsx`, switch under Auto-mix): picks the next library song (`pickNext`, tested: tempo incl. half/double time, key, never twice), loads it on the free deck and starts Auto-mix ~112 beats before the playing song ends. The missions' AI DJ (`aiDj.ts`) picks from the library too; demo songs as fallback.
- [x] Crowd and requests already lived only in missions (`scenarioRunner`, `MissionPanel`). The free decks show real readings: tempo gap / beat offset (ms), key fit, and now the master (peak dB, limiter gain reduction via `DjEngine.limiting()`, clipping).
- [x] Training under "Learn to DJ" (`DjHome.tsx` is the Learn page; says the crowd is part of the game).
- [x] Set recording: the engine keeps a set list while recording (song the room hears most, `noteSetList`); after Stop: the list, "Save as MP3" (`djSetExport.ts`: tagged title/credits/comment with the list, 800 px cover collage of the songs; up to 20 min), "As recorded" and "Track list" (.txt).
- [x] Checked with real songs (`node scripts/dj-check.mjs 3`): opened on two full library songs in 7 s; Ye Rooze Khoob (93 BPM) + Tofanag (97 BPM) synced and played 3 min: 0 ms drift (engine positions); the Auto DJ started the transition by itself near the end and loaded the next song; set list 0:00 / 0:47; MP3 with cover and list (ffprobe).
- [ ] Not checked: clicks at loop points (needs listening or a recorded-loop analysis), a MIDI controller (needs the hardware).

---

## Phase 9 — Radio (asked 2026-11-18)

A real radio station in the app: everyone hears the same song at the same moment, listeners vote on what plays next and send requests, the owner runs playlists and a console, with reports. Usable in the app, embedded in other apps and games, and broadcast to YouTube Live.

How it works (like the live rooms, `lib/live.ts`): no media server. The server keeps each station's schedule (queue items with `starts_at`); every listener's browser plays the item at `now − starts_at` through the Studio engine in listening mode (rendered to an `<audio>` element, so it keeps playing with the screen locked). Songs from the library and published remixes both play. The schedule moves on lazily when anyone asks (feed polling), under an advisory lock, so it runs on Postgres on any host.

- [x] Schema (created on first use, `ensureRadioSchema`): `radio_stations`, `radio_queue` (also the play history), `radio_playlist`, `radio_requests`, `radio_votes`, `radio_listeners`.
- [x] `lib/radioPick.ts` (pure, `tests/radio.test.ts` 11/11): order DJ queue → vote winner → most-requested (then oldest) → playlist rotation (rest = min(12, size−1)) → library; vote choices (requests first, then playlist, then library); clock helpers.
- [x] `lib/radio.ts`: tick under `pg_try_advisory_xact_lock` (library read before the transaction — holding the lock while taking more pool connections deadlocked the feed; fixed), gapless start or "now" after 30 s of silence; votes per round; requests (per-listener limit, open/review/off, "Me too" counts); listeners by heartbeat; reports + CSV play log. House station `remixt-radio` (no owner, admins run it, plays the whole public library).
- [x] API under `/api/radio` (stations, feed, vote, request, search, play payload, console actions, report/CSV, public CORS `/now`).
- [x] Pages: `/radio`, `/radio/[slug]`, `/radio/[slug]/console` (owner or admin: On air + Skip + queue, Requests accept/turn down, Playlist, Settings, Reports with CSV, Share), `/radio/[slug]/embed`, `/radio/[slug]/broadcast` (tunes itself in; OBS). Site chrome hidden on embed/broadcast (`lib/bareView.ts`). "Radio" in the nav (DJ moved under "More" on tablets so the header fits).
- [x] Crossfades on the beat (like a streaming app's automix): the server picks the next song 90 s before the end (`NEXT_LEAD_SECONDS`) and starts it a crossfade early — `crossfadeFor` (tested): tempos within 6% (half/double time count) blend 8 bars of the outgoing tempo (4 when slow), else a quick 2 bars, unknown tempo 6 s, ≤ 16 s and ≤ a third of either song. Equal-power gains. Feed has `now`, `upcoming`, `fading`. Items carry `bpm` (tracks.bpm, a remix's projectBpm).
- [x] Player (`radioDeck.ts`): every song is rendered to a WAV in the tab and played by `<audio>` (keeps going with the screen locked); two decks crossfade through Web Audio gains + analyser (visualizer); iPhone (element volume is fixed there) switches at the crossfade start. Songs: their stems summed directly (≈4 s, 2 s cached). Remixes: the Studio mixdown (`renderMixWav` with a span) — tune-in shows "Getting the remix ready… n%". Clock: NTP-style, the quickest of the last 12 round trips. Lock screen: Media Session metadata + play/pause.
- [x] Checked (`OWNER_ID=<id> SHORTEN=1 node scripts/radio-check.mjs`): two tabs −26/−88 ms from the station clock; at the change the voted song came in over a 6 s equal-power blend (0.9/0.08 → 0.03/0.9) in both tabs; after it, both within 23 ms of the station (2 ms apart).
- [x] Always on, anywhere: `/radio/[slug]/embed?autoplay=1` starts by itself where sound is allowed (OBS, game web views, kiosks) and retunes after a drop; `postMessage` API — `{type:"remixt-radio", action:"play"|"pause"|"volume", value}` in, `{type:"remixt-radio:state", playing, now, next, listeners}` out (checked: `node scripts/radio-embed-check.mjs`). The broadcast view retunes itself too. Share card lists all of it.
- [ ] **Remix mixdown is slow**: a 3:53 song through `renderMixWav` took 26 s (45 s with stems cached!) in one tab; 100 s with two tabs. No worklets in the chain — profile `mixBounce`/`renderInPieces` (pieces of 40 s + 12 s lead-ins; master chain per piece). Until then a remix tune-in waits for its render, and a phone may not have the next remix ready in 90 s (it then joins it late).
- Later: a plain audio stream URL (Icecast-style) needs remixes rendered on the server — not possible while remixes exist only as lanes.

## Phase 10 — Remove one singer from a song (done 2026-11-18)

In the Studio: vocal lane menu → "Remove a singer…" (`RemoveSingerDialog.tsx`; logic in `lib/client/singerParts.ts`, `tests/singer-parts.test.ts` 10/10).
- [x] By lyrics: Genius-style headers (`[Verse 2: 2 Chainz]`, `[Chorus: A & B]`, `(Name)`) → sections with performers; pick a singer; parts sung together are flagged (taking them out takes both voices there). Found lyrics still timed to the recording are mapped through the lane's clips (`onTimeline`).
- [x] By voice: phrases from the vocal's loudness (≤ 3 s pieces), a fingerprint per phrase (16-band spectral shape, voiced share, pitch spread, median pitch), k-means 2–4 from several starts, kept only when the silhouette is ≥ 0.22 and no group is under 8% of the phrases; Voice 1 sings most; each voice can be listened to.
- [x] By hand: tap parts on the strip, or tick lyric sections.
- [x] Remove: keep the music (vocal clips cut, 30 ms fades on new edges; a lane with nothing left is muted) or cut the time out of the whole song (widened to whole bars, markers shifted). Lyric lines inside go. One undo step (`startNewStep` before and after).
- [x] Checked on "Kid Cudi – Can't Believe It (Ft 2 Chainz)": no names in its lyrics; by voice → 2 voices (silhouette 0.44), Voice 2 = mostly 1:41–2:13 (the featured verse) plus two short intro bits; taking it out left 9 clips, all faded. The first version heard one voice (an odd phrase became its own group) — fixed by the several starts and the minimum group size.
- [ ] Not checked in the browser: undo after the cut, the "cut the time out" path, a sheet with Genius headers, phones/iPad screenshots of the dialog (it's a bottom sheet under 640 px).

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

Last run (2026-11-18, end of session): tsc clean; lint = the 3 old vendored errors; unit tests 803 passed, 1 failed — `demo-songs` "is quick enough" (3.06 s against its limit) under the full parallel run; it passes alone. Full `npm test` (with the server) not run this session.


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
