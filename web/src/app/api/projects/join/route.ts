import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { joinProject } from "@/lib/projects";

const schema = z.object({ code: z.string().min(6).max(40) });

/** Joins a shared session by its invite code. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to join" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That invite link isn't right" }, { status: 400 });
  try {
    const id = await joinProject(parsed.data.code, user.id);
    if (!id) return NextResponse.json({ error: "That invite link has expired or the session ended" }, { status: 404 });
    return NextResponse.json({ id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't join" }, { status: 409 });
  }
}
