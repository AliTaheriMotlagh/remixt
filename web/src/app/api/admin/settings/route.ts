import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentAdmin } from "@/lib/admin";
import { changedPaths, getSettings, resetSetting, saveSettings, settingsLog } from "@/lib/settings/server";

// Admin → Settings (admin only): every setting in force, which ones were
// changed from the default, and the history of changes. PUT saves a change
// (checked as a whole: a split must still add up to 100%); DELETE puts one
// setting back to its default. What each setting is and its limits are in
// lib/settings/registry.ts, which the page reads too.

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

export async function GET() {
  if (!(await currentAdmin())) return notFound();
  const [settings, changed, log] = await Promise.all([getSettings(), changedPaths(), settingsLog(100)]);
  return NextResponse.json({ settings, changed, log }, { headers: { "Cache-Control": "no-store" } });
}

const put = z.object({ patch: z.record(z.string().max(80), z.unknown()).refine((p) => Object.keys(p).length > 0 && Object.keys(p).length <= 100) });

export async function PUT(req: NextRequest) {
  const admin = await currentAdmin();
  if (!admin) return notFound();
  const parsed = put.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
  const result = await saveSettings(parsed.data.patch, admin.id);
  if ("errors" in result) return NextResponse.json({ error: "Some values aren't right", errors: result.errors }, { status: 400 });
  return NextResponse.json({ settings: result.settings, changed: result.changed });
}

export async function DELETE(req: NextRequest) {
  const admin = await currentAdmin();
  if (!admin) return notFound();
  const path = req.nextUrl.searchParams.get("path") ?? "";
  if (!path) return NextResponse.json({ error: "Which setting?" }, { status: 400 });
  const result = await resetSetting(path, admin.id);
  if ("errors" in result) return NextResponse.json({ error: "Can't go back to the default alone", errors: result.errors }, { status: 400 });
  return NextResponse.json({ settings: result.settings });
}
