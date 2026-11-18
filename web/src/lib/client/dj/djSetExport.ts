"use client";

// A recorded DJ set as an MP3 people can keep: tagged with its track list
// (credits and comment), the date, and a cover made of the songs' covers.

import { SITE_NAME } from "@/lib/site";
import type { AudioTags } from "../audioTags";
import { drawCover } from "../exportMeta";
import { encodeAudio } from "../mixdown";
import type { RecordingResult } from "./djEngine";
import { setCredits, setListText } from "./djSet";

export function setTitle(date = new Date()) {
  return `DJ set ${date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
}

export async function setAsMp3(rec: RecordingResult, ctx: BaseAudioContext, onProgress?: (fraction: number) => void): Promise<Blob> {
  const buffer = await ctx.decodeAudioData(await rec.blob.arrayBuffer());
  const title = setTitle();
  const songs = rec.tracks.map((t) => ({ stemId: t.coverStemId ?? null, title: t.title, artist: t.artist, peaks: [] as number[] }));
  const cover = await drawCover({ title, artist: SITE_NAME, subtitle: `${rec.tracks.length} song${rec.tracks.length === 1 ? "" : "s"}`, songs }).catch(() => null);
  const tags: AudioTags = {
    title,
    artist: `Mixed on ${SITE_NAME}`,
    album: SITE_NAME,
    genre: "DJ mix",
    year: new Date().getFullYear(),
    lengthMs: buffer.duration * 1000,
    credits: setCredits(rec.tracks),
    comment: setListText(rec.tracks) || `Mixed on ${SITE_NAME}`,
    siteUrl: location.origin,
    siteName: SITE_NAME,
    cover: cover ?? undefined,
  };
  return encodeAudio(buffer, "mp3", { tags, onProgress });
}
