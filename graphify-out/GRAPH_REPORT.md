# Graph Report - code  (2026-10-15)

## Corpus Check
- 452 files · ~515,044 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 12 file(s) not represented in the graph (top: (none) 7, .ttf 2, .ico 2)

## Summary
- 4444 nodes · 13894 edges · 139 communities (121 shown, 18 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 190 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5a659fd4`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- DjEngine
- app/page.tsx
- aiIdeas.ts
- aiTrial.ts
- getCurrentUser
- djEngine.ts
- sql
- dj-realism.test.ts
- storage.ts
- liveReplay.ts
- djMath.ts
- StudioLane
- SocialClipButton.tsx
- react
- AdminPanel.tsx
- SongPicker.tsx
- Studio.tsx
- clipCommands.ts
- audioEngine.ts
- useStudioStore
- harmony.ts
- challenges.ts
- DjApp.tsx
- demoSongsDsp.ts
- Lakebase Postgres
- analysis.ts
- EasyDecks.tsx
- AiProducer
- ensureSchema
- examplesLibrary.ts
- studioStore.ts
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
- coproducerTools.ts
- PartyWorld
- musicKey.ts
- remixLanes.ts
- appIcon
- StudioTransport.tsx
- exportJob.ts
- package.json
- app.py
- uploads.ts
- splitter.ts
- VocalRecorder.tsx
- beatNet.ts
- MissionSession.tsx
- projects.ts
- djLibraryTracks.ts
- UploadManager.tsx
- aiKeys.ts
- exportMeta.ts
- collab.ts
- localCache.ts
- extras.tsx
- InstallPrompt.tsx
- ai/chat/route.ts
- app/layout.tsx
- schema.sql
- aiScope.ts
- dependencies
- copy-ort.mjs
- autoMatch.ts
- ref_fs
- RemixComments.tsx
- openrouter.ts
- auth.ts
- LaneMatchPanel.tsx
- pairMatch.ts
- FakeContext
- compilerOptions
- LaneInspector.tsx
- SplitLaneDialog.tsx
- phone-export.test.ts
- liveSync.ts
- next
- client/splitQueue.ts
- soundtouchjs.d.ts
- liveStudio.ts
- autoMix.ts
- Live.tsx
- beatLength
- test.mjs
- rtlText.ts
- splitter
- uploads
- Remixt
- RemixCover.tsx
- devDependencies
- lib/presence.ts
- neuralBeats.ts
- stemFetch.ts
- Remixt Social Share Image (1920x1080)
- signup/page.tsx
- StudioShortcuts.tsx
- playwright-core
- djTracks.ts
- pitchTempo.ts
- stemKinds.ts
- FakeParam
- demucs-web.d.ts
- LiveRoom.tsx
- scripts
- ref_node_assert
- Free on Vercel, with Neon and Vercel Blob
- Sharing Remixt with someone else
- Free, all in one place: Oracle Cloud
- run.sh
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
2. `sql` - 136 edges
3. `useStudioStore` - 135 edges
4. `getCurrentUser()` - 133 edges
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

## Communities (139 total, 18 thin omitted)

### Community 0 - "DjEngine"
Cohesion: 0.06
Nodes (10): DjConsole(), dbToGain(), emptyHotCues(), quantizePos(), DeckUnit, DjEngine, clamp(), applyMidi() (+2 more)

### Community 1 - "app/page.tsx"
Cohesion: 0.04
Nodes (94): DELETE(), POST(), setLiked(), ArtistPage(), ArtistRow, generateMetadata(), EmbedPage(), metadata (+86 more)

### Community 2 - "aiIdeas.ts"
Cohesion: 0.06
Nodes (74): activeShare(), adoptTiming(), ALL_FIXES, applyLevels(), applyMix(), arrange(), arrangementIdeas(), arrangeOnDrop() (+66 more)

### Community 3 - "aiTrial.ts"
Cohesion: 0.09
Nodes (50): putBackOn(), compatible(), fixesOf(), HandEdit, mixFix(), mixSignature(), rankIdeas(), rebaseSession() (+42 more)

### Community 4 - "getCurrentUser"
Cohesion: 0.05
Nodes (77): GET(), POST(), DELETE(), POST(), sessionOf(), POST(), bodySchema, POST() (+69 more)

### Community 5 - "djEngine.ts"
Cohesion: 0.07
Nodes (38): MidiPanel(), BANDS, CURVES, FADER_CURVES, MONITORS, makeImpulse(), Ramp, RecordingResult (+30 more)

### Community 6 - "sql"
Cohesion: 0.07
Nodes (47): AdminPage(), metadata, DELETE(), findJunk(), GET(), maxDuration, POST(), GET() (+39 more)

### Community 7 - "dj-realism.test.ts"
Cohesion: 0.06
Nodes (34): barOf(), startOffsetOnPhrase(), AUTO_GAIN_TARGET_DB, autoGainDb(), barBeat(), beatFraction(), beatIndex(), CLIP (+26 more)

### Community 8 - "storage.ts"
Cohesion: 0.06
Nodes (59): aws4fetch, @vercel/blob, GET(), kept(), redirect(), DELETE(), GET(), keyFor() (+51 more)

### Community 9 - "liveReplay.ts"
Cohesion: 0.25
Nodes (11): ReplayClock, useReplayClock(), indexAt(), positionAt(), Replay, ReplayChat, ReplayMix, ReplayReaction (+3 more)

### Community 10 - "djMath.ts"
Cohesion: 0.07
Nodes (64): BeatMatchMeter(), FIT_TEXT, Gauge(), CrowdRequest, crowdScore(), CrowdState, ECHO_KEYS, fxTotal() (+56 more)

### Community 11 - "StudioLane"
Cohesion: 0.13
Nodes (20): AutomationLane(), at(), commit(), handleDown(), handleMove(), remove(), formatValue(), PARAMS (+12 more)

### Community 12 - "SocialClipButton.tsx"
Cohesion: 0.13
Nodes (26): Field(), LoginPage(), clipRange(), formatTime(), noSubscription(), SocialClipButton(), make(), share() (+18 more)

### Community 13 - "react"
Cohesion: 0.08
Nodes (43): lucide-react, react, api(), HostConsole(), chooseRemix(), endSession(), goLive(), saveSettings() (+35 more)

### Community 14 - "AdminPanel.tsx"
Cohesion: 0.06
Nodes (57): Claim, Claimable Neon, If neon claim is missing, Path, With REST, With the CLI, Function Triggers (CLI, MCP, REST), AdminChallenge (+49 more)

### Community 15 - "SongPicker.tsx"
Cohesion: 0.06
Nodes (47): ExamplesPage(), metadata, DEFAULT_PAIR, ExamplesLab(), STEPS, Flags, INFO, Kind (+39 more)

### Community 16 - "Studio.tsx"
Cohesion: 0.08
Nodes (42): formatAgo(), ModeChooser(), MODES, ModeSwitch(), Studio(), leaveTogether(), restoreDraft(), startTogether() (+34 more)

### Community 17 - "clipCommands.ts"
Cohesion: 0.12
Nodes (61): rhythmIdeas(), cutSilences(), gatePattern(), MAX_AUTOMATION_POINTS, pumpPattern(), spliceAutomation(), clearAutomation(), clearSelection() (+53 more)

### Community 18 - "audioEngine.ts"
Cohesion: 0.06
Nodes (34): PAD_KEYS, audioEngine, bytesOf(), clipKey(), DecodedStem, lastUsed, LoadedLane, PHONE (+26 more)

### Community 19 - "useStudioStore"
Cohesion: 0.09
Nodes (54): zustand, Playhead(), Arrangement(), onContentPointerDown(), onContentPointerMove(), onContentPointerUp(), snapDelta(), timeAt() (+46 more)

### Community 20 - "harmony.ts"
Cohesion: 0.15
Nodes (20): chooseShift(), accentCache, accents(), adviseShift(), chordRows(), Harmony, HarmonyAdvice, HarmonyScan (+12 more)

### Community 21 - "challenges.ts"
Cohesion: 0.15
Nodes (21): GET(), POST(), schema, GET(), ChallengeDetail(), ChallengesPage(), metadata, timeLeft() (+13 more)

### Community 22 - "DjApp.tsx"
Cohesion: 0.10
Nodes (27): DjPage(), metadata, CopilotPanel(), ICON, DjApp(), Mode, OpenDecks(), View (+19 more)

### Community 23 - "demoSongsDsp.ts"
Cohesion: 0.08
Nodes (50): songBars(), songMeta(), vocalPlan(), activeRms(), addClap(), addCrash(), addHat(), addKick() (+42 more)

### Community 24 - "Lakebase Postgres"
Cohesion: 0.05
Nodes (41): Full-Text Search with BM25 Ranking, Prepare and Index Text, Query and Interpret Scores, Set Parameters at Build Time or Per Query, Set the Candidate Limit, Use Prefilter Selectively, Adapt the Hybrid Search, Hybrid Search (+33 more)

### Community 25 - "analysis.ts"
Cohesion: 0.09
Nodes (42): activeLoudness(), ANALYSIS_RATE, analyzeAndKeep(), analyzeMono(), autocorrelation(), cache, chromagram(), correlation() (+34 more)

### Community 26 - "EasyDecks.tsx"
Cohesion: 0.05
Nodes (65): BarCounter(), DeckPanel(), Pad(), PAD_JUMPS, PAD_MODE_LABEL, ROLLS, sign(), STEM_BUTTONS (+57 more)

### Community 27 - "AiProducer"
Cohesion: 0.13
Nodes (45): AiProducer(), analyse(), applyOptions(), changeScope(), chooseSync(), chooseTiming(), chooseWhole(), close() (+37 more)

### Community 28 - "ensureSchema"
Cohesion: 0.06
Nodes (47): GET(), POST(), DELETE(), GET(), POST(), postSchema, visible(), DELETE() (+39 more)

### Community 29 - "examplesLibrary.ts"
Cohesion: 0.12
Nodes (29): demoLabSong(), EXCERPT_BARS, LabSong, libraryLabSong(), LibraryState, Found, useSide(), alignExcerpt() (+21 more)

### Community 30 - "studioStore.ts"
Cohesion: 0.11
Nodes (50): asWholeTake(), cleanClip(), ClipClipboard, clipSpan(), concrete(), concreteIds(), continues(), cutClip() (+42 more)

### Community 31 - "demoSongs.ts"
Cohesion: 0.08
Nodes (35): State, useDemoSong(), CHORD_INTERVALS, ChordDef, ChordQuality, CHORUS_CYCLE, DEMO_SONG_DEFS, DEMO_SONGS (+27 more)

### Community 32 - "SplitQueue.tsx"
Cohesion: 0.11
Nodes (27): ago(), duration(), HelperPanel(), jobDetail(), LastBlock(), noSubscription(), QueuedSongRow(), RewardRules() (+19 more)

### Community 33 - "Neon"
Cohesion: 0.05
Nodes (41): Data API external JWKS, Functions: verify the JWT, then authorize the user, Incompatibilities, Managed Better Auth, Trusted domains, 1. Install the Neon CLI, 2. Install the Neon MCP Server, 3. Install Neon Agent Skills (+33 more)

### Community 34 - "MatchStep.tsx"
Cohesion: 0.08
Nodes (46): AnalysisCard(), LEVEL_STYLE, pct(), Row(), Verdict(), BarGrid(), MatchStep(), prepare() (+38 more)

### Community 35 - "AiProducer.tsx"
Cohesion: 0.04
Nodes (71): Icon(), IconName, ICONS, MEDAL_COLORS, Best, CheckActions, FixState, STATUS (+63 more)

### Community 36 - "mixdown.ts"
Cohesion: 0.10
Nodes (41): ClipBufferLookup, clipEnvelope(), createLaneChain(), update(), createMasterChain(), update(), curveCache, driveCurve() (+33 more)

### Community 37 - "audioTags.ts"
Cohesion: 0.26
Nodes (21): asciiUrl(), AudioTags, chunk(), comment(), concat(), creditLine(), describedText(), frame() (+13 more)

### Community 38 - "directUpload.ts"
Cohesion: 0.11
Nodes (31): blobApi(), blobMultipart(), blobRequest(), BlobTarget, FinalUploadError, isFinalStatus(), isHidden(), libraryPut() (+23 more)

### Community 39 - "CoProducer.tsx"
Cohesion: 0.12
Nodes (35): @anthropic-ai/sdk, CoProducer(), chooseModel(), chooseProvider(), forgetKey(), send(), defaultRouterModel(), KeySetup() (+27 more)

### Community 40 - "libraryTracks.ts"
Cohesion: 0.11
Nodes (29): decoder(), entries, fold(), held, hold(), kept, load(), LoadedTrack (+21 more)

### Community 41 - "startNewStep"
Cohesion: 0.12
Nodes (28): nudge(), cache, Kind, libraryStems(), MatchFinder(), add(), buffers, bypassed (+20 more)

### Community 42 - "Remixt Brand Mark (split audio-waveform bars)"
Cohesion: 0.11
Nodes (33): File Icon (document glyph), Globe Icon, Next.js Wordmark Logo, Next.js Starter Template Assets, Remixt Brand Gradient (pink to violet to cyan), Remixt Brand Mark (split audio-waveform bars), Remixt Duotone Palette (pink top / cyan bottom bars), Apple Touch Icon (180px, gradient rounded-square, white bars) (+25 more)

### Community 43 - "coproducerTools.ts"
Cohesion: 0.06
Nodes (54): Line, QuickHelp(), send(), SUGGESTIONS, availableFixes(), checkMix(), findDrop(), FixId (+46 more)

### Community 44 - "PartyWorld"
Cohesion: 0.07
Nodes (12): three, Avatar, bubble(), CameraMode, canvasSprite(), emojiTexture(), emojiTextures, Floater (+4 more)

### Community 45 - "musicKey.ts"
Cohesion: 0.15
Nodes (31): TrackLibrary(), FIT_WORDS, STATUS_COLOR, FIT, KeyHelper(), TempoTab(), fixBeatKey(), fixKey() (+23 more)

### Community 46 - "remixLanes.ts"
Cohesion: 0.15
Nodes (22): Clock(), EmbedPlayer(), formatTime(), formatTime(), MixWaveform(), RemixDetailPlayer(), ContextMenuHost(), load() (+14 more)

### Community 47 - "appIcon"
Cohesion: 0.22
Nodes (10): GET(), SIZES, AppleIcon(), contentType, size, contentType, Icon(), size (+2 more)

### Community 48 - "StudioTransport.tsx"
Cohesion: 0.14
Nodes (25): isMastered(), MasterPanel(), masterPresetOf(), same(), Slider(), formatBars(), formatTime(), KeyControl() (+17 more)

### Community 49 - "exportJob.ts"
Cohesion: 0.15
Nodes (24): ExportSheet(), save(), formatBytes(), formatDuration(), formatLeft(), noSubscription(), phoneKind(), ExportJobState (+16 more)

### Community 50 - "package.json"
Cohesion: 0.07
Nodes (27): @ast-grep/cli, bcryptjs, eslint, eslint-config-next, jose, knip, onnxruntime-web, qrcode (+19 more)

### Community 51 - "app.py"
Cohesion: 0.12
Nodes (6): compute_peaks(), detect_bpm(), health(), load_and_encode(), separate(), SeparateRequest

### Community 52 - "uploads.ts"
Cohesion: 0.14
Nodes (23): ProgressBar(), RigStatus(), formatMB(), SplitterStatus(), BackgroundActivity(), doneText(), UploadList(), UploadRow() (+15 more)

### Community 53 - "splitter.ts"
Cohesion: 0.10
Nodes (24): demucs-web, wasm-media-encoders, Send, UploadTarget, Job, MODEL_URL, Turn, cancelled (+16 more)

### Community 54 - "VocalRecorder.tsx"
Cohesion: 0.15
Nodes (21): formatTime(), LevelMeter(), VocalRecorder(), begin(), keep(), listen(), stopPreview(), ensureRunning() (+13 more)

### Community 55 - "beatNet.ts"
Cohesion: 0.11
Nodes (28): aggregate(), BEAT_NET, cosTable, deduplicate(), fft(), hzToMel(), LEVELS, logMelSpectrogram() (+20 more)

### Community 56 - "MissionSession.tsx"
Cohesion: 0.04
Nodes (97): DjHome(), ItemButton(), Briefing(), CamelotWheel(), CATEGORY_LABEL, categoryLabel(), CrowdBar(), Debrief() (+89 more)

### Community 57 - "projects.ts"
Cohesion: 0.14
Nodes (21): DELETE(), GET(), PUT(), putSchema, POST(), schema, GET(), POST() (+13 more)

### Community 58 - "djLibraryTracks.ts"
Cohesion: 0.08
Nodes (44): FIT_LABEL, SORTS, browse(), BrowserEntry, BrowserQuery, camelotRank(), downbeatOffset(), entryFromTrack() (+36 more)

### Community 59 - "UploadManager.tsx"
Cohesion: 0.15
Nodes (20): QueuedSongs(), QueueNotice(), nameList(), noSubscription(), skippedMessage(), SplitterInfo(), StatusBadge(), Stem (+12 more)

### Community 60 - "aiKeys.ts"
Cohesion: 0.17
Nodes (22): check(), DELETE(), PATCH(), patchSchema, PUT(), putSchema, AI_MODELS, AI_PROVIDERS (+14 more)

### Community 61 - "exportMeta.ts"
Cohesion: 0.15
Nodes (18): formatCount(), RemixStatsBar(), share(), ShareMenu(), id3Key(), TrackCredit, Cover, drawCover() (+10 more)

### Community 62 - "collab.ts"
Cohesion: 0.14
Nodes (17): CollabBar(), SYNC_LABEL, CollabMember, CollabSession, connectCollab(), idle, mergeShared(), normalise() (+9 more)

### Community 63 - "localCache.ts"
Cohesion: 0.10
Nodes (29): metadata, StoragePage(), formatBytes(), KIND_TEXT, MODEL_TEXT, ModelKey, ModelUsage, StorageSettings() (+21 more)

### Community 64 - "extras.tsx"
Cohesion: 0.18
Nodes (25): Engines(), FineTune(), keepWhatsPlaying(), MasterIt(), TuneButton(), TuneRow(), masterFor(), keepTrial() (+17 more)

### Community 65 - "InstallPrompt.tsx"
Cohesion: 0.48
Nodes (6): InstallEvent, InstallPrompt(), dismiss(), install(), read(), write()

### Community 66 - "ai/chat/route.ts"
Cohesion: 0.19
Nodes (19): maxDuration, POST(), GET(), AiModel, DEFAULT_AI_MODEL, isAiModel(), isModelFor(), isOpenRouterModel() (+11 more)

### Community 67 - "app/layout.tsx"
Cohesion: 0.07
Nodes (33): Error(), geistMono, geistSans, metadata, RootLayout(), viewport, metadata, NotFound() (+25 more)

### Community 68 - "schema.sql"
Cohesion: 0.11
Nodes (42): ai_shared_usage, challenges, follows, idx_comments_remix, idx_follows_followee, idx_lanes_remix, idx_live_events_stream, idx_live_streams_host (+34 more)

### Community 69 - "aiScope.ts"
Cohesion: 0.17
Nodes (19): AiScopeBar(), Drag, Pick, PICK_ICONS, Playhead(), AiSection(), applyScope(), inLanes() (+11 more)

### Community 70 - "dependencies"
Cohesion: 0.10
Nodes (21): dependencies, @anthropic-ai/sdk, aws4fetch, bcryptjs, demucs-web, jose, lucide-react, next (+13 more)

### Community 71 - "copy-ort.mjs"
Cohesion: 0.22
Nodes (8): files, from, root, stretch, stretchFrom, stretchTo, to, fixStretchWorklet()

### Community 72 - "autoMatch.ts"
Cohesion: 0.12
Nodes (30): analyzeStem(), beatPhase(), gridScore(), keptAnalysis(), onsetAt(), refineTempo(), PRE_ROLL, TAIL (+22 more)

### Community 73 - "ref_fs"
Cohesion: 0.13
Nodes (11): postgres, buildId(), nextConfig(), tunnelHost, root, assets, root, target (+3 more)

### Community 74 - "RemixComments.tsx"
Cohesion: 0.33
Nodes (6): ago(), AtPlayhead(), formatAt(), RemixComments(), useRemixComments, RemixComment

### Community 75 - "openrouter.ts"
Cohesion: 0.18
Nodes (16): GET(), Block, checkOpenRouterKey(), Completion, fromOpenAi(), headers(), OpenAiMessage, OpenRouterError (+8 more)

### Community 76 - "auth.ts"
Cohesion: 0.18
Nodes (12): POST(), schema, POST(), POST(), schema, clearSessionCookie(), createSessionCookie(), hashPassword() (+4 more)

### Community 77 - "LaneMatchPanel.tsx"
Cohesion: 0.16
Nodes (20): Baseline, Choice(), LaneMatchPanel(), handleApply(), handleUndo(), snapshot(), untouchedSince(), DEFAULT_OPTIONS (+12 more)

### Community 78 - "pairMatch.ts"
Cohesion: 0.10
Nodes (42): StemAnalysis, trackBeats(), argmax(), Arrangement, arrangeVocal(), BeatGrid, beatStructure, downbeatScores() (+34 more)

### Community 80 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+11 more)

### Community 81 - "LaneInspector.tsx"
Cohesion: 0.06
Nodes (56): FxSlider(), hz(), LaneFxPanel(), pct(), LaneCard(), LaneHeader(), AddButton(), EasyStudio() (+48 more)

### Community 82 - "SplitLaneDialog.tsx"
Cohesion: 0.15
Nodes (22): SplitLaneDialog(), finish(), start(), cache, findParts(), placeStems(), siblingStems(), swapInParts() (+14 more)

### Community 83 - "phone-export.test.ts"
Cohesion: 0.13
Nodes (19): Bounce, channels(), encodeMp3(), encodeMp3Bytes(), openMp3Stream(), PcmSink, handleStream(), Mp3Response (+11 more)

### Community 84 - "liveSync.ts"
Cohesion: 0.14
Nodes (14): Avatar(), LiveChat(), submit(), Message(), readGuestName(), FollowStatus, LiveConnection, LiveFeedState (+6 more)

### Community 85 - "next"
Cohesion: 0.05
Nodes (81): next, zod, POST(), GET(), PUT(), POST(), schema, POST() (+73 more)

### Community 86 - "client/splitQueue.ts"
Cohesion: 0.12
Nodes (21): audioDuration(), ClaimedJob, ifNoOtherTabHelping(), json(), LostJob, MiningSession, postRetrying(), queueFile() (+13 more)

### Community 87 - "soundtouchjs.d.ts"
Cohesion: 0.11
Nodes (5): FifoSampleBuffer, SimpleFilter, SoundTouch, soundtouchjs, WebAudioBufferSource

### Community 88 - "liveStudio.ts"
Cohesion: 0.26
Nodes (11): isMix(), mixFields(), mixOf(), startStudioBroadcast(), scheduleMix(), scheduleState(), sendMix(), sendState() (+3 more)

### Community 89 - "autoMix.ts"
Cohesion: 0.15
Nodes (12): AiDj, AUTO_MIX_STEPS, AutoMix, AutoMixEngine, AutoMixPhase, BLEND_BEATS, PHRASE_BEATS, ramp() (+4 more)

### Community 90 - "Live.tsx"
Cohesion: 0.13
Nodes (24): ACTIVITY_ICON, ActivityGlyph(), activityKey(), ActivityText(), ago(), AREA_LABEL, AREA_SHORT, AreaShort() (+16 more)

### Community 91 - "beatLength"
Cohesion: 0.10
Nodes (43): Logs: CLI, Loki, and SDK pagination, Loki-compatible read API, clock(), Part, partsOf(), Playhead(), SongMap(), laneBlocks() (+35 more)

### Community 92 - "test.mjs"
Cohesion: 0.14
Nodes (9): databaseUrl, envLocal(), log, prepareDatabase(), root, server, serverEnv, storage (+1 more)

### Community 93 - "rtlText.ts"
Cohesion: 0.10
Nodes (20): alt, contentType, Image(), size, Image(), cardFonts(), CardText(), BidiRun (+12 more)

### Community 96 - "Remixt"
Cohesion: 0.14
Nodes (14): Architecture, Community, Configuration, Deploying it, Notes, Postgres (accounts, tracks, stems, remixes), Remixt, Running it (+6 more)

### Community 97 - "RemixCover.tsx"
Cohesion: 0.36
Nodes (6): RemixCover(), pick(), decode(), Decoded, squareCover(), uploadCover()

### Community 98 - "devDependencies"
Cohesion: 0.12
Nodes (16): devDependencies, @ast-grep/cli, eslint, eslint-config-next, knip, playwright-core, tailwindcss, @tailwindcss/postcss (+8 more)

### Community 99 - "lib/presence.ts"
Cohesion: 0.35
Nodes (10): GET(), POST(), ActivityType, areaFor(), AREAS, ensurePresenceSchema(), heartbeat(), HEARTBEAT_SECONDS (+2 more)

### Community 100 - "neuralBeats.ts"
Cohesion: 0.11
Nodes (32): packAnalysis(), unpackAnalysis(), BeatModelState, diskKey(), keep(), keptBeats(), LEGACY_RESULTS_CACHE, legacyResult() (+24 more)

### Community 101 - "stemFetch.ts"
Cohesion: 0.19
Nodes (8): fetchSongFromLink(), fetchInSlices(), fetchRange(), fetchWhole(), download(), FILE, Handler, server

### Community 102 - "Remixt Social Share Image (1920x1080)"
Cohesion: 0.23
Nodes (12): App Navigation: Library / Studio / Remixes / Upload, BPM & Pitch Match feature (Sync BPM), remixt-free.vercel.app (Vercel deployment), Multitrack Stem Lanes (VOCALS/BEAT waveforms with Vol & Pitch sliders), Publish Remix Under Your Name, Remixt Brand (gradient R logo, pink-purple-cyan palette), Remixt Social Share Image (1920x1080), Studio Page Mockup (remixt-free.vercel.app/studio) (+4 more)

### Community 104 - "StudioShortcuts.tsx"
Cohesion: 0.31
Nodes (8): GROUPS, handleKey(), isTyping(), Mode, scrollToLane(), Shortcut, stepSelection(), GRID_CHOICES

### Community 106 - "djTracks.ts"
Cohesion: 0.13
Nodes (20): DemoStem, Phase, DJ_TRACKS, djTrackInfo(), trackInfoFromMeta(), cache, LoadedTrack, PEAK_RATE (+12 more)

### Community 107 - "pitchTempo.ts"
Cohesion: 0.10
Nodes (19): signalsmith-stretch, soundtouchjs, feedAsRendered(), hasSound(), renderedWith(), renderHq(), renderInWorker(), renderOnPage() (+11 more)

### Community 110 - "stemKinds.ts"
Cohesion: 0.06
Nodes (51): GET(), formatDuration(), LibraryBrowser(), StemWithTrack, TabButton(), formatTime(), PreviewBar(), ReportButton() (+43 more)

### Community 113 - "demucs-web.d.ts"
Cohesion: 0.17
Nodes (7): Channels, demucs-web, demucs-web/constants, demucs-web/processor, DemucsProcessor, Progress, Spec

### Community 115 - "LiveRoom.tsx"
Cohesion: 0.10
Nodes (26): FollowButton(), Heat(), LiveReplay(), Countdown(), emptyRecap(), LiveBadge(), LiveRoom(), react() (+18 more)

### Community 117 - "scripts"
Cohesion: 0.18
Nodes (11): scripts, build, dev, knip, lint, prebuild, predev, sg (+3 more)

### Community 118 - "ref_node_assert"
Cohesion: 0.09
Nodes (16): Gotchas, Pooled vs direct connections: use the direct URL for migrations, dumps, and replication, share(), chat(), Client, feed(), json(), ok() (+8 more)

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
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1116 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `react` to `app/page.tsx`, `getCurrentUser`, `djEngine.ts`, `liveReplay.ts`, `djMath.ts`, `StudioLane`, `SocialClipButton.tsx`, `AdminPanel.tsx`, `SongPicker.tsx`, `Studio.tsx`, `audioEngine.ts`, `useStudioStore`, `DjApp.tsx`, `EasyDecks.tsx`, `ensureSchema`, `examplesLibrary.ts`, `demoSongs.ts`, `SplitQueue.tsx`, `MatchStep.tsx`, `AiProducer.tsx`, `CoProducer.tsx`, `libraryTracks.ts`, `startNewStep`, `coproducerTools.ts`, `musicKey.ts`, `remixLanes.ts`, `StudioTransport.tsx`, `exportJob.ts`, `package.json`, `uploads.ts`, `splitter.ts`, `VocalRecorder.tsx`, `MissionSession.tsx`, `djLibraryTracks.ts`, `UploadManager.tsx`, `exportMeta.ts`, `collab.ts`, `localCache.ts`, `extras.tsx`, `InstallPrompt.tsx`, `app/layout.tsx`, `aiScope.ts`, `RemixComments.tsx`, `LaneMatchPanel.tsx`, `LaneInspector.tsx`, `SplitLaneDialog.tsx`, `liveSync.ts`, `next`, `client/splitQueue.ts`, `Live.tsx`, `beatLength`, `RemixCover.tsx`, `signup/page.tsx`, `StudioShortcuts.tsx`, `stemKinds.ts`, `LiveRoom.tsx`?**
  _High betweenness centrality (0.120) - this node is a cross-community bridge._
- **What connects `Python separation service dependencies (FastAPI, demucs 4.0.1, librosa)`, `Google Search Console site verification file`, `Vazirmatn font (SIL Open Font License 1.1)` to the rest of the system?**
  _39 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `DjEngine` be split into smaller, more focused modules?**
  _Cohesion score 0.05772212283840191 - nodes in this community are weakly interconnected._
- **Why does `next` connect `next` to `app/page.tsx`, `getCurrentUser`, `sql`, `storage.ts`, `SocialClipButton.tsx`, `react`, `AdminPanel.tsx`, `SongPicker.tsx`, `Studio.tsx`, `challenges.ts`, `DjApp.tsx`, `ensureSchema`, `examplesLibrary.ts`, `SplitQueue.tsx`, `remixLanes.ts`, `appIcon`, `StudioTransport.tsx`, `package.json`, `uploads.ts`, `VocalRecorder.tsx`, `MissionSession.tsx`, `projects.ts`, `djLibraryTracks.ts`, `UploadManager.tsx`, `aiKeys.ts`, `exportMeta.ts`, `ai/chat/route.ts`, `app/layout.tsx`, `ref_fs`, `RemixComments.tsx`, `openrouter.ts`, `auth.ts`, `liveSync.ts`, `Live.tsx`, `RemixCover.tsx`, `lib/presence.ts`, `signup/page.tsx`, `stemKinds.ts`, `LiveRoom.tsx`?**
  _High betweenness centrality (0.110) - this node is a cross-community bridge._
- **Should `app/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.03991596638655462 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Remixt Brand Gradient (pink to violet to cyan)` and `Remixt Mark - Black Monochrome`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `Remixt Brand Gradient (pink to violet to cyan)` and `Remixt Mark - White Monochrome`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._