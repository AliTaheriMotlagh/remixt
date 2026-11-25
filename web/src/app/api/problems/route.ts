import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { allow, clientKey } from "@/lib/rateLimit";
import { parseUserAgent } from "@/lib/analytics";
import { cleanReport, type ProblemReport } from "@/lib/feedback";
import { recordProblems } from "@/lib/feedbackStore";

// Problems a browser ran into (lib/client/problems.ts), sent in batches by
// beacon. Robots aren't counted; one address can't flood the table.
export async function POST(req: NextRequest) {
  const raw = (await req.json().catch(() => null)) as { v?: unknown; p?: unknown[] } | null;
  const visitor = typeof raw?.v === "string" && /^[\w-]{6,64}$/.test(raw.v) ? raw.v : null;
  if (!visitor || !Array.isArray(raw?.p)) return new NextResponse(null, { status: 204 });
  const ua = parseUserAgent(req.headers.get("user-agent") ?? "");
  if (ua.bot) return new NextResponse(null, { status: 204 });
  if (!(await allow(`problems:${clientKey(req)}`, 60, 3600))) return new NextResponse(null, { status: 204 });
  const reports = raw.p.slice(0, 10).map(cleanReport).filter((r): r is ProblemReport => !!r);
  const user = await getCurrentUser().catch(() => null);
  await recordProblems(reports, { visitor, userId: user?.id ?? null, device: [ua.device, ua.os, ua.browser].join(" · ") }).catch(() => {});
  return new NextResponse(null, { status: 204 });
}
