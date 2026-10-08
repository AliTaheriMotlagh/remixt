# Graph Report - code  (2026-10-08)

## Corpus Check
- 426 files · ~444,036 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 11 file(s) not represented in the graph (top: (none) 6, .ttf 2, .ico 2)

## Summary
- 3696 nodes · 11529 edges · 135 communities (126 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 158 edges (avg confidence: 0.85)
- Token cost: 218,002 input · 0 output

## Community Hubs (Navigation)
- Clip Editing Commands
- AI Ideas & Arrange
- Projects & Remix API
- Remix Likes & Plays
- DJ Engine Core
- DJ Deck Panel UI
- Admin & Reports
- Live Host Console
- Examples Lab Matching
- AI Producer Panel
- Split Job Queue API
- Studio Arrangement View
- Library Browser & Preview
- DJ Track Library & AI DJ
- Library Track Decoding
- Audio Engine Loading
- In-Browser Demucs Splitter
- DJ Gear & Copilot
- Social Feed & Leaderboard
- Split Queue UI
- Stem Storage Backends
- Library Split Lab
- Audio Graph & Mixdown
- Live Sessions API
- DJ Curriculum & Quiz
- Key & Match Analysis
- Neural Beat Tracking
- Presence & Live Activity
- Beat-Match Meter & Crowd
- Lane Pair Matching
- Direct Blob Upload
- AI Producer Actions
- Studio Page & Drafts
- Demo Songs
- AI Trial & Hand Edits
- Co-Producer Chat UI
- Track Upload & Stems API
- Admin Panel UI
- Phrase & Beat Arrangement
- Embed Player & Waveform
- 3D Party World
- AI Keys & Chat API
- Brand Logo Assets
- Demo Song DSP Instruments
- Link Import & Split Jobs
- DJ Mixer & EQ
- Lane FX Panel
- Co-Producer Mix Tools
- Melody & Harmony Analysis
- Transport, Key & Master
- Audio Analysis Core
- Audio Engine Mix State
- Upload & Splitter Status
- DJ Controls & Auto-Gain
- DJ Deck Units
- Python Separation Service
- Vocal Recorder
- Remix Stats & Social Clip
- Web Package Dependencies
- Live Chat & Mix API
- DJ Progress Logic
- DJ JS Voices
- DJ Scenarios
- Build Scripts & Config
- Auto-Match Pipeline
- Collab Sessions
- Examples Library Excerpts
- Live Chat UI
- Upload Manager
- Demo Song Definitions
- OpenRouter Models
- Navigation Bar
- Lane Split & Beat Parts
- DJ Scenario Runner
- Package Runtime Deps
- Challenges
- Party Stage (Three.js)
- DJ Loops & Position
- Fake AudioContext Tests
- TypeScript Config
- Auth Login/Signup
- DJ Missions & Scoring
- Lane Inspector & Tap Tempo
- Studio Shortcuts & Pads
- DJ MIDI Mapping
- Split Helper Tabs
- SoundTouch Typings
- Test Runner Script
- RTL & OG Text
- Remix Comments
- Brand Mark Code
- Uploads Store
- Split Queue Tests
- Icons & AI Control
- Demo Song Mixing DSP
- Ranged Stem Fetch
- Marketing Share Images
- App Icons
- Login & Signup Pages
- Remix Owner Controls & Tags
- README Feature Overview
- Pitch/Tempo Stretching
- Package Dev Deps
- Live Session Pages
- Media Session Now Playing
- Match Finder
- Demucs Typings
- Self-Host Deployment
- Live Tests
- Live Listing Page
- Live Studio Diff
- Tunnel & Isolation Docs
- Neon DB & Local Dev Docs
- MP3 Encoding
- Splitting Architecture Docs
- Neon Platform Skill
- Notifications
- Remix Cover Images
- Lakebase Search Skill
- Package Scripts
- Automation Lane
- Share & Run Scripts
- OpenGraph Images
- PWA Install Prompt
- Go Live Studio Button
- Test Module Resolver
- Live Studio Broadcast
- Co-Producer Prompt & Tools
- Docker Entrypoint
- Dev Start Script
- Agent Rules Docs
- Signalsmith Typings
- PostCSS Config
- Demucs Constants

## God Nodes (most connected - your core abstractions)
1. `next` - 133 edges
2. `getCurrentUser()` - 130 edges
3. `sql` - 130 edges
4. `DjEngine` - 128 edges
5. `useStudioStore` - 112 edges
6. `react` - 101 edges
7. `AiProducer()` - 80 edges
8. `lucide-react` - 78 edges
9. `DeckId` - 76 edges
10. `audioEngine` - 69 edges

## Surprising Connections (you probably didn't know these)
- `Studio Page Mockup in Demo Poster` --semantically_similar_to--> `Studio Page Mockup (remixt-free.vercel.app/studio)`  [INFERRED] [semantically similar]
  web/public/remixt-demo-poster.jpg → remixt-share-1920x1080.png
- `Python separation service dependencies (FastAPI, demucs 4.0.1, librosa)` --semantically_similar_to--> `Demucs ONNX model (htdemucs_embedded.onnx, ~172 MB)`  [INFERRED] [semantically similar]
  separation-service/requirements.txt → DEPLOY.md
- `DATABASE_URL (pooled) vs DATABASE_URL_UNPOOLED` --semantically_similar_to--> `Pooled vs direct connections gotcha`  [INFERRED] [semantically similar]
  DEPLOY.md → web/.agents/skills/neon-postgres/SKILL.md
- `Remixt Demo Video Poster (1280x720)` --semantically_similar_to--> `Remixt Social Share Image (1920x1080)`  [INFERRED] [semantically similar]
  web/public/remixt-demo-poster.jpg → remixt-share-1920x1080.png
- `Neon Postgres database (Neon Free)` --conceptually_related_to--> `Lakebase Postgres (neon-postgres skill)`  [INFERRED]
  DEPLOY.md → web/.agents/skills/neon-postgres/SKILL.md

## Import Cycles
- 3-file cycle: `web/src/lib/models.ts -> web/src/lib/schema.ts -> web/src/lib/social.ts -> web/src/lib/models.ts`
- 4-file cycle: `web/src/lib/notifications.ts -> web/src/lib/schema.ts -> web/src/lib/social.ts -> web/src/lib/splitQueue.ts -> web/src/lib/notifications.ts`
- 4-file cycle: `web/src/lib/schema.ts -> web/src/lib/social.ts -> web/src/lib/splitQueue.ts -> web/src/lib/trackUpload.ts -> web/src/lib/schema.ts`
- 4-file cycle: `web/src/lib/live.ts -> web/src/lib/social.ts -> web/src/lib/splitQueue.ts -> web/src/lib/notifications.ts -> web/src/lib/live.ts`
- 5-file cycle: `web/src/lib/live.ts -> web/src/lib/schema.ts -> web/src/lib/social.ts -> web/src/lib/splitQueue.ts -> web/src/lib/notifications.ts -> web/src/lib/live.ts`
- 5-file cycle: `web/src/lib/models.ts -> web/src/lib/schema.ts -> web/src/lib/social.ts -> web/src/lib/splitQueue.ts -> web/src/lib/trackUpload.ts -> web/src/lib/models.ts`

## Hyperedges (group relationships)
- **In-browser song splitting pipeline** — deploy_in_browser_song_splitting, readme_upload_flow, deploy_demucs_onnx_model, deploy_onnx_runtime_web, readme_cross_origin_isolation [INFERRED 0.85]
- **Stem storage backends (Blob, R2, local disk)** — readme_stem_storage, deploy_vercel_blob_stem_store, deploy_cloudflare_r2_stem_store, deploy_docker_all_in_one_image [EXTRACTED 1.00]
- **Lakebase Search retrieval modes** — web__agents_skills_neon_postgres_skill_lakebase_search, web__agents_skills_neon_postgres_references_vector_search_semantic_vector_search, web__agents_skills_neon_postgres_references_full_text_search_bm25_full_text_search, web__agents_skills_neon_postgres_references_hybrid_search_hybrid_search_rrf [EXTRACTED 1.00]
- **Remixt core workflow: split stems, match BPM/pitch, mix, publish** — remixt_share_1920x1080_vocal_beat_split, remixt_share_1920x1080_bpm_pitch_match, remixt_share_1920x1080_multitrack_stem_lanes, remixt_share_1920x1080_publish_remix [EXTRACTED 1.00]
- **PWA / Home-screen App Icon Set** — web_public_remixt_logo_png_apple_touch_icon_apple_touch_icon, web_public_remixt_logo_png_icon_192_icon, web_public_remixt_logo_png_icon_512_icon [INFERRED 0.85]
- **Remixt Mark 1024px Color/Background Variants** — web_public_remixt_logo_png_remixt_mark_1024_mark, web_public_remixt_logo_png_remixt_mark_black_1024_mark_black, web_public_remixt_logo_png_remixt_mark_dark_1024_mark_dark, web_public_remixt_logo_png_remixt_mark_light_1024_mark_light, web_public_remixt_logo_png_remixt_mark_transparent_1024_mark_transparent, web_public_remixt_logo_png_remixt_mark_white_1024_mark_white [INFERRED 0.95]
- **Remixt Horizontal Logo Lockups (light/dark bg)** — web_public_remixt_logo_png_remixt_logo_dark_bg_logo_dark_bg, web_public_remixt_logo_png_remixt_logo_light_bg_logo_light_bg, web_public_remixt_logo_wordmark, web_public_remixt_logo_brand_gradient [INFERRED 0.85]
- **Remixt light/dark theme-paired logo variants** — web_public_remixt_logo_remixt_mark_dark_mark_dark, web_public_remixt_logo_remixt_mark_light_mark_light, web_public_remixt_logo_remixt_logo_dark_bg_logo_dark_bg, web_public_remixt_logo_remixt_logo_light_bg_logo_light_bg, web_public_remixt_logo_remixt_avatar_dark_avatar_dark, web_public_remixt_logo_remixt_avatar_avatar [INFERRED 0.85]
- **Remixt background-free mark variants for overlay use** — web_public_remixt_logo_remixt_mark_transparent_mark_transparent, web_public_remixt_logo_remixt_mark_black_mark_black, web_public_remixt_logo_remixt_mark_white_mark_white [INFERRED 0.85]
- **create-next-app default public icons** — web_public_file_file_icon, web_public_globe_globe_icon, web_public_next_nextjs_wordmark, web_public_vercel_vercel_logo, web_public_window_window_icon [INFERRED 0.95]

## Communities (135 total, 9 thin omitted)

### Community 0 - "Clip Editing Commands"
Cohesion: 0.07
Nodes (119): onContentPointerMove(), nudge(), fixIdeas(), rhythmIdeas(), trimAfter(), cutSilences(), gatePattern(), MAX_AUTOMATION_POINTS (+111 more)

### Community 1 - "AI Ideas & Arrange"
Cohesion: 0.06
Nodes (75): adoptTiming(), ALL_FIXES, applyLevels(), applyMix(), arrange(), arrangementIdeas(), arrangeOnDrop(), balancedLevels() (+67 more)

### Community 2 - "Projects & Remix API"
Cohesion: 0.07
Nodes (67): zod, POST(), GET(), GET(), GET(), GET(), POST(), DELETE() (+59 more)

### Community 3 - "Remix Likes & Plays"
Cohesion: 0.05
Nodes (57): DELETE(), POST(), setLiked(), POST(), ArtistPage(), ArtistRow, generateMetadata(), EmbedPage() (+49 more)

### Community 4 - "DJ Engine Core"
Cohesion: 0.08
Nodes (3): DjEngine, applyMidi(), DeckId

### Community 5 - "DJ Deck Panel UI"
Cohesion: 0.06
Nodes (53): DeckPanel(), Pad(), PAD_JUMPS, PAD_MODE_LABEL, ROLLS, sign(), STEM_BUTTONS, BAND_COLOR (+45 more)

### Community 6 - "Admin & Reports"
Cohesion: 0.07
Nodes (41): next, AdminPage(), metadata, DELETE(), findJunk(), GET(), maxDuration, POST() (+33 more)

### Community 7 - "Live Host Console"
Cohesion: 0.08
Nodes (41): FollowButton(), api(), HostConsole(), chooseRemix(), endSession(), goLive(), saveSettings(), NOTE_PRESETS (+33 more)

### Community 8 - "Examples Lab Matching"
Cohesion: 0.09
Nodes (48): ExamplesPage(), metadata, DEFAULT_PAIR, ExamplesLab(), STEPS, demoLabSong(), EXCERPT_BARS, LabSong (+40 more)

### Community 9 - "AI Producer Panel"
Cohesion: 0.06
Nodes (55): Icon(), afterPaint(), barColor(), Best, DoctorActions, Engines(), FineTune(), FixState (+47 more)

### Community 10 - "Split Job Queue API"
Cohesion: 0.08
Nodes (46): DELETE(), POST(), sessionOf(), POST(), bodySchema, POST(), bodySchema, POST() (+38 more)

### Community 11 - "Studio Arrangement View"
Cohesion: 0.10
Nodes (51): ReadOnlyStudio(), Arrangement(), onContentPointerDown(), onContentPointerUp(), snapDelta(), timeAt(), ClipFades(), ClipHandlers (+43 more)

### Community 12 - "Library Browser & Preview"
Cohesion: 0.08
Nodes (30): lucide-react, react, ChallengeStemCard(), formatDuration(), LibraryBrowser(), StemWithTrack, TabButton(), formatTime() (+22 more)

### Community 13 - "DJ Track Library & AI DJ"
Cohesion: 0.09
Nodes (45): FIT_LABEL, SORTS, TrackLibrary(), AiDj, Phase, browse(), BrowserEntry, BrowserQuery (+37 more)

### Community 14 - "Library Track Decoding"
Cohesion: 0.07
Nodes (51): decoder(), entries, fold(), held, hold(), kept, load(), loadParts() (+43 more)

### Community 15 - "Audio Engine Loading"
Cohesion: 0.11
Nodes (9): audioEngine, clipKey(), renderKey(), reportMixNowPlaying(), sliceBuffer(), stopSources(), used(), fetchStem() (+1 more)

### Community 16 - "In-Browser Demucs Splitter"
Cohesion: 0.08
Nodes (29): demucs-web, wasm-media-encoders, deviceGb(), isConstrainedDevice(), decode(), fetchSongFromLink(), Job, MODEL_URL (+21 more)

### Community 17 - "DJ Gear & Copilot"
Cohesion: 0.10
Nodes (34): DjPage(), metadata, CopilotPanel(), ICON, DjApp(), Mode, OpenDecks(), Briefing() (+26 more)

### Community 18 - "Social Feed & Leaderboard"
Cohesion: 0.09
Nodes (38): LeaderboardPage(), metadata, Rank(), RemixBoard(), RemixThumb(), barsFor(), FAQ, Feature() (+30 more)

### Community 19 - "Split Queue UI"
Cohesion: 0.09
Nodes (38): ago(), duration(), HelperPanel(), jobDetail(), LastBlock(), noSubscription(), QueuedSongRow(), QueuedSongs() (+30 more)

### Community 20 - "Stem Storage Backends"
Cohesion: 0.10
Nodes (32): aws4fetch, GET(), DELETE(), GET(), keyFor(), DELETE(), GET(), imageExtension() (+24 more)

### Community 21 - "Library Split Lab"
Cohesion: 0.08
Nodes (27): Flags, INFO, Kind, LibrarySplit(), NO_FLAGS, Part, PARTS, PARTS_MUTED (+19 more)

### Community 22 - "Audio Graph & Mixdown"
Cohesion: 0.09
Nodes (37): share(), handleExport(), ClipBufferLookup, clipEnvelope(), createLaneChain(), update(), createMasterChain(), update() (+29 more)

### Community 23 - "Live Sessions API"
Cohesion: 0.11
Nodes (37): DELETE(), GET(), PATCH(), patchSchema, createSchema, GET(), POST(), announceLive() (+29 more)

### Community 24 - "DJ Curriculum & Quiz"
Cohesion: 0.08
Nodes (36): DjHome(), ItemButton(), Stars(), ALL_SCENARIOS, barOf(), CHECKRIDES, countTracks(), DRILLS (+28 more)

### Community 25 - "Key & Match Analysis"
Cohesion: 0.11
Nodes (37): AnalysisCard(), LEVEL_STYLE, pct(), Row(), Verdict(), BarGrid(), fixBeatKey(), fixKey() (+29 more)

### Community 26 - "Neural Beat Tracking"
Cohesion: 0.09
Nodes (36): aggregate(), BEAT_NET, cosTable, deduplicate(), fft(), hzToMel(), LEVELS, logMelSpectrogram() (+28 more)

### Community 27 - "Presence & Live Activity"
Cohesion: 0.10
Nodes (34): GET(), POST(), ACTIVITY_ICON, ActivityGlyph(), activityKey(), ActivityText(), ago(), AREA_LABEL (+26 more)

### Community 28 - "Beat-Match Meter & Crowd"
Cohesion: 0.12
Nodes (35): BeatMatchMeter(), FIT_TEXT, Gauge(), CrowdRequest, CrowdState, ECHO_KEYS, fxTotal(), KINDS (+27 more)

### Community 29 - "Lane Pair Matching"
Cohesion: 0.10
Nodes (36): Baseline, Choice(), LaneMatchPanel(), handleApply(), handleUndo(), snapshot(), untouchedSince(), HeardVocal (+28 more)

### Community 30 - "Direct Blob Upload"
Cohesion: 0.10
Nodes (33): @vercel/blob, blobApi(), blobMultipart(), blobRequest(), BlobTarget, FinalUploadError, isFinalStatus(), isHidden() (+25 more)

### Community 31 - "AI Producer Actions"
Cohesion: 0.15
Nodes (37): AiProducer(), analyse(), applyOptions(), chooseSync(), chooseWhole(), close(), findBest(), fixAll() (+29 more)

### Community 32 - "Studio Page & Drafts"
Cohesion: 0.10
Nodes (28): metadata, StudioPage(), CollabBar(), SYNC_LABEL, formatAgo(), SamplePads(), Studio(), leaveTogether() (+20 more)

### Community 33 - "Demo Songs"
Cohesion: 0.09
Nodes (30): DemoList(), State, DEMO_SONGS, DEMO_STEMS, demoSongDef, cache, DemoPeakKey, makeBuffer() (+22 more)

### Community 34 - "AI Trial & Hand Edits"
Cohesion: 0.14
Nodes (33): putBackOn(), compatible(), fixesOf(), HandEdit, Idea, mixFix(), rebaseSession(), recompileIdea() (+25 more)

### Community 35 - "Co-Producer Chat UI"
Cohesion: 0.13
Nodes (34): CoProducer(), chooseModel(), chooseProvider(), forgetKey(), send(), defaultRouterModel(), KeySetup(), save() (+26 more)

### Community 36 - "Track Upload & Stems API"
Cohesion: 0.11
Nodes (27): GET(), POST(), GET(), PATCH(), patchSchema, PUT(), createSchema, GET() (+19 more)

### Community 37 - "Admin Panel UI"
Cohesion: 0.13
Nodes (32): AdminChallenge, AdminPanel(), AdminRemix, AdminReport, AdminTrack, AdminUser, ChallengesTab(), create() (+24 more)

### Community 38 - "Phrase & Beat Arrangement"
Cohesion: 0.12
Nodes (31): findPhrases(), onsetAt(), trackBeats(), argmax(), Arrangement, arrangeVocal(), BeatGrid, beatStructure (+23 more)

### Community 39 - "Embed Player & Waveform"
Cohesion: 0.12
Nodes (27): Clock(), EmbedPlayer(), formatTime(), formatTime(), MixWaveform(), RemixDetailPlayer(), load(), StudioShortcuts() (+19 more)

### Community 41 - "AI Keys & Chat API"
Cohesion: 0.14
Nodes (30): @anthropic-ai/sdk, maxDuration, POST(), DELETE(), GET(), PATCH(), patchSchema, PUT() (+22 more)

### Community 42 - "Brand Logo Assets"
Cohesion: 0.11
Nodes (33): File Icon (document glyph), Globe Icon, Next.js Wordmark Logo, Next.js Starter Template Assets, Remixt Brand Gradient (pink to violet to cyan), Remixt Brand Mark (split audio-waveform bars), Remixt Duotone Palette (pink top / cyan bottom bars), Apple Touch Icon (180px, gradient rounded-square, white bars) (+25 more)

### Community 43 - "Demo Song DSP Instruments"
Cohesion: 0.08
Nodes (32): addClap(), addCrash(), addHat(), addKick(), addReverb(), addRim(), addSnare(), allpass() (+24 more)

### Community 44 - "Link Import & Split Jobs"
Cohesion: 0.11
Nodes (27): bodySchema, maxDuration, POST(), bodySchema, maxDuration, POST(), rights, tags (+19 more)

### Community 45 - "DJ Mixer & EQ"
Cohesion: 0.10
Nodes (26): BANDS, CURVES, FADER_CURVES, MONITORS, Ramp, RecordingResult, SampleKind, Voice (+18 more)

### Community 46 - "Lane FX Panel"
Cohesion: 0.10
Nodes (26): FxSlider(), hz(), LaneFxPanel(), pct(), formatValue(), PARAMS, mixOf(), Store (+18 more)

### Community 47 - "Co-Producer Mix Tools"
Cohesion: 0.12
Nodes (29): checkMix(), findDrop(), harmonyOf(), ideaFits(), sameSong(), aspectsOfEdits(), keepTrial(), revertTrial() (+21 more)

### Community 48 - "Melody & Harmony Analysis"
Cohesion: 0.10
Nodes (25): chooseShift(), StemAnalysis, adviseShift(), chordRows(), Harmony, HarmonyAdvice, HarmonyScan, harmonyStatus() (+17 more)

### Community 49 - "Transport, Key & Master"
Cohesion: 0.14
Nodes (26): FIT, KeyHelper(), isMastered(), MasterPanel(), masterPresetOf(), same(), Slider(), formatBars() (+18 more)

### Community 50 - "Audio Analysis Core"
Cohesion: 0.12
Nodes (30): activeLoudness(), ANALYSIS_RATE, analyzeMono(), autocorrelation(), cache, chromagram(), correlation(), detectKey() (+22 more)

### Community 51 - "Audio Engine Mix State"
Cohesion: 0.08
Nodes (22): bytesOf(), DecodedStem, lastUsed, LoadedLane, PHONE, PlaybackBlockedError, QueuedRender, queueModulation() (+14 more)

### Community 52 - "Upload & Splitter Status"
Cohesion: 0.13
Nodes (24): RootLayout(), ProgressBar(), RigStatus(), formatMB(), SplitterStatus(), BackgroundActivity(), doneText(), UploadList() (+16 more)

### Community 53 - "DJ Controls & Auto-Gain"
Cohesion: 0.10
Nodes (25): BarCounter(), AUTO_GAIN_TARGET_DB, autoGainDb(), barBeat(), beatFraction(), beatIndex(), CLIP, DETENT (+17 more)

### Community 54 - "DJ Deck Units"
Cohesion: 0.11
Nodes (6): DemoStem, dbToGain(), DeckUnit, makeImpulse(), LoopState, StemSlot

### Community 55 - "Python Separation Service"
Cohesion: 0.12
Nodes (6): compute_peaks(), detect_bpm(), health(), load_and_encode(), separate(), SeparateRequest

### Community 56 - "Vocal Recorder"
Cohesion: 0.14
Nodes (22): formatTime(), LevelMeter(), VocalRecorder(), begin(), keep(), listen(), stopPreview(), upload() (+14 more)

### Community 57 - "Remix Stats & Social Clip"
Cohesion: 0.15
Nodes (18): qrcode, formatCount(), RemixStatsBar(), share(), REASONS, ShareMenu(), clipRange(), formatTime() (+10 more)

### Community 58 - "Web Package Dependencies"
Cohesion: 0.08
Nodes (24): bcryptjs, eslint, eslint-config-next, jose, onnxruntime-web, react-dom, tailwindcss, @tailwindcss/postcss (+16 more)

### Community 59 - "Live Chat & Mix API"
Cohesion: 0.16
Nodes (20): POST(), PUT(), POST(), schema, POST(), PUT(), stateSchema, cleanChat() (+12 more)

### Community 60 - "DJ Progress Logic"
Cohesion: 0.14
Nodes (21): alignedPosition(), tempoEquivalence(), emptyDeck(), emptySnapshot(), cache, EMPTY, emptyProgress(), isRecord() (+13 more)

### Community 61 - "DJ JS Voices"
Cohesion: 0.10
Nodes (8): keyLockTrim(), loopAwareDiff(), canRunJsVoices(), JsVoice, KeyLockVoice, ScratchVoice, StemMixer, VoiceHost

### Community 62 - "DJ Scenarios"
Cohesion: 0.10
Nodes (14): djTrackInfo(), CheckCtx, deckName(), fmt(), MISSIONS, Objective, phaseHint(), ScenarioCategory (+6 more)

### Community 63 - "Build Scripts & Config"
Cohesion: 0.10
Nodes (15): postgres, nextConfig, tunnelHost, files, from, root, stretchFrom, stretchTo (+7 more)

### Community 64 - "Auto-Match Pipeline"
Cohesion: 0.15
Nodes (22): buildUpTo(), analyzeStem(), PRE_ROLL, TAIL, ALL_STEPS, analyzeBeatLane(), analyzeGuide(), analyzeLane() (+14 more)

### Community 65 - "Collab Sessions"
Cohesion: 0.19
Nodes (12): CollabMember, CollabSession, connectCollab(), idle, joinSharedSession(), mergeShared(), normalise(), same() (+4 more)

### Community 66 - "Examples Library Excerpts"
Cohesion: 0.15
Nodes (20): libraryLabSong(), alignExcerpt(), Excerpt, firstStrongPhrase(), KnownSong, LIBRARY_PREFIX, LibraryRecipe, libraryRecipes() (+12 more)

### Community 67 - "Live Chat UI"
Cohesion: 0.11
Nodes (19): Avatar(), LiveChat(), submit(), Message(), readGuestName(), FollowStatus, hostPosition(), LiveConnection (+11 more)

### Community 68 - "Upload Manager"
Cohesion: 0.15
Nodes (19): QueueNotice(), nameList(), noSubscription(), skippedMessage(), SplitterInfo(), StatusBadge(), Stem, StemMiniRow() (+11 more)

### Community 69 - "Demo Song Definitions"
Cohesion: 0.11
Nodes (18): CHORD_INTERVALS, ChordDef, ChordQuality, CHORUS_CYCLE, DEMO_SONG_DEFS, SectionName, songBars(), songMeta() (+10 more)

### Community 70 - "OpenRouter Models"
Cohesion: 0.16
Nodes (18): check(), GET(), AI_MODELS, Block, checkOpenRouterKey(), Completion, fromOpenAi(), headers() (+10 more)

### Community 71 - "Navigation Bar"
Cohesion: 0.18
Nodes (14): MobileTabBar(), Tab(), AccountMenu(), MoreLinks(), NavBar(), ICONS, isActive(), MORE_LINKS (+6 more)

### Community 72 - "Lane Split & Beat Parts"
Cohesion: 0.20
Nodes (18): SplitLaneDialog(), finish(), start(), cache, findParts(), placeStems(), siblingStems(), swapInParts() (+10 more)

### Community 73 - "DJ Scenario Runner"
Cohesion: 0.18
Nodes (12): crowdScore(), newCrowd(), detectEqSwap(), EqSample, DjSnapshot, buildDebrief(), Debrief, mulberry32() (+4 more)

### Community 74 - "Package Runtime Deps"
Cohesion: 0.10
Nodes (21): dependencies, @anthropic-ai/sdk, aws4fetch, bcryptjs, demucs-web, jose, lucide-react, next (+13 more)

### Community 75 - "Challenges"
Cohesion: 0.19
Nodes (17): GET(), schema, GET(), ChallengeDetail(), ChallengesPage(), metadata, timeLeft(), PlaceMedal() (+9 more)

### Community 76 - "Party Stage (Three.js)"
Cohesion: 0.16
Nodes (16): three, CAMERAS, hasWebGL(), PartyHandle, readBands(), Avatar, bubble(), CameraMode (+8 more)

### Community 77 - "DJ Loops & Position"
Cohesion: 0.22
Nodes (4): resizeLoop(), alignShiftSeconds(), beatSeconds(), floorToGrid()

### Community 79 - "TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+11 more)

### Community 80 - "Auth Login/Signup"
Cohesion: 0.18
Nodes (12): POST(), schema, POST(), POST(), schema, clearSessionCookie(), createSessionCookie(), hashPassword() (+4 more)

### Community 81 - "DJ Missions & Scoring"
Cohesion: 0.15
Nodes (17): CamelotWheel(), CATEGORY_LABEL, CrowdBar(), Quiz(), RunnerView, wrap12(), MissionResult, clamp100() (+9 more)

### Community 82 - "Lane Inspector & Tap Tempo"
Cohesion: 0.21
Nodes (14): askAbout(), EditTab(), formatOffset(), InspectorBody(), LaneInspector(), MixTab(), Row(), selectIfNone() (+6 more)

### Community 83 - "Studio Shortcuts & Pads"
Cohesion: 0.16
Nodes (15): PAD_KEYS, GROUPS, handleKey(), isTyping(), Mode, scrollToLane(), Shortcut, stepSelection() (+7 more)

### Community 84 - "DJ MIDI Mapping"
Cohesion: 0.22
Nodes (12): MidiPanel(), controlKey(), learn(), loadMidiMap(), MIDI_ACTIONS, MidiAction, MidiLink, MidiMap (+4 more)

### Community 85 - "Split Helper Tabs"
Cohesion: 0.20
Nodes (7): ifNoOtherTabHelping(), LostJob, splitHelper, done(), stageName(), stageProgress(), tabSession()

### Community 86 - "SoundTouch Typings"
Cohesion: 0.11
Nodes (5): FifoSampleBuffer, SimpleFilter, SoundTouch, soundtouchjs, WebAudioBufferSource

### Community 87 - "Test Runner Script"
Cohesion: 0.14
Nodes (9): databaseUrl, envLocal(), log, prepareDatabase(), root, server, serverEnv, storage (+1 more)

### Community 88 - "RTL & OG Text"
Cohesion: 0.22
Nodes (11): CardText(), BidiRun, bidiRuns(), FORMS, hasRtl(), joinLetters(), joins(), joinsForward() (+3 more)

### Community 89 - "Remix Comments"
Cohesion: 0.18
Nodes (11): zustand, ago(), AtPlayhead(), formatAt(), RemixComments(), ContextMenuHost(), isSheet(), MenuItem (+3 more)

### Community 90 - "Brand Mark Code"
Cohesion: 0.25
Nodes (13): barFill(), MARK_BAR_WIDTH, MARK_BARS, MARK_GRADIENT, MARK_TILE_RADIUS, markSvg(), MarkVariant, drawFrame() (+5 more)

### Community 92 - "Split Queue Tests"
Cohesion: 0.23
Nodes (14): body(), claim(), claimJob(), Client, deliverStems(), expectStatus(), jobRow(), ownerJobs() (+6 more)

### Community 93 - "Icons & AI Control"
Cohesion: 0.14
Nodes (10): IconName, ICONS, MEDAL_COLORS, ALL_ASPECTS, Aspect, ASPECTS, loadKeepWhole(), loadSync() (+2 more)

### Community 94 - "Demo Song Mixing DSP"
Cohesion: 0.25
Nodes (15): activeRms(), addTone(), applyDuck(), balanceStems(), barTable(), blank(), chordMidis(), midiHz() (+7 more)

### Community 95 - "Ranged Stem Fetch"
Cohesion: 0.19
Nodes (8): fetchInSlices(), fetchRange(), fetchWhole(), downloadSource(), download(), FILE, Handler, server

### Community 96 - "Marketing Share Images"
Cohesion: 0.23
Nodes (12): App Navigation: Library / Studio / Remixes / Upload, BPM & Pitch Match feature (Sync BPM), remixt-free.vercel.app (Vercel deployment), Multitrack Stem Lanes (VOCALS/BEAT waveforms with Vol & Pitch sliders), Publish Remix Under Your Name, Remixt Brand (gradient R logo, pink-purple-cyan palette), Remixt Social Share Image (1920x1080), Studio Page Mockup (remixt-free.vercel.app/studio) (+4 more)

### Community 97 - "App Icons"
Cohesion: 0.22
Nodes (10): GET(), SIZES, AppleIcon(), contentType, size, contentType, Icon(), size (+2 more)

### Community 98 - "Login & Signup Pages"
Cohesion: 0.21
Nodes (8): Error(), Field(), LoginPage(), metadata, NotFound(), Field(), SignupPage(), RemixtMark()

### Community 99 - "Remix Owner Controls & Tags"
Cohesion: 0.23
Nodes (7): RemixOwnerControls(), TagInput(), add(), GENRE_TAGS, MAX_TAGS, MOOD_TAGS, normaliseTag()

### Community 100 - "README Feature Overview"
Cohesion: 0.19
Nodes (10): AI co-producer (Ask AI tab, per-user Anthropic/OpenRouter keys), AI producer panel (aiIdeas.ts, aiTrial.ts, AiProducer.tsx), Arrangement engine (lib/client/analysis.ts, arrange.ts), Clip editing pure functions (lib/client/clipEdit.ts, clipCommands.ts), Export WAV bounce, Find a match (lib/client/matchFinder.ts), Per-lane Match panel (matchOptions.ts, pairMatch.ts, LaneMatchPanel.tsx), Master bus mastering presets (+2 more)

### Community 101 - "Pitch/Tempo Stretching"
Cohesion: 0.24
Nodes (10): signalsmith-stretch, soundtouchjs, hasSound(), renderHq(), renderInWorker(), renderOnPage(), renderPitchTempo(), stretchEngine (+2 more)

### Community 102 - "Package Dev Deps"
Cohesion: 0.15
Nodes (13): devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/bcryptjs, @types/node, @types/qrcode (+5 more)

### Community 103 - "Live Session Pages"
Cohesion: 0.22
Nodes (9): dynamic, LiveSessionPage(), dynamic, metadata, NewLivePage(), GoLiveForm(), localInputValue(), RemixChoice (+1 more)

### Community 104 - "Media Session Now Playing"
Cohesion: 0.21
Nodes (12): NOW_PLAYING_ARTWORK, apply(), artworkFor(), getPlayingRemix(), lastPosition, mediaSession(), NowPlaying, Owner (+4 more)

### Community 105 - "Match Finder"
Cohesion: 0.27
Nodes (10): cache, Kind, libraryStems(), MatchFinder(), add(), Candidate, describeFit(), rankByTempo() (+2 more)

### Community 106 - "Demucs Typings"
Cohesion: 0.17
Nodes (7): Channels, demucs-web, demucs-web/constants, demucs-web/processor, DemucsProcessor, Progress, Spec

### Community 107 - "Self-Host Deployment"
Cohesion: 0.24
Nodes (10): Caddy automatic HTTPS (DOMAIN env var), Cloudflare R2 stem storage, Deploying Remixt (deployment guide), All-in-one Docker image (app + Postgres + Caddy, /data volume), DuckDNS free domain, Oracle Cloud Always Free ARM server setup, Vercel Blob stem store, Free on Vercel with Neon and Vercel Blob (+2 more)

### Community 108 - "Live Tests"
Cohesion: 0.25
Nodes (8): chat(), Client, feed(), json(), ok(), remixOf(), signUp(), sql

### Community 109 - "Live Listing Page"
Cohesion: 0.29
Nodes (7): dynamic, LivePage(), metadata, AutoRefresh(), LiveCard(), when(), LiveBadge()

### Community 110 - "Live Studio Diff"
Cohesion: 0.27
Nodes (6): describeMixChanges(), DiffLane, DiffMix, FX_WORDS, laneLabel(), same()

### Community 111 - "Tunnel & Isolation Docs"
Cohesion: 0.20
Nodes (8): Cloudflare Tunnel deployment (no open ports), ONNX Runtime Web (~28 MB, WebGPU/WASM), Sessions as signed JWT in HTTP-only cookie, allowedDevOrigins in web/next.config.ts, Named Cloudflare tunnel with --protocol http2, ngrok tunnel provider, serveo SSH tunnel provider, share.sh public tunnel for local Remixt

### Community 112 - "Neon DB & Local Dev Docs"
Cohesion: 0.22
Nodes (9): Neon Postgres database (Neon Free), DATABASE_URL (pooled) vs DATABASE_URL_UNPOOLED, Schema setup (web/scripts/schema.sql, scripts/migrate.mjs), Community features (web/src/lib/social.ts), Remixt (browser-based remix DAW), start-dev.sh local development, XP, levels, badges and leaderboard, Neon connection pooling (PgBouncer transaction mode) (+1 more)

### Community 113 - "MP3 Encoding"
Cohesion: 0.40
Nodes (7): channels(), encodeMp3(), encodeMp3Bytes(), Mp3Response, encodePcmToMp3(), Mp3Bitrate, Mp3Request

### Community 114 - "Splitting Architecture Docs"
Cohesion: 0.33
Nodes (7): Demucs ONNX model (htdemucs_embedded.onnx, ~172 MB), Remixt architecture (web/, Postgres, stem storage), Legacy separation-service (Python/Demucs, unused), Split lane with Demucs (laneSplit.ts, beatParts.ts, SplitLaneDialog.tsx), Stem storage selection (Blob, R2, local disk), Browser upload flow (splitter.ts, splitter.worker.ts, /api/tracks), Python separation service dependencies (FastAPI, demucs 4.0.1, librosa)

### Community 115 - "Neon Platform Skill"
Cohesion: 0.39
Nodes (9): Neon Managed Better Auth, Claimable Neon (no-signup temporary project), Neon Function Triggers (schedule, storage_object_created), Branch-scoped logs, Loki API and Grafana, parseEnv type-safe env vars (@neon/env), @neon/sdk TypeScript Neon API client, Neon Functions, Neon backend primitives (neon skill) (+1 more)

### Community 116 - "Notifications"
Cohesion: 0.36
Nodes (7): describe(), hrefFor(), metadata, NotificationsPage(), timeAgo(), MarkNotificationsRead(), Notification

### Community 117 - "Remix Cover Images"
Cohesion: 0.36
Nodes (6): RemixCover(), pick(), decode(), Decoded, squareCover(), uploadCover()

### Community 118 - "Lakebase Search Skill"
Cohesion: 0.32
Nodes (8): Full-text search with BM25 (lakebase_text, lakebase_bm25), Hybrid search with reciprocal rank fusion, Semantic vector search (lakebase_vector, lakebase_ann), Neon database branching, Lakebase Postgres (neon-postgres skill), Lakebase Search, Scale to zero / autoscaling, Branch-first dev flow

### Community 119 - "Package Scripts"
Cohesion: 0.25
Nodes (8): scripts, build, dev, lint, prebuild, predev, start, test

### Community 120 - "Automation Lane"
Cohesion: 0.43
Nodes (6): AutomationLane(), at(), commit(), handleDown(), handleMove(), remove()

### Community 121 - "Share & Run Scripts"
Cohesion: 0.29
Nodes (3): PATH, run.sh script, share.sh script

### Community 122 - "OpenGraph Images"
Cohesion: 0.33
Nodes (6): alt, contentType, Image(), size, Image(), cardFonts()

### Community 123 - "PWA Install Prompt"
Cohesion: 0.48
Nodes (6): InstallEvent, InstallPrompt(), dismiss(), install(), read(), write()

### Community 124 - "Go Live Studio Button"
Cohesion: 0.38
Nodes (6): api(), GoLiveStudioButton(), endExistingAndStart(), start(), end(), goLive()

### Community 125 - "Test Module Resolver"
Cohesion: 0.40
Nodes (3): resolve(), src, withExtension()

### Community 126 - "Live Studio Broadcast"
Cohesion: 0.47
Nodes (6): mixFields(), startStudioBroadcast(), scheduleMix(), scheduleState(), sendMix(), sendState()

### Community 127 - "Co-Producer Prompt & Tools"
Cohesion: 0.40
Nodes (4): COPRODUCER_SYSTEM, COPRODUCER_TOOLS, CoproducerToolName, MAX_TOOL_ROUNDS

### Community 128 - "Docker Entrypoint"
Cohesion: 1.00
Nodes (3): log(), entrypoint.sh script, shutdown()

## Ambiguous Edges - Review These
- `Remixt Brand Gradient (pink to violet to cyan)` → `Remixt Mark - Black Monochrome`  [AMBIGUOUS]
  web/public/remixt-logo/remixt-mark-black.svg · relation: references
- `Remixt Brand Gradient (pink to violet to cyan)` → `Remixt Mark - White Monochrome`  [AMBIGUOUS]
  web/public/remixt-logo/remixt-mark-white.svg · relation: references

## Knowledge Gaps
- **640 isolated node(s):** `PATH`, `start-dev.sh script`, `eslintConfig`, `tunnelHost`, `nextConfig` (+635 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 875 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Remixt Brand Gradient (pink to violet to cyan)` and `Remixt Mark - Black Monochrome`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **Why does `next` connect `Admin & Reports` to `Projects & Remix API`, `Remix Likes & Plays`, `Live Host Console`, `Examples Lab Matching`, `Split Job Queue API`, `Library Browser & Preview`, `DJ Track Library & AI DJ`, `DJ Gear & Copilot`, `Social Feed & Leaderboard`, `Split Queue UI`, `Stem Storage Backends`, `Library Split Lab`, `Live Sessions API`, `DJ Curriculum & Quiz`, `Presence & Live Activity`, `Studio Page & Drafts`, `Track Upload & Stems API`, `Admin Panel UI`, `Embed Player & Waveform`, `AI Keys & Chat API`, `Link Import & Split Jobs`, `Transport, Key & Master`, `Upload & Splitter Status`, `Vocal Recorder`, `Remix Stats & Social Clip`, `Web Package Dependencies`, `Live Chat & Mix API`, `Build Scripts & Config`, `Live Chat UI`, `Upload Manager`, `OpenRouter Models`, `Navigation Bar`, `Challenges`, `Auth Login/Signup`, `DJ Missions & Scoring`, `Remix Comments`, `App Icons`, `Login & Signup Pages`, `Remix Owner Controls & Tags`, `Live Session Pages`, `Live Listing Page`, `Notifications`, `Remix Cover Images`?**
  _High betweenness centrality (0.160) - this node is a cross-community bridge._
- **What connects `PATH`, `start-dev.sh script`, `eslintConfig` to the rest of the system?**
  _640 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Clip Editing Commands` be split into smaller, more focused modules?**
  _Cohesion score 0.06599175103112111 - nodes in this community are weakly interconnected._
- **What is the exact relationship between `Remixt Brand Gradient (pink to violet to cyan)` and `Remixt Mark - White Monochrome`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **Why does `react` connect `Library Browser & Preview` to `Remix Likes & Plays`, `DJ Deck Panel UI`, `Live Host Console`, `Examples Lab Matching`, `AI Producer Panel`, `Studio Arrangement View`, `DJ Track Library & AI DJ`, `Library Track Decoding`, `In-Browser Demucs Splitter`, `DJ Gear & Copilot`, `Social Feed & Leaderboard`, `Split Queue UI`, `Library Split Lab`, `DJ Curriculum & Quiz`, `Key & Match Analysis`, `Presence & Live Activity`, `Beat-Match Meter & Crowd`, `Lane Pair Matching`, `Studio Page & Drafts`, `Demo Songs`, `Co-Producer Chat UI`, `Track Upload & Stems API`, `Admin Panel UI`, `Embed Player & Waveform`, `DJ Mixer & EQ`, `Lane FX Panel`, `Transport, Key & Master`, `Upload & Splitter Status`, `Vocal Recorder`, `Remix Stats & Social Clip`, `Web Package Dependencies`, `Live Chat UI`, `Upload Manager`, `Navigation Bar`, `Lane Split & Beat Parts`, `Party Stage (Three.js)`, `DJ Missions & Scoring`, `Lane Inspector & Tap Tempo`, `Studio Shortcuts & Pads`, `DJ MIDI Mapping`, `Remix Comments`, `Brand Mark Code`, `Login & Signup Pages`, `Remix Owner Controls & Tags`, `Live Session Pages`, `Match Finder`, `Live Listing Page`, `Notifications`, `Remix Cover Images`, `PWA Install Prompt`?**
  _High betweenness centrality (0.150) - this node is a cross-community bridge._
- **Should `AI Ideas & Arrange` be split into smaller, more focused modules?**
  _Cohesion score 0.057181942544459644 - nodes in this community are weakly interconnected._