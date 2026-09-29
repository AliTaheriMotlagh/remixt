import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listNotifications, markAllRead, unreadCount } from "@/lib/notifications";

// GET ?count=1 → just the unread number (what the bell polls);
// GET → the latest notifications; POST → mark them all read.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (req.nextUrl.searchParams.get("count")) {
    return NextResponse.json({ unread: await unreadCount(user.id) });
  }
  const [notifications, unread] = await Promise.all([listNotifications(user.id), unreadCount(user.id)]);
  return NextResponse.json({ notifications, unread });
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  await markAllRead(user.id);
  return NextResponse.json({ unread: 0 });
}
