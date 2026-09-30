import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { failJob, getJob } from "@/lib/splitQueue";

const bodySchema = z.object({ error: z.string().max(300).default("The split didn't finish") });

/** The helper couldn't split it: someone else gets a turn (up to three tries). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const job = await getJob((await params).id);
  if (!job || job.status !== "working" || job.worker_id !== user.id) {
    return NextResponse.json({ ok: true });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  await failJob(job, user.id, parsed.success ? parsed.data.error : "The split didn't finish");
  return NextResponse.json({ ok: true });
}
