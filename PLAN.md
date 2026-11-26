# Remixt — the one plan

The only to-do list: **only what's left**. Finished work lives in git history (`git log`), not here.
Read this first in a new session, then `git status`. Before a session ends: delete what got done, add what was found.

Last cleaned: 2026-11-26 (everything finished before then was removed).

---

## 1. Money — what the owner has to do (the code is built)

Everything below is switched on from **Admin** once the account/key exists. Nothing earns until these are done.

### Before anything else

- [ ] **Change the admin password.** The one in use is weak (Admin now shows a red warning until it's changed). Changing it signs out every other device.
- [ ] **Your own domain** (e.g. `remixt.app`). AdSense does not approve `*.vercel.app` / `*.workers.dev` addresses, search ranking can't be moved later, and Iranian filters treat shared domains as one. Then: set `PUBLIC_BASE_URL`, add the domain to the R2 bucket's CORS, submit `/sitemap.xml` in Google Search Console and Bing.
- [ ] **Legal (decision 5).** Where Remixt is registered decides what's possible: AdSense, Stripe and PayPal don't accept publishers/merchants resident in Iran, and paying people in Iran from abroad has sanctions rules. Read `/privacy` and `/terms` (new, drafted from what the code does) and have them checked. Don't take advertiser money or pay anyone out before this.
- [ ] `SESSION_SECRET`, `ADMIN_EMAILS` set in production (the site refuses to sign anyone in without the secret).

### Ad networks (real ad money, shared with creators)

- [ ] **Google AdSense** (English-speaking traffic): apply at adsense.google.com with your domain → when approved: Ads → By ad unit → Display ad (responsive) → copy the publisher id `ca-pub-…` and the unit id → Admin → Settings → Ad networks → paste both, switch on. `/ads.txt` and the verification meta tag are written for you.
  - In AdSense → Privacy & messaging: turn on the **consent message for EEA/UK/Switzerland** (required by Google; `/privacy` already says visitors there are asked).
  - In AdSense → Blocking controls: block the categories the site never shows (gambling, dating, alcohol… — see the "Never on Remixt" list in `adRules.ts`).
- [ ] **An Iranian network** (Persian traffic; AdSense doesn't serve Iran): Yektanet or Mediaad → their panel gives a `<script src=…>` and a `<div id=…>` per position → Admin → Settings → Ad networks → "Another network": the script address and the element id; paste their `ads.txt` lines too. Persian pages then get it, English pages AdSense.
- [ ] **Each month**, when a network has paid: Admin → Ads & earnings → Ad networks → enter what it paid for that month → "Share out". It's split by each page's network views, then by the usual shares (artists 40 / remixers 30 / Remixt 22 / uploaders 5 / miners 3 on remixes), and members see it on `/earnings` after the 30-day hold. AdSense pays around the 21st for the month before, once your balance passes $100 — share each month's *finalized* amount from AdSense's Payments page.

### Plus subscriptions

- [ ] Stripe: secret key + webhook (Admin → Plans shows the webhook address). PayPal: client id/secret + webhook id. **Test with Stripe test keys and PayPal sandbox first**, then live keys.
- [ ] Admin → Settings → Plans → switch plans on (prices are there).

### Direct ads and promotions (already working)

- [ ] **Admin → Ads & earnings: follow "Set up ads, step by step" at the top** — it ticks itself from the live settings and opens the right place for each step. The one it will flag first on production: "Tell advertisers how to pay you" (Settings → How advertisers pay you).
- [ ] **The test ads you added in production:** each campaign there now says why it isn't showing. An approved ad shows only once it has money: press "Payment received" on its payment (that's what fills the budget). On 2026-11-25 the live site served one paid audio ad (radio) and no paid picture ad — the radio/site picture spots were showing Remixt's own ads.
- [ ] Then advertisers self-serve at `/advertise` (a 3-step form; each ad shows made → checked → paid → showing with the next step as a button).

### Other keys

- [ ] `RESEND_API_KEY` + `MAIL_FROM` (email confirmation, password reset — without it, nobody can reset a forgotten password).
- [ ] `OPENROUTER_API_KEY` (the site's AI) — then try a conversation in the Studio.
- [ ] R2 custom domain + `R2_PUBLIC_URL` (stems cached at Cloudflare's edge; see DEPLOY.md "Cloudflare: fast and cheap").
- [ ] `GENIUS_ACCESS_TOKEN` is set but Genius answers 403/503 from the dev machine: check the lyrics picker's Genius results from another network.

### Payouts

- [ ] Members ask; you send by hand and press "Mark sent" (Admin → Ads & earnings). Automated payouts only after the legal side is settled.

---

## 2. Checks that need a real device, an account or ears

- [ ] **Phones** (iPhone installed app + Safari tab, Android Chrome): lock the screen, switch app, go home, take a call — Studio, remix page, radio (a song change with the screen locked; unplug headphones). Remix tune-in time with nothing kept. Swipe-away is expected to stop (decision 1).
- [ ] New pieces on a real phone: Studio "With mix", remix "Before and after", DJ "Build a set", Key & tempo changer, the Feedback box (More → Send feedback — it never opened on phones before 2026-11-25), the DJ set planner `/dj/crate` (drag to reorder is desktop; phones use the arrows), the advertiser's 3-step form.
- [ ] Ears: the radio's first ad break now comes after ~3 min of listening (Admin → Settings → Audio ads → "Radio: the first break"), then every 20 min.
- [ ] **Ad spots with AdSense on** (after approval): a remix page, a tool page, the radio — the ad fills, nothing is cut off, an ad blocker shows Remixt's own ad instead, Studio/library/upload show no network ads. Also check a page reached by a link from the Studio loads fully (that's how the network can show).
- [ ] Signed in with real data in production: every page; a tagged MP3 upload shows its cover after splitting.
- [ ] Ears: each radio transition across a real song change (AutoMix's glide; iPhone's one-player handover), DJ loop points for clicks, the four clip visualizers in an exported video, a pre-roll and a radio break.
- [ ] A MIDI controller on the DJ decks.
- [ ] An Iranian listener on a VPN tries `/radio/remixt-radio`; if it fails, ask for the message under Tune in.
- [ ] Production speed: navigation timing after deploy; if the DB is Neon, use the pooled connection and turn off scale-to-zero for the main branch.

---

## 3. Code still to do

- [ ] **After the 2026-11-26 deploy, check on production:** Admin → Analytics → "Listening and songs" fills (listens, songs measured climbing as miners wait for work); the radio keeps playing while someone uploads from a phone; `BASE_URL=https://remixt.app node scripts/seo-audit.mjs` has no 30 s timeouts (the DB idle-timeout fix); Admin → Feedback & problems: no new `@context`, `radius`, `removeChild` or ORT `[object Event]` reports.
- [ ] Radio cueing, next steps (ideas from RadioT): skip a song's silent *start* too (needs the player to start a file at an offset; today only the silent end is cut), and a peak limiter on the radio's output now that songs get a loudness gain.
- [ ] Use the stored song analysis further: the energy curve (`tracks.analysis_json.curve`) for "where to mix in/out" marks on the DJ decks and in the set planner; charts by energy/tempo; "more like this" from key + tempo + energy.
- [ ] `/admin` is slow to show (problem reports): measure which of its queries is slow.
- [ ] Lighthouse SEO on pages added since the last audit (`/privacy`, `/terms`, `/plus`, the newer tools) and `node scripts/seo-audit.mjs` against production.
- [ ] Phone screenshots: Admin → Feedback & problems, Admin → Ads & earnings → Ad networks, `/privacy`, `/terms`.
- [ ] `/earnings` counts network money in the balance but not in "paid views" (network views are paid per month, not per view) — show network views there too.
- [ ] **Whole site in Persian + SEO.** Plan: a proxy rewriting `/fa/<path>` to the same page with a locale header (keeping the real `/fa/tools`, `/fa/earnings`, `/fa/advertise`); `<html lang dir>` from it; a `LocaleLink` that keeps `/fa`; typed `{ en, fa }` messages per component; hreflang on every page and in the sitemap. Studio and DJ last. Read `web/.next-docs` first (proxy/middleware rules changed in this Next). Guides in Persian with it. `/privacy` and `/terms` in Persian.
- [ ] Only if a phone check shows the Studio stopping with the screen locked: live-engine MediaStream fallback.
- [ ] Before each commit: `cd web && npx tsc --noEmit && npm run lint && npm test -- --brief` (stop any `next dev` in `web/` first).

---

## 4. Decisions still open (owner)

- **1. Keep playing after the app is swiped away.** No web app can; only a native wrapper (Capacitor + background audio) can, and it needs App Store / Play Store accounts. Recommended: decide after the phone checks.
- **5. Paying money out — legal**, see section 1.

---

## 5. Roadmap — a mature music platform (each needs its own session; ✦ = owner decision)

1. Releases & rights ✦: distribution to streaming services via a partner, ISRC per release, split sheets signed by collaborators, fingerprint matching of uploads (today exact-file only).
2. Creator profiles that sell: verified artists, links-in-bio, pinned release, follower notifications, pre-save pages, artist analytics.
3. Listening: one persistent player across pages, queues/playlists, likes → personal mixes, offline for the installed app, Chromecast/AirPlay.
4. Discovery: charts by genre/country/week, editorial playlists from Admin, "because you liked", typo-tolerant search (Postgres trigram).
5. Collaboration: version history/branches, comments at a time in the mix, stem requests, a collaborators marketplace, real-time jam (WebRTC).
6. Money ✦: tips, paid stem packs / beat leasing, higher-quality downloads for Plus, automated payouts after decision 5.
7. Trust & safety: moderation queues with reasons, repeat-infringer policy, age gates for explicit tags, an audit log of admin actions.
8. Platform: native wrappers (decision 1), public API/embeds, status page and server-side error tracking, load tests at 100× traffic (analytics daily roll-ups past ~10M rows).
9. Arabic / Turkish after Persian.

---

## Notes and tools

- Live site: look and listen only; never save or delete there. Logins given in chat are not stored here.
- Deploying: every push to `main` builds on GitHub and deploys (~2 min) and then checks 16 live pages.
- Port 3000 is often another project: `curl -s localhost:3000 | head -c 300`; else `npx next dev -p 3100` and `BASE_URL=http://localhost:3100`.
- Signed in locally without a password: mint `remix_session` with `jose` (`new SignJWT({ userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt()…sign(SESSION_SECRET)`); an admin needs `ADMIN_EMAILS` to name that user's email when the dev server starts. Delete test accounts afterwards (`email LIKE '%@example.test'`).
- Isolated pages (COOP/COEP, every-core splitter, no network ads): `/studio /upload /library /dj /live /examples /storage` — one list in `web/src/lib/isolation.ts`, used by `next.config.ts` and `IsolationBoundary`.
- Rigs in `web/scripts/`: `page-audit.mjs` (every page, phone + desktop; `COOKIE=` signed in), `radio-check.mjs`, `radio-phone-check.mjs` (`PHONE=ios|android`, `ENGINE=webkit`), `radio-cache-check.mjs`, `radio-words-check.mjs`, `singer-check.mjs` (`POINT=1`, `LYRICS=1`), `dj-check.mjs`, `phone-measure.mjs`, `phone-upload.mjs`, `preview-play.mjs`, `ai-drive.mjs` + `measure-wav.mjs`, `heavy-play.mjs`, `seo-audit.mjs`, `shot.mjs`.
- Cheap tests: `npm test -- --unit --brief` (no server); one file: `node --import ./tests/support/register.mjs --test tests/<name>.test.ts`.
- New network problems: add a case to `tests/upload-sim.test.ts` with `tests/support/line.ts`.
- 3 lint errors are old, in vendored files under `public/`.
