// Downloads yt-dlp into bin/ for this machine's OS and CPU. It's what
// /api/import uses to get a song from a link (YouTube, SoundCloud,
// Bandcamp, Vimeo, and a thousand-odd other sites). Runs before `dev` and
// `build` (see package.json); bin/ is gitignored. The standalone builds
// bundle their own Python, so nothing else needs installing — which is
// what lets it run inside a Vercel function.
//
// Sites change often and old yt-dlp versions stop working with them, so
// this always takes the latest release, and a local copy is refreshed once
// it's a week old. Set YTDLP_PATH to use an installed yt-dlp instead.
//
// Never fails the build: without yt-dlp, only link import is unavailable.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "bin", process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const assets = {
  "linux-x64": "yt-dlp_linux",
  "linux-arm64": "yt-dlp_linux_aarch64",
  "darwin-x64": "yt-dlp_macos",
  "darwin-arm64": "yt-dlp_macos",
  "win32-x64": "yt-dlp.exe",
};

async function main() {
  if (process.env.YTDLP_PATH) return;
  const asset = assets[`${process.platform}-${process.arch}`];
  if (!asset) {
    console.warn(`yt-dlp: no build for ${process.platform}-${process.arch}; link import is off`);
    return;
  }
  try {
    if (Date.now() - fs.statSync(target).mtimeMs < MAX_AGE_MS) return;
  } catch {
    // Not there yet.
  }

  const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(target), { recursive: true });
  // Write then rename, so an interrupted download never leaves half a binary.
  fs.writeFileSync(`${target}.part`, bytes, { mode: 0o755 });
  fs.renameSync(`${target}.part`, target);
  console.log(`downloaded yt-dlp (${asset}, ${Math.round(bytes.length / 1e6)} MB) to bin/`);
}

main().catch((err) => {
  console.warn(`yt-dlp: couldn't download it (${err.message}); link import is off`);
});
