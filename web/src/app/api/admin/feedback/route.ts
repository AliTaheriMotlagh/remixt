import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentAdmin } from "@/lib/admin";
import { FEEDBACK_STATUS } from "@/lib/feedback";
import { answerFeedback, feedbackReport, problemHits, setFeedbackStatus, setProblemFixed } from "@/lib/feedbackStore";

// Admin → Feedback & problems: what people said, and where their browsers had trouble.
export async function GET(req: NextRequest) {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const key = req.nextUrl.searchParams.get("problem");
  if (key) return NextResponse.json({ hits: await problemHits(key) }, { headers: { "Cache-Control": "no-store" } });
  const days = Math.min(90, Math.max(1, Number(req.nextUrl.searchParams.get("days")) || 30));
  return NextResponse.json(await feedbackReport(days), { headers: { "Cache-Control": "no-store" } });
}

const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), id: z.string().max(20), status: z.enum(FEEDBACK_STATUS) }),
  z.object({ action: z.literal("answer"), id: z.string().max(20), answer: z.string().trim().min(1).max(2_000) }),
  z.object({ action: z.literal("fixed"), key: z.string().max(400), fixed: z.boolean() }),
]);

export async function POST(req: NextRequest) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = action.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const a = parsed.data;
  if (a.action === "status") await setFeedbackStatus(a.id, a.status);
  if (a.action === "fixed") await setProblemFixed(a.key, a.fixed);
  if (a.action === "answer") {
    const err = await answerFeedback(a.id, a.answer, admin.id);
    if (err) return NextResponse.json(err, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
