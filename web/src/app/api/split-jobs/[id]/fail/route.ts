import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { failJob, getJob, isWorkerOf, SESSION_HEADER } from "@/lib/splitQueue";

const bodySchema = z.object({ error: z.string().max(300).default("The split didn't finish") });

/** The helper couldn't split it: someone else gets a turn (up to three tries). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const job = await getJob((await params).id);
  if (!isWorkerOf(job, user.id, req.headers.get(SESSION_HEADER))) {
    return NextResponse.json({ ok: true });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  await failJob(job, user.id, parsed.success ? parsed.data.error : "The split didn't finish");
  return NextResponse.json({ ok: true });
}
