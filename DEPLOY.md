# Deploying Remixt

Songs are split into vocals and beat **in the listener's browser**, so the
server only handles accounts, the library and remixes. Three setups:

- **[Free on Vercel](#free-on-vercel-with-neon-and-vercel-blob)**
  (recommended): the app, the database (Neon) and the stems (Vercel Blob)
  are all created and managed from one Vercel dashboard. No card, no
  server to look after.
- **[Free, one server](#free-all-in-one-place-oracle-cloud)**: one Docker
  container on Oracle Cloud's Always Free server. Needs a card Oracle
  accepts.
- **[Any other server](#your-own-server-docker)**: the same Docker image
  on any VPS.

## How the splitting works (and what it costs visitors)

The first time someone signs in, their browser downloads the song splitter
once: the Demucs model (~172 MB, from Hugging Face) and its runtime (~28
MB, from this app). A progress pill in the corner shows it. It's then kept
in the browser's cache, so later visits get it from disk in a few seconds.

When they upload a song, it's split on their device:

- about 1–2 minutes on a GPU (WebGPU: current Chrome and Edge, Safari 26+),
- several minutes on the CPU otherwise.

The original file never leaves their device; only the two MP3 stems are
uploaded.

On phones and tablets (iPhone, iPad, Android) the splitter isn't
preloaded. It loads when a song is picked and is unloaded again
afterwards, because iOS reloads a tab that holds too much memory. Songs
there can be up to 10 minutes (15 on a computer), and the screen is kept
awake while a song is split.

### Songs from a link

The Upload page also takes a link (YouTube, SoundCloud, Bandcamp, Vimeo, a
direct MP3 URL, and
[many more sites](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md)).
The server fetches the audio with [yt-dlp](https://github.com/yt-dlp/yt-dlp)
and keeps it in storage under `imports/` for a moment. The browser
downloads it, splits it like any other file, and deletes it. Leftovers
older than an hour are swept away. (On R2, add a lifecycle rule that
expires `imports/` after a day.)

`npm run build` downloads the latest yt-dlp for the build machine into
`web/bin/`, and it ships with the `/api/import` function. There's nothing
to install, on Vercel or in Docker.

**YouTube often blocks downloads from cloud servers** (Vercel, Oracle and
other data centres) with *"Sign in to confirm you're not a bot"*. So
YouTube links are turned off by default: the Upload page says so as soon
as one is pasted and suggests uploading the file instead. Other sites
usually work. Setting either of these environment variables turns YouTube
links back on:

| Variable | Meaning |
| --- | --- |
| `YTDLP_PROXY` | e.g. `http://user:pass@host:port`: fetch through a residential proxy. |
| `YTDLP_COOKIES` | The contents of a `cookies.txt` (Netscape format) exported from a browser signed in to YouTube. Use a throwaway account. |
| `YTDLP_PATH` | Use an installed yt-dlp instead of the downloaded one. |

Only let people import what they have the right to use; see
[Before you open it to the public](#before-you-open-it-to-the-public).

---

## Free on Vercel, with Neon and Vercel Blob

Everything is set up from the Vercel dashboard: Vercel runs the app, and
from its **Storage** tab you add a Neon Postgres database and a Blob store
for the stems. Vercel fills in their connection settings for you. You need
a GitHub account and about 20 minutes, **no credit card**.

Free-tier limits at the time of writing (check the providers' pricing
pages):

| Part | Free allowance |
| --- | --- |
| Vercel Hobby (the app) | 100 GB bandwidth/month, **non-commercial use only** |
| Neon Free (database) | 0.5 GB, plenty for accounts, tracks and remixes |
| Vercel Blob (stems) | 1 GB stored, 10 GB downloaded/month |

When a free limit runs out, the feature pauses until the month resets.
Nothing is billed. With 128 kbps stems (step 3) a 4-minute song takes ~7.7
MB, so 1 GB holds roughly **130 songs**.

### 1. Put the code on GitHub

Create a repository on GitHub (private is fine) and push the project:

```bash
cd ~/Desktop/code
git remote add origin https://github.com/<you>/remixt.git
git push -u origin main
```

### 2. Create the Vercel project

1. Sign up at [vercel.com](https://vercel.com) with **Continue with
   GitHub**, and choose the **Hobby** plan.
2. **Add New… → Project**, then **Import** your `remixt` repository. (If it
   isn't listed, click *Adjust GitHub App Permissions* and give Vercel
   access to it.)
3. **Root Directory → Edit → `web`**. The framework shows as Next.js.
4. Open **Environment Variables** and add:

   | Name | Value |
   | --- | --- |
   | `SESSION_SECRET` | a long random string (run `openssl rand -base64 48` in Terminal) |
   | `FREE_AI_KEY` | optional — a free Google Gemini key (from aistudio.google.com/apikey) so every user gets a free AI producer with no key of their own. Set `FREE_AI_PROVIDER=groq` to use a free Groq key instead, and `FREE_AI_DAILY_LIMIT` to change the per-user daily allowance (default 60) |
   | `AI_KEY_SECRET` | optional — encrypts users' ChatGPT/Claude keys; if unset, derived from `SESSION_SECRET`. Don't change it later, or saved keys stop working |
   | `NEXT_PUBLIC_STEM_BITRATE` | `128` (stretches the 1 GB free storage; `192` is the default) |
   | `ADMIN_EMAILS` | your email (comma-separate several). These accounts get the **Admin** page for managing users, songs and remixes |

5. Click **Deploy**. It builds and goes live at
   `https://<project>.vercel.app`, but it can't sign anyone in yet, because
   there's no database. That's the next step.

### 3. Add the database (Neon)

1. In the project, open the **Storage** tab → **Create Database** →
   **Neon** (Serverless Postgres) → accept, choose the **Free** plan and a
   region near you (the same one you'll use for functions in step 5).
2. **Connect** it to the project, with all environments ticked. Vercel adds
   `DATABASE_URL` (pooled; the app uses this one) and
   `DATABASE_URL_UNPOOLED` to the project's environment variables.
3. Create the tables. Open the new database from the Storage tab, click
   **Open in Neon Console**, go to the **SQL Editor**, paste the whole of
   [`web/scripts/schema.sql`](web/scripts/schema.sql), and click **Run**.

   (Or from Terminal: copy `DATABASE_URL_UNPOOLED` from Vercel's
   environment variables and run
   `cd web && DATABASE_URL='<that value>' node scripts/migrate.mjs`.)

### 4. Add stem storage (Vercel Blob)

1. **Storage** tab → **Create Database** → **Blob**. Name it `stems`.
   Either access mode works. **Public** is a little more efficient, because
   players stream straight from Blob's CDN. With **Private**, the app
   streams stems itself, 4 MB at a time, and nobody can fetch them without
   going through the app.
2. **Connect** it to the project, with Production, Preview and Development
   ticked. Vercel adds `BLOB_READ_WRITE_TOKEN`; the app sees it, works out
   whether the store is public or private, and stores stems there.

### 5. Redeploy and finish

1. **Deployments** tab → the latest deployment's **⋯** menu → **Redeploy**.
   Environment variables only apply to new deployments.
2. **Settings → Functions → Function Region**: pick the region your Neon
   database is in. Every page queries the database, so this makes the site
   noticeably faster.

### 6. Try it

Open `https://<project>.vercel.app`, sign up, and go to **Upload**:

- The corner shows the song splitter downloading, once (~209 MB).
- Pick a song; the box shows reading → separating → encoding → uploading.
- The track appears as **Ready**, and its stems are usable in the Studio.

From now on, every `git push` to `main` redeploys the site by itself.

### Optional

- **Your own domain**: Settings → Domains.
- **Serve the model yourself** if Hugging Face is slow or blocked for your
  users: put `htdemucs_embedded.onnx` (from
  [huggingface.co/timcsy/demucs-web-onnx](https://huggingface.co/timcsy/demucs-web-onnx))
  somewhere public and set `NEXT_PUBLIC_DEMUCS_MODEL_URL` to it. (It's 172
  MB, so it doesn't fit Blob's free tier comfortably.)
- **Serve ONNX Runtime from a CDN**: set `NEXT_PUBLIC_ORT_BASE_URL` to
  `https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/`. That moves the
  28 MB runtime off Vercel's bandwidth.
- **Cloudflare R2 instead of Blob** (10 GB free, but Cloudflare needs a
  payment card on file): create a bucket with public access and this CORS
  policy, and an API token with Object Read & Write:

  ```json
  [{ "AllowedOrigins": ["https://<project>.vercel.app"],
     "AllowedMethods": ["GET", "HEAD", "PUT"],
     "AllowedHeaders": ["Content-Type", "Range"],
     "ExposeHeaders": ["Content-Length", "Content-Range", "Accept-Ranges", "ETag"],
     "MaxAgeSeconds": 3600 }]
  ```

  Then set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
  `R2_BUCKET` and `R2_PUBLIC_URL`. When `R2_BUCKET` is set, it takes
  priority over Blob.
- `NEXT_PUBLIC_…` variables are baked in when the site is built, so
  redeploy after changing them.

### Running locally against the same database and storage

In the project folder: `npx vercel link`, then `npx vercel env pull
web/.env.local`, then `npm run dev` in `web/`. With no Blob or R2 variables,
the app stores stems on local disk under `storage/` instead.

---

## Free, all in one place: Oracle Cloud

Oracle's Always Free tier includes an ARM server with up to 4 CPU cores,
24 GB of RAM and 200 GB of disk, free with no time limit. That's far more
than Remixt needs. Everything runs in one container on it: the app,
Postgres, the stems on disk, and Caddy for HTTPS.

What you need: a card for Oracle's identity check (it isn't charged), and
about 45 minutes.

### 1. Create the account

Sign up at [oracle.com/cloud/free](https://www.oracle.com/cloud/free/).
**Pick your home region carefully**: Always Free servers can only be
created there, and you can't change it later. Choose one near your users.

### 2. Create the server

1. **Compute → Instances → Create instance.**
2. **Image**: Canonical Ubuntu 24.04.
3. **Shape → Change shape → Ampere → VM.Standard.A1.Flex**: 2 OCPUs and
   12 GB of memory is plenty (anything up to 4 / 24 stays free).
4. **SSH keys**: *Generate a key pair for me*, and **download the private
   key**. You can't get it again.
5. **Create.** If it says *Out of capacity*, try another availability
   domain in the same form, or try again later. Free ARM capacity is often
   busy.
6. Copy the instance's **Public IP address**.

### 3. Open ports 80 and 443

Two firewalls need opening, Oracle's and Ubuntu's:

1. On the instance page: **Subnet → Security → Default Security List → Add
   Ingress Rules**. Source CIDR `0.0.0.0/0`, TCP, destination port `80`.
   Add a second rule the same way for `443`.
2. SSH in (on Mac/Linux; the key file is the one you downloaded):

   ```bash
   chmod 600 ~/Downloads/ssh-key-*.key
   ssh -i ~/Downloads/ssh-key-*.key ubuntu@<PUBLIC_IP>
   ```

   Then open the ports in Ubuntu's own firewall, which Oracle's images ship
   with everything but SSH blocked:

   ```bash
   sudo iptables -I INPUT 6 -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 6 -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```

### 4. Get a free domain name

HTTPS needs a name, not just an IP. Go to [duckdns.org](https://www.duckdns.org),
sign in, create a subdomain (e.g. `myremixt`), and set its IP to the server's
public IP. You get `myremixt.duckdns.org`. (If you own a domain, point an `A`
record at the IP instead.)

### 5. Install Docker and start Remixt

Still on the server:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu && exit
```

SSH back in (so the group change applies), fetch the code, build, and run:

```bash
git clone https://github.com/<you>/remixt.git && cd remixt
docker build -t remixt .
docker run -d --name remixt --restart unless-stopped \
  -p 80:80 -p 443:443 \
  -e DOMAIN=myremixt.duckdns.org \
  -v remixt-data:/data \
  remixt
```

(For a private GitHub repo, `git clone` asks for a username and a
[personal access token](https://github.com/settings/tokens) as the
password. Or skip GitHub: your Mac is ARM too, so an image built there runs
as-is. Use `docker build -t remixt .` locally, then
`docker save remixt | gzip | ssh -i <key> ubuntu@<IP> 'gunzip | docker load'`.)

Open `https://myremixt.duckdns.org`. The first start takes a few seconds
to set up the database and get the certificate; `docker logs -f remixt`
shows it.

### 6. Keep it running

- **Oracle reclaims idle free servers** (CPU mostly idle for a week). To
  stop that, upgrade the account to **Pay As You Go** (Billing → Upgrade).
  It stays $0 as long as you stay within the Always Free limits. Otherwise,
  just keep an eye on the email Oracle sends first.
- **Updates**: `git pull && docker build -t remixt . && docker rm -f remixt`,
  then the same `docker run` as above. Data lives in the `remixt-data`
  volume and survives.
- **Backups**: see [Updating and backups](#updating-and-backups). Copy them
  off the server. Oracle's free tier also includes 20 GB of Object Storage
  you can use for this.

---

## Your own server (Docker)

`Dockerfile` at the repo root builds one image with the app, Postgres and
Caddy for automatic HTTPS. Everything that must survive an update (the
database, the stems, the session secret, TLS certificates) lives in one
volume at `/data`.

Any small Linux server works now that nothing heavy runs on it: 1 CPU and
1 GB of RAM is plenty. Oracle Cloud's Always Free ARM server is more than
enough, and so is the cheapest VPS anywhere.

```bash
docker build -t remixt .

docker run -d --name remixt --restart unless-stopped \
  -p 80:80 -p 443:443 \
  -e DOMAIN=remix.example.com \
  -v remixt-data:/data \
  remixt
```

Point the domain's `A` record at the server first (in Cloudflare: **DNS
only**, grey cloud, for the first start so Caddy can get its certificate).
No domain? A free [DuckDNS](https://www.duckdns.org) name works:
`-e DOMAIN=yourname.duckdns.org`.

You can also use R2 for the stems here: pass the same `R2_*` variables with
`-e`. Otherwise stems are stored in the volume.

### Through a Cloudflare Tunnel instead (no open ports)

1. Get your domain onto Cloudflare.
2. **Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared**.
   Copy the token.
3. Run the app on localhost only, with no `DOMAIN`:

   ```bash
   docker run -d --name remixt --restart unless-stopped \
     -p 127.0.0.1:3000:3000 -v remixt-data:/data remixt
   docker run -d --name cloudflared --restart unless-stopped --network host \
     cloudflare/cloudflared:latest tunnel --no-autoupdate run --token <TOKEN>
   ```

   If outbound UDP is blocked, add `--protocol http2` after `run`.
4. In the tunnel, add a **public hostname**: `remix.example.com` → `HTTP` →
   `localhost:3000`.

### Building on a Mac for a different server

Apple Silicon builds `arm64`. For an `amd64` server:

```bash
docker buildx build --platform linux/amd64 -t remixt --load .
docker save remixt | gzip | ssh root@your-server 'gunzip | docker load'
```

### Options

| Variable | Default | Meaning |
| --- | --- | --- |
| `DOMAIN` | *(unset)* | Serve HTTPS on 80/443 for this hostname via Caddy. Unset: plain HTTP on 3000. |
| `DATABASE_URL` | *(embedded)* | Use an external Postgres instead of the built-in one. |
| `SESSION_SECRET` | *(generated)* | Generated once into `/data/session_secret` if unset. |
| `R2_*` | *(unset)* | Store stems in R2 instead of the volume (see the free setup). |
| `COOKIE_SECURE` | `true` | `false` only to try it over plain HTTP. Sign-in fails otherwise. |
| `ADMIN_EMAILS` | *(unset)* | Comma-separated emails of accounts that get the Admin page (`/admin`). |
| `PUBLIC_BASE_URL` | *(unset)* | The site's address, e.g. `https://remix.example.com`, so shared links show their preview image. Not needed on Vercel. |

### Updating and backups

```bash
git pull && docker build -t remixt . && docker rm -f remixt
docker run -d --name remixt ...        # same command as before
```

The schema is applied on every start and is idempotent.

```bash
docker exec remixt pg_dump -h 127.0.0.1 -U postgres remixt | gzip > remixt-db-$(date +%F).sql.gz
docker run --rm -v remixt-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/remixt-storage-$(date +%F).tgz -C /data storage
```

---

## Before you open it to the public

- **Copyright.** People will upload commercial songs and publish remixes.
  Have terms of use and a takedown contact before launch. For a beta,
  consider invite-only sign-up or private remixes by default.
- **Anyone can sign up** and use your storage. There's no per-user quota
  yet.
- **Vercel's free plan is non-commercial.** Move to Pro, or to the Docker
  setup, before charging money.
