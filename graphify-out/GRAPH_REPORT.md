# Graph Report - code  (2026-11-11)

## Corpus Check
- 467 files · ~540,179 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 12 file(s) not represented in the graph (top: (none) 7, .ttf 2, .ico 2)

## Summary
- 4672 nodes · 14529 edges · 160 communities (139 shown, 21 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 203 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `16269ead`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- DjEngine
- app/page.tsx
- aiIdeas.ts
- aiTrial.ts
- getCurrentUser
- djEngine.ts
- next
- dj-realism.test.ts
- storage.ts
- LiveReplay.tsx
- djMath.ts
- modulation.ts
- SocialClipButton.tsx
- LiveRoom.tsx
- AdminPanel.tsx
- SongPicker.tsx
- Studio.tsx
- clipCommands.ts
- audioEngine.ts
- Arrangement.tsx
- harmony.ts
- LyricsPanel.tsx
- models.ts
- demoSongsDsp.ts
- Lakebase Postgres
- analysis.ts
- EasyDecks.tsx
- AiProducer
- TagInput.tsx
- MatchStep.tsx
- getStream
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
- live/[id]/route.ts
- remixLanes.ts
- appIcon
- useStudioStore
- exportJob.ts
- package.json
- app.py
- uploads.ts
- splitter.ts
- VocalRecorder.tsx
- beatNet.ts
- MissionSession.tsx
- projects.ts
- djTypes.ts
- UploadManager.tsx
- aiKeys.ts
- exportMeta.ts
- collab.ts
- localCache.ts
- extras.tsx
- InstallPrompt.tsx
- .rescheduleLane
- NavBar.tsx
- schema.sql
- studio-session.test.ts
- dependencies
- studioStore.ts
- autoMatch.ts
- ref_fs
- react
- openrouter.ts
- auth.ts
- LaneMatchPanel.tsx
- arrange.ts
- FakeContext
- compilerOptions
- pairMatch.ts
- SplitLaneDialog.tsx
- phone-export.test.ts
- split-queue.test.ts
- live.ts
- splitHelper
- soundtouchjs.d.ts
- liveStudio.ts
- autoMix.ts
- Live.tsx
- aiExplain.ts
- test.mjs
- [id]/opengraph-image.tsx
- isConstrainedDevice
- uploads
- Remixt
- RemixCover.tsx
- devDependencies
- coproducerTools.ts
- neuralBeats.ts
- splitter.worker.ts
- Remixt Social Share Image (1920x1080)
- RemixtMark
- lib/presence.ts
- heavy-play.mjs
- create
- pitchTempo.ts
- copy-ort.mjs
- stem-results.test.ts
- stemKinds.ts
- FakeParam
- StudioLane
- demucs-web.d.ts
- audioGraph.ts
- liveStudioDiff.ts
- stretchWorkers.ts
- scripts
- live.test.ts
- Free on Vercel, with Neon and Vercel Blob
- trackBeats
- audioEngine
- Sharing Remixt with someone else
- Free, all in one place: Oracle Cloud
- run.sh
- .renderClip
- Deploying Remixt
- Deployment options (Vercel, Oracle Cloud, own Docker server)
- Your own server (Docker)
- In-browser song splitter (Demucs via ONNX)
- ExamplesLab.tsx
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
- shared-results.test.ts
- ensureSchema
- app/layout.tsx
- eslint.config.mjs
- Logs: CLI, Loki, and SDK pagination
- allowScripts

## God Nodes (most connected - your core abstractions)
1. `useStudioStore` - 145 edges
2. `next` - 141 edges
3. `sql` - 135 edges
4. `getCurrentUser()` - 135 edges
5. `DjEngine` - 130 edges
6. `react` - 123 edges
7. `AiProducer()` - 103 edges
8. `audioEngine` - 98 edges
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

## Communities (160 total, 21 thin omitted)

### Community 0 - "DjEngine"
Cohesion: 0.05
Nodes (13): DjConsole(), dbToGain(), emptyHotCues(), quantizePos(), DeckUnit, DjEngine, clamp(), applyMidi() (+5 more)

### Community 1 - "app/page.tsx"
Cohesion: 0.05
Nodes (71): GET(), DELETE(), GET(), POST(), postSchema, visible(), DELETE(), handle() (+63 more)

### Community 2 - "aiIdeas.ts"
Cohesion: 0.06
Nodes (93): activeShare(), adoptTiming(), ALL_FIXES, applyLevels(), applyMix(), arrange(), arrangementIdeas(), arrangeOnDrop() (+85 more)

### Community 3 - "aiTrial.ts"
Cohesion: 0.10
Nodes (41): fixGroups(), HandEdit, mixSignature(), pickPair(), prepareSession(), rebaseSession(), recompileIdea(), Session (+33 more)

### Community 4 - "getCurrentUser"
Cohesion: 0.06
Nodes (71): GET(), DELETE(), GET(), keyFor(), DELETE(), GET(), DELETE(), POST() (+63 more)

### Community 5 - "djEngine.ts"
Cohesion: 0.07
Nodes (39): MidiPanel(), BANDS, ChannelStrip(), Crossfader(), CURVES, dbFmt(), FADER_CURVES, HeadphoneSection() (+31 more)

### Community 6 - "next"
Cohesion: 0.07
Nodes (52): next, zod, DELETE(), GET(), POST(), schema, findJunk(), GET() (+44 more)

### Community 7 - "dj-realism.test.ts"
Cohesion: 0.06
Nodes (40): barOf(), startOffsetOnPhrase(), AUTO_GAIN_TARGET_DB, autoGainDb(), barBeat(), beatFraction(), beatIndex(), CLIP (+32 more)

### Community 8 - "storage.ts"
Cohesion: 0.06
Nodes (58): GET(), kept(), redirect(), bodySchema, maxDuration, POST(), DELETE(), GET() (+50 more)

### Community 9 - "LiveReplay.tsx"
Cohesion: 0.11
Nodes (22): dynamic, LiveSessionPage(), FollowButton(), when(), Heat(), LiveReplay(), ReadOnlyStudio(), StudioActivity (+14 more)

### Community 10 - "djMath.ts"
Cohesion: 0.05
Nodes (77): BeatMatchMeter(), FIT_TEXT, Gauge(), CrowdRequest, crowdScore(), CrowdState, ECHO_KEYS, fxTotal() (+69 more)

### Community 11 - "modulation.ts"
Cohesion: 0.14
Nodes (17): AutomationLane(), at(), commit(), handleDown(), handleMove(), remove(), formatValue(), PARAMS (+9 more)

### Community 12 - "SocialClipButton.tsx"
Cohesion: 0.21
Nodes (18): clipRange(), formatTime(), noSubscription(), SocialClipButton(), make(), share(), fileSafeName(), canMakeClips() (+10 more)

### Community 13 - "LiveRoom.tsx"
Cohesion: 0.08
Nodes (47): api(), HostConsole(), chooseRemix(), endSession(), goLive(), saveSettings(), NOTE_PRESETS, RemixChoice (+39 more)

### Community 14 - "AdminPanel.tsx"
Cohesion: 0.12
Nodes (36): AdminPage(), metadata, AdminChallenge, AdminPanel(), AdminRemix, AdminReport, AdminResult, AdminTrack (+28 more)

### Community 15 - "SongPicker.tsx"
Cohesion: 0.10
Nodes (24): Flags, INFO, Kind, LibrarySplit(), NO_FLAGS, Part, PARTS, PARTS_MUTED (+16 more)

### Community 16 - "Studio.tsx"
Cohesion: 0.07
Nodes (52): formatAgo(), ModeChooser(), MODES, ModeSwitch(), PAD_KEYS, SamplePads(), Studio(), leaveTogether() (+44 more)

### Community 17 - "clipCommands.ts"
Cohesion: 0.08
Nodes (97): gatePattern(), MAX_AUTOMATION_POINTS, pumpPattern(), spliceAutomation(), clearAutomation(), clearSelection(), clipFade(), clipGain() (+89 more)

### Community 18 - "audioEngine.ts"
Cohesion: 0.07
Nodes (23): DecodedStem, decodeGate, Gate, lastUsed, LoadedLane, PHONE, PlaybackBlockedError, QueuedRender (+15 more)

### Community 19 - "Arrangement.tsx"
Cohesion: 0.07
Nodes (74): AiSection(), Arrangement(), onContentPointerDown(), onContentPointerMove(), onContentPointerUp(), snapDelta(), timeAt(), ClipFades() (+66 more)

### Community 20 - "harmony.ts"
Cohesion: 0.10
Nodes (31): accentCache, accents(), adviseShift(), chordRows(), Harmony, HarmonyAdvice, HarmonyScan, harmonyStatus() (+23 more)

### Community 21 - "LyricsPanel.tsx"
Cohesion: 0.09
Nodes (53): LrclibResult, AiMode, AiTabView(), accept(), BigPrompter(), EditTab(), FindTab(), FitBadge() (+45 more)

### Community 22 - "models.ts"
Cohesion: 0.05
Nodes (63): DELETE(), POST(), setLiked(), POST(), GET(), ArtistPage(), ArtistRow, generateMetadata() (+55 more)

### Community 23 - "demoSongsDsp.ts"
Cohesion: 0.05
Nodes (67): CHORD_INTERVALS, ChordDef, ChordQuality, CHORUS_CYCLE, DEMO_SONG_DEFS, DEMO_SONGS, DEMO_STEMS, SectionName (+59 more)

### Community 24 - "Lakebase Postgres"
Cohesion: 0.04
Nodes (43): Full-Text Search with BM25 Ranking, Prepare and Index Text, Query and Interpret Scores, Set Parameters at Build Time or Per Query, Set the Candidate Limit, Use Prefilter Selectively, Adapt the Hybrid Search, Hybrid Search (+35 more)

### Community 25 - "analysis.ts"
Cohesion: 0.11
Nodes (32): activeLoudness(), ANALYSIS_RATE, analyzeAndKeep(), analyzeMono(), autocorrelation(), cache, chromagram(), correlation() (+24 more)

### Community 26 - "EasyDecks.tsx"
Cohesion: 0.05
Nodes (60): BarCounter(), DeckPanel(), Pad(), PAD_JUMPS, PAD_MODE_LABEL, ROLLS, sign(), STEM_BUTTONS (+52 more)

### Community 27 - "AiProducer"
Cohesion: 0.14
Nodes (46): AiProducer(), analyse(), applyOptions(), changeScope(), chooseSync(), chooseTiming(), chooseWhole(), close() (+38 more)

### Community 28 - "TagInput.tsx"
Cohesion: 0.23
Nodes (7): RemixOwnerControls(), TagInput(), add(), GENRE_TAGS, MAX_TAGS, MOOD_TAGS, normaliseTag()

### Community 29 - "MatchStep.tsx"
Cohesion: 0.08
Nodes (49): demoLabSong(), EXCERPT_BARS, LabSong, libraryLabSong(), useSongSummaries(), Found, MatchStep(), prepare() (+41 more)

### Community 30 - "getStream"
Cohesion: 0.14
Nodes (23): POST(), GET(), POST(), schema, POST(), GET(), PUT(), stateSchema (+15 more)

### Community 31 - "demoSongs.ts"
Cohesion: 0.12
Nodes (28): LibraryState, BEAT_PARTS, COLORS, DemoSplit(), Flags, NONE, STAGES, StemRow() (+20 more)

### Community 32 - "client/splitQueue.ts"
Cohesion: 0.08
Nodes (44): ago(), duration(), HelperPanel(), jobDetail(), LastBlock(), noSubscription(), QueuedSongRow(), RewardRules() (+36 more)

### Community 33 - "Neon"
Cohesion: 0.05
Nodes (41): Data API external JWKS, Functions: verify the JWT, then authorize the user, Incompatibilities, Managed Better Auth, Trusted domains, 1. Install the Neon CLI, 2. Install the Neon MCP Server, 3. Install Neon Agent Skills (+33 more)

### Community 34 - "musicKey.ts"
Cohesion: 0.08
Nodes (48): TrackLibrary(), AnalysisCard(), LEVEL_STYLE, pct(), Row(), Verdict(), BarGrid(), FIT_WORDS (+40 more)

### Community 35 - "AiProducer.tsx"
Cohesion: 0.04
Nodes (69): Icon(), Best, CheckActions, FixState, STATUS, Choice, ChoiceCards(), clock() (+61 more)

### Community 36 - "mixdown.ts"
Cohesion: 0.19
Nodes (24): createMasterChain(), audioFileName(), wavHeader(), bounceToFile(), encodeAudio(), encodeWav(), exportLane(), exportMixdown() (+16 more)

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
Cohesion: 0.09
Nodes (39): decoder(), entries, fold(), held, hold(), kept, load(), LoadedTrack (+31 more)

### Community 41 - "startNewStep"
Cohesion: 0.11
Nodes (40): FineTune(), BigSwitch(), LineCard(), remove(), separate(), presetOf(), SOUND_FIELDS, SOUND_NAMES (+32 more)

### Community 42 - "Remixt Brand Mark (split audio-waveform bars)"
Cohesion: 0.11
Nodes (33): File Icon (document glyph), Globe Icon, Next.js Wordmark Logo, Next.js Starter Template Assets, Remixt Brand Gradient (pink to violet to cyan), Remixt Brand Mark (split audio-waveform bars), Remixt Duotone Palette (pink top / cyan bottom bars), Apple Touch Icon (180px, gradient rounded-square, white bars) (+25 more)

### Community 43 - "quickHelp.ts"
Cohesion: 0.10
Nodes (21): Line, QuickHelp(), send(), SUGGESTIONS, availableFixes(), FixId, Idea, useAiTrial (+13 more)

### Community 44 - "PartyWorld"
Cohesion: 0.07
Nodes (12): three, Avatar, bubble(), CameraMode, canvasSprite(), emojiTexture(), emojiTextures, Floater (+4 more)

### Community 45 - "live/[id]/route.ts"
Cohesion: 0.11
Nodes (25): DELETE(), GET(), PATCH(), patchSchema, createSchema, GET(), POST(), dynamic (+17 more)

### Community 46 - "remixLanes.ts"
Cohesion: 0.11
Nodes (30): Clock(), EmbedPlayer(), formatTime(), formatTime(), MixWaveform(), RemixDetailPlayer(), ContextMenuHost(), load() (+22 more)

### Community 47 - "appIcon"
Cohesion: 0.22
Nodes (10): GET(), SIZES, AppleIcon(), contentType, size, contentType, Icon(), size (+2 more)

### Community 48 - "useStudioStore"
Cohesion: 0.11
Nodes (34): ago(), Entry(), HistoryList(), useCurrent(), isMastered(), MasterPanel(), masterPresetOf(), same() (+26 more)

### Community 49 - "exportJob.ts"
Cohesion: 0.14
Nodes (25): ExportSheet(), save(), formatBytes(), formatDuration(), formatLeft(), noSubscription(), phoneKind(), ExportJobState (+17 more)

### Community 50 - "package.json"
Cohesion: 0.09
Nodes (22): @ast-grep/cli, aws4fetch, bcryptjs, jose, knip, onnxruntime-web, react-dom, tailwindcss (+14 more)

### Community 51 - "app.py"
Cohesion: 0.12
Nodes (6): compute_peaks(), detect_bpm(), health(), load_and_encode(), separate(), SeparateRequest

### Community 52 - "uploads.ts"
Cohesion: 0.14
Nodes (23): ProgressBar(), RigStatus(), formatMB(), SplitterStatus(), BackgroundActivity(), doneText(), UploadList(), UploadRow() (+15 more)

### Community 53 - "splitter.ts"
Cohesion: 0.14
Nodes (16): Send, UploadTarget, fetchSongFromLink(), Job, MODEL_URL, Turn, SplitOutput, SplitResult (+8 more)

### Community 54 - "VocalRecorder.tsx"
Cohesion: 0.15
Nodes (21): formatTime(), LevelMeter(), VocalRecorder(), begin(), keep(), listen(), stopPreview(), ensureRunning() (+13 more)

### Community 55 - "beatNet.ts"
Cohesion: 0.11
Nodes (28): aggregate(), BEAT_NET, cosTable, deduplicate(), fft(), hzToMel(), LEVELS, logMelSpectrogram() (+20 more)

### Community 56 - "MissionSession.tsx"
Cohesion: 0.04
Nodes (89): DjPage(), metadata, CopilotPanel(), ICON, DjApp(), Mode, OpenDecks(), View (+81 more)

### Community 57 - "projects.ts"
Cohesion: 0.15
Nodes (21): DELETE(), GET(), PUT(), putSchema, POST(), schema, GET(), POST() (+13 more)

### Community 58 - "djTypes.ts"
Cohesion: 0.05
Nodes (77): FIT_LABEL, OtherDeck, SORTS, DemoStem, releaseDemoSong(), Phase, browse(), BrowserEntry (+69 more)

### Community 59 - "UploadManager.tsx"
Cohesion: 0.15
Nodes (20): QueuedSongs(), QueueNotice(), nameList(), noSubscription(), skippedMessage(), SplitterInfo(), StatusBadge(), Stem (+12 more)

### Community 60 - "aiKeys.ts"
Cohesion: 0.10
Nodes (47): @anthropic-ai/sdk, maxDuration, POST(), DELETE(), GET(), PATCH(), patchSchema, PUT() (+39 more)

### Community 61 - "exportMeta.ts"
Cohesion: 0.31
Nodes (10): id3Key(), TrackCredit, Cover, drawCover(), exportTags(), fetchCover(), imageType(), laneCredits() (+2 more)

### Community 62 - "collab.ts"
Cohesion: 0.15
Nodes (15): CollabBar(), SYNC_LABEL, CollabMember, CollabSession, connectCollab(), idle, mergeShared(), normalise() (+7 more)

### Community 63 - "localCache.ts"
Cohesion: 0.10
Nodes (30): metadata, StoragePage(), formatBytes(), KIND_TEXT, MODEL_TEXT, ModelKey, ModelUsage, StorageSettings() (+22 more)

### Community 64 - "extras.tsx"
Cohesion: 0.26
Nodes (12): Engines(), keepWhatsPlaying(), MasterIt(), TuneButton(), TuneRow(), masterFor(), beatModelEnabled(), beatModelSupported() (+4 more)

### Community 65 - "InstallPrompt.tsx"
Cohesion: 0.48
Nodes (6): InstallEvent, InstallPrompt(), dismiss(), install(), read(), write()

### Community 66 - ".rescheduleLane"
Cohesion: 0.16
Nodes (5): bytesOf(), clipKey(), queueReschedule(), used(), ClipBufferLookup

### Community 67 - "NavBar.tsx"
Cohesion: 0.18
Nodes (14): MobileTabBar(), Tab(), AccountMenu(), MoreLinks(), NavBar(), ICONS, isActive(), MORE_LINKS (+6 more)

### Community 68 - "schema.sql"
Cohesion: 0.11
Nodes (42): ai_shared_usage, challenges, follows, idx_comments_remix, idx_follows_followee, idx_lanes_remix, idx_live_events_stream, idx_live_streams_host (+34 more)

### Community 69 - "studio-session.test.ts"
Cohesion: 0.10
Nodes (40): zustand, Playhead(), AiScopeBar(), Drag, Pick, PICK_ICONS, Playhead(), trimAfter() (+32 more)

### Community 70 - "dependencies"
Cohesion: 0.10
Nodes (21): dependencies, @anthropic-ai/sdk, aws4fetch, bcryptjs, demucs-web, jose, lucide-react, next (+13 more)

### Community 71 - "studioStore.ts"
Cohesion: 0.06
Nodes (55): FxSlider(), hz(), LaneFxPanel(), pct(), AddButton(), EasyStudio(), Guide(), Step (+47 more)

### Community 72 - "autoMatch.ts"
Cohesion: 0.14
Nodes (23): findPhrases(), PRE_ROLL, TAIL, ALL_STEPS, analyzeBeatLane(), analyzeGuide(), analyzeLane(), beatsAttempted (+15 more)

### Community 73 - "ref_fs"
Cohesion: 0.13
Nodes (11): postgres, buildId(), nextConfig(), tunnelHost, root, assets, root, target (+3 more)

### Community 74 - "react"
Cohesion: 0.10
Nodes (19): lucide-react, qrcode, react, ago(), AtPlayhead(), formatAt(), RemixComments(), formatCount() (+11 more)

### Community 75 - "openrouter.ts"
Cohesion: 0.16
Nodes (18): GET(), AI_MODELS, Block, checkOpenRouterKey(), Completion, fromOpenAi(), headers(), OpenAiMessage (+10 more)

### Community 76 - "auth.ts"
Cohesion: 0.16
Nodes (13): POST(), schema, POST(), POST(), schema, clearSessionCookie(), createSessionCookie(), hashPassword() (+5 more)

### Community 77 - "LaneMatchPanel.tsx"
Cohesion: 0.15
Nodes (22): Baseline, Choice(), LaneMatchPanel(), handleApply(), handleUndo(), snapshot(), untouchedSince(), sectionBars() (+14 more)

### Community 78 - "arrange.ts"
Cohesion: 0.14
Nodes (26): Phrase, argmax(), Arrangement, arrangeVocal(), beatStructure, downbeatScores(), gridCache, hearVocal() (+18 more)

### Community 80 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+11 more)

### Community 81 - "pairMatch.ts"
Cohesion: 0.18
Nodes (16): HeardVocal, LaneInput, sameSongLayout(), SectionPlacement, SuggestedLayout, BEAT_PRESETS, chromaBetween(), clampRatio() (+8 more)

### Community 82 - "SplitLaneDialog.tsx"
Cohesion: 0.18
Nodes (21): SplitLaneDialog(), finish(), start(), cache, findParts(), placeStems(), siblingStems(), swapInParts() (+13 more)

### Community 83 - "phone-export.test.ts"
Cohesion: 0.13
Nodes (19): Bounce, channels(), encodeMp3(), encodeMp3Bytes(), openMp3Stream(), PcmSink, handleStream(), Mp3Response (+11 more)

### Community 84 - "split-queue.test.ts"
Cohesion: 0.21
Nodes (15): body(), claim(), claimJob(), Client, deliverStems(), downloadSource(), expectStatus(), jobRow() (+7 more)

### Community 85 - "live.ts"
Cohesion: 0.07
Nodes (33): PUT(), GoLiveForm(), localInputValue(), RemixChoice, Avatar(), LiveChat(), submit(), Message() (+25 more)

### Community 87 - "soundtouchjs.d.ts"
Cohesion: 0.11
Nodes (5): FifoSampleBuffer, SimpleFilter, SoundTouch, soundtouchjs, WebAudioBufferSource

### Community 88 - "liveStudio.ts"
Cohesion: 0.22
Nodes (13): applyLiveMix(), isMix(), LiveMix, mixFields(), mixOf(), startStudioBroadcast(), scheduleMix(), scheduleState() (+5 more)

### Community 89 - "autoMix.ts"
Cohesion: 0.15
Nodes (12): AiDj, AUTO_MIX_STEPS, AutoMix, AutoMixEngine, AutoMixPhase, BLEND_BEATS, PHRASE_BEATS, ramp() (+4 more)

### Community 90 - "Live.tsx"
Cohesion: 0.18
Nodes (19): ACTIVITY_ICON, ActivityGlyph(), activityKey(), ActivityText(), ago(), AREA_LABEL, AREA_SHORT, AreaShort() (+11 more)

### Community 91 - "aiExplain.ts"
Cohesion: 0.11
Nodes (29): Change, clock(), cutWords(), diffMix(), endOf(), entryOf(), fxChanges(), laneChanges() (+21 more)

### Community 92 - "test.mjs"
Cohesion: 0.14
Nodes (9): databaseUrl, envLocal(), log, prepareDatabase(), root, server, serverEnv, storage (+1 more)

### Community 93 - "[id]/opengraph-image.tsx"
Cohesion: 0.13
Nodes (21): alt, contentType, Image(), size, alt, contentType, coverDataUri(), Image() (+13 more)

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

### Community 99 - "coproducerTools.ts"
Cohesion: 0.11
Nodes (35): checkMix(), findDrop(), harmonyOf(), ideaFits(), keysNow(), keyStretch(), playedLoudness(), recordingOf() (+27 more)

### Community 100 - "neuralBeats.ts"
Cohesion: 0.15
Nodes (24): BeatModelState, diskKey(), keep(), keptBeats(), legacyResult(), neuralBeats(), pending, results (+16 more)

### Community 101 - "splitter.worker.ts"
Cohesion: 0.20
Nodes (11): demucs-web, cancelled, init(), inlineMp3(), PeakMeter, post(), separateSegment(), split() (+3 more)

### Community 102 - "Remixt Social Share Image (1920x1080)"
Cohesion: 0.23
Nodes (12): App Navigation: Library / Studio / Remixes / Upload, BPM & Pitch Match feature (Sync BPM), remixt-free.vercel.app (Vercel deployment), Multitrack Stem Lanes (VOCALS/BEAT waveforms with Vol & Pitch sliders), Publish Remix Under Your Name, Remixt Brand (gradient R logo, pink-purple-cyan palette), Remixt Social Share Image (1920x1080), Studio Page Mockup (remixt-free.vercel.app/studio) (+4 more)

### Community 103 - "RemixtMark"
Cohesion: 0.16
Nodes (15): Error(), Field(), LoginPage(), metadata, NotFound(), Field(), SignupPage(), RemixtMark() (+7 more)

### Community 104 - "lib/presence.ts"
Cohesion: 0.25
Nodes (13): GET(), POST(), Activity, ActivityType, Area, areaFor(), AREAS, ensurePresenceSchema() (+5 more)

### Community 105 - "heavy-play.mjs"
Cohesion: 0.15
Nodes (10): playwright-core, args, errors, play, restore, samples, songs, sounding (+2 more)

### Community 106 - "create"
Cohesion: 0.20
Nodes (8): Claim, Claimable Neon, If neon claim is missing, Path, With REST, With the CLI, Function Triggers (CLI, MCP, REST), create()

### Community 107 - "pitchTempo.ts"
Cohesion: 0.11
Nodes (16): signalsmith-stretch, soundtouchjs, feedAsRendered(), hasSound(), renderHq(), renderInWorker(), renderOnPage(), renderPitchTempo() (+8 more)

### Community 108 - "copy-ort.mjs"
Cohesion: 0.22
Nodes (8): files, from, root, stretch, stretchFrom, stretchTo, to, fixStretchWorklet()

### Community 109 - "stem-results.test.ts"
Cohesion: 0.27
Nodes (6): StemAnalysis, unpackAnalysis(), isAnalysisPack(), unpack(), analysis(), ramp()

### Community 110 - "stemKinds.ts"
Cohesion: 0.07
Nodes (38): formatDuration(), LibraryBrowser(), StemWithTrack, TabButton(), formatTime(), PreviewBar(), add(), ListedStem (+30 more)

### Community 112 - "StudioLane"
Cohesion: 0.25
Nodes (3): queueModulation(), LaneWindow, StudioLane

### Community 113 - "demucs-web.d.ts"
Cohesion: 0.17
Nodes (7): Channels, demucs-web, demucs-web/constants, demucs-web/processor, DemucsProcessor, Progress, Spec

### Community 114 - "audioGraph.ts"
Cohesion: 0.10
Nodes (25): clipEnvelope(), createLaneChain(), routeCompressor(), routeDrive(), routeReverb(), update(), update(), curveCache (+17 more)

### Community 115 - "liveStudioDiff.ts"
Cohesion: 0.27
Nodes (6): describeMixChanges(), DiffLane, DiffMix, FX_WORDS, laneLabel(), same()

### Community 116 - "stretchWorkers.ts"
Cohesion: 0.10
Nodes (27): deviceGb(), askMore(), haveInput(), Job, jobs, load(), readInput(), run() (+19 more)

### Community 117 - "scripts"
Cohesion: 0.18
Nodes (11): scripts, build, dev, knip, lint, prebuild, predev, sg (+3 more)

### Community 118 - "live.test.ts"
Cohesion: 0.29
Nodes (8): chat(), Client, feed(), json(), ok(), remixOf(), signUp(), sql

### Community 119 - "Free on Vercel, with Neon and Vercel Blob"
Cohesion: 0.22
Nodes (9): 1. Put the code on GitHub, 2. Create the Vercel project, 3. Add the database (Neon), 4. Add stem storage (Vercel Blob), 5. Redeploy and finish, 6. Try it, Free on Vercel, with Neon and Vercel Blob, Optional (+1 more)

### Community 120 - "trackBeats"
Cohesion: 0.50
Nodes (4): onsetAt(), trackBeats(), BeatGrid, neuralGrid()

### Community 121 - "audioEngine"
Cohesion: 0.14
Nodes (5): audioEngine, reportMixNowPlaying(), stopSources(), fetchStem(), Pad

### Community 122 - "Sharing Remixt with someone else"
Cohesion: 0.25
Nodes (7): `./share.sh cloudflared` — your Cloudflare tunnel, `./share.sh ngrok` — ngrok, `./share.sh` — serveo (default), Sharing Remixt with someone else, The three providers, Things worth knowing before you send the link, Why not Cloudflare's quick tunnel

### Community 124 - "Free, all in one place: Oracle Cloud"
Cohesion: 0.29
Nodes (7): 1. Create the account, 2. Create the server, 3. Open ports 80 and 443, 4. Get a free domain name, 5. Install Docker and start Remixt, 6. Keep it running, Free, all in one place: Oracle Cloud

### Community 125 - "run.sh"
Cohesion: 0.29
Nodes (3): PATH, run.sh script, share.sh script

### Community 126 - ".renderClip"
Cohesion: 0.26
Nodes (10): renderKey(), sliceBuffer(), yieldToStandIns(), renderedWith(), stretchEngine, keepRender(), Kept, keptRender() (+2 more)

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

### Community 134 - "ExamplesLab.tsx"
Cohesion: 0.27
Nodes (10): ExamplesPage(), metadata, DEFAULT_PAIR, ExamplesLab(), STEPS, keepOnly(), useLibrarySongs(), RecipeGallery() (+2 more)

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
Nodes (10): ctx, StudioLane, Snapshot, StudioLane, download(), FILE, Handler, server (+2 more)

### Community 158 - "mediaSession.ts"
Cohesion: 0.21
Nodes (12): NOW_PLAYING_ARTWORK, apply(), artworkFor(), getPlayingRemix(), lastPosition, mediaSession(), NowPlaying, Owner (+4 more)

### Community 162 - "shared-results.test.ts"
Cohesion: 0.16
Nodes (7): share(), put(), sql, url(), resolve(), src, withExtension()

### Community 163 - "ensureSchema"
Cohesion: 0.12
Nodes (29): GET(), POST(), PATCH(), patchSchema, createSchema, GET(), laneSchema, laneSettingsSchema (+21 more)

### Community 168 - "app/layout.tsx"
Cohesion: 0.18
Nodes (11): geistMono, geistSans, metadata, RootLayout(), viewport, PresenceHeartbeat(), isStaleChunk(), readLater() (+3 more)

### Community 169 - "eslint.config.mjs"
Cohesion: 0.50
Nodes (3): eslint, eslint-config-next, eslintConfig

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
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1188 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `react` to `app/page.tsx`, `djEngine.ts`, `ExamplesLab.tsx`, `LiveReplay.tsx`, `djMath.ts`, `modulation.ts`, `SocialClipButton.tsx`, `LiveRoom.tsx`, `AdminPanel.tsx`, `SongPicker.tsx`, `Studio.tsx`, `Arrangement.tsx`, `LyricsPanel.tsx`, `models.ts`, `EasyDecks.tsx`, `TagInput.tsx`, `MatchStep.tsx`, `demoSongs.ts`, `client/splitQueue.ts`, `musicKey.ts`, `ensureSchema`, `AiProducer.tsx`, `CoProducer.tsx`, `libraryTracks.ts`, `app/layout.tsx`, `startNewStep`, `quickHelp.ts`, `live/[id]/route.ts`, `remixLanes.ts`, `useStudioStore`, `exportJob.ts`, `package.json`, `uploads.ts`, `splitter.ts`, `VocalRecorder.tsx`, `MissionSession.tsx`, `djTypes.ts`, `UploadManager.tsx`, `collab.ts`, `localCache.ts`, `extras.tsx`, `InstallPrompt.tsx`, `NavBar.tsx`, `studio-session.test.ts`, `studioStore.ts`, `LaneMatchPanel.tsx`, `SplitLaneDialog.tsx`, `live.ts`, `Live.tsx`, `RemixCover.tsx`, `RemixtMark`, `stemKinds.ts`?**
  _High betweenness centrality (0.122) - this node is a cross-community bridge._
- **What connects `Python separation service dependencies (FastAPI, demucs 4.0.1, librosa)`, `Google Search Console site verification file`, `Vazirmatn font (SIL Open Font License 1.1)` to the rest of the system?**
  _39 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `DjEngine` be split into smaller, more focused modules?**
  _Cohesion score 0.054466230936819175 - nodes in this community are weakly interconnected._
- **Why does `next` connect `next` to `app/page.tsx`, `getCurrentUser`, `ExamplesLab.tsx`, `storage.ts`, `LiveReplay.tsx`, `LiveRoom.tsx`, `AdminPanel.tsx`, `SongPicker.tsx`, `Studio.tsx`, `LyricsPanel.tsx`, `models.ts`, `TagInput.tsx`, `MatchStep.tsx`, `getStream`, `demoSongs.ts`, `client/splitQueue.ts`, `ensureSchema`, `app/layout.tsx`, `live/[id]/route.ts`, `remixLanes.ts`, `appIcon`, `useStudioStore`, `package.json`, `uploads.ts`, `VocalRecorder.tsx`, `MissionSession.tsx`, `projects.ts`, `djTypes.ts`, `UploadManager.tsx`, `aiKeys.ts`, `NavBar.tsx`, `ref_fs`, `react`, `openrouter.ts`, `auth.ts`, `live.ts`, `Live.tsx`, `[id]/opengraph-image.tsx`, `RemixCover.tsx`, `RemixtMark`, `lib/presence.ts`, `stemKinds.ts`?**
  _High betweenness centrality (0.105) - this node is a cross-community bridge._
- **Should `app/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.05335628227194492 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Remixt Brand Gradient (pink to violet to cyan)` and `Remixt Mark - Black Monochrome`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `Remixt Brand Gradient (pink to violet to cyan)` and `Remixt Mark - White Monochrome`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._