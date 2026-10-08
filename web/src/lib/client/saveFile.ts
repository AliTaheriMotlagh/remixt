"use client";

// Getting a finished file onto the person's device.
//
// A link with `download` is fine on a computer and in Chrome on Android,
// but on an iPhone — above all in the installed app (home-screen PWA) — it
// either does nothing or opens the audio full-screen with no way back. The
// share sheet is what works there: "Save to Files", AirDrop, WhatsApp,
// Instagram, GarageBand… So phones get the share sheet, everything else a
// download.
//
// The share sheet only opens straight from a tap (the browser's "user
// activation", which lapses a few seconds after the tap). An export takes
// longer than that, so the caller shows a Save button once the file is
// ready, and calls saveFile from that button's own click.

import { isConstrainedDevice } from "./device";

export type SaveOutcome = "shared" | "downloaded" | "cancelled";

/** A phone or tablet: its share sheet is how files are kept and passed on. */
export function prefersShareSheet(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  return iPadOS || /iPhone|iPad|iPod|Android/i.test(ua) || (isConstrainedDevice() && navigator.maxTouchPoints > 0);
}

/** Running as the installed app, not in a browser tab. */
export function isInstalledApp(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function canShareFile(file: File): boolean {
  try {
    return typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [file] });
  } catch {
    return false;
  }
}

/** Saves through a temporary link — a download on computers and Android. */
export function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Long enough for a slow phone to have read the whole file — revoking
  // on the next frame (as this used to) cut big WAVs short in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Hands the file to the share sheet on a phone (falling back to a
 * download where sharing files isn't possible), or downloads it.
 * Call it from a tap. `share: false` forces a plain download.
 */
export async function saveFile(file: File, { share = prefersShareSheet(), title }: { share?: boolean; title?: string } = {}): Promise<SaveOutcome> {
  if (share && canShareFile(file)) {
    try {
      // Only the file: with text or a URL alongside it, iOS saves those as
      // extra files in "Save to Files".
      await navigator.share({ files: [file], title: title ?? file.name });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
      // NotAllowedError (the tap's activation ran out) and the rest: download instead.
    }
  }
  downloadFile(file, file.name);
  return "downloaded";
}
