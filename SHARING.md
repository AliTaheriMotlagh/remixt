# Sharing Remixt with someone else

Remixt normally runs only on your machine. `./share.sh` keeps it that way —
the app, the database, the audio files and the separation all stay local —
and only puts a public HTTPS address in front of the web app on `:3000`, so
a friend's browser can reach it while the script is running.

```bash
./share.sh          # Cloudflare tunnel (default)
./share.sh serveo   # no account, no domain, works today
```

It prints a link. Send that link. Ctrl+C kills it.

## Why not Cloudflare's quick tunnel

`cloudflared tunnel --url …` (the no-account "quick tunnel") does not work on
this network. `trycloudflare.com` is DNS-poisoned here — every lookup, even
through 1.1.1.1 or 8.8.8.8, answers `10.10.34.36`, and DNS-over-HTTPS to
those resolvers is blocked too, so `cloudflared` can never register a tunnel:

```
failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel":
context deadline exceeded
```

Only that one domain is blocked. `dash.cloudflare.com`, `api.cloudflare.com`
and the tunnel edge (`region1.v2.argotunnel.com`) all resolve and connect
fine — which is why a *named* Cloudflare tunnel still works, if you own a
domain. See below.

## The three providers

### `./share.sh` — serveo (default)

No account, no install, no domain; it's just SSH, and port 22 to `serveo.net`
is open from here. The URL is random each run, unless you ask for a name:

```bash
SUBDOMAIN=alitaheri-remixt ./share.sh
```

Three things to know:

- **The link is on `serveousercontent.com`**, not `serveo.net`.
- **You can't open your own link from this network.** `serveousercontent.com`
  is DNS-blocked here the same way `trycloudflare.com` is, so the link will
  look dead to you while working fine for your friend. Test locally on
  http://localhost:3000 and let them confirm the public one.
- **Free serveo shows visitors a browser warning page** before the app; they
  click through once.

`ssh -N` does *not* work here — serveo sends the URL over the session
channel, so `-N` (no session) means the forward succeeds but no URL ever
arrives. `share.sh` uses `-T` with stdin from `/dev/null` instead.

### `./share.sh cloudflared` — your Cloudflare tunnel

Needs a domain on your Cloudflare account, so it is not the temporary-URL
option. Uses the token for tunnel `177b7c40-2166-4b1d-85ae-bd71b7821497`, kept in
`.share.env` (gitignored, mode 600). Two things about this network:

- **QUIC is blocked.** Outbound UDP 7844 doesn't get through, and cloudflared
  retries QUIC forever rather than falling back by itself, so it never
  registers. `share.sh` passes `--protocol http2`, which connects fine
  (verified: 4 connections to `fra`, `/ready` 200).
- **cloudflared is also installed as a system service** and is running with
  the same token from `/Library/Application Support/com.cloudflare.cloudflared/token`.
  It has the QUIC problem and its `/ready` on `127.0.0.1:20241` returns 503,
  so it has never carried traffic. Either fix it to use HTTP/2:

  ```bash
  sudo launchctl unload /Library/LaunchDaemons/com.cloudflare.cloudflared.plist
  # add <string>--protocol</string><string>http2</string> to ProgramArguments
  sudo launchctl load /Library/LaunchDaemons/com.cloudflare.cloudflared.plist
  ```

  or remove it, and let `share.sh` run the tunnel: `sudo cloudflared service uninstall`.

Set `TUNNEL_HOSTNAME` in `.share.env` to the hostname you routed to the
tunnel. That's also what tells the Next dev server to accept requests from
it (`allowedDevOrigins` in `web/next.config.ts`).

**The tunnel needs a public hostname routed to `http://localhost:3000`** in
the dashboard — Zero Trust → Networks → Tunnels → your tunnel → Published
application routes. Without that route the tunnel connects but serves
nothing, which is the state it was in as of this writing.

### `./share.sh ngrok` — ngrok

`brew install ngrok`, then a free account for the one-time
`ngrok config add-authtoken …`. Free URLs are random and show visitors a
click-through warning page first.

## Things worth knowing before you send the link

- **Anyone with the link can sign up.** There's no invite system — the app's
  own email/password signup is the only gate, and the link is unguessable but
  public. Don't post it anywhere.
- **Uploads are capped at 60MB** and separation runs on *your* CPU, so two
  people uploading at once means both wait longer.
- **Their uploads land in your `storage/`** and their account in your local
  Postgres. Sharing the link is sharing your library.
- **The session cookie isn't marked `secure` in dev mode**, which is what lets
  it work over the tunnel unchanged. It's still HTTP-only and signed.
- `web/next.config.ts` lists these tunnel hosts in `allowedDevOrigins`; the
  Next dev server blocks tunnelled requests without that.
