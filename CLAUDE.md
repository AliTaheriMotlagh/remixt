# Remixt — repo map

Remixt is a browser DAW: upload a song, it's split into vocal and beat stems in the browser, and the Studio remixes them. See README.md for the product.

## Layout

- `web/` — the Next.js (TypeScript) app. Almost all work happens here. Its own rules are in `web/CLAUDE.md` and `web/AGENTS.md`; read them before touching Next.js code, since this version has breaking changes.
  - `src/app/` — routes (studio, library, remixes, upload, admin, live, dj, …)
  - `src/components/studio/` — the DAW UI
  - `tests/` — tests run by `npm test`
- `separation-service/` — old Python splitter. Not used; ignore it.
- `storage/` — local stems and uploads (gitignored). Don't read it.
- `graphify-out/` — knowledge graph of the repo. `GRAPH_REPORT.md` is tracked; the rest is local.
- `docker/`, `Dockerfile`, `DEPLOY.md`, `share.sh` — deployment and sharing.

## Finding code

Query the graph before grepping or opening many files:

```
graphify query "how does X work?"
```

From inside `web/` (or any subfolder), pass the graph explicitly: `graphify query "..." --graph ../graphify-out/graph.json`. A query without `--graph` fails outside the repo root.

Read `graphify-out/GRAPH_REPORT.md` for the community map. Rebuild after big changes with `/graphify . --update`.

Use the graph before grep for "where is X" or "how does X work" questions. Fall back to grep only for exact strings, or when the graph has no answer.

A git hook (`graphify hook install`) refreshes the graph's code nodes after every commit, so it stays current without a manual rebuild.

## Commands

- Dev: `./start-dev.sh` (Postgres in Docker on port 5433, app on port 3000), or `cd web && npm run dev`
- Typecheck: `cd web && npx tsc --noEmit`
- Lint: `cd web && npm run lint`
- Test: `cd web && npm test` (starts its own dev server: stop any `next dev` running in `web/` first, they share `.next`)
- One test file, no server needed for pure logic: `cd web && node --import ./tests/support/register.mjs --test tests/<name>.test.ts`
- Screenshot the running app instead of reading UI code: `cd web && npm run shot -- /studio /tmp/s.png phone` (or `desktop`; steps like clicks are in `scripts/shot.mjs`). It uses the installed Chrome.
- Load-test Studio playback against the running app: `cd web && FIT=1 node scripts/heavy-play.mjs` (18 lanes stretched to one tempo; prints time to first sound, silent moments and memory — options at the top of the file).
- Port 3000 is sometimes taken by another project on this machine. Check with `curl -s localhost:3000 | head -c 300`; if it isn't Remixt, run `npx next dev -p 3100` and pass `BASE_URL=http://localhost:3100` to `npm run shot`.
