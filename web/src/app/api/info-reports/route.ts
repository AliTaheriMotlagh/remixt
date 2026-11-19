import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/settings/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { allow, clientKey, TOO_MANY } from "@/lib/rateLimit";
import { INFO_FIELDS, reportWrongInfo } from "@/lib/songFixes";

// "Wrong info?": anyone can say a song's or remix's name, artist, cover or
// lyrics are wrong, and what's right. It goes to the admin's queue
// (Admin → Fix songs); nothing changes until an admin approves.
const schema = z.object({
  kind: z.enum(["track", "remix"]),
  id: z.string().max(64),
  fields: z.array(z.enum(INFO_FIELDS)).min(1).max(5),
  suggestion: z.string().trim().max(1000).default(""),
});

export async function POST(req: NextRequest) {
  const settings = await getSettings();
  if (!settings.features.wrongInfo) return NextResponse.json({ error: "Reports are closed for now" }, { status: 403 });
  if (!(await allow(`info-report:${clientKey(req)}`, settings.limits.wrongInfoPerHour, 60 * 60))) return NextResponse.json(TOO_MANY, { status: 429 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Say what's wrong" }, { status: 400 });
  const user = await getCurrentUser().catch(() => null);
  const result = await reportWrongInfo({ kind: parsed.data.kind, itemId: parsed.data.id, fields: parsed.data.fields, suggestion: parsed.data.suggestion, reporterId: user?.id ?? null });
  return NextResponse.json(result, { status: "error" in result ? 404 : 200 });
}
