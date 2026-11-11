# Graph Report - code  (2026-11-11)

## Corpus Check
- 469 files · ~546,747 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 12 file(s) not represented in the graph (top: (none) 7, .ttf 2, .ico 2)

## Summary
- 4707 nodes · 14615 edges · 156 communities (139 shown, 17 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 206 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a02973c6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- DjEngine
- challenges.ts
- aiIdeas.ts
- aiTrial.ts
- getCurrentUser
- EasyDecks.tsx
- next
- dj-realism.test.ts
- storage.ts
- live.ts
- djMath.ts
- modulation.ts
- SocialClipButton.tsx
- react
- AdminPanel.tsx
- SongPicker.tsx
- studioHistory.ts
- clipCommands.ts
- .renderClip
- Arrangement.tsx
- musicKey.ts
- LyricsPanel.tsx
- social.ts
- demoSongsDsp.ts
- Lakebase Postgres
- analysis.ts
- clipEdit.ts
- AiProducer
- TagInput.tsx
- examplesLibrary.ts
- ensureLiveSchema
- laneName
- client/splitQueue.ts
- Neon
- MatchStep.tsx
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
- ensureSchema
- remixLanes.ts
- exportMeta.ts
- EasyStudio.tsx
- exportJob.ts
- package.json
- app.py
- uploads.ts
- splitter.ts
- VocalBooth.tsx
- listening.test.ts
- MissionSession.tsx
- projects.ts
- djLibraryTracks.ts
- UploadManager.tsx
- write/route.ts
- RemixStatsBar.tsx
- collab.ts
- localCache.ts
- scenarios.ts
- aiScope.ts
- lyricsStore.ts
- NavBar.tsx
- schema.sql
- clipsOf
- dependencies
- studioStore.ts
- autoMatch.ts
- test.mjs
- RemixComments.tsx
- djMidi.ts
- auth.ts
- LaneMatchPanel.tsx
- pairMatch.ts
- FakeContext
- compilerOptions
- aiKeys.ts
- SplitLaneDialog.tsx
- phone-export.test.ts
- split-queue.test.ts
- lyrics.ts
- splitHelper
- soundtouchjs.d.ts
- liveStudio.ts
- djTypes.ts
- app/page.tsx
- useStudioStore
- openrouter.ts
- rtlText.ts
- isConstrainedDevice
- uploads
- Remixt
- RemixCover.tsx
- devDependencies
- mixScore.ts
- neuralBeats.ts
- coverUrl
- Remixt Social Share Image (1920x1080)
- RemixtMark
- aiExplain.ts
- heavy-play.mjs
- shared-results.test.ts
- pitchTempo.ts
- stretch-memory.test.ts
- dj-engine.test.ts
- stemKinds.ts
- stemFetch.ts
- audioEngine
- demucs-web.d.ts
- audioGraph.ts
- liveStudioDiff.ts
- stretchWorkers.ts
- scripts
- StemAnalysis
- Free on Vercel, with Neon and Vercel Blob
- bleed.ts
- .getContext
- Sharing Remixt with someone else
- audioEngine.ts
- Free, all in one place: Oracle Cloud
- run.sh
- eslint.config.mjs
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
- remixes/[id]/page.tsx
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

## Communities (156 total, 17 thin omitted)

### Community 0 - "DjEngine"
Cohesion: 0.06
Nodes (11): DjConsole(), DemoStem, dbToGain(), quantizePos(), DeckUnit, DjEngine, clamp(), applyMidi() (+3 more)

### Community 1 - "challenges.ts"
Cohesion: 0.15
Nodes (21): GET(), POST(), schema, GET(), ChallengeDetail(), ChallengesPage(), metadata, timeLeft() (+13 more)

### Community 2 - "aiIdeas.ts"
Cohesion: 0.06
Nodes (83): activeShare(), adoptTiming(), ALL_FIXES, applyLevels(), applyMix(), arrange(), arrangementIdeas(), arrangeOnDrop() (+75 more)

### Community 3 - "aiTrial.ts"
Cohesion: 0.08
Nodes (65): putBackOn(), compatible(), findDrop(), fixesOf(), HandEdit, Idea, ideaFits(), mixFix() (+57 more)

### Community 4 - "getCurrentUser"
Cohesion: 0.05
Nodes (77): GET(), bodySchema, maxDuration, POST(), DELETE(), POST(), sessionOf(), POST() (+69 more)

### Community 5 - "EasyDecks.tsx"
Cohesion: 0.05
Nodes (73): BarCounter(), DeckPanel(), Pad(), PAD_JUMPS, PAD_MODE_LABEL, ROLLS, sign(), STEM_BUTTONS (+65 more)

### Community 6 - "next"
Cohesion: 0.06
Nodes (54): next, DELETE(), findJunk(), GET(), maxDuration, POST(), GET(), DELETE() (+46 more)

### Community 7 - "dj-realism.test.ts"
Cohesion: 0.06
Nodes (40): AUTO_GAIN_TARGET_DB, autoGainDb(), barBeat(), beatFraction(), beatIndex(), CLIP, DETENT, emptyHotCues() (+32 more)

### Community 8 - "storage.ts"
Cohesion: 0.07
Nodes (44): GET(), kept(), redirect(), DELETE(), GET(), keyFor(), DELETE(), GET() (+36 more)

### Community 9 - "live.ts"
Cohesion: 0.07
Nodes (41): GET(), GoLiveForm(), localInputValue(), RemixChoice, submit(), ReplayClock, useReplayClock(), cleanChat() (+33 more)

### Community 10 - "djMath.ts"
Cohesion: 0.06
Nodes (70): CamelotWheel(), CATEGORY_LABEL, Quiz(), RunnerView, wrap12(), deckName(), Hint, HintLevel (+62 more)

### Community 11 - "modulation.ts"
Cohesion: 0.14
Nodes (18): AutomationLane(), at(), commit(), handleDown(), handleMove(), remove(), formatValue(), PARAMS (+10 more)

### Community 12 - "SocialClipButton.tsx"
Cohesion: 0.17
Nodes (22): clipRange(), formatTime(), noSubscription(), SocialClipButton(), make(), barFill(), MARK_BAR_WIDTH, MARK_BARS (+14 more)

### Community 13 - "react"
Cohesion: 0.06
Nodes (63): lucide-react, react, three, api(), HostConsole(), chooseRemix(), endSession(), goLive() (+55 more)

### Community 14 - "AdminPanel.tsx"
Cohesion: 0.09
Nodes (43): Claim, Claimable Neon, If neon claim is missing, Path, With REST, With the CLI, AdminPage(), metadata (+35 more)

### Community 15 - "SongPicker.tsx"
Cohesion: 0.08
Nodes (38): Flags, INFO, Kind, LibrarySplit(), NO_FLAGS, Part, PARTS, PARTS_MUTED (+30 more)

### Community 16 - "studioHistory.ts"
Cohesion: 0.07
Nodes (48): metadata, StudioPage(), GoLiveStudioButton(), endExistingAndStart(), start(), formatAgo(), ModeChooser(), MODES (+40 more)

### Community 17 - "clipCommands.ts"
Cohesion: 0.13
Nodes (54): cutSilences(), gatePattern(), MAX_AUTOMATION_POINTS, pumpPattern(), spliceAutomation(), clearAutomation(), clearSelection(), clipFade() (+46 more)

### Community 18 - ".renderClip"
Cohesion: 0.09
Nodes (17): bytesOf(), Gate, renderKey(), RenderQueue, RenderSkipped, sliceBuffer(), used(), yieldToStandIns() (+9 more)

### Community 19 - "Arrangement.tsx"
Cohesion: 0.07
Nodes (61): react-dom, AiSection(), Arrangement(), onContentPointerDown(), onContentPointerUp(), snapDelta(), timeAt(), ClipFades() (+53 more)

### Community 20 - "musicKey.ts"
Cohesion: 0.11
Nodes (40): TrackLibrary(), FIT_WORDS, STATUS_COLOR, FIT, KeyHelper(), askAbout(), EditTab(), formatOffset() (+32 more)

### Community 21 - "LyricsPanel.tsx"
Cohesion: 0.14
Nodes (29): AiMode, AiTabView(), accept(), alignedSheets, BigPrompter(), EditTab(), FindTab(), FitBadge() (+21 more)

### Community 22 - "social.ts"
Cohesion: 0.08
Nodes (42): GET(), POST(), postSchema, visible(), DELETE(), handle(), POST(), LeaderboardPage() (+34 more)

### Community 23 - "demoSongsDsp.ts"
Cohesion: 0.05
Nodes (79): State, useDemoSong(), CHORD_INTERVALS, ChordDef, ChordQuality, CHORUS_CYCLE, DEMO_SONG_DEFS, DEMO_SONGS (+71 more)

### Community 24 - "Lakebase Postgres"
Cohesion: 0.04
Nodes (43): Full-Text Search with BM25 Ranking, Prepare and Index Text, Query and Interpret Scores, Set Parameters at Build Time or Per Query, Set the Candidate Limit, Use Prefilter Selectively, Adapt the Hybrid Search, Hybrid Search (+35 more)

### Community 25 - "analysis.ts"
Cohesion: 0.08
Nodes (49): activeLoudness(), ANALYSIS_RATE, analyzeAndKeep(), analyzeMono(), autocorrelation(), cache, chromagram(), correlation() (+41 more)

### Community 26 - "clipEdit.ts"
Cohesion: 0.14
Nodes (45): onContentPointerMove(), allClipRefs(), asWholeTake(), cleanClip(), ClipClipboard, clipId(), clipSpan(), concrete() (+37 more)

### Community 27 - "AiProducer"
Cohesion: 0.15
Nodes (40): AiProducer(), analyse(), applyOptions(), changeScope(), chooseSync(), chooseTiming(), chooseWhole(), close() (+32 more)

### Community 28 - "TagInput.tsx"
Cohesion: 0.21
Nodes (7): RemixOwnerControls(), TagInput(), add(), GENRE_TAGS, MAX_TAGS, MOOD_TAGS, normaliseTag()

### Community 29 - "examplesLibrary.ts"
Cohesion: 0.09
Nodes (44): ExamplesPage(), metadata, DEFAULT_PAIR, ExamplesLab(), STEPS, EXCERPT_BARS, LabSong, libraryLabSong() (+36 more)

### Community 30 - "ensureLiveSchema"
Cohesion: 0.07
Nodes (46): POST(), GET(), PUT(), POST(), schema, POST(), GET(), DELETE() (+38 more)

### Community 31 - "laneName"
Cohesion: 0.12
Nodes (34): Engines(), FineTune(), keepWhatsPlaying(), MasterIt(), TuneButton(), TuneRow(), tuneIdea(), BigSwitch() (+26 more)

### Community 32 - "client/splitQueue.ts"
Cohesion: 0.09
Nodes (39): ago(), duration(), HelperPanel(), jobDetail(), LastBlock(), noSubscription(), QueuedSongRow(), QueuedSongs() (+31 more)

### Community 33 - "Neon"
Cohesion: 0.05
Nodes (41): Data API external JWKS, Functions: verify the JWT, then authorize the user, Incompatibilities, Managed Better Auth, Trusted domains, 1. Install the Neon CLI, 2. Install the Neon MCP Server, 3. Install Neon Agent Skills (+33 more)

### Community 34 - "MatchStep.tsx"
Cohesion: 0.07
Nodes (46): AnalysisCard(), LEVEL_STYLE, pct(), Row(), Verdict(), BarGrid(), demoLabSong(), MatchStep() (+38 more)

### Community 35 - "AiProducer.tsx"
Cohesion: 0.04
Nodes (70): Icon(), IconName, ICONS, MEDAL_COLORS, Best, CheckActions, FixState, STATUS (+62 more)

### Community 36 - "mixdown.ts"
Cohesion: 0.19
Nodes (23): createMasterChain(), wavHeader(), bounceToFile(), encodeAudio(), encodeWav(), exportLane(), ExportOptions, ExportRange (+15 more)

### Community 37 - "audioTags.ts"
Cohesion: 0.21
Nodes (25): share(), asciiUrl(), audioFileName(), AudioTags, chunk(), comment(), concat(), creditLine() (+17 more)

### Community 38 - "directUpload.ts"
Cohesion: 0.11
Nodes (31): blobApi(), blobMultipart(), blobRequest(), BlobTarget, FinalUploadError, isFinalStatus(), isHidden(), libraryPut() (+23 more)

### Community 39 - "CoProducer.tsx"
Cohesion: 0.11
Nodes (39): CoProducer(), chooseModel(), chooseProvider(), forgetKey(), moveToAccount(), send(), defaultRouterModel(), KeySetup() (+31 more)

### Community 40 - "libraryTracks.ts"
Cohesion: 0.10
Nodes (32): decoder(), entries, fold(), held, hold(), keepOnly(), kept, load() (+24 more)

### Community 41 - "startNewStep"
Cohesion: 0.10
Nodes (35): isMastered(), MasterPanel(), masterPresetOf(), same(), Slider(), cache, Kind, libraryStems() (+27 more)

### Community 42 - "Remixt Brand Mark (split audio-waveform bars)"
Cohesion: 0.11
Nodes (33): File Icon (document glyph), Globe Icon, Next.js Wordmark Logo, Next.js Starter Template Assets, Remixt Brand Gradient (pink to violet to cyan), Remixt Brand Mark (split audio-waveform bars), Remixt Duotone Palette (pink top / cyan bottom bars), Apple Touch Icon (180px, gradient rounded-square, white bars) (+25 more)

### Community 43 - "quickHelp.ts"
Cohesion: 0.11
Nodes (17): Line, QuickHelp(), send(), SUGGESTIONS, availableFixes(), FixId, CoproducerContext, runCoproducerTool() (+9 more)

### Community 44 - "PartyWorld"
Cohesion: 0.09
Nodes (6): bubble(), canvasSprite(), emojiTexture(), nameLabel(), PartyWorld, roundRect()

### Community 45 - "ensureSchema"
Cohesion: 0.06
Nodes (58): zod, GET(), POST(), DELETE(), POST(), setLiked(), DELETE(), GET() (+50 more)

### Community 46 - "remixLanes.ts"
Cohesion: 0.09
Nodes (37): EmbedPage(), metadata, Clock(), EmbedPlayer(), formatTime(), formatTime(), MixWaveform(), RemixDetailPlayer() (+29 more)

### Community 47 - "exportMeta.ts"
Cohesion: 0.12
Nodes (21): GET(), SIZES, AppleIcon(), contentType, size, contentType, Icon(), size (+13 more)

### Community 48 - "EasyStudio.tsx"
Cohesion: 0.29
Nodes (12): AddButton(), EasyStudio(), Guide(), Step, allInStep(), IN_STEP, KeyRef, lineStatus (+4 more)

### Community 49 - "exportJob.ts"
Cohesion: 0.20
Nodes (21): ExportSheet(), save(), formatBytes(), formatDuration(), formatLeft(), noSubscription(), phoneKind(), ExportJobState (+13 more)

### Community 50 - "package.json"
Cohesion: 0.08
Nodes (23): @ast-grep/cli, aws4fetch, bcryptjs, demucs-web, jose, knip, onnxruntime-web, tailwindcss (+15 more)

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
Cohesion: 0.09
Nodes (38): ElapsedTime(), formatTime(), LiveMonitor(), overallSave(), PlayheadTime(), readPrefs(), RecordPrefs, RecordTab() (+30 more)

### Community 55 - "listening.test.ts"
Cohesion: 0.11
Nodes (28): aggregate(), BEAT_NET, cosTable, deduplicate(), fft(), hzToMel(), LEVELS, logMelSpectrogram() (+20 more)

### Community 56 - "MissionSession.tsx"
Cohesion: 0.04
Nodes (85): DjPage(), metadata, BeatMatchMeter(), FIT_TEXT, Gauge(), CopilotPanel(), ICON, DjApp() (+77 more)

### Community 57 - "projects.ts"
Cohesion: 0.15
Nodes (21): DELETE(), GET(), PUT(), putSchema, POST(), schema, GET(), POST() (+13 more)

### Community 58 - "djLibraryTracks.ts"
Cohesion: 0.06
Nodes (56): FIT_LABEL, SORTS, DEMO_STEMS, SectionName, peaksOf(), releaseDemoSong(), Phase, browse() (+48 more)

### Community 59 - "UploadManager.tsx"
Cohesion: 0.15
Nodes (19): QueueNotice(), nameList(), noSubscription(), skippedMessage(), SplitterInfo(), StatusBadge(), Stem, StemMiniRow() (+11 more)

### Community 60 - "write/route.ts"
Cohesion: 0.17
Nodes (26): maxDuration, POST(), PUT(), maxDuration, Mode, MODES, POST(), prompt() (+18 more)

### Community 61 - "RemixStatsBar.tsx"
Cohesion: 0.26
Nodes (8): qrcode, formatCount(), RemixStatsBar(), share(), ShareMenu(), RemixStats, embedCode(), shortPath()

### Community 62 - "collab.ts"
Cohesion: 0.14
Nodes (16): CollabBar(), SYNC_LABEL, CollabMember, CollabSession, connectCollab(), idle, joinSharedSession(), mergeShared() (+8 more)

### Community 63 - "localCache.ts"
Cohesion: 0.10
Nodes (29): metadata, StoragePage(), formatBytes(), KIND_TEXT, MODEL_TEXT, ModelKey, ModelUsage, StorageSettings() (+21 more)

### Community 64 - "scenarios.ts"
Cohesion: 0.11
Nodes (29): analysisSummary, rateToMatch(), TrackInfo, libraryApplies(), needsFor(), prepareLibraryMission(), adaptSetup(), describePick() (+21 more)

### Community 65 - "aiScope.ts"
Cohesion: 0.13
Nodes (24): zustand, AiScopeBar(), Drag, Pick, PICK_ICONS, Playhead(), KIND_ICON, pct() (+16 more)

### Community 66 - "lyricsStore.ts"
Cohesion: 0.22
Nodes (9): DEFAULT_PREFS, LyricSheet, LyricsPrefs, LyricsState, persist(), read(), write(), LyricLine (+1 more)

### Community 67 - "NavBar.tsx"
Cohesion: 0.10
Nodes (24): RootLayout(), InstallEvent, InstallPrompt(), dismiss(), install(), read(), write(), MobileTabBar() (+16 more)

### Community 68 - "schema.sql"
Cohesion: 0.11
Nodes (42): ai_shared_usage, challenges, follows, idx_comments_remix, idx_follows_followee, idx_lanes_remix, idx_live_events_stream, idx_live_streams_host (+34 more)

### Community 69 - "clipsOf"
Cohesion: 0.14
Nodes (30): Logs: CLI, Loki, and SDK pagination, Loki-compatible read API, LaneCard(), clock(), Part, partsOf(), Playhead(), SongMap() (+22 more)

### Community 70 - "dependencies"
Cohesion: 0.10
Nodes (21): dependencies, @anthropic-ai/sdk, aws4fetch, bcryptjs, demucs-web, jose, lucide-react, next (+13 more)

### Community 71 - "studioStore.ts"
Cohesion: 0.08
Nodes (29): FxSlider(), hz(), LaneFxPanel(), pct(), PAD_KEYS, GROUPS, handleKey(), isTyping() (+21 more)

### Community 72 - "autoMatch.ts"
Cohesion: 0.16
Nodes (19): PRE_ROLL, TAIL, ALL_STEPS, analyzeBeatLane(), analyzeGuide(), analyzeLane(), beatsAttempted, buildPlan() (+11 more)

### Community 73 - "test.mjs"
Cohesion: 0.07
Nodes (20): postgres, buildId(), nextConfig(), tunnelHost, root, assets, root, target (+12 more)

### Community 74 - "RemixComments.tsx"
Cohesion: 0.29
Nodes (6): ago(), AtPlayhead(), formatAt(), RemixComments(), ReportButton(), RemixComment

### Community 75 - "djMidi.ts"
Cohesion: 0.19
Nodes (14): MidiPanel(), controlKey(), learn(), loadMidiMap(), MIDI_ACTIONS, MidiAction, MidiLink, MidiMap (+6 more)

### Community 76 - "auth.ts"
Cohesion: 0.18
Nodes (12): POST(), schema, POST(), POST(), schema, clearSessionCookie(), createSessionCookie(), hashPassword() (+4 more)

### Community 77 - "LaneMatchPanel.tsx"
Cohesion: 0.16
Nodes (18): Baseline, Choice(), LaneMatchPanel(), handleApply(), handleUndo(), snapshot(), untouchedSince(), DEFAULT_OPTIONS (+10 more)

### Community 78 - "pairMatch.ts"
Cohesion: 0.09
Nodes (44): Phrase, argmax(), Arrangement, arrangeVocal(), beatStructure, downbeatScores(), gridCache, HeardVocal (+36 more)

### Community 80 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+11 more)

### Community 81 - "aiKeys.ts"
Cohesion: 0.14
Nodes (22): DELETE(), GET(), PATCH(), patchSchema, putSchema, AI_PROVIDERS, aiKeyStatuses(), AiProvider (+14 more)

### Community 82 - "SplitLaneDialog.tsx"
Cohesion: 0.16
Nodes (22): SplitLaneDialog(), finish(), start(), cache, findParts(), placeStems(), siblingStems(), swapInParts() (+14 more)

### Community 83 - "phone-export.test.ts"
Cohesion: 0.14
Nodes (16): Bounce, openMp3Stream(), PcmSink, handleStream(), Mp3Response, Mp3StreamMessage, Mp3StreamReply, queue (+8 more)

### Community 84 - "split-queue.test.ts"
Cohesion: 0.18
Nodes (16): Function Triggers (CLI, MCP, REST), body(), claim(), claimJob(), Client, deliverStems(), downloadSource(), expectStatus() (+8 more)

### Community 85 - "lyrics.ts"
Cohesion: 0.18
Nodes (19): LrclibResult, FitTools(), barAt(), beatSeconds(), clearTimes(), COMFORT, countSyllables(), fitOf() (+11 more)

### Community 86 - "splitHelper"
Cohesion: 0.19
Nodes (8): ifNoOtherTabHelping(), LostJob, splitHelper, done(), stageName(), stageProgress(), tabSession(), splitTrackPayload()

### Community 87 - "soundtouchjs.d.ts"
Cohesion: 0.11
Nodes (5): FifoSampleBuffer, SimpleFilter, SoundTouch, soundtouchjs, WebAudioBufferSource

### Community 88 - "liveStudio.ts"
Cohesion: 0.22
Nodes (13): applyLiveMix(), isMix(), mixFields(), mixOf(), startStudioBroadcast(), scheduleMix(), scheduleState(), sendMix() (+5 more)

### Community 89 - "djTypes.ts"
Cohesion: 0.09
Nodes (25): AutoMixPanel(), viewOf(), AUTO_MIX_STEPS, AutoMix, AutoMixEngine, AutoMixPhase, BLEND_BEATS, PHRASE_BEATS (+17 more)

### Community 90 - "app/page.tsx"
Cohesion: 0.07
Nodes (51): GET(), POST(), barsFor(), FAQ, Feature(), Home(), metadata, NO_NUMBERS (+43 more)

### Community 91 - "useStudioStore"
Cohesion: 0.09
Nodes (42): Playhead(), ago(), Entry(), HistoryList(), useCurrent(), formatBars(), formatTime(), KeyControl() (+34 more)

### Community 92 - "openrouter.ts"
Cohesion: 0.16
Nodes (18): @anthropic-ai/sdk, GET(), AI_MODELS, Block, Completion, fromOpenAi(), headers(), OpenAiMessage (+10 more)

### Community 93 - "rtlText.ts"
Cohesion: 0.22
Nodes (11): CardText(), BidiRun, bidiRuns(), FORMS, hasRtl(), joinLetters(), joins(), joinsForward() (+3 more)

### Community 94 - "isConstrainedDevice"
Cohesion: 0.18
Nodes (6): deviceGb(), isConstrainedDevice(), decode(), fetchSongFromLink(), splitSong(), splitter

### Community 95 - "uploads"
Cohesion: 0.20
Nodes (3): uploads, keepScreenOn(), sync()

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
Cohesion: 0.09
Nodes (39): checkMix(), chooseShift(), harmonyOf(), keyStretch(), playedLoudness(), recordingOf(), sameSong(), share() (+31 more)

### Community 100 - "neuralBeats.ts"
Cohesion: 0.12
Nodes (28): beatModelEnabled(), BeatModelState, beatModelSupported(), diskKey(), keep(), keptBeats(), legacyResult(), neuralBeats() (+20 more)

### Community 101 - "coverUrl"
Cohesion: 0.14
Nodes (14): dynamic, LiveSessionPage(), dynamic, LivePage(), metadata, AutoRefresh(), LiveCard(), when() (+6 more)

### Community 102 - "Remixt Social Share Image (1920x1080)"
Cohesion: 0.23
Nodes (12): App Navigation: Library / Studio / Remixes / Upload, BPM & Pitch Match feature (Sync BPM), remixt-free.vercel.app (Vercel deployment), Multitrack Stem Lanes (VOCALS/BEAT waveforms with Vol & Pitch sliders), Publish Remix Under Your Name, Remixt Brand (gradient R logo, pink-purple-cyan palette), Remixt Social Share Image (1920x1080), Studio Page Mockup (remixt-free.vercel.app/studio) (+4 more)

### Community 103 - "RemixtMark"
Cohesion: 0.21
Nodes (8): Error(), Field(), LoginPage(), metadata, NotFound(), Field(), SignupPage(), RemixtMark()

### Community 104 - "aiExplain.ts"
Cohesion: 0.18
Nodes (16): Change, clock(), cutWords(), endOf(), entryOf(), fxChanges(), laneChanges(), LaneDiff (+8 more)

### Community 105 - "heavy-play.mjs"
Cohesion: 0.15
Nodes (10): playwright-core, args, errors, play, restore, samples, songs, sounding (+2 more)

### Community 106 - "shared-results.test.ts"
Cohesion: 0.18
Nodes (7): share(), put(), sql, url(), resolve(), src, withExtension()

### Community 107 - "pitchTempo.ts"
Cohesion: 0.21
Nodes (13): signalsmith-stretch, soundtouchjs, feedAsRendered(), hasSound(), renderHq(), renderInWorker(), renderOnPage(), renderPitchTempo() (+5 more)

### Community 108 - "stretch-memory.test.ts"
Cohesion: 0.11
Nodes (11): files, from, root, stretch, stretchFrom, stretchTo, to, fixStretchWorklet() (+3 more)

### Community 109 - "dj-engine.test.ts"
Cohesion: 0.12
Nodes (10): AiDj, DJ_TRACKS, djTrackInfo(), trackInfoFromMeta(), LoadedTrack, MISSIONS, FakeParam, setup() (+2 more)

### Community 110 - "stemKinds.ts"
Cohesion: 0.07
Nodes (40): GET(), formatDuration(), LibraryBrowser(), StemWithTrack, TabButton(), formatTime(), PreviewBar(), add() (+32 more)

### Community 111 - "stemFetch.ts"
Cohesion: 0.21
Nodes (7): fetchInSlices(), fetchRange(), fetchWhole(), download(), FILE, Handler, server

### Community 112 - "audioEngine"
Cohesion: 0.14
Nodes (6): audioEngine, clipKey(), queueModulation(), ClipBufferLookup, LaneWindow, StudioLane

### Community 113 - "demucs-web.d.ts"
Cohesion: 0.17
Nodes (7): Channels, demucs-web, demucs-web/constants, demucs-web/processor, DemucsProcessor, Progress, Spec

### Community 114 - "audioGraph.ts"
Cohesion: 0.09
Nodes (26): clipEnvelope(), createLaneChain(), routeCompressor(), routeDrive(), routeReverb(), update(), update(), curveCache (+18 more)

### Community 115 - "liveStudioDiff.ts"
Cohesion: 0.27
Nodes (6): describeMixChanges(), DiffLane, DiffMix, FX_WORDS, laneLabel(), same()

### Community 116 - "stretchWorkers.ts"
Cohesion: 0.11
Nodes (26): askMore(), haveInput(), Job, jobs, load(), readInput(), run(), StretchFromWorker (+18 more)

### Community 117 - "scripts"
Cohesion: 0.18
Nodes (11): scripts, build, dev, knip, lint, prebuild, predev, sg (+3 more)

### Community 118 - "StemAnalysis"
Cohesion: 0.25
Nodes (5): onsetAt(), StemAnalysis, trackBeats(), BeatGrid, neuralGrid()

### Community 119 - "Free on Vercel, with Neon and Vercel Blob"
Cohesion: 0.22
Nodes (9): 1. Put the code on GitHub, 2. Create the Vercel project, 3. Add the database (Neon), 4. Add stem storage (Vercel Blob), 5. Redeploy and finish, 6. Try it, Free on Vercel, with Neon and Vercel Blob, Optional (+1 more)

### Community 120 - "bleed.ts"
Cohesion: 0.50
Nodes (6): bleedScore(), bleedWithLag(), checkTake(), correlation(), highFrequencyEnergy(), TakeCheck

### Community 121 - ".getContext"
Cohesion: 0.19
Nodes (3): reportMixNowPlaying(), stopSources(), Pad

### Community 122 - "Sharing Remixt with someone else"
Cohesion: 0.25
Nodes (7): `./share.sh cloudflared` — your Cloudflare tunnel, `./share.sh ngrok` — ngrok, `./share.sh` — serveo (default), Sharing Remixt with someone else, The three providers, Things worth knowing before you send the link, Why not Cloudflare's quick tunnel

### Community 123 - "audioEngine.ts"
Cohesion: 0.09
Nodes (21): DecodedStem, decodeGate, lastUsed, LoadedLane, PHONE, PlaybackBlockedError, QueuedRender, queueReschedule() (+13 more)

### Community 124 - "Free, all in one place: Oracle Cloud"
Cohesion: 0.29
Nodes (7): 1. Create the account, 2. Create the server, 3. Open ports 80 and 443, 4. Get a free domain name, 5. Install Docker and start Remixt, 6. Keep it running, Free, all in one place: Oracle Cloud

### Community 125 - "run.sh"
Cohesion: 0.29
Nodes (3): PATH, run.sh script, share.sh script

### Community 126 - "eslint.config.mjs"
Cohesion: 0.50
Nodes (3): eslint, eslint-config-next, eslintConfig

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
Cohesion: 0.07
Nodes (16): intentsOf(), normalise(), ctx, StudioLane, Snapshot, StudioLane, chat(), Client (+8 more)

### Community 158 - "mediaSession.ts"
Cohesion: 0.21
Nodes (12): NOW_PLAYING_ARTWORK, apply(), artworkFor(), getPlayingRemix(), lastPosition, mediaSession(), NowPlaying, Owner (+4 more)

### Community 168 - "remixes/[id]/page.tsx"
Cohesion: 0.07
Nodes (34): ArtistPage(), ArtistRow, generateMetadata(), geistMono, geistSans, metadata, viewport, metadata (+26 more)

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
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1196 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `react` to `challenges.ts`, `EasyDecks.tsx`, `live.ts`, `djMath.ts`, `modulation.ts`, `SocialClipButton.tsx`, `AdminPanel.tsx`, `SongPicker.tsx`, `studioHistory.ts`, `Arrangement.tsx`, `musicKey.ts`, `LyricsPanel.tsx`, `demoSongsDsp.ts`, `TagInput.tsx`, `examplesLibrary.ts`, `laneName`, `client/splitQueue.ts`, `MatchStep.tsx`, `AiProducer.tsx`, `CoProducer.tsx`, `remixes/[id]/page.tsx`, `libraryTracks.ts`, `startNewStep`, `quickHelp.ts`, `ensureSchema`, `remixLanes.ts`, `EasyStudio.tsx`, `exportJob.ts`, `package.json`, `uploads.ts`, `splitter.ts`, `VocalBooth.tsx`, `MissionSession.tsx`, `djLibraryTracks.ts`, `UploadManager.tsx`, `RemixStatsBar.tsx`, `collab.ts`, `localCache.ts`, `aiScope.ts`, `NavBar.tsx`, `clipsOf`, `studioStore.ts`, `RemixComments.tsx`, `djMidi.ts`, `LaneMatchPanel.tsx`, `SplitLaneDialog.tsx`, `app/page.tsx`, `useStudioStore`, `RemixCover.tsx`, `coverUrl`, `RemixtMark`, `stemKinds.ts`?**
  _High betweenness centrality (0.139) - this node is a cross-community bridge._
- **What connects `Python separation service dependencies (FastAPI, demucs 4.0.1, librosa)`, `Google Search Console site verification file`, `Vazirmatn font (SIL Open Font License 1.1)` to the rest of the system?**
  _39 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `DjEngine` be split into smaller, more focused modules?**
  _Cohesion score 0.057960644007155636 - nodes in this community are weakly interconnected._
- **Why does `next` connect `next` to `challenges.ts`, `getCurrentUser`, `storage.ts`, `live.ts`, `djMath.ts`, `react`, `AdminPanel.tsx`, `SongPicker.tsx`, `studioHistory.ts`, `social.ts`, `TagInput.tsx`, `examplesLibrary.ts`, `ensureLiveSchema`, `client/splitQueue.ts`, `remixes/[id]/page.tsx`, `ensureSchema`, `remixLanes.ts`, `exportMeta.ts`, `package.json`, `uploads.ts`, `VocalBooth.tsx`, `MissionSession.tsx`, `projects.ts`, `djLibraryTracks.ts`, `UploadManager.tsx`, `write/route.ts`, `RemixStatsBar.tsx`, `NavBar.tsx`, `test.mjs`, `RemixComments.tsx`, `auth.ts`, `aiKeys.ts`, `lyrics.ts`, `app/page.tsx`, `useStudioStore`, `openrouter.ts`, `RemixCover.tsx`, `coverUrl`, `RemixtMark`, `stemKinds.ts`?**
  _High betweenness centrality (0.119) - this node is a cross-community bridge._
- **Should `aiIdeas.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06241234221598878 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Remixt Brand Gradient (pink to violet to cyan)` and `Remixt Mark - Black Monochrome`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `Remixt Brand Gradient (pink to violet to cyan)` and `Remixt Mark - White Monochrome`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._