# Graph Report - code  (2026-10-11)

## Corpus Check
- 450 files · ~514,048 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 12 file(s) not represented in the graph (top: (none) 7, .ttf 2, .ico 2)

## Summary
- 4432 nodes · 13904 edges · 151 communities (131 shown, 20 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 190 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `05a3af4e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- DjEngine
- models.ts
- Draft
- curriculum.ts
- getCurrentUser
- djLibrary.ts
- sql
- dj-realism.test.ts
- storage.ts
- live.ts
- djMath.ts
- studioStore.ts
- SocialClipButton.tsx
- react
- AdminPanel.tsx
- SongPicker.tsx
- Studio.tsx
- clipCommands.ts
- audioEngine
- Arrangement.tsx
- clipsOf
- aiTrial.ts
- harmony.ts
- demoSongsDsp.ts
- Lakebase Postgres
- analysis.ts
- djEngine.ts
- AiProducer
- notifications.ts
- examplesLibrary.ts
- audioEngine.ts
- demoSongs.ts
- SplitQueue.tsx
- Neon
- MatchStep.tsx
- AiProducer.tsx
- mixdown.ts
- exportMeta.ts
- directUpload.ts
- CoProducer.tsx
- libraryTracks.ts
- WhatHappened.tsx
- Remixt Brand Mark (split audio-waveform bars)
- coproducerTools.ts
- PartyWorld
- stemKinds.ts
- liveSync.ts
- musicKey.ts
- useStudioStore
- exportJob.ts
- package.json
- app.py
- shared-results.test.ts
- splitter.ts
- VocalRecorder.tsx
- listening.test.ts
- MissionSession.tsx
- projects.ts
- djLibraryTracks.ts
- UploadManager.tsx
- aiKeys.ts
- audioGraph.ts
- collab.ts
- localCache.ts
- extras.tsx
- aiExplain.ts
- ai/chat/route.ts
- app/layout.tsx
- schema.sql
- splitter.worker.ts
- dependencies
- stretch-memory.test.ts
- autoMatch.ts
- ref_path
- RemixComments.tsx
- openrouter.ts
- djMidi.ts
- LaneMatchPanel.tsx
- pairMatch.ts
- FakeContext
- compilerOptions
- startNewStep
- aiIdeas.ts
- social.ts
- challenges.ts
- zod
- client/splitQueue.ts
- soundtouchjs.d.ts
- linkImport.ts
- EasyDecks.tsx
- LiveChat.tsx
- keyLabel
- test.mjs
- rtlText.ts
- trackUpload.ts
- uploads
- Remixt
- partyWorld.ts
- devDependencies
- app/page.tsx
- neuralBeats.ts
- stemFetch.ts
- Remixt Social Share Image (1920x1080)
- split-queue.test.ts
- mixScore.ts
- liveReplay.ts
- liveStudio.ts
- pitchTempo.ts
- auth.ts
- HostConsole
- mediaSession.ts
- stem-results.test.ts
- previewPlayer
- demucs-web.d.ts
- melody.ts
- liveStudioDiff.ts
- create
- scripts
- live.test.ts
- Free on Vercel, with Neon and Vercel Blob
- eslint.config.mjs
- RemixCover.tsx
- Sharing Remixt with someone else
- playwright-core
- Free, all in one place: Oracle Cloud
- run.sh
- allowScripts
- version/route.ts
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
- web/CLAUDE.md
- Google Search Console site verification file
- CONSTANTS

## God Nodes (most connected - your core abstractions)
1. `sql` - 140 edges
2. `next` - 139 edges
3. `useStudioStore` - 135 edges
4. `getCurrentUser()` - 132 edges
5. `DjEngine` - 130 edges
6. `react` - 121 edges
7. `AiProducer()` - 104 edges
8. `lucide-react` - 96 edges
9. `DeckId` - 83 edges
10. `audioEngine` - 79 edges

## Surprising Connections (you probably didn't know these)
- `Studio Page Mockup in Demo Poster` --semantically_similar_to--> `Studio Page Mockup (remixt-free.vercel.app/studio)`  [INFERRED] [semantically similar]
  web/public/remixt-demo-poster.jpg → remixt-share-1920x1080.png
- `Tune the Index` --references--> `quality()`  [INFERRED]
  web/.agents/skills/neon-postgres/references/vector-search.md → web/src/lib/client/harmony.ts
- `Remixt Demo Video Poster (1280x720)` --semantically_similar_to--> `Remixt Social Share Image (1920x1080)`  [INFERRED] [semantically similar]
  web/public/remixt-demo-poster.jpg → remixt-share-1920x1080.png
- `Path` --references--> `create()`  [INFERRED]
  web/.agents/skills/neon/references/claimable-neon.md → web/src/components/AdminPanel.tsx
- `Function Triggers (CLI, MCP, REST)` --references--> `create()`  [INFERRED]
  web/.agents/skills/neon/references/function-triggers.md → web/src/components/AdminPanel.tsx

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

## Communities (151 total, 20 thin omitted)

### Community 0 - "DjEngine"
Cohesion: 0.05
Nodes (12): dbToGain(), emptyHotCues(), quantizePos(), DeckUnit, DjEngine, clamp(), applyMidi(), LoadedTrack (+4 more)

### Community 1 - "models.ts"
Cohesion: 0.05
Nodes (56): DELETE(), POST(), setLiked(), POST(), ArtistPage(), ArtistRow, generateMetadata(), EmbedPage() (+48 more)

### Community 2 - "Draft"
Cohesion: 0.14
Nodes (34): applyLevels(), applyMix(), arrangementIdeas(), balancedLevels(), beatBarTime(), buildUpTo(), Draft, dynamicsIdeas() (+26 more)

### Community 3 - "curriculum.ts"
Cohesion: 0.04
Nodes (69): DjHome(), ItemButton(), Briefing(), CamelotWheel(), CATEGORY_LABEL, categoryLabel(), CrowdBar(), Debrief() (+61 more)

### Community 4 - "getCurrentUser"
Cohesion: 0.08
Nodes (55): GET(), DELETE(), POST(), sessionOf(), POST(), bodySchema, POST(), bodySchema (+47 more)

### Community 5 - "djLibrary.ts"
Cohesion: 0.08
Nodes (44): FIT_LABEL, OtherDeck, SORTS, TrackLibrary(), browse(), BrowserEntry, BrowserQuery, camelotRank() (+36 more)

### Community 6 - "sql"
Cohesion: 0.06
Nodes (60): next, DELETE(), findJunk(), GET(), maxDuration, POST(), GET(), DELETE() (+52 more)

### Community 7 - "dj-realism.test.ts"
Cohesion: 0.05
Nodes (46): BarCounter(), DeckPanel(), Pad(), PAD_JUMPS, PAD_MODE_LABEL, ROLLS, sign(), STEM_BUTTONS (+38 more)

### Community 8 - "storage.ts"
Cohesion: 0.07
Nodes (47): GET(), kept(), redirect(), DELETE(), GET(), keyFor(), DELETE(), GET() (+39 more)

### Community 9 - "live.ts"
Cohesion: 0.09
Nodes (39): POST(), PUT(), POST(), schema, POST(), GET(), GET(), PUT() (+31 more)

### Community 10 - "djMath.ts"
Cohesion: 0.08
Nodes (63): EasyDeck(), MissionSession(), CrowdRequest, crowdScore(), CrowdState, ECHO_KEYS, fxTotal(), KINDS (+55 more)

### Community 11 - "studioStore.ts"
Cohesion: 0.05
Nodes (53): FxSlider(), hz(), LaneFxPanel(), pct(), AutomationLane(), at(), commit(), handleDown() (+45 more)

### Community 12 - "SocialClipButton.tsx"
Cohesion: 0.05
Nodes (51): GET(), SIZES, AppleIcon(), contentType, size, Error(), contentType, Icon() (+43 more)

### Community 13 - "react"
Cohesion: 0.11
Nodes (35): lucide-react, react, dynamic, LiveSessionPage(), FollowButton(), NOTE_PRESETS, RemixChoice, Heat() (+27 more)

### Community 14 - "AdminPanel.tsx"
Cohesion: 0.12
Nodes (36): AdminPage(), metadata, AdminChallenge, AdminPanel(), AdminRemix, AdminReport, AdminResult, AdminTrack (+28 more)

### Community 15 - "SongPicker.tsx"
Cohesion: 0.06
Nodes (49): ExamplesPage(), metadata, DEFAULT_PAIR, ExamplesLab(), STEPS, libraryLabSong(), Flags, INFO (+41 more)

### Community 16 - "Studio.tsx"
Cohesion: 0.05
Nodes (79): react-dom, zustand, RemixDetailPlayer(), ContextMenuHost(), isSheet(), MenuItem, MenuState, useContextMenu (+71 more)

### Community 17 - "clipCommands.ts"
Cohesion: 0.08
Nodes (95): cutSilences(), gatePattern(), MAX_AUTOMATION_POINTS, pumpPattern(), spliceAutomation(), clearAutomation(), clearSelection(), clipFade() (+87 more)

### Community 18 - "audioEngine"
Cohesion: 0.10
Nodes (11): audioEngine, queueReschedule(), reportMixNowPlaying(), sliceBuffer(), stopSources(), disableNowPlayingAnchor(), stopNowPlayingAnchor(), fetchStem() (+3 more)

### Community 19 - "Arrangement.tsx"
Cohesion: 0.11
Nodes (45): AiSection(), Arrangement(), onContentPointerDown(), onContentPointerMove(), onContentPointerUp(), snapDelta(), timeAt(), ClipFades() (+37 more)

### Community 20 - "clipsOf"
Cohesion: 0.09
Nodes (44): Logs: CLI, Loki, and SDK pagination, Loki-compatible read API, Playhead(), LaneCard(), AiScopeBar(), Drag, Pick, PICK_ICONS (+36 more)

### Community 21 - "aiTrial.ts"
Cohesion: 0.08
Nodes (51): analyse(), putBackOn(), fixGroups(), HandEdit, mixFix(), mixSignature(), prepareSession(), rebaseSession() (+43 more)

### Community 22 - "harmony.ts"
Cohesion: 0.15
Nodes (19): chooseShift(), accentCache, accents(), adviseShift(), chordRows(), Harmony, HarmonyAdvice, HarmonyScan (+11 more)

### Community 23 - "demoSongsDsp.ts"
Cohesion: 0.08
Nodes (48): songBars(), activeRms(), addClap(), addCrash(), addHat(), addKick(), addReverb(), addRim() (+40 more)

### Community 24 - "Lakebase Postgres"
Cohesion: 0.05
Nodes (41): Full-Text Search with BM25 Ranking, Prepare and Index Text, Query and Interpret Scores, Set Parameters at Build Time or Per Query, Set the Candidate Limit, Use Prefilter Selectively, Adapt the Hybrid Search, Hybrid Search (+33 more)

### Community 25 - "analysis.ts"
Cohesion: 0.11
Nodes (34): activeLoudness(), ANALYSIS_RATE, analyzeAndKeep(), analyzeMono(), autocorrelation(), cache, chromagram(), correlation() (+26 more)

### Community 26 - "djEngine.ts"
Cohesion: 0.06
Nodes (64): BAND_COLOR, bandsAt(), DeckOverview(), DeckWave(), DRAW_ORDER, killedSlot(), STEM_COLOR, WaveMode (+56 more)

### Community 27 - "AiProducer"
Cohesion: 0.14
Nodes (45): AiProducer(), applyOptions(), changeScope(), chooseSync(), chooseTiming(), chooseWhole(), close(), findBest() (+37 more)

### Community 28 - "notifications.ts"
Cohesion: 0.22
Nodes (13): GET(), POST(), describe(), hrefFor(), metadata, NotificationsPage(), timeAgo(), MarkNotificationsRead() (+5 more)

### Community 29 - "examplesLibrary.ts"
Cohesion: 0.12
Nodes (30): EXCERPT_BARS, LabSong, LibraryState, LoadedTrack, useSongSummaries(), Found, SongSelect(), LibraryRecipes() (+22 more)

### Community 30 - "audioEngine.ts"
Cohesion: 0.07
Nodes (31): bytesOf(), clipKey(), DecodedStem, lastUsed, LoadedLane, PHONE, PlaybackBlockedError, QueuedRender (+23 more)

### Community 31 - "demoSongs.ts"
Cohesion: 0.08
Nodes (33): State, useDemoSong(), CHORD_INTERVALS, ChordDef, ChordQuality, CHORUS_CYCLE, DEMO_SONG_DEFS, DEMO_SONGS (+25 more)

### Community 32 - "SplitQueue.tsx"
Cohesion: 0.11
Nodes (35): ago(), duration(), HelperPanel(), jobDetail(), LastBlock(), noSubscription(), ProgressBar(), QueuedSongRow() (+27 more)

### Community 33 - "Neon"
Cohesion: 0.05
Nodes (41): Data API external JWKS, Functions: verify the JWT, then authorize the user, Incompatibilities, Managed Better Auth, Trusted domains, 1. Install the Neon CLI, 2. Install the Neon MCP Server, 3. Install Neon Agent Skills (+33 more)

### Community 34 - "MatchStep.tsx"
Cohesion: 0.07
Nodes (45): AnalysisCard(), LEVEL_STYLE, pct(), Row(), Verdict(), BarGrid(), demoLabSong(), MatchStep() (+37 more)

### Community 35 - "AiProducer.tsx"
Cohesion: 0.06
Nodes (34): afterPaint(), DROP_GROUPS, ENTRIES, GROUPED, heard, IN_TAB, isLayer(), isShape() (+26 more)

### Community 36 - "mixdown.ts"
Cohesion: 0.10
Nodes (32): Bounce, bounceToFile(), downloadBlob(), encodeAudio(), ExportOptions, ExportRange, gcd(), inPieces() (+24 more)

### Community 37 - "exportMeta.ts"
Cohesion: 0.13
Nodes (37): asciiUrl(), audioFileName(), AudioTags, chunk(), comment(), concat(), creditLine(), describedText() (+29 more)

### Community 38 - "directUpload.ts"
Cohesion: 0.10
Nodes (34): blobApi(), blobMultipart(), blobRequest(), BlobTarget, FinalUploadError, isFinalStatus(), isHidden(), libraryPut() (+26 more)

### Community 39 - "CoProducer.tsx"
Cohesion: 0.12
Nodes (35): @anthropic-ai/sdk, CoProducer(), chooseModel(), chooseProvider(), forgetKey(), send(), defaultRouterModel(), KeySetup() (+27 more)

### Community 40 - "libraryTracks.ts"
Cohesion: 0.09
Nodes (39): decoder(), entries, fold(), held, hold(), kept, load(), loadParts() (+31 more)

### Community 41 - "WhatHappened.tsx"
Cohesion: 0.12
Nodes (29): Icon(), IconName, ICONS, MEDAL_COLORS, Choice, ChoiceCards(), clock(), IdeaSwitch (+21 more)

### Community 42 - "Remixt Brand Mark (split audio-waveform bars)"
Cohesion: 0.11
Nodes (33): File Icon (document glyph), Globe Icon, Next.js Wordmark Logo, Next.js Starter Template Assets, Remixt Brand Gradient (pink to violet to cyan), Remixt Brand Mark (split audio-waveform bars), Remixt Duotone Palette (pink top / cyan bottom bars), Apple Touch Icon (180px, gradient rounded-square, white bars) (+25 more)

### Community 43 - "coproducerTools.ts"
Cohesion: 0.08
Nodes (34): Line, QuickHelp(), send(), SUGGESTIONS, availableFixes(), findDrop(), FixId, harmonyOf() (+26 more)

### Community 45 - "stemKinds.ts"
Cohesion: 0.08
Nodes (38): GET(), ChallengeStemCard(), formatDuration(), LibraryBrowser(), StemWithTrack, TabButton(), formatTime(), PreviewBar() (+30 more)

### Community 46 - "liveSync.ts"
Cohesion: 0.14
Nodes (19): Clock(), EmbedPlayer(), formatTime(), formatTime(), MixWaveform(), FollowStatus, hostPosition(), LiveFeedState (+11 more)

### Community 47 - "musicKey.ts"
Cohesion: 0.44
Nodes (8): bestKeyShift(), keyId(), KeyMatch, KeyMode, mod12(), relativeMajor(), semitonesToMatch(), shortestShift()

### Community 48 - "useStudioStore"
Cohesion: 0.09
Nodes (43): AddButton(), EasyStudio(), Guide(), Step, isMastered(), MasterPanel(), masterPresetOf(), same() (+35 more)

### Community 49 - "exportJob.ts"
Cohesion: 0.15
Nodes (24): ExportSheet(), save(), formatBytes(), formatDuration(), formatLeft(), noSubscription(), phoneKind(), ExportJobState (+16 more)

### Community 50 - "package.json"
Cohesion: 0.09
Nodes (22): @ast-grep/cli, aws4fetch, bcryptjs, jose, knip, onnxruntime-web, qrcode, tailwindcss (+14 more)

### Community 51 - "app.py"
Cohesion: 0.12
Nodes (6): compute_peaks(), detect_bpm(), health(), load_and_encode(), separate(), SeparateRequest

### Community 52 - "shared-results.test.ts"
Cohesion: 0.14
Nodes (9): Gotchas, Pooled vs direct connections: use the direct URL for migrations, dumps, and replication, share(), put(), sql, url(), resolve(), src (+1 more)

### Community 53 - "splitter.ts"
Cohesion: 0.09
Nodes (34): SplitLaneDialog(), finish(), start(), cache, findParts(), placeStems(), siblingStems(), swapInParts() (+26 more)

### Community 54 - "VocalRecorder.tsx"
Cohesion: 0.15
Nodes (21): formatTime(), LevelMeter(), VocalRecorder(), begin(), keep(), listen(), stopPreview(), ensureRunning() (+13 more)

### Community 55 - "listening.test.ts"
Cohesion: 0.15
Nodes (22): aggregate(), BEAT_NET, cosTable, deduplicate(), fft(), hzToMel(), LEVELS, logMelSpectrogram() (+14 more)

### Community 56 - "MissionSession.tsx"
Cohesion: 0.06
Nodes (44): DjPage(), metadata, BeatMatchMeter(), FIT_TEXT, Gauge(), CopilotPanel(), ICON, DjApp() (+36 more)

### Community 57 - "projects.ts"
Cohesion: 0.15
Nodes (21): DELETE(), GET(), PUT(), putSchema, POST(), schema, GET(), POST() (+13 more)

### Community 58 - "djLibraryTracks.ts"
Cohesion: 0.09
Nodes (38): demoSongMeta, peaksOf(), releaseDemoSong(), AiDj, Phase, downbeatOffset(), gridPhase(), libraryTrackId() (+30 more)

### Community 59 - "UploadManager.tsx"
Cohesion: 0.06
Nodes (37): RemixOwnerControls(), QueueNotice(), TagInput(), add(), nameList(), noSubscription(), skippedMessage(), SplitterInfo() (+29 more)

### Community 60 - "aiKeys.ts"
Cohesion: 0.17
Nodes (22): check(), DELETE(), PATCH(), patchSchema, PUT(), putSchema, AI_MODELS, AI_PROVIDERS (+14 more)

### Community 61 - "audioGraph.ts"
Cohesion: 0.16
Nodes (22): clipEnvelope(), createLaneChain(), update(), createMasterChain(), update(), curveCache, driveCurve(), getImpulse() (+14 more)

### Community 62 - "collab.ts"
Cohesion: 0.14
Nodes (16): CollabBar(), SYNC_LABEL, CollabMember, CollabSession, connectCollab(), idle, mergeShared(), normalise() (+8 more)

### Community 63 - "localCache.ts"
Cohesion: 0.11
Nodes (28): metadata, StoragePage(), formatBytes(), KIND_TEXT, MODEL_TEXT, ModelKey, ModelUsage, StorageSettings() (+20 more)

### Community 64 - "extras.tsx"
Cohesion: 0.21
Nodes (21): Engines(), FineTune(), keepWhatsPlaying(), MasterIt(), TuneButton(), TuneRow(), masterFor(), setBeatModelEnabled() (+13 more)

### Community 65 - "aiExplain.ts"
Cohesion: 0.21
Nodes (15): Change, clock(), cutWords(), diffMix(), endOf(), entryOf(), fxChanges(), laneChanges() (+7 more)

### Community 66 - "ai/chat/route.ts"
Cohesion: 0.19
Nodes (19): maxDuration, POST(), GET(), AiModel, DEFAULT_AI_MODEL, isAiModel(), isModelFor(), isOpenRouterModel() (+11 more)

### Community 67 - "app/layout.tsx"
Cohesion: 0.06
Nodes (52): geistMono, geistSans, metadata, RootLayout(), viewport, InstallEvent, InstallPrompt(), dismiss() (+44 more)

### Community 68 - "schema.sql"
Cohesion: 0.11
Nodes (42): ai_shared_usage, challenges, follows, idx_comments_remix, idx_follows_followee, idx_lanes_remix, idx_live_events_stream, idx_live_streams_host (+34 more)

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
Cohesion: 0.15
Nodes (23): pickPair(), analyzeStem(), PRE_ROLL, TAIL, ALL_STEPS, analyzeBeatLane(), analyzeGuide(), analyzeLane() (+15 more)

### Community 73 - "ref_path"
Cohesion: 0.12
Nodes (11): postgres, buildId(), nextConfig(), tunnelHost, root, assets, root, target (+3 more)

### Community 74 - "RemixComments.tsx"
Cohesion: 0.23
Nodes (8): ago(), AtPlayhead(), formatAt(), RemixComments(), REASONS, ReportButton(), useOnScreen(), RemixComment

### Community 75 - "openrouter.ts"
Cohesion: 0.18
Nodes (16): GET(), Block, checkOpenRouterKey(), Completion, fromOpenAi(), headers(), OpenAiMessage, OpenRouterError (+8 more)

### Community 76 - "djMidi.ts"
Cohesion: 0.22
Nodes (12): MidiPanel(), controlKey(), learn(), loadMidiMap(), MIDI_ACTIONS, MidiAction, MidiLink, MidiMap (+4 more)

### Community 77 - "LaneMatchPanel.tsx"
Cohesion: 0.15
Nodes (24): Baseline, Choice(), LaneMatchPanel(), handleApply(), handleUndo(), snapshot(), untouchedSince(), adoptTiming() (+16 more)

### Community 78 - "pairMatch.ts"
Cohesion: 0.08
Nodes (48): Phrase, trackBeats(), argmax(), Arrangement, arrangeVocal(), BeatGrid, beatStructure, downbeatScores() (+40 more)

### Community 80 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+11 more)

### Community 81 - "startNewStep"
Cohesion: 0.08
Nodes (46): SelectionBar(), BigSwitch(), LineCard(), remove(), separate(), presetOf(), SOUND_FIELDS, SOUND_NAMES (+38 more)

### Community 82 - "aiIdeas.ts"
Cohesion: 0.05
Nodes (42): activeShare(), ALL_FIXES, Check, CheckStatus, DECAY_BEATS, describeFx(), Drop, fittedRecipe() (+34 more)

### Community 83 - "social.ts"
Cohesion: 0.12
Nodes (33): DELETE(), GET(), POST(), postSchema, visible(), DELETE(), handle(), POST() (+25 more)

### Community 84 - "challenges.ts"
Cohesion: 0.17
Nodes (19): GET(), POST(), schema, GET(), ChallengeDetail(), ChallengesPage(), metadata, timeLeft() (+11 more)

### Community 85 - "zod"
Cohesion: 0.12
Nodes (27): zod, DELETE(), PATCH(), patchSchema, createSchema, GET(), POST(), dynamic (+19 more)

### Community 86 - "client/splitQueue.ts"
Cohesion: 0.12
Nodes (19): audioDuration(), cancelQueued(), ClaimedJob, HelperState, ifNoOtherTabHelping(), json(), LostJob, MiningSession (+11 more)

### Community 87 - "soundtouchjs.d.ts"
Cohesion: 0.11
Nodes (5): FifoSampleBuffer, SimpleFilter, SoundTouch, soundtouchjs, WebAudioBufferSource

### Community 88 - "linkImport.ts"
Cohesion: 0.15
Nodes (19): bodySchema, maxDuration, POST(), metadata, UploadPage(), checkLink(), downloadSong(), explain() (+11 more)

### Community 89 - "EasyDecks.tsx"
Cohesion: 0.11
Nodes (23): ACCENT, AutoMixPanel(), EasyDecks(), EasyMixer(), FIT, MixView, OnAir(), Pill() (+15 more)

### Community 90 - "LiveChat.tsx"
Cohesion: 0.14
Nodes (14): GoLiveForm(), localInputValue(), RemixChoice, Avatar(), LiveChat(), Message(), readGuestName(), LiveConnection (+6 more)

### Community 91 - "keyLabel"
Cohesion: 0.17
Nodes (25): FIT_WORDS, STATUS_COLOR, FIT, KeyHelper(), checkMix(), fixBeatKey(), fixKey(), harmonyLine() (+17 more)

### Community 92 - "test.mjs"
Cohesion: 0.14
Nodes (9): databaseUrl, envLocal(), log, prepareDatabase(), root, server, serverEnv, storage (+1 more)

### Community 93 - "rtlText.ts"
Cohesion: 0.22
Nodes (11): CardText(), BidiRun, bidiRuns(), FORMS, hasRtl(), joinLetters(), joins(), joinsForward() (+3 more)

### Community 94 - "trackUpload.ts"
Cohesion: 0.15
Nodes (20): POST(), GET(), PATCH(), patchSchema, PUT(), createSchema, GET(), POST() (+12 more)

### Community 96 - "Remixt"
Cohesion: 0.14
Nodes (14): Architecture, Community, Configuration, Deploying it, Notes, Postgres (accounts, tracks, stems, remixes), Remixt, Running it (+6 more)

### Community 97 - "partyWorld.ts"
Cohesion: 0.10
Nodes (28): three, api(), GoLiveStudioButton(), endExistingAndStart(), start(), LiveStudioBar(), end(), goLive() (+20 more)

### Community 98 - "devDependencies"
Cohesion: 0.12
Nodes (16): devDependencies, @ast-grep/cli, eslint, eslint-config-next, knip, playwright-core, tailwindcss, @tailwindcss/postcss (+8 more)

### Community 99 - "app/page.tsx"
Cohesion: 0.09
Nodes (36): GET(), POST(), barsFor(), FAQ, Feature(), Home(), metadata, NO_NUMBERS (+28 more)

### Community 100 - "neuralBeats.ts"
Cohesion: 0.13
Nodes (25): BeatNetRequest, BeatNetResponse, beatModelEnabled(), BeatModelState, beatModelSupported(), diskKey(), keep(), keptBeats() (+17 more)

### Community 101 - "stemFetch.ts"
Cohesion: 0.21
Nodes (7): fetchInSlices(), fetchRange(), fetchWhole(), download(), FILE, Handler, server

### Community 102 - "Remixt Social Share Image (1920x1080)"
Cohesion: 0.23
Nodes (12): App Navigation: Library / Studio / Remixes / Upload, BPM & Pitch Match feature (Sync BPM), remixt-free.vercel.app (Vercel deployment), Multitrack Stem Lanes (VOCALS/BEAT waveforms with Vol & Pitch sliders), Publish Remix Under Your Name, Remixt Brand (gradient R logo, pink-purple-cyan palette), Remixt Social Share Image (1920x1080), Studio Page Mockup (remixt-free.vercel.app/studio) (+4 more)

### Community 103 - "split-queue.test.ts"
Cohesion: 0.18
Nodes (16): Function Triggers (CLI, MCP, REST), body(), claim(), claimJob(), Client, deliverStems(), downloadSource(), expectStatus() (+8 more)

### Community 104 - "mixScore.ts"
Cohesion: 0.16
Nodes (16): Best, CheckActions, FixState, STATUS, FixGroup, playedLoudness(), recordingOf(), clamp01() (+8 more)

### Community 105 - "liveReplay.ts"
Cohesion: 0.25
Nodes (11): ReplayClock, useReplayClock(), indexAt(), positionAt(), Replay, ReplayChat, ReplayMix, ReplayReaction (+3 more)

### Community 106 - "liveStudio.ts"
Cohesion: 0.24
Nodes (12): applyLiveMix(), isMix(), mixFields(), mixOf(), startStudioBroadcast(), scheduleMix(), scheduleState(), sendMix() (+4 more)

### Community 107 - "pitchTempo.ts"
Cohesion: 0.26
Nodes (10): signalsmith-stretch, soundtouchjs, feedAsRendered(), hasSound(), renderHq(), renderInWorker(), renderOnPage(), renderPitchTempo() (+2 more)

### Community 108 - "auth.ts"
Cohesion: 0.16
Nodes (14): POST(), schema, POST(), POST(), schema, GET(), clearSessionCookie(), createSessionCookie() (+6 more)

### Community 109 - "HostConsole"
Cohesion: 0.21
Nodes (8): api(), HostConsole(), chooseRemix(), endSession(), goLive(), saveSettings(), ScrubBar(), Stat()

### Community 110 - "mediaSession.ts"
Cohesion: 0.22
Nodes (12): NOW_PLAYING_ARTWORK, apply(), artworkFor(), lastPosition, mediaSession(), NowPlaying, Owner, owners (+4 more)

### Community 111 - "stem-results.test.ts"
Cohesion: 0.24
Nodes (7): packAnalysis(), StemAnalysis, unpackAnalysis(), pack(), unpack(), analysis(), ramp()

### Community 113 - "demucs-web.d.ts"
Cohesion: 0.17
Nodes (7): Channels, demucs-web, demucs-web/constants, demucs-web/processor, DemucsProcessor, Progress, Spec

### Community 114 - "melody.ts"
Cohesion: 0.25
Nodes (10): correlation(), keepHeldNotes(), MAJOR_NOTES, Melody, melodyKeyScores(), MINOR_NOTES, percentile(), PITCH_HOP (+2 more)

### Community 115 - "liveStudioDiff.ts"
Cohesion: 0.27
Nodes (6): describeMixChanges(), DiffLane, DiffMix, FX_WORDS, laneLabel(), same()

### Community 116 - "create"
Cohesion: 0.25
Nodes (7): Claim, Claimable Neon, If neon claim is missing, Path, With REST, With the CLI, create()

### Community 117 - "scripts"
Cohesion: 0.18
Nodes (11): scripts, build, dev, knip, lint, prebuild, predev, sg (+3 more)

### Community 118 - "live.test.ts"
Cohesion: 0.29
Nodes (8): chat(), Client, feed(), json(), ok(), remixOf(), signUp(), sql

### Community 119 - "Free on Vercel, with Neon and Vercel Blob"
Cohesion: 0.22
Nodes (9): 1. Put the code on GitHub, 2. Create the Vercel project, 3. Add the database (Neon), 4. Add stem storage (Vercel Blob), 5. Redeploy and finish, 6. Try it, Free on Vercel, with Neon and Vercel Blob, Optional (+1 more)

### Community 120 - "eslint.config.mjs"
Cohesion: 0.50
Nodes (3): eslint, eslint-config-next, eslintConfig

### Community 121 - "RemixCover.tsx"
Cohesion: 0.36
Nodes (6): RemixCover(), pick(), decode(), Decoded, squareCover(), uploadCover()

### Community 122 - "Sharing Remixt with someone else"
Cohesion: 0.25
Nodes (7): `./share.sh cloudflared` — your Cloudflare tunnel, `./share.sh ngrok` — ngrok, `./share.sh` — serveo (default), Sharing Remixt with someone else, The three providers, Things worth knowing before you send the link, Why not Cloudflare's quick tunnel

### Community 124 - "Free, all in one place: Oracle Cloud"
Cohesion: 0.29
Nodes (7): 1. Create the account, 2. Create the server, 3. Open ports 80 and 443, 4. Get a free domain name, 5. Install Docker and start Remixt, 6. Keep it running, Free, all in one place: Oracle Cloud

### Community 125 - "run.sh"
Cohesion: 0.29
Nodes (3): PATH, run.sh script, share.sh script

### Community 126 - "allowScripts"
Cohesion: 0.67
Nodes (3): allowScripts, better-sqlite3@13.0.3, unrs-resolver@1.12.2

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

## Ambiguous Edges - Review These
- `Remixt Brand Gradient (pink to violet to cyan)` → `Remixt Mark - Black Monochrome`  [AMBIGUOUS]
  web/public/remixt-logo/remixt-mark-black.svg · relation: references
- `Remixt Brand Gradient (pink to violet to cyan)` → `Remixt Mark - White Monochrome`  [AMBIGUOUS]
  web/public/remixt-logo/remixt-mark-white.svg · relation: references

## Knowledge Gaps
- **39 isolated node(s):** `PATH`, `onnxruntime-web`, `uuid`, `@ast-grep/cli`, `@tailwindcss/postcss` (+34 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1108 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `react` to `models.ts`, `curriculum.ts`, `djLibrary.ts`, `dj-realism.test.ts`, `studioStore.ts`, `SocialClipButton.tsx`, `AdminPanel.tsx`, `SongPicker.tsx`, `Studio.tsx`, `Arrangement.tsx`, `clipsOf`, `djEngine.ts`, `notifications.ts`, `examplesLibrary.ts`, `demoSongs.ts`, `SplitQueue.tsx`, `MatchStep.tsx`, `AiProducer.tsx`, `CoProducer.tsx`, `libraryTracks.ts`, `WhatHappened.tsx`, `coproducerTools.ts`, `stemKinds.ts`, `liveSync.ts`, `useStudioStore`, `exportJob.ts`, `package.json`, `splitter.ts`, `VocalRecorder.tsx`, `MissionSession.tsx`, `UploadManager.tsx`, `collab.ts`, `localCache.ts`, `extras.tsx`, `app/layout.tsx`, `RemixComments.tsx`, `djMidi.ts`, `LaneMatchPanel.tsx`, `startNewStep`, `zod`, `client/splitQueue.ts`, `EasyDecks.tsx`, `LiveChat.tsx`, `keyLabel`, `partyWorld.ts`, `app/page.tsx`, `mixScore.ts`, `liveReplay.ts`, `RemixCover.tsx`?**
  _High betweenness centrality (0.150) - this node is a cross-community bridge._
- **What connects `PATH`, `onnxruntime-web`, `uuid` to the rest of the system?**
  _39 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `DjEngine` be split into smaller, more focused modules?**
  _Cohesion score 0.05491000227842333 - nodes in this community are weakly interconnected._
- **Why does `next` connect `sql` to `models.ts`, `curriculum.ts`, `getCurrentUser`, `djLibrary.ts`, `storage.ts`, `live.ts`, `SocialClipButton.tsx`, `react`, `AdminPanel.tsx`, `SongPicker.tsx`, `Studio.tsx`, `notifications.ts`, `examplesLibrary.ts`, `SplitQueue.tsx`, `stemKinds.ts`, `useStudioStore`, `package.json`, `VocalRecorder.tsx`, `MissionSession.tsx`, `projects.ts`, `UploadManager.tsx`, `aiKeys.ts`, `ai/chat/route.ts`, `app/layout.tsx`, `ref_path`, `RemixComments.tsx`, `openrouter.ts`, `social.ts`, `challenges.ts`, `zod`, `linkImport.ts`, `LiveChat.tsx`, `trackUpload.ts`, `app/page.tsx`, `auth.ts`, `RemixCover.tsx`, `version/route.ts`?**
  _High betweenness centrality (0.118) - this node is a cross-community bridge._
- **Should `models.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.04584190420217455 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Remixt Brand Gradient (pink to violet to cyan)` and `Remixt Mark - Black Monochrome`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `Remixt Brand Gradient (pink to violet to cyan)` and `Remixt Mark - White Monochrome`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._