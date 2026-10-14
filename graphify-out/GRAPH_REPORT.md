# Graph Report - code  (2026-10-15)

## Corpus Check
- 451 files · ~514,408 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 12 file(s) not represented in the graph (top: (none) 7, .ttf 2, .ico 2)

## Summary
- 4436 nodes · 13878 edges · 139 communities (123 shown, 16 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 190 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `94dbbfb5`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- DjEngine
- app/page.tsx
- aiIdeas.ts
- audioEngine.ts
- lib/splitQueue.ts
- audioGraph.ts
- next
- dj-realism.test.ts
- storage.ts
- liveReplay.ts
- djMath.ts
- AutomationLane.tsx
- RemixtMark
- react
- AdminPanel.tsx
- SongPicker.tsx
- Studio.tsx
- clipCommands.ts
- audioEngine
- Arrangement.tsx
- clipsOf
- challenges.ts
- splitter.worker.ts
- demoSongsDsp.ts
- Lakebase Postgres
- analysis.ts
- djEngine.ts
- AiProducer.tsx
- api/remixes/route.ts
- camelotCode
- clipEdit.ts
- demoSongs.ts
- client/splitQueue.ts
- Neon
- MatchStep.tsx
- aiExplain.ts
- mixdown.ts
- exportMeta.ts
- directUpload.ts
- CoProducer.tsx
- libraryTracks.ts
- MixerConsole.tsx
- Remixt Brand Mark (split audio-waveform bars)
- coproducerTools.ts
- PartyWorld
- StudioLibraryPanel.tsx
- useStudioStore
- appIcon
- StudioTransport.tsx
- exportJob.ts
- package.json
- app.py
- ref_node_fs
- splitter.ts
- VocalRecorder.tsx
- beatNet.ts
- MissionSession.tsx
- auth.ts
- djLibraryTracks.ts
- UploadManager.tsx
- aiKeys.ts
- SocialClipButton.tsx
- collab.ts
- localCache.ts
- extras.tsx
- InstallPrompt.tsx
- ai/chat/route.ts
- NavBar.tsx
- schema.sql
- app/layout.tsx
- dependencies
- copy-ort.mjs
- autoMatch.ts
- ref_path
- remixes/[id]/page.tsx
- openrouter.ts
- GoLiveStudioButton
- LaneMatchPanel.tsx
- pairMatch.ts
- FakeContext
- compilerOptions
- studioStore.ts
- SplitLaneDialog.tsx
- phone-export.test.ts
- socialClip.ts
- getCurrentUser
- splitHelper
- soundtouchjs.d.ts
- ExamplesLab.tsx
- ref_node_assert
- Live.tsx
- Logs: CLI, Loki, and SDK pagination
- test.mjs
- rtlText.ts
- models.ts
- uploads.ts
- Remixt
- partyWorld.ts
- devDependencies
- lib/presence.ts
- neuralBeats.ts
- stemFetch.ts
- Remixt Social Share Image (1920x1080)
- signup/page.tsx
- DeckWave.tsx
- pitchTempo.ts
- [id]/opengraph-image.tsx
- previewPlayer.ts
- FakeParam
- demucs-web.d.ts
- liveStudioDiff.ts
- scripts
- live.test.ts
- Free on Vercel, with Neon and Vercel Blob
- Sharing Remixt with someone else
- Free, all in one place: Oracle Cloud
- run.sh
- allowScripts
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
1. `sql` - 139 edges
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
- `Pooled vs direct connections: use the direct URL for migrations, dumps, and replication` --references--> `url()`  [INFERRED]
  web/.agents/skills/neon-postgres/SKILL.md → web/tests/shared-results.test.ts
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

## Communities (139 total, 16 thin omitted)

### Community 0 - "DjEngine"
Cohesion: 0.06
Nodes (9): dbToGain(), emptyHotCues(), quantizePos(), DeckUnit, DjEngine, clamp(), applyMidi(), DeckId (+1 more)

### Community 1 - "app/page.tsx"
Cohesion: 0.04
Nodes (87): DELETE(), GET(), POST(), postSchema, visible(), ArtistPage(), ArtistRow, generateMetadata() (+79 more)

### Community 2 - "aiIdeas.ts"
Cohesion: 0.06
Nodes (88): activeShare(), adoptTiming(), ALL_FIXES, applyLevels(), applyMix(), arrange(), arrangementIdeas(), arrangeOnDrop() (+80 more)

### Community 3 - "audioEngine.ts"
Cohesion: 0.08
Nodes (29): bytesOf(), DecodedStem, lastUsed, LoadedLane, PHONE, PlaybackBlockedError, QueuedRender, RenderAsk (+21 more)

### Community 4 - "lib/splitQueue.ts"
Cohesion: 0.09
Nodes (42): DELETE(), POST(), sessionOf(), POST(), bodySchema, POST(), bodySchema, POST() (+34 more)

### Community 5 - "audioGraph.ts"
Cohesion: 0.14
Nodes (19): clipKey(), ClipBufferLookup, clipEnvelope(), createLaneChain(), update(), update(), curveCache, driveCurve() (+11 more)

### Community 6 - "next"
Cohesion: 0.07
Nodes (52): next, AdminPage(), metadata, DELETE(), findJunk(), GET(), maxDuration, POST() (+44 more)

### Community 7 - "dj-realism.test.ts"
Cohesion: 0.05
Nodes (48): MidiPanel(), barOf(), startOffsetOnPhrase(), AUTO_GAIN_TARGET_DB, autoGainDb(), barBeat(), beatFraction(), beatIndex() (+40 more)

### Community 8 - "storage.ts"
Cohesion: 0.06
Nodes (58): aws4fetch, @vercel/blob, GET(), kept(), redirect(), DELETE(), GET(), keyFor() (+50 more)

### Community 9 - "liveReplay.ts"
Cohesion: 0.27
Nodes (10): ReplayClock, useReplayClock(), indexAt(), positionAt(), Replay, ReplayChat, ReplayMix, ReplayReaction (+2 more)

### Community 10 - "djMath.ts"
Cohesion: 0.06
Nodes (73): BeatMatchMeter(), FIT_TEXT, Gauge(), deckName(), HintLevel, liveHints(), CrowdRequest, crowdScore() (+65 more)

### Community 11 - "AutomationLane.tsx"
Cohesion: 0.16
Nodes (14): AutomationLane(), at(), commit(), handleDown(), handleMove(), remove(), formatValue(), PARAMS (+6 more)

### Community 12 - "RemixtMark"
Cohesion: 0.19
Nodes (13): Error(), Field(), LoginPage(), metadata, NotFound(), RemixtMark(), barFill(), MARK_BAR_WIDTH (+5 more)

### Community 13 - "react"
Cohesion: 0.06
Nodes (67): lucide-react, react, api(), HostConsole(), chooseRemix(), endSession(), goLive(), saveSettings() (+59 more)

### Community 14 - "AdminPanel.tsx"
Cohesion: 0.06
Nodes (57): Claim, Claimable Neon, If neon claim is missing, Path, With REST, With the CLI, Function Triggers (CLI, MCP, REST), AdminChallenge (+49 more)

### Community 15 - "SongPicker.tsx"
Cohesion: 0.09
Nodes (36): Flags, INFO, Kind, LibrarySplit(), NO_FLAGS, Part, PARTS, PARTS_MUTED (+28 more)

### Community 16 - "Studio.tsx"
Cohesion: 0.05
Nodes (68): formatAgo(), ModeChooser(), MODES, ModeSwitch(), PAD_KEYS, SamplePads(), Studio(), leaveTogether() (+60 more)

### Community 17 - "clipCommands.ts"
Cohesion: 0.14
Nodes (51): cutSilences(), spliceAutomation(), clearAutomation(), clearSelection(), clipFade(), clipGain(), copy(), cut() (+43 more)

### Community 18 - "audioEngine"
Cohesion: 0.12
Nodes (6): audioEngine, queueModulation(), queueReschedule(), reportMixNowPlaying(), stopSources(), Pad

### Community 19 - "Arrangement.tsx"
Cohesion: 0.11
Nodes (47): AiSection(), Arrangement(), onContentPointerDown(), onContentPointerMove(), onContentPointerUp(), snapDelta(), timeAt(), ClipFades() (+39 more)

### Community 20 - "clipsOf"
Cohesion: 0.07
Nodes (64): zustand, Playhead(), FIT_WORDS, STATUS_COLOR, AiScopeBar(), Drag, Pick, PICK_ICONS (+56 more)

### Community 21 - "challenges.ts"
Cohesion: 0.15
Nodes (21): GET(), POST(), schema, GET(), ChallengeDetail(), ChallengesPage(), metadata, timeLeft() (+13 more)

### Community 22 - "splitter.worker.ts"
Cohesion: 0.15
Nodes (16): demucs-web, wasm-media-encoders, cachedDownload(), MODEL_CACHES, resumableDownload(), SIZE_HEADER, cancelled, init() (+8 more)

### Community 23 - "demoSongsDsp.ts"
Cohesion: 0.08
Nodes (48): songBars(), activeRms(), addClap(), addCrash(), addHat(), addKick(), addReverb(), addRim() (+40 more)

### Community 24 - "Lakebase Postgres"
Cohesion: 0.05
Nodes (41): Full-Text Search with BM25 Ranking, Prepare and Index Text, Query and Interpret Scores, Set Parameters at Build Time or Per Query, Set the Candidate Limit, Use Prefilter Selectively, Adapt the Hybrid Search, Hybrid Search (+33 more)

### Community 25 - "analysis.ts"
Cohesion: 0.09
Nodes (43): activeLoudness(), ANALYSIS_RATE, analyzeAndKeep(), analyzeMono(), autocorrelation(), cache, chromagram(), correlation() (+35 more)

### Community 26 - "djEngine.ts"
Cohesion: 0.05
Nodes (83): BarCounter(), DeckPanel(), Pad(), PAD_JUMPS, PAD_MODE_LABEL, ROLLS, sign(), STEM_BUTTONS (+75 more)

### Community 27 - "AiProducer.tsx"
Cohesion: 0.05
Nodes (120): afterPaint(), AiProducer(), analyse(), applyOptions(), changeScope(), chooseSync(), chooseTiming(), chooseWhole() (+112 more)

### Community 28 - "api/remixes/route.ts"
Cohesion: 0.09
Nodes (31): GET(), POST(), DELETE(), GET(), PATCH(), patchSchema, createSchema, laneSchema (+23 more)

### Community 29 - "camelotCode"
Cohesion: 0.12
Nodes (37): EXCERPT_BARS, LabSong, libraryLabSong(), readSummaries(), summarize(), useSongSummaries(), Found, SongSelect() (+29 more)

### Community 30 - "clipEdit.ts"
Cohesion: 0.13
Nodes (49): allClipRefs(), asWholeTake(), cleanClip(), clipId(), clipSpan(), concrete(), concreteIds(), continues() (+41 more)

### Community 31 - "demoSongs.ts"
Cohesion: 0.08
Nodes (37): State, useDemoSong(), CHORD_INTERVALS, ChordDef, ChordQuality, CHORUS_CYCLE, DEMO_SONG_DEFS, DEMO_SONGS (+29 more)

### Community 32 - "client/splitQueue.ts"
Cohesion: 0.09
Nodes (46): ago(), duration(), HelperPanel(), jobDetail(), LastBlock(), noSubscription(), ProgressBar(), QueuedSongRow() (+38 more)

### Community 33 - "Neon"
Cohesion: 0.05
Nodes (41): Data API external JWKS, Functions: verify the JWT, then authorize the user, Incompatibilities, Managed Better Auth, Trusted domains, 1. Install the Neon CLI, 2. Install the Neon MCP Server, 3. Install Neon Agent Skills (+33 more)

### Community 34 - "MatchStep.tsx"
Cohesion: 0.08
Nodes (45): AnalysisCard(), LEVEL_STYLE, pct(), Row(), Verdict(), BarGrid(), demoLabSong(), MatchStep() (+37 more)

### Community 35 - "aiExplain.ts"
Cohesion: 0.08
Nodes (45): Icon(), IconName, ICONS, MEDAL_COLORS, Choice, ChoiceCards(), clock(), IdeaSwitch (+37 more)

### Community 36 - "mixdown.ts"
Cohesion: 0.11
Nodes (30): createMasterChain(), Bounce, bounceToFile(), downloadBlob(), encodeAudio(), ExportedFile, exportLane(), ExportOptions (+22 more)

### Community 37 - "exportMeta.ts"
Cohesion: 0.13
Nodes (38): asciiUrl(), audioFileName(), AudioTags, chunk(), comment(), concat(), creditLine(), describedText() (+30 more)

### Community 38 - "directUpload.ts"
Cohesion: 0.10
Nodes (31): blobApi(), blobMultipart(), blobRequest(), BlobTarget, FinalUploadError, isFinalStatus(), isHidden(), libraryPut() (+23 more)

### Community 39 - "CoProducer.tsx"
Cohesion: 0.12
Nodes (35): @anthropic-ai/sdk, CoProducer(), chooseModel(), chooseProvider(), forgetKey(), send(), defaultRouterModel(), KeySetup() (+27 more)

### Community 40 - "libraryTracks.ts"
Cohesion: 0.11
Nodes (32): decoder(), entries, fold(), held, hold(), kept, load(), LoadedTrack (+24 more)

### Community 41 - "MixerConsole.tsx"
Cohesion: 0.14
Nodes (25): isMastered(), MasterPanel(), masterPresetOf(), same(), Slider(), buffers, bypassed, ChannelStrip (+17 more)

### Community 42 - "Remixt Brand Mark (split audio-waveform bars)"
Cohesion: 0.11
Nodes (33): File Icon (document glyph), Globe Icon, Next.js Wordmark Logo, Next.js Starter Template Assets, Remixt Brand Gradient (pink to violet to cyan), Remixt Brand Mark (split audio-waveform bars), Remixt Duotone Palette (pink top / cyan bottom bars), Apple Touch Icon (180px, gradient rounded-square, white bars) (+25 more)

### Community 43 - "coproducerTools.ts"
Cohesion: 0.05
Nodes (53): Best, CheckActions, FixState, STATUS, Line, QuickHelp(), send(), SUGGESTIONS (+45 more)

### Community 45 - "StudioLibraryPanel.tsx"
Cohesion: 0.16
Nodes (21): add(), ListedStem, SongRow(), StemWithTrack, StudioLibraryPanel(), TAB_LABEL, takeOut(), withPeaks() (+13 more)

### Community 46 - "useStudioStore"
Cohesion: 0.10
Nodes (35): react-dom, EmbedPage(), metadata, Clock(), EmbedPlayer(), formatTime(), formatTime(), MixWaveform() (+27 more)

### Community 47 - "appIcon"
Cohesion: 0.22
Nodes (10): GET(), SIZES, AppleIcon(), contentType, size, contentType, Icon(), size (+2 more)

### Community 48 - "StudioTransport.tsx"
Cohesion: 0.21
Nodes (18): formatBars(), formatTime(), KeyControl(), LcdLabel(), MobileSeek(), Popover(), StudioTransport(), handleExport() (+10 more)

### Community 49 - "exportJob.ts"
Cohesion: 0.23
Nodes (19): ExportSheet(), save(), formatBytes(), formatDuration(), formatLeft(), noSubscription(), phoneKind(), ExportJobState (+11 more)

### Community 50 - "package.json"
Cohesion: 0.07
Nodes (26): @ast-grep/cli, bcryptjs, eslint, eslint-config-next, jose, knip, onnxruntime-web, playwright-core (+18 more)

### Community 51 - "app.py"
Cohesion: 0.12
Nodes (6): compute_peaks(), detect_bpm(), health(), load_and_encode(), separate(), SeparateRequest

### Community 52 - "ref_node_fs"
Cohesion: 0.40
Nodes (3): resolve(), src, withExtension()

### Community 53 - "splitter.ts"
Cohesion: 0.09
Nodes (20): formatMB(), SplitterStatus(), isConstrainedDevice(), Send, decode(), Job, MODEL_URL, splitSong() (+12 more)

### Community 54 - "VocalRecorder.tsx"
Cohesion: 0.14
Nodes (22): formatTime(), LevelMeter(), VocalRecorder(), begin(), keep(), listen(), stopPreview(), UploadTarget (+14 more)

### Community 55 - "beatNet.ts"
Cohesion: 0.13
Nodes (24): aggregate(), BEAT_NET, cosTable, deduplicate(), fft(), hzToMel(), LEVELS, logMelSpectrogram() (+16 more)

### Community 56 - "MissionSession.tsx"
Cohesion: 0.04
Nodes (88): DjPage(), metadata, CopilotPanel(), ICON, DjApp(), Mode, OpenDecks(), View (+80 more)

### Community 57 - "auth.ts"
Cohesion: 0.07
Nodes (37): zod, POST(), schema, POST(), POST(), schema, DELETE(), GET() (+29 more)

### Community 58 - "djLibraryTracks.ts"
Cohesion: 0.07
Nodes (60): FIT_LABEL, SORTS, browse(), BrowserEntry, BrowserQuery, camelotRank(), downbeatOffset(), entryFromTrack() (+52 more)

### Community 59 - "UploadManager.tsx"
Cohesion: 0.11
Nodes (27): QueuedSongs(), QueueNotice(), TagInput(), add(), UploadList(), nameList(), noSubscription(), skippedMessage() (+19 more)

### Community 60 - "aiKeys.ts"
Cohesion: 0.17
Nodes (22): check(), DELETE(), PATCH(), patchSchema, PUT(), putSchema, AI_MODELS, AI_PROVIDERS (+14 more)

### Community 61 - "SocialClipButton.tsx"
Cohesion: 0.19
Nodes (14): formatCount(), RemixStatsBar(), share(), ShareMenu(), clipRange(), formatTime(), noSubscription(), SocialClipButton() (+6 more)

### Community 62 - "collab.ts"
Cohesion: 0.09
Nodes (28): CollabBar(), SYNC_LABEL, CollabMember, CollabSession, connectCollab(), idle, mergeShared(), normalise() (+20 more)

### Community 63 - "localCache.ts"
Cohesion: 0.10
Nodes (31): metadata, StoragePage(), formatBytes(), KIND_TEXT, MODEL_TEXT, ModelKey, ModelUsage, StorageSettings() (+23 more)

### Community 64 - "extras.tsx"
Cohesion: 0.21
Nodes (21): Engines(), FineTune(), keepWhatsPlaying(), MasterIt(), TuneButton(), TuneRow(), masterFor(), setBeatModelEnabled() (+13 more)

### Community 65 - "InstallPrompt.tsx"
Cohesion: 0.48
Nodes (6): InstallEvent, InstallPrompt(), dismiss(), install(), read(), write()

### Community 66 - "ai/chat/route.ts"
Cohesion: 0.19
Nodes (19): maxDuration, POST(), GET(), AiModel, DEFAULT_AI_MODEL, isAiModel(), isModelFor(), isOpenRouterModel() (+11 more)

### Community 67 - "NavBar.tsx"
Cohesion: 0.18
Nodes (14): MobileTabBar(), Tab(), AccountMenu(), MoreLinks(), NavBar(), ICONS, isActive(), MORE_LINKS (+6 more)

### Community 68 - "schema.sql"
Cohesion: 0.11
Nodes (42): ai_shared_usage, challenges, follows, idx_comments_remix, idx_follows_followee, idx_lanes_remix, idx_live_events_stream, idx_live_streams_host (+34 more)

### Community 69 - "app/layout.tsx"
Cohesion: 0.18
Nodes (11): geistMono, geistSans, metadata, RootLayout(), viewport, PresenceHeartbeat(), isStaleChunk(), readLater() (+3 more)

### Community 70 - "dependencies"
Cohesion: 0.10
Nodes (21): dependencies, @anthropic-ai/sdk, aws4fetch, bcryptjs, demucs-web, jose, lucide-react, next (+13 more)

### Community 71 - "copy-ort.mjs"
Cohesion: 0.22
Nodes (8): files, from, root, stretch, stretchFrom, stretchTo, to, fixStretchWorklet()

### Community 72 - "autoMatch.ts"
Cohesion: 0.16
Nodes (19): PRE_ROLL, TAIL, ALL_STEPS, analyzeBeatLane(), analyzeGuide(), analyzeLane(), beatsAttempted, buildPlan() (+11 more)

### Community 73 - "ref_path"
Cohesion: 0.12
Nodes (11): postgres, buildId(), nextConfig(), tunnelHost, root, assets, root, target (+3 more)

### Community 74 - "remixes/[id]/page.tsx"
Cohesion: 0.08
Nodes (27): generateMetadata(), RemixDetailPage(), RemixRow, formatDuration(), LibraryBrowser(), StemWithTrack, TabButton(), ago() (+19 more)

### Community 75 - "openrouter.ts"
Cohesion: 0.18
Nodes (16): GET(), Block, checkOpenRouterKey(), Completion, fromOpenAi(), headers(), OpenAiMessage, OpenRouterError (+8 more)

### Community 76 - "GoLiveStudioButton"
Cohesion: 0.38
Nodes (6): api(), GoLiveStudioButton(), endExistingAndStart(), start(), end(), goLive()

### Community 77 - "LaneMatchPanel.tsx"
Cohesion: 0.15
Nodes (22): Baseline, Choice(), LaneMatchPanel(), handleApply(), handleUndo(), snapshot(), untouchedSince(), sectionBars() (+14 more)

### Community 78 - "pairMatch.ts"
Cohesion: 0.08
Nodes (48): onsetAt(), Phrase, StemAnalysis, trackBeats(), argmax(), Arrangement, arrangeVocal(), BeatGrid (+40 more)

### Community 80 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+11 more)

### Community 81 - "studioStore.ts"
Cohesion: 0.05
Nodes (84): GET(), FxSlider(), hz(), LaneFxPanel(), pct(), LaneHeader(), AddButton(), EasyStudio() (+76 more)

### Community 82 - "SplitLaneDialog.tsx"
Cohesion: 0.17
Nodes (21): separate(), SplitLaneDialog(), finish(), start(), cache, findParts(), placeStems(), siblingStems() (+13 more)

### Community 83 - "phone-export.test.ts"
Cohesion: 0.13
Nodes (18): channels(), encodeMp3(), encodeMp3Bytes(), openMp3Stream(), PcmSink, handleStream(), Mp3Response, Mp3StreamMessage (+10 more)

### Community 84 - "socialClip.ts"
Cohesion: 0.33
Nodes (10): canMakeClips(), drawFrame(), drawMark(), frameLevels(), makeSocialClip(), MAX_CLIP_SECONDS, pickMimeType(), pill() (+2 more)

### Community 85 - "getCurrentUser"
Cohesion: 0.05
Nodes (78): GET(), POST(), GET(), PUT(), POST(), schema, POST(), GET() (+70 more)

### Community 86 - "splitHelper"
Cohesion: 0.20
Nodes (7): ifNoOtherTabHelping(), LostJob, splitHelper, done(), stageName(), stageProgress(), tabSession()

### Community 87 - "soundtouchjs.d.ts"
Cohesion: 0.11
Nodes (5): FifoSampleBuffer, SimpleFilter, SoundTouch, soundtouchjs, WebAudioBufferSource

### Community 88 - "ExamplesLab.tsx"
Cohesion: 0.13
Nodes (12): ExamplesPage(), metadata, DEFAULT_PAIR, ExamplesLab(), STEPS, keepOnly(), useLibrarySongs(), RecipeGallery() (+4 more)

### Community 89 - "ref_node_assert"
Cohesion: 0.12
Nodes (15): AutoMixPanel(), viewOf(), AiDj, AUTO_MIX_STEPS, AutoMix, AutoMixEngine, AutoMixPhase, BLEND_BEATS (+7 more)

### Community 90 - "Live.tsx"
Cohesion: 0.18
Nodes (19): ACTIVITY_ICON, ActivityGlyph(), activityKey(), ActivityText(), ago(), AREA_LABEL, AREA_SHORT, AreaShort() (+11 more)

### Community 91 - "Logs: CLI, Loki, and SDK pagination"
Cohesion: 0.50
Nodes (3): Logs: CLI, Loki, and SDK pagination, Loki-compatible read API, source()

### Community 92 - "test.mjs"
Cohesion: 0.14
Nodes (9): databaseUrl, envLocal(), log, prepareDatabase(), root, server, serverEnv, storage (+1 more)

### Community 93 - "rtlText.ts"
Cohesion: 0.22
Nodes (11): CardText(), BidiRun, bidiRuns(), FORMS, hasRtl(), joinLetters(), joins(), joinsForward() (+3 more)

### Community 94 - "models.ts"
Cohesion: 0.09
Nodes (35): DELETE(), POST(), setLiked(), POST(), POST(), POST(), GET(), PATCH() (+27 more)

### Community 95 - "uploads.ts"
Cohesion: 0.11
Nodes (13): fetchSongFromLink(), SplitterState, AddResult, AUDIO_EXTENSIONS, empty, Entry, fileKey(), isAudioFile() (+5 more)

### Community 96 - "Remixt"
Cohesion: 0.14
Nodes (14): Architecture, Community, Configuration, Deploying it, Notes, Postgres (accounts, tracks, stems, remixes), Remixt, Running it (+6 more)

### Community 97 - "partyWorld.ts"
Cohesion: 0.25
Nodes (9): Avatar, bubble(), canvasSprite(), emojiTextures, Floater, nameLabel(), PALETTE, PartyMusic (+1 more)

### Community 98 - "devDependencies"
Cohesion: 0.12
Nodes (16): devDependencies, @ast-grep/cli, eslint, eslint-config-next, knip, playwright-core, tailwindcss, @tailwindcss/postcss (+8 more)

### Community 99 - "lib/presence.ts"
Cohesion: 0.25
Nodes (13): GET(), POST(), Activity, ActivityType, Area, areaFor(), AREAS, ensurePresenceSchema() (+5 more)

### Community 100 - "neuralBeats.ts"
Cohesion: 0.09
Nodes (40): GET(), Params, PUT(), packAnalysis(), unpackAnalysis(), beatModelEnabled(), BeatModelState, beatModelSupported() (+32 more)

### Community 101 - "stemFetch.ts"
Cohesion: 0.12
Nodes (14): Gotchas, Pooled vs direct connections: use the direct URL for migrations, dumps, and replication, share(), fetchInSlices(), fetchRange(), fetchStem(), fetchWhole(), put() (+6 more)

### Community 102 - "Remixt Social Share Image (1920x1080)"
Cohesion: 0.23
Nodes (12): App Navigation: Library / Studio / Remixes / Upload, BPM & Pitch Match feature (Sync BPM), remixt-free.vercel.app (Vercel deployment), Multitrack Stem Lanes (VOCALS/BEAT waveforms with Vol & Pitch sliders), Publish Remix Under Your Name, Remixt Brand (gradient R logo, pink-purple-cyan palette), Remixt Social Share Image (1920x1080), Studio Page Mockup (remixt-free.vercel.app/studio) (+4 more)

### Community 106 - "DeckWave.tsx"
Cohesion: 0.08
Nodes (30): BAND_COLOR, DRAW_ORDER, STEM_COLOR, WaveMode, ZOOMS, Phase, END_WARNING_SEC, fmtClock() (+22 more)

### Community 107 - "pitchTempo.ts"
Cohesion: 0.12
Nodes (13): signalsmith-stretch, soundtouchjs, feedAsRendered(), hasSound(), renderHq(), renderInWorker(), renderOnPage(), renderPitchTempo() (+5 more)

### Community 109 - "[id]/opengraph-image.tsx"
Cohesion: 0.24
Nodes (9): alt, contentType, Image(), size, alt, contentType, Image(), size (+1 more)

### Community 110 - "previewPlayer.ts"
Cohesion: 0.08
Nodes (28): formatTime(), PreviewBar(), cache, Kind, libraryStems(), MatchFinder(), add(), NOW_PLAYING_ARTWORK (+20 more)

### Community 113 - "demucs-web.d.ts"
Cohesion: 0.17
Nodes (7): Channels, demucs-web, demucs-web/constants, demucs-web/processor, DemucsProcessor, Progress, Spec

### Community 115 - "liveStudioDiff.ts"
Cohesion: 0.27
Nodes (6): describeMixChanges(), DiffLane, DiffMix, FX_WORDS, laneLabel(), same()

### Community 117 - "scripts"
Cohesion: 0.18
Nodes (11): scripts, build, dev, knip, lint, prebuild, predev, sg (+3 more)

### Community 118 - "live.test.ts"
Cohesion: 0.29
Nodes (8): chat(), Client, feed(), json(), ok(), remixOf(), signUp(), sql

### Community 119 - "Free on Vercel, with Neon and Vercel Blob"
Cohesion: 0.22
Nodes (9): 1. Put the code on GitHub, 2. Create the Vercel project, 3. Add the database (Neon), 4. Add stem storage (Vercel Blob), 5. Redeploy and finish, 6. Try it, Free on Vercel, with Neon and Vercel Blob, Optional (+1 more)

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
- **39 isolated node(s):** `Python separation service dependencies (FastAPI, demucs 4.0.1, librosa)`, `Google Search Console site verification file`, `Vazirmatn font (SIL Open Font License 1.1)`, `PATH`, `CONSTANTS` (+34 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1111 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `react` to `app/page.tsx`, `dj-realism.test.ts`, `liveReplay.ts`, `djMath.ts`, `AutomationLane.tsx`, `RemixtMark`, `AdminPanel.tsx`, `SongPicker.tsx`, `Studio.tsx`, `Arrangement.tsx`, `clipsOf`, `djEngine.ts`, `AiProducer.tsx`, `api/remixes/route.ts`, `camelotCode`, `demoSongs.ts`, `client/splitQueue.ts`, `MatchStep.tsx`, `aiExplain.ts`, `CoProducer.tsx`, `libraryTracks.ts`, `MixerConsole.tsx`, `coproducerTools.ts`, `StudioLibraryPanel.tsx`, `useStudioStore`, `StudioTransport.tsx`, `exportJob.ts`, `package.json`, `splitter.ts`, `VocalRecorder.tsx`, `MissionSession.tsx`, `djLibraryTracks.ts`, `UploadManager.tsx`, `SocialClipButton.tsx`, `collab.ts`, `localCache.ts`, `extras.tsx`, `InstallPrompt.tsx`, `NavBar.tsx`, `app/layout.tsx`, `remixes/[id]/page.tsx`, `LaneMatchPanel.tsx`, `studioStore.ts`, `SplitLaneDialog.tsx`, `getCurrentUser`, `ExamplesLab.tsx`, `Live.tsx`, `models.ts`, `uploads.ts`, `signup/page.tsx`, `DeckWave.tsx`, `previewPlayer.ts`?**
  _High betweenness centrality (0.132) - this node is a cross-community bridge._
- **What connects `Python separation service dependencies (FastAPI, demucs 4.0.1, librosa)`, `Google Search Console site verification file`, `Vazirmatn font (SIL Open Font License 1.1)` to the rest of the system?**
  _39 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `DjEngine` be split into smaller, more focused modules?**
  _Cohesion score 0.05786776652918385 - nodes in this community are weakly interconnected._
- **Why does `next` connect `next` to `app/page.tsx`, `lib/splitQueue.ts`, `storage.ts`, `RemixtMark`, `react`, `AdminPanel.tsx`, `SongPicker.tsx`, `Studio.tsx`, `challenges.ts`, `api/remixes/route.ts`, `camelotCode`, `client/splitQueue.ts`, `useStudioStore`, `appIcon`, `StudioTransport.tsx`, `package.json`, `VocalRecorder.tsx`, `MissionSession.tsx`, `auth.ts`, `djLibraryTracks.ts`, `UploadManager.tsx`, `aiKeys.ts`, `SocialClipButton.tsx`, `ai/chat/route.ts`, `NavBar.tsx`, `app/layout.tsx`, `ref_path`, `remixes/[id]/page.tsx`, `openrouter.ts`, `studioStore.ts`, `getCurrentUser`, `ExamplesLab.tsx`, `Live.tsx`, `models.ts`, `lib/presence.ts`, `neuralBeats.ts`, `signup/page.tsx`, `[id]/opengraph-image.tsx`?**
  _High betweenness centrality (0.096) - this node is a cross-community bridge._
- **Should `app/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.03823088455772114 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Remixt Brand Gradient (pink to violet to cyan)` and `Remixt Mark - Black Monochrome`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `Remixt Brand Gradient (pink to violet to cyan)` and `Remixt Mark - White Monochrome`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._