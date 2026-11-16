import { after } from "next/server";
import { deleteObject, putObject, readObject, storedObject, sweepOld } from "./storage";

// Uploading through this app: for browsers that can't reach the store
// (Vercel Blob, R2) themselves — it's blocked in some countries (Iran among
// them) while this site isn't — and for every phone, whose line is too slow
// and unsteady to send the store a song whole. The browser sends the file a
// slice at a time (Vercel caps a request body at 4.5 MB), each slice is
// parked in storage under where it starts in the file, and a last request
// joins them into the real file and throws the slices away. See
// lib/client/directUpload.ts for the browser's side.
//
// A slice is saved the moment it's answered, so the browser never sends
// one twice; it cuts them to what its line carries, and may send a slice
// again smaller after a failure — so the join goes by the list the browser
// gives ([start, length] of each), not by what happens to be parked: a late
// copy of a longer slice at the same start is cut to the length asked for.
//
// The routes that take these (a track's stems, a queued song) check who's
// asking before they get here; this only moves bytes.

/** A slice is at most this big. */
export const RELAY_PART_BYTES = 3 * 1024 * 1024;
/** Slices of an upload, at most, numbered the old way (pages loaded before slices went by offset). */
const MAX_PARTS = 64;
/** Slices of an upload, at most (the browser aims for half this; see RELAY_SLICES there). */
const MAX_SLICES = 1024;
/** Slices read from storage at once when joining. */
const READS_AT_ONCE = 8;
/** Slices left behind by a browser that never finished are swept after this long. */
const STALE_MS = 6 * 60 * 60 * 1000;

const SESSION = /^[A-Za-z0-9-]{8,64}$/;

function partKey(session: string, part: number) {
  return `relay/${session}/${part}.part`;
}

/** The slice that starts at byte `at`. */
function sliceKey(session: string, at: number) {
  return `relay/${session}/at-${at}.part`;
}

type Result = { status: number; body: Record<string, unknown> };

/** Is this request one of the relay's (?relay=<session>)? */
export function relaySession(url: URL): string | null {
  const session = url.searchParams.get("relay");
  return session && SESSION.test(session) ? session : null;
}

/** PUT ?relay=<session>&at=<byte>: the slice that starts there (or, the old way, &part=<n>: slice n). */
export async function takeRelayPart(req: Request, session: string, maxBytes: number): Promise<Result> {
  const query = new URL(req.url).searchParams;
  if (query.has("at")) {
    const at = Number(query.get("at"));
    if (!Number.isInteger(at) || at < 0 || at >= maxBytes) return { status: 400, body: { error: "Bad upload slice" } };
    const bytes = Buffer.from(await req.arrayBuffer());
    if (bytes.length === 0) return { status: 400, body: { error: "Empty upload" } };
    if (bytes.length > RELAY_PART_BYTES) return { status: 413, body: { error: "Upload slice too big" } };
    if (at + bytes.length > maxBytes) return { status: 413, body: { error: "That file is too big" } };
    await putObject(sliceKey(session, at), bytes);
    return { status: 200, body: { ok: true, at, bytes: bytes.length } };
  }
  const part = Number(query.get("part"));
  if (!Number.isInteger(part) || part < 0 || part >= MAX_PARTS || part * RELAY_PART_BYTES >= maxBytes) {
    return { status: 400, body: { error: "Bad upload slice" } };
  }
  const bytes = Buffer.from(await req.arrayBuffer());
  if (bytes.length === 0) return { status: 400, body: { error: "Empty upload" } };
  if (bytes.length > RELAY_PART_BYTES) return { status: 413, body: { error: "Upload slice too big" } };
  await putObject(partKey(session, part), bytes);
  return { status: 200, body: { ok: true } };
}

/** The slices a join was asked for: [start, length] of each, in order, covering `size` bytes with no gap. */
function slicesAsked(body: unknown, size: number): [number, number][] | null {
  const parts = (body as { parts?: unknown } | null)?.parts;
  if (!Array.isArray(parts) || parts.length < 1 || parts.length > MAX_SLICES) return null;
  let cursor = 0;
  for (const part of parts) {
    if (!Array.isArray(part) || part.length !== 2) return null;
    const [at, bytes] = part as unknown[];
    if (at !== cursor || !Number.isInteger(bytes) || (bytes as number) <= 0 || (bytes as number) > RELAY_PART_BYTES) return null;
    cursor += bytes as number;
  }
  return cursor === size ? (parts as [number, number][]) : null;
}

/**
 * POST ?relay=<session>&size=<bytes> with {parts: [[start, length], …]}:
 * joins those slices into `key`. A slice that isn't there (or is shorter
 * than asked) is named in `missing` (409), for the browser to send again.
 * Asked twice — the first answer was lost on the way — it says yes again.
 */
async function joinSlices(req: Request, session: string, key: string, maxBytes: number, size: number): Promise<Result> {
  if (!Number.isInteger(size) || size < 1) return { status: 400, body: { error: "Bad upload" } };
  if (size > maxBytes) return { status: 413, body: { error: "That file is too big" } };
  const asked = slicesAsked(await req.json().catch(() => null), size);
  if (!asked) return { status: 400, body: { error: "Bad upload" } };
  const slices: (Buffer | null)[] = new Array(asked.length).fill(null);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(READS_AT_ONCE, asked.length) }, async () => {
      for (let i = next++; i < asked.length; i = next++) {
        const [at, bytes] = asked[i];
        const slice = await readObject(sliceKey(session, at));
        // Longer than asked: an earlier, bigger try at the same start — the same bytes, as far as they go.
        slices[i] = slice && slice.length >= bytes ? slice.subarray(0, bytes) : null;
      }
    })
  );
  const missing = asked.filter((_, i) => !slices[i]).map(([at]) => at);
  if (missing.length) {
    // Already joined (and its slices thrown away) by a request whose answer never arrived?
    if ((await storedObject(key))?.size === size) return { status: 200, body: { ok: true, bytes: size } };
    return { status: 409, body: { error: "Part of the upload is missing — try again", missing } };
  }
  await putObject(key, Buffer.concat(slices as Buffer[]));
  await Promise.all(asked.map(([at]) => deleteObject(sliceKey(session, at)).catch(() => {})));
  after(() => sweepOld("relay/", STALE_MS).catch(() => {}));
  return { status: 200, body: { ok: true, bytes: size } };
}

/** POST ?relay=<session>: joins the slices into `key` (&size=<bytes> and a list; the old way, &parts=<n>). */
export async function finishRelay(req: Request, session: string, key: string, maxBytes: number): Promise<Result> {
  const query = new URL(req.url).searchParams;
  if (query.has("size")) return joinSlices(req, session, key, maxBytes, Number(query.get("size")));
  const parts = Number(query.get("parts"));
  if (!Number.isInteger(parts) || parts < 1 || parts > MAX_PARTS) {
    return { status: 400, body: { error: "Bad upload" } };
  }
  const keys = Array.from({ length: parts }, (_, i) => partKey(session, i));
  const slices = await Promise.all(keys.map((k) => readObject(k)));
  if (slices.some((s) => !s)) return { status: 409, body: { error: "Part of the upload is missing — try again" } };
  const whole = Buffer.concat(slices as Buffer[]);
  if (whole.length > maxBytes) return { status: 413, body: { error: "That file is too big" } };
  await putObject(key, whole);
  await Promise.all(keys.map((k) => deleteObject(k).catch(() => {})));
  after(() => sweepOld("relay/", STALE_MS).catch(() => {}));
  return { status: 200, body: { ok: true, bytes: whole.length } };
}
