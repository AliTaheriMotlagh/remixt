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

Read `graphify-out/GRAPH_REPORT.md` for the community map. Rebuild after big changes with `/graphify . --update`.

## Commands

- Dev: `./start-dev.sh` (Postgres in Docker on port 5433, app on port 3000), or `cd web && npm run dev`
- Typecheck: `cd web && npx tsc --noEmit`
- Lint: `cd web && npm run lint`
- Test: `cd web && npm test`
