# Remixt — the one plan

The only to-do list. Everything unfinished and every note lives here. Read this first in a new session, then `git status`.
Update it before a session ends: tick boxes, add what was found, move finished parts to "Done" at the bottom.

- History and measurements of the AI producer: `AI_REMIX_PLAN.md` (finished; reference only).
- `HANDOVER.md` was merged into this file on 2026-11-17 and deleted.

Written 2026-11-17. Last commit at that time: `0fee2ca` (all earlier work committed, tree clean).

---

## Session 2026-11-20 — Remixt's own ads, private music together, analytics, radio transitions, tool pages, speed

Asked: Remixt's own ad everywhere an ad can be (and managed in admin); remixers decide what/how/where; private uploads → share → choose what to publish → several people on one project; GA-style admin analytics with every user's details; DJ transitions on the radio "like Apple Music"; tool pages that really do their tool; SEO 100; faster navigation; a plan for a mature platform. All uncommitted.

**Built and checked**
- **Navigation speed.** Cause found: every page waits for a server round trip (~0.5 s from here, more through a VPN) with no feedback, and `/library` sent each stem's waveform as 4 KB of JSON (677 KB at 150 stems). Now: a bar across the top answers every tap at once (`NavProgress`, `lib/client/navigation.ts`); waveforms packed to one byte a peak (`lib/peaksCodec.ts`, library HTML 927 → 460 KB, navigation payload ~⅓); loading screens on the list pages (`library`, `remixes/(list)` — a route group so it doesn't cover `/remixes/[id]`). **Lesson (guarded by a test):** a `loading.tsx` above a page that calls `notFound()`/`redirect()` makes Next send 200 first — a soft 404 for search engines and a client-side redirect (`live.test.ts` caught it). Production DB latency (Neon cold starts?) not measured from here.
- **Remixt's own ads** (`lib/monetize/houseAds.ts` pure + `houseStore.ts`): 17 built-in ads (EN/FA) seeded into `house_ads`, editable/weightable/copyable (A/B) in **Admin → Remixt ads** with live previews, uploads (picture/video/sound) and per-ad views, clicks, CTR, daily sparkline, by place (`house_ad_stats`; counted through the same signed token as paid ads, never paid). Kinds: picture card; **animated "Remix it your way"** (`HouseMotion`: the promo video's four beats in SVG/CSS, a few KB, moves only on screen, still under reduced motion); uploaded video (muted, tap for sound); **sounds** made from scratch by `scripts/make-house-audio.mjs` — `public/ads/remixt-radio-id.mp3` (6.5 s station ID) and `remixt-sting.mp3` (3.6 s). They fill every spot no paying ad takes: cards on every ad spot, the radio break (station ID banner), and — only if switched on — before remixes (skippable at once). Switches in Settings: `features.houseAds`, `houseRadio`, `housePreroll` (off: pays nobody and delays the music), plus `analytics`. The root promo videos (`remixt-ad-*.mp4`) couldn't be copied (a deny rule); upload one as a "Video" Remixt ad if wanted.
- **Remixer decides what/how/where** (`adRules.ts`): besides on/off, kinds and topics — *where* picture ads sit (under the player / below the comments / on the radio page), *how* (full card or slim strip), and whether Remixt's own ads may fill their page. Artist Monetize keeps the maker's where/how.
- **Private music together** (`lib/songPrivacy.ts` pure, `publishConsent.ts`, `trackAccess.ts`): Upload asks "Everyone / Only me, for now" (files, links and the phone→helper queue: `split_jobs.private`); any song can be shared with people and published whole or **part by part** (`stems.held_back`: publish the beat, keep the vocal); a remix using someone else's private song is saved private and its owner asked (`remix_consents`, notification, `/approvals`, answer on the remix page after listening) — a no stays a no until asked again, the last yes publishes it by itself. Shared sessions got **roles** (producer, vocalist, songwriter, mix engineer, instrumentalist, listener), **who can edit** (owner decides; a listener's edits are refused and rolled back), and a suggested fair earnings split. **Privacy gap closed:** a stem in *any* remix (even a private draft) was playable by anyone with its id; now only published remixes, your own, live ones, or ones you were asked about.
- **Analytics** (`lib/analytics.ts` pure, `analyticsStore.ts`, `/api/analytics` beacon, `AnalyticsBeacon`): first-party, no cookies, no IP, Do-Not-Track/GPC honoured, robots skipped, 400-day retention. GA4 definitions (30-min sessions, engaged = 10 s / 2 pages / key event). **Admin → Analytics** (first tab): right now (online, per-minute views, pages open, live events; 15 s refresh), KPIs vs the period before, daily chart with metric switch + CSV, channels/referrers/UTM campaigns, pages by route, most-viewed remixes, countries (edge header), devices/OS/browsers/languages/screens, weekday×hour heatmap, events, the path to publishing, weekly retention cohorts. **Admin → Users → Details**: profile, everything made and shared, money, first source, devices and places, last pages and events. Events: sign-up, log-in, upload, publish, remix play, radio tune-in, export, share.
- **Radio transitions** (`lib/radioTransitions.ts` pure, `lib/client/radioTransition.ts`): station setting with 7 styles + Auto, chosen and *heard* in the console (rendered on built-in loops). **AutoMix** (like Apple Music): over a 16-bar phrase the outgoing song's speed glides to the new tempo (≤8%, so under a semitone), lows swap at the midpoint, highs soften; plus bass swap, filter sweep, echo out, riser & drop, tape stop, smooth blend. Auto = AutoMix when tempos are within reach, else echo/filter/riser in turn (new default for every station). Each change is **rendered offline into the start of the incoming song's file** and the player hands over in 50 ms (`radioPlan.ts` `cut`), so phones with the screen locked hear the same; any failure falls back to the plain crossfade.
- **Tool pages do their tool** (`ToolWorkbench`, `lib/toolWorkbench.ts`): drop a song on `/tools/<slug>` (EN and FA) and it's split in the browser, never uploaded — instrumental, acapella, drums, bass, every stem, or a two-song mashup (tempo match + offset); waveforms, sample-accurate mixing with per-part switches, MP3 per part, the mix as WAV, then "Remix it in the Studio". Checked in Chrome: dropped a song → splitter fetched once → instrumental playing, no page errors.
- **SEO**: Lighthouse SEO **100 on every public page** checked (/, library, remixes, a remix, an artist, radio + station, tools hub + tool EN/FA, earnings EN/FA, advertise EN/FA, examples, dj, leaderboard, challenges, live, studio). `/upload` and `/approvals` score below 100 on purpose (signed-in pages, `noindex` + robots-disallowed). `/advertise` was a "sign in" stub for visitors: now a real public landing (offer, real lowest prices, rules) in both languages; money pages added to the sitemap with hreflang. `scripts/seo-audit.mjs`: 39 pages, 0 failures, 0 warnings.
- Tests: new `house-ads` 14, `navigation-speed` 8, `analytics` 14, `song-privacy` 11, `making-together` (end-to-end) 5, `radio-transitions` 9, `tool-workbench` 6; `ad-rules` +2. Full `npm test` before the last fixes: 1064 passed, 2 failed (the soft-404 issue above, fixed; `live` + `seo` rerun 29/29). `npm test` now prints the server's errors with `SHOW_SERVER_LOG=1`. tsc and lint clean.

**Open (from this session)**
- [ ] Listen on real devices: each radio transition across a real song change (rigs: `radio-check.mjs`, `radio-phone-check.mjs`), especially AutoMix's glide and the iPhone single-player handover.
- [ ] Tool pages on a phone: splitting is heavy there (the page says so); consider sending phones to the helper queue from the tool page too.
- [ ] Persian words still in English in a few new places (the "Never on Remixt" list, the analytics/admin pages are English-only by design).
- [ ] Production: check navigation timing after deploy; if the DB is Neon, consider a pooled connection and disabling scale-to-zero for the main branch.

## A mature music platform — the roadmap (asked 2026-11-20)

Ordered by what most moves Remixt from "great tool" to "place musicians live on". Each needs its own session; decisions for the owner are marked ✦.
1. **Releases & rights.** ✦ Distribution to streaming services (via a partner such as a DDEX distributor) for originals made here; ISRC per release; split sheets signed by every collaborator (the project roles and earnings splits are the start); content ID-style matching of uploads against a fingerprint index (`tracks.source_hash` is exact-file only today).
2. **Creator profiles that sell.** Verified artists, links-in-bio, a pinned release, follower notifications on release, pre-save pages, artist analytics (the new analytics, filtered to their remixes/songs).
3. **Listening experience.** A real persistent player across pages (today the library preview and the remix player are separate), queue/playlists for listeners, likes → personal mixes, lyrics everywhere, offline for installed app, Chromecast/AirPlay.
4. **Discovery.** Charts by genre/country/week, editorial playlists made in Admin, "because you liked", trending remixes of a song, search across songs/remixes/artists with typo tolerance (Postgres trigram).
5. **Collaboration, deeper.** Version history and branches per project, comments pinned to a time in the mix, stem requests ("need a vocalist for this beat"), a collaborators marketplace with ratings, real-time audio jam (WebRTC) for live sessions.
6. **Money.** ✦ Subscriptions (ad-free + higher-quality downloads), tips and paid stem packs/licences (beat leasing for producers), automated payouts once the legal side (decision 5) is settled.
7. **Trust & safety.** Moderation queues with reasons, repeat-infringer policy, age gates for explicit tags, rate-limits everywhere new, audit log for admin actions.
8. **Platform.** Native wrappers (decision 1) for background play and store presence; a public API/embeds for partners; status page and error tracking (Sentry-style) for production; load tests of the radio and analytics tables at 100× today's traffic (analytics will want daily roll-ups beyond ~10M rows).
9. **Whole site in Persian** (already planned above) and then Arabic/Turkish, sharing the `{ en, fa }` message approach.

---

## What's left (2026-11-19) — all of it needs you, a device or hardware

**2026-11-19 (3): the code side is finished.** Built the last earnings items that needed no decision (unclaimed money after 3 years, payout notices, month statements) and ran the signed-in checks against a local account (every page as a new empty account, `/earnings` with money in it, two accounts remixing together). Left open on purpose: an advertiser self-serve page and network ads (decisions 5 and 7 say not yet), and a Persian `/earnings`.

**2026-11-19: the owner reports their parts done** (Start fresh in Admin → Storage, the production settings, the device checks). No problems were reported back; **write any that were found here**, each under its phase, so they get fixed. Still open on the code side: nothing that can be done from this computer.

**0. Production storage (2026-11-19).** The Vercel Blob store `remixt-blob` is suspended ("Billing State: Inactive", 522 files / 940 MB) and can't be read at all, so its songs are given up. Done: `NEXT_PUBLIC_STEM_BITRATE` (was 128) and `BLOB_READ_WRITE_TOKEN` / `BLOB_STORE_ID` / `BLOB_WEBHOOK_PUBLIC_KEY` removed from Production; `96124e6` deployed (R2 only, stems and takes VBR MP3 -V2 with a Xing header, `mp3Xing.ts`). **Owner, still to do:** Admin → Storage → Start fresh → "Check what would go" → Remove (needs a signed-in admin; Vercel won't hand sensitive env values to the CLI, so it couldn't be run from here). Optional: delete the `remixt-blob` store in the Vercel dashboard. Still to check: the real size of a song split after the deploy (Admin → Storage).

Everything that could be done and checked from this computer is done. Open:
1. **Real phones** (Phase 2, 3, 9): iPhone (installed PWA + Safari tab) and Android Chrome — lock, switch app, home, a call; AI features' timings; a remix tune-in with nothing kept. For the radio: lock the screen through a song change, take a call, unplug headphones (see Phase 9 "Radio on phones").
2. **A signed-in account** (Phase 4, 7): a tagged MP3 upload shows its cover after splitting; the lazy cover fill on a real library; every page signed in as a real account with data. (A new empty account was checked locally on 2026-11-19 (3).)
3. **Genius**: the token is set, but from this computer Genius answers 503/403 (Cloudflare) to the API, the pages and the embed — so nothing Genius-based could be checked here. Check from another network: the lyrics picker's Genius results, and "Remove a singer" naming voices from the credits / reading `[Verse: name]` headers.
7. **iOS Simulator**: Xcode here has no Simulator.app (devices boot without a screen: "Timeout waiting for screen surfaces"), so the phone checks ran in Playwright's WebKit dressed as an iPhone instead. Install the iOS platform/Simulator in Xcode (Settings → Components) to drive real iOS Safari (`ios_webkit_debug_proxy` is installed).
4. **DJ** (Phase 6): listen for clicks at loop points; a MIDI controller.
5. **Look and listen**: the AI panel clicked through with real lanes; the four new clip visualizers in an exported video.
6. Decisions below: 1 (native wrapper), 4 (the share numbers), 5 (legal, before the first payout) and 7 (ad networks) are yours; 2, 3 and 6 were taken as recommended.

---

## Ads, complete (asked 2026-11-19 (4)) — the owner's answers, and the build

"Ads fully built like YouTube / Spotify / SoundCloud: for listeners, artists, remixers, advertisers and the site owner; Persian too; an admin panel to correct songs (name, artist, cover, lyrics)." Answers given in the session:

| Question | Answer |
|---|---|
| What the remixer decides on their remix's page | Ads on/off, which ad kinds, blocked topics (per remix) |
| Remixer says off, verified artist wants pay | The artist chooses per song: **Monetize** (ads stay on any remix of it; the remixer still gets their share) / **Follow the remixer** / **Block** |
| Ad kinds | Picture card (exists) · audio ad before a remix plays (≤ 15 s, skip after 5 s) · audio ads on the radio · Promote your remix/song — "remixer can decide all, panel and options for all details" |
| Ad-free paid plan | Not now |
| Who puts ads on | Self-serve advertiser page; runs only after the owner approves; the owner can still add ads by hand |
| How advertisers / promoters pay | Manual: card-to-card / bank / USDT; they give a reference, the owner presses "Payment received" |
| Currency | Ledger stays exact in USD; Persian users see and are paid in Toman at a rate the owner sets in Admin |
| Persian | Only the money and ad pages (earnings, advertiser, artist, remixer ad panel) |
| Pages | Artist page · remixer ad panel · advertiser page · public "where the money went" on each remix |
| Song correction panel | Suggestions (artist/title, cover, lyrics) with one-click approve, doubtful songs first |
| Who can report wrong info | Anyone ("Wrong info?"), into the admin queue |
| Shares | Keep 30 / 40 / 30 |
| Lowest prices per 1,000 | Card $0.50, audio $2, promote $0.50 (changeable in Admin) |
| Audio ad frequency | Gentle: before a remix at most one per listener per 30 min, never the first remix of a visit; radio one per ~20 min of listening; never for the remix's own makers |
| Artist picks Block | Published remixes using the song go private; the remixer is told and can take the song out and publish again |
| Promotion money | Remixt keeps it |

Asked later the same day: **uploaders and miners get a share too**; **the whole site in English and Persian, with SEO**. Taken (change in `policy.ts` `SONG_HELPERS`): each song's uploader 5% and its miner (whose computer split it; the uploader when split in their own browser) 3% of every ad using the song, **out of Remixt's part** — artists 40% and remixers 30% unchanged. A remix page is now 22 Remixt / 40 artists / 30 remixers / 5 uploaders / 3 miners; a song on the radio 32 / 60 / 5 / 3. A take pays its singer as vocalist only; an account that's gone leaves its part with Remixt.

### Ads, complete — build (2026-11-19 (4)), all uncommitted

Done and checked:
- Rules, pure and tested: `lib/monetize/adRules.ts` (kinds, formats, topics, never-allowed list, artist Monetize/Follow/Block vs remixer settings `effectiveAds`, frequency `prerollDue`/`radioBreakDue`, Toman), `policy.ts` (uploader + miner shares, one `ROLE_TEXT` for every page, `PAYOUT_METHODS` with "Iranian bank (Sheba / card, Toman)"), `moneyText.ts`. Tests: `ad-rules.test.ts` 15/15, `monetize-policy.test.ts` 16/16 (6 new for uploaders/miners), `monetize-statement.test.ts` 7/7, `song-fixes.test.ts` 7/7.
- Server: `lib/monetize/adStore.ts` (remix ad settings, song policies, Block hides public remixes and tells their makers, self-serve campaigns, payments, review, promotions, remixer and artist panels), `store.ts` (new tables/columns created on first use: `remix_ad_settings`, `track_ad_policy`, `ad_payments`, `monetize_settings`, campaign `format/topic/audio/promote/owner/review`, `ad_views.format`, payouts `currency/toman`), `lib/songFixes.ts` + `songFixRules.ts` (`info_reports`, doubt score, tidied names).
- Routes: `/api/ads` (formats, `off`, never audio to the music's makers), `/api/ads/media/[id]`, `/api/advertise` (+ `[id]`, `[id]/media`, `[id]/payments`), `/api/remixes/[id]/ads`, `/api/earnings/songs`, `/api/earnings/statement`, `/api/info-reports`, `/api/admin/songfix` (+ `[id]/cover`), admin money route (review, payments, settings, owner audio ads). Publishing refuses a remix with a blocked song (409, names it).
- Pages, English + Persian (`/fa/…`, Toman at the owner's rate): `/earnings`, `/earnings/songs` (artist), `/earnings/remix/[id]` (remixer's ad panel), `/advertise`. Remix page: pre-roll audio ad (`PrerollGate`, engine `setBeforePlay`), card only where allowed, "Where this remix's ad money goes", "Wrong info?". Radio: ad breaks (`RadioDeck.playBreak`, `useRadio({ ads: true })` on the station page only). Promoted remix in `/remixes`, promoted song in `/library`. Admin: "Waiting for you" (ads + payments), Settings (Toman rate, lowest prices, how advertisers pay), owner audio ads, new **Fix songs** tab (suggestions from Apple's catalogue + the lyrics library, one-click approve, reports).
- Checked against the dev server with five test accounts (scratch rig, **61/61**): floor price refused; draft → upload → submit → Toman payment → admin approve + received → budget $5; served and paid 300/400/300; remixer off → nothing (page says so); artist Monetize → back on (page explains); topic blocked; audio: 20 s refused, 3 s served, not to its maker, radio break ad, paid; promotion shown "Promoted", paid all to Remixt, click opens the remix; Block → remix private + maker told + republish 409; Sheba payout 1,200,000 Toman at 100,000/$; report → admin queue → rename closes it; lyrics set; all English/Persian money pages 200. Test accounts, campaigns and settings removed afterwards; the local song renamed by an interrupted run was restored ("Dorcci - Moft _320_").
- tsc clean; lint clean on every changed file (last run before the uploader/miner change, which typechecks).

### Admin → Settings: every number the owner can change (2026-11-19 (5))

Asked: "in the admin panel all settings and options can be set, like the shares — all dynamic". Built:
- `lib/settings/registry.ts` (pure, the one source): `DEFAULTS` (the values the site was built with) and `FIELDS` (each setting's unit, limits, English + Persian name, help, group, and whether browsers see it), `crossCheck` (a split makes 100%; artists and remixers always get a share; uploader + miner leave Remixt part of its share; an audio ad can't be skipped/paid after it ends), `resolveSettings` (stored values checked before use; a group that breaks a rule falls back to its defaults — the site never runs on shares that don't add up), `applyChange`, `publicSettings` (limits and security stay on the server). Adding a setting = a default + a line in `FIELDS`; the page, checks, storage and history follow.
- `lib/settings/server.ts`: `app_settings` (one row per changed setting) + `app_settings_log` (who, when, old → new); `getSettings()` cached 10 s per server (another server sees a change within that); `saveSettings` checks the change as a whole; `resetSetting` back to the default. The three money settings in the old `monetize_settings` table are moved over once and that table dropped.
- The rules take the settings as an argument (defaults when not given — the tests): `remixShares`/`songShares` (shares, uploader/miner, parent, vocal weight, owner keeps), `unclaimedCutoff`, `statementCsv` (hold days), `prerollDue`/`radioBreakDue`/`adKindText` (audio), `splitReward` (mining). Server code reads `getSettings()`; browser code reads `useSettings()` (`SettingsProvider` in the root layout).
- Settings: shares (remix and radio-song splits, uploader, miner, remix-of-remix, vocal weight, maker's minimum), payouts (hold, minimum, unclaimed years, Toman rate), ads (view = % on screen × ms, paid views per address, lowest prices), audio ads (length, skip, paid after, how often, first remix free, visit gap, radio break), switches (paying ads, audio ads, self-serve ads, promotions, sign-ups, "Wrong info?"), mining XP, every rate limit (sign-up, log-in, takedowns, claims, jam invites, ads, ad payments, reports), captcha work, how advertisers pay you.
- Admin → **Settings** tab, drawn from the registry: groups + search, each field with its unit, Persian name, help and default; changes kept as a draft and checked live with the same rules as the server (a split at 95% is red before saving); live bars of who gets what; Save / Discard; "Default" per changed setting; the history of changes. The old settings form in Ads & earnings is gone (it links here).
- Checked: `settings-registry.test.ts` (every field has a valid default, every default has a field, no duplicate paths, defaults keep every rule, limits/security never public, value checks, broken stored values fall back by group, change checks) + the money tests with the owner's own numbers — 69/69 with the others; end-to-end rig **72/72** against the dev server (split refused unless 100%, admin-only, moving 10% from Remixt to remixers pays the next view 400 to the remixer, logged old→new, ads switch off/on, self-serve closed → 403, reset to default, captcha difficulty); full `npm test` **1004 passed, 0 failed**; screenshots of the tab on desktop and phone (no sideways scroll, no page errors).

Not done yet:
- [ ] **Whole site in Persian + SEO** (asked 2026-11-19 (4)). Plan: a proxy/middleware rewriting `/fa/<path>` to the same page with a locale header (keeping the real `/fa/tools`, `/fa/earnings`, `/fa/advertise` routes); `<html lang dir>` from it in the root layout; a `LocaleLink` in place of `next/link` that keeps `/fa`; typed per-component `{ en, fa }` messages (a missing Persian string is a type error); `pageMetadata` adding hreflang en/fa/x-default to every page and the sitemap listing both. Then every page and component, Studio and DJ last. Read `node_modules/next/dist/docs` first (this Next has its own proxy/middleware rules).
- [x] Rig rerun after the uploader/miner change and the settings: 72/72 (a view now 220 Remixt + 50 uploader + 30 miner / 400 artist / 300 remixer).
- [ ] Screens: phone screenshots of `/advertise`, `/fa/earnings`, the remix ad panel, the pre-roll and the radio break; a real pre-roll and radio break heard in a browser.
- [x] Full `npm test`: 1004 passed, 0 failed (2026-11-19 (5)).

---

## Decisions for the owner (answer when you can; work starts with the recommended option)

1. **"Kill the app and it keeps playing."** If the app is *swiped away* (force-closed), no web app or PWA can keep playing on iPhone or Android. The phone ends the page, and the sound with it. What a web app *can* do is keep playing when the screen locks, when you switch to another app, or when you go to the home screen. Only a native wrapper (for example Capacitor, with a background audio service) survives a swipe-away.
   - Recommended: do phase 2 (locked screen / other app / home screen) now. Decide about a native wrapper later; it needs App Store and Play Store accounts.
2. **DJ section: real tool or training game?** Today `/dj` is mainly a training game: lessons, missions, a made-up crowd (`crowd.ts`), and an "AI DJ" that only plays the synthesised demo songs (`aiDj.ts`).
   - Recommended: make the real 2-deck player with your library songs the first thing `/dj` opens. Keep training as a clearly named "Learn" section. Remove the fake crowd outside missions.
3. **Song artwork source.** Recommended: take the cover picture that is already inside the uploaded file (MP3/M4A tags). If there is none, use the cover from the music site the song came from. If there is still none, draw one from the waveform and colours.
4. **(2026-11-19) The shares of ad money.** Built as: remix page 30% Remixt / 40% the songs' artists / 30% remixers; a library song on the radio 40% / 60% artists; ordinary pages 100% Remixt. One file: `web/src/lib/monetize/policy.ts` (`SPLITS`, `PARENT_SHARE_BP` 25%, vocal weight 2). Change the numbers there; the tests insist each party keeps a share.
5. **(2026-11-19) Paying money out — legal, before the first payout.** Members ask; you send by hand and press "Mark sent" (Admin → Ads & earnings). Methods offered: PayPal, IBAN/Sheba, USDT, other. Things to settle with someone who knows the law where you're registered: sanctions (the site is on US companies — Vercel, Cloudflare — and PayPal/Stripe don't serve Iran; paying people in Iran from abroad, or taking money from foreign advertisers into Iran, has rules), tax on what you pay out, and a short "Creator terms" page (shares can change with notice; false claims forfeit earnings; 30-day hold). Recommended: don't take advertiser money until that's done; run house ads until then (they're on now and pay nobody).
6. **(2026-11-19) Money held for artists who never claim.** Their share waits under the song (`earnings.held_track_id`). Taken as recommended (2026-11-19 (3)): kept 3 years, then it goes to Remixt — never while a claim on the song is being checked. Code: `UNCLAIMED_YEARS` in `policy.ts`; `expireUnclaimed()` in `store.ts` moves the rows to the platform and stamps `earnings.unclaimed_at` (the row keeps its `track_id`); it runs at most every 6 h per server when `/earnings` or Admin → Ads & earnings is opened (no cron). Said on `/earnings` ("Artists, always"); Admin shows the amount under Remixt's share. Change the years in one place.
7. **(2026-11-19) Ad networks (AdSense, Yektanet, Mediaad).** Not connected. AdSense doesn't serve or pay for Iranian traffic. Every network's ad is an iframe, and the site sends `Cross-Origin-Embedder-Policy: credentialless` on every page (the splitter's multi-core mode needs it), which blocks those iframes. To add one: send COEP only on `/upload`, `/studio`, `/library` (where the splitter runs) and make links into them full page loads; then give `AdCard` a network fallback when no direct campaign fits, and close each month's network revenue into the ledger pro rata by paid views (not built). Recommended: sell direct campaigns first (Admin → Ads & earnings → New campaign: CPM + budget), which pay exactly per view and need none of this.

---

## Session 2026-11-19 (2) — owner's list: radio over VPN, captcha, ads and earnings, remix together

**Radio for listeners on a VPN (Iran).** Found by reading the code, not reproduced on a real Iranian line: a connection that *hangs* (common through VPNs) stopped the radio for good, in two places. (1) The feed poll had no timeout and the next poll waits for the last one, so one unanswered poll froze the station (no next song, ever). Now 15 s (`radioClient.ts`, `within()`). (2) A stem download whose body stopped mid-way waited for ever, and the radio readies songs one at a time in one queue, so every later song waited behind it. Now (`stemFetch.ts`): 30 s for an answer, 20 s of silence in a body drops it, the bytes that came are kept and the rest asked for from there, only tries in a row that bring nothing count, waits 1/2/4 s between. Play payload 30 s. A song taking over 2 s to download shows "Slow connection — downloading the song… n%". Tests: `stem-fetch.test.ts` +3 (hang mid-body, no answer, drop every 300 KB) 12/12.
- [ ] Ask an Iranian listener on a VPN to try `/radio/remixt-radio` after deploying. If it still fails, ask for the message under Tune in.
- Found: production stems are presigned links to `*.r2.cloudflarestorage.com` (R2's S3 API), which no CDN caches: every listener pulls every byte from the bucket's home. **Recommended:** connect a custom domain to the R2 bucket (Cloudflare dashboard → R2 → bucket → Settings → Custom domain, e.g. `cdn.<your domain>`), set `R2_PUBLIC_URL` to it in Vercel, and add the site's domain to the bucket's CORS. Stems are then cached at Cloudflare's edge near each listener. Also: the R2 CORS allows only `https://remixt-free.vercel.app`, so a new domain must be added there.
- Found: the site lives on `remixt-free.vercel.app`. A domain of your own is better for search (a `vercel.app` subdomain is a weak home and can't be moved later without losing ranking) and for Iran (`*.vercel.app` is a shared domain filters treat as one). See the SEO section: `PUBLIC_BASE_URL`.

**Captcha on sensitive forms** (`lib/captcha.ts`, `lib/client/captcha.ts`, `/api/captcha`): a proof of work in the ALTCHA format, all our own — no Google (blocked in Iran) or Cloudflare script. The browser solves it in the background while the form is filled (≤ ~1.5 s on this Mac); each answer is signed, runs out in 10 min and can be used once (`captcha_spent`). On: sign-up, log-in, guest takedown requests. With it, limits counted in Postgres (`lib/rateLimit.ts`, `rate_hits`): log-in 8 wrong passwords per account / 30 tries per address in 15 min; sign-up 5 per address an hour; takedowns 10 per address an hour; song claims 20 per member a day; jam invites 30 an hour. `CAPTCHA_SECRET` (optional; else `SESSION_SECRET`). Tests: `captcha.test.ts` 5/5. Checked against the dev server: no answer 403, answer 200, replay 403, 9th wrong password 429.

**Ads and earnings** (`lib/monetize/policy.ts` pure + tested, `lib/monetize/store.ts`, `components/ads/AdCard.tsx`, `/earnings`, Admin → Ads & earnings):
- Spots: a remix's page (its makers'), the radio station page (the song or remix on air; a new song, a new spot), the remixes list, every tool page (en + fa). Never: Studio, DJ, upload, embeds/broadcast, console, admin, log-in. One spot per page, its size held before it fills (no jump), "Sponsored" / "From Remixt", loaded only near the screen.
- A paid view (`ad_views`): the paying ad at least half on screen 1 s in a visible tab; once per visitor per spot per day; not robots, not anyone the ad would pay (own work), ≤ 60 per address a day; budget taken in the same step as the view (never overspent). The token is signed (a view can't be booked for a spot never served). Clicks are counted for advertisers and never paid.
- Ledger (`earnings`, append-only): one row per recipient, adding to the micro what the advertiser paid. Waits 30 days, then withdrawable from $10 (`payouts`, rows set aside under the payout; turned down → back to the balance). Artists not verified: held under the song; a verified claim (`rights_claims`, checked by an admin) moves it to them. A take sung in the booth pays its singer directly. A remix of a remix: 25% of the remixers' part to the parent's maker. Collaborators (`remix_splits`): the owner shares the remixers' part (keeps ≥ 10%).
- `/earnings`: balance + progress to $10 + Withdraw, waiting / kept for artists of your uploads / paid / lifetime, 30-day bars, paid views and RPM, 8 milestones (views and pay, never clicks), where it comes from, claim your songs (from a remix's "Your song? Claim your share" link, or your uploads), collaborator splits, how you're paid, payouts; signed out it's a public page explaining the shares (in the sitemap, footer, More menu).
- Checked against the dev server (scratch `money-check.mjs`, 19/19): campaign served on a remix, shares 30/26.67/13.33/30, a view paid 5,000 micros split 1500/1500/1334/666, same visitor not again, robot and forged token not paid, the last of the budget once, a spent campaign not served, dashboard and payout refusal for a new member. Screens: earnings (desktop + phone), remix page with the ad opened (phone), radio (desktop): no sideways scroll, no errors. Tests: `monetize-policy.test.ts` 10/10.
- [x] Built 2026-11-19 (3): unclaimed-money expiry (decision 6, above); a notice in the bell when a payout is sent or turned down ("Your payout of $10.50 was sent to your PayPal", with the admin's note; type `payout`, links to `/earnings` — there's no email service in the app, so the bell is the channel); month statements: `/earnings` → Statement → month → Download CSV (`/api/earnings/statement?month=YYYY-MM`, `statementCsv` in `policy.ts`: one line per day/source/role with its state — waiting/available/in a payout/paid out — and the total; BOM for Excel; titles can't run as formulas). Tests: `monetize-statement.test.ts` 7/7. Checked against the dev server with two new accounts (scratch rig, 16/16): payout asked and marked sent → notice written and shown; October/November statements, bad month 400, signed out 401, another member's empty; expiry gives up only the 4-year-old held row (the 1-year-old one and the one under a pending claim stay), a second run gives nothing. Phone screenshots of `/earnings` with money and of the notice: fine.
- [ ] Not built: an advertiser self-serve page (campaigns are entered by you; decision 5 says don't take advertiser money yet), network ads (decision 7), Persian `/earnings`.

**Remix together with people online**: the Studio's shared session bar has "Invite someone online" — the artists online now (with where they are on the site), or anyone by name; they get a "jam" notification that opens the session (`/api/projects/invite`, member-only, rate-limited). A remix made together can share its earnings (`/earnings` → Share with collaborators); projects aren't tied to the remix they become, so that split is set by hand.
- [x] Checked 2026-11-19 (3) with two signed-in accounts (scratch rig, Chrome at phone size): A starts a session and invites B; B can't invite into A's session, A can't invite themselves, a guest is refused; B's bell shows "Earn Check A invites you to remix together in “Jam check”", the tap joins the session, and after the first-run "pick a Studio" screen the session is there.

---

## Phase 1 — finish what's half done (carried over from HANDOVER.md)

### 1a. Clip editor (`web/src/components/studio/ClipDialog.tsx`)
The library parts are done and tested; they aren't connected to the dialog yet.
- [x] Pass `places` to `clipLyrics` (2026-11-18).
- [x] Pass `peaks` to `clipParts` ("The loudest 30/15 s" show).
- [x] Credits: `laneCredits` in `clipSources.ts` (tested); a take is the user's artist name. The share caption says "Vocal × Beat" too. Story/portrait/square layouts moved so credits no longer touch the link.
- [x] Part picker: section bands over a vocals row and a beat row (`groupPeaks`, `mixPeaks(…, only)`).
- [x] Export in the background: `clipJob.ts`; `makeSocialClip` pauses recorder + AudioContext while hidden. The editor closes while recording; the clip button shows "42%" then "Ready". Checked in Chrome.
- [x] Song artwork as the clip's background or picture card ("Picture" → Song artwork / Your photo; `mixArtPicture`). A thumbnail can't be set: MediaRecorder has no cover track, and the apps pick their own frame.

### 1b. Lyrics finding and editing (not started)
- [x] Search results ranked against the vocal: `lyricsFit.ts` (tested) — first/last timestamp against where singing starts/stops, line count against sung phrases, length. "Fits the vocal" badge in the picker.
- [x] Easier editing: the phone screenshot showed timestamps tangled with right-to-left words. A timed sheet is now edited as words only (`lyricsEdit.ts`, tested): a line typed over keeps its time, a new line goes between its neighbours. "Show times" edits the stamps. Checked by typing in Chrome.

### 1c. AI producer leftovers
- [x] Duet one way only: `duetTurns` (tested) falls back to the host's strongest sections when strict turns find none.

---

## Phase 2 — keep playing in the background (PWA)

What happens today:
- Library and Upload previews play through an `<audio>` element (`previewPlayer.ts`). These usually continue with the screen locked.
- The Studio, the remix pages and the embed play the mix through Web Audio (`audioEngine.ts`). On iPhone, the AudioContext is interrupted when the page goes to the background, and the engine then pauses itself on purpose (`statechange` listener in `getContext`, about line 432).
- Lock-screen controls already exist (`mediaSession.ts`).

Steps:
- [x] "playback" audio session: was already done (`applyAudioSession` in `audioEngine.ts`).
- [x] Listening mode (remix page, embed): `renderedPlayback.ts` + engine. Play starts live at once; the mix renders in pieces (`renderMixWav`) and playback moves to an `<audio>` element at the same spot (~5 s later in Chrome). Pause/play then starts on the file; any change to the mix goes back to live. Not in the Studio (it's being edited).
- [ ] Live-engine MediaStream fallback: not done. The silent `nowPlayingAnchor` element already marks the page as playing media, and the latency can only be judged on a real phone. Revisit only if the device check below shows the Studio stopping when locked.
- [x] Hidden is not paused: when the context stops while the page is hidden, the engine waits and resumes on return (`resumeAfterHidden`); a call (page visible) still pauses.
- [x] Lock-screen next/previous: the Library list is a queue (`previewPlayer` toggle/play with `queue`, tested) and plays on to the next song; previous restarts or goes back. The mix gets "previous" (from the top).
- [ ] Check on real devices: iPhone (installed PWA and Safari tab) and Android Chrome. Lock the screen, switch app, go home, take a call. Write the results here. Swipe-away is expected to stop (see Decision 1).

---

## Phase 3 — phones and AI features: say clearly what works

Nothing in the app checks what the device can do today. Heavy AI work on a phone is slow, can run out of memory, and is stopped when the screen locks.

- [x] `deviceClass()` / `classify()` in `device.ts` (tested).
- [~] Measured on a simulated phone (`scripts/phone-measure.mjs`, Chrome as Android, CPU 4× slower), two songs: add 6 s, first sound 4 s, AI producer hearing 4.4 s (computer 47 s: it runs the neural beat model, phones skip it), Make it sound good + Pro mix 2 s, WAV export 13 s, page peak ≈650 MB (computer ≈800 MB). CPU throttling doesn't slow the audio thread, so exports are optimistic. **Real phone still to do.**
- [x] Labels in `deviceFeatures.ts` (tested): split slow (helper computer), lane split computer-only, mashup slow from 3 songs on phones, new song slow (computer-only from 4 songs), the rest works.
- [x] `DeviceNotice` / `StudioDeviceNotice`: what happens, and "Continue on a computer" with the address, Copy and Send (share sheet: AirDrop/email to yourself). No QR: a computer can't scan one. In the lane split dialog and the Mashup tab.
- [x] A saved remix opens on a computer: `/api/remixes/[id]` lets the owner open private remixes, `/studio?remix=` loads it. Unsaved work is only on the phone, so the Studio notice says to save first. (Not checked with a real account.)
- [x] `SplitQueue.tsx` phone notice uses the same wording (`FEATURES.split.slow`).

---

## Phase 4 — song artwork for clips and remix covers

Today only remixes have covers (`remixes.cover_key`, uploaded by the owner, `lib/cover.ts`). Songs have no picture.

- [x] Database: `tracks.cover_key`, `split_jobs.cover_key` (schema.sql + ensureSchema/ensureSplitQueueSchema; local DB migrated).
- [x] Reader `src/lib/audioCover.ts` (tested: ID3 v2.2/2.3/2.4, M4A covr with moov at the end, FLAC, Ogg across pages). At upload `songCovers.ts` squares it to 600 px and PUTs `/api/tracks/[id]/cover`; a song queued from a phone sends it for its split job (`/api/split-jobs/[id]/cover`) and the track takes it when split.
- [x] Music sites: the page's `og:image` (`pageImageOf`) when the file has no cover; queued links store it server-side.
- [x] No cover: `songArt.ts` draws one from the waveform and a colour from the title (`SongArt` component). Covers are served per stem (`/api/stems/[id]/cover`, 204 when none).
- [x] Shown in the Library, Studio lanes (not on phones: no room) and library panel, DJ track list and both deck layouts, lock screen (previews: the song; the mix: its cover or the drawn one).
- [x] Clips: see 1a.
- [x] Remix artwork: `drawCover` in `exportMeta.ts` now draws over a collage of the songs (1 = full, 2 = halves, 3 = one big two small, 4 = grid) with the title; the remix page shows it when the owner hasn't uploaded one, and exports carry it.
- [ ] Not checked with a real upload (needs a signed-in account): a tagged MP3 should show its cover in the Library after splitting.

---

## Session 2026-11-18 (2) — owner's list

- [x] Lyrics right to left: `lineDirection` (rtlText.ts, tested) goes by the line's main script, so "Yeah, من…" is still a Persian line. The lyric list's progress bar, the stage wipe (VocalStage), clip karaoke (socialClip) and the line text all follow it; English stays left to right.
- [x] AI panel kept its state: closing (X / Esc) no longer keeps the idea — it stays on, so reopening shows the same ideas on, the new-song map and its Undo (which used to re-listen from scratch). The panel's choices and what it heard survive leaving the Studio (`remembered` + `heard` in AiProducer). The AI button has a dot while an idea is on with the panel closed. Not yet clicked through in a browser with real lanes.
- [x] Song artwork online: `coverSearch.ts` (tested) + `coverLookup.ts` + `/api/covers/search` — Apple's catalogue (iTunes Search API, free, no key, pictures CORS-open) by artist and name; Persian names asked in Finglish and matched by sound; karaoke/tribute/live versions and artist-only matches refused. Third fallback at upload (`songCovers.ts`). Library songs with no cover get one the first time they're shown (`/api/stems/[id]/cover`; `tracks.cover_searched_at` so a miss isn't asked again for 30 days; 15 asks a minute). Checked live: Bazam Kalan, Blinding Lights, Amire Bi Gazand (Latin and Persian file names). Not checked: the lazy fill on a real library.
- [x] Download-site names dropped from titles (`splitSongTitle`, tested): Ganja2Music, RadioJavan, Nex1Music, UpMusic… without their .com, track numbers ("01 "), "Artist-Song-320" joined by dashes, a site's name in front. Helps lyrics and covers.
- [x] Lyrics follow the vocal: `mixSongsOf` puts songs whose vocal is in the mix first; `sungSongs` (tested) — with a vocal in the mix, only sung songs get lyrics looked up or kept open (no more the beat's song's lyrics).
- [x] Lyrics on phones: the line editor sits under the whole row (it was squeezed in the words column, nudges overflowed), nudges stretch across, Split/Join/Repeat/Line after in a grid, the line's text box follows its direction; Edit tab section chips in one swipeable row. Screenshots checked at 390 px.
- [ ] **Genius**: finds nothing without `GENIUS_ACCESS_TOKEN` (not set in `.env.local`). Free token from genius.com/api-clients ("Client Access Token"); then Genius results show in the lyrics picker. Scraping Genius's own search without a token is blocked by Cloudflare and not done.
- Known: a mixed line in the Edit box (one textarea) can't be laid out per line — "Yeah, من…" shows left to right there; everywhere else it's right.

---

## Clips — artwork and visualizers (2026-11-18)

- [x] A new clip starts with the songs' artwork as its background (`ClipDialog`): the vocal's and the beat's covers — one picture when they're the same song, side by side or a grid when not (`mixArtSongs` up to 9, `drawCollage` 3×3 for 5–9). Card or "Your photo" still selectable. Checked in Chrome (Hichkas vocal + Kid Cudi beat: two halves).
- [x] Four more clip visualizers (`socialClip.ts`, `clipDesign.ts`): LED dots, Spectrum (filled, glowing, mirrored), Pulse rings, Sun rays. Not yet looked at in an exported video.

## Phase 5 — a new song from everything in the mix (done 2026-11-18)

Several songs in the Studio → one new song: who sings when, which beat under which part, drops on choruses, one tempo and key, mixed and mastered, with tools to improve it.

- [x] Plan (`newSong.ts`, tested), builder `newSongIdea` (`aiIdeas.ts`, Mashup tab), song map + tools (`ai/NewSongMap.tsx`: swap singer/beat per part, try again, longer/shorter, more of a singer, drops on a beat, Undo), `MasterIt` under the map.
- [x] Hearing covers 4 songs now (`prepareSession` pairs; swap/duet/blend ideas still use the first 3).
- [x] One lyric sheet for the new song: `linesInEveryPlay` (`vocalTime.ts`, tested) puts each singer's timed lines at every place they're sung; `newSongSheet.ts` opens it as "A new song" while the idea is on, rewrites it on a tweak, keeps it on Keep, and on switch-off reopens the old sheet with its old times. Checked in Chrome.
- [x] Checked by numbers (rig + `check.js`-style eval of `__remixt.aiTrial`): 4 songs (Ye Rooze Khoob, Kid Cudi, Tofanag Abpaash, Tehran Gonahkar) → 3:50 at 93 BPM, Tehran left out (18% faster, said in notes). Every drop's beat starts 12 ms before its bar line (the planned fade-in lead), no section runs past its part (no line cut by the next part). After "Streaming": **−14.4 LUFS, peak −1.14 dB, 0 clipped ✓**. 3 songs earlier: −14.2 LUFS, peak −1.14 dB.
- [x] Phone (emulated, `NEWSONG=3|4 node scripts/phone-measure.mjs`): hearing 10–14 s, building ~1 s, export 27–67 s, page peak ≈1.1 GB (3 songs) / 1.2 GB (4). Label: slow (memory warning) from 2 songs, computer-only from 4 (`deviceFeatures.ts`).
- Rig steps: add `{"add":["Vocals",song]},{"add":["Beats",song]}` per song, then `{"ai":true},{"tab":"Mashup"},{"switch":"^A new song from everything","settle":15000},{"stop":true},{"click":"button:visible:has-text('Streaming')"},{"wait":45000},{"export":"x"}`. `window.__remixt.aiTrial` (dev only) has the trial: the idea's `song.plan` and `song.sheet`.

---

## Phase 6 — DJ section that is real (done 2026-11-18, two device checks left)

Decision 2 taken as recommended.
- [x] `/dj` opens on the decks (`DjApp.tsx`: engine made on arrival, the first tap unlocks sound) with two library songs that fit (`openingPair` in `djLibrary.ts`, tested: newest full song ≥ 90 s + best tempo/key fit). Demo songs only when the library has fewer than two, and the page says so. Nav, home page and page title say "DJ decks".
- [x] Auto DJ (`EasyDecks.tsx`, switch under Auto-mix): picks the next library song (`pickNext`, tested: tempo incl. half/double time, key, never twice), loads it on the free deck and starts Auto-mix ~112 beats before the playing song ends. The missions' AI DJ (`aiDj.ts`) picks from the library too; demo songs as fallback.
- [x] Crowd and requests already lived only in missions (`scenarioRunner`, `MissionPanel`). The free decks show real readings: tempo gap / beat offset (ms), key fit, and now the master (peak dB, limiter gain reduction via `DjEngine.limiting()`, clipping).
- [x] Training under "Learn to DJ" (`DjHome.tsx` is the Learn page; says the crowd is part of the game).
- [x] Set recording: the engine keeps a set list while recording (song the room hears most, `noteSetList`); after Stop: the list, "Save as MP3" (`djSetExport.ts`: tagged title/credits/comment with the list, 800 px cover collage of the songs; up to 20 min), "As recorded" and "Track list" (.txt).
- [x] Checked with real songs (`node scripts/dj-check.mjs 3`): opened on two full library songs in 7 s; Ye Rooze Khoob (93 BPM) + Tofanag (97 BPM) synced and played 3 min: 0 ms drift (engine positions); the Auto DJ started the transition by itself near the end and loaded the next song; set list 0:00 / 0:47; MP3 with cover and list (ffprobe).
- [ ] Not checked: clicks at loop points (needs listening or a recorded-loop analysis), a MIDI controller (needs the hardware).

---

## Phase 9 — Radio (asked 2026-11-18)

A real radio station in the app: everyone hears the same song at the same moment, listeners vote on what plays next and send requests, the owner runs playlists and a console, with reports. Usable in the app, embedded in other apps and games, and broadcast to YouTube Live.

How it works (like the live rooms, `lib/live.ts`): no media server. The server keeps each station's schedule (queue items with `starts_at`); every listener's browser plays the item at `now − starts_at` through the Studio engine in listening mode (rendered to an `<audio>` element, so it keeps playing with the screen locked). Songs from the library and published remixes both play. The schedule moves on lazily when anyone asks (feed polling), under an advisory lock, so it runs on Postgres on any host.

- [x] Schema (created on first use, `ensureRadioSchema`): `radio_stations`, `radio_queue` (also the play history), `radio_playlist`, `radio_requests`, `radio_votes`, `radio_listeners`.
- [x] `lib/radioPick.ts` (pure, `tests/radio.test.ts` 11/11): order DJ queue → vote winner → most-requested (then oldest) → playlist rotation (rest = min(12, size−1)) → library; vote choices (requests first, then playlist, then library); clock helpers.
- [x] `lib/radio.ts`: tick under `pg_try_advisory_xact_lock` (library read before the transaction — holding the lock while taking more pool connections deadlocked the feed; fixed), gapless start or "now" after 30 s of silence; votes per round; requests (per-listener limit, open/review/off, "Me too" counts); listeners by heartbeat; reports + CSV play log. House station `remixt-radio` (no owner, admins run it, plays the whole public library).
- [x] API under `/api/radio` (stations, feed, vote, request, search, play payload, console actions, report/CSV, public CORS `/now`).
- [x] Pages: `/radio`, `/radio/[slug]`, `/radio/[slug]/console` (owner or admin: On air + Skip + queue, Requests accept/turn down, Playlist, Settings, Reports with CSV, Share), `/radio/[slug]/embed`, `/radio/[slug]/broadcast` (tunes itself in; OBS). Site chrome hidden on embed/broadcast (`lib/bareView.ts`). "Radio" in the nav (DJ moved under "More" on tablets so the header fits).
- [x] Crossfades on the beat (like a streaming app's automix): the server picks the next song 90 s before the end (`NEXT_LEAD_SECONDS`) and starts it a crossfade early — `crossfadeFor` (tested): tempos within 6% (half/double time count) blend 8 bars of the outgoing tempo (4 when slow), else a quick 2 bars, unknown tempo 6 s, ≤ 16 s and ≤ a third of either song. Equal-power gains. Feed has `now`, `upcoming`, `fading`. Items carry `bpm` (tracks.bpm, a remix's projectBpm).
- [x] Player (`radioDeck.ts`): every song is rendered to a WAV in the tab and played by `<audio>` (keeps going with the screen locked); two decks crossfade through Web Audio gains + analyser (visualizer); iPhone (element volume is fixed there) switches at the crossfade start. Songs: their stems summed directly (≈4 s, 2 s cached). Remixes: the Studio mixdown (`renderMixWav` with a span) — tune-in shows "Getting the remix ready… n%". Clock: NTP-style, the quickest of the last 12 round trips. Lock screen: Media Session metadata + play/pause.
- [x] Checked (`OWNER_ID=<id> SHORTEN=1 node scripts/radio-check.mjs`): two tabs −26/−88 ms from the station clock; at the change the voted song came in over a 6 s equal-power blend (0.9/0.08 → 0.03/0.9) in both tabs; after it, both within 23 ms of the station (2 ms apart).
- [x] Always on, anywhere: `/radio/[slug]/embed?autoplay=1` starts by itself where sound is allowed (OBS, game web views, kiosks) and retunes after a drop; `postMessage` API — `{type:"remixt-radio", action:"play"|"pause"|"volume", value}` in, `{type:"remixt-radio:state", playing, now, next, listeners}` out (checked: `node scripts/radio-embed-check.mjs`). The broadcast view retunes itself too. Share card lists all of it.
- [x] **Remix mixdown speed — profiled (2026-11-18 (3))**: nothing wasteful in it. The 4:00 remix "avalin" renders in ~6 s (40× real time) on an idle Mac; the same render swings 3× with machine load (a blank page's synthetic render went 0.55 → 1.8 s within minutes, load average 10–30 with iCloud's `bird` at 100%), which explains the 26/45/100 s seen before. Ruled out: the progress pauses (no progress at all: same time), the live AudioContext (suspended: same), the main thread (no long tasks). The costly stages (drive, compressor, reverb) are already out of the path when off; what's left per lane is 7 biquads + the echo loop. Not changed — it would touch every export. Instead the radio now **keeps what it mixed** (next item), so a remix is mixed once per device.
- [x] **Radio keeps every song it mixed** (`radioCache.ts`, kind `radio` in `localCache.ts`: phone 300 MB / computer 1.5 GB, 30 days, least-recently-used first; on the Storage page as "Radio remixes"). Kept whole from 0:00, keyed by a SHA-256 of the play payload + length (an edited remix gets a new key; `RADIO_MIX_VERSION` to remix everything). Kept → played at once and sought to the station's spot (waits for the element's metadata first, Safari drops an earlier seek). Not kept → exactly the old path; mixed from 0 → kept as is; tuned in part way → the whole song is mixed for keeping later, only while the mixer is idle, and that job is aborted the moment the station needs a song (it's retried later). `tests/radio-cache.test.ts` 2/2. Checked: `node scripts/radio-cache-check.mjs` on the house station — first visit 2.4 s to sound (2 mixes, 42 MB kept), second visit **0.39 s, 0 mixes, −4 ms off the station** at 0:11.
- [x] **Radio on phones (2026-11-18 (4))**: songs stopped at the change with the screen locked, and the change sometimes showed an error on phones. Causes: each song got a *new* `<audio>` element, and phones only let a page start an element it started from a tap (a new one with the screen locked is refused: "Tap Tune in again"); kept mixes came back from IndexedDB typeless, which Safari won't play; a failed download of the next song flipped the whole radio to "error". Now (`radioDeck.ts`):
  - Players made once, in the Tune in tap, and reused for every song (src swapped). Between songs, or while one is being mixed, a player loops half a second of silence, so the phone keeps the page's sound session and lock-screen controls.
  - Per device (since (5): no Web Audio anywhere in the sound's path — see below): computers and Android 2 players crossfading by element volume; iPhone/iPad 1 player that never stops and changes song **halfway** through the crossfade (where both are equally loud). The plan is pure: `lib/radioPlan.ts`, `tests/radio-plan.test.ts` 8/8.
  - Driven by the elements' own events too (timeupdate, ended, loadedmetadata) and by every feed answer, not only the 120 ms timer: a hidden page's timers may sleep. The outgoing song no longer fades to nothing when the next one isn't ready.
  - A song that can't be readied is tried again after 2, 5, 15 s; the listener only sees it when nothing plays. A kept mix is checked ("RIFF") and typed `audio/wav` before playing; one an element can't play is forgotten (`forgetMix`) and mixed again.
  - The phone pausing the sound: played again once (a glitch plays on); refused, or paused again within 5 s (a call, another app) → the radio pauses like a music app, and Play on the lock screen tunes back in. Lock screen: metadata on each new song, `playbackState`, a `stop` action.
  - Asks once for persistent storage (`navigator.storage.persist()`) so kept mixes and stems aren't evicted under pressure.
  - Checked: `radio-cache-check.mjs` (first 2.2 s to sound, again 0.24 s, 4 ms off); `radio-check.mjs SHORTEN=1` (equal-power 0.9/0.02 → 0.09/0.9, tabs 5 ms apart); new `scripts/radio-phone-check.mjs` — `PHONE=ios|android`, the page's timers asleep (one firing per 10 s) through a song change: iOS 4 of 5 runs and Android 2 of 2 went from one song to the next with no silence. The one failing iOS run (the first, before the pause logging was added) went silent ~50 s before the change and couldn't be reproduced; the resume-once and tick-on-every-feed changes came after it. **Real phones still to check**, including whether unplugging headphones makes it play on through the speaker (the resume-once).
- [x] **Lyrics on the radio** (`radioLyrics.ts`, `RadioLyrics.tsx`, station page + broadcast view): listeners don't have the Studio's sheets (they live in the maker's browser), so the words are found like the Studio does — the vocal's song by its title (`mixSongsOf`, only songs whose vocal is in the mix: a remix over another song's beat shows the vocal's words), timed lyrics from the lyrics library (same recording ±4 s), and for a remix every line put where its moment of the vocal plays (`linesInEveryPlay`: clips moved, cut, repeated, stretched). Karaoke style on the station's clock (tuned in or not): the line sung fills in as it's sung (right to left for Persian, `lineDirection`), the one before above, the next below. "Instrumental" when nothing is sung, "No timed words found" otherwise. Kept on the device with the analysis (key: what the mix is made of); a miss is asked again after a day. The play payload is fetched once for the player and the lyrics (`playPayload`, 5 min). Checked in Chrome on the house station (Metallica): lines on time, fill across the words. Not checked: a Persian song and a remix with moved clips on the radio (both paths are unit-tested in the Studio).
  - Later, if wanted: save the remix maker's own sheet with the remix (server), so their edited words show instead of the library's.
- [x] **Radio: speed, preloading, sound path (2026-11-18 (5))** — measured with a CPU profile on the page (long tasks, frame gaps):
  - The freeze was the WAV encoding (`pcm16`, 480 ms in one block per song): now a typed-array loop (3.7× quicker, byte-identical — checked on 4 min of noise incl. NaN/±1), and the radio's songs are encoded 10 s at a time with the page getting a turn between (`encodeWavGently`, `yieldToPage`: `scheduler.yield` or a MessageChannel — never a timer, which a hidden page slows).
  - **Preloaded before the tap**: the page makes the players and mixes the song on air while it's open and visible (`RadioDeck.warm()`, from `useRadio`, not the console); the next song too when it's within 20 s. Tune in then plays in **0.07–0.4 s** (was 1.5–2.3 s). Tuning out keeps what was mixed.
  - **No Web Audio in the sound's path on any device**: opening an AudioContext blocks the page 0.26 s — and 1–1.8 s with this machine loaded — so the elements play straight to the speaker everywhere (computers and Android crossfade by element volume, iPhone switches). The visualizer only listens in (`captureStream` → analyser, made in idle time after the music starts).
  - Just after a song starts, it's put on the station's clock within 120 ms (then 400 ms), so a slow `play()` start doesn't leave a tab 300 ms behind.
  - Visualizer: canvas no longer resized every frame, 30 fps.
  - Remixes still mix through the Studio's engine (so they sound as made); that opens the Studio's AudioContext once per page (0.26 s normally) — during warm-up, not in the tap.
- [x] **Visualizer in time** (`lib/visualBars.ts`, `tests/visual-bars.test.ts` 3/3): where it can listen (Chrome, Edge, Firefox), its bars are shown as late as the sound reaches the speaker (`AudioContext.outputLatency + baseLatency`, ≤ 0.5 s — Bluetooth is 0.15–0.3 s) with lighter smoothing; where it can't (Safari, iPhones), the bars are the song's own loudness (its lanes' waveforms as heard, `mixEnvelope`) 2 s either side of the station's exact position — in time on every device, instead of a made-up animation.
- [x] **Songs with no artwork**: a record in the song's two colours with the first letter of its name on the label (`songDiscSvg`, `songInitial`: "01 - Shayea - Deli.mp3" → D, Persian too; `tests/song-art.test.ts` 3/3). The big one on air spins while the radio plays (still light on it, reduced-motion respected); everywhere else with no waveform to draw (thumbnails, the drawn cover app-wide) the still record.
- [x] **Radio words — always the vocal's** (`wordsOf(…, { vocalOnly })`, tested): an instrumental shows none; a remix whose only voice is a take shows "the maker's own words" (its owner can set them).
- [x] **Smarter finding** (`lyricsFit.bestTimed`, `itemWords.ts`, `tests/item-words.test.ts` 6/6): the library's timed copies ranked by how they fit the singing — read from the vocal's waveform in the play payload, no download — and taken only when surely this recording (same length ±4 s, or a strong fit: first/last lines on where the singing starts/stops). Nothing sure → no words rather than wrong ones.
- [x] **"Wrong words?" / "Find the words"** on the station page (`RadioLyrics.tsx`): searches by itself for the song, results marked "fits the singing"; pick one (timed sheets placed through the remix's clips; words-only sheets timed from the vocal's waveform, `timeWords`/`autoTime`), nudge Earlier/Later by 0.5 s, "Show no words", "Back to the found words". For this device (`localStorage`, 60 songs) or — the song's/remix's owner or an admin — **for everyone** (`item_lyrics` table, `lib/itemLyrics.ts`, `/api/lyrics/choice` GET/PUT/DELETE). Order: listener's own → owner's → found.
- [x] **The line sung on the lock screen** (and Dynamic Island / watch / car — whatever shows Now Playing): Media Session `artist` = "♪ line", `album` = artist · station, `setPositionState` for the progress bar; moved on by the players' own events so it keeps going with the screen locked. "Lock screen" switch on the lyrics card (on by default). Desktop Chrome checked; how often iOS redraws it with the screen locked needs a phone.
- [x] Checked: `scripts/radio-words-check.mjs` 11/11 (lock screen song + line, picker 6 results, your pick, nudge kept +0.5, no words, back, owner sets for everyone, a guest refused 401, guest sees it, owner clears); `radio-check.mjs SHORTEN=1` (equal-power blend, tabs 2 ms apart after the change); `radio-phone-check.mjs` Android ✓, iPhone in WebKit ✓ (0–1 silent half-second at the switch across runs); phone screenshot of the "Wrong words?" panel (390 px, no sideways scroll).
- [x] **Radio and live sessions cutting in and out every second (2026-11-19)**: the radio sought back onto the station on every `timeupdate` when off by 0.12 s (first 3 s) / 0.4 s; a seek silences the element for a moment, which put it off again — in WebKit 116 seeks and 63 stalled quarter-seconds a minute. Now (`radioDeck.ts` `follow`): an element's start-up delay is learned per device and it's started that far ahead (`lead`); a start that landed off >0.25 s gets one fix; after that a small drift is taken up by playing speed (±3%, pitch kept) — not in Safari's engine (desktop Safari, every iPhone browser), where a speed change stalls the element — and only >1.5 s is a jump, at most every 8 s. The clock's best reading is kept 10 min, not 12 polls. Live sessions: the follower compared the host with `store.playhead`, which animation frames move — they stop in a hidden tab, so a background listener was "behind" and sought every second, and a background host published a frozen position. Both now read `audioEngine.position()` (the audio clock); the follower moves only when out of step on 2 checks in a row, at most every 5 s. The station tick lists the R2 keys before its transaction. Checked: scratch rig, feed answers delayed 0–1.2 s at random — Chrome 0 seeks, 0 stalls, median 18–32 ms off; WebKit 1 seek (the start fix), median 6–63 ms; `radio-phone-check.mjs` Android + iOS through a song change, timers asleep: 0 silent samples; Studio with animation frames stopped: store playhead moved 0.01 s, `position()` 6 s in 6 s. **Real iPhone still to check.**
- [ ] Remix tune-in time on a real phone with nothing kept (needs a phone).
- Later: a plain audio stream URL (Icecast-style) needs remixes rendered on the server — not possible while remixes exist only as lanes.

## Phase 10 — Remove one singer from a song (done 2026-11-18)

In the Studio: vocal lane menu → "Remove a singer…" (`RemoveSingerDialog.tsx`; logic in `lib/client/singerParts.ts`, `tests/singer-parts.test.ts` 10/10).
- [x] By lyrics: Genius-style headers (`[Verse 2: 2 Chainz]`, `[Chorus: A & B]`, `(Name)`) → sections with performers; pick a singer; parts sung together are flagged (taking them out takes both voices there). Found lyrics still timed to the recording are mapped through the lane's clips (`onTimeline`).
- [x] By voice: phrases from the vocal's loudness (≤ 3 s pieces), a fingerprint per phrase (16-band spectral shape, voiced share, pitch spread, median pitch), k-means 2–4 from several starts, kept only when the silhouette is ≥ 0.22 and no group is under 8% of the phrases; Voice 1 sings most; each voice can be listened to.
- [x] By hand: tap parts on the strip, or tick lyric sections.
- [x] Remove: keep the music (vocal clips cut, 30 ms fades on new edges; a lane with nothing left is muted) or cut the time out of the whole song (widened to whole bars, markers shifted). Lyric lines inside go. One undo step (`startNewStep` before and after).
- [x] Checked on "Kid Cudi – Can't Believe It (Ft 2 Chainz)": no names in its lyrics; by voice → 2 voices (silhouette 0.44), Voice 2 = mostly 1:41–2:13 (the featured verse) plus two short intro bits; taking it out left 9 clips, all faded. The first version heard one voice (an odd phrase became its own group) — fixed by the several starts and the minimum group size.
- [x] Checked in Chrome (`node scripts/singer-check.mjs <remix id>`, on "avalin"): by voice → 2 voices, Voice 2 taken out with "Cut that time out" → 4:00 became 2:04, exactly 44 whole bars, both lanes cut to matching clips; ⌘Z brought every lane, clip and the length back (identical). `LYRICS=1`: a timed sheet with `[Verse 1: Hichkas]`, `[Chorus: Hichkas & Dorcci]`, `[Verse 2: Dorcci]` → both offered by name, the shared-chorus warning shows, "keep the music" kept 4:00, cut the vocal into clips and took out the 6 lines sung there. Phone (390 px) bottom sheet: fits, nothing cut off.
- [x] **Easier on phones, and it works it out by itself (2026-11-18 (5))**: opening the dialog starts listening to the voices at once (the vocal fetched and decoded if the Studio hasn't loaded it — no more "press play once"), and when the open lyrics name no one it looks on Genius for lyrics that do (`namedLyricsFor`: Genius words timed by the library's copy of the same recording) and for the song's credits ("Voice 2 · probably 2 Chainz"). New **"Point out"**: play, hold the big button while that singer sings (a line or two), "Find all their parts" → every phrase that sounds like them (`likeThese`: the marked phrases fixed in one group, the rest to the nearer average, a lone phrase between two of theirs is theirs; `phrasesIn`; tests 5 new, 15/15). Every part is a row (listen ▶, tick) instead of tapping slivers on the strip; the strip is an overview; the action bar stays at the bottom of the sheet. Checked (`singer-check.mjs`, now `POINT=1` too): by voice → 2 voices, cut 44 whole bars, undo identical; pointing out 3 s at 1:20 marked 2 phrases → found 37, the same 33 parts the voice grouping picked. Phone screenshot: fits.
- [x] The Studio's Undo button at 1440 px (2026-11-19): it is there in Easy, Vocalist and Producer with lanes in (measured: x 847, on the transport's second row next to Redo, History and AI while the library panel is open). Nothing to fix.

## Phase 7 — every page works and makes sense

Pages: `/` `studio` `library` `upload` `remixes` `remixes/[id]` `r` `embed` `artist` `dj` `live` `live/new` `live/[id]` `challenges` `leaderboard` `notifications` `invite` `examples` `login` `signup` `storage` `takedown` `admin`.

Done 2026-11-18 (3) as a guest, with `node scripts/page-audit.mjs` (every page on phone 390 px and desktop 1440 px: status, page/console errors, sideways scroll, broken images, "NaN/undefined/Infinity" on screen, buttons/links with no name; screenshots in `OUT_DIR`). Set `REMIX_ID`, `ARTIST_ID`, `LIVE_ID` for the pages with ids; `COOKIE=` to run it signed in.
- [x] OK on phone and desktop: `/` `/studio` `/library` `/upload` `/remixes/[id]` `/embed/[id]` `/artist/[id]` `/dj` `/radio` `/radio/remixt-radio` (+ `/embed`, `/broadcast`) `/live` `/live/new` `/live/[id]` `/challenges` `/leaderboard` `/notifications` `/examples` `/login` `/signup` `/storage` `/takedown`.
- [x] `/remixes`: the "Remix of the day" cover link had no name for screen readers — fixed (`aria-label`).
- [x] `/admin`: 404 for anyone not an admin — on purpose (`notFound()`, no hint it exists).
- [x] `/examples` says clearly which is which: "From the library" (real uploads, split by the AI splitter) and "Demo songs" (synthesised in the browser) are separate tabs, each explained.
- Screens looked at: radio (phone), DJ decks (phone), examples (desktop) — fine.
- [x] As a new empty account (2026-11-19 (3), `COOKIE=` with a fresh local sign-up): every page OK on phone and desktop; `/admin` 404 (not an admin, on purpose). `/earnings`, `/tools`, `/fa/tools` added to the audit's list. A first visit to `/dj` logs 404s for `/api/stems/<id>/results/analysis` — that's the analysis cache saying "not made yet" (the page then makes and saves it); a second visit is clean.
- [ ] As a real account with data (needs the production login, which isn't stored here).

---

## Phase 8 — checks before every commit

Last run (2026-11-19 (3)): tsc clean; lint = the 3 old vendored errors (`public/stretch/…`), the changed files clean; full `npm test` (with its own server) **952 passed, 0 failed** (93 s).


- [ ] `cd web && npx tsc --noEmit && npm run lint && npm test -- --brief` (stop any `next dev` in `web/` first; they share `.next`).
- [ ] Each phase adds unit tests for its pure parts (`newSong.ts`, `deviceClass`, tag reader, DJ library pick).
- [ ] Phone screenshots of every new screen.

---

## Notes and tools (from earlier sessions)

- Signed in locally without a password (2026-11-19 (3)): sign up through `tests/support/auth.ts` (`authInit` solves the captcha), or mint the cookie — `new SignJWT({ userId }).setProtectedHeader({ alg: "HS256" })…sign(SESSION_SECRET)` with `jose` — and pass `COOKIE="remix_session=…"` to `page-audit.mjs`. A scratch TS rig importing `src/lib/*` server code needs `next/headers` mapped to `next/headers.js` on top of `tests/support/register.mjs`. Delete the test accounts afterwards (`email LIKE '…@example.test'`).
- New rigs (2026-11-18 (5)): `OWNER_ID=<id> node scripts/radio-words-check.mjs [slug]` (lock-screen line, "Wrong words?", owner's choice); `radio-phone-check.mjs` takes `ENGINE=webkit` (Safari's engine); `singer-check.mjs` takes `POINT=1`. A CPU profile of a page: CDP `Profiler.start/stop` + a `longtask` PerformanceObserver (as in this session's scratch rigs) found the radio's freezes.
- New rig (2026-11-18 (4)): `OWNER_ID=<user id> PHONE=ios|android node scripts/radio-phone-check.mjs` — the radio through a song change dressed as a phone, timers asleep (`SLEEP_MS`); logs every `pause()` with its caller.
- New rigs (2026-11-18 (3)): `scripts/page-audit.mjs` (every page, both sizes), `scripts/singer-check.mjs` (remove a singer + undo; `LYRICS=1` for the headers sheet), `scripts/radio-cache-check.mjs` (kept radio mixes). `window.__remixt.renderMixWav` (development only) times the listening-mode render from a console or rig.

- Cheap tests: `cd web && npm test -- --unit --brief` (no server); `npm test -- --brief tests/<file>.test.ts`.
- New network problems: add a case to `tests/upload-sim.test.ts` with `tests/support/line.ts`; don't test by hand.
- Phone upload in real Chrome on a slow line: `node scripts/phone-upload.mjs` (`CUT=20`, `RELOAD=1`, `MB=`, `UP_KBPS=`). Needs the app running.
- Library playback check: `node scripts/preview-play.mjs` (`ENGINE=webkit` for Safari's engine).
- AI rig: `BASE_URL=http://localhost:3100 OUT_DIR=/tmp node scripts/ai-drive.mjs steps.json`, then `node scripts/measure-wav.mjs /tmp/x.wav`. Steps format is in `AI_REMIX_PLAN.md`. `window.__remixt` (development only) holds the stores.
- AI calibration (measured): `VOCAL_OFFSET_DB` −1.5, `BACKING_LUFS` −17, compressor model peaks at LUFS+4.
- Port 3000 is often another project: check with `curl -s localhost:3000 | head -c 300`; else `npx next dev -p 3100`.
- Live site `remixt-free.vercel.app`: look and listen only; never save or delete there. The test login was given in chat and is not stored here.
- Not checkable from here: the production store (Vercel Blob) for phone uploads.
- 3 lint errors are old, in vendored files under `public/`.
- Read `web/AGENTS.md` before touching Next.js code.

---

## Done (committed in `0fee2ca` and earlier)

- Phone uploads reach the split queue (relay slices, resume, honest stall timer).
- Library / Upload play stopping after a few songs (Safari typeless blobs; one keep-download at a time).
- "Refresh request" missing on phones (version check time limit and retries).
- Lyrics drifting off the vocal after edits.
- AI producer stages 1–3: whole song survives, measured pro mix and mastering, songs together (two songs).

---

## SEO (2026-11-18)

- [x] Tool pages for what people search: `/tools` hub + `/tools/{vocal-remover,acapella-extractor,karaoke-maker,stem-splitter,drum-extractor,bass-extractor,mashup-maker}` (content in `web/src/lib/tools.ts`; every claim must stay true of the app). JSON-LD: WebApplication, HowTo, FAQPage, BreadcrumbList.
- [x] Site footer on content pages (`SiteFooter` + `FooterGate`, off in Studio/console/embeds: `showsFooter`), "Made by" link to the owner's site (`SITE_CREATOR` in `site.ts`, also Organization `founder` and `<meta name="author">`).
- [x] Home: tools section + FAQ entry; `/dj` server-rendered intro; descriptions ≤160; sitemap adds tools, `/radio`, stations; breadcrumbs on remix/artist pages; `/llms.txt`; optional `GOOGLE_SITE_VERIFICATION` / `BING_SITE_VERIFICATION` / `YANDEX_VERIFICATION` meta tags.
- Guards: `tests/seo.test.ts` (lengths, uniqueness, links, footer gate); `node scripts/seo-audit.mjs` crawls the live sitemap (0 failures; warnings: `/dj` and radio stations have their `<h1>` only after JS).
- [ ] Production: set `PUBLIC_BASE_URL` to the real domain (canonicals/sitemap use it), submit `/sitemap.xml` in Google Search Console and Bing Webmaster Tools.
- [x] Persian tool pages (2026-11-19): `/fa/tools` + `/fa/tools/<slug>` — the same seven tools under the same slugs, written for Persian searches («حذف صدای خواننده», «جدا کردن آکاپلا», «ساخت کارائوکه»…; the app's English button names given where a step names one). Content in `lib/toolsFa.ts`, words around it in `lib/toolsUi.ts` (one entry per language, so a missing translation is a type error); one view for every language (`components/tools/ToolPageView.tsx`, `ToolsHub.tsx`), the routes only pick page + language. `/fa` layout: `lang="fa" dir="rtl"`; arrows/chevrons turn round (`rtl:`), step numbers in Persian digits. hreflang en/fa/x-default in each page's head (`pageMetadata({ languages })`, `toolLanguages`) and in the sitemap; Open Graph `fa_IR`; JSON-LD `inLanguage`; footer link «ابزارها به فارسی»; `/llms.txt` lists them. `tests/seo.test.ts`: every check per language, plus every English page has its twin (same steps/sections/questions/library/related), Persian text is Persian, hreflang reciprocal. Checked in Chrome: phone 390 px + desktop, no sideways scroll, canonical + 3 alternates, unknown slug 404.
- [x] **Persian letters were drawn unjoined across the whole site** (found 2026-11-19 while checking the above): Geist has no Persian, and its size-adjusted Arial fallback broke the joining — every Persian title, artist, lyric line. Now Vazirmatn's Arabic-script cut (`assets/fonts/Vazirmatn-arabic.woff2`, variable, 46 KB, OFL) is first in `--font-sans` and `--font-mono`, limited by unicode-range to Persian/Arabic letters and joiners, no preload (`layout.tsx`, `next/font/local`). Checked with Chrome's own font report: English paints in Geist, Persian in Vazirmatn. `next/font/google` can't do this — its CSS carries every subset whatever `subsets` says, so Vazirmatn took over Latin too. Guard: `tests/fonts.test.ts`. Canvas text (clips, covers, DJ) uses system fonts, which were fine.
- Production canonicals use `https://remixt-free.vercel.app` (checked 2026-11-19). If the site gets its own domain, set `PUBLIC_BASE_URL` to it.
