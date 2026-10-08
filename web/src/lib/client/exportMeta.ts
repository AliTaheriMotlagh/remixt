"use client";

// Everything an exported file is tagged with (see audioTags.ts): the
// remix's title and artist, where its vocal and beat came from, BPM and
// key, a link back, and cover art — the remix's own cover, or one drawn
// here in the Remixt look so a file in someone's library still says where
// it came from.

import { MARK_GRADIENT, markDataUri } from "@/lib/brand";
import { hasRtl } from "@/lib/rtlText";
import { shortPath } from "@/lib/shareLinks";
import { SITE_NAME } from "@/lib/site";
import { kindLabel } from "@/lib/stemKinds";
import { creditLine, id3Key, type AudioTags, type TrackCredit } from "./audioTags";
import { effectiveKey, referenceLane, type StudioLane } from "./studioStore";

/** What the person exporting knows about the remix. */
export type ExportInfo = {
  title: string;
  artist: string;
  /** Saved remix, for the link back. */
  remixId?: string | null;
  /** The remix's cover (a path on this site), if it has one. */
  cover?: string | null;
  /** The remix's tags; the first becomes the genre. */
  tags?: string[];
};

export type Cover = { mime: "image/jpeg" | "image/png"; data: Uint8Array };

/** Who each lane's audio came from — one line per song and role. */
export function laneCredits(lanes: StudioLane[]): TrackCredit[] {
  const seen = new Set<string>();
  const credits: TrackCredit[] = [];
  // Vocals first: that's how people describe a mashup.
  const ordered = [...lanes].sort((a, b) => Number(b.kind === "vocals") - Number(a.kind === "vocals"));
  for (const lane of ordered) {
    const role = kindLabel(lane.kind);
    const key = `${role}|${lane.trackTitle}|${lane.artistName}`;
    if (seen.has(key) || !lane.trackTitle) continue;
    seen.add(key);
    credits.push({ role, track: lane.trackTitle, artist: lane.artistName });
  }
  return credits;
}

function imageType(bytes: Uint8Array): Cover["mime"] | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  return null;
}

async function fetchCover(src: string): Promise<Cover | null> {
  try {
    const res = await fetch(src, { credentials: "same-origin" });
    if (!res.ok) return null;
    const data = new Uint8Array(await res.arrayBuffer());
    const mime = imageType(data);
    // Covers are at most 1000px JPEGs; anything huge isn't worth carrying in every file.
    return mime && data.length < 1.5 * 1024 * 1024 ? { mime, data } : null;
  } catch {
    return null;
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Breaks `text` into at most `maxLines` lines that fit `width`, the last one ending in "…" if cut. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= width || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = `${kept[maxLines - 1]}…`;
  while (last.length > 1 && ctx.measureText(last).width > width) last = `${last.slice(0, -2)}…`;
  kept[maxLines - 1] = last;
  return kept;
}

/** Square cover art in the Remixt look: the mark, the title, the artist and the site. */
async function drawCover({ title, subtitle, artist }: { title: string; subtitle?: string; artist: string }): Promise<Cover | null> {
  const size = 800;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  try {
    ctx.fillStyle = "#0b0b10";
    ctx.fillRect(0, 0, size, size);
    const [from, via, to] = MARK_GRADIENT;
    const glow = ctx.createLinearGradient(0, 0, size, size);
    glow.addColorStop(0, `${from}cc`);
    glow.addColorStop(0.55, `${via}88`);
    glow.addColorStop(1, `${to}cc`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);
    // Darken the lower half so the type reads on any part of the gradient.
    const shade = ctx.createLinearGradient(0, size * 0.35, 0, size);
    shade.addColorStop(0, "rgba(0,0,0,0)");
    shade.addColorStop(1, "rgba(0,0,0,0.7)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, size, size);

    const mark = await loadImage(markDataUri("tile")).catch(() => null);
    if (mark) ctx.drawImage(mark, 56, 56, 112, 112);

    const pad = 56;
    const font = 'system-ui, -apple-system, "Segoe UI", Roboto, Vazirmatn, Tahoma, sans-serif';
    const rtl = hasRtl(title) || hasRtl(artist);
    ctx.direction = rtl ? "rtl" : "ltr";
    ctx.textAlign = rtl ? "right" : "left";
    const x = rtl ? size - pad : pad;
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "alphabetic";

    ctx.font = `800 76px ${font}`;
    const titleLines = wrap(ctx, title, size - pad * 2, 3);
    let y = size - pad - 64 - (subtitle ? 44 : 0) - (titleLines.length - 1) * 84;
    for (const line of titleLines) {
      ctx.fillText(line, x, y);
      y += 84;
    }
    ctx.font = `600 38px ${font}`;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(wrap(ctx, artist, size - pad * 2, 1)[0] ?? "", x, y - 16);
    if (subtitle) {
      ctx.font = `500 28px ${font}`;
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.fillText(wrap(ctx, subtitle, size - pad * 2, 1)[0] ?? "", x, y + 28);
    }

    ctx.direction = "ltr";
    ctx.textAlign = "right";
    ctx.font = `700 30px ${font}`;
    ctx.fillStyle = "#fff";
    ctx.fillText(SITE_NAME, size - pad, 56 + 70);
    ctx.font = `500 22px ${font}`;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText(location.host, size - pad, 56 + 102);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    return blob ? { mime: "image/jpeg", data: new Uint8Array(await blob.arrayBuffer()) } : null;
  } catch {
    return null;
  } finally {
    canvas.width = canvas.height = 0; // hands the memory back straight away on iOS
  }
}

/**
 * Tags for an export. `lanes` are the ones heard in it (the whole mix, or
 * the single lane); `part` names a lane export ("Vocals").
 */
export async function exportTags(
  info: ExportInfo,
  { lanes, lengthSeconds, bpm, part }: { lanes: StudioLane[]; lengthSeconds: number; bpm?: number; part?: string }
): Promise<AudioTags> {
  const credits = laneCredits(lanes);
  const reference = referenceLane(lanes, (l) => !!l.musicalKey);
  const key = reference ? effectiveKey(reference) : null;
  const title = part ? `${info.title} (${part})` : info.title;
  const url = info.remixId ? new URL(shortPath(info.remixId), location.origin).href : undefined;
  const cover =
    (info.cover ? await fetchCover(info.cover) : null) ??
    (await drawCover({ title: info.title, artist: info.artist, subtitle: part ?? (credits.length ? creditLine(credits.slice(0, 2)) : undefined) }));
  return {
    title,
    artist: info.artist,
    album: SITE_NAME,
    genre: info.tags?.[0] ?? "Remix",
    year: new Date().getFullYear(),
    bpm,
    key: key ? id3Key(key) : undefined,
    lengthMs: lengthSeconds * 1000,
    credits,
    comment: `Made with ${SITE_NAME} — ${location.host}`,
    url,
    siteUrl: location.origin,
    siteName: SITE_NAME,
    cover: cover ?? undefined,
  };
}
