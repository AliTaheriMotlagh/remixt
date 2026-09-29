import { spawn } from "child_process";
import { access, chmod, copyFile, mkdtemp, readFile, rm, stat, writeFile } from "fs/promises";
import { constants } from "fs";
import { lookup } from "dns/promises";
import { isIP } from "net";
import os from "os";
import path from "path";

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
  const host = url.hostname.replace(/^\[|\]$/g, "");
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
  return url.href;
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
      "--retries", "3",
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
