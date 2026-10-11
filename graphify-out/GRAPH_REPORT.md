# Graph Report - code  (2026-10-11)

## Corpus Check
- 450 files · ~514,048 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 12 file(s) not represented in the graph (top: (none) 7, .ttf 2, .ico 2)

## Summary
- 4430 nodes · 13861 edges · 147 communities (129 shown, 18 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 190 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8ba0e26a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- DjEngine
- app/page.tsx
- aiIdeas.ts
- curriculum.ts
- lib/splitQueue.ts
- studioStore.ts
- next
- dj-realism.test.ts
- storage.ts
- live.ts
- djMath.ts
- modulation.ts
- RemixtMark
- react
- AdminPanel.tsx
- SongPicker.tsx
- Studio.tsx
- clipCommands.ts
- audioEngine.ts
- Arrangement.tsx
- clipsOf
- aiTrial.ts
- mixScore.ts
- demoSongsDsp.ts
- Lakebase Postgres
- analysis.ts
- EasyDecks.tsx
- AiProducer
- notifications.ts
- examplesLibrary.ts
- clipEdit.ts
- demoSongs.ts
- SplitQueue.tsx
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
- stemKinds.ts
- remixLanes.ts
- models.ts
- StudioTransport.tsx
- exportJob.ts
- package.json
- app.py
- ref_node_fs
- splitter.ts
- previewPlayer.ts
- listening.test.ts
- MissionSession.tsx
- projects.ts
- djLibraryTracks.ts
- UploadManager.tsx
- aiKeys.ts
- exportMeta.ts
- collab.ts
- libraryAudio.ts
- extras.tsx
- aiExplain.ts
- ai/chat/route.ts
- NavBar.tsx
- schema.sql
- app/layout.tsx
- dependencies
- stretch-memory.test.ts
- autoMatch.ts
- ref_path
- RemixComments.tsx
- openrouter.ts
- djMidi.ts
- pairMatch.ts
- arrange.ts
- FakeContext
- compilerOptions
- LaneInspector.tsx
- SplitLaneDialog.tsx
- mp3.ts
- SocialClipButton.tsx
- getCurrentUser
- client/splitQueue.ts
- soundtouchjs.d.ts
- ExamplesLab.tsx
- djTypes.ts
- Live.tsx
- musicKey.ts
- test.mjs
- rtlText.ts
- zod
- uploads.ts
- Remixt
- partyWorld.ts
- devDependencies
- lib/presence.ts
- neuralBeats.ts
- stemFetch.ts
- Remixt Social Share Image (1920x1080)
- TagInput.tsx
- EasyStudio.tsx
- client/presence.ts
- djWaveform.ts
- pitchTempo.ts
- auth.ts
- Image
- mediaSession.ts
- FakeParam
- previewPlayer
- demucs-web.d.ts
- liveStudioDiff.ts
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
1. `next` - 139 edges
2. `sql` - 139 edges
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

## Communities (147 total, 18 thin omitted)

### Community 0 - "DjEngine"
Cohesion: 0.06
Nodes (10): dbToGain(), emptyHotCues(), quantizePos(), DeckUnit, DjEngine, clamp(), applyMidi(), DeckId (+2 more)

### Community 1 - "app/page.tsx"
Cohesion: 0.04
Nodes (88): ArtistPage(), ArtistRow, generateMetadata(), ChallengeDetail(), ChallengesPage(), metadata, timeLeft(), LeaderboardPage() (+80 more)

### Community 2 - "aiIdeas.ts"
Cohesion: 0.05
Nodes (88): tuneIdea(), Aspect, Vibe, activeShare(), adoptTiming(), ALL_FIXES, applyLevels(), applyMix() (+80 more)

### Community 3 - "curriculum.ts"
Cohesion: 0.06
Nodes (42): BeatMatchMeter(), FIT_TEXT, Gauge(), DemoStem, countTracks(), deckEnergy(), DRILLS, LESSONS (+34 more)

### Community 4 - "lib/splitQueue.ts"
Cohesion: 0.07
Nodes (61): DELETE(), POST(), sessionOf(), POST(), bodySchema, POST(), bodySchema, POST() (+53 more)

### Community 5 - "studioStore.ts"
Cohesion: 0.06
Nodes (49): react-dom, zustand, formatTime(), MixWaveform(), RemixDetailPlayer(), ContextMenuHost(), isSheet(), MenuItem (+41 more)

### Community 6 - "next"
Cohesion: 0.06
Nodes (62): next, DELETE(), GET(), POST(), schema, findJunk(), GET(), maxDuration (+54 more)

### Community 7 - "dj-realism.test.ts"
Cohesion: 0.04
Nodes (67): AiDj, barOf(), startOffsetOnPhrase(), AUTO_GAIN_TARGET_DB, autoGainDb(), beatFraction(), beatIndex(), CLIP (+59 more)

### Community 8 - "storage.ts"
Cohesion: 0.07
Nodes (46): GET(), kept(), redirect(), DELETE(), GET(), keyFor(), bodySchema, maxDuration (+38 more)

### Community 9 - "live.ts"
Cohesion: 0.06
Nodes (44): PUT(), GoLiveForm(), localInputValue(), RemixChoice, Avatar(), LiveChat(), submit(), Message() (+36 more)

### Community 10 - "djMath.ts"
Cohesion: 0.08
Nodes (61): deckName(), Hint, HintLevel, liveHints(), CrowdRequest, crowdScore(), CrowdState, ECHO_KEYS (+53 more)

### Community 11 - "modulation.ts"
Cohesion: 0.14
Nodes (18): AutomationLane(), at(), commit(), handleDown(), handleMove(), remove(), formatValue(), PARAMS (+10 more)

### Community 12 - "RemixtMark"
Cohesion: 0.09
Nodes (25): GET(), SIZES, AppleIcon(), contentType, size, Error(), contentType, Icon() (+17 more)

### Community 13 - "react"
Cohesion: 0.08
Nodes (54): lucide-react, react, dynamic, LiveSessionPage(), api(), HostConsole(), chooseRemix(), endSession() (+46 more)

### Community 14 - "AdminPanel.tsx"
Cohesion: 0.06
Nodes (59): Claim, Claimable Neon, If neon claim is missing, Path, With REST, With the CLI, Function Triggers (CLI, MCP, REST), AdminPage() (+51 more)

### Community 15 - "SongPicker.tsx"
Cohesion: 0.08
Nodes (37): Flags, INFO, Kind, LibrarySplit(), NO_FLAGS, Part, PARTS, PARTS_MUTED (+29 more)

### Community 16 - "Studio.tsx"
Cohesion: 0.08
Nodes (44): formatAgo(), ModeChooser(), MODES, ModeSwitch(), Studio(), leaveTogether(), restoreDraft(), startTogether() (+36 more)

### Community 17 - "clipCommands.ts"
Cohesion: 0.13
Nodes (53): cutSilences(), gatePattern(), MAX_AUTOMATION_POINTS, pumpPattern(), spliceAutomation(), clearAutomation(), clearSelection(), clipFade() (+45 more)

### Community 18 - "audioEngine.ts"
Cohesion: 0.06
Nodes (32): audioEngine, bytesOf(), clipKey(), DecodedStem, lastUsed, LoadedLane, PHONE, PlaybackBlockedError (+24 more)

### Community 19 - "Arrangement.tsx"
Cohesion: 0.08
Nodes (57): AiSection(), Arrangement(), onContentPointerDown(), onContentPointerMove(), onContentPointerUp(), snapDelta(), timeAt(), ClipFades() (+49 more)

### Community 20 - "clipsOf"
Cohesion: 0.10
Nodes (42): Logs: CLI, Loki, and SDK pagination, Loki-compatible read API, Playhead(), LaneCard(), AiScopeBar(), Drag, Pick, PICK_ICONS (+34 more)

### Community 21 - "aiTrial.ts"
Cohesion: 0.07
Nodes (58): findDrop(), fixGroups(), HandEdit, mixSignature(), prepareSession(), rebaseSession(), timingSignature(), applyScope() (+50 more)

### Community 22 - "mixScore.ts"
Cohesion: 0.08
Nodes (38): FIT_WORDS, STATUS_COLOR, chooseShift(), harmonyOf(), ideaFits(), keyStretch(), playedLoudness(), recordingOf() (+30 more)

### Community 23 - "demoSongsDsp.ts"
Cohesion: 0.05
Nodes (63): CHORD_INTERVALS, ChordDef, ChordQuality, CHORUS_CYCLE, DEMO_SONG_DEFS, DEMO_SONGS, songBars(), songMeta() (+55 more)

### Community 24 - "Lakebase Postgres"
Cohesion: 0.04
Nodes (43): Full-Text Search with BM25 Ranking, Prepare and Index Text, Query and Interpret Scores, Set Parameters at Build Time or Per Query, Set the Candidate Limit, Use Prefilter Selectively, Adapt the Hybrid Search, Hybrid Search (+35 more)

### Community 25 - "analysis.ts"
Cohesion: 0.07
Nodes (51): activeLoudness(), ANALYSIS_RATE, analyzeAndKeep(), analyzeMono(), analyzeStem(), autocorrelation(), cache, chromagram() (+43 more)

### Community 26 - "EasyDecks.tsx"
Cohesion: 0.04
Nodes (87): BarCounter(), DeckPanel(), Pad(), PAD_JUMPS, PAD_MODE_LABEL, ROLLS, sign(), STEM_BUTTONS (+79 more)

### Community 27 - "AiProducer"
Cohesion: 0.14
Nodes (47): AiProducer(), analyse(), applyOptions(), changeScope(), chooseSync(), chooseTiming(), chooseWhole(), close() (+39 more)

### Community 28 - "notifications.ts"
Cohesion: 0.12
Nodes (27): GET(), POST(), DELETE(), GET(), POST(), postSchema, visible(), DELETE() (+19 more)

### Community 29 - "examplesLibrary.ts"
Cohesion: 0.11
Nodes (32): demoLabSong(), EXCERPT_BARS, LabSong, libraryLabSong(), LoadedTrack, Found, LibraryRecipes(), PRESET_PAIRS (+24 more)

### Community 30 - "clipEdit.ts"
Cohesion: 0.14
Nodes (47): allClipRefs(), asWholeTake(), cleanClip(), ClipClipboard, clipId(), clipSpan(), concrete(), concreteIds() (+39 more)

### Community 31 - "demoSongs.ts"
Cohesion: 0.11
Nodes (27): useSide(), State, useDemoSong(), DEMO_STEMS, demoSongDef, demoSongMeta, cache, DemoPeakKey (+19 more)

### Community 32 - "SplitQueue.tsx"
Cohesion: 0.11
Nodes (35): ago(), duration(), HelperPanel(), jobDetail(), LastBlock(), noSubscription(), ProgressBar(), QueuedSongRow() (+27 more)

### Community 33 - "Neon"
Cohesion: 0.05
Nodes (41): Data API external JWKS, Functions: verify the JWT, then authorize the user, Incompatibilities, Managed Better Auth, Trusted domains, 1. Install the Neon CLI, 2. Install the Neon MCP Server, 3. Install Neon Agent Skills (+33 more)

### Community 34 - "MatchStep.tsx"
Cohesion: 0.08
Nodes (43): AnalysisCard(), LEVEL_STYLE, pct(), Row(), Verdict(), BarGrid(), MatchStep(), prepare() (+35 more)

### Community 35 - "AiProducer.tsx"
Cohesion: 0.05
Nodes (68): Icon(), IconName, ICONS, MEDAL_COLORS, Best, CheckActions, FixState, STATUS (+60 more)

### Community 36 - "mixdown.ts"
Cohesion: 0.08
Nodes (43): ClipBufferLookup, clipEnvelope(), createLaneChain(), update(), createMasterChain(), update(), curveCache, driveCurve() (+35 more)

### Community 37 - "audioTags.ts"
Cohesion: 0.21
Nodes (25): share(), asciiUrl(), audioFileName(), AudioTags, chunk(), comment(), concat(), creditLine() (+17 more)

### Community 38 - "directUpload.ts"
Cohesion: 0.10
Nodes (33): blobApi(), blobMultipart(), blobRequest(), BlobTarget, FinalUploadError, isFinalStatus(), isHidden(), libraryPut() (+25 more)

### Community 39 - "CoProducer.tsx"
Cohesion: 0.12
Nodes (35): @anthropic-ai/sdk, CoProducer(), chooseModel(), chooseProvider(), forgetKey(), send(), defaultRouterModel(), KeySetup() (+27 more)

### Community 40 - "libraryTracks.ts"
Cohesion: 0.12
Nodes (26): decoder(), entries, fold(), held, hold(), kept, load(), loadParts() (+18 more)

### Community 41 - "startNewStep"
Cohesion: 0.12
Nodes (28): cache, Kind, libraryStems(), MatchFinder(), add(), buffers, bypassed, ChannelStrip (+20 more)

### Community 42 - "Remixt Brand Mark (split audio-waveform bars)"
Cohesion: 0.11
Nodes (33): File Icon (document glyph), Globe Icon, Next.js Wordmark Logo, Next.js Starter Template Assets, Remixt Brand Gradient (pink to violet to cyan), Remixt Brand Mark (split audio-waveform bars), Remixt Duotone Palette (pink top / cyan bottom bars), Apple Touch Icon (180px, gradient rounded-square, white bars) (+25 more)

### Community 43 - "quickHelp.ts"
Cohesion: 0.11
Nodes (19): Line, QuickHelp(), send(), SUGGESTIONS, availableFixes(), FixId, Idea, CoproducerContext (+11 more)

### Community 45 - "stemKinds.ts"
Cohesion: 0.09
Nodes (34): GET(), ChallengeStemCard(), formatDuration(), LibraryBrowser(), StemWithTrack, TabButton(), formatTime(), PreviewBar() (+26 more)

### Community 46 - "remixLanes.ts"
Cohesion: 0.08
Nodes (37): Clock(), EmbedPlayer(), formatTime(), load(), applyLiveMix(), isMix(), mixFields(), mixOf() (+29 more)

### Community 47 - "models.ts"
Cohesion: 0.12
Nodes (22): DELETE(), GET(), imageExtension(), PUT(), remixRow(), Row, DELETE(), POST() (+14 more)

### Community 48 - "StudioTransport.tsx"
Cohesion: 0.24
Nodes (15): formatBars(), formatTime(), KeyControl(), LcdLabel(), MobileSeek(), Popover(), StudioTransport(), handleSave() (+7 more)

### Community 49 - "exportJob.ts"
Cohesion: 0.14
Nodes (25): ExportSheet(), save(), formatBytes(), formatDuration(), formatLeft(), noSubscription(), phoneKind(), ExportJobState (+17 more)

### Community 50 - "package.json"
Cohesion: 0.09
Nodes (22): @ast-grep/cli, aws4fetch, bcryptjs, jose, knip, onnxruntime-web, qrcode, tailwindcss (+14 more)

### Community 51 - "app.py"
Cohesion: 0.12
Nodes (6): compute_peaks(), detect_bpm(), health(), load_and_encode(), separate(), SeparateRequest

### Community 52 - "ref_node_fs"
Cohesion: 0.40
Nodes (3): resolve(), src, withExtension()

### Community 53 - "splitter.ts"
Cohesion: 0.09
Nodes (25): demucs-web, wasm-media-encoders, decode(), fetchSongFromLink(), Job, MODEL_URL, splitSong(), splitter (+17 more)

### Community 54 - "previewPlayer.ts"
Cohesion: 0.12
Nodes (25): formatTime(), LevelMeter(), VocalRecorder(), begin(), keep(), listen(), stopPreview(), Listener (+17 more)

### Community 55 - "listening.test.ts"
Cohesion: 0.12
Nodes (26): aggregate(), BEAT_NET, cosTable, deduplicate(), fft(), hzToMel(), LEVELS, logMelSpectrogram() (+18 more)

### Community 56 - "MissionSession.tsx"
Cohesion: 0.05
Nodes (66): DjPage(), metadata, CopilotPanel(), ICON, DjApp(), Mode, OpenDecks(), View (+58 more)

### Community 57 - "projects.ts"
Cohesion: 0.15
Nodes (21): DELETE(), GET(), PUT(), putSchema, POST(), schema, GET(), POST() (+13 more)

### Community 58 - "djLibraryTracks.ts"
Cohesion: 0.12
Nodes (30): SectionName, BrowserQuery, downbeatOffset(), entryFromTrack(), Fit, gridPhase(), isLibraryId(), LIBRARY_PREFIX (+22 more)

### Community 59 - "UploadManager.tsx"
Cohesion: 0.15
Nodes (19): QueueNotice(), nameList(), noSubscription(), skippedMessage(), SplitterInfo(), StatusBadge(), Stem, StemMiniRow() (+11 more)

### Community 60 - "aiKeys.ts"
Cohesion: 0.17
Nodes (22): check(), DELETE(), PATCH(), patchSchema, PUT(), putSchema, AI_MODELS, AI_PROVIDERS (+14 more)

### Community 61 - "exportMeta.ts"
Cohesion: 0.16
Nodes (17): formatCount(), RemixStatsBar(), share(), ShareMenu(), id3Key(), TrackCredit, Cover, drawCover() (+9 more)

### Community 62 - "collab.ts"
Cohesion: 0.16
Nodes (14): CollabBar(), SYNC_LABEL, CollabMember, CollabSession, connectCollab(), idle, mergeShared(), normalise() (+6 more)

### Community 63 - "libraryAudio.ts"
Cohesion: 0.08
Nodes (34): metadata, StoragePage(), formatBytes(), KIND_TEXT, MODEL_TEXT, ModelKey, ModelUsage, StorageSettings() (+26 more)

### Community 64 - "extras.tsx"
Cohesion: 0.21
Nodes (21): Engines(), FineTune(), keepWhatsPlaying(), MasterIt(), TuneButton(), TuneRow(), masterFor(), setBeatModelEnabled() (+13 more)

### Community 65 - "aiExplain.ts"
Cohesion: 0.21
Nodes (15): Change, clock(), cutWords(), diffMix(), endOf(), entryOf(), fxChanges(), laneChanges() (+7 more)

### Community 66 - "ai/chat/route.ts"
Cohesion: 0.19
Nodes (19): maxDuration, POST(), GET(), AiModel, DEFAULT_AI_MODEL, isAiModel(), isModelFor(), isOpenRouterModel() (+11 more)

### Community 67 - "NavBar.tsx"
Cohesion: 0.17
Nodes (15): MobileTabBar(), Tab(), AccountMenu(), MoreLinks(), NavBar(), ICONS, isActive(), MORE_LINKS (+7 more)

### Community 68 - "schema.sql"
Cohesion: 0.11
Nodes (42): ai_shared_usage, challenges, follows, idx_comments_remix, idx_follows_followee, idx_lanes_remix, idx_live_events_stream, idx_live_streams_host (+34 more)

### Community 69 - "app/layout.tsx"
Cohesion: 0.15
Nodes (16): geistMono, geistSans, metadata, RootLayout(), viewport, InstallEvent, InstallPrompt(), dismiss() (+8 more)

### Community 70 - "dependencies"
Cohesion: 0.10
Nodes (21): dependencies, @anthropic-ai/sdk, aws4fetch, bcryptjs, demucs-web, jose, lucide-react, next (+13 more)

### Community 71 - "stretch-memory.test.ts"
Cohesion: 0.11
Nodes (11): files, from, root, stretch, stretchFrom, stretchTo, to, fixStretchWorklet() (+3 more)

### Community 72 - "autoMatch.ts"
Cohesion: 0.14
Nodes (22): beatPhase(), onsetAt(), PRE_ROLL, ALL_STEPS, analyzeBeatLane(), analyzeGuide(), analyzeLane(), beatsAttempted (+14 more)

### Community 73 - "ref_path"
Cohesion: 0.12
Nodes (11): postgres, buildId(), nextConfig(), tunnelHost, root, assets, root, target (+3 more)

### Community 74 - "RemixComments.tsx"
Cohesion: 0.14
Nodes (14): api(), GoLiveStudioButton(), endExistingAndStart(), start(), end(), goLive(), ago(), AtPlayhead() (+6 more)

### Community 75 - "openrouter.ts"
Cohesion: 0.18
Nodes (16): GET(), Block, checkOpenRouterKey(), Completion, fromOpenAi(), headers(), OpenAiMessage, OpenRouterError (+8 more)

### Community 76 - "djMidi.ts"
Cohesion: 0.19
Nodes (14): MidiPanel(), controlKey(), learn(), loadMidiMap(), MIDI_ACTIONS, MidiAction, MidiLink, MidiMap (+6 more)

### Community 77 - "pairMatch.ts"
Cohesion: 0.09
Nodes (38): Baseline, Choice(), LaneMatchPanel(), handleApply(), handleUndo(), snapshot(), untouchedSince(), gridScore() (+30 more)

### Community 78 - "arrange.ts"
Cohesion: 0.10
Nodes (31): Phrase, StemAnalysis, trackBeats(), argmax(), Arrangement, arrangeVocal(), BeatGrid, beatStructure (+23 more)

### Community 80 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+11 more)

### Community 81 - "LaneInspector.tsx"
Cohesion: 0.10
Nodes (31): FxSlider(), hz(), LaneFxPanel(), pct(), BigSwitch(), LineCard(), remove(), separate() (+23 more)

### Community 82 - "SplitLaneDialog.tsx"
Cohesion: 0.19
Nodes (17): SplitLaneDialog(), finish(), start(), cache, findParts(), placeStems(), siblingStems(), swapInParts() (+9 more)

### Community 83 - "mp3.ts"
Cohesion: 0.23
Nodes (15): channels(), encodeMp3(), encodeMp3Bytes(), openMp3Stream(), handleStream(), Mp3Response, Mp3StreamMessage, Mp3StreamReply (+7 more)

### Community 84 - "SocialClipButton.tsx"
Cohesion: 0.26
Nodes (15): clipRange(), formatTime(), noSubscription(), SocialClipButton(), make(), canMakeClips(), drawFrame(), drawMark() (+7 more)

### Community 85 - "getCurrentUser"
Cohesion: 0.07
Nodes (55): GET(), POST(), GET(), POST(), schema, POST(), GET(), DELETE() (+47 more)

### Community 86 - "client/splitQueue.ts"
Cohesion: 0.10
Nodes (23): audioDuration(), cancelQueued(), ClaimedJob, HelperState, ifNoOtherTabHelping(), json(), LostJob, MiningSession (+15 more)

### Community 87 - "soundtouchjs.d.ts"
Cohesion: 0.11
Nodes (5): FifoSampleBuffer, SimpleFilter, SoundTouch, soundtouchjs, WebAudioBufferSource

### Community 88 - "ExamplesLab.tsx"
Cohesion: 0.25
Nodes (13): ExamplesPage(), metadata, DEFAULT_PAIR, ExamplesLab(), STEPS, keepOnly(), useLibrarySongs(), RecipeGallery() (+5 more)

### Community 89 - "djTypes.ts"
Cohesion: 0.11
Nodes (22): AutoMixPanel(), viewOf(), AUTO_MIX_STEPS, AutoMix, AutoMixEngine, AutoMixPhase, BLEND_BEATS, PHRASE_BEATS (+14 more)

### Community 90 - "Live.tsx"
Cohesion: 0.25
Nodes (14): ACTIVITY_ICON, ActivityGlyph(), activityKey(), ActivityText(), ago(), AREA_LABEL, AREA_SHORT, AreaShort() (+6 more)

### Community 91 - "musicKey.ts"
Cohesion: 0.14
Nodes (33): FIT, KeyHelper(), TempoTab(), checkMix(), fixBeatKey(), fixKey(), harmonyLine(), keysNow() (+25 more)

### Community 92 - "test.mjs"
Cohesion: 0.14
Nodes (9): databaseUrl, envLocal(), log, prepareDatabase(), root, server, serverEnv, storage (+1 more)

### Community 93 - "rtlText.ts"
Cohesion: 0.24
Nodes (11): CardText(), BidiRun, bidiRuns(), FORMS, hasRtl(), joinLetters(), joins(), joinsForward() (+3 more)

### Community 94 - "zod"
Cohesion: 0.09
Nodes (30): zod, DELETE(), GET(), PATCH(), patchSchema, createSchema, laneSchema, laneSettingsSchema (+22 more)

### Community 95 - "uploads.ts"
Cohesion: 0.12
Nodes (12): SplitterState, AddResult, AUDIO_EXTENSIONS, empty, Entry, fileKey(), isAudioFile(), rememberInFlight() (+4 more)

### Community 96 - "Remixt"
Cohesion: 0.14
Nodes (14): Architecture, Community, Configuration, Deploying it, Notes, Postgres (accounts, tracks, stems, remixes), Remixt, Running it (+6 more)

### Community 97 - "partyWorld.ts"
Cohesion: 0.23
Nodes (10): three, Avatar, bubble(), CameraMode, canvasSprite(), emojiTextures, Floater, nameLabel() (+2 more)

### Community 98 - "devDependencies"
Cohesion: 0.12
Nodes (16): devDependencies, @ast-grep/cli, eslint, eslint-config-next, knip, playwright-core, tailwindcss, @tailwindcss/postcss (+8 more)

### Community 99 - "lib/presence.ts"
Cohesion: 0.25
Nodes (13): GET(), POST(), Activity, ActivityType, Area, areaFor(), AREAS, ensurePresenceSchema() (+5 more)

### Community 100 - "neuralBeats.ts"
Cohesion: 0.09
Nodes (34): share(), NeuralBeats, BeatNetResponse, deviceGb(), isConstrainedDevice(), beatModelEnabled(), BeatModelState, beatModelSupported() (+26 more)

### Community 101 - "stemFetch.ts"
Cohesion: 0.21
Nodes (7): fetchInSlices(), fetchRange(), fetchWhole(), download(), FILE, Handler, server

### Community 102 - "Remixt Social Share Image (1920x1080)"
Cohesion: 0.23
Nodes (12): App Navigation: Library / Studio / Remixes / Upload, BPM & Pitch Match feature (Sync BPM), remixt-free.vercel.app (Vercel deployment), Multitrack Stem Lanes (VOCALS/BEAT waveforms with Vol & Pitch sliders), Publish Remix Under Your Name, Remixt Brand (gradient R logo, pink-purple-cyan palette), Remixt Social Share Image (1920x1080), Studio Page Mockup (remixt-free.vercel.app/studio) (+4 more)

### Community 103 - "TagInput.tsx"
Cohesion: 0.21
Nodes (7): RemixOwnerControls(), TagInput(), add(), GENRE_TAGS, MAX_TAGS, MOOD_TAGS, normaliseTag()

### Community 104 - "EasyStudio.tsx"
Cohesion: 0.40
Nodes (9): AddButton(), EasyStudio(), Guide(), Step, handleExport(), allInStep(), projectKey(), exportMixdown() (+1 more)

### Community 105 - "client/presence.ts"
Cohesion: 0.36
Nodes (7): PresenceHeartbeat(), listeners, randomId(), sendHeartbeat(), setPresence(), subscribe(), visitorId()

### Community 106 - "djWaveform.ts"
Cohesion: 0.36
Nodes (8): BAND_RATE, Bands, biquad(), computeBands(), decimateMono(), loudnessDb(), trackBands(), yieldToUi()

### Community 107 - "pitchTempo.ts"
Cohesion: 0.17
Nodes (16): signalsmith-stretch, soundtouchjs, feedAsRendered(), hasSound(), renderedWith(), renderHq(), renderInWorker(), renderOnPage() (+8 more)

### Community 108 - "auth.ts"
Cohesion: 0.17
Nodes (12): POST(), schema, POST(), POST(), schema, clearSessionCookie(), createSessionCookie(), hashPassword() (+4 more)

### Community 109 - "Image"
Cohesion: 0.33
Nodes (6): alt, contentType, Image(), size, Image(), cardFonts()

### Community 110 - "mediaSession.ts"
Cohesion: 0.20
Nodes (13): NOW_PLAYING_ARTWORK, apply(), artworkFor(), getPlayingRemix(), lastPosition, mediaSession(), NowPlaying, Owner (+5 more)

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
Cohesion: 0.25
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
- **39 isolated node(s):** `onnxruntime-web`, `uuid`, `@ast-grep/cli`, `@tailwindcss/postcss`, `@types/bcryptjs` (+34 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1106 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `react` to `app/page.tsx`, `curriculum.ts`, `studioStore.ts`, `live.ts`, `modulation.ts`, `RemixtMark`, `AdminPanel.tsx`, `SongPicker.tsx`, `Studio.tsx`, `Arrangement.tsx`, `clipsOf`, `mixScore.ts`, `EasyDecks.tsx`, `notifications.ts`, `examplesLibrary.ts`, `demoSongs.ts`, `SplitQueue.tsx`, `MatchStep.tsx`, `AiProducer.tsx`, `CoProducer.tsx`, `libraryTracks.ts`, `startNewStep`, `quickHelp.ts`, `stemKinds.ts`, `remixLanes.ts`, `models.ts`, `StudioTransport.tsx`, `exportJob.ts`, `package.json`, `splitter.ts`, `previewPlayer.ts`, `MissionSession.tsx`, `UploadManager.tsx`, `exportMeta.ts`, `collab.ts`, `libraryAudio.ts`, `extras.tsx`, `NavBar.tsx`, `app/layout.tsx`, `RemixComments.tsx`, `djMidi.ts`, `pairMatch.ts`, `LaneInspector.tsx`, `SplitLaneDialog.tsx`, `SocialClipButton.tsx`, `getCurrentUser`, `client/splitQueue.ts`, `ExamplesLab.tsx`, `Live.tsx`, `uploads.ts`, `TagInput.tsx`, `EasyStudio.tsx`, `client/presence.ts`, `RemixCover.tsx`?**
  _High betweenness centrality (0.120) - this node is a cross-community bridge._
- **What connects `onnxruntime-web`, `uuid`, `@ast-grep/cli` to the rest of the system?**
  _39 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `DjEngine` be split into smaller, more focused modules?**
  _Cohesion score 0.05629099582587955 - nodes in this community are weakly interconnected._
- **Why does `next` connect `next` to `app/page.tsx`, `lib/splitQueue.ts`, `studioStore.ts`, `storage.ts`, `live.ts`, `RemixtMark`, `react`, `AdminPanel.tsx`, `SongPicker.tsx`, `Studio.tsx`, `EasyDecks.tsx`, `notifications.ts`, `examplesLibrary.ts`, `SplitQueue.tsx`, `stemKinds.ts`, `models.ts`, `StudioTransport.tsx`, `package.json`, `previewPlayer.ts`, `MissionSession.tsx`, `projects.ts`, `UploadManager.tsx`, `aiKeys.ts`, `exportMeta.ts`, `ai/chat/route.ts`, `NavBar.tsx`, `app/layout.tsx`, `ref_path`, `RemixComments.tsx`, `openrouter.ts`, `getCurrentUser`, `ExamplesLab.tsx`, `Live.tsx`, `zod`, `lib/presence.ts`, `TagInput.tsx`, `client/presence.ts`, `auth.ts`, `RemixCover.tsx`, `version/route.ts`?**
  _High betweenness centrality (0.102) - this node is a cross-community bridge._
- **Should `app/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.037986270022883295 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Remixt Brand Gradient (pink to violet to cyan)` and `Remixt Mark - Black Monochrome`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `Remixt Brand Gradient (pink to violet to cyan)` and `Remixt Mark - White Monochrome`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._