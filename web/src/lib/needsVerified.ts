import { NextResponse } from "next/server";
import { verifiedEnough } from "./emailTokens";
import { getSettings } from "./settings/server";

/**
 * The answer for something that needs a confirmed email (publishing, a
 * payout, paying for Plus) when `userId` hasn't confirmed theirs — or null
 * when they may go ahead (confirmed, the rule switched off, or the site
 * can't send email). The page shows the banner's "send the link again".
 */
export async function needsVerifiedEmail(userId: string): Promise<NextResponse | null> {
  const settings = await getSettings();
  if (await verifiedEnough(userId, settings.features.requireVerifiedEmail).catch(() => true)) return null;
  return NextResponse.json({ error: "Confirm your email first — we sent you a link (check the banner at the top to send it again)", verifyEmail: true }, { status: 403 });
}
