import { NextResponse } from "next/server";
import { createChallenge } from "@/lib/captcha";
import { getSettings } from "@/lib/settings/server";

// A fresh "are you a person?" challenge for a form (see lib/captcha.ts), as hard as the owner set it (Admin → Settings → Security).
export async function GET() {
  const { captchaWork } = (await getSettings()).security;
  return NextResponse.json(createChallenge(Date.now(), captchaWork), { headers: { "Cache-Control": "no-store" } });
}
