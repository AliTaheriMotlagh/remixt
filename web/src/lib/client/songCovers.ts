"use client";

// A song's cover at upload: the picture inside the file (its tags — see
// lib/audioCover.ts), else the picture of the page a link's song came
// from, else the song's cover found online by its artist and name (the
// file's name, with download sites' names dropped — lib/coverSearch.ts),
// shrunk to a 600 px square JPEG and sent for the new track (or, for
// a song queued from a phone, for its split job — the track gets it when a
// helper has split it). Never in the way: no cover, no fuss.

import { readCover } from "@/lib/audioCover";
import { squareCover } from "./coverImage";

/** The page picture fetched along with a link's song (see fetchSongFromLink), by the file it came with. */
export const linkCovers = new WeakMap<File, string>();

const SIZE = 600;

/** The cover to send for `file` (a 600 px JPEG), or null when there's none. */
export async function coverFor(file: File): Promise<Blob | null> {
  try {
    const picture = await readCover(file);
    if (picture) return await squareCover(new File([picture.data as Uint8Array<ArrayBuffer>], "cover", { type: picture.mime }), SIZE);
    const fromPage = linkCovers.get(file);
    if (fromPage) {
      const res = await fetch(`/api/import/${fromPage}`);
      if (res.ok) {
        const blob = await res.blob();
        void fetch(`/api/import/${fromPage}`, { method: "DELETE" }).catch(() => {});
        return await squareCover(new File([blob], fromPage, { type: blob.type || "image/jpeg" }), SIZE);
      }
    }
    return await coverOnline(file.name);
  } catch {
    return null;
  }
}

/** The song's cover found online by its name (see api/covers/search), or null. */
async function coverOnline(name: string): Promise<Blob | null> {
  const found = await fetch(`/api/covers/search?${new URLSearchParams({ title: name })}`);
  if (found.status !== 200) return null;
  const { url } = (await found.json()) as { url?: string };
  if (!url) return null;
  const picture = await fetch(url);
  if (!picture.ok) return null;
  const blob = await picture.blob();
  return await squareCover(new File([blob], "cover.jpg", { type: blob.type || "image/jpeg" }), SIZE);
}

async function send(url: string, cover: Blob | null) {
  if (!cover) return;
  await fetch(url, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: cover }).catch(() => {});
}

/** The new track's cover, from its file. */
export async function attachTrackCover(trackId: string, file: File) {
  await send(`/api/tracks/${trackId}/cover`, await coverFor(file));
}

/** A queued song's cover, from its original file (before it's shrunk for the queue). */
export async function attachJobCover(jobId: string, file: File) {
  await send(`/api/split-jobs/${jobId}/cover`, await coverFor(file));
}
