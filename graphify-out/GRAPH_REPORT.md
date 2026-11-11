# Graph Report - code  (2026-11-11)

## Corpus Check
- 469 files · ~546,075 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 12 file(s) not represented in the graph (top: (none) 7, .ttf 2, .ico 2)

## Summary
- 4701 nodes · 14605 edges · 159 communities (139 shown, 20 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 206 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d2896297`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- DjEngine
- challenges.ts
- aiIdeas.ts
- aiTrial.ts
- getCurrentUser
- djEngine.ts
- ensureSchema
- DeckUnit
- storage.ts
- liveReplay.ts
- djMath.ts
- modulation.ts
- SocialClipButton.tsx
- lucide-react
- AdminPanel.tsx
- SongPicker.tsx
- Studio.tsx
- clipCommands.ts
- audioEngine.ts
- Arrangement.tsx
- harmony.ts
- LyricsPanel.tsx
- app/page.tsx
- demoSongsDsp.ts
- Lakebase Postgres
- analysis.ts
- EasyDecks.tsx
- AiProducer
- new/page.tsx
- MatchStep.tsx
- next
- demoSongs.ts
- client/splitQueue.ts
- Neon
- musicKey.ts
- AiProducer.tsx
- mixdown.ts
- audioTags.ts
- directUpload.ts
- CoProducer.tsx
- libraryTracks.ts
- startNewStep
- Remixt Brand Mark (split audio-waveform bars)
- quickHelp.ts
- PartyWorld
- models.ts
- useStudioStore
- appIcon
- LineCard.tsx
- exportJob.ts
- package.json
- app.py
- uploads.ts
- splitter.ts
- VocalBooth.tsx
- listening.test.ts
- curriculum.ts
- projects.ts
- dj-realism.test.ts
- UploadManager.tsx
- aiKeys.ts
- exportMeta.ts
- collab.ts
- localCache.ts
- linkImport.ts
- InstallPrompt.tsx
- useLyrics
- NavBar.tsx
- schema.sql
- clipsOf
- dependencies
- studioStore.ts
- autoMatch.ts
- ref_fs
- react
- djMidi.ts
- auth.ts
- pairMatch.ts
- arrange.ts
- FakeContext
- compilerOptions
- progress.ts
- SplitLaneDialog.tsx
- mp3.ts
- split-queue.test.ts
- liveSync.ts
- splitHelper
- soundtouchjs.d.ts
- liveStudio.ts
- autoMix.ts
- Live.tsx
- studioHistory.ts
- test.mjs
- [id]/opengraph-image.tsx
- isConstrainedDevice
- uploads
- Remixt
- RemixCover.tsx
- devDependencies
- mixScore.ts
- neuralBeats.ts
- partyWorld.ts
- Remixt Social Share Image (1920x1080)
- RemixtMark
- lib/presence.ts
- heavy-play.mjs
- create
- pitchTempo.ts
- copy-ort.mjs
- aiDj.ts
- stemKinds.ts
- FakeParam
- audioEngine
- demucs-web.d.ts
- audioGraph.ts
- liveStudioDiff.ts
- stretchWorkers.ts
- scripts
- client/presence.ts
- Free on Vercel, with Neon and Vercel Blob
- bleed.ts
- .getContext
- Sharing Remixt with someone else
- nowPlayingAnchor.ts
- Free, all in one place: Oracle Cloud
- run.sh
- GoLiveStudioButton
- wholeIfAsked
- FakeOfflineContext
- Deploying Remixt
- Deployment options (Vercel, Oracle Cloud, own Docker server)
- Your own server (Docker)
- In-browser song splitter (Demucs via ONNX)
- Remixt — repo map
- AI co-producer on each person's own key
- Repo map for AI assistants (web, separation-service, storage)
- entrypoint.sh
- web/README.md
- start-dev.sh
- signalsmith-stretch.d.ts
- YouTube imports off by default because cloud data centres get blocked
- AGENTS.md
- parse-env.md
- sdk.md
- postcss.config.mjs
- Python separation service dependencies (FastAPI, demucs 4.0.1, librosa)
- FakeContext
- web/CLAUDE.md
- Google Search Console site verification file
- CONSTANTS
- ref_node_assert
- mediaSession.ts
- notifications.ts
- app/layout.tsx
- allowScripts

## God Nodes (most connected - your core abstractions)
1. `useStudioStore` - 147 edges
2. `next` - 141 edges
3. `sql` - 135 edges
4. `getCurrentUser()` - 135 edges
5. `DjEngine` - 130 edges
6. `react` - 123 edges
7. `AiProducer()` - 103 edges
8. `audioEngine` - 99 edges
9. `lucide-react` - 98 edges
10. `DeckId` - 83 edges

## Surprising Connections (you probably didn't know these)
- `Studio Page Mockup in Demo Poster` --semantically_similar_to--> `Studio Page Mockup (remixt-free.vercel.app/studio)`  [INFERRED] [semantically similar]
  web/public/remixt-demo-poster.jpg → remixt-share-1920x1080.png
- `Pooled vs direct connections: use the direct URL for migrations, dumps, and replication` --references--> `url()`  [INFERRED]
  web/.agents/skills/neon-postgres/SKILL.md → web/tests/shared-results.test.ts
- `Tune the Index` --references--> `quality()`  [INFERRED]
  web/.agents/skills/neon-postgres/references/vector-search.md → web/src/lib/client/harmony.ts
- `Remixt Demo Video Poster (1280x720)` --semantically_similar_to--> `Remixt Social Share Image (1920x1080)`  [INFERRED] [semantically similar]
  web/public/remixt-demo-poster.jpg → remixt-share-1920x1080.png
- `Path` --references--> `create()`  [INFERRED]
  web/.agents/skills/neon/references/claimable-neon.md → web/src/components/AdminPanel.tsx

## Import Cycles
- 3-file cycle: `web/src/lib/models.ts -> web/src/lib/schema.ts -> web/src/lib/social.ts -> web/src/lib/models.ts`
- 4-file cycle: `web/src/lib/schema.ts -> web/src/lib/social.ts -> web/src/lib/splitQueue.ts -> web/src/lib/trackUpload.ts -> web/src/lib/schema.ts`
- 4-file cycle: `web/src/lib/live.ts -> web/src/lib/social.ts -> web/src/lib/splitQueue.ts -> web/src/lib/notifications.ts -> web/src/lib/live.ts`
- 4-file cycle: `web/src/lib/notifications.ts -> web/src/lib/schema.ts -> web/src/lib/social.ts -> web/src/lib/splitQueue.ts -> web/src/lib/notifications.ts`
- 5-file cycle: `web/src/lib/models.ts -> web/src/lib/schema.ts -> web/src/lib/social.ts -> web/src/lib/splitQueue.ts -> web/src/lib/trackUpload.ts -> web/src/lib/models.ts`
- 5-file cycle: `web/src/lib/live.ts -> web/src/lib/schema.ts -> web/src/lib/social.ts -> web/src/lib/splitQueue.ts -> web/src/lib/notifications.ts -> web/src/lib/live.ts`

## Hyperedges (group relationships)
- **Hosting paths** — deploy_free_on_vercel_with_neon_and_vercel_blob, deploy_oracle_setup, deploy_docker_server [EXTRACTED 1.00]
- **Remixt core workflow: split stems, match BPM/pitch, mix, publish** — remixt_share_1920x1080_vocal_beat_split, remixt_share_1920x1080_bpm_pitch_match, remixt_share_1920x1080_multitrack_stem_lanes, remixt_share_1920x1080_publish_remix [EXTRACTED 1.00]
- **Client-side splitting pipeline** — readme_browser_splitter, readme_cross_origin_isolation, readme_split_in_browser_rationale [INFERRED 0.85]
- **Remixt background-free mark variants for overlay use** — web_public_remixt_logo_remixt_mark_transparent_mark_transparent, web_public_remixt_logo_remixt_mark_black_mark_black, web_public_remixt_logo_remixt_mark_white_mark_white [INFERRED 0.85]
- **Remixt light/dark theme-paired logo variants** — web_public_remixt_logo_remixt_mark_dark_mark_dark, web_public_remixt_logo_remixt_mark_light_mark_light, web_public_remixt_logo_remixt_logo_dark_bg_logo_dark_bg, web_public_remixt_logo_remixt_logo_light_bg_logo_light_bg, web_public_remixt_logo_remixt_avatar_dark_avatar_dark, web_public_remixt_logo_remixt_avatar_avatar [INFERRED 0.85]
- **Remixt Horizontal Logo Lockups (light/dark bg)** — web_public_remixt_logo_png_remixt_logo_dark_bg_logo_dark_bg, web_public_remixt_logo_png_remixt_logo_light_bg_logo_light_bg, web_public_remixt_logo_wordmark, web_public_remixt_logo_brand_gradient [INFERRED 0.85]
- **PWA / Home-screen App Icon Set** — web_public_remixt_logo_png_apple_touch_icon_apple_touch_icon, web_public_remixt_logo_png_icon_192_icon, web_public_remixt_logo_png_icon_512_icon [INFERRED 0.85]
- **create-next-app default public icons** — web_public_file_file_icon, web_public_globe_globe_icon, web_public_next_nextjs_wordmark, web_public_vercel_vercel_logo, web_public_window_window_icon [INFERRED 0.95]
- **Remixt Mark 1024px Color/Background Variants** — web_public_remixt_logo_png_remixt_mark_1024_mark, web_public_remixt_logo_png_remixt_mark_black_1024_mark_black, web_public_remixt_logo_png_remixt_mark_dark_1024_mark_dark, web_public_remixt_logo_png_remixt_mark_light_1024_mark_light, web_public_remixt_logo_png_remixt_mark_transparent_1024_mark_transparent, web_public_remixt_logo_png_remixt_mark_white_1024_mark_white [INFERRED 0.95]

## Communities (159 total, 20 thin omitted)

### Community 0 - "DjEngine"
Cohesion: 0.07
Nodes (7): DjConsole(), quantizePos(), DjEngine, clamp(), applyMidi(), DeckId, EqBand

### Community 1 - "challenges.ts"
Cohesion: 0.14
Nodes (22): DELETE(), GET(), POST(), schema, GET(), ChallengeDetail(), ChallengesPage(), metadata (+14 more)

### Community 2 - "aiIdeas.ts"
Cohesion: 0.06
Nodes (93): activeShare(), adoptTiming(), ALL_FIXES, applyLevels(), applyMix(), arrange(), arrangementIdeas(), arrangeOnDrop() (+85 more)

### Community 3 - "aiTrial.ts"
Cohesion: 0.07
Nodes (62): findDrop(), fixGroups(), HandEdit, mixSignature(), prepareSession(), rebaseSession(), Session, timingSignature() (+54 more)

### Community 4 - "getCurrentUser"
Cohesion: 0.07
Nodes (59): GET(), DELETE(), GET(), keyFor(), DELETE(), GET(), DELETE(), POST() (+51 more)

### Community 5 - "djEngine.ts"
Cohesion: 0.05
Nodes (75): BarCounter(), DeckPanel(), Pad(), PAD_JUMPS, PAD_MODE_LABEL, ROLLS, sign(), STEM_BUTTONS (+67 more)

### Community 6 - "ensureSchema"
Cohesion: 0.06
Nodes (67): zod, AdminPage(), metadata, findJunk(), GET(), maxDuration, POST(), GET() (+59 more)

### Community 7 - "DeckUnit"
Cohesion: 0.07
Nodes (11): keyLockTrim(), loopAwareDiff(), DeckUnit, DeckState, StemSlot, canRunJsVoices(), JsVoice, KeyLockVoice (+3 more)

### Community 8 - "storage.ts"
Cohesion: 0.11
Nodes (32): GET(), kept(), redirect(), DELETE(), GET(), imageExtension(), PUT(), remixRow() (+24 more)

### Community 9 - "liveReplay.ts"
Cohesion: 0.22
Nodes (12): ReplayClock, useReplayClock(), FeedStream, LiveStageState, indexAt(), positionAt(), Replay, ReplayChat (+4 more)

### Community 10 - "djMath.ts"
Cohesion: 0.08
Nodes (63): MissionSession(), deckName(), HintLevel, liveHints(), CrowdRequest, crowdScore(), CrowdState, ECHO_KEYS (+55 more)

### Community 11 - "modulation.ts"
Cohesion: 0.13
Nodes (20): AutomationLane(), at(), commit(), handleDown(), handleMove(), remove(), formatValue(), PARAMS (+12 more)

### Community 12 - "SocialClipButton.tsx"
Cohesion: 0.23
Nodes (17): clipRange(), formatTime(), noSubscription(), SocialClipButton(), make(), share(), fileSafeName(), canMakeClips() (+9 more)

### Community 13 - "lucide-react"
Cohesion: 0.08
Nodes (49): lucide-react, dynamic, LiveSessionPage(), api(), HostConsole(), chooseRemix(), endSession(), goLive() (+41 more)

### Community 14 - "AdminPanel.tsx"
Cohesion: 0.13
Nodes (34): AdminChallenge, AdminPanel(), AdminRemix, AdminReport, AdminResult, AdminTrack, AdminUser, ChallengesTab() (+26 more)

### Community 15 - "SongPicker.tsx"
Cohesion: 0.06
Nodes (45): ExamplesPage(), metadata, DEFAULT_PAIR, ExamplesLab(), STEPS, Flags, INFO, Kind (+37 more)

### Community 16 - "Studio.tsx"
Cohesion: 0.10
Nodes (34): formatAgo(), ModeChooser(), MODES, ModeSwitch(), Studio(), leaveTogether(), load(), restoreDraft() (+26 more)

### Community 17 - "clipCommands.ts"
Cohesion: 0.09
Nodes (92): gatePattern(), MAX_AUTOMATION_POINTS, pumpPattern(), spliceAutomation(), clearAutomation(), clearSelection(), clipFade(), clipGain() (+84 more)

### Community 18 - "audioEngine.ts"
Cohesion: 0.07
Nodes (28): bytesOf(), DecodedStem, decodeGate, Gate, lastUsed, LoadedLane, PHONE, PlaybackBlockedError (+20 more)

### Community 19 - "Arrangement.tsx"
Cohesion: 0.07
Nodes (73): AiSection(), Arrangement(), onContentPointerDown(), onContentPointerMove(), onContentPointerUp(), snapDelta(), timeAt(), ClipFades() (+65 more)

### Community 20 - "harmony.ts"
Cohesion: 0.16
Nodes (15): accentCache, accents(), chordRows(), Harmony, HarmonyAdvice, HarmonyScan, harmonyStatus(), HarmonyStretch (+7 more)

### Community 21 - "LyricsPanel.tsx"
Cohesion: 0.11
Nodes (40): LrclibResult, AiMode, alignedSheets, BigPrompter(), FitBadge(), FitTools(), isTyping(), LineProgress() (+32 more)

### Community 22 - "app/page.tsx"
Cohesion: 0.04
Nodes (94): DELETE(), GET(), POST(), postSchema, visible(), DELETE(), handle(), POST() (+86 more)

### Community 23 - "demoSongsDsp.ts"
Cohesion: 0.05
Nodes (66): CHORD_INTERVALS, ChordDef, ChordQuality, CHORUS_CYCLE, DEMO_SONG_DEFS, DEMO_SONGS, SectionName, songBars() (+58 more)

### Community 24 - "Lakebase Postgres"
Cohesion: 0.04
Nodes (43): Full-Text Search with BM25 Ranking, Prepare and Index Text, Query and Interpret Scores, Set Parameters at Build Time or Per Query, Set the Candidate Limit, Use Prefilter Selectively, Adapt the Hybrid Search, Hybrid Search (+35 more)

### Community 25 - "analysis.ts"
Cohesion: 0.09
Nodes (39): activeLoudness(), ANALYSIS_RATE, analyzeMono(), autocorrelation(), cache, chromagram(), correlation(), detectKey() (+31 more)

### Community 26 - "EasyDecks.tsx"
Cohesion: 0.06
Nodes (60): DjPage(), metadata, BeatMatchMeter(), FIT_TEXT, Gauge(), CopilotPanel(), ICON, BAND_COLOR (+52 more)

### Community 27 - "AiProducer"
Cohesion: 0.14
Nodes (46): AiProducer(), analyse(), applyOptions(), changeScope(), chooseSync(), chooseTiming(), chooseWhole(), close() (+38 more)

### Community 28 - "new/page.tsx"
Cohesion: 0.13
Nodes (14): dynamic, metadata, NewLivePage(), GoLiveForm(), localInputValue(), RemixChoice, RemixOwnerControls(), TagInput() (+6 more)

### Community 29 - "MatchStep.tsx"
Cohesion: 0.08
Nodes (53): demoLabSong(), EXCERPT_BARS, LabSong, libraryLabSong(), LibraryState, readSummaries(), summarize(), useSongSummaries() (+45 more)

### Community 30 - "next"
Cohesion: 0.05
Nodes (78): next, POST(), GET(), PUT(), POST(), schema, POST(), GET() (+70 more)

### Community 31 - "demoSongs.ts"
Cohesion: 0.10
Nodes (29): State, useDemoSong(), DEMO_STEMS, demoSongDef, cache, DemoPeakKey, makeBuffer(), peaksOf() (+21 more)

### Community 32 - "client/splitQueue.ts"
Cohesion: 0.10
Nodes (36): ago(), duration(), HelperPanel(), jobDetail(), LastBlock(), noSubscription(), QueuedSongRow(), RewardRules() (+28 more)

### Community 33 - "Neon"
Cohesion: 0.05
Nodes (41): Data API external JWKS, Functions: verify the JWT, then authorize the user, Incompatibilities, Managed Better Auth, Trusted domains, 1. Install the Neon CLI, 2. Install the Neon MCP Server, 3. Install Neon Agent Skills (+33 more)

### Community 34 - "musicKey.ts"
Cohesion: 0.08
Nodes (53): TrackLibrary(), AnalysisCard(), LEVEL_STYLE, pct(), Row(), Verdict(), BarGrid(), FIT_WORDS (+45 more)

### Community 35 - "AiProducer.tsx"
Cohesion: 0.05
Nodes (65): Icon(), IconName, ICONS, MEDAL_COLORS, Choice, ChoiceCards(), clock(), IdeaSwitch (+57 more)

### Community 36 - "mixdown.ts"
Cohesion: 0.16
Nodes (26): createMasterChain(), audioFileName(), wavHeader(), Bounce, bounceToFile(), encodeAudio(), encodeWav(), exportLane() (+18 more)

### Community 37 - "audioTags.ts"
Cohesion: 0.24
Nodes (22): asciiUrl(), AudioTags, chunk(), comment(), concat(), creditLine(), describedText(), frame() (+14 more)

### Community 38 - "directUpload.ts"
Cohesion: 0.10
Nodes (32): @vercel/blob, blobApi(), blobMultipart(), blobRequest(), BlobTarget, FinalUploadError, isFinalStatus(), isHidden() (+24 more)

### Community 39 - "CoProducer.tsx"
Cohesion: 0.12
Nodes (38): CoProducer(), chooseModel(), chooseProvider(), forgetKey(), moveToAccount(), send(), defaultRouterModel(), KeySetup() (+30 more)

### Community 40 - "libraryTracks.ts"
Cohesion: 0.13
Nodes (23): decoder(), entries, fold(), held, hold(), kept, load(), LoadedTrack (+15 more)

### Community 41 - "startNewStep"
Cohesion: 0.10
Nodes (45): FineTune(), keepWhatsPlaying(), MasterIt(), TuneButton(), TuneRow(), remove(), isMastered(), MasterPanel() (+37 more)

### Community 42 - "Remixt Brand Mark (split audio-waveform bars)"
Cohesion: 0.11
Nodes (33): File Icon (document glyph), Globe Icon, Next.js Wordmark Logo, Next.js Starter Template Assets, Remixt Brand Gradient (pink to violet to cyan), Remixt Brand Mark (split audio-waveform bars), Remixt Duotone Palette (pink top / cyan bottom bars), Apple Touch Icon (180px, gradient rounded-square, white bars) (+25 more)

### Community 43 - "quickHelp.ts"
Cohesion: 0.10
Nodes (19): Line, QuickHelp(), send(), SUGGESTIONS, availableFixes(), FixId, Idea, CoproducerContext (+11 more)

### Community 44 - "PartyWorld"
Cohesion: 0.09
Nodes (6): bubble(), canvasSprite(), emojiTexture(), nameLabel(), PartyWorld, roundRect()

### Community 45 - "models.ts"
Cohesion: 0.11
Nodes (26): DELETE(), POST(), setLiked(), GET(), POST(), GET(), PUT(), createSchema (+18 more)

### Community 46 - "useStudioStore"
Cohesion: 0.09
Nodes (41): Clock(), EmbedPlayer(), formatTime(), formatTime(), MixWaveform(), RemixDetailPlayer(), Playhead(), ContextMenuHost() (+33 more)

### Community 47 - "appIcon"
Cohesion: 0.22
Nodes (10): GET(), SIZES, AppleIcon(), contentType, size, contentType, Icon(), size (+2 more)

### Community 48 - "LineCard.tsx"
Cohesion: 0.16
Nodes (20): AddButton(), EasyStudio(), Guide(), Step, BigSwitch(), LineCard(), separate(), presetOf() (+12 more)

### Community 49 - "exportJob.ts"
Cohesion: 0.13
Nodes (26): ExportSheet(), save(), formatBytes(), formatDuration(), formatLeft(), noSubscription(), phoneKind(), deviceGb() (+18 more)

### Community 50 - "package.json"
Cohesion: 0.07
Nodes (26): @ast-grep/cli, aws4fetch, bcryptjs, demucs-web, eslint, eslint-config-next, jose, knip (+18 more)

### Community 51 - "app.py"
Cohesion: 0.12
Nodes (6): compute_peaks(), detect_bpm(), health(), load_and_encode(), separate(), SeparateRequest

### Community 52 - "uploads.ts"
Cohesion: 0.14
Nodes (23): ProgressBar(), RigStatus(), formatMB(), SplitterStatus(), BackgroundActivity(), doneText(), UploadList(), UploadRow() (+15 more)

### Community 53 - "splitter.ts"
Cohesion: 0.10
Nodes (22): Send, UploadTarget, Job, MODEL_URL, Turn, cancelled, init(), inlineMp3() (+14 more)

### Community 54 - "VocalBooth.tsx"
Cohesion: 0.12
Nodes (31): ElapsedTime(), formatTime(), LiveMonitor(), PlayheadTime(), readPrefs(), RecordPrefs, RecordTab(), begin() (+23 more)

### Community 55 - "listening.test.ts"
Cohesion: 0.11
Nodes (28): aggregate(), BEAT_NET, cosTable, deduplicate(), fft(), hzToMel(), LEVELS, logMelSpectrogram() (+20 more)

### Community 56 - "curriculum.ts"
Cohesion: 0.05
Nodes (61): DjHome(), ItemButton(), Briefing(), CamelotWheel(), CATEGORY_LABEL, categoryLabel(), CrowdBar(), Debrief() (+53 more)

### Community 57 - "projects.ts"
Cohesion: 0.15
Nodes (21): DELETE(), GET(), PUT(), putSchema, POST(), schema, GET(), POST() (+13 more)

### Community 58 - "dj-realism.test.ts"
Cohesion: 0.05
Nodes (77): FIT_LABEL, OtherDeck, SORTS, DETENT, hotCueAction(), nearEnd(), newMeter(), stepMeter() (+69 more)

### Community 59 - "UploadManager.tsx"
Cohesion: 0.15
Nodes (20): QueuedSongs(), QueueNotice(), nameList(), noSubscription(), skippedMessage(), SplitterInfo(), StatusBadge(), Stem (+12 more)

### Community 60 - "aiKeys.ts"
Cohesion: 0.07
Nodes (65): @anthropic-ai/sdk, maxDuration, POST(), DELETE(), GET(), PATCH(), patchSchema, PUT() (+57 more)

### Community 61 - "exportMeta.ts"
Cohesion: 0.16
Nodes (17): formatCount(), RemixStatsBar(), share(), ShareMenu(), id3Key(), TrackCredit, Cover, drawCover() (+9 more)

### Community 62 - "collab.ts"
Cohesion: 0.15
Nodes (15): CollabBar(), SYNC_LABEL, CollabMember, CollabSession, connectCollab(), idle, joinSharedSession(), mergeShared() (+7 more)

### Community 63 - "localCache.ts"
Cohesion: 0.10
Nodes (29): metadata, StoragePage(), formatBytes(), KIND_TEXT, MODEL_TEXT, ModelKey, ModelUsage, StorageSettings() (+21 more)

### Community 64 - "linkImport.ts"
Cohesion: 0.14
Nodes (19): bodySchema, maxDuration, POST(), POST(), metadata, UploadPage(), checkLink(), downloadSong() (+11 more)

### Community 65 - "InstallPrompt.tsx"
Cohesion: 0.48
Nodes (6): InstallEvent, InstallPrompt(), dismiss(), install(), read(), write()

### Community 66 - "useLyrics"
Cohesion: 0.14
Nodes (19): AiTabView(), accept(), EditTab(), FindTab(), LyricsTools(), StartCard(), VocalBooth(), activeSheet() (+11 more)

### Community 67 - "NavBar.tsx"
Cohesion: 0.18
Nodes (14): MobileTabBar(), Tab(), AccountMenu(), MoreLinks(), NavBar(), ICONS, isActive(), MORE_LINKS (+6 more)

### Community 68 - "schema.sql"
Cohesion: 0.11
Nodes (42): ai_shared_usage, challenges, follows, idx_comments_remix, idx_follows_followee, idx_lanes_remix, idx_live_events_stream, idx_live_streams_host (+34 more)

### Community 69 - "clipsOf"
Cohesion: 0.07
Nodes (60): zustand, Logs: CLI, Loki, and SDK pagination, Loki-compatible read API, AiScopeBar(), Drag, Pick, PICK_ICONS, Playhead() (+52 more)

### Community 70 - "dependencies"
Cohesion: 0.10
Nodes (21): dependencies, @anthropic-ai/sdk, aws4fetch, bcryptjs, demucs-web, jose, lucide-react, next (+13 more)

### Community 71 - "studioStore.ts"
Cohesion: 0.08
Nodes (29): FxSlider(), hz(), LaneFxPanel(), pct(), cache, Kind, libraryStems(), MatchFinder() (+21 more)

### Community 72 - "autoMatch.ts"
Cohesion: 0.11
Nodes (29): beatPhase(), findPhrases(), gridScore(), onsetAt(), refineTempo(), PRE_ROLL, TAIL, ALL_STEPS (+21 more)

### Community 73 - "ref_fs"
Cohesion: 0.13
Nodes (11): postgres, buildId(), nextConfig(), tunnelHost, root, assets, root, target (+3 more)

### Community 74 - "react"
Cohesion: 0.13
Nodes (14): react, formatDuration(), LibraryBrowser(), StemWithTrack, TabButton(), ago(), AtPlayhead(), formatAt() (+6 more)

### Community 75 - "djMidi.ts"
Cohesion: 0.19
Nodes (14): MidiPanel(), controlKey(), learn(), loadMidiMap(), MIDI_ACTIONS, MidiAction, MidiLink, MidiMap (+6 more)

### Community 76 - "auth.ts"
Cohesion: 0.17
Nodes (13): POST(), schema, POST(), POST(), schema, clearSessionCookie(), createSessionCookie(), hashPassword() (+5 more)

### Community 77 - "pairMatch.ts"
Cohesion: 0.10
Nodes (38): Baseline, Choice(), LaneMatchPanel(), handleApply(), handleUndo(), snapshot(), untouchedSince(), HeardVocal (+30 more)

### Community 78 - "arrange.ts"
Cohesion: 0.12
Nodes (29): Phrase, trackBeats(), argmax(), Arrangement, arrangeVocal(), BeatGrid, beatStructure, downbeatScores() (+21 more)

### Community 80 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+11 more)

### Community 81 - "progress.ts"
Cohesion: 0.17
Nodes (12): cache, EMPTY, emptyProgress(), isRecord(), isUnlocked(), listeners, loadProgress(), MissionRecord (+4 more)

### Community 82 - "SplitLaneDialog.tsx"
Cohesion: 0.14
Nodes (25): SplitLaneDialog(), finish(), start(), cache, findParts(), placeStems(), siblingStems(), swapInParts() (+17 more)

### Community 83 - "mp3.ts"
Cohesion: 0.21
Nodes (16): wasm-media-encoders, channels(), encodeMp3(), encodeMp3Bytes(), openMp3Stream(), handleStream(), Mp3Response, Mp3StreamMessage (+8 more)

### Community 84 - "split-queue.test.ts"
Cohesion: 0.09
Nodes (25): Function Triggers (CLI, MCP, REST), fetchSongFromLink(), fetchInSlices(), fetchRange(), fetchStem(), fetchWhole(), body(), claim() (+17 more)

### Community 85 - "liveSync.ts"
Cohesion: 0.17
Nodes (14): Avatar(), Message(), readGuestName(), FollowStatus, hostPosition(), LiveConnection, LiveFeedState, LiveReactionBurst (+6 more)

### Community 86 - "splitHelper"
Cohesion: 0.16
Nodes (10): audioDuration(), ifNoOtherTabHelping(), LostJob, shrinkForQueue(), splitHelper, done(), stageName(), stageProgress() (+2 more)

### Community 87 - "soundtouchjs.d.ts"
Cohesion: 0.11
Nodes (5): FifoSampleBuffer, SimpleFilter, SoundTouch, soundtouchjs, WebAudioBufferSource

### Community 88 - "liveStudio.ts"
Cohesion: 0.22
Nodes (12): isMix(), mixFields(), mixOf(), startStudioBroadcast(), scheduleMix(), scheduleState(), sendMix(), sendState() (+4 more)

### Community 89 - "autoMix.ts"
Cohesion: 0.16
Nodes (14): AutoMixPanel(), viewOf(), AUTO_MIX_STEPS, AutoMix, AutoMixEngine, AutoMixPhase, BLEND_BEATS, PHRASE_BEATS (+6 more)

### Community 90 - "Live.tsx"
Cohesion: 0.23
Nodes (15): ACTIVITY_ICON, ActivityGlyph(), activityKey(), ActivityText(), ago(), AREA_LABEL, AREA_SHORT, AreaShort() (+7 more)

### Community 91 - "studioHistory.ts"
Cohesion: 0.07
Nodes (40): ago(), Entry(), HistoryList(), useCurrent(), PAD_KEYS, SamplePads(), GROUPS, handleKey() (+32 more)

### Community 92 - "test.mjs"
Cohesion: 0.14
Nodes (9): databaseUrl, envLocal(), log, prepareDatabase(), root, server, serverEnv, storage (+1 more)

### Community 93 - "[id]/opengraph-image.tsx"
Cohesion: 0.10
Nodes (24): alt, contentType, Image(), size, alt, contentType, coverDataUri(), Image() (+16 more)

### Community 94 - "isConstrainedDevice"
Cohesion: 0.25
Nodes (4): isConstrainedDevice(), decode(), splitSong(), splitter

### Community 96 - "Remixt"
Cohesion: 0.14
Nodes (14): Architecture, Community, Configuration, Deploying it, Notes, Postgres (accounts, tracks, stems, remixes), Remixt, Running it (+6 more)

### Community 97 - "RemixCover.tsx"
Cohesion: 0.36
Nodes (6): RemixCover(), pick(), decode(), Decoded, squareCover(), uploadCover()

### Community 98 - "devDependencies"
Cohesion: 0.12
Nodes (16): devDependencies, @ast-grep/cli, eslint, eslint-config-next, knip, playwright-core, tailwindcss, @tailwindcss/postcss (+8 more)

### Community 99 - "mixScore.ts"
Cohesion: 0.11
Nodes (26): Best, CheckActions, FixState, STATUS, chooseShift(), FixGroup, harmonyOf(), ideaFits() (+18 more)

### Community 100 - "neuralBeats.ts"
Cohesion: 0.09
Nodes (41): Engines(), analyzeAndKeep(), analyzeStem(), diskKey(), keptAnalysis(), packAnalysis(), unpackAnalysis(), cachePut() (+33 more)

### Community 101 - "partyWorld.ts"
Cohesion: 0.20
Nodes (11): three, CAMERAS, hasWebGL(), PartyHandle, Avatar, CameraMode, emojiTextures, Floater (+3 more)

### Community 102 - "Remixt Social Share Image (1920x1080)"
Cohesion: 0.23
Nodes (12): App Navigation: Library / Studio / Remixes / Upload, BPM & Pitch Match feature (Sync BPM), remixt-free.vercel.app (Vercel deployment), Multitrack Stem Lanes (VOCALS/BEAT waveforms with Vol & Pitch sliders), Publish Remix Under Your Name, Remixt Brand (gradient R logo, pink-purple-cyan palette), Remixt Social Share Image (1920x1080), Studio Page Mockup (remixt-free.vercel.app/studio) (+4 more)

### Community 103 - "RemixtMark"
Cohesion: 0.14
Nodes (17): Error(), Field(), LoginPage(), metadata, NotFound(), Field(), SignupPage(), metadata (+9 more)

### Community 104 - "lib/presence.ts"
Cohesion: 0.25
Nodes (13): GET(), POST(), Activity, ActivityType, Area, areaFor(), AREAS, ensurePresenceSchema() (+5 more)

### Community 105 - "heavy-play.mjs"
Cohesion: 0.15
Nodes (10): playwright-core, args, errors, play, restore, samples, songs, sounding (+2 more)

### Community 106 - "create"
Cohesion: 0.25
Nodes (7): Claim, Claimable Neon, If neon claim is missing, Path, With REST, With the CLI, create()

### Community 107 - "pitchTempo.ts"
Cohesion: 0.11
Nodes (17): signalsmith-stretch, soundtouchjs, feedAsRendered(), hasSound(), renderHq(), renderInWorker(), renderOnPage(), renderPitchTempo() (+9 more)

### Community 108 - "copy-ort.mjs"
Cohesion: 0.22
Nodes (8): files, from, root, stretch, stretchFrom, stretchTo, to, fixStretchWorklet()

### Community 109 - "aiDj.ts"
Cohesion: 0.21
Nodes (9): AiDj, Phase, DJ_TRACKS, djTrackInfo(), LoadedTrack, MISSIONS, setup(), track() (+1 more)

### Community 110 - "stemKinds.ts"
Cohesion: 0.08
Nodes (34): formatTime(), PreviewBar(), add(), ListedStem, SongRow(), StemWithTrack, StudioLibraryPanel(), TAB_LABEL (+26 more)

### Community 112 - "audioEngine"
Cohesion: 0.15
Nodes (5): audioEngine, clipKey(), crossfaderGain(), laneGain(), StudioLane

### Community 113 - "demucs-web.d.ts"
Cohesion: 0.17
Nodes (7): Channels, demucs-web, demucs-web/constants, demucs-web/processor, DemucsProcessor, Progress, Spec

### Community 114 - "audioGraph.ts"
Cohesion: 0.09
Nodes (27): ClipBufferLookup, clipEnvelope(), createLaneChain(), routeCompressor(), routeDrive(), routeReverb(), update(), update() (+19 more)

### Community 115 - "liveStudioDiff.ts"
Cohesion: 0.27
Nodes (6): describeMixChanges(), DiffLane, DiffMix, FX_WORDS, laneLabel(), same()

### Community 116 - "stretchWorkers.ts"
Cohesion: 0.11
Nodes (26): askMore(), haveInput(), Job, jobs, load(), readInput(), run(), StretchFromWorker (+18 more)

### Community 117 - "scripts"
Cohesion: 0.18
Nodes (11): scripts, build, dev, knip, lint, prebuild, predev, sg (+3 more)

### Community 118 - "client/presence.ts"
Cohesion: 0.33
Nodes (7): RootLayout(), PresenceHeartbeat(), listeners, randomId(), sendHeartbeat(), subscribe(), visitorId()

### Community 119 - "Free on Vercel, with Neon and Vercel Blob"
Cohesion: 0.22
Nodes (9): 1. Put the code on GitHub, 2. Create the Vercel project, 3. Add the database (Neon), 4. Add stem storage (Vercel Blob), 5. Redeploy and finish, 6. Try it, Free on Vercel, with Neon and Vercel Blob, Optional (+1 more)

### Community 120 - "bleed.ts"
Cohesion: 0.50
Nodes (6): bleedScore(), bleedWithLag(), checkTake(), correlation(), highFrequencyEnergy(), TakeCheck

### Community 121 - ".getContext"
Cohesion: 0.15
Nodes (4): reportMixNowPlaying(), stopSources(), getPlayingRemix(), Pad

### Community 122 - "Sharing Remixt with someone else"
Cohesion: 0.25
Nodes (7): `./share.sh cloudflared` — your Cloudflare tunnel, `./share.sh ngrok` — ngrok, `./share.sh` — serveo (default), Sharing Remixt with someone else, The three providers, Things worth knowing before you send the link, Why not Cloudflare's quick tunnel

### Community 123 - "nowPlayingAnchor.ts"
Cohesion: 0.36
Nodes (7): disableNowPlayingAnchor(), element(), lostListeners, onNowPlayingAnchorLost(), silentWav(), startNowPlayingAnchor(), stopNowPlayingAnchor()

### Community 124 - "Free, all in one place: Oracle Cloud"
Cohesion: 0.29
Nodes (7): 1. Create the account, 2. Create the server, 3. Open ports 80 and 443, 4. Get a free domain name, 5. Install Docker and start Remixt, 6. Keep it running, Free, all in one place: Oracle Cloud

### Community 125 - "run.sh"
Cohesion: 0.29
Nodes (3): PATH, run.sh script, share.sh script

### Community 126 - "GoLiveStudioButton"
Cohesion: 0.38
Nodes (6): api(), GoLiveStudioButton(), endExistingAndStart(), start(), end(), goLive()

### Community 127 - "wholeIfAsked"
Cohesion: 0.47
Nodes (6): rankIdeas(), recompileIdea(), reworkIdeas(), studioIdeas(), wholeIfAsked(), playsInOrder()

### Community 129 - "Deploying Remixt"
Cohesion: 0.33
Nodes (4): Before you open it to the public, Deploying Remixt, How the splitting works (and what it costs visitors), Songs from a link

### Community 130 - "Deployment options (Vercel, Oracle Cloud, own Docker server)"
Cohesion: 0.33
Nodes (6): Database and storage backups (pg_dump and tar), Cloudflare Tunnel deployment (no open ports), Own server via the Docker image (Caddy HTTPS), Deployment options (Vercel, Oracle Cloud, own Docker server), Free all-in-one server on Oracle Cloud, Checklist before opening to the public (copyright, quotas, plan)

### Community 131 - "Your own server (Docker)"
Cohesion: 0.33
Nodes (6): Building on a Mac for a different server, Options, The AI co-producer, Through a Cloudflare Tunnel instead (no open ports), Updating and backups, Your own server (Docker)

### Community 132 - "In-browser song splitter (Demucs via ONNX)"
Cohesion: 0.33
Nodes (3): In-browser song splitter (Demucs via ONNX), Cross-origin isolation (COOP/COEP) for WebAssembly threads, separation-service (retired Python Demucs splitter)

### Community 135 - "Remixt — repo map"
Cohesion: 0.40
Nodes (4): Commands, Finding code, Layout, Remixt — repo map

### Community 136 - "AI co-producer on each person's own key"
Cohesion: 0.40
Nodes (5): AI co-producer on each person's own key, Optional shared free AI questions (AI_SHARED_ANTHROPIC_KEY), AI producer panel, Arrangement engine (fits lanes together without changing pitch), Quick help (no-AI request handling, English and Persian)

### Community 137 - "Repo map for AI assistants (web, separation-service, storage)"
Cohesion: 0.50
Nodes (3): Dev, typecheck, lint and test commands, Repo map for AI assistants (web, separation-service, storage), web/CLAUDE.md and AGENTS.md hold Next.js rules

### Community 138 - "entrypoint.sh"
Cohesion: 1.00
Nodes (3): log(), entrypoint.sh script, shutdown()

### Community 139 - "web/README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

### Community 154 - "ref_node_assert"
Cohesion: 0.06
Nodes (19): share(), StemAnalysis, ctx, StudioLane, Snapshot, StudioLane, chat(), Client (+11 more)

### Community 158 - "mediaSession.ts"
Cohesion: 0.23
Nodes (11): NOW_PLAYING_ARTWORK, apply(), artworkFor(), lastPosition, mediaSession(), NowPlaying, Owner, owners (+3 more)

### Community 163 - "notifications.ts"
Cohesion: 0.22
Nodes (13): GET(), POST(), describe(), hrefFor(), metadata, NotificationsPage(), timeAgo(), MarkNotificationsRead() (+5 more)

### Community 168 - "app/layout.tsx"
Cohesion: 0.19
Nodes (9): geistMono, geistSans, metadata, viewport, isStaleChunk(), readLater(), UpdatePrompt(), SITE_DESCRIPTION (+1 more)

### Community 171 - "allowScripts"
Cohesion: 0.67
Nodes (3): allowScripts, better-sqlite3@13.0.3, unrs-resolver@1.12.2

## Ambiguous Edges - Review These
- `Remixt Brand Gradient (pink to violet to cyan)` → `Remixt Mark - Black Monochrome`  [AMBIGUOUS]
  web/public/remixt-logo/remixt-mark-black.svg · relation: references
- `Remixt Brand Gradient (pink to violet to cyan)` → `Remixt Mark - White Monochrome`  [AMBIGUOUS]
  web/public/remixt-logo/remixt-mark-white.svg · relation: references

## Knowledge Gaps
- **39 isolated node(s):** `Python separation service dependencies (FastAPI, demucs 4.0.1, librosa)`, `Google Search Console site verification file`, `Vazirmatn font (SIL Open Font License 1.1)`, `PATH`, `CONSTANTS` (+34 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1194 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `react` to `djEngine.ts`, `liveReplay.ts`, `modulation.ts`, `SocialClipButton.tsx`, `lucide-react`, `AdminPanel.tsx`, `SongPicker.tsx`, `Studio.tsx`, `Arrangement.tsx`, `LyricsPanel.tsx`, `app/page.tsx`, `EasyDecks.tsx`, `new/page.tsx`, `MatchStep.tsx`, `next`, `demoSongs.ts`, `client/splitQueue.ts`, `musicKey.ts`, `notifications.ts`, `AiProducer.tsx`, `CoProducer.tsx`, `libraryTracks.ts`, `startNewStep`, `app/layout.tsx`, `quickHelp.ts`, `models.ts`, `useStudioStore`, `LineCard.tsx`, `exportJob.ts`, `package.json`, `uploads.ts`, `splitter.ts`, `VocalBooth.tsx`, `curriculum.ts`, `dj-realism.test.ts`, `UploadManager.tsx`, `exportMeta.ts`, `collab.ts`, `localCache.ts`, `InstallPrompt.tsx`, `NavBar.tsx`, `clipsOf`, `studioStore.ts`, `djMidi.ts`, `pairMatch.ts`, `SplitLaneDialog.tsx`, `liveSync.ts`, `Live.tsx`, `studioHistory.ts`, `RemixCover.tsx`, `mixScore.ts`, `partyWorld.ts`, `RemixtMark`, `stemKinds.ts`, `client/presence.ts`?**
  _High betweenness centrality (0.145) - this node is a cross-community bridge._
- **What connects `Python separation service dependencies (FastAPI, demucs 4.0.1, librosa)`, `Google Search Console site verification file`, `Vazirmatn font (SIL Open Font License 1.1)` to the rest of the system?**
  _39 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `DjEngine` be split into smaller, more focused modules?**
  _Cohesion score 0.06921618204804046 - nodes in this community are weakly interconnected._
- **Why does `lucide-react` connect `lucide-react` to `challenges.ts`, `djEngine.ts`, `SocialClipButton.tsx`, `AdminPanel.tsx`, `SongPicker.tsx`, `Studio.tsx`, `Arrangement.tsx`, `LyricsPanel.tsx`, `app/page.tsx`, `EasyDecks.tsx`, `new/page.tsx`, `MatchStep.tsx`, `next`, `client/splitQueue.ts`, `musicKey.ts`, `AiProducer.tsx`, `CoProducer.tsx`, `app/layout.tsx`, `startNewStep`, `quickHelp.ts`, `useStudioStore`, `LineCard.tsx`, `exportJob.ts`, `package.json`, `uploads.ts`, `VocalBooth.tsx`, `curriculum.ts`, `dj-realism.test.ts`, `UploadManager.tsx`, `exportMeta.ts`, `collab.ts`, `InstallPrompt.tsx`, `NavBar.tsx`, `clipsOf`, `studioStore.ts`, `react`, `djMidi.ts`, `pairMatch.ts`, `SplitLaneDialog.tsx`, `liveSync.ts`, `Live.tsx`, `studioHistory.ts`, `RemixCover.tsx`, `mixScore.ts`, `partyWorld.ts`, `RemixtMark`, `stemKinds.ts`?**
  _High betweenness centrality (0.093) - this node is a cross-community bridge._
- **Should `challenges.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.14245014245014245 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Remixt Brand Gradient (pink to violet to cyan)` and `Remixt Mark - Black Monochrome`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `Remixt Brand Gradient (pink to violet to cyan)` and `Remixt Mark - White Monochrome`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._