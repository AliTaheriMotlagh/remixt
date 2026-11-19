import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { setSplits } from "@/lib/monetize/store";

const schema = z.object({
  remixId: z.string().max(64),
  splits: z.array(z.object({ userId: z.string().max(64), bp: z.number().int().min(1).max(9000) })).max(10),
});

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const problem = await setSplits(user.id, parsed.data.remixId, parsed.data.splits);
  return NextResponse.json(problem ?? { ok: true }, { status: problem ? 400 : 200 });
}
