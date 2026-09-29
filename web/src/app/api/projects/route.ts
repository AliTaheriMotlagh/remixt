import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createProject, MAX_STATE_BYTES, myProjects } from "@/lib/projects";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  return NextResponse.json({ projects: await myProjects(user.id) });
}

const schema = z.object({ title: z.string().trim().min(1).max(100), state: z.unknown() });

/** Starts a shared session from the mix that's open. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to remix together" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const state = JSON.stringify(parsed.data.state ?? {});
  if (state.length > MAX_STATE_BYTES) return NextResponse.json({ error: "This mix is too big to share" }, { status: 413 });
  return NextResponse.json(await createProject(user.id, parsed.data.title, state));
}
