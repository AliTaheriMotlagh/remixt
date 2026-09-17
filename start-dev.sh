#!/bin/bash
# Starts both the separation service (port 8000) and the Next.js app (port 3000).
# Ctrl+C stops both.
set -e
cd "$(dirname "$0")"

cleanup() {
  echo "Stopping…"
  kill "$SEP_PID" "$WEB_PID" 2>/dev/null
}
trap cleanup EXIT INT TERM

./separation-service/run.sh &
SEP_PID=$!

(cd web && npm run dev) &
WEB_PID=$!

echo "Separation service: http://127.0.0.1:8000  (pid $SEP_PID)"
echo "Web app:            http://localhost:3000  (pid $WEB_PID)"

wait
