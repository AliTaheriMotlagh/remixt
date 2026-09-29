# Remixt in one image: the Next.js app, Postgres and (optionally) Caddy for
# automatic HTTPS, all in a single container. Songs are split into vocals
# and beat in the user's browser, so there's no AI model on the server.
# Everything that must survive a redeploy — the database, the stems, the
# session secret, TLS certificates — lives under /data, so mount a volume
# there.
#
#   docker build -t remixt .
#   docker run -d --name remixt --restart unless-stopped \
#     -p 80:80 -p 443:443 -e DOMAIN=remix.example.com \
#     -v remixt-data:/data remixt
#
# See DEPLOY.md for the details (plain-HTTP mode, external Postgres,
# building for a different CPU architecture, backups).

# ---- 1. Build the Next.js app --------------------------------------------------
FROM node:22-bookworm-slim AS web-build
WORKDIR /build

COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY web/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build \
    && cp -r public .next/standalone/ \
    && cp -r .next/static .next/standalone/.next/

# ---- 2. Runtime ---------------------------------------------------------------
FROM node:22-bookworm-slim

# postgresql: the embedded database (skipped at runtime if DATABASE_URL is
#   set). tini: a proper PID 1, so `docker stop` shuts everything down
#   cleanly.
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql tini ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=caddy:2 /usr/bin/caddy /usr/bin/caddy
COPY --from=web-build /build/.next/standalone /app/web
COPY web/scripts/schema.sql /app/schema.sql
COPY docker/entrypoint.sh /usr/local/bin/remixt-start
RUN chmod +x /usr/local/bin/remixt-start

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    STORAGE_DIR=/data/storage \
    XDG_DATA_HOME=/data/caddy \
    XDG_CONFIG_HOME=/data/caddy

VOLUME /data
EXPOSE 80 443 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

ENTRYPOINT ["tini", "--", "remixt-start"]
