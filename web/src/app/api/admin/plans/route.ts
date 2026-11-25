import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentAdmin } from "@/lib/admin";
import { isSecretName, secretStatus, setSecret } from "@/lib/billing/secrets";
import { decideManualPayment, endPlus, ensureBillingSchema, extendPlus, manualPayments } from "@/lib/billing/store";
import sql from "@/lib/db";
import { mailReady, sendMail, layout } from "@/lib/mail";
import { absoluteUrl } from "@/lib/site";

// Admin → Plans: the gateways' keys (set here or on the server), who's on
// Plus, payments made by hand to confirm, and Plus given or taken by hand.

const hidden = () => NextResponse.json({ error: "Not found" }, { status: 404 });

export async function GET() {
  if (!(await currentAdmin())) return hidden();
  await ensureBillingSchema();
  const [secrets, waiting, members, counts] = await Promise.all([
    secretStatus(),
    manualPayments("waiting"),
    sql`
      SELECT s.user_id, u.artist_name, u.email, s.plan, s.status, s.provider, s.period, s.current_period_end, s.cancel_at_period_end, s.note, s.updated_at
      FROM subscriptions s JOIN users u ON u.id = s.user_id
      ORDER BY s.updated_at DESC LIMIT 300
    `,
    sql<{ provider: string; n: number }[]>`
      SELECT provider, count(*)::int AS n FROM subscriptions
      WHERE plan = 'plus' AND current_period_end > now() GROUP BY provider
    `,
  ]);
  return NextResponse.json({
    secrets,
    waiting,
    members,
    counts,
    mail: await mailReady(),
    webhooks: { stripe: absoluteUrl("/api/billing/webhook/stripe"), paypal: absoluteUrl("/api/billing/webhook/paypal") },
  });
}

const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("secret"), name: z.string(), value: z.string().max(4000) }),
  z.object({ action: z.literal("manual"), id: z.string().max(64), confirm: z.boolean(), note: z.string().max(500).nullable().optional() }),
  z.object({ action: z.literal("grant"), email: z.string().trim().email(), months: z.number().int().min(1).max(120), note: z.string().max(300).nullable().optional() }),
  z.object({ action: z.literal("revoke"), userId: z.string().max(64), note: z.string().max(300).nullable().optional() }),
  z.object({ action: z.literal("test-mail") }),
]);

export async function POST(req: NextRequest) {
  const admin = await currentAdmin();
  if (!admin) return hidden();
  const parsed = action.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const a = parsed.data;
  try {
    if (a.action === "secret") {
      if (!isSecretName(a.name)) return NextResponse.json({ error: "No such key" }, { status: 400 });
      await setSecret(a.name, a.value, admin.id);
    } else if (a.action === "manual") {
      if (!(await decideManualPayment(a.id, a.confirm, a.note ?? null))) return NextResponse.json({ error: "Already answered" }, { status: 409 });
    } else if (a.action === "grant") {
      const [u] = await sql<{ id: string }[]>`SELECT id FROM users WHERE email = ${a.email.toLowerCase()}`;
      if (!u) return NextResponse.json({ error: "No account with that email" }, { status: 404 });
      await extendPlus(u.id, a.months, "admin", a.note || `Given by ${admin.artist_name}`);
    } else if (a.action === "revoke") {
      await endPlus(a.userId, a.note || `Ended by ${admin.artist_name}`);
    } else if (a.action === "test-mail") {
      const sent = await sendMail(admin.email, "Remixt email works", layout({ heading: "Email is set up", lines: ["This test came from Admin → Plans."], button: { label: "Open Remixt", href: absoluteUrl("/") }, footer: "Sent to you because you pressed the test button." }));
      if (!sent.sent) return NextResponse.json({ error: sent.reason === "not-configured" ? "Add the Resend key first" : "Resend refused it — check the key and that MAIL_FROM's domain is verified" }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
