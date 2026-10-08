"use client";

import { MAX_RESULT_BYTES, RESULT_VERSIONS, type ResultKind } from "@/lib/stemResults";
import { fetchInSlices } from "./stemFetch";

// Results other browsers already worked out from a stem (see
// lib/stemResults.ts and /api/stems/[id]/results): fetched before doing
// the work here, and sent once it's done, so the next person — on a phone,
// say — gets it without doing it at all.

/** The shared result, or null when nobody has sent one yet (or it can't be reached). */
export async function fetchShared(kind: ResultKind, stemId: string): Promise<Uint8Array | null> {
  try {
    // In slices: a private Blob store serves files in pieces (see stemFetch.ts).
    return new Uint8Array(await fetchInSlices(`/api/stems/${stemId}/results/${kind}`));
  } catch {
    return null;
  }
}

/** Sends a result for everyone else. Only signed-in people's are kept; failing is fine. */
export function shareResult(kind: ResultKind, stemId: string, bytes: Uint8Array) {
  if (bytes.length > MAX_RESULT_BYTES[kind]) return;
  void fetch(`/api/stems/${stemId}/results/${kind}?v=${RESULT_VERSIONS[kind]}`, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: new Blob([bytes as Uint8Array<ArrayBuffer>]),
  }).catch(() => {});
}
