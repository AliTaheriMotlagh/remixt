import { spawn } from "child_process";
import { access, chmod, copyFile, mkdtemp, readFile, rm, stat, writeFile } from "fs/promises";
import { constants } from "fs";
import { lookup } from "dns/promises";
import { isIP } from "net";
import os from "os";
import path from "path";
import { isYouTubeLink, YOUTUBE_UNAVAILABLE } from "./linkHosts";

// Gets a song from a link — YouTube, SoundCloud, Bandcamp, Vimeo, a direct
// MP3 URL, anything yt-dlp knows — on the server, since a browser isn't
// allowed to fetch from those sites itself. The audio is downloaded as-is
// (no ffmpeg on the server), and the browser then splits it like any file
// from the device.

/** Same limit as a file upload. */
export const MAX_IMPORT_SECONDS = 15 * 60;
export const MAX_IMPORT_BYTES = 80 * 1024 * 1024;

/**
 * Audio only, in a container every browser's decodeAudioData reads —
 * Safari included: AAC in MP4 over plain HTTP (YouTube's usual pick), then
 * MP3 (SoundCloud's), then whatever audio there is, then a video with
 * sound as a last resort. Nothing that needs ffmpeg to merge.
 */
const FORMAT = "ba[ext=m4a][protocol^=http]/ba[ext=mp3]/ba[ext=m4a]/ba/b";

const EXTENSIONS = new Set(["m4a", "mp3", "webm", "ogg", "opus", "wav", "flac", "aac", "mp4"]);

export class ImportError extends Error {}

let binary: Promise<string | null> | null = null;

/**
 * The yt-dlp to run: YTDLP_PATH if set, else the copy scripts/fetch-ytdlp.mjs
 * put in bin/. Deployments don't always keep its executable bit, so if it
 * lost it, run a copy from the temp dir instead.
 */
function ytDlp(): Promise<string | null> {
  binary ??= (async () => {
    if (process.env.YTDLP_PATH) return process.env.YTDLP_PATH;
    const name = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
    const bundled = path.join(/* turbopackIgnore: true */ process.cwd(), "bin", name);
    try {
      await access(bundled, constants.X_OK);
      return bundled;
    } catch {
      // Missing, or not executable.
    }
    try {
      await access(bundled, constants.R_OK);
      const runnable = path.join(os.tmpdir(), name);
      await copyFile(bundled, runnable);
      await chmod(runnable, 0o755);
      return runnable;
    } catch {
      return null;
    }
  })();
  return binary;
}

/** Whether this server is set up to get past YouTube's block on cloud servers. */
export function youtubeImportEnabled(): boolean {
  return !!(process.env.YTDLP_PROXY || process.env.YTDLP_COOKIES);
}

/** True for addresses on this machine or a private network. */
function isPrivateAddress(address: string): boolean {
  if (address.startsWith("::ffff:")) return isPrivateAddress(address.slice(7));
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const lower = address.toLowerCase();
  return (
    lower === "::" ||
    lower === "::1" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe8") ||
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb")
  );
}

/**
 * Checks a pasted link is a web address on the public internet. The
 * server fetches it, so without this anyone could make it read its own
 * internal services (a database, a cloud metadata endpoint).
 */
export async function checkLink(raw: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ImportError("That doesn't look like a link — paste the whole address, starting with https://");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ImportError("Only http and https links work");
  }
  await checkHost(url.hostname);
  return url.href;
}

/** Refuses a host on this machine or a private network (see checkLink). */
export async function checkHost(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [host]
    : await lookup(host, { all: true }).then(
        (found) => found.map((a) => a.address),
        () => {
          throw new ImportError("Couldn't find that website — check the link");
        }
      );
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new ImportError("That link points somewhere this server can't fetch from");
  }
}

/** Turns yt-dlp's last error into something worth showing a person. */
function explain(stderr: string): string {
  const line =
    stderr
      .split("\n")
      .reverse()
      .find((l) => l.startsWith("ERROR:")) ?? "";
  if (/confirm you.re not a bot|Sign in to confirm/i.test(line)) {
    return "YouTube is refusing downloads from this server right now. Download the song another way and upload the file instead.";
  }
  if (/Unsupported URL/i.test(line)) return "There's no song we can get from that link";
  if (/Private video|is private/i.test(line)) return "That video or track is private";
  if (/age.restricted|confirm your age|Sign in|log in|login/i.test(line)) {
    return "That one needs a signed-in account, so it can't be imported";
  }
  if (/unavailable|not available|removed|404/i.test(line)) return "That video or track isn't available";
  if (/larger than max-filesize/i.test(line)) return "That file is too big to import";
  const detail = line.replace(/^ERROR:\s*(\[[^\]]*\]\s*)?([\w-]+:\s*)?/, "").trim();
  return detail ? `Couldn't get the song: ${detail.slice(0, 200)}` : "Couldn't get a song from that link";
}

// --- Streaming services ----------------------------------------------------------
//
// Spotify, Apple Music, Deezer, Tidal and the like don't let anything
// download their audio (it's DRM-protected). Their pages do say which song
// it is, though — so for those, the song's name and artist are read from
// the page and the same song is found where it can be downloaded
// (YouTube where this server can reach it, else SoundCloud).

const STREAMING_HOST =
  /(^|\.)(spotify\.com|music\.apple\.com|itunes\.apple\.com|deezer\.com|deezer\.page\.link|tidal\.com|music\.amazon\.[a-z.]+|amazon\.[a-z.]+\/music|music\.yandex\.[a-z]+|anghami\.com|shazam\.com)$/i;

export function isStreamingLink(link: string): boolean {
  try {
    return STREAMING_HOST.test(new URL(link).hostname);
  } catch {
    return false;
  }
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function meta(html: string, property: string): string | null {
  const tag = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]*>`, "i").exec(html)?.[0];
  const content = tag && /content=["']([^"']*)["']/i.exec(tag)?.[1];
  return content ? decodeEntities(content).trim() : null;
}

/**
 * "Artist Song" for a streaming service's track page, from what the page
 * tells link previews (Open Graph), or null when it isn't a song page.
 * Exported for the tests.
 */
export function songQueryFromPage(html: string, host: string): string | null {
  let title = meta(html, "og:title") ?? meta(html, "twitter:title");
  const description = meta(html, "og:description") ?? meta(html, "description") ?? "";
  if (!title) return null;
  let artist = meta(html, "music:musician_description") ?? "";
  title = title.replace(/^\u200e/, "");
  if (/spotify/i.test(host)) {
    // og:description: "Artist · Album · Song · 2020"
    artist ||= description.split(" · ")[0] ?? "";
    title = title.replace(/\s*[-|]\s*song.*$/i, "");
  } else if (/apple/i.test(host)) {
    // "Song - Song by Artist - Apple Music", or "Song by Artist on Apple Music"
    const m = /^(.*?)\s+[-–]\s+(?:Song|Single|EP|Album) by (.*?)(?:\s+[-–]\s+Apple Music)?$/i.exec(title) ?? /^(.*?)\s+by\s+(.*?)\s+on Apple Music$/i.exec(title);
    if (m) [title, artist] = [m[1], m[2]];
  } else {
    // Deezer, Tidal, Anghami…: "Song - Artist", "Song by Artist"
    const m = /^(.*?)\s+(?:[-–]|by)\s+(.*?)(?:\s+[-–|].*)?$/i.exec(title);
    if (m) [title, artist] = [m[1], m[2]];
  }
  const clean = (t: string) =>
    t
      .replace(/\b(on|\|)\s*(Spotify|Apple Music|Deezer|TIDAL|Amazon Music|Anghami|Shazam)\b.*$/i, "")
      .replace(/^Listen to\s+/i, "")
      .trim();
  const query = `${clean(artist)} ${clean(title)}`.replace(/\s+/g, " ").trim();
  return query.length >= 2 ? query.slice(0, 150) : null;
}

/**
 * "Channel Title" for a YouTube video, from YouTube's oEmbed (which
 * answers servers that YouTube otherwise blocks), cleaned of the usual
 * "(Official Video)" noise. Null when YouTube doesn't know it.
 */
async function youtubeQuery(link: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(link)}`, {
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string; author_name?: string };
    return youtubeSearchText(data.title ?? "", data.author_name ?? "");
  } catch {
    return null;
  }
}

/** Exported for the tests. */
export function youtubeSearchText(title: string, channel: string): string | null {
  const cleanTitle = title
    .replace(/[([](official|lyric|lyrics|audio|video|music video|hd|hq|4k|visualizer|live)[^)\]]*[)\]]/gi, "")
    .replace(/\b(official (music )?video|lyrics? video|official audio)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const artist = channel.replace(/\s*-\s*Topic$/i, "").replace(/VEVO$/i, "").trim();
  // A title that already names the artist ("Artist - Song") needs nothing more.
  const query = cleanTitle.toLowerCase().includes(artist.toLowerCase()) || !artist ? cleanTitle : `${artist} ${cleanTitle}`;
  return query.length >= 2 ? query.slice(0, 150) : null;
}

/** What to hand yt-dlp for a streaming service's page: a search for the same song. */
async function searchFor(link: string, signal?: AbortSignal): Promise<string> {
  let html = "";
  try {
    const res = await fetch(link, {
      redirect: "follow",
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
      headers: {
        // The plain HTML pages link previews get, with their Open Graph tags.
        "User-Agent": "Mozilla/5.0 (compatible; Remixt link preview)",
        "Accept-Language": "en",
      },
    });
    // Redirects (short links) may only land on public hosts.
    await checkHost(new URL(res.url || link).hostname);
    if (res.ok) html = (await res.text()).slice(0, 500_000);
  } catch (err) {
    if (err instanceof ImportError) throw err;
  }
  const query = songQueryFromPage(html, new URL(link).hostname);
  if (!query) {
    throw new ImportError(
      "Couldn't tell which song that link is. Streaming services (Spotify, Apple Music…) can't be downloaded from — paste the song's name with a link from SoundCloud or YouTube instead, or upload the file."
    );
  }
  return `${youtubeImportEnabled() ? "ytsearch1" : "scsearch1"}:${query}`;
}

/**
 * Everything from a pasted link to the song's audio: checks the link,
 * finds a streaming service's song where it can be downloaded, downloads
 * it, and tries once more if the site hiccuped. Throws an ImportError
 * with a readable message when it can't.
 */
export async function importSong(raw: string, signal?: AbortSignal): Promise<ImportedSong & { foundBySearch: boolean }> {
  const link = await checkLink(raw);
  let target = link;
  if (isStreamingLink(link)) {
    target = await searchFor(link, signal);
  } else if (isYouTubeLink(link) && !youtubeImportEnabled()) {
    // YouTube refuses this server; the same song on SoundCloud usually isn't far.
    const query = await youtubeQuery(link, signal);
    if (!query) throw new ImportError(YOUTUBE_UNAVAILABLE);
    target = `scsearch1:${query}`;
  }
  const foundBySearch = target !== link;
  for (let attempt = 1; ; attempt++) {
    try {
      return { ...(await downloadSong(target, signal)), foundBySearch };
    } catch (err) {
      const transient =
        err instanceof ImportError && /timed out|took too long|temporar|reset|HTTP Error 5\d\d|Unable to download|Connection/i.test(err.message);
      if (!transient || attempt >= 2 || signal?.aborted) throw err;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

export type ImportedSong = {
  bytes: Buffer;
  title: string;
  ext: string;
};

/**
 * Downloads the audio behind `link` (already passed through checkLink).
 * Throws an ImportError with a readable message when it can't.
 */
export async function downloadSong(link: string, signal?: AbortSignal): Promise<ImportedSong> {
  const exe = await ytDlp();
  if (!exe) throw new ImportError("Importing from links isn't set up on this server");

  const dir = await mkdtemp(path.join(os.tmpdir(), "remixt-import-"));
  try {
    const args = [
      "--no-playlist",
      "--playlist-items", "1",
      "--no-cache-dir",
      "--no-mtime",
      "--no-part",
      "--socket-timeout", "20",
      "--retries", "5",
      "--extractor-retries", "3",
      "--fragment-retries", "5",
      "--retry-sleep", "linear=1::2",
      "-f", FORMAT,
      "--max-filesize", String(MAX_IMPORT_BYTES),
      "--match-filter", `!is_live & duration <=? ${MAX_IMPORT_SECONDS}`,
      // Recent YouTube pages need JavaScript run to find the audio; Node is
      // already here.
      "--js-runtimes", `node:${process.execPath}`,
      "-o", path.join(dir, "audio.%(ext)s"),
      "--no-simulate",
      "--print", "after_move:%(.{title,ext,filepath,duration})j",
    ];
    // For hosts whose addresses a site blocks (YouTube and cloud servers,
    // often): route through a proxy, and/or send an account's cookies
    // (Netscape cookies.txt format).
    if (process.env.YTDLP_PROXY) args.push("--proxy", process.env.YTDLP_PROXY);
    if (process.env.YTDLP_COOKIES) {
      const cookies = path.join(dir, "cookies.txt");
      await writeFile(cookies, process.env.YTDLP_COOKIES);
      args.push("--cookies", cookies);
    }
    args.push("--", link);

    const { code, stdout, stderr } = await run(exe, args, dir, signal);
    const line = stdout.trim().split("\n").pop();
    if (code !== 0 || !line) {
      if (code === 0) {
        throw new ImportError(
          `That's either longer than ${MAX_IMPORT_SECONDS / 60} minutes, a live stream, or too big to import`
        );
      }
      throw new ImportError(explain(stderr));
    }

    let info: { title?: string; ext?: string; filepath?: string };
    try {
      info = JSON.parse(line);
    } catch {
      throw new ImportError("Couldn't get a song from that link");
    }
    const ext = (info.ext ?? "").toLowerCase();
    if (!info.filepath || !EXTENSIONS.has(ext)) {
      throw new ImportError("That link gave a file that isn't audio we can use");
    }
    // yt-dlp writes where it's told; only its file name is taken from it.
    const file = path.join(dir, path.basename(info.filepath));
    const size = (await stat(file)).size;
    if (size > MAX_IMPORT_BYTES) throw new ImportError("That file is too big to import");

    return {
      bytes: await readFile(file),
      title: (info.title ?? "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").trim().slice(0, 150) || "Untitled",
      ext,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function run(exe: string, args: string[], cwd: string, signal?: AbortSignal) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(exe, args, {
      cwd,
      signal,
      // A serverless home dir may not be writable; yt-dlp wants one.
      env: { ...process.env, HOME: os.tmpdir() },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr = (stderr + d).slice(-20_000)));
    child.on("error", (err) =>
      reject(
        err.name === "AbortError"
          ? new ImportError("That took too long — try again, or upload the file instead")
          : new ImportError("Importing from links isn't working on this server right now")
      )
    );
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}
