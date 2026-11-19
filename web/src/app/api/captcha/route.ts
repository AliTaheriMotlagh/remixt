import { NextResponse } from "next/server";
import { createChallenge } from "@/lib/captcha";

// A fresh "are you a person?" challenge for a form (see lib/captcha.ts).
export function GET() {
  return NextResponse.json(createChallenge(), { headers: { "Cache-Control": "no-store" } });
}
