import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { projectForMember, projectMembers, setMemberRole } from "@/lib/projects";
import { ROLES } from "@/lib/songPrivacy";

// A shared session's members: PATCH { userId, role?, canEdit? } — the owner
// sets anyone's role and who can edit; a member sets their own role.
const schema = z.object({ userId: z.string().max(64), role: z.enum(ROLES).optional(), canEdit: z.boolean().optional() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const id = (await params).id;
  if (!(await projectForMember(id, user.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const error = await setMemberRole(id, user.id, parsed.data.userId, { role: parsed.data.role, canEdit: parsed.data.canEdit });
  if (error) return NextResponse.json(error, { status: 403 });
  return NextResponse.json({ members: await projectMembers(id) });
}
