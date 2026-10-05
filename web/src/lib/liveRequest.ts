import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, type User } from "./auth";
import { getStream, type LiveStream } from "./live";

// What the live routes share: who is asking (signed in, or a guest's
// browser id) and the host-only check.

const SESSION_ID = /^[A-Za-z0-9-]{8,64}$/;

export function sessionIdOf(raw: unknown): string | null {
  return typeof raw === "string" && SESSION_ID.test(raw) ? raw : null;
}

export async function requireHost(
  id: string
): Promise<{ user: User; stream: LiveStream } | { error: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) };
  const stream = await getStream(id);
  if (!stream) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (stream.host_id !== user.id) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user, stream };
}

export function bodyOf(req: NextRequest) {
  return req.json().catch(() => null) as Promise<Record<string, unknown> | null>;
}
