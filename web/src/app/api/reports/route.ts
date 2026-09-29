import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createReport, REPORT_KINDS, REPORT_REASONS, targetFromLink, type ReportReason } from "@/lib/reports";

// Report a remix, comment or song (signed in), or file a takedown request
// (anyone — rights holders usually don't have an account).
const schema = z.object({
  kind: z.enum(REPORT_KINDS),
  targetId: z.string().max(64).nullable().optional(),
  reason: z.enum(Object.keys(REPORT_REASONS) as [ReportReason, ...ReportReason[]]),
  details: z.string().trim().max(4000).default(""),
  email: z.email().max(200).nullable().optional(),
  link: z.string().max(500).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { kind, reason, details, email, link } = parsed.data;
  const user = await getCurrentUser();

  if (kind === "takedown") {
    if (!email && !user) return NextResponse.json({ error: "Give an email we can reach you at" }, { status: 400 });
    if (!link?.trim()) return NextResponse.json({ error: "Paste the link to what should come down" }, { status: 400 });
    if (details.length < 20) {
      return NextResponse.json({ error: "Describe your work and your rights to it (a sentence or two)" }, { status: 400 });
    }
  } else if (!user) {
    return NextResponse.json({ error: "Sign in to report" }, { status: 401 });
  }

  const targetId = kind === "takedown" ? await targetFromLink(link ?? "") : (parsed.data.targetId ?? null);
  const result = await createReport({
    kind,
    targetId,
    reason: kind === "takedown" ? "copyright" : reason,
    details: kind === "takedown" ? `${details}\n\nLink: ${link}` : details,
    reporterId: user?.id ?? null,
    reporterEmail: email ?? null,
  });
  if ("error" in result) return NextResponse.json(result, { status: result.error === "Not found" ? 404 : 429 });
  return NextResponse.json({ ok: true });
}
