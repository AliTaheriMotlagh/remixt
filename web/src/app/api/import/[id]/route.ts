import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { deleteObject, serveObject } from "@/lib/storage";

// A song fetched from a link (see ../route.ts), for its owner only: the
// key includes the signed-in user's id, so nobody else's can be reached.
function keyFor(userId: string, id: string): string | null {
  return /^[0-9a-f-]{36}\.[a-z0-9]{2,5}$/.test(id) ? `imports/${userId}/${id}` : null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const key = keyFor(user.id, (await params).id);
  if (!key) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return serveObject(key, req.headers.get("range"));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const key = keyFor(user.id, (await params).id);
  if (!key) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await deleteObject(key).catch(() => {});
  return new NextResponse(null, { status: 204 });
}
