"use client";

import { useSyncExternalStore } from "react";
import { isConstrainedDevice } from "./splitter";
import { useStudioStore } from "./studioStore";
import { useStudioView } from "./studioView";
import { uploads, type UploadItem } from "./uploads";

// A song brought into the Studio from a link — a music site's song page
// (found by a search, see /api/music/search) or an MP3's address: fetched
// by the server (/api/import), split in this browser like any upload, kept
// private to the singer, and its beat and vocal put in the mix when it's
// ready. The work is the upload queue's (lib/client/uploads.ts), so it
// carries on, and shows its progress, wherever the singer goes; here is
// only what's waiting on it.
//
// On a phone (too little memory to split) the song goes to the split
// queue instead, for a computer to split, and lands in the library.

type Waiting = { uploadId: string; title: string };

/** Links being brought in, by link. */
const waiting = new Map<string, Waiting>();
const listeners = new Set<() => void>();
let version = 0;
let watching = false;

function emit() {
  version++;
  for (const listener of listeners) listener();
}

/** The library's stems of one track — the beat and the vocal — put in the mix, beat first. */
export async function addTrackToMix(trackId: string, title: string): Promise<boolean> {
  const res = await fetch("/api/stems", { cache: "no-store" }).catch(() => null);
  const data = await res?.json().catch(() => null);
  const stems = (Array.isArray(data?.stems) ? data.stems : []) as { track_id: string; kind: string }[];
  const mine = stems.filter((s) => s.track_id === trackId && (s.kind === "beat" || s.kind === "vocals"));
  if (!mine.length) return false;
  const store = useStudioStore.getState();
  type Loadable = Parameters<typeof store.addStem>[0];
  for (const stem of mine.sort((a, b) => (a.kind === "vocals" ? 1 : 0) - (b.kind === "vocals" ? 1 : 0))) {
    store.addStem(stem as unknown as Loadable);
  }
  useStudioView.getState().notify(`“${title}” is in the mix — its beat and its vocal`);
  return true;
}

function check(items: UploadItem[]) {
  let changed = false;
  for (const [link, w] of waiting) {
    const item = items.find((i) => i.id === w.uploadId);
    if (!item) {
      // Cancelled from the uploads list.
      waiting.delete(link);
      changed = true;
      continue;
    }
    if (item.status === "done") {
      waiting.delete(link);
      changed = true;
      const notify = useStudioView.getState().notify;
      if (item.trackId) {
        void addTrackToMix(item.trackId, w.title).then((added) => {
          if (!added) notify(`“${w.title}” is in your library — add it from there`);
        });
      } else notify(`“${w.title}” is in the queue — a computer splits it, then it's in your library`);
    } else if (item.status === "failed") {
      waiting.delete(link);
      changed = true;
      useStudioView.getState().notify(item.error ?? `Couldn't get “${w.title}”`, "error");
    }
  }
  if (changed) emit();
}

function watch() {
  if (watching) return;
  watching = true;
  uploads.subscribe(() => check(uploads.items));
}

/**
 * Starts bringing the song behind `link` into the Studio. Null when it
 * started (or was already on its way), "" when the singer said no, else
 * why it can't (not signed in).
 */
export function bringSongIn(link: string, title: string): string | null {
  if (!useStudioView.getState().signedIn) return "Sign in to bring songs into the Studio";
  if (waiting.has(link)) return null;
  const queue = isConstrainedDevice();
  // Split for the singer alone it stays private; through the queue it joins the shared library, as an upload does.
  if (
    queue &&
    !window.confirm(
      `Splitting a song needs a computer, so “${title}” goes to the split queue and then into the shared library for others to remix.\n\nOnly do this if you made it or have permission from whoever owns it to share it on Remixt.`
    )
  ) {
    return "";
  }
  watch();
  const uploadId = uploads.addLink(link, { tags: [], mode: queue ? "queue" : "split", keepPrivate: !queue });
  waiting.set(link, { uploadId, title });
  emit();
  useStudioView
    .getState()
    .notify(queue ? `Sending “${title}” to be split — it's in your library when it's done` : `Getting “${title}” — it's split here and added to the mix`);
  return null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether the song behind `link` is on its way into the Studio. */
export function useBringing(link: string): boolean {
  useSyncExternalStore(subscribe, () => version, () => 0);
  return waiting.has(link);
}
