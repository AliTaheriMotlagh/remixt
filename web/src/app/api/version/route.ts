import { NextResponse } from "next/server";

// Always asked fresh: an open tab compares this with the build it's running
// (components/UpdatePrompt).
export const dynamic = "force-dynamic";

/** The live build's name (next.config.ts deploymentId), or null in dev. */
export function GET() {
  return NextResponse.json({ id: process.env.NEXT_DEPLOYMENT_ID || null }, { headers: { "Cache-Control": "no-store" } });
}
