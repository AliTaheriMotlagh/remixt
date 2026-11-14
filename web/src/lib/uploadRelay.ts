import { after } from "next/server";
import { deleteObject, putObject, readObject, sweepOld } from "./storage";

// Uploading through this app, for browsers that can't reach the store
// (Vercel Blob, R2) themselves — it's blocked in some countries (Iran among
// them) while this site isn't. The browser sends the file a slice at a time
// (Vercel caps a request body at 4.5 MB), each slice is parked in storage,
// and a last request joins them into the real file and throws the slices
// away. See lib/client/directUpload.ts for the browser's side.
//
// The routes that take these (a track's stems, a queued song) check who's
// asking before they get here; this only moves bytes.

/** A slice is at most this big. */
export const RELAY_PART_BYTES = 3 * 1024 * 1024;
/** Slices of an upload, at most (a 90 MB queued song is 30). */
const MAX_PARTS = 64;
/** Slices left behind by a browser that never finished are swept after this long. */
const STALE_MS = 6 * 60 * 60 * 1000;

const SESSION = /^[A-Za-z0-9-]{8,64}$/;

function partKey(session: string, part: number) {
  return `relay/${session}/${part}.part`;
}

type Result = { status: number; body: Record<string, unknown> };

/** Is this request one of the relay's (?relay=<session>)? */
export function relaySession(url: URL): string | null {
  const session = url.searchParams.get("relay");
  return session && SESSION.test(session) ? session : null;
}

/** PUT ?relay=<session>&part=<n>: one slice. */
export async function takeRelayPart(req: Request, session: string, maxBytes: number): Promise<Result> {
  const part = Number(new URL(req.url).searchParams.get("part"));
  if (!Number.isInteger(part) || part < 0 || part >= MAX_PARTS || part * RELAY_PART_BYTES >= maxBytes) {
    return { status: 400, body: { error: "Bad upload slice" } };
  }
  const bytes = Buffer.from(await req.arrayBuffer());
  if (bytes.length === 0) return { status: 400, body: { error: "Empty upload" } };
  if (bytes.length > RELAY_PART_BYTES) return { status: 413, body: { error: "Upload slice too big" } };
  await putObject(partKey(session, part), bytes);
  return { status: 200, body: { ok: true } };
}

/** POST ?relay=<session>&parts=<n>: joins the slices into `key`. */
export async function finishRelay(req: Request, session: string, key: string, maxBytes: number): Promise<Result> {
  const parts = Number(new URL(req.url).searchParams.get("parts"));
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
