# AI producer: real remixer, engineer and mashup — handover plan

Written 2026-11-15; status updated 2026-11-16 (see STATUS below). The checks listed under Left are finished; what else is in flight is in `HANDOVER.md`.

## What the owner asked for

1. The Studio's AI panel should work like a real remixer and DJ: results you can actually listen to, not "dummy AI" output.
2. Syncing must keep working as it does now.
3. A feature to remix songs **together** (two or more songs in one mix).
4. The AI should act as a sound engineer, vocal engineer, musician and artist: a professional mix and master.
5. "Mix layers perfectly": every vocal, drum, bass and melody line balanced against the others.
6. Nothing existing may break.
7. More detail shown to the user, and more of it visual.

## How the AI panel works today (so you don't re-read it all)

- UI: `web/src/components/studio/AiProducer.tsx` (tabs Sync, Timing, Drop, Harmony, Style, Ask AI) with cards in `web/src/components/studio/ai/`.
- Ideas engine: `web/src/lib/client/aiIdeas.ts` (about 2,900 lines). A `Session` holds the lanes, per-lane `StemAnalysis`, and a `PairContext` for ONE vocal and ONE beat. Every idea is built on a `Draft` and becomes lane patches. Trying, stacking and keeping ideas is `aiTrial.ts`. The score is `mixScore.ts`.
- Vocal placement: `arrange.ts` (`placeVocal`, `suggestLayout`, `BeatStructure`), `pairMatch.ts` (`preparePair`, `pairPlanPatches`), `matchOptions.ts` (`planFromOptions`).
- Audio: per-lane chain in `audioGraph.ts` (`createLaneChain`: high-pass, low-pass, 3-band EQ at fixed 220 Hz / 1.4 kHz / 5.2 kHz, drive, one fixed compressor, Haas width, pan, reverb and delay sends, duck). Master chain: low shelf, high shelf, glue, fader, limiter at −1.5 dB, then ×0.89. Automation is only `volume` and a low-pass `filter`.
- Analysis runs at 11 kHz mono (`analysis.ts`): loudness, onsets, chroma, melody. There is no full-band tone measurement.
- It is all in-browser DSP. Only "Ask AI" (`CoProducer.tsx`) calls a language model.

## What I found by measuring a real pair

Test pair in the local library: vocal "Hichkas - Ye Rooze Khoob Miad" (4:23, 94 BPM) over beat "Kid Cudi – Can't Believe It" (2:52, 86 BPM).

- **Main defect (now fixed, see below):** "Make it sound good" turned the 4:23 song into 1:33. It kept 3 of the vocal's sections and still scored itself 97 "Sounds great". Cause: any vocal section that did not fit before the beat's end was dropped, and chorus-on-the-drop shifted the vocal so far early that the first verses fell off the front.
- "Make it sound good" adds **no effects and no mastering** by design (`fixMix`: volumes, timing, key only). The mix presets (`MIXES` in `aiIdeas.ts`) are fixed EQ numbers, not measured from the audio.
- Exported result measured −11.8 LUFS, peak −0.6 dB, with a heavy 250–500 Hz band (−7.9 dB relative, against −13.5 before): the vocal at 150% over a beat cut to 42% piles up low-mids. Nothing corrects that.
- With two whole songs loaded, the engine picks the first vocal and first beat (both from song A) and then locks every other lane to the grid, so two vocals and two beats play at once. There is no plan for who plays when. This is the missing "songs together" feature.

## Done in this session (uncommitted, typecheck clean, 81 unit tests pass)

Stage 1 — the whole song survives:

- `arrange.ts`: `suggestLayout(heard, structure, reachBar?)`; new section "Making a beat last": `beatBody`, `beatLifts`, `Reprise`, `repriseSource`, `repriseFor`, `repriseStructure`, `repriseClips`, `isReprise`, `REPRISE_LABEL`. The beat's body (full-strength bars between intro and ending) plays again for as many 4-bar lines as the vocal needs, then the beat's own ending. `repriseStructure` gives the exact bar times of the extended beat, so the vocal is laid on the repeated beat's real hits with no drift and no stretching.
- `pairMatch.ts`: `PairContext.full` (the layout with nothing left out); `pairPlanPatches(ctx, plan, lanes, reachBar?)` now builds the reprise, patches the beat lane's clips, and returns `structure` (as played) and `reprise`.
- `matchOptions.ts`: `planFromOptions(ctx, options, reachBar?)`; whole-vocal shapes may run past the beat's end.
- `aiIdeas.ts`: `beatReach` (off when tracks are kept whole, or the person cut the beat themselves), `arrange` passes the reach, `Draft.played`, `beatBarTime` uses the played bars, `arrangeOnDrop` now returns the bar it landed on and refuses to drop sections (it tries the beat's other lifts instead), `extendBeat` uses the reprise.
- The lane's own Match panel (`LaneMatchPanel.tsx`) passes no reach, so it behaves exactly as before.

Verified on the test pair: result is now 4:47 with every verse and chorus, the beat is 3 clips ("Main part again", "Ending"), score 36 → 96.

Test rig added (keep or delete, your call): `web/scripts/ai-drive.mjs` drives the Studio in Chrome from a JSON list of steps and saves the exported WAV; `web/scripts/measure-wav.mjs` prints LUFS, loudness range, peak, crest, stereo correlation and eight tone bands.

Example steps file:

```json
[{"add":["Vocals","Ye Rooze Khoob"]},{"add":["Beats","Kid Cudi"]},{"wait":1500},
 {"ai":true},{"switch":"^Make it sound good"},{"wait":5000},{"stop":true},
 {"shot":"good"},{"keep":true},{"export":"good"}]
```

Run: `cd web && npx next dev -p 3100` (port 3000 is another project), then `BASE_URL=http://localhost:3100 OUT_DIR=/tmp node scripts/ai-drive.mjs steps.json` and `node scripts/measure-wav.mjs /tmp/good.wav`. An export takes about 10 s.

## STATUS 2026-11-16 (read this first)

Stages 1–3 are built; most of the final pass is done. Uncommitted work on top of commit 44febb8:

- **Stage 1 done**: `tests/beat-reprise.test.ts`, "main part plays again" wording (aiExplain), REPEAT band on DropMap.
- **Stage 2 done**: `lib/client/mixEngineer.ts` (measure, engineerMix, compressor model, masterToTarget), `lib/client/laneTones.ts`
  (full-rate tones per stem, `Session.tones`), new lane EQ `eqLowMid` (350 Hz bell) and `MasterFx.gain`.
  Pro mix = idea `sound-pro` (switch under Make it sound good on Sync, and in Style → Mix engineer, with
  `components/studio/ai/EngineerCard.tsx`). Option `proMix` ("Engineer every style and sound", on by default)
  engineers every applyMix. MasterIt = "Master to target" (Streaming −14 / Loud −10) with meter; presets under "Presets, by ear".
  Balance (Make it sound good fix, Mix check, score) uses heard loudness (`heardBalance`) when tones exist.
- **Calibration (measured in the Studio)**: VOCAL_OFFSET_DB −1.5 (records: −1.3, −1.4, −2.5, +1.7, −3.9); BACKING_LUFS −17;
  compressor model peaks at lufs+4 (vocal lands within 0.2 dB of aim).
- **Stage 3 done**: `lib/client/mashup.ts` (songsOf, heardSpans, whoPlaysWhen), mashup ideas in aiIdeas
  (`mash-swap:`, `mash-duet:`, `mash-blend:`; `Session.pairs` prepared in prepareSession), Mashup tab + `ai/MashupMap.tsx`.
  Engineer won't cut a second beat's bass when the two barely overlap (blend).
- Tests: ai-producer 53, ai-explain 19, mix-engineer 16, mashup 4, beat-reprise 8 — all pass. tsc clean; lint clean on touched files
  (3 lint errors are pre-existing, in public/ vendored files).

Measured on 4 real pairs (rig, Streaming master): whole song −13.3/−13.5/−13.6/−13.8 LUFS, peaks ≤ −1.26 dB, 0 clipped; mud
−7.9→−10.5, −8.5→−11.1, −8.8→−10.2. Scores with Pro mix: 96, 69, ?, 93 (pair 2 is low for other reasons — check its score parts).

### Left — all done on 2026-11-16 (second session)

1. Pair 1 re-run, "Make it sound good" alone: −15.1 LUFS, LRA 2.9, peak −1.56 dB, 0 clipped, 4:47 (was −9.8 / LRA 1.8).
   With Pro mix + Streaming master: −13.3 LUFS, peak −1.35 dB, 0 clipped, mud −10.8.
2. Stage 1 rig checks:
   - Beat longer than the vocal (Tehran Gonahkar over Kid Cudi): no repeat, one beat clip, as before.
   - A 20 s loop beat (flows-a) under a 2:19 vocal: "Main part again" ×9 + "Ending", every verse kept, score 43 → 86.
   - "Lock every line to the beat" off (tracks kept whole): no clips on either lane, no repeat — so the vocal sings on alone after the beat ends. That is what the option says it does; if it should repeat the beat anyway, `beatReach` in `aiIdeas.ts` is where.
   - Keep, then Club: beat keeps "Main part again" + "Ending", 4:47, −8.8 LUFS, peak −2.4 dB, 0 clipped.
3. Phone-width screenshots of the Pro mix card, the engineer card, Master it and the Mashup tab: all fit.
   Found and fixed there: mastering while ideas were still being tried showed no result (the card is rebuilt when the trial is kept, and lost its numbers) — the result now lives outside the card (`useMastered` in `components/studio/ai/extras.tsx`).
4. Mashup with two whole songs (Ye Rooze Khoob Miad + Yadegari): two vocal swaps, a duet, two DJ blends listed. Blend A → B exported: 6:52, −12.2 LUFS, peak −1.18 dB, 0 clipped.
5. Still open, optional: the duet is offered one way only for some pairs (no turn found for the other host).

The rig can now read the mix: `window.__remixt` (development only, set in `components/Studio.tsx`) holds the stores, e.g.
`{"eval":"window.__remixt.studio.getState().lanes.length"}`; `{"viewport":[390,844]}` shrinks the page to a phone's width after a mix is set up.

## Original plan: still to do, in order

### 1. Finish Stage 1 (small)

- Add unit tests in `web/tests/ai-producer.test.ts` (or a new `tests/beat-reprise.test.ts`) for: `beatBody`, `repriseSource` (last body bar lands right before the ending), `repriseStructure` (bar times equal the summed real bar lengths), `repriseClips` (clips abut on the played grid), and "a vocal longer than the beat keeps every section". Build a `BeatStructure` through `beatStructure()` on a synthetic analysis, as `tests/listening.test.ts` does, because `BeatGrid` is not exported.
- Test more pairs with the rig: a beat longer than the vocal (must be unchanged), a very short loop beat, "Keep tracks whole" on, each Style, then Keep followed by another style (the kept beat has reprise clips; `beatReach` should allow re-doing it).
- `WhatHappened` describes the beat as "cut at its silences into 3 pieces" — wrong words for a reprise. Fix the wording in `aiExplain.ts` when clips carry `REPRISE_LABEL`.
- `DropMap.tsx` shows only the beat's own bars; show the played bars (with the repeat marked) when the beat lane has a reprise.
- Run `npm run lint` and the full `npm test` (stop any `next dev` in `web/` first).

### 2. Stage 2 — the engineer ("mix layers perfectly")

New file `web/src/lib/client/mixEngineer.ts`:

- `measureTone(buffer)`: from the full-rate `AudioBuffer` (`audioEngine.getRawBuffer(laneId)`), 4096-point FFT every half second over the sounding parts → power in 8 bands (20–60, 60–120, 120–250, 250–500, 500–2k, 2–4k, 4–8k, 8–16k), K-weighted loudness, crest factor, stereo correlation. Cache per `stemId`. Add `tones?: Map<string, Tone>` to `Session` (optional, so hand-built sessions in tests still work) and fill it in `prepareSession`.
- `engineerMix(session)`: decisions from the measurements, written as `LaneFx` patches and levels:
  - One owner of the low end (the bass lane, else the main beat). Every other lane with real energy under 120 Hz gets a high-pass. Two beats at once never both keep their bass.
  - Vocal high-pass just under its lowest sung note (already in `fittedRecipe`), compressor on when its crest is high, highs lifted only if its 4–8 kHz band is dull against its mids.
  - Masking: where backing lanes are loud in the vocal's presence band while it sings, cut their mids (the 1.4 kHz band) in proportion; cut `eqLow` on lanes piling into 250–500 Hz.
  - Levels by role from measured loudness (keep `balancedLevels` for grouping lanes of one recording), then spread: lead vocal, bass and drums centre; second vocals and melody lines from different songs to opposite sides.
  - Reverb and delay timed to the tempo (`musicalDecay` exists), less on dense vocals.
- Offer it as an idea `engineer-pro` on the Style tab, and add a fifth Mix-check fix "Sound" so "Make it sound good" can include it. Note the existing rule and test "fixing the mix only ever changes volumes, timing and key — never effects" (`tests/ai-producer.test.ts`): either keep "Make it sound good" as is and add a separate one-tap "Pro mix", or change that test deliberately. Recommended: separate switch, on by default inside the styles.
- Mastering by measurement: render the loudest 20–30 s with `renderMixdown({ span })` (`mixdown.ts`), measure LUFS, peak and tone bands (port the maths from `scripts/measure-wav.mjs`), then set `MasterFx` low/high/glue and the master level to reach a target (−14 LUFS "streaming", −10 "loud/club") without the limiter working hard. Replace the preset pick in `MasterIt` (`components/studio/ai/extras.tsx`) with "Master to target", showing before → after numbers.
- Visuals: a card per lane with its 8 band bars before and after, the EQ moves as a small curve, a masking strip (vocal against backing), and a loudness meter with the target marked. Put them in a new `components/studio/ai/EngineerCard.tsx`.
- Check every change with the rig: the 250–500 Hz pile-up should come down, LUFS should hit the target within 1 dB, peak under −1 dB, no clipped samples.

### 3. Stage 3 — songs together (mashup)

New file `web/src/lib/client/mashup.ts`, new tab "Mashup" in `AiProducer.tsx`, shown when the mix holds lanes of two or more songs (`mixSongsOf` in `mixSongs.ts` groups lanes by song; `sameSong` in `aiIdeas.ts`).

- **Vocal swap**: A's vocal over B's beat, and the reverse. Runs the existing pair engine for that pair and mutes the lanes not used. This fixes "everything plays at once".
- **DJ blend A → B**: both songs at one tempo and key (`lockAllLanes`), B starts on a 16-bar line near A's last chorus, 8–16 bar transition. Automation is only volume and low-pass today, so: A's low-pass closes while its level falls, B enters on the downbeat. If both songs have separate drums/bass/melody lanes, bring B's drums and melody in first and swap the bass at the midpoint. Adding a high-pass automation param would allow a true bass swap for two-stem songs; it touches `audioGraph.ts`, `audioEngine.ts`, `mixdown.ts` and `AutomationLane.tsx`, so do it only if the simple version sounds poor.
- **Duet**: both vocals take turns over one beat, section by section (A verse, B chorus…), using `hearVocal` sections for each vocal.
- Visual: a "who plays when" map — one row per song line, coloured blocks along the bars, the transition zone shaded.
- `pickPair` should prefer a vocal and beat from different songs when there are two songs, or the mashup tab should set the pair.

### 4. Final pass

- `cd web && npx tsc --noEmit && npm run lint && npm test`.
- Phone screenshots of every new card: `npm run shot -- /studio /tmp/s.png phone`.
- Listen-by-numbers on at least four real pairs with the rig, before and after.
- Update the header comment in `aiIdeas.ts` and `AiProducer.tsx` for the new tabs.

## Notes

- The owner offered the live site `remixt-free.vercel.app` with a test login (given in chat; not stored here) for listening to real uploads. Only look and listen there; do not save or delete anything. The local library already has about 30 real songs.
- `graphify-out/` is stale for the files above until the next commit.
- Read `web/AGENTS.md` before touching Next.js code.
