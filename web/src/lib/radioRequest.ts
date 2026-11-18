import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, type User } from "./auth";
import { canManage, getStation, listenerKey, type RadioStation } from "./radio";
import { sessionIdOf } from "./liveRequest";

// What the radio routes share: the station by its address, who's asking
// (signed in, or a guest's browser id), and the owner/admin check.

export const noStore = { "Cache-Control": "no-store" };

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: noStore });
}

export async function stationFor(slug: string): Promise<{ station: RadioStation } | { error: NextResponse }> {
  const station = await getStation(slug).catch(() => null);
  return station ? { station } : { error: fail("No station at this address", 404) };
}

/** The listener: their key (one vote, one set of requests), the signed-in user if any. */
export async function listenerOf(raw: unknown): Promise<{ me: string; user: User | null } | null> {
  const sid = sessionIdOf(raw);
  if (!sid) return null;
  const user = await getCurrentUser();
  return { me: listenerKey(user?.id ?? null, sid), user };
}

export async function requireManager(slug: string): Promise<{ station: RadioStation; user: User } | { error: NextResponse }> {
  const found = await stationFor(slug);
  if ("error" in found) return found;
  const user = await getCurrentUser();
  if (!user) return { error: fail("Sign in to run a station", 401) };
  if (!canManage(user, found.station)) return { error: fail("Only the station's DJ can do that", 403) };
  return { station: found.station, user };
}

export function bodyOf(req: NextRequest) {
  return req.json().catch(() => null) as Promise<Record<string, unknown> | null>;
}

export const kindOf = (raw: unknown) => (raw === "track" || raw === "remix" ? raw : null);
