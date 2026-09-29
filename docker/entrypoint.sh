#!/bin/bash
# Starts everything inside the Remixt container: Postgres (unless an
# external DATABASE_URL is given), the Next.js server and — when DOMAIN is set — Caddy in front of it with automatic
# HTTPS. If any of them dies the container exits, so Docker's restart
# policy brings the whole thing back up in a known state.
set -euo pipefail

DATA=/data
mkdir -p "$DATA/storage" "$DATA/caddy"

log() { echo "[remixt] $*"; }

# --- Session secret -------------------------------------------------------------
# Generated once and kept in the volume, so sign-ins survive redeploys.
if [ -z "${SESSION_SECRET:-}" ]; then
  if [ ! -s "$DATA/session_secret" ]; then
    head -c 48 /dev/urandom | base64 | tr -d '\n' > "$DATA/session_secret"
    chmod 600 "$DATA/session_secret"
    log "generated a new session secret"
  fi
  SESSION_SECRET="$(cat "$DATA/session_secret")"
  export SESSION_SECRET
fi

# --- Database -------------------------------------------------------------------
EMBEDDED_PG=0
PG_BIN="$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)"
PGDATA="$DATA/postgres"

if [ -z "${DATABASE_URL:-}" ]; then
  EMBEDDED_PG=1
  if [ ! -s "$PGDATA/PG_VERSION" ]; then
    log "initialising Postgres in $PGDATA"
    mkdir -p "$PGDATA"
    chown postgres:postgres "$PGDATA"
    # Trust auth is safe here: the server only listens on 127.0.0.1 inside
    # this container, so nothing outside it can reach the port.
    su postgres -c "$PG_BIN/initdb -D $PGDATA -U postgres --auth=trust --encoding=UTF8" >/dev/null
  fi
  chown -R postgres:postgres "$PGDATA"
  # pg_ctl writes its log as the postgres user, and /data belongs to root.
  touch "$DATA/postgres.log"
  chown postgres:postgres "$DATA/postgres.log"
  su postgres -c "$PG_BIN/pg_ctl -D $PGDATA -w -l $DATA/postgres.log \
    -o '-c listen_addresses=127.0.0.1 -c unix_socket_directories=/tmp' start" >/dev/null
  if ! psql -h 127.0.0.1 -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'remixt'" | grep -q 1; then
    psql -h 127.0.0.1 -U postgres -qc "CREATE DATABASE remixt"
  fi
  export DATABASE_URL="postgres://postgres@127.0.0.1:5432/remixt"
  log "Postgres is up"
fi

# schema.sql is idempotent (CREATE/ALTER ... IF NOT EXISTS), so applying it
# on every start is also how upgrades get their migrations.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f /app/schema.sql
log "schema applied"

# --- App processes ----------------------------------------------------------------
PIDS=()

shutdown() {
  log "shutting down"
  for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null || true; done
  wait || true
  if [ "$EMBEDDED_PG" = 1 ]; then
    su postgres -c "$PG_BIN/pg_ctl -D $PGDATA -m fast stop" >/dev/null || true
  fi
}
trap 'shutdown; exit 0' TERM INT

if [ -n "${DOMAIN:-}" ]; then
  # Caddy owns 80/443 and fetches the certificate; Next stays private.
  WEB_HOST=127.0.0.1
  caddy reverse-proxy --from "$DOMAIN" --to 127.0.0.1:3000 &
  PIDS+=($!)
  log "serving https://$DOMAIN"
else
  WEB_HOST=0.0.0.0
  log "serving http on port 3000 (no DOMAIN set — put HTTPS in front, see DEPLOY.md)"
fi

(cd /app/web && HOSTNAME="$WEB_HOST" PORT=3000 exec node server.js) &
PIDS+=($!)

# Exit as soon as any one process dies; the restart policy takes it from there.
set +e
wait -n
log "a process exited unexpectedly"
shutdown
exit 1
