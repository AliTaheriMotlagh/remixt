import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { allow, clientKey } from "@/lib/rateLimit";
import { parseUserAgent } from "@/lib/analytics";
import { cleanListen, MAX_LISTENS_PER_BEACON, type Listen } from "@/lib/listens";
import { recordListens } from "@/lib/listenStore";

// Songs heard (lib/client/listens.ts), sent in batches by beacon. Robots
// aren't counted; one address can't flood the table.
export async function POST(req: NextRequest) {
  const raw = (await req.json().catch(() => null)) as { v?: unknown; listens?: unknown[] } | null;
  const visitor = typeof raw?.v === "string" && /^[\w-]{6,64}$/.test(raw.v) ? raw.v : null;
  if (!visitor || !Array.isArray(raw?.listens)) return new NextResponse(null, { status: 204 });
  if (parseUserAgent(req.headers.get("user-agent") ?? "").bot) return new NextResponse(null, { status: 204 });
  if (!(await allow(`listens:${clientKey(req)}`, 120, 3600))) return new NextResponse(null, { status: 204 });
  const listens = raw.listens.slice(0, MAX_LISTENS_PER_BEACON).map(cleanListen).filter((l): l is Listen => !!l);
  if (!listens.length) return new NextResponse(null, { status: 204 });
  const user = await getCurrentUser().catch(() => null);
  const country = (req.headers.get("x-vercel-ip-country") ?? req.headers.get("cf-ipcountry") ?? "").slice(0, 2).toUpperCase();
  await recordListens(listens, { visitor, userId: user?.id ?? null, country }).catch(() => {});
  return new NextResponse(null, { status: 204 });
}
