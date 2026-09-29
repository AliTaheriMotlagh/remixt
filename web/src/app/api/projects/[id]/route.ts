import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  leaveProject,
  MAX_STATE_BYTES,
  projectForMember,
  projectMembers,
  projectState,
  saveProject,
} from "@/lib/projects";

// GET: the shared mix and who's here (?since=<version> skips the mix when
// nothing changed — what the Studio polls). PUT: save a new version.
// DELETE: leave (the owner leaving ends the session).

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const project = await projectForMember((await params).id, user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const members = await projectMembers(project.id);
  const since = Number(req.nextUrl.searchParams.get("since"));
  if (since && since === project.version) return NextResponse.json({ project, members, unchanged: true });
  return NextResponse.json({ project, members, state: JSON.parse(await projectState(project.id)) });
}

const putSchema = z.object({ baseVersion: z.number().int().min(1), state: z.unknown() });

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const id = (await params).id;
  const project = await projectForMember(id, user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const state = JSON.stringify(parsed.data.state ?? {});
  if (state.length > MAX_STATE_BYTES) return NextResponse.json({ error: "This mix is too big to share" }, { status: 413 });

  const version = await saveProject(id, user.id, parsed.data.baseVersion, state);
  if (version === null) {
    // Someone else saved first: here's theirs, to merge with.
    const latest = await projectForMember(id, user.id);
    return NextResponse.json(
      { conflict: true, project: latest, state: JSON.parse(await projectState(id)) },
      { status: 409 }
    );
  }
  return NextResponse.json({ version });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  await leaveProject((await params).id, user.id);
  return NextResponse.json({ ok: true });
}
