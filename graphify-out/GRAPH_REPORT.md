# Graph Report - code  (2026-10-11)

## Corpus Check
- 440 files · ~503,824 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 11 file(s) not represented in the graph (top: (none) 6, .ttf 2, .ico 2)

## Summary
- 4289 nodes · 13488 edges · 138 communities (123 shown, 15 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 183 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d77f1dfb`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- clipCommands.ts
- aiIdeas.ts
- projects.ts
- models.ts
- DjEngine
- djEngine.ts
- sql
- LiveRoom.tsx
- SongPicker.tsx
- extras.tsx
- getCurrentUser
- useStudioStore
- Waveform
- musicKey.ts
- libraryTracks.ts
- audioEngine
- splitter.ts
- MissionSession.tsx
- app/page.tsx
- client/splitQueue.ts
- storage.ts
- ExamplesLab.tsx
- audioGraph.ts
- ensureLiveSchema
- clipEdit.ts
- MatchStep.tsx
- beatNet.ts
- Live.tsx
- djMath.ts
- pairMatch.ts
- directUpload.ts
- AiProducer
- lucide-react
- demoSongs.ts
- aiTrial.ts
- CoProducer.tsx
- stemKinds.ts
- AdminPanel.tsx
- arrange.ts
- EmbedPlayer.tsx
- PartyWorld
- aiKeys.ts
- Remixt Brand Mark (split audio-waveform bars)
- demoSongsDsp.ts
- linkImport.ts
- aiExplain.ts
- studioStore.ts
- coproducerTools.ts
- mixScore.ts
- StudioTransport.tsx
- analysis.ts
- audioEngine.ts
- uploads.ts
- Lakebase Postgres
- StudioLane
- app.py
- VocalRecorder.tsx
- SocialClipButton.tsx
- package.json
- next
- Neon
- dj-realism.test.ts
- localCache.ts
- stretch-memory.test.ts
- autoMatch.ts
- remixLanes.ts
- examplesLibrary.ts
- live.ts
- UploadManager.tsx
- neuralBeats.ts
- openrouter.ts
- NavBar.tsx
- SplitLaneDialog.tsx
- exportJob.ts
- dependencies
- challenges.ts
- MixerConsole.tsx
- .renderClip
- FakeContext
- compilerOptions
- audioTags.ts
- mixdown.ts
- splitter.worker.ts
- studioHistory.ts
- StudioLibraryPanel.tsx
- splitHelper
- soundtouchjs.d.ts
- test.mjs
- [id]/opengraph-image.tsx
- react
- RemixtMark
- uploads
- EasyStudio.tsx
- AiProducer.tsx
- .play
- stemFetch.ts
- Remixt Social Share Image (1920x1080)
- appIcon
- Free on Vercel, with Neon and Vercel Blob
- previewPlayer
- LineCard.tsx
- pitchTempo.ts
- devDependencies
- exportMeta.ts
- previewPlayer.ts
- MatchFinder.tsx
- demucs-web.d.ts
- Free, all in one place: Oracle Cloud
- live.test.ts
- studioView.ts
- liveStudioDiff.ts
- postgres
- Remixt
- phone-export.test.ts
- Python separation service dependencies (FastAPI, demucs 4.0.1, librosa)
- Sharing Remixt with someone else
- notifications.ts
- RemixCover.tsx
- Remixt — repo map
- scripts
- web/README.md
- run.sh
- AGENTS.md
- parse-env.md
- GoLiveStudioButton
- ref_node_fs
- sdk.md
- ai/chat/route.ts
- entrypoint.sh
- start-dev.sh
- signalsmith-stretch.d.ts
- postcss.config.mjs
- CONSTANTS
- Google Search Console site verification file

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
- `6. Try it` --references--> `main()`  [INFERRED]
  DEPLOY.md → web/scripts/fetch-ytdlp.mjs
- `Tune the Index` --references--> `quality()`  [INFERRED]
  web/.agents/skills/neon-postgres/references/vector-search.md → web/src/lib/client/harmony.ts
- `Pooled vs direct connections: use the direct URL for migrations, dumps, and replication` --references--> `url()`  [INFERRED]
  web/.agents/skills/neon-postgres/SKILL.md → web/tests/shared-results.test.ts
- `Remixt Demo Video Poster (1280x720)` --semantically_similar_to--> `Remixt Social Share Image (1920x1080)`  [INFERRED] [semantically similar]
  web/public/remixt-demo-poster.jpg → remixt-share-1920x1080.png

## Import Cycles
- 3-file cycle: `web/src/lib/models.ts -> web/src/lib/schema.ts -> web/src/lib/social.ts -> web/src/lib/models.ts`
- 4-file cycle: `web/src/lib/schema.ts -> web/src/lib/social.ts -> web/src/lib/splitQueue.ts -> web/src/lib/trackUpload.ts -> web/src/lib/schema.ts`
- 4-file cycle: `web/src/lib/live.ts -> web/src/lib/social.ts -> web/src/lib/splitQueue.ts -> web/src/lib/notifications.ts -> web/src/lib/live.ts`
- 4-file cycle: `web/src/lib/notifications.ts -> web/src/lib/schema.ts -> web/src/lib/social.ts -> web/src/lib/splitQueue.ts -> web/src/lib/notifications.ts`
- 5-file cycle: `web/src/lib/models.ts -> web/src/lib/schema.ts -> web/src/lib/social.ts -> web/src/lib/splitQueue.ts -> web/src/lib/trackUpload.ts -> web/src/lib/models.ts`
- 5-file cycle: `web/src/lib/live.ts -> web/src/lib/schema.ts -> web/src/lib/social.ts -> web/src/lib/splitQueue.ts -> web/src/lib/notifications.ts -> web/src/lib/live.ts`

## Hyperedges (group relationships)
- **Remixt core workflow: split stems, match BPM/pitch, mix, publish** — remixt_share_1920x1080_vocal_beat_split, remixt_share_1920x1080_bpm_pitch_match, remixt_share_1920x1080_multitrack_stem_lanes, remixt_share_1920x1080_publish_remix [EXTRACTED 1.00]
- **Remixt background-free mark variants for overlay use** — web_public_remixt_logo_remixt_mark_transparent_mark_transparent, web_public_remixt_logo_remixt_mark_black_mark_black, web_public_remixt_logo_remixt_mark_white_mark_white [INFERRED 0.85]
- **Remixt light/dark theme-paired logo variants** — web_public_remixt_logo_remixt_mark_dark_mark_dark, web_public_remixt_logo_remixt_mark_light_mark_light, web_public_remixt_logo_remixt_logo_dark_bg_logo_dark_bg, web_public_remixt_logo_remixt_logo_light_bg_logo_light_bg, web_public_remixt_logo_remixt_avatar_dark_avatar_dark, web_public_remixt_logo_remixt_avatar_avatar [INFERRED 0.85]
- **Remixt Horizontal Logo Lockups (light/dark bg)** — web_public_remixt_logo_png_remixt_logo_dark_bg_logo_dark_bg, web_public_remixt_logo_png_remixt_logo_light_bg_logo_light_bg, web_public_remixt_logo_wordmark, web_public_remixt_logo_brand_gradient [INFERRED 0.85]
- **PWA / Home-screen App Icon Set** — web_public_remixt_logo_png_apple_touch_icon_apple_touch_icon, web_public_remixt_logo_png_icon_192_icon, web_public_remixt_logo_png_icon_512_icon [INFERRED 0.85]
- **create-next-app default public icons** — web_public_file_file_icon, web_public_globe_globe_icon, web_public_next_nextjs_wordmark, web_public_vercel_vercel_logo, web_public_window_window_icon [INFERRED 0.95]
- **Remixt Mark 1024px Color/Background Variants** — web_public_remixt_logo_png_remixt_mark_1024_mark, web_public_remixt_logo_png_remixt_mark_black_1024_mark_black, web_public_remixt_logo_png_remixt_mark_dark_1024_mark_dark, web_public_remixt_logo_png_remixt_mark_light_1024_mark_light, web_public_remixt_logo_png_remixt_mark_transparent_1024_mark_transparent, web_public_remixt_logo_png_remixt_mark_white_1024_mark_white [INFERRED 0.95]

## Communities (138 total, 15 thin omitted)

### Community 0 - "clipCommands.ts"
Cohesion: 0.13
Nodes (53): gatePattern(), pumpPattern(), spliceAutomation(), clearAutomation(), clearSelection(), clipFade(), clipGain(), copy() (+45 more)

### Community 1 - "aiIdeas.ts"
Cohesion: 0.06
Nodes (93): activeShare(), adoptTiming(), ALL_FIXES, applyLevels(), applyMix(), arrange(), arrangementIdeas(), arrangeOnDrop() (+85 more)

### Community 2 - "projects.ts"
Cohesion: 0.17
Nodes (18): DELETE(), GET(), PUT(), putSchema, POST(), schema, POST(), createProject() (+10 more)

### Community 3 - "models.ts"
Cohesion: 0.04
Nodes (66): DELETE(), POST(), setLiked(), POST(), createSchema, GET(), generateMetadata(), EmbedPage() (+58 more)

### Community 4 - "DjEngine"
Cohesion: 0.06
Nodes (12): DjConsole(), dbToGain(), emptyHotCues(), quantizePos(), DeckUnit, DjEngine, clamp(), applyMidi() (+4 more)

### Community 5 - "djEngine.ts"
Cohesion: 0.05
Nodes (67): BarCounter(), DeckPanel(), Pad(), PAD_JUMPS, PAD_MODE_LABEL, ROLLS, sign(), STEM_BUTTONS (+59 more)

### Community 6 - "sql"
Cohesion: 0.07
Nodes (53): DELETE(), findJunk(), GET(), maxDuration, POST(), GET(), DELETE(), PATCH() (+45 more)

### Community 7 - "LiveRoom.tsx"
Cohesion: 0.08
Nodes (47): dynamic, LiveSessionPage(), api(), HostConsole(), chooseRemix(), endSession(), goLive(), saveSettings() (+39 more)

### Community 8 - "SongPicker.tsx"
Cohesion: 0.14
Nodes (29): Flags, INFO, Kind, LibrarySplit(), NO_FLAGS, Part, PARTS, PARTS_MUTED (+21 more)

### Community 9 - "extras.tsx"
Cohesion: 0.19
Nodes (23): Engines(), FineTune(), keepWhatsPlaying(), MasterIt(), TuneButton(), TuneRow(), Switch(), SwitchRow() (+15 more)

### Community 10 - "getCurrentUser"
Cohesion: 0.06
Nodes (77): GET(), DELETE(), GET(), PATCH(), patchSchema, POST(), DELETE(), POST() (+69 more)

### Community 11 - "useStudioStore"
Cohesion: 0.08
Nodes (66): ReadOnlyStudio(), AiSection(), Arrangement(), onContentPointerDown(), onContentPointerUp(), snapDelta(), timeAt(), ClipFades() (+58 more)

### Community 12 - "Waveform"
Cohesion: 0.23
Nodes (7): ChallengeStemCard(), formatTime(), PreviewBar(), drawBars(), Waveform(), WaveformProps, usePreviewState()

### Community 13 - "musicKey.ts"
Cohesion: 0.03
Nodes (115): FIT_LABEL, SORTS, TrackLibrary(), CHORD_INTERVALS, ChordDef, ChordQuality, CHORUS_CYCLE, DEMO_STEMS (+107 more)

### Community 14 - "libraryTracks.ts"
Cohesion: 0.13
Nodes (19): decoder(), entries, fold(), held, hold(), kept, loadParts(), NO_SUMMARIES (+11 more)

### Community 15 - "audioEngine"
Cohesion: 0.14
Nodes (3): audioEngine, queueReschedule(), Pad

### Community 16 - "splitter.ts"
Cohesion: 0.14
Nodes (15): isConstrainedDevice(), decode(), Job, MODEL_URL, splitSong(), splitter, splitTrackPayload(), Turn (+7 more)

### Community 17 - "MissionSession.tsx"
Cohesion: 0.04
Nodes (87): DjPage(), metadata, CopilotPanel(), ICON, DjApp(), Mode, OpenDecks(), DjHome() (+79 more)

### Community 18 - "app/page.tsx"
Cohesion: 0.06
Nodes (57): DELETE(), GET(), POST(), postSchema, visible(), DELETE(), handle(), POST() (+49 more)

### Community 19 - "client/splitQueue.ts"
Cohesion: 0.10
Nodes (36): ago(), duration(), HelperPanel(), jobDetail(), LastBlock(), noSubscription(), QueuedSongRow(), RewardRules() (+28 more)

### Community 20 - "storage.ts"
Cohesion: 0.09
Nodes (37): buildId(), nextConfig(), tunnelHost, GET(), kept(), redirect(), DELETE(), GET() (+29 more)

### Community 21 - "ExamplesLab.tsx"
Cohesion: 0.13
Nodes (12): ExamplesPage(), metadata, DEFAULT_PAIR, ExamplesLab(), STEPS, keepOnly(), useLibrarySongs(), RecipeGallery() (+4 more)

### Community 22 - "audioGraph.ts"
Cohesion: 0.21
Nodes (14): clipEnvelope(), createLaneChain(), update(), update(), curveCache, driveCurve(), getImpulse(), hasOwnStretch() (+6 more)

### Community 23 - "ensureLiveSchema"
Cohesion: 0.11
Nodes (27): DELETE(), GET(), PATCH(), patchSchema, createSchema, GET(), POST(), dynamic (+19 more)

### Community 24 - "clipEdit.ts"
Cohesion: 0.13
Nodes (52): Logs: CLI, Loki, and SDK pagination, Loki-compatible read API, onContentPointerMove(), allClipRefs(), asWholeTake(), cleanClip(), clipId(), clipsOf() (+44 more)

### Community 25 - "MatchStep.tsx"
Cohesion: 0.08
Nodes (45): AnalysisCard(), LEVEL_STYLE, pct(), Row(), Verdict(), BarGrid(), MatchStep(), prepare() (+37 more)

### Community 26 - "beatNet.ts"
Cohesion: 0.13
Nodes (24): aggregate(), BEAT_NET, cosTable, deduplicate(), fft(), hzToMel(), LEVELS, logMelSpectrogram() (+16 more)

### Community 27 - "Live.tsx"
Cohesion: 0.10
Nodes (34): GET(), POST(), ACTIVITY_ICON, ActivityGlyph(), activityKey(), ActivityText(), ago(), AREA_LABEL (+26 more)

### Community 28 - "djMath.ts"
Cohesion: 0.06
Nodes (74): BeatMatchMeter(), FIT_TEXT, Gauge(), MissionSession(), CrowdRequest, crowdScore(), CrowdState, ECHO_KEYS (+66 more)

### Community 29 - "pairMatch.ts"
Cohesion: 0.09
Nodes (39): Baseline, Choice(), LaneMatchPanel(), handleApply(), handleUndo(), snapshot(), untouchedSince(), HeardVocal (+31 more)

### Community 30 - "directUpload.ts"
Cohesion: 0.10
Nodes (34): @vercel/blob, blobApi(), blobMultipart(), blobRequest(), BlobTarget, FinalUploadError, isFinalStatus(), isHidden() (+26 more)

### Community 31 - "AiProducer"
Cohesion: 0.16
Nodes (38): AiProducer(), applyOptions(), changeScope(), chooseSync(), chooseTiming(), chooseWhole(), close(), findBest() (+30 more)

### Community 32 - "lucide-react"
Cohesion: 0.08
Nodes (46): lucide-react, react-dom, RemixDetailPlayer(), CollabBar(), SYNC_LABEL, ContextMenuHost(), isSheet(), MenuItem (+38 more)

### Community 33 - "demoSongs.ts"
Cohesion: 0.09
Nodes (34): useSide(), BEAT_PARTS, COLORS, DemoSplit(), Flags, NONE, STAGES, StemRow() (+26 more)

### Community 34 - "aiTrial.ts"
Cohesion: 0.08
Nodes (55): analyse(), putBackOn(), compatible(), fixesOf(), HandEdit, mixFix(), mixSignature(), prepareSession() (+47 more)

### Community 35 - "CoProducer.tsx"
Cohesion: 0.12
Nodes (35): @anthropic-ai/sdk, CoProducer(), chooseModel(), chooseProvider(), forgetKey(), send(), defaultRouterModel(), KeySetup() (+27 more)

### Community 36 - "stemKinds.ts"
Cohesion: 0.19
Nodes (13): GET(), LibraryPage(), metadata, formatDuration(), LibraryBrowser(), StemWithTrack, TabButton(), getLibraryStems() (+5 more)

### Community 37 - "AdminPanel.tsx"
Cohesion: 0.06
Nodes (59): Claim, Claimable Neon, If neon claim is missing, Path, With REST, With the CLI, Function Triggers (CLI, MCP, REST), AdminPage() (+51 more)

### Community 38 - "arrange.ts"
Cohesion: 0.11
Nodes (32): findPhrases(), onsetAt(), Phrase, trackBeats(), argmax(), Arrangement, arrangeVocal(), BeatGrid (+24 more)

### Community 39 - "EmbedPlayer.tsx"
Cohesion: 0.26
Nodes (11): Clock(), EmbedPlayer(), formatTime(), hostPosition(), useLiveFollower(), sync(), setPlayingRemix(), isClipList() (+3 more)

### Community 40 - "PartyWorld"
Cohesion: 0.07
Nodes (12): three, Avatar, bubble(), CameraMode, canvasSprite(), emojiTexture(), emojiTextures, Floater (+4 more)

### Community 41 - "aiKeys.ts"
Cohesion: 0.17
Nodes (22): check(), DELETE(), PATCH(), patchSchema, PUT(), putSchema, AI_MODELS, AI_PROVIDERS (+14 more)

### Community 42 - "Remixt Brand Mark (split audio-waveform bars)"
Cohesion: 0.11
Nodes (33): File Icon (document glyph), Globe Icon, Next.js Wordmark Logo, Next.js Starter Template Assets, Remixt Brand Gradient (pink to violet to cyan), Remixt Brand Mark (split audio-waveform bars), Remixt Duotone Palette (pink top / cyan bottom bars), Apple Touch Icon (180px, gradient rounded-square, white bars) (+25 more)

### Community 43 - "demoSongsDsp.ts"
Cohesion: 0.08
Nodes (50): songBars(), songMeta(), vocalPlan(), activeRms(), addClap(), addCrash(), addHat(), addKick() (+42 more)

### Community 44 - "linkImport.ts"
Cohesion: 0.14
Nodes (19): bodySchema, maxDuration, POST(), POST(), metadata, UploadPage(), checkLink(), downloadSong() (+11 more)

### Community 45 - "aiExplain.ts"
Cohesion: 0.08
Nodes (43): Icon(), IconName, ICONS, MEDAL_COLORS, Choice, ChoiceCards(), clock(), IdeaSwitch (+35 more)

### Community 46 - "studioStore.ts"
Cohesion: 0.06
Nodes (42): FxSlider(), hz(), LaneFxPanel(), pct(), AutomationLane(), at(), commit(), handleDown() (+34 more)

### Community 47 - "coproducerTools.ts"
Cohesion: 0.08
Nodes (35): Line, QuickHelp(), send(), SUGGESTIONS, availableFixes(), findDrop(), FixId, Idea (+27 more)

### Community 48 - "mixScore.ts"
Cohesion: 0.10
Nodes (34): FIT_WORDS, STATUS_COLOR, chooseShift(), harmonyOf(), keyStretch(), playedLoudness(), accentCache, accents() (+26 more)

### Community 49 - "StudioTransport.tsx"
Cohesion: 0.21
Nodes (17): formatBars(), formatTime(), KeyControl(), LcdLabel(), MobileSeek(), Popover(), StudioTransport(), handleSave() (+9 more)

### Community 50 - "analysis.ts"
Cohesion: 0.07
Nodes (48): activeLoudness(), ANALYSIS_RATE, analyzeAndKeep(), analyzeMono(), autocorrelation(), cache, chromagram(), correlation() (+40 more)

### Community 51 - "audioEngine.ts"
Cohesion: 0.11
Nodes (17): DecodedStem, lastUsed, LoadedLane, PHONE, QueuedRender, queueModulation(), RenderAsk, LaneChain (+9 more)

### Community 52 - "uploads.ts"
Cohesion: 0.16
Nodes (20): ProgressBar(), RigStatus(), formatMB(), SplitterStatus(), BackgroundActivity(), doneText(), UploadList(), UploadRow() (+12 more)

### Community 53 - "Lakebase Postgres"
Cohesion: 0.04
Nodes (43): Full-Text Search with BM25 Ranking, Prepare and Index Text, Query and Interpret Scores, Set Parameters at Build Time or Per Query, Set the Candidate Limit, Use Prefilter Selectively, Adapt the Hybrid Search, Hybrid Search (+35 more)

### Community 54 - "StudioLane"
Cohesion: 0.10
Nodes (39): zustand, Playhead(), AiScopeBar(), Drag, Pick, PICK_ICONS, Playhead(), clock() (+31 more)

### Community 55 - "app.py"
Cohesion: 0.12
Nodes (6): compute_peaks(), detect_bpm(), health(), load_and_encode(), separate(), SeparateRequest

### Community 56 - "VocalRecorder.tsx"
Cohesion: 0.15
Nodes (21): formatTime(), LevelMeter(), VocalRecorder(), begin(), keep(), listen(), stopPreview(), ensureRunning() (+13 more)

### Community 57 - "SocialClipButton.tsx"
Cohesion: 0.14
Nodes (19): formatCount(), RemixStatsBar(), share(), ShareMenu(), clipRange(), formatTime(), noSubscription(), SocialClipButton() (+11 more)

### Community 58 - "package.json"
Cohesion: 0.07
Nodes (27): @ast-grep/cli, aws4fetch, bcryptjs, eslint, eslint-config-next, jose, knip, onnxruntime-web (+19 more)

### Community 59 - "next"
Cohesion: 0.06
Nodes (43): next, zod, POST(), schema, POST(), POST(), schema, POST() (+35 more)

### Community 60 - "Neon"
Cohesion: 0.05
Nodes (41): Data API external JWKS, Functions: verify the JWT, then authorize the user, Incompatibilities, Managed Better Auth, Trusted domains, 1. Install the Neon CLI, 2. Install the Neon MCP Server, 3. Install Neon Agent Skills (+33 more)

### Community 61 - "dj-realism.test.ts"
Cohesion: 0.04
Nodes (56): BAND_COLOR, bandsAt(), DeckOverview(), DeckWave(), DRAW_ORDER, killedSlot(), STEM_COLOR, WaveMode (+48 more)

### Community 62 - "localCache.ts"
Cohesion: 0.10
Nodes (31): metadata, StoragePage(), formatBytes(), KIND_TEXT, MODEL_TEXT, ModelKey, ModelUsage, StorageSettings() (+23 more)

### Community 63 - "stretch-memory.test.ts"
Cohesion: 0.11
Nodes (11): files, from, root, stretch, stretchFrom, stretchTo, to, fixStretchWorklet() (+3 more)

### Community 64 - "autoMatch.ts"
Cohesion: 0.12
Nodes (29): load(), analyzeStem(), beatPhase(), gridScore(), refineTempo(), PRE_ROLL, TAIL, ALL_STEPS (+21 more)

### Community 65 - "remixLanes.ts"
Cohesion: 0.09
Nodes (31): CollabMember, CollabSession, connectCollab(), idle, mergeShared(), normalise(), same(), SharedLane (+23 more)

### Community 66 - "examplesLibrary.ts"
Cohesion: 0.11
Nodes (28): demoLabSong(), EXCERPT_BARS, LabSong, libraryLabSong(), LibraryState, LoadedTrack, Found, alignExcerpt() (+20 more)

### Community 67 - "live.ts"
Cohesion: 0.08
Nodes (34): GoLiveForm(), localInputValue(), RemixChoice, Avatar(), submit(), Message(), readGuestName(), FollowStatus (+26 more)

### Community 68 - "UploadManager.tsx"
Cohesion: 0.09
Nodes (27): RemixOwnerControls(), QueuedSongs(), QueueNotice(), TagInput(), add(), nameList(), noSubscription(), skippedMessage() (+19 more)

### Community 69 - "neuralBeats.ts"
Cohesion: 0.10
Nodes (30): share(), beatModelEnabled(), BeatModelState, beatModelSupported(), diskKey(), keep(), keptBeats(), legacyResult() (+22 more)

### Community 70 - "openrouter.ts"
Cohesion: 0.18
Nodes (16): GET(), Block, checkOpenRouterKey(), Completion, fromOpenAi(), headers(), OpenAiMessage, OpenRouterError (+8 more)

### Community 71 - "NavBar.tsx"
Cohesion: 0.12
Nodes (22): RootLayout(), InstallEvent, InstallPrompt(), dismiss(), install(), read(), write(), MobileTabBar() (+14 more)

### Community 72 - "SplitLaneDialog.tsx"
Cohesion: 0.19
Nodes (19): SplitLaneDialog(), finish(), start(), cache, findParts(), placeStems(), siblingStems(), swapInParts() (+11 more)

### Community 73 - "exportJob.ts"
Cohesion: 0.14
Nodes (25): ExportSheet(), save(), formatBytes(), formatDuration(), formatLeft(), noSubscription(), phoneKind(), ExportJobState (+17 more)

### Community 74 - "dependencies"
Cohesion: 0.10
Nodes (21): dependencies, @anthropic-ai/sdk, aws4fetch, bcryptjs, demucs-web, jose, lucide-react, next (+13 more)

### Community 75 - "challenges.ts"
Cohesion: 0.16
Nodes (20): GET(), POST(), schema, GET(), ChallengeDetail(), ChallengesPage(), metadata, timeLeft() (+12 more)

### Community 76 - "MixerConsole.tsx"
Cohesion: 0.13
Nodes (26): isMastered(), MasterPanel(), masterPresetOf(), same(), Slider(), buffers, bypassed, ChannelStrip (+18 more)

### Community 77 - ".renderClip"
Cohesion: 0.12
Nodes (15): bytesOf(), clipKey(), renderKey(), RenderQueue, RenderSkipped, sliceBuffer(), used(), ClipBufferLookup (+7 more)

### Community 79 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+11 more)

### Community 80 - "audioTags.ts"
Cohesion: 0.24
Nodes (23): asciiUrl(), audioFileName(), AudioTags, chunk(), comment(), concat(), creditLine(), describedText() (+15 more)

### Community 81 - "mixdown.ts"
Cohesion: 0.19
Nodes (23): createMasterChain(), scheduleLane(), wavHeader(), bounceToFile(), encodeAudio(), encodeWav(), exportLane(), ExportOptions (+15 more)

### Community 82 - "splitter.worker.ts"
Cohesion: 0.15
Nodes (16): demucs-web, wasm-media-encoders, cachedDownload(), MODEL_CACHES, resumableDownload(), SIZE_HEADER, cancelled, init() (+8 more)

### Community 83 - "studioHistory.ts"
Cohesion: 0.12
Nodes (24): clearDraft(), draftNow(), hasWork(), normaliseDraft(), projectOf(), readDraft(), removeLocal(), startDraftAutosave() (+16 more)

### Community 84 - "StudioLibraryPanel.tsx"
Cohesion: 0.24
Nodes (16): add(), KIND_ICON, ListedStem, SongRow(), StemWithTrack, StudioLibraryPanel(), TAB_LABEL, takeOut() (+8 more)

### Community 85 - "splitHelper"
Cohesion: 0.17
Nodes (9): audioDuration(), ifNoOtherTabHelping(), LostJob, shrinkForQueue(), splitHelper, done(), stageName(), stageProgress() (+1 more)

### Community 86 - "soundtouchjs.d.ts"
Cohesion: 0.11
Nodes (5): FifoSampleBuffer, SimpleFilter, SoundTouch, soundtouchjs, WebAudioBufferSource

### Community 87 - "test.mjs"
Cohesion: 0.14
Nodes (9): databaseUrl, envLocal(), log, prepareDatabase(), root, server, serverEnv, storage (+1 more)

### Community 88 - "[id]/opengraph-image.tsx"
Cohesion: 0.12
Nodes (21): alt, contentType, Image(), size, alt, contentType, coverDataUri(), Image() (+13 more)

### Community 89 - "react"
Cohesion: 0.20
Nodes (11): react, formatTime(), MixWaveform(), ago(), AtPlayhead(), formatAt(), RemixComments(), REASONS (+3 more)

### Community 90 - "RemixtMark"
Cohesion: 0.12
Nodes (22): Error(), Field(), LoginPage(), metadata, NotFound(), Field(), SignupPage(), metadata (+14 more)

### Community 91 - "uploads"
Cohesion: 0.20
Nodes (4): fileKey(), isAudioFile(), rememberInFlight(), uploads

### Community 92 - "EasyStudio.tsx"
Cohesion: 0.25
Nodes (12): AddButton(), EasyStudio(), Guide(), Step, handleExport(), allInStep(), IN_STEP, KeyRef (+4 more)

### Community 93 - "AiProducer.tsx"
Cohesion: 0.05
Nodes (44): Best, CheckActions, FixState, STATUS, afterPaint(), DROP_GROUPS, ENTRIES, GROUPED (+36 more)

### Community 94 - ".play"
Cohesion: 0.28
Nodes (5): PlaybackBlockedError, reportMixNowPlaying(), stopSources(), disableNowPlayingAnchor(), stopNowPlayingAnchor()

### Community 95 - "stemFetch.ts"
Cohesion: 0.18
Nodes (9): fetchSongFromLink(), fetchInSlices(), fetchRange(), fetchStem(), fetchWhole(), download(), FILE, Handler (+1 more)

### Community 96 - "Remixt Social Share Image (1920x1080)"
Cohesion: 0.23
Nodes (12): App Navigation: Library / Studio / Remixes / Upload, BPM & Pitch Match feature (Sync BPM), remixt-free.vercel.app (Vercel deployment), Multitrack Stem Lanes (VOCALS/BEAT waveforms with Vol & Pitch sliders), Publish Remix Under Your Name, Remixt Brand (gradient R logo, pink-purple-cyan palette), Remixt Social Share Image (1920x1080), Studio Page Mockup (remixt-free.vercel.app/studio) (+4 more)

### Community 97 - "appIcon"
Cohesion: 0.22
Nodes (10): GET(), SIZES, AppleIcon(), contentType, size, contentType, Icon(), size (+2 more)

### Community 98 - "Free on Vercel, with Neon and Vercel Blob"
Cohesion: 0.14
Nodes (13): 1. Put the code on GitHub, 2. Create the Vercel project, 3. Add the database (Neon), 4. Add stem storage (Vercel Blob), 5. Redeploy and finish, 6. Try it, Free on Vercel, with Neon and Vercel Blob, Optional (+5 more)

### Community 100 - "LineCard.tsx"
Cohesion: 0.33
Nodes (10): BigSwitch(), LineCard(), separate(), presetOf(), SOUND_FIELDS, SOUND_NAMES, stretchWords(), canSeparate() (+2 more)

### Community 101 - "pitchTempo.ts"
Cohesion: 0.26
Nodes (10): signalsmith-stretch, soundtouchjs, feedAsRendered(), hasSound(), renderHq(), renderInWorker(), renderOnPage(), renderPitchTempo() (+2 more)

### Community 102 - "devDependencies"
Cohesion: 0.13
Nodes (15): devDependencies, @ast-grep/cli, eslint, eslint-config-next, knip, tailwindcss, @tailwindcss/postcss, @types/bcryptjs (+7 more)

### Community 103 - "exportMeta.ts"
Cohesion: 0.31
Nodes (10): id3Key(), TrackCredit, Cover, drawCover(), exportTags(), fetchCover(), imageType(), laneCredits() (+2 more)

### Community 104 - "previewPlayer.ts"
Cohesion: 0.14
Nodes (16): apply(), artworkFor(), getPlayingRemix(), lastPosition, mediaSession(), NowPlaying, Owner, owners (+8 more)

### Community 105 - "MatchFinder.tsx"
Cohesion: 0.33
Nodes (8): cache, Kind, libraryStems(), MatchFinder(), add(), Candidate, describeFit(), rankByTempo()

### Community 106 - "demucs-web.d.ts"
Cohesion: 0.17
Nodes (7): Channels, demucs-web, demucs-web/constants, demucs-web/processor, DemucsProcessor, Progress, Spec

### Community 107 - "Free, all in one place: Oracle Cloud"
Cohesion: 0.12
Nodes (17): 1. Create the account, 2. Create the server, 3. Open ports 80 and 443, 4. Get a free domain name, 5. Install Docker and start Remixt, 6. Keep it running, Before you open it to the public, Building on a Mac for a different server (+9 more)

### Community 108 - "live.test.ts"
Cohesion: 0.29
Nodes (8): chat(), Client, feed(), json(), ok(), remixOf(), signUp(), sql

### Community 109 - "studioView.ts"
Cohesion: 0.18
Nodes (10): AiTab, InspectorTab, LibraryTab, MAX_ZOOM, MIN_ZOOM, ProView, recall(), remember() (+2 more)

### Community 110 - "liveStudioDiff.ts"
Cohesion: 0.27
Nodes (6): describeMixChanges(), DiffLane, DiffMix, FX_WORDS, laneLabel(), same()

### Community 111 - "postgres"
Cohesion: 0.22
Nodes (5): postgres, root, __dirname, schema, sql

### Community 112 - "Remixt"
Cohesion: 0.18
Nodes (9): Architecture, Community, Configuration, Deploying it, Notes, Remixt, Running it, The Studio (+1 more)

### Community 113 - "phone-export.test.ts"
Cohesion: 0.13
Nodes (19): Bounce, channels(), encodeMp3(), encodeMp3Bytes(), openMp3Stream(), PcmSink, handleStream(), Mp3Response (+11 more)

### Community 115 - "Sharing Remixt with someone else"
Cohesion: 0.25
Nodes (7): `./share.sh cloudflared` — your Cloudflare tunnel, `./share.sh ngrok` — ngrok, `./share.sh` — serveo (default), Sharing Remixt with someone else, The three providers, Things worth knowing before you send the link, Why not Cloudflare's quick tunnel

### Community 116 - "notifications.ts"
Cohesion: 0.22
Nodes (13): GET(), POST(), describe(), hrefFor(), metadata, NotificationsPage(), timeAgo(), MarkNotificationsRead() (+5 more)

### Community 117 - "RemixCover.tsx"
Cohesion: 0.36
Nodes (6): RemixCover(), pick(), decode(), Decoded, squareCover(), uploadCover()

### Community 118 - "Remixt — repo map"
Cohesion: 0.40
Nodes (4): Commands, Finding code, Layout, Remixt — repo map

### Community 119 - "scripts"
Cohesion: 0.20
Nodes (10): scripts, build, dev, knip, lint, prebuild, predev, sg (+2 more)

### Community 120 - "web/README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

### Community 121 - "run.sh"
Cohesion: 0.29
Nodes (3): PATH, run.sh script, share.sh script

### Community 124 - "GoLiveStudioButton"
Cohesion: 0.38
Nodes (6): api(), GoLiveStudioButton(), endExistingAndStart(), start(), end(), goLive()

### Community 125 - "ref_node_fs"
Cohesion: 0.40
Nodes (3): resolve(), src, withExtension()

### Community 127 - "ai/chat/route.ts"
Cohesion: 0.19
Nodes (19): maxDuration, POST(), GET(), AiModel, DEFAULT_AI_MODEL, isAiModel(), isModelFor(), isOpenRouterModel() (+11 more)

### Community 128 - "entrypoint.sh"
Cohesion: 1.00
Nodes (3): log(), entrypoint.sh script, shutdown()

## Ambiguous Edges - Review These
- `Remixt Brand Gradient (pink to violet to cyan)` → `Remixt Mark - Black Monochrome`  [AMBIGUOUS]
  web/public/remixt-logo/remixt-mark-black.svg · relation: references
- `Remixt Brand Gradient (pink to violet to cyan)` → `Remixt Mark - White Monochrome`  [AMBIGUOUS]
  web/public/remixt-logo/remixt-mark-white.svg · relation: references

## Knowledge Gaps
- **27 isolated node(s):** `PATH`, `onnxruntime-web`, `uuid`, `@ast-grep/cli`, `@tailwindcss/postcss` (+22 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1069 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `react` to `models.ts`, `djEngine.ts`, `LiveRoom.tsx`, `SongPicker.tsx`, `extras.tsx`, `useStudioStore`, `Waveform`, `musicKey.ts`, `libraryTracks.ts`, `splitter.ts`, `MissionSession.tsx`, `app/page.tsx`, `client/splitQueue.ts`, `ExamplesLab.tsx`, `ensureLiveSchema`, `MatchStep.tsx`, `Live.tsx`, `djMath.ts`, `pairMatch.ts`, `lucide-react`, `demoSongs.ts`, `CoProducer.tsx`, `stemKinds.ts`, `AdminPanel.tsx`, `EmbedPlayer.tsx`, `aiExplain.ts`, `studioStore.ts`, `coproducerTools.ts`, `mixScore.ts`, `StudioTransport.tsx`, `uploads.ts`, `StudioLane`, `VocalRecorder.tsx`, `SocialClipButton.tsx`, `package.json`, `dj-realism.test.ts`, `localCache.ts`, `examplesLibrary.ts`, `live.ts`, `UploadManager.tsx`, `NavBar.tsx`, `SplitLaneDialog.tsx`, `exportJob.ts`, `MixerConsole.tsx`, `StudioLibraryPanel.tsx`, `RemixtMark`, `EasyStudio.tsx`, `AiProducer.tsx`, `LineCard.tsx`, `previewPlayer.ts`, `MatchFinder.tsx`, `notifications.ts`, `RemixCover.tsx`?**
  _High betweenness centrality (0.167) - this node is a cross-community bridge._
- **What connects `PATH`, `onnxruntime-web`, `uuid` to the rest of the system?**
  _27 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `clipCommands.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1344155844155844 - nodes in this community are weakly interconnected._
- **Why does `next` connect `next` to `projects.ts`, `models.ts`, `sql`, `LiveRoom.tsx`, `SongPicker.tsx`, `getCurrentUser`, `musicKey.ts`, `MissionSession.tsx`, `app/page.tsx`, `client/splitQueue.ts`, `storage.ts`, `ExamplesLab.tsx`, `ensureLiveSchema`, `Live.tsx`, `lucide-react`, `demoSongs.ts`, `stemKinds.ts`, `AdminPanel.tsx`, `aiKeys.ts`, `linkImport.ts`, `StudioTransport.tsx`, `uploads.ts`, `VocalRecorder.tsx`, `SocialClipButton.tsx`, `package.json`, `examplesLibrary.ts`, `live.ts`, `UploadManager.tsx`, `openrouter.ts`, `NavBar.tsx`, `challenges.ts`, `[id]/opengraph-image.tsx`, `react`, `RemixtMark`, `appIcon`, `notifications.ts`, `RemixCover.tsx`, `ai/chat/route.ts`?**
  _High betweenness centrality (0.140) - this node is a cross-community bridge._
- **Should `aiIdeas.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05881254667662435 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Remixt Brand Gradient (pink to violet to cyan)` and `Remixt Mark - Black Monochrome`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `Remixt Brand Gradient (pink to violet to cyan)` and `Remixt Mark - White Monochrome`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._