# Graph Report - code  (2026-10-16)

## Corpus Check
- 461 files · ~530,738 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 12 file(s) not represented in the graph (top: (none) 7, .ttf 2, .ico 2)

## Summary
- 4600 nodes · 14275 edges · 175 communities (150 shown, 25 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 198 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9d9b1234`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- DjEngine
- app/page.tsx
- aiIdeas.ts
- aiTrial.ts
- getCurrentUser
- djMidi.ts
- sql
- dj-realism.test.ts
- models.ts
- LiveReplay.tsx
- djMath.ts
- modulation.ts
- SocialClipButton.tsx
- react
- AdminPanel.tsx
- SongPicker.tsx
- studioHistory.ts
- clipCommands.ts
- audioEngine.ts
- Arrangement.tsx
- harmony.ts
- challenges.ts
- remixes/[id]/page.tsx
- demoSongsDsp.ts
- Lakebase Postgres
- analysis.ts
- djEngine.ts
- AiProducer
- TagInput.tsx
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
- MixerConsole.tsx
- Remixt Brand Mark (split audio-waveform bars)
- Helper
- PartyWorld
- keyLabel
- remixLanes.ts
- appIcon
- StudioTransport.tsx
- exportJob.ts
- package.json
- app.py
- UploadActivity.tsx
- splitter.ts
- VocalRecorder.tsx
- listening.test.ts
- MissionSession.tsx
- projects.ts
- musicKey.ts
- UploadManager.tsx
- aiKeys.ts
- exportMeta.ts
- collab.ts
- libraryAudio.ts
- extras.tsx
- InstallPrompt.tsx
- ai/chat/route.ts
- NavBar.tsx
- schema.sql
- StudioLane
- dependencies
- studioStore.ts
- autoMatch.ts
- ref_path
- RemixComments.tsx
- openrouter.ts
- auth.ts
- pairMatch.ts
- arrange.ts
- FakeContext
- compilerOptions
- LineCard.tsx
- SplitLaneDialog.tsx
- mp3.ts
- liveSync.ts
- next
- client/splitQueue.ts
- soundtouchjs.d.ts
- liveStudio.ts
- autoMix.ts
- Live.tsx
- aiExplain.ts
- test.mjs
- rtlText.ts
- isConstrainedDevice
- uploads.ts
- Remixt
- RemixCover.tsx
- devDependencies
- coproducerTools.ts
- neuralBeats.ts
- scenarios.ts
- Remixt Social Share Image (1920x1080)
- RemixtMark
- StudioShortcuts.tsx
- heavy-play.mjs
- demoSongDefs.ts
- pitchTempo.ts
- DeckId
- Studio.tsx
- stemKinds.ts
- FakeParam
- audioEngine
- demucs-web.d.ts
- audioGraph.ts
- liveStudioDiff.ts
- stretchWorkers.ts
- scripts
- live.test.ts
- Free on Vercel, with Neon and Vercel Blob
- partyWorld.ts
- .play
- Sharing Remixt with someone else
- curriculum.ts
- Free, all in one place: Oracle Cloud
- run.sh
- .renderClip
- kindLabel
- DeckUnit
- Deploying Remixt
- Deployment options (Vercel, Oracle Cloud, own Docker server)
- Your own server (Docker)
- In-browser song splitter (Demucs via ONNX)
- linkImport.ts
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
- KeyLockVoice
- Python separation service dependencies (FastAPI, demucs 4.0.1, librosa)
- FakeContext
- web/CLAUDE.md
- Google Search Console site verification file
- CONSTANTS
- seed-library.ts
- LaneInspector.tsx
- DjConsole
- renderVocal
- mediaSession.ts
- HostConsole
- LabAudio
- MatchFinder.tsx
- shared-results.test.ts
- notifications/page.tsx
- EqBand
- history-steps.test.ts
- ref_node_fs
- FakeOfflineContext
- UpdatePrompt.tsx
- eslint.config.mjs
- Logs: CLI, Loki, and SDK pagination
- allowScripts

## God Nodes (most connected - your core abstractions)
1. `next` - 139 edges
2. `useStudioStore` - 136 edges
3. `sql` - 135 edges
4. `getCurrentUser()` - 133 edges
5. `DjEngine` - 130 edges
6. `react` - 122 edges
7. `AiProducer()` - 104 edges
8. `audioEngine` - 97 edges
9. `lucide-react` - 97 edges
10. `DeckId` - 83 edges

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

## Communities (175 total, 25 thin omitted)

### Community 0 - "DjEngine"
Cohesion: 0.09
Nodes (4): emptyHotCues(), DjEngine, makeImpulse(), setup()

### Community 1 - "app/page.tsx"
Cohesion: 0.06
Nodes (61): DELETE(), GET(), POST(), postSchema, visible(), DELETE(), handle(), POST() (+53 more)

### Community 2 - "aiIdeas.ts"
Cohesion: 0.06
Nodes (78): activeShare(), adoptTiming(), ALL_FIXES, applyLevels(), applyMix(), arrange(), arrangementIdeas(), arrangeOnDrop() (+70 more)

### Community 3 - "aiTrial.ts"
Cohesion: 0.08
Nodes (48): fixGroups(), HandEdit, mixSignature(), pickPair(), prepareSession(), rebaseSession(), timingSignature(), applyScope() (+40 more)

### Community 4 - "getCurrentUser"
Cohesion: 0.08
Nodes (56): GET(), DELETE(), GET(), DELETE(), POST(), sessionOf(), POST(), bodySchema (+48 more)

### Community 5 - "djMidi.ts"
Cohesion: 0.24
Nodes (11): MidiPanel(), controlKey(), learn(), loadMidiMap(), MIDI_ACTIONS, MidiAction, MidiLink, MidiMap (+3 more)

### Community 6 - "sql"
Cohesion: 0.06
Nodes (67): zod, DELETE(), findJunk(), GET(), maxDuration, POST(), GET(), DELETE() (+59 more)

### Community 7 - "dj-realism.test.ts"
Cohesion: 0.11
Nodes (30): barOf(), startOffsetOnPhrase(), AUTO_GAIN_TARGET_DB, autoGainDb(), barBeat(), beatFraction(), beatIndex(), CLIP (+22 more)

### Community 8 - "models.ts"
Cohesion: 0.06
Nodes (63): GET(), kept(), redirect(), DELETE(), GET(), keyFor(), DELETE(), GET() (+55 more)

### Community 9 - "LiveReplay.tsx"
Cohesion: 0.11
Nodes (21): dynamic, LiveSessionPage(), FollowButton(), Heat(), LiveReplay(), laneAudible(), StemStrips(), ReplayClock (+13 more)

### Community 10 - "djMath.ts"
Cohesion: 0.09
Nodes (55): CrowdRequest, crowdScore(), CrowdState, ECHO_KEYS, fxTotal(), KINDS, newCrowd(), REQUEST_TEXT (+47 more)

### Community 11 - "modulation.ts"
Cohesion: 0.14
Nodes (19): AutomationLane(), at(), commit(), handleDown(), handleMove(), remove(), formatValue(), PARAMS (+11 more)

### Community 12 - "SocialClipButton.tsx"
Cohesion: 0.13
Nodes (24): formatCount(), RemixStatsBar(), share(), ShareMenu(), clipRange(), formatTime(), noSubscription(), SocialClipButton() (+16 more)

### Community 13 - "react"
Cohesion: 0.14
Nodes (26): lucide-react, react, NOTE_PRESETS, RemixChoice, Countdown(), emptyRecap(), LiveBadge(), LiveRoom() (+18 more)

### Community 14 - "AdminPanel.tsx"
Cohesion: 0.06
Nodes (59): Claim, Claimable Neon, If neon claim is missing, Path, With REST, With the CLI, Function Triggers (CLI, MCP, REST), AdminPage() (+51 more)

### Community 15 - "SongPicker.tsx"
Cohesion: 0.14
Nodes (26): Flags, INFO, Kind, LibrarySplit(), NO_FLAGS, Part, PARTS, PARTS_MUTED (+18 more)

### Community 16 - "studioHistory.ts"
Cohesion: 0.11
Nodes (26): clearDraft(), draftNow(), hasWork(), normaliseDraft(), projectOf(), readDraft(), removeLocal(), startDraftAutosave() (+18 more)

### Community 17 - "clipCommands.ts"
Cohesion: 0.13
Nodes (54): cutSilences(), gatePattern(), MAX_AUTOMATION_POINTS, pumpPattern(), spliceAutomation(), clearAutomation(), clearSelection(), clipFade() (+46 more)

### Community 18 - "audioEngine.ts"
Cohesion: 0.06
Nodes (25): bytesOf(), clipKey(), DecodedStem, decodeGate, Gate, lastUsed, LoadedLane, PHONE (+17 more)

### Community 19 - "Arrangement.tsx"
Cohesion: 0.11
Nodes (46): AiSection(), Arrangement(), onContentPointerDown(), onContentPointerMove(), onContentPointerUp(), snapDelta(), timeAt(), ClipFades() (+38 more)

### Community 20 - "harmony.ts"
Cohesion: 0.12
Nodes (16): StemAnalysis, accentCache, accents(), chordRows(), Harmony, HarmonyAdvice, HarmonyScan, harmonyStatus() (+8 more)

### Community 21 - "challenges.ts"
Cohesion: 0.16
Nodes (20): GET(), POST(), schema, GET(), ChallengeDetail(), ChallengesPage(), metadata, timeLeft() (+12 more)

### Community 22 - "remixes/[id]/page.tsx"
Cohesion: 0.06
Nodes (45): DELETE(), POST(), setLiked(), POST(), ArtistPage(), ArtistRow, generateMetadata(), geistMono (+37 more)

### Community 23 - "demoSongsDsp.ts"
Cohesion: 0.08
Nodes (33): CHORD_INTERVALS, SongStyle, addClap(), addCrash(), addHat(), addKick(), addReverb(), addRim() (+25 more)

### Community 24 - "Lakebase Postgres"
Cohesion: 0.05
Nodes (41): Full-Text Search with BM25 Ranking, Prepare and Index Text, Query and Interpret Scores, Set Parameters at Build Time or Per Query, Set the Candidate Limit, Use Prefilter Selectively, Adapt the Hybrid Search, Hybrid Search (+33 more)

### Community 25 - "analysis.ts"
Cohesion: 0.09
Nodes (42): activeLoudness(), ANALYSIS_RATE, analyzeAndKeep(), analyzeMono(), autocorrelation(), cache, chromagram(), correlation() (+34 more)

### Community 26 - "djEngine.ts"
Cohesion: 0.04
Nodes (99): BeatMatchMeter(), FIT_TEXT, Gauge(), BarCounter(), DeckPanel(), Pad(), PAD_JUMPS, PAD_MODE_LABEL (+91 more)

### Community 27 - "AiProducer"
Cohesion: 0.12
Nodes (52): AiProducer(), analyse(), applyOptions(), changeScope(), chooseSync(), chooseTiming(), chooseWhole(), close() (+44 more)

### Community 28 - "TagInput.tsx"
Cohesion: 0.23
Nodes (7): RemixOwnerControls(), TagInput(), add(), GENRE_TAGS, MAX_TAGS, MOOD_TAGS, normaliseTag()

### Community 29 - "examplesLibrary.ts"
Cohesion: 0.10
Nodes (29): demoLabSong(), EXCERPT_BARS, LabSong, libraryLabSong(), LibraryState, LoadedTrack, Found, alignExcerpt() (+21 more)

### Community 30 - "clipEdit.ts"
Cohesion: 0.16
Nodes (41): asWholeTake(), cleanClip(), ClipClipboard, clipId(), clipSpan(), concrete(), concreteIds(), continues() (+33 more)

### Community 31 - "demoSongs.ts"
Cohesion: 0.11
Nodes (30): useSide(), BEAT_PARTS, COLORS, DemoSplit(), Flags, NONE, STAGES, StemRow() (+22 more)

### Community 32 - "SplitQueue.tsx"
Cohesion: 0.12
Nodes (28): ago(), duration(), HelperPanel(), jobDetail(), LastBlock(), noSubscription(), QueuedSongRow(), QueuedSongs() (+20 more)

### Community 33 - "Neon"
Cohesion: 0.05
Nodes (41): Data API external JWKS, Functions: verify the JWT, then authorize the user, Incompatibilities, Managed Better Auth, Trusted domains, 1. Install the Neon CLI, 2. Install the Neon MCP Server, 3. Install Neon Agent Skills (+33 more)

### Community 34 - "MatchStep.tsx"
Cohesion: 0.09
Nodes (41): AnalysisCard(), LEVEL_STYLE, pct(), Row(), Verdict(), BarGrid(), MatchStep(), prepare() (+33 more)

### Community 35 - "AiProducer.tsx"
Cohesion: 0.04
Nodes (75): ArtistProgressCard(), Icon(), IconName, ICONS, MEDAL_COLORS, Best, CheckActions, FixState (+67 more)

### Community 36 - "mixdown.ts"
Cohesion: 0.11
Nodes (35): createLaneChain(), routeCompressor(), routeDrive(), routeReverb(), update(), createMasterChain(), update(), driveCurve() (+27 more)

### Community 37 - "audioTags.ts"
Cohesion: 0.22
Nodes (24): share(), asciiUrl(), audioFileName(), AudioTags, chunk(), comment(), concat(), creditLine() (+16 more)

### Community 38 - "directUpload.ts"
Cohesion: 0.10
Nodes (32): @vercel/blob, blobApi(), blobMultipart(), blobRequest(), BlobTarget, FinalUploadError, isFinalStatus(), isHidden() (+24 more)

### Community 39 - "CoProducer.tsx"
Cohesion: 0.12
Nodes (38): @anthropic-ai/sdk, CoProducer(), chooseModel(), chooseProvider(), forgetKey(), moveToAccount(), send(), defaultRouterModel() (+30 more)

### Community 40 - "libraryTracks.ts"
Cohesion: 0.14
Nodes (23): decoder(), entries, fold(), held, hold(), kept, load(), loadParts() (+15 more)

### Community 41 - "MixerConsole.tsx"
Cohesion: 0.14
Nodes (25): isMastered(), MasterPanel(), masterPresetOf(), same(), Slider(), buffers, bypassed, ChannelStrip (+17 more)

### Community 42 - "Remixt Brand Mark (split audio-waveform bars)"
Cohesion: 0.11
Nodes (33): File Icon (document glyph), Globe Icon, Next.js Wordmark Logo, Next.js Starter Template Assets, Remixt Brand Gradient (pink to violet to cyan), Remixt Brand Mark (split audio-waveform bars), Remixt Duotone Palette (pink top / cyan bottom bars), Apple Touch Icon (180px, gradient rounded-square, white bars) (+25 more)

### Community 43 - "Helper"
Cohesion: 0.16
Nodes (10): Line, QuickHelp(), send(), SUGGESTIONS, CoproducerContext, runCoproducerTool(), Helper, persian() (+2 more)

### Community 44 - "PartyWorld"
Cohesion: 0.09
Nodes (6): bubble(), canvasSprite(), emojiTexture(), nameLabel(), PartyWorld, roundRect()

### Community 45 - "keyLabel"
Cohesion: 0.11
Nodes (37): FIT_WORDS, STATUS_COLOR, FIT, KeyHelper(), TempoTab(), checkMix(), chooseShift(), fixBeatKey() (+29 more)

### Community 46 - "remixLanes.ts"
Cohesion: 0.11
Nodes (30): react-dom, EmbedPage(), metadata, Clock(), EmbedPlayer(), formatTime(), formatTime(), MixWaveform() (+22 more)

### Community 47 - "appIcon"
Cohesion: 0.22
Nodes (10): GET(), SIZES, AppleIcon(), contentType, size, contentType, Icon(), size (+2 more)

### Community 48 - "StudioTransport.tsx"
Cohesion: 0.21
Nodes (17): formatBars(), formatTime(), KeyControl(), LcdLabel(), MobileSeek(), Popover(), StudioTransport(), handleExport() (+9 more)

### Community 49 - "exportJob.ts"
Cohesion: 0.15
Nodes (24): ExportSheet(), save(), formatBytes(), formatDuration(), formatLeft(), noSubscription(), phoneKind(), ExportJobState (+16 more)

### Community 50 - "package.json"
Cohesion: 0.09
Nodes (22): @ast-grep/cli, aws4fetch, bcryptjs, demucs-web, jose, knip, onnxruntime-web, qrcode (+14 more)

### Community 51 - "app.py"
Cohesion: 0.12
Nodes (6): compute_peaks(), detect_bpm(), health(), load_and_encode(), separate(), SeparateRequest

### Community 52 - "UploadActivity.tsx"
Cohesion: 0.31
Nodes (13): RootLayout(), ProgressBar(), RigStatus(), formatMB(), SplitterStatus(), BackgroundActivity(), doneText(), UploadList() (+5 more)

### Community 53 - "splitter.ts"
Cohesion: 0.10
Nodes (22): Send, UploadTarget, Job, MODEL_URL, Turn, cancelled, init(), inlineMp3() (+14 more)

### Community 54 - "VocalRecorder.tsx"
Cohesion: 0.15
Nodes (21): formatTime(), LevelMeter(), VocalRecorder(), begin(), keep(), listen(), stopPreview(), ensureRunning() (+13 more)

### Community 55 - "listening.test.ts"
Cohesion: 0.11
Nodes (28): aggregate(), BEAT_NET, cosTable, deduplicate(), fft(), hzToMel(), LEVELS, logMelSpectrogram() (+20 more)

### Community 56 - "MissionSession.tsx"
Cohesion: 0.05
Nodes (70): DjPage(), metadata, CopilotPanel(), ICON, DjApp(), Mode, OpenDecks(), View (+62 more)

### Community 57 - "projects.ts"
Cohesion: 0.15
Nodes (21): DELETE(), GET(), PUT(), putSchema, POST(), schema, GET(), POST() (+13 more)

### Community 58 - "musicKey.ts"
Cohesion: 0.08
Nodes (44): FIT_LABEL, SORTS, TrackLibrary(), AiDj, browse(), BrowserEntry, BrowserQuery, camelotRank() (+36 more)

### Community 59 - "UploadManager.tsx"
Cohesion: 0.15
Nodes (18): QueueNotice(), nameList(), noSubscription(), skippedMessage(), SplitterInfo(), StatusBadge(), Stem, StemMiniRow() (+10 more)

### Community 60 - "aiKeys.ts"
Cohesion: 0.16
Nodes (23): DELETE(), PATCH(), patchSchema, PUT(), putSchema, AI_PROVIDERS, aiKeyStatuses(), AiProvider (+15 more)

### Community 61 - "exportMeta.ts"
Cohesion: 0.31
Nodes (10): id3Key(), TrackCredit, Cover, drawCover(), exportTags(), fetchCover(), imageType(), laneCredits() (+2 more)

### Community 62 - "collab.ts"
Cohesion: 0.15
Nodes (15): CollabBar(), SYNC_LABEL, CollabMember, CollabSession, connectCollab(), idle, mergeShared(), normalise() (+7 more)

### Community 63 - "libraryAudio.ts"
Cohesion: 0.07
Nodes (43): metadata, StoragePage(), formatBytes(), KIND_TEXT, MODEL_TEXT, ModelKey, ModelUsage, StorageSettings() (+35 more)

### Community 64 - "extras.tsx"
Cohesion: 0.17
Nodes (26): Engines(), FineTune(), keepWhatsPlaying(), MasterIt(), TuneButton(), TuneRow(), tuneIdea(), leadOf() (+18 more)

### Community 65 - "InstallPrompt.tsx"
Cohesion: 0.48
Nodes (6): InstallEvent, InstallPrompt(), dismiss(), install(), read(), write()

### Community 66 - "ai/chat/route.ts"
Cohesion: 0.20
Nodes (18): maxDuration, POST(), GET(), AiModel, DEFAULT_AI_MODEL, isAiModel(), isModelFor(), isOpenRouterModel() (+10 more)

### Community 67 - "NavBar.tsx"
Cohesion: 0.18
Nodes (14): MobileTabBar(), Tab(), AccountMenu(), MoreLinks(), NavBar(), ICONS, isActive(), MORE_LINKS (+6 more)

### Community 68 - "schema.sql"
Cohesion: 0.11
Nodes (42): ai_shared_usage, challenges, follows, idx_comments_remix, idx_follows_followee, idx_lanes_remix, idx_live_events_stream, idx_live_streams_host (+34 more)

### Community 69 - "StudioLane"
Cohesion: 0.11
Nodes (40): zustand, AiScopeBar(), Drag, Pick, PICK_ICONS, Playhead(), partsOf(), laneBlocks() (+32 more)

### Community 70 - "dependencies"
Cohesion: 0.10
Nodes (21): dependencies, @anthropic-ai/sdk, aws4fetch, bcryptjs, demucs-web, jose, lucide-react, next (+13 more)

### Community 71 - "studioStore.ts"
Cohesion: 0.07
Nodes (35): FxSlider(), hz(), LaneFxPanel(), pct(), Playhead(), clock(), Part, Playhead() (+27 more)

### Community 72 - "autoMatch.ts"
Cohesion: 0.14
Nodes (22): analyzeStem(), beatPhase(), onsetAt(), PRE_ROLL, TAIL, ALL_STEPS, analyzeBeatLane(), analyzeGuide() (+14 more)

### Community 73 - "ref_path"
Cohesion: 0.12
Nodes (11): postgres, buildId(), nextConfig(), tunnelHost, root, assets, root, target (+3 more)

### Community 74 - "RemixComments.tsx"
Cohesion: 0.27
Nodes (7): ago(), AtPlayhead(), formatAt(), RemixComments(), ReportButton(), useRemixComments, RemixComment

### Community 75 - "openrouter.ts"
Cohesion: 0.17
Nodes (17): GET(), AI_MODELS, Block, checkOpenRouterKey(), Completion, fromOpenAi(), headers(), OpenAiMessage (+9 more)

### Community 76 - "auth.ts"
Cohesion: 0.16
Nodes (13): POST(), schema, POST(), POST(), schema, clearSessionCookie(), createSessionCookie(), hashPassword() (+5 more)

### Community 77 - "pairMatch.ts"
Cohesion: 0.09
Nodes (40): Baseline, Choice(), LaneMatchPanel(), handleApply(), handleUndo(), snapshot(), untouchedSince(), gridScore() (+32 more)

### Community 78 - "arrange.ts"
Cohesion: 0.12
Nodes (30): Phrase, trackBeats(), argmax(), Arrangement, arrangeVocal(), BeatGrid, beatStructure, downbeatScores() (+22 more)

### Community 80 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+11 more)

### Community 81 - "LineCard.tsx"
Cohesion: 0.13
Nodes (25): AddButton(), EasyStudio(), Guide(), Step, BigSwitch(), LineCard(), remove(), separate() (+17 more)

### Community 82 - "SplitLaneDialog.tsx"
Cohesion: 0.23
Nodes (17): SplitLaneDialog(), finish(), start(), placeStems(), siblingStems(), canSplitHere(), defaultKinds(), json() (+9 more)

### Community 83 - "mp3.ts"
Cohesion: 0.22
Nodes (15): wasm-media-encoders, channels(), encodeMp3Bytes(), openMp3Stream(), handleStream(), Mp3Response, Mp3StreamMessage, Mp3StreamReply (+7 more)

### Community 84 - "liveSync.ts"
Cohesion: 0.15
Nodes (15): Avatar(), LiveChat(), Message(), readGuestName(), FollowStatus, hostPosition(), LiveConnection, LiveFeedState (+7 more)

### Community 85 - "next"
Cohesion: 0.05
Nodes (79): next, POST(), GET(), PUT(), POST(), schema, POST(), GET() (+71 more)

### Community 86 - "client/splitQueue.ts"
Cohesion: 0.12
Nodes (18): audioDuration(), ClaimedJob, HelperState, ifNoOtherTabHelping(), LostJob, MiningSession, postRetrying(), QueuedJob (+10 more)

### Community 87 - "soundtouchjs.d.ts"
Cohesion: 0.11
Nodes (5): FifoSampleBuffer, SimpleFilter, SoundTouch, soundtouchjs, WebAudioBufferSource

### Community 88 - "liveStudio.ts"
Cohesion: 0.21
Nodes (13): applyLiveMix(), isMix(), LiveMix, mixFields(), mixOf(), startStudioBroadcast(), scheduleMix(), scheduleState() (+5 more)

### Community 89 - "autoMix.ts"
Cohesion: 0.16
Nodes (14): AutoMixPanel(), viewOf(), AUTO_MIX_STEPS, AutoMix, AutoMixEngine, AutoMixPhase, BLEND_BEATS, PHRASE_BEATS (+6 more)

### Community 90 - "Live.tsx"
Cohesion: 0.10
Nodes (34): GET(), POST(), ACTIVITY_ICON, ActivityGlyph(), activityKey(), ActivityText(), ago(), AREA_LABEL (+26 more)

### Community 91 - "aiExplain.ts"
Cohesion: 0.10
Nodes (26): Change, clock(), cutWords(), diffMix(), endOf(), entryOf(), fxChanges(), laneChanges() (+18 more)

### Community 92 - "test.mjs"
Cohesion: 0.14
Nodes (9): databaseUrl, envLocal(), log, prepareDatabase(), root, server, serverEnv, storage (+1 more)

### Community 93 - "rtlText.ts"
Cohesion: 0.15
Nodes (17): alt, contentType, Image(), size, Image(), cardFonts(), CardText(), BidiRun (+9 more)

### Community 94 - "isConstrainedDevice"
Cohesion: 0.25
Nodes (4): isConstrainedDevice(), decode(), splitSong(), splitter

### Community 95 - "uploads.ts"
Cohesion: 0.11
Nodes (15): queueLink(), fetchSongFromLink(), SplitterState, AddResult, AUDIO_EXTENSIONS, empty, Entry, fileKey() (+7 more)

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
Nodes (38): ago(), Entry(), findDrop(), harmonyOf(), ideaFits(), aspectsOfEdits(), useAiTrial, DEFAULT_FX_VALUES (+30 more)

### Community 100 - "neuralBeats.ts"
Cohesion: 0.12
Nodes (31): packAnalysis(), unpackAnalysis(), BeatModelState, diskKey(), keep(), keptBeats(), legacyResult(), neuralBeats() (+23 more)

### Community 101 - "scenarios.ts"
Cohesion: 0.10
Nodes (31): libraryTrackId(), analysisSummary, loadLibraryTrack(), rateToMatch(), libraryApplies(), LibraryPrep, needsFor(), prepareLibraryMission() (+23 more)

### Community 102 - "Remixt Social Share Image (1920x1080)"
Cohesion: 0.23
Nodes (12): App Navigation: Library / Studio / Remixes / Upload, BPM & Pitch Match feature (Sync BPM), remixt-free.vercel.app (Vercel deployment), Multitrack Stem Lanes (VOCALS/BEAT waveforms with Vol & Pitch sliders), Publish Remix Under Your Name, Remixt Brand (gradient R logo, pink-purple-cyan palette), Remixt Social Share Image (1920x1080), Studio Page Mockup (remixt-free.vercel.app/studio) (+4 more)

### Community 103 - "RemixtMark"
Cohesion: 0.14
Nodes (17): Error(), Field(), LoginPage(), metadata, NotFound(), Field(), SignupPage(), metadata (+9 more)

### Community 104 - "StudioShortcuts.tsx"
Cohesion: 0.24
Nodes (12): PAD_KEYS, GROUPS, handleKey(), isTyping(), Mode, scrollToLane(), Shortcut, stepSelection() (+4 more)

### Community 105 - "heavy-play.mjs"
Cohesion: 0.15
Nodes (10): playwright-core, args, errors, play, restore, samples, songs, sounding (+2 more)

### Community 106 - "demoSongDefs.ts"
Cohesion: 0.08
Nodes (29): ChordDef, ChordQuality, CHORUS_CYCLE, DEMO_SONG_DEFS, DEMO_SONGS, DEMO_STEMS, SectionName, SongSection (+21 more)

### Community 107 - "pitchTempo.ts"
Cohesion: 0.08
Nodes (23): signalsmith-stretch, soundtouchjs, files, from, root, stretch, stretchFrom, stretchTo (+15 more)

### Community 109 - "Studio.tsx"
Cohesion: 0.12
Nodes (28): formatAgo(), ModeChooser(), MODES, ModeSwitch(), Studio(), leaveTogether(), restoreDraft(), startTogether() (+20 more)

### Community 110 - "stemKinds.ts"
Cohesion: 0.09
Nodes (34): GET(), formatDuration(), LibraryBrowser(), StemWithTrack, TabButton(), add(), ListedStem, SongRow() (+26 more)

### Community 113 - "demucs-web.d.ts"
Cohesion: 0.17
Nodes (7): Channels, demucs-web, demucs-web/constants, demucs-web/processor, DemucsProcessor, Progress, Spec

### Community 114 - "audioGraph.ts"
Cohesion: 0.09
Nodes (20): sliceBuffer(), ClipBufferLookup, clipEnvelope(), curveCache, getImpulse(), hasOwnStretch(), impulseCache, LaneChain (+12 more)

### Community 115 - "liveStudioDiff.ts"
Cohesion: 0.27
Nodes (6): describeMixChanges(), DiffLane, DiffMix, FX_WORDS, laneLabel(), same()

### Community 116 - "stretchWorkers.ts"
Cohesion: 0.10
Nodes (27): askMore(), haveInput(), Job, jobs, load(), readInput(), run(), StretchFromWorker (+19 more)

### Community 117 - "scripts"
Cohesion: 0.18
Nodes (11): scripts, build, dev, knip, lint, prebuild, predev, sg (+3 more)

### Community 118 - "live.test.ts"
Cohesion: 0.29
Nodes (8): chat(), Client, feed(), json(), ok(), remixOf(), signUp(), sql

### Community 119 - "Free on Vercel, with Neon and Vercel Blob"
Cohesion: 0.22
Nodes (9): 1. Put the code on GitHub, 2. Create the Vercel project, 3. Add the database (Neon), 4. Add stem storage (Vercel Blob), 5. Redeploy and finish, 6. Try it, Free on Vercel, with Neon and Vercel Blob, Optional (+1 more)

### Community 120 - "partyWorld.ts"
Cohesion: 0.12
Nodes (22): three, api(), GoLiveStudioButton(), endExistingAndStart(), start(), LiveStudioBar(), end(), goLive() (+14 more)

### Community 121 - ".play"
Cohesion: 0.15
Nodes (6): PlaybackBlockedError, reportMixNowPlaying(), stopSources(), disableNowPlayingAnchor(), stopNowPlayingAnchor(), Pad

### Community 122 - "Sharing Remixt with someone else"
Cohesion: 0.25
Nodes (7): `./share.sh cloudflared` — your Cloudflare tunnel, `./share.sh ngrok` — ngrok, `./share.sh` — serveo (default), Sharing Remixt with someone else, The three providers, Things worth knowing before you send the link, Why not Cloudflare's quick tunnel

### Community 123 - "curriculum.ts"
Cohesion: 0.11
Nodes (23): countTracks(), deckEnergy(), DRILLS, LESSONS, Level, MISSION_LEVEL, PAIRS, QUIZ_PASS (+15 more)

### Community 124 - "Free, all in one place: Oracle Cloud"
Cohesion: 0.29
Nodes (7): 1. Create the account, 2. Create the server, 3. Open ports 80 and 443, 4. Get a free domain name, 5. Install Docker and start Remixt, 6. Keep it running, Free, all in one place: Oracle Cloud

### Community 125 - "run.sh"
Cohesion: 0.29
Nodes (3): PATH, run.sh script, share.sh script

### Community 126 - ".renderClip"
Cohesion: 0.16
Nodes (10): renderKey(), used(), yieldToStandIns(), renderedWith(), stretchEngine, keepRender(), Kept, keptRender() (+2 more)

### Community 127 - "kindLabel"
Cohesion: 0.17
Nodes (9): formatTime(), PreviewBar(), Listener, previewPlayer, PreviewState, PreviewTrack, SERVER_SNAPSHOT, usePreviewState() (+1 more)

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

### Community 133 - "linkImport.ts"
Cohesion: 0.16
Nodes (18): bodySchema, maxDuration, POST(), metadata, UploadPage(), checkLink(), downloadSong(), explain() (+10 more)

### Community 134 - "ExamplesLab.tsx"
Cohesion: 0.17
Nodes (18): ExamplesPage(), metadata, DEFAULT_PAIR, ExamplesLab(), STEPS, keepOnly(), useLibrarySongs(), LibraryRecipes() (+10 more)

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

### Community 148 - "KeyLockVoice"
Cohesion: 0.14
Nodes (4): JsVoice, KeyLockVoice, ScratchVoice, StemMixer

### Community 154 - "seed-library.ts"
Cohesion: 0.12
Nodes (9): songBars(), songMeta(), vocalPlan(), SAMPLE_RATE, Stereo, count, sql, Client (+1 more)

### Community 155 - "LaneInspector.tsx"
Cohesion: 0.18
Nodes (13): HistoryList(), useCurrent(), askAbout(), EditTab(), formatOffset(), InspectorBody(), LaneInspector(), MixTab() (+5 more)

### Community 156 - "DjConsole"
Cohesion: 0.21
Nodes (4): DjConsole(), clamp(), applyMidi(), relativeStep()

### Community 157 - "renderVocal"
Cohesion: 0.23
Nodes (16): activeRms(), addTone(), applyDuck(), balanceStems(), barTable(), blank(), chordMidis(), midiHz() (+8 more)

### Community 158 - "mediaSession.ts"
Cohesion: 0.21
Nodes (12): NOW_PLAYING_ARTWORK, apply(), artworkFor(), getPlayingRemix(), lastPosition, mediaSession(), NowPlaying, Owner (+4 more)

### Community 159 - "HostConsole"
Cohesion: 0.21
Nodes (8): api(), HostConsole(), chooseRemix(), endSession(), goLive(), saveSettings(), ScrubBar(), Stat()

### Community 161 - "MatchFinder.tsx"
Cohesion: 0.31
Nodes (9): cache, Kind, libraryStems(), MatchFinder(), add(), Candidate, describeFit(), rankByTempo() (+1 more)

### Community 162 - "shared-results.test.ts"
Cohesion: 0.22
Nodes (6): Gotchas, Pooled vs direct connections: use the direct URL for migrations, dumps, and replication, share(), put(), sql, url()

### Community 163 - "notifications/page.tsx"
Cohesion: 0.36
Nodes (7): describe(), hrefFor(), metadata, NotificationsPage(), timeAgo(), MarkNotificationsRead(), Notification

### Community 166 - "ref_node_fs"
Cohesion: 0.40
Nodes (3): resolve(), src, withExtension()

### Community 168 - "UpdatePrompt.tsx"
Cohesion: 0.60
Nodes (3): isStaleChunk(), readLater(), UpdatePrompt()

### Community 169 - "eslint.config.mjs"
Cohesion: 0.50
Nodes (3): eslint, eslint-config-next, eslintConfig

### Community 170 - "Logs: CLI, Loki, and SDK pagination"
Cohesion: 0.50
Nodes (3): Logs: CLI, Loki, and SDK pagination, Loki-compatible read API, source()

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
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1173 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **25 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `react` to `app/page.tsx`, `djMidi.ts`, `ExamplesLab.tsx`, `models.ts`, `LiveReplay.tsx`, `modulation.ts`, `SocialClipButton.tsx`, `AdminPanel.tsx`, `SongPicker.tsx`, `Arrangement.tsx`, `remixes/[id]/page.tsx`, `djEngine.ts`, `LaneInspector.tsx`, `TagInput.tsx`, `examplesLibrary.ts`, `demoSongs.ts`, `SplitQueue.tsx`, `MatchFinder.tsx`, `MatchStep.tsx`, `notifications/page.tsx`, `AiProducer.tsx`, `CoProducer.tsx`, `libraryTracks.ts`, `MixerConsole.tsx`, `UpdatePrompt.tsx`, `Helper`, `keyLabel`, `remixLanes.ts`, `StudioTransport.tsx`, `exportJob.ts`, `package.json`, `UploadActivity.tsx`, `splitter.ts`, `VocalRecorder.tsx`, `MissionSession.tsx`, `musicKey.ts`, `UploadManager.tsx`, `collab.ts`, `libraryAudio.ts`, `extras.tsx`, `InstallPrompt.tsx`, `NavBar.tsx`, `StudioLane`, `studioStore.ts`, `RemixComments.tsx`, `pairMatch.ts`, `LineCard.tsx`, `SplitLaneDialog.tsx`, `liveSync.ts`, `next`, `client/splitQueue.ts`, `Live.tsx`, `uploads.ts`, `RemixCover.tsx`, `coproducerTools.ts`, `RemixtMark`, `StudioShortcuts.tsx`, `Studio.tsx`, `stemKinds.ts`, `partyWorld.ts`, `kindLabel`?**
  _High betweenness centrality (0.132) - this node is a cross-community bridge._
- **What connects `Python separation service dependencies (FastAPI, demucs 4.0.1, librosa)`, `Google Search Console site verification file`, `Vazirmatn font (SIL Open Font License 1.1)` to the rest of the system?**
  _39 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `DjEngine` be split into smaller, more focused modules?**
  _Cohesion score 0.08874912648497554 - nodes in this community are weakly interconnected._
- **Why does `next` connect `next` to `app/page.tsx`, `getCurrentUser`, `linkImport.ts`, `sql`, `ExamplesLab.tsx`, `models.ts`, `LiveReplay.tsx`, `SocialClipButton.tsx`, `react`, `AdminPanel.tsx`, `SongPicker.tsx`, `challenges.ts`, `remixes/[id]/page.tsx`, `TagInput.tsx`, `examplesLibrary.ts`, `demoSongs.ts`, `SplitQueue.tsx`, `notifications/page.tsx`, `UpdatePrompt.tsx`, `remixLanes.ts`, `appIcon`, `StudioTransport.tsx`, `package.json`, `UploadActivity.tsx`, `VocalRecorder.tsx`, `MissionSession.tsx`, `projects.ts`, `musicKey.ts`, `UploadManager.tsx`, `aiKeys.ts`, `ai/chat/route.ts`, `NavBar.tsx`, `ref_path`, `RemixComments.tsx`, `openrouter.ts`, `auth.ts`, `liveSync.ts`, `Live.tsx`, `RemixCover.tsx`, `RemixtMark`, `Studio.tsx`, `stemKinds.ts`?**
  _High betweenness centrality (0.103) - this node is a cross-community bridge._
- **Should `app/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06237424547283702 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Remixt Brand Gradient (pink to violet to cyan)` and `Remixt Mark - Black Monochrome`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `Remixt Brand Gradient (pink to violet to cyan)` and `Remixt Mark - White Monochrome`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._