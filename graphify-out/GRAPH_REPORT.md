# Graph Report - code  (2026-10-11)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 4318 nodes · 13515 edges · 154 communities (135 shown, 19 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 188 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f09a8fb6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- DjEngine
- app/page.tsx
- aiIdeas.ts
- MissionSession.tsx
- getCurrentUser
- djTypes.ts
- sql
- dj-realism.test.ts
- models.ts
- live.ts
- djMath.ts
- studioStore.ts
- SocialClipButton.tsx
- lucide-react
- AdminPanel.tsx
- SongPicker.tsx
- Studio.tsx
- clipCommands.ts
- audioEngine
- Arrangement.tsx
- studio-session.test.ts
- aiTrial.ts
- mixScore.ts
- demoSongsDsp.ts
- Lakebase Postgres
- analysis.ts
- DjConsole.tsx
- AiProducer
- api/remixes/route.ts
- camelotCode
- audioEngine.ts
- demoSongs.ts
- client/splitQueue.ts
- Neon
- musicKey.ts
- AiProducer.tsx
- mixdown.ts
- exportMeta.ts
- directUpload.ts
- CoProducer.tsx
- libraryTracks.ts
- WhatHappened.tsx
- Remixt Brand Mark (split audio-waveform bars)
- quickHelp.ts
- PartyWorld
- stemKinds.ts
- remixLanes.ts
- LaneInspector.tsx
- useStudioStore
- exportJob.ts
- package.json
- app.py
- stemResults.ts
- splitter.ts
- VocalRecorder.tsx
- beatNet.ts
- scenarios.ts
- projects.ts
- uploads.ts
- UploadManager.tsx
- aiKeys.ts
- audioGraph.ts
- collab.ts
- localCache.ts
- extras.tsx
- aiExplain.ts
- ai/chat/route.ts
- NavBar.tsx
- SplitLaneDialog.tsx
- splitter.worker.ts
- dependencies
- stretch-memory.test.ts
- autoMatch.ts
- ref_fs
- react
- openrouter.ts
- djMidi.ts
- LaneMatchPanel.tsx
- arrange.ts
- FakeContext
- compilerOptions
- MixerConsole.tsx
- StudioLibraryPanel.tsx
- pairMatch.ts
- challenges.ts
- MatchStep.tsx
- splitHelper
- soundtouchjs.d.ts
- linkImport.ts
- StorageSettings.tsx
- liveSync.ts
- EasyStudio.tsx
- test.mjs
- rtlText.ts
- Live.tsx
- uploads
- Remixt
- partyWorld.ts
- devDependencies
- lib/presence.ts
- neuralBeats.ts
- stemFetch.ts
- Remixt Social Share Image (1920x1080)
- LineCard.tsx
- AutomationLane.tsx
- StudioShortcuts.tsx
- liveStudio.ts
- pitchTempo.ts
- signup/route.ts
- app/layout.tsx
- mediaSession.ts
- trackBeats
- previewPlayer
- demucs-web.d.ts
- MatchFinder.tsx
- liveStudioDiff.ts
- studioView.ts
- scripts
- live.test.ts
- Free on Vercel, with Neon and Vercel Blob
- client/presence.ts
- RemixCover.tsx
- Sharing Remixt with someone else
- mixSignature
- Free, all in one place: Oracle Cloud
- run.sh
- Image
- InstallPrompt.tsx
- GoLiveStudioButton
- Deploying Remixt
- Deployment options (Vercel, Oracle Cloud, own Docker server)
- Your own server (Docker)
- In-browser song splitter (Demucs via ONNX)
- ref_node_fs
- FakeOfflineContext
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
- Google Search Console site verification file
- CONSTANTS

## God Nodes (most connected - your core abstractions)
1. `sql` - 138 edges
2. `next` - 137 edges
3. `useStudioStore` - 133 edges
4. `getCurrentUser()` - 132 edges
5. `DjEngine` - 128 edges
6. `react` - 117 edges
7. `AiProducer()` - 104 edges
8. `lucide-react` - 94 edges
9. `audioEngine` - 78 edges
10. `DeckId` - 76 edges

## Surprising Connections (you probably didn't know these)
- `Studio Page Mockup in Demo Poster` --semantically_similar_to--> `Studio Page Mockup (remixt-free.vercel.app/studio)`  [INFERRED] [semantically similar]
  web/public/remixt-demo-poster.jpg → remixt-share-1920x1080.png
- `Tune the Index` --references--> `quality()`  [INFERRED]
  web/.agents/skills/neon-postgres/references/vector-search.md → web/src/lib/client/harmony.ts
- `Pooled vs direct connections: use the direct URL for migrations, dumps, and replication` --references--> `url()`  [INFERRED]
  web/.agents/skills/neon-postgres/SKILL.md → web/tests/shared-results.test.ts
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

## Communities (154 total, 19 thin omitted)

### Community 0 - "DjEngine"
Cohesion: 0.06
Nodes (8): DjConsole(), quantizePos(), DeckUnit, DjEngine, clamp(), applyMidi(), DeckId, EqBand

### Community 1 - "app/page.tsx"
Cohesion: 0.04
Nodes (99): DELETE(), GET(), POST(), postSchema, visible(), DELETE(), POST(), setLiked() (+91 more)

### Community 2 - "aiIdeas.ts"
Cohesion: 0.05
Nodes (104): tuneIdea(), remove(), FIT, KeyHelper(), Vibe, activeShare(), adoptTiming(), ALL_FIXES (+96 more)

### Community 3 - "MissionSession.tsx"
Cohesion: 0.03
Nodes (94): DjPage(), metadata, BeatMatchMeter(), FIT_TEXT, Gauge(), CopilotPanel(), ICON, DjApp() (+86 more)

### Community 4 - "getCurrentUser"
Cohesion: 0.05
Nodes (79): POST(), GET(), POST(), GET(), POST(), POST(), DELETE(), POST() (+71 more)

### Community 5 - "djTypes.ts"
Cohesion: 0.04
Nodes (87): FIT_LABEL, OtherDeck, SORTS, DemoStem, SectionName, AiDj, Phase, browse() (+79 more)

### Community 6 - "sql"
Cohesion: 0.07
Nodes (58): next, zod, AdminPage(), metadata, DELETE(), GET(), POST(), schema (+50 more)

### Community 7 - "dj-realism.test.ts"
Cohesion: 0.04
Nodes (61): BarCounter(), DeckPanel(), Pad(), PAD_JUMPS, PAD_MODE_LABEL, ROLLS, sign(), STEM_BUTTONS (+53 more)

### Community 8 - "models.ts"
Cohesion: 0.06
Nodes (65): GET(), kept(), redirect(), DELETE(), GET(), keyFor(), bodySchema, maxDuration (+57 more)

### Community 9 - "live.ts"
Cohesion: 0.05
Nodes (66): PUT(), POST(), schema, DELETE(), GET(), PATCH(), patchSchema, PUT() (+58 more)

### Community 10 - "djMath.ts"
Cohesion: 0.08
Nodes (63): MissionSession(), sessionGear(), CrowdRequest, crowdScore(), CrowdState, ECHO_KEYS, fxTotal(), KINDS (+55 more)

### Community 11 - "studioStore.ts"
Cohesion: 0.09
Nodes (66): Logs: CLI, Loki, and SDK pagination, Loki-compatible read API, onContentPointerMove(), allClipRefs(), asWholeTake(), cleanClip(), clipId(), clipsOf() (+58 more)

### Community 12 - "SocialClipButton.tsx"
Cohesion: 0.06
Nodes (49): qrcode, GET(), SIZES, AppleIcon(), contentType, size, Error(), contentType (+41 more)

### Community 13 - "lucide-react"
Cohesion: 0.09
Nodes (46): lucide-react, api(), HostConsole(), chooseRemix(), endSession(), goLive(), saveSettings(), NOTE_PRESETS (+38 more)

### Community 14 - "AdminPanel.tsx"
Cohesion: 0.06
Nodes (57): Claim, Claimable Neon, If neon claim is missing, Path, With REST, With the CLI, Function Triggers (CLI, MCP, REST), AdminChallenge (+49 more)

### Community 15 - "SongPicker.tsx"
Cohesion: 0.07
Nodes (44): ExamplesPage(), metadata, DEFAULT_PAIR, ExamplesLab(), STEPS, Flags, INFO, Kind (+36 more)

### Community 16 - "Studio.tsx"
Cohesion: 0.07
Nodes (49): CollabBar(), SYNC_LABEL, formatAgo(), LaneInspector(), ModeChooser(), MODES, ModeSwitch(), SamplePads() (+41 more)

### Community 17 - "clipCommands.ts"
Cohesion: 0.12
Nodes (57): cutSilences(), gatePattern(), MAX_AUTOMATION_POINTS, pumpPattern(), spliceAutomation(), clearAutomation(), clearSelection(), clipFade() (+49 more)

### Community 18 - "audioEngine"
Cohesion: 0.09
Nodes (18): audioEngine, queueModulation(), reportMixNowPlaying(), sliceBuffer(), stopSources(), createMasterChain(), scheduleLane(), getPlayingRemix() (+10 more)

### Community 19 - "Arrangement.tsx"
Cohesion: 0.10
Nodes (50): react-dom, AiSection(), Arrangement(), onContentPointerDown(), onContentPointerUp(), snapDelta(), timeAt(), ClipFades() (+42 more)

### Community 20 - "studio-session.test.ts"
Cohesion: 0.09
Nodes (48): zustand, AiScopeBar(), Drag, Pick, PICK_ICONS, Playhead(), clock(), Part (+40 more)

### Community 21 - "aiTrial.ts"
Cohesion: 0.10
Nodes (47): putBackOn(), compatible(), findDrop(), fixesOf(), fixGroups(), HandEdit, ideaFits(), slotOf() (+39 more)

### Community 22 - "mixScore.ts"
Cohesion: 0.08
Nodes (40): FIT_WORDS, STATUS_COLOR, checkMix(), chooseShift(), harmonyOf(), keyStretch(), playedLoudness(), recordingOf() (+32 more)

### Community 23 - "demoSongsDsp.ts"
Cohesion: 0.08
Nodes (47): activeRms(), addClap(), addCrash(), addHat(), addKick(), addReverb(), addRim(), addSnare() (+39 more)

### Community 24 - "Lakebase Postgres"
Cohesion: 0.04
Nodes (43): Full-Text Search with BM25 Ranking, Prepare and Index Text, Query and Interpret Scores, Set Parameters at Build Time or Per Query, Set the Candidate Limit, Use Prefilter Selectively, Adapt the Hybrid Search, Hybrid Search (+35 more)

### Community 25 - "analysis.ts"
Cohesion: 0.08
Nodes (45): activeLoudness(), ANALYSIS_RATE, analyzeAndKeep(), analyzeMono(), autocorrelation(), cache, chromagram(), correlation() (+37 more)

### Community 26 - "DjConsole.tsx"
Cohesion: 0.09
Nodes (38): BAND_COLOR, bandsAt(), DeckOverview(), DeckWave(), DRAW_ORDER, killedSlot(), STEM_COLOR, WaveMode (+30 more)

### Community 27 - "AiProducer"
Cohesion: 0.12
Nodes (44): AiProducer(), applyOptions(), changeScope(), chooseSync(), chooseTiming(), chooseWhole(), close(), findBest() (+36 more)

### Community 28 - "api/remixes/route.ts"
Cohesion: 0.08
Nodes (32): GET(), POST(), DELETE(), GET(), PATCH(), patchSchema, createSchema, laneSchema (+24 more)

### Community 29 - "camelotCode"
Cohesion: 0.11
Nodes (38): demoLabSong(), EXCERPT_BARS, LabSong, libraryLabSong(), LoadedTrack, useSongSummaries(), Found, SongSelect() (+30 more)

### Community 30 - "audioEngine.ts"
Cohesion: 0.08
Nodes (28): bytesOf(), clipKey(), DecodedStem, lastUsed, LoadedLane, PHONE, PlaybackBlockedError, QueuedRender (+20 more)

### Community 31 - "demoSongs.ts"
Cohesion: 0.08
Nodes (37): useSide(), State, useDemoSong(), CHORD_INTERVALS, ChordDef, ChordQuality, CHORUS_CYCLE, DEMO_SONG_DEFS (+29 more)

### Community 32 - "client/splitQueue.ts"
Cohesion: 0.09
Nodes (40): ago(), duration(), HelperPanel(), jobDetail(), LastBlock(), noSubscription(), QueuedSongRow(), QueuedSongs() (+32 more)

### Community 33 - "Neon"
Cohesion: 0.05
Nodes (41): Data API external JWKS, Functions: verify the JWT, then authorize the user, Incompatibilities, Managed Better Auth, Trusted domains, 1. Install the Neon CLI, 2. Install the Neon MCP Server, 3. Install Neon Agent Skills (+33 more)

### Community 34 - "musicKey.ts"
Cohesion: 0.10
Nodes (38): TrackLibrary(), AnalysisCard(), LEVEL_STYLE, pct(), Row(), Verdict(), BarGrid(), FIT_WORDS (+30 more)

### Community 35 - "AiProducer.tsx"
Cohesion: 0.06
Nodes (35): Best, CheckActions, FixState, STATUS, afterPaint(), DROP_GROUPS, ENTRIES, GROUPED (+27 more)

### Community 36 - "mixdown.ts"
Cohesion: 0.11
Nodes (34): wavHeader(), Bounce, bounceToFile(), encodeAudio(), encodeWav(), ExportOptions, ExportRange, gcd() (+26 more)

### Community 37 - "exportMeta.ts"
Cohesion: 0.14
Nodes (35): asciiUrl(), audioFileName(), AudioTags, chunk(), comment(), concat(), creditLine(), describedText() (+27 more)

### Community 38 - "directUpload.ts"
Cohesion: 0.09
Nodes (32): @vercel/blob, blobApi(), blobMultipart(), blobRequest(), BlobTarget, FinalUploadError, isFinalStatus(), isHidden() (+24 more)

### Community 39 - "CoProducer.tsx"
Cohesion: 0.12
Nodes (35): @anthropic-ai/sdk, CoProducer(), chooseModel(), chooseProvider(), forgetKey(), send(), defaultRouterModel(), KeySetup() (+27 more)

### Community 40 - "libraryTracks.ts"
Cohesion: 0.11
Nodes (35): decoder(), entries, fold(), held, hold(), kept, load(), loadParts() (+27 more)

### Community 41 - "WhatHappened.tsx"
Cohesion: 0.11
Nodes (32): ArtistProgressCard(), Icon(), IconName, ICONS, MEDAL_COLORS, Choice, ChoiceCards(), clock() (+24 more)

### Community 42 - "Remixt Brand Mark (split audio-waveform bars)"
Cohesion: 0.11
Nodes (33): File Icon (document glyph), Globe Icon, Next.js Wordmark Logo, Next.js Starter Template Assets, Remixt Brand Gradient (pink to violet to cyan), Remixt Brand Mark (split audio-waveform bars), Remixt Duotone Palette (pink top / cyan bottom bars), Apple Touch Icon (180px, gradient rounded-square, white bars) (+25 more)

### Community 43 - "quickHelp.ts"
Cohesion: 0.10
Nodes (20): Line, QuickHelp(), send(), SUGGESTIONS, FixId, Idea, useAiTrial, CoproducerContext (+12 more)

### Community 45 - "stemKinds.ts"
Cohesion: 0.12
Nodes (19): GET(), ChallengeStemCard(), formatDuration(), LibraryBrowser(), StemWithTrack, TabButton(), drawBars(), resolveColor() (+11 more)

### Community 46 - "remixLanes.ts"
Cohesion: 0.14
Nodes (25): Clock(), EmbedPlayer(), formatTime(), MixWaveform(), RemixDetailPlayer(), ContextMenuHost(), load(), hostPosition() (+17 more)

### Community 47 - "LaneInspector.tsx"
Cohesion: 0.11
Nodes (21): FxSlider(), hz(), LaneFxPanel(), pct(), askAbout(), EditTab(), formatOffset(), InspectorBody() (+13 more)

### Community 48 - "useStudioStore"
Cohesion: 0.16
Nodes (25): Playhead(), isMastered(), MasterPanel(), masterPresetOf(), same(), Slider(), formatBars(), formatTime() (+17 more)

### Community 49 - "exportJob.ts"
Cohesion: 0.15
Nodes (24): ExportSheet(), save(), formatBytes(), formatDuration(), formatLeft(), noSubscription(), phoneKind(), ExportJobState (+16 more)

### Community 50 - "package.json"
Cohesion: 0.07
Nodes (26): @ast-grep/cli, aws4fetch, bcryptjs, eslint, eslint-config-next, jose, knip, onnxruntime-web (+18 more)

### Community 51 - "app.py"
Cohesion: 0.12
Nodes (6): compute_peaks(), detect_bpm(), health(), load_and_encode(), separate(), SeparateRequest

### Community 52 - "stemResults.ts"
Cohesion: 0.11
Nodes (20): share(), packAnalysis(), unpackAnalysis(), ANALYSIS_ARRAYS, ANALYSIS_NUMBERS, encodeBeats(), isTimeList(), MAX_RESULT_BYTES (+12 more)

### Community 53 - "splitter.ts"
Cohesion: 0.14
Nodes (15): isConstrainedDevice(), decode(), Job, MODEL_URL, splitSong(), splitter, splitTrackPayload(), Turn (+7 more)

### Community 54 - "VocalRecorder.tsx"
Cohesion: 0.15
Nodes (21): formatTime(), LevelMeter(), VocalRecorder(), begin(), keep(), listen(), stopPreview(), ensureRunning() (+13 more)

### Community 55 - "beatNet.ts"
Cohesion: 0.13
Nodes (24): aggregate(), BEAT_NET, cosTable, deduplicate(), fft(), hzToMel(), LEVELS, logMelSpectrogram() (+16 more)

### Community 56 - "scenarios.ts"
Cohesion: 0.10
Nodes (15): djTrackInfo(), deckName(), fmt(), MISSIONS, MissionSetup, Objective, phaseHint(), ScenarioCategory (+7 more)

### Community 57 - "projects.ts"
Cohesion: 0.15
Nodes (21): DELETE(), GET(), PUT(), putSchema, POST(), schema, GET(), POST() (+13 more)

### Community 58 - "uploads.ts"
Cohesion: 0.15
Nodes (22): ProgressBar(), RigStatus(), formatMB(), SplitterStatus(), BackgroundActivity(), doneText(), UploadList(), UploadRow() (+14 more)

### Community 59 - "UploadManager.tsx"
Cohesion: 0.14
Nodes (20): QueueNotice(), nameList(), noSubscription(), skippedMessage(), SplitterInfo(), StatusBadge(), Stem, StemMiniRow() (+12 more)

### Community 60 - "aiKeys.ts"
Cohesion: 0.17
Nodes (22): check(), DELETE(), PATCH(), patchSchema, PUT(), putSchema, AI_MODELS, AI_PROVIDERS (+14 more)

### Community 61 - "audioGraph.ts"
Cohesion: 0.12
Nodes (20): clipEnvelope(), createLaneChain(), update(), update(), curveCache, driveCurve(), getImpulse(), hasOwnStretch() (+12 more)

### Community 62 - "collab.ts"
Cohesion: 0.20
Nodes (12): CollabMember, CollabSession, connectCollab(), idle, mergeShared(), normalise(), same(), SharedLane (+4 more)

### Community 63 - "localCache.ts"
Cohesion: 0.16
Nodes (19): budget(), BUDGETS, cacheGet(), cachePut(), cacheUsage, clearCache(), done(), kindMetas() (+11 more)

### Community 64 - "extras.tsx"
Cohesion: 0.21
Nodes (21): Engines(), FineTune(), keepWhatsPlaying(), MasterIt(), TuneButton(), TuneRow(), masterFor(), setBeatModelEnabled() (+13 more)

### Community 65 - "aiExplain.ts"
Cohesion: 0.15
Nodes (18): Aspect, Change, clock(), cutWords(), diffMix(), endOf(), entryOf(), fxChanges() (+10 more)

### Community 66 - "ai/chat/route.ts"
Cohesion: 0.19
Nodes (19): maxDuration, POST(), GET(), AiModel, DEFAULT_AI_MODEL, isAiModel(), isModelFor(), isOpenRouterModel() (+11 more)

### Community 67 - "NavBar.tsx"
Cohesion: 0.18
Nodes (14): MobileTabBar(), Tab(), AccountMenu(), MoreLinks(), NavBar(), ICONS, isActive(), MORE_LINKS (+6 more)

### Community 68 - "SplitLaneDialog.tsx"
Cohesion: 0.20
Nodes (18): SplitLaneDialog(), finish(), start(), cache, findParts(), placeStems(), siblingStems(), swapInParts() (+10 more)

### Community 69 - "splitter.worker.ts"
Cohesion: 0.15
Nodes (16): demucs-web, wasm-media-encoders, cachedDownload(), MODEL_CACHES, resumableDownload(), SIZE_HEADER, cancelled, init() (+8 more)

### Community 70 - "dependencies"
Cohesion: 0.10
Nodes (21): dependencies, @anthropic-ai/sdk, aws4fetch, bcryptjs, demucs-web, jose, lucide-react, next (+13 more)

### Community 71 - "stretch-memory.test.ts"
Cohesion: 0.11
Nodes (11): files, from, root, stretch, stretchFrom, stretchTo, to, fixStretchWorklet() (+3 more)

### Community 72 - "autoMatch.ts"
Cohesion: 0.16
Nodes (19): PRE_ROLL, TAIL, ALL_STEPS, analyzeBeatLane(), analyzeGuide(), analyzeLane(), beatsAttempted, buildPlan() (+11 more)

### Community 73 - "ref_fs"
Cohesion: 0.13
Nodes (11): postgres, buildId(), nextConfig(), tunnelHost, root, assets, root, target (+3 more)

### Community 74 - "react"
Cohesion: 0.17
Nodes (11): react, formatTime(), ago(), AtPlayhead(), formatAt(), RemixComments(), REASONS, ReportButton() (+3 more)

### Community 75 - "openrouter.ts"
Cohesion: 0.18
Nodes (16): GET(), Block, checkOpenRouterKey(), Completion, fromOpenAi(), headers(), OpenAiMessage, OpenRouterError (+8 more)

### Community 76 - "djMidi.ts"
Cohesion: 0.19
Nodes (14): MidiPanel(), controlKey(), learn(), loadMidiMap(), MIDI_ACTIONS, MidiAction, MidiLink, MidiMap (+6 more)

### Community 77 - "LaneMatchPanel.tsx"
Cohesion: 0.16
Nodes (18): Baseline, Choice(), LaneMatchPanel(), handleApply(), handleUndo(), snapshot(), untouchedSince(), DEFAULT_OPTIONS (+10 more)

### Community 78 - "arrange.ts"
Cohesion: 0.20
Nodes (18): findPhrases(), argmax(), Arrangement, beatStructure, downbeatScores(), gridCache, hearVocal(), margin() (+10 more)

### Community 80 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+11 more)

### Community 81 - "MixerConsole.tsx"
Cohesion: 0.19
Nodes (18): buffers, bypassed, ChannelStrip, dbText(), Fader(), faderGain(), faderPos(), Insert (+10 more)

### Community 82 - "StudioLibraryPanel.tsx"
Cohesion: 0.23
Nodes (17): add(), ListedStem, SongRow(), StemWithTrack, StudioLibraryPanel(), TAB_LABEL, takeOut(), withPeaks() (+9 more)

### Community 83 - "pairMatch.ts"
Cohesion: 0.16
Nodes (18): HeardVocal, LaneInput, layout(), sameSongLayout(), SectionPlacement, SuggestedLayout, suggestLayout(), BEAT_PRESETS (+10 more)

### Community 84 - "challenges.ts"
Cohesion: 0.20
Nodes (15): GET(), ChallengeDetail(), ChallengesPage(), metadata, timeLeft(), PlaceMedal(), Challenge, challengeEntries() (+7 more)

### Community 85 - "MatchStep.tsx"
Cohesion: 0.16
Nodes (15): MatchStep(), prepare(), Prepared, ReadySide, renderVariant(), settingsKey(), Side, SideInfo() (+7 more)

### Community 86 - "splitHelper"
Cohesion: 0.20
Nodes (7): ifNoOtherTabHelping(), LostJob, splitHelper, done(), stageName(), stageProgress(), tabSession()

### Community 87 - "soundtouchjs.d.ts"
Cohesion: 0.11
Nodes (5): FifoSampleBuffer, SimpleFilter, SoundTouch, soundtouchjs, WebAudioBufferSource

### Community 88 - "linkImport.ts"
Cohesion: 0.19
Nodes (14): metadata, UploadPage(), checkLink(), downloadSong(), explain(), EXTENSIONS, ImportedSong, ImportError (+6 more)

### Community 89 - "StorageSettings.tsx"
Cohesion: 0.15
Nodes (14): metadata, StoragePage(), formatBytes(), KIND_TEXT, MODEL_TEXT, ModelKey, ModelUsage, StorageSettings() (+6 more)

### Community 90 - "liveSync.ts"
Cohesion: 0.15
Nodes (13): Avatar(), LiveChat(), submit(), Message(), readGuestName(), FollowStatus, LiveConnection, LiveFeedState (+5 more)

### Community 91 - "EasyStudio.tsx"
Cohesion: 0.23
Nodes (13): AddButton(), EasyStudio(), Guide(), Step, KIND_ICON, handleExport(), allInStep(), IN_STEP (+5 more)

### Community 92 - "test.mjs"
Cohesion: 0.14
Nodes (9): databaseUrl, envLocal(), log, prepareDatabase(), root, server, serverEnv, storage (+1 more)

### Community 93 - "rtlText.ts"
Cohesion: 0.22
Nodes (11): CardText(), BidiRun, bidiRuns(), FORMS, hasRtl(), joinLetters(), joins(), joinsForward() (+3 more)

### Community 94 - "Live.tsx"
Cohesion: 0.23
Nodes (15): ACTIVITY_ICON, ActivityGlyph(), activityKey(), ActivityText(), ago(), AREA_LABEL, AREA_SHORT, AreaShort() (+7 more)

### Community 96 - "Remixt"
Cohesion: 0.14
Nodes (14): Architecture, Community, Configuration, Deploying it, Notes, Postgres (accounts, tracks, stems, remixes), Remixt, Running it (+6 more)

### Community 97 - "partyWorld.ts"
Cohesion: 0.17
Nodes (11): three, Avatar, bubble(), CameraMode, canvasSprite(), emojiTexture(), emojiTextures, Floater (+3 more)

### Community 98 - "devDependencies"
Cohesion: 0.13
Nodes (15): devDependencies, @ast-grep/cli, eslint, eslint-config-next, knip, tailwindcss, @tailwindcss/postcss, @types/bcryptjs (+7 more)

### Community 99 - "lib/presence.ts"
Cohesion: 0.25
Nodes (13): GET(), POST(), Activity, ActivityType, Area, areaFor(), AREAS, ensurePresenceSchema() (+5 more)

### Community 100 - "neuralBeats.ts"
Cohesion: 0.24
Nodes (14): beatModelEnabled(), BeatModelState, beatModelSupported(), diskKey(), keep(), keptBeats(), legacyResult(), neuralBeats() (+6 more)

### Community 101 - "stemFetch.ts"
Cohesion: 0.19
Nodes (8): fetchSongFromLink(), fetchInSlices(), fetchRange(), fetchWhole(), download(), FILE, Handler, server

### Community 102 - "Remixt Social Share Image (1920x1080)"
Cohesion: 0.23
Nodes (12): App Navigation: Library / Studio / Remixes / Upload, BPM & Pitch Match feature (Sync BPM), remixt-free.vercel.app (Vercel deployment), Multitrack Stem Lanes (VOCALS/BEAT waveforms with Vol & Pitch sliders), Publish Remix Under Your Name, Remixt Brand (gradient R logo, pink-purple-cyan palette), Remixt Social Share Image (1920x1080), Studio Page Mockup (remixt-free.vercel.app/studio) (+4 more)

### Community 103 - "LineCard.tsx"
Cohesion: 0.25
Nodes (12): formatTime(), PreviewBar(), BigSwitch(), LineCard(), separate(), presetOf(), SOUND_FIELDS, SOUND_NAMES (+4 more)

### Community 104 - "AutomationLane.tsx"
Cohesion: 0.22
Nodes (11): AutomationLane(), at(), commit(), handleDown(), handleMove(), remove(), formatValue(), PARAMS (+3 more)

### Community 105 - "StudioShortcuts.tsx"
Cohesion: 0.22
Nodes (13): PAD_KEYS, GROUPS, handleKey(), isTyping(), Mode, scrollToLane(), Shortcut, stepSelection() (+5 more)

### Community 106 - "liveStudio.ts"
Cohesion: 0.21
Nodes (13): applyLiveMix(), isMix(), LiveMix, mixFields(), mixOf(), startStudioBroadcast(), scheduleMix(), scheduleState() (+5 more)

### Community 107 - "pitchTempo.ts"
Cohesion: 0.26
Nodes (10): signalsmith-stretch, soundtouchjs, feedAsRendered(), hasSound(), renderHq(), renderInWorker(), renderOnPage(), renderPitchTempo() (+2 more)

### Community 108 - "signup/route.ts"
Cohesion: 0.23
Nodes (8): POST(), schema, POST(), schema, createSessionCookie(), hashPassword(), verifyPassword(), REF_COOKIE

### Community 109 - "app/layout.tsx"
Cohesion: 0.19
Nodes (9): geistMono, geistSans, metadata, viewport, isStaleChunk(), readLater(), UpdatePrompt(), SITE_DESCRIPTION (+1 more)

### Community 110 - "mediaSession.ts"
Cohesion: 0.23
Nodes (11): NOW_PLAYING_ARTWORK, apply(), artworkFor(), lastPosition, mediaSession(), NowPlaying, Owner, owners (+3 more)

### Community 111 - "trackBeats"
Cohesion: 0.21
Nodes (10): onsetAt(), trackBeats(), arrangeVocal(), BeatGrid, localPeriod(), neuralGrid(), placementNotes(), placeVocal() (+2 more)

### Community 113 - "demucs-web.d.ts"
Cohesion: 0.17
Nodes (7): Channels, demucs-web, demucs-web/constants, demucs-web/processor, DemucsProcessor, Progress, Spec

### Community 114 - "MatchFinder.tsx"
Cohesion: 0.31
Nodes (9): cache, Kind, libraryStems(), MatchFinder(), add(), Candidate, describeFit(), rankByTempo() (+1 more)

### Community 115 - "liveStudioDiff.ts"
Cohesion: 0.27
Nodes (6): describeMixChanges(), DiffLane, DiffMix, FX_WORDS, laneLabel(), same()

### Community 116 - "studioView.ts"
Cohesion: 0.18
Nodes (10): AiTab, InspectorTab, LibraryTab, MAX_ZOOM, MIN_ZOOM, ProView, recall(), remember() (+2 more)

### Community 117 - "scripts"
Cohesion: 0.20
Nodes (10): scripts, build, dev, knip, lint, prebuild, predev, sg (+2 more)

### Community 118 - "live.test.ts"
Cohesion: 0.29
Nodes (8): chat(), Client, feed(), json(), ok(), remixOf(), signUp(), sql

### Community 119 - "Free on Vercel, with Neon and Vercel Blob"
Cohesion: 0.22
Nodes (9): 1. Put the code on GitHub, 2. Create the Vercel project, 3. Add the database (Neon), 4. Add stem storage (Vercel Blob), 5. Redeploy and finish, 6. Try it, Free on Vercel, with Neon and Vercel Blob, Optional (+1 more)

### Community 120 - "client/presence.ts"
Cohesion: 0.33
Nodes (7): RootLayout(), PresenceHeartbeat(), listeners, randomId(), sendHeartbeat(), subscribe(), visitorId()

### Community 121 - "RemixCover.tsx"
Cohesion: 0.36
Nodes (6): RemixCover(), pick(), decode(), Decoded, squareCover(), uploadCover()

### Community 122 - "Sharing Remixt with someone else"
Cohesion: 0.25
Nodes (7): `./share.sh cloudflared` — your Cloudflare tunnel, `./share.sh ngrok` — ngrok, `./share.sh` — serveo (default), Sharing Remixt with someone else, The three providers, Things worth knowing before you send the link, Why not Cloudflare's quick tunnel

### Community 123 - "mixSignature"
Cohesion: 0.43
Nodes (8): analyse(), mixSignature(), prepareSession(), rebaseSession(), timingSignature(), session(), session(), session()

### Community 124 - "Free, all in one place: Oracle Cloud"
Cohesion: 0.29
Nodes (7): 1. Create the account, 2. Create the server, 3. Open ports 80 and 443, 4. Get a free domain name, 5. Install Docker and start Remixt, 6. Keep it running, Free, all in one place: Oracle Cloud

### Community 125 - "run.sh"
Cohesion: 0.29
Nodes (3): PATH, run.sh script, share.sh script

### Community 126 - "Image"
Cohesion: 0.33
Nodes (6): alt, contentType, Image(), size, Image(), cardFonts()

### Community 127 - "InstallPrompt.tsx"
Cohesion: 0.48
Nodes (6): InstallEvent, InstallPrompt(), dismiss(), install(), read(), write()

### Community 128 - "GoLiveStudioButton"
Cohesion: 0.38
Nodes (6): api(), GoLiveStudioButton(), endExistingAndStart(), start(), end(), goLive()

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

### Community 133 - "ref_node_fs"
Cohesion: 0.40
Nodes (3): resolve(), src, withExtension()

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

## Ambiguous Edges - Review These
- `Remixt Brand Gradient (pink to violet to cyan)` → `Remixt Mark - Black Monochrome`  [AMBIGUOUS]
  web/public/remixt-logo/remixt-mark-black.svg · relation: references
- `Remixt Brand Gradient (pink to violet to cyan)` → `Remixt Mark - White Monochrome`  [AMBIGUOUS]
  web/public/remixt-logo/remixt-mark-white.svg · relation: references

## Knowledge Gaps
- **39 isolated node(s):** `Python separation service dependencies (FastAPI, demucs 4.0.1, librosa)`, `Google Search Console site verification file`, `Vazirmatn font (SIL Open Font License 1.1)`, `PATH`, `CONSTANTS` (+34 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1089 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **19 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `sql` to `app/page.tsx`, `MissionSession.tsx`, `getCurrentUser`, `djTypes.ts`, `models.ts`, `live.ts`, `SocialClipButton.tsx`, `lucide-react`, `AdminPanel.tsx`, `SongPicker.tsx`, `Studio.tsx`, `api/remixes/route.ts`, `camelotCode`, `client/splitQueue.ts`, `stemKinds.ts`, `remixLanes.ts`, `useStudioStore`, `package.json`, `VocalRecorder.tsx`, `projects.ts`, `uploads.ts`, `UploadManager.tsx`, `aiKeys.ts`, `ai/chat/route.ts`, `NavBar.tsx`, `ref_fs`, `react`, `openrouter.ts`, `challenges.ts`, `linkImport.ts`, `liveSync.ts`, `Live.tsx`, `lib/presence.ts`, `signup/route.ts`, `app/layout.tsx`, `client/presence.ts`, `RemixCover.tsx`?**
  _High betweenness centrality (0.128) - this node is a cross-community bridge._
- **What connects `Python separation service dependencies (FastAPI, demucs 4.0.1, librosa)`, `Google Search Console site verification file`, `Vazirmatn font (SIL Open Font License 1.1)` to the rest of the system?**
  _39 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `DjEngine` be split into smaller, more focused modules?**
  _Cohesion score 0.05910852713178295 - nodes in this community are weakly interconnected._
- **Why does `react` connect `react` to `app/page.tsx`, `MissionSession.tsx`, `getCurrentUser`, `djTypes.ts`, `dj-realism.test.ts`, `models.ts`, `live.ts`, `SocialClipButton.tsx`, `lucide-react`, `AdminPanel.tsx`, `SongPicker.tsx`, `Studio.tsx`, `audioEngine`, `Arrangement.tsx`, `studio-session.test.ts`, `mixScore.ts`, `DjConsole.tsx`, `api/remixes/route.ts`, `camelotCode`, `demoSongs.ts`, `client/splitQueue.ts`, `musicKey.ts`, `AiProducer.tsx`, `CoProducer.tsx`, `libraryTracks.ts`, `WhatHappened.tsx`, `quickHelp.ts`, `stemKinds.ts`, `remixLanes.ts`, `LaneInspector.tsx`, `useStudioStore`, `exportJob.ts`, `package.json`, `splitter.ts`, `VocalRecorder.tsx`, `uploads.ts`, `UploadManager.tsx`, `extras.tsx`, `NavBar.tsx`, `SplitLaneDialog.tsx`, `djMidi.ts`, `LaneMatchPanel.tsx`, `MixerConsole.tsx`, `StudioLibraryPanel.tsx`, `MatchStep.tsx`, `StorageSettings.tsx`, `liveSync.ts`, `EasyStudio.tsx`, `Live.tsx`, `LineCard.tsx`, `AutomationLane.tsx`, `StudioShortcuts.tsx`, `app/layout.tsx`, `MatchFinder.tsx`, `client/presence.ts`, `RemixCover.tsx`, `InstallPrompt.tsx`?**
  _High betweenness centrality (0.126) - this node is a cross-community bridge._
- **Should `app/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.03826279527559055 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Remixt Brand Gradient (pink to violet to cyan)` and `Remixt Mark - Black Monochrome`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `Remixt Brand Gradient (pink to violet to cyan)` and `Remixt Mark - White Monochrome`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._