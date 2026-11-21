#!/bin/bash
# Deploys Remixt to Cloudflare. Run from anywhere:  ./cloudflare/deploy.sh
# Needs: Docker running, `npx wrangler login` done once, and in web/.env.cloudflare:
#   DATABASE_URL, SESSION_SECRET, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
#   R2_SECRET_ACCESS_KEY, R2_BUCKET (+ any optional keys from src/index.ts)
#
# DATABASE_URL must be Neon's *direct* host (no "-pooler" in it). The
# container applies web/scripts/schema.sql on every start, and Neon's
# PgBouncer pooler drops the connection during CREATE INDEX, which makes
# the container exit ("Failed to start container"). The app itself works
# on either host.
set -euo pipefail
cd "$(dirname "$0")"
ENV_FILE=../web/.env.cloudflare
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE"; exit 1; }
docker info >/dev/null 2>&1 || { echo "Start Docker Desktop first"; exit 1; }

npm install --no-audit --no-fund

# Upload every key from the env file as a Worker secret (one batch).
node -e '
const fs=require("fs");const out={};
// PUBLIC_BASE_URL is a plain `vars` entry in wrangler.jsonc; uploading it as
// a secret makes wrangler fail with "Binding name already in use".
const skip=new Set(["PUBLIC_BASE_URL"]);
for (const l of fs.readFileSync(process.argv[1],"utf8").split("\n")) {
  const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(!m||!m[2]||skip.has(m[1])) continue;
  out[m[1]]=m[2].replace(/^"(.*)"$/,"$1").replace(/^'"'"'(.*)'"'"'$/,"$1");
}
fs.writeFileSync(".secrets.json",JSON.stringify(out));' "$ENV_FILE"
trap 'rm -f .secrets.json' EXIT

# First deploy creates the Worker; secrets need it to exist.
npx wrangler deploy
npx wrangler secret bulk .secrets.json

# Bucket CORS so browsers can upload/stream stems straight from R2.
BUCKET=$(node -e 'console.log(require("./.secrets.json").R2_BUCKET||"")')
[ -n "$BUCKET" ] && npx wrangler r2 bucket cors set "$BUCKET" --file r2-cors.json --force || true

echo "Done: https://remixt.app  (logs: cd cloudflare && npx wrangler tail)"
