#!/bin/bash
# Starts everything Remixt needs, locally:
#   - Postgres (Docker container `remixt-test-pg`, port 5433)
#   - the Next.js app (port 3000)
# Ctrl+C stops the app; the database container keeps running.
# (Songs are split in the browser, so there's no separation service to run.)
set -e
cd "$(dirname "$0")"

# --- database ---------------------------------------------------------------
if ! docker info >/dev/null 2>&1; then
  echo "Docker isn't running — start Docker Desktop, then re-run this script."
  exit 1
fi

if [ -z "$(docker ps -q -f name=^remixt-test-pg$)" ]; then
  if [ -n "$(docker ps -aq -f name=^remixt-test-pg$)" ]; then
    echo "Starting existing Postgres container…"
    docker start remixt-test-pg >/dev/null
  else
    echo "Creating Postgres container…"
    docker run -d --name remixt-test-pg \
      -e POSTGRES_PASSWORD=devpassword -e POSTGRES_DB=remixt \
      -p 5433:5432 postgres:16-alpine >/dev/null
    sleep 5
    (cd web && node scripts/migrate.mjs)
  fi
fi

# --- app processes ----------------------------------------------------------
cleanup() {
  echo "Stopping…"
  kill "$WEB_PID" 2>/dev/null
}
trap cleanup EXIT INT TERM

(cd web && npm run dev) &
WEB_PID=$!

echo "Postgres:           127.0.0.1:5433 (docker: remixt-test-pg)"
echo "Web app:            http://localhost:3000  (pid $WEB_PID)"

wait
