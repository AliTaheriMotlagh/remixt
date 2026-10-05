import { NextRequest, NextResponse } from "next/server";
import { REF_COOKIE } from "@/lib/referral";

// An invite link: remembers who sent it, then lands on sign-up (or the
// home page for someone already signed in, which signup ignores anyway).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = NextResponse.redirect(new URL("/signup?invited=1", req.url), 307);
  if (/^[0-9a-f-]{36}$/i.test(id)) {
    res.cookies.set(REF_COOKIE, id, { maxAge: 30 * 24 * 3600, httpOnly: true, sameSite: "lax", path: "/" });
  }
  return res;
}
