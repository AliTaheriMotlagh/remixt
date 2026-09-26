#!/bin/bash
# Runs Remixt locally (Postgres + separation service + Next.js) and puts a
# public HTTPS URL in front of the web app so a friend can use it from their
# own machine.
#
#   ./share.sh              # temporary public URL, no account or domain needed
#   ./share.sh cloudflared  # your Cloudflare tunnel (needs a domain routed to it)
#   ./share.sh ngrok        # ngrok (needs a free authtoken, once)
#
# Ctrl+C stops the tunnel and the app processes; the database container keeps
# running. Note: Cloudflare's *quick* tunnel (trycloudflare.com) is DNS-blocked
# on this network, which is why serveo is the default — see SHARING.md.
set -e
cd "$(dirname "$0")"

PROVIDER="${1:-serveo}"
CONNECTED=""

# Tunnel token and hostname live here, outside git. See SHARING.md.
if [ -f .share.env ]; then
  set -a
  . ./.share.env
  set +a
fi
LOGDIR="$(mktemp -d -t remixt-share)"
TUNNEL_LOG="$LOGDIR/tunnel.log"

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
  kill "$SEP_PID" "$WEB_PID" "$TUNNEL_PID" 2>/dev/null
}
trap cleanup EXIT INT TERM

if lsof -ti :3000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Something is already listening on :3000 — reusing it instead of"
  echo "starting a second dev server (which would land on :3001 and leave the"
  echo "tunnel pointing at the wrong one)."
  WEB_PID=""
else
  (cd web && TUNNEL_HOSTNAME="$TUNNEL_HOSTNAME" npm run dev) &
  WEB_PID=$!
fi

if lsof -ti :8000 -sTCP:LISTEN >/dev/null 2>&1; then
  SEP_PID=""
else
  ./separation-service/run.sh &
  SEP_PID=$!
fi

# Wait for Next.js to answer before opening the tunnel, so the first visitor
# doesn't hit a 502.
echo "Waiting for the web app on :3000…"
for _ in $(seq 1 90); do
  curl -sf -o /dev/null http://127.0.0.1:3000/ && break
  sleep 1
done

# --- public tunnel ----------------------------------------------------------
PUBLIC_URL=""

case "$PROVIDER" in
  serveo)
    # SUBDOMAIN=myremix ./share.sh  asks serveo for a stable name.
    REMOTE="80:127.0.0.1:3000"
    if [ -n "$SUBDOMAIN" ]; then
      REMOTE="$SUBDOMAIN:80:127.0.0.1:3000"
    fi
    # No -N: serveo sends the URL over the session channel, so asking for no
    # session means the URL never arrives. -T keeps it from grabbing the
    # terminal, and stdin comes from /dev/null so Ctrl+C still reaches us.
    ssh -T -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 \
        -o ExitOnForwardFailure=yes -R "$REMOTE" serveo.net \
        < /dev/null >"$TUNNEL_LOG" 2>&1 &
    TUNNEL_PID=$!
    for _ in $(seq 1 30); do
      PUBLIC_URL="$(grep -oE 'https://[a-z0-9.-]+\.(serveousercontent\.com|serveo\.net)' \
        "$TUNNEL_LOG" | head -1 || true)"
      if [ -n "$PUBLIC_URL" ]; then break; fi
      sleep 1
    done
    ;;

  cloudflared)
    CLOUDFLARED="$(command -v cloudflared || echo /opt/homebrew/bin/cloudflared)"
    if [ ! -x "$CLOUDFLARED" ]; then
      echo "cloudflared isn't installed — run: brew install cloudflared"; exit 1
    fi
    if [ -z "$CF_TUNNEL_TOKEN" ]; then
      echo "No CF_TUNNEL_TOKEN — put your tunnel token in .share.env, or use"
      echo "  ./share.sh serveo"
      exit 1
    fi
    # --protocol http2 is required here: outbound QUIC (UDP 7844) is blocked
    # on this network, and cloudflared retries QUIC forever instead of falling
    # back on its own, so the tunnel never registers without it.
    #
    # Remote-managed tunnel: which hostname maps to which local port is
    # configured in the Cloudflare dashboard, and cloudflared fetches it.
    "$CLOUDFLARED" tunnel --no-autoupdate --protocol http2 \
        run --token "$CF_TUNNEL_TOKEN" >"$TUNNEL_LOG" 2>&1 &
    TUNNEL_PID=$!
    echo "Connecting the tunnel…"
    for _ in $(seq 1 40); do
      if grep -q "Registered tunnel connection" "$TUNNEL_LOG"; then
        CONNECTED=1
        break
      fi
      sleep 1
    done
    if [ -z "$CONNECTED" ]; then
      echo "The tunnel never registered — see $TUNNEL_LOG"
    elif [ -n "$TUNNEL_HOSTNAME" ]; then
      PUBLIC_URL="https://$TUNNEL_HOSTNAME"
    else
      # cloudflared doesn't log the ingress rules for a remote-managed tunnel,
      # so there is nothing to discover them from — the hostname has to come
      # from .share.env.
      echo
      echo "  Tunnel is connected, but TUNNEL_HOSTNAME isn't set in .share.env,"
      echo "  so there's no link to print. Put the public hostname you routed"
      echo "  to this tunnel in the Cloudflare dashboard there."
    fi
    ;;

  ngrok)
    NGROK="$(command -v ngrok || echo /opt/homebrew/bin/ngrok)"
    if [ ! -x "$NGROK" ]; then
      echo "ngrok isn't installed — run: brew install ngrok"; exit 1
    fi
    "$NGROK" http 3000 --log stdout >"$TUNNEL_LOG" 2>&1 &
    TUNNEL_PID=$!
    for _ in $(seq 1 30); do
      PUBLIC_URL="$(curl -s http://127.0.0.1:4040/api/tunnels \
        | grep -oE 'https://[a-z0-9.-]+\.ngrok[a-z.-]*\.app' | head -1 || true)"
      if [ -n "$PUBLIC_URL" ]; then break; fi
      sleep 1
    done
    ;;

  *)
    echo "Unknown provider '$PROVIDER' — use: serveo | cloudflared | ngrok"
    exit 1
    ;;
esac

echo
echo "────────────────────────────────────────────────────────────"
if [ -n "$PUBLIC_URL" ]; then
  echo "  Send your friend this link:"
  echo "    $PUBLIC_URL"
else
  echo "  The $PROVIDER tunnel didn't report a URL — check your dashboard"
  echo "  routing, and:"
  echo "    $TUNNEL_LOG"
fi
echo "────────────────────────────────────────────────────────────"
echo "  Local:              http://localhost:3000"
echo "  Postgres:           127.0.0.1:5433 (docker: remixt-test-pg)"
echo "  Separation service: http://127.0.0.1:8000"
echo "  Tunnel log:         $TUNNEL_LOG"
echo
echo "  Anyone with the link can sign up, upload and remix. The link"
echo "  stops working the moment you Ctrl+C."
echo "────────────────────────────────────────────────────────────"
echo

wait "${WEB_PID:-$TUNNEL_PID}"
