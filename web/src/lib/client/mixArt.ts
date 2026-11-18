"use client";

// Pictures of a mix from the songs in it: each song's cover (or the one
// drawn from it, see lib/songArt.ts) — one song fills the square, two
// share it side by side, three are one big and two small, four a grid.
// What a remix without a cover of its own shows (exportMeta.ts puts the
// title on it), and the clip editor's "song artwork" background.

import { stemCoverUrl } from "@/lib/cover";
import { splitSongTitle } from "@/lib/lyrics";
import { songArtUrl } from "@/lib/songArt";
import { isTakeLane } from "./lyricsSources";
import { getAudibleLaneIds, type StudioLane } from "./studioStore";

export type ArtSong = { stemId: string | null; title: string; artist: string; peaks: number[] };

/** The songs heard in the mix, each once (its vocal's lane first), at most four. Takes recorded here aren't songs. */
export function mixArtSongs(lanes: StudioLane[]): ArtSong[] {
  const audible = getAudibleLaneIds(lanes);
  const seen = new Set<string>();
  const out: ArtSong[] = [];
  const ordered = [...lanes.filter((l) => l.kind === "vocals"), ...lanes.filter((l) => l.kind !== "vocals")];
  for (const lane of ordered) {
    if (!audible.has(lane.laneId) || isTakeLane(lane)) continue;
    const { song, artist } = splitSongTitle(lane.trackTitle);
    const key = `${artist}|${song || lane.trackTitle}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ stemId: lane.stemId, title: song || lane.trackTitle, artist, peaks: lane.peaks });
    if (out.length === 4) break;
  }
  return out;
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

const images = new Map<string, Promise<HTMLImageElement>>();

/** A song's picture, ready to draw: its cover, else the drawn one. Kept for the visit. */
export function songImage(song: ArtSong): Promise<HTMLImageElement> {
  const key = `${song.stemId ?? ""}|${song.title}|${song.artist}`;
  let found = images.get(key);
  if (!found) {
    const drawn = () => load(songArtUrl(song));
    found = song.stemId
      ? fetch(stemCoverUrl(song.stemId))
          .then((res) => (res.status === 200 ? res.blob() : Promise.reject(new Error("no cover"))))
          .then((blob) => load(URL.createObjectURL(blob)))
          .catch(drawn)
      : drawn();
    images.set(key, found);
  }
  return found;
}

/** Draws `pictures` as one square at (x, y), `size` across — see the layouts above. */
export function drawCollage(ctx: CanvasRenderingContext2D, pictures: CanvasImageSource[], x: number, y: number, size: number) {
  const cell = (img: CanvasImageSource, cx: number, cy: number, w: number, h: number) => {
    const iw = (img as HTMLImageElement).naturalWidth || (img as { width: number }).width || 1;
    const ih = (img as HTMLImageElement).naturalHeight || (img as { height: number }).height || 1;
    // Cover the cell, centred.
    const k = Math.max(w / iw, h / ih);
    const sw = w / k;
    const sh = h / k;
    ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, cx, cy, w, h);
  };
  const half = size / 2;
  const [a, b, c, d] = pictures;
  if (pictures.length <= 1) {
    if (a) cell(a, x, y, size, size);
  } else if (pictures.length === 2) {
    cell(a, x, y, half, size);
    cell(b, x + half, y, half, size);
  } else if (pictures.length === 3) {
    cell(a, x, y, half, size);
    cell(b, x + half, y, half, half);
    cell(c, x + half, y + half, half, half);
  } else {
    cell(a, x, y, half, half);
    cell(b, x + half, y, half, half);
    cell(c, x, y + half, half, half);
    cell(d, x + half, y + half, half, half);
  }
  // Thin dark lines between the pictures.
  if (pictures.length > 1) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    const line = Math.max(2, size / 200);
    ctx.fillRect(x + half - line / 2, y, line, size);
    if (pictures.length >= 3) ctx.fillRect(pictures.length === 3 ? x + half : x, y + half - line / 2, pictures.length === 3 ? half : size, line);
    ctx.restore();
  }
}

/** The songs' pictures, loaded (any that won't load are left out). */
export async function songImages(songs: ArtSong[]): Promise<HTMLImageElement[]> {
  const loaded = await Promise.allSettled(songs.map(songImage));
  return loaded.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
}

/** The mix's songs as one square picture (no words on it), for a clip's background or card; null with no songs. */
export async function mixArtPicture(lanes: StudioLane[], size = 1080): Promise<{ image: HTMLCanvasElement; width: number; height: number } | null> {
  const pictures = await songImages(mixArtSongs(lanes));
  if (!pictures.length) return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  drawCollage(ctx, pictures, 0, 0, size);
  return { image: canvas, width: size, height: size };
}

const lockScreen = new Map<string, Promise<string | null>>();

/**
 * A song's picture as a JPEG blob URL, for the lock screen (which can't
 * show the SVG a song without a cover is drawn as). Made once per song.
 */
export function songArtworkUrl(song: ArtSong): Promise<string | null> {
  const key = `${song.stemId ?? ""}|${song.title}|${song.artist}`;
  let made = lockScreen.get(key);
  if (!made) {
    made = songImage(song)
      .then(async (img) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 512;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        drawCollage(ctx, [img], 0, 0, 512);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
        canvas.width = canvas.height = 0;
        return blob ? URL.createObjectURL(blob) : null;
      })
      .catch(() => null);
    lockScreen.set(key, made);
  }
  return made;
}
