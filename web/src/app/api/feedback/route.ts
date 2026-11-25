import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { allow, clientKey, TOO_MANY } from "@/lib/rateLimit";
import { parseUserAgent } from "@/lib/analytics";
import { cleanReport, FEEDBACK_KINDS, type ProblemReport } from "@/lib/feedback";
import { saveFeedback } from "@/lib/feedbackStore";

// The Feedback box (components/FeedbackDialog.tsx): anyone may send, a few an
// hour per address. It carries the page, the device and the problems the
// browser had just before, so "it doesn't work" comes with what didn't.
const body = z.object({
  kind: z.enum(FEEDBACK_KINDS),
  message: z.string().trim().min(3).max(4_000),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  path: z.string().max(300).default(""),
  visitor: z.string().regex(/^[\w-]{6,64}$/).optional(),
  screen: z.string().max(20).optional(),
  recent: z.array(z.unknown()).max(20).default([]),
});

export async function POST(req: NextRequest) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Write a few words first" }, { status: 400 });
  if (!(await allow(`feedback:${clientKey(req)}`, 8, 3600))) return NextResponse.json(TOO_MANY, { status: 429 });
  const user = await getCurrentUser().catch(() => null);
  const f = parsed.data;
  const ua = parseUserAgent(req.headers.get("user-agent") ?? "");
  await saveFeedback({
    kind: f.kind,
    message: f.message,
    email: f.email || null,
    userId: user?.id ?? null,
    visitor: f.visitor ?? null,
    path: f.path.startsWith("/") ? f.path : "",
    device: [ua.device, ua.os, ua.browser, f.screen].filter(Boolean).join(" · "),
    recent: f.recent.map(cleanReport).filter((r): r is ProblemReport => !!r),
  });
  return NextResponse.json({ ok: true });
}
