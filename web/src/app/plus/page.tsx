import { Check, Minus } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { pageMetadata } from "@/lib/seo";
import { getSettings } from "@/lib/settings/server";
import { FEATURE_TEXT, plusOnly, tomanMonthly, usd, yearlySaving, type PlusFeature } from "@/lib/plans";
import PlusActions from "./PlusActions";

export const metadata = pageMetadata({
  title: "Remixt Plus — no ads, every feature",
  description: "Remixt is free with ads. Plus removes them and adds link imports, splitting from your phone and more AI, for a few dollars a month.",
  path: "/plus",
});

export default async function PlusPage() {
  const [settings, user] = await Promise.all([getSettings(), getCurrentUser()]);
  const p = settings.plans;
  const gated = (Object.keys(FEATURE_TEXT) as PlusFeature[]).filter((f) => plusOnly(f, settings));
  const saving = yearlySaving(settings);
  const toman = tomanMonthly(settings);
  const rows: { label: string; free: boolean | string; plus: boolean | string }[] = [
    { label: "Split songs into vocals, drums, bass and beat in your browser", free: true, plus: true },
    { label: "The Studio, the DJ decks, the radio and every free tool", free: true, plus: true },
    { label: "Publish remixes and earn from their ads", free: true, plus: true },
    ...(Object.keys(FEATURE_TEXT) as PlusFeature[]).filter((f) => f !== "ai").map((f) => ({ label: FEATURE_TEXT[f].en, free: !gated.includes(f), plus: true })),
    {
      label: "The site's AI co-producer, a day",
      free: p.plusOnlyAi ? false : `${settings.ai.freeTokensPerDay.toLocaleString("en-US")} tokens`,
      plus: `${settings.ai.plusTokensPerDay.toLocaleString("en-US")} tokens`,
    },
    { label: "Ads", free: "Yes", plus: p.plusNoAds ? "None" : "Yes" },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-xs font-bold uppercase tracking-widest text-brand-strong">Remixt Plus</p>
      <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Everything, and no ads</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Remixt is free: split songs, remix them, DJ and publish, with ads that pay the artists. Plus takes the ads away and adds the things that run on
        Remixt&apos;s own servers — they cost us money each time, so they&apos;re part of Plus.
      </p>

      {!p.enabled ? (
        <p className="mt-8 rounded-2xl border border-border bg-surface p-5 text-sm">
          <strong>Everything is free right now.</strong> Plus isn&apos;t on sale yet — every feature is open to everyone in the meantime.
        </p>
      ) : (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <section className="rounded-2xl border border-border bg-surface p-5">
              <h2 className="text-lg font-bold">Free</h2>
              <p className="mt-1 text-3xl font-bold">$0</p>
              <p className="mt-1 text-sm text-muted">With ads. No card needed.</p>
            </section>
            <section className="rounded-2xl border-2 border-brand bg-brand/5 p-5">
              <h2 className="text-lg font-bold">Plus</h2>
              <p className="mt-1 text-3xl font-bold">
                {usd(p.monthlyMicros)}
                <span className="text-base font-medium text-muted"> / month</span>
              </p>
              <p className="mt-1 text-sm text-muted">
                or {usd(p.yearlyMicros)} a year{saving ? ` — save ${saving}%` : ""}
                {p.manual && toman ? ` · ${toman.toLocaleString("en-US")} Toman a month by card to card` : ""}
              </p>
              <PlusActions signedIn={!!user} manualHow={p.manualHowEn} />
            </section>
          </div>
        </>
      )}

      <section className="mt-10 overflow-hidden rounded-2xl border border-border">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-surface text-left">
            <tr>
              <th className="px-3 py-3 font-semibold sm:px-4">What you get</th>
              <th className="w-[4.75rem] px-1 py-3 text-center font-semibold sm:w-32 sm:px-4">Free</th>
              <th className="w-[4.75rem] px-1 py-3 text-center font-semibold text-brand-strong sm:w-32 sm:px-4">Plus</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-border">
                <td className="px-3 py-3 sm:px-4">{r.label}</td>
                {[r.free, r.plus].map((v, i) => (
                  <td key={i} className="break-words px-1 py-3 text-center text-xs sm:px-4 sm:text-sm">
                    {v === true ? <Check className="mx-auto h-4 w-4 text-success" aria-label="Yes" /> : v === false ? <Minus className="mx-auto h-4 w-4 text-muted" aria-label="No" /> : v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-10 grid gap-4 text-sm sm:grid-cols-2">
        {[
          ["Cancel any time", "Plus stays until the end of the month or year you paid for, then you're back on Free. Nothing you made is lost."],
          ["Safe payments", "Cards, Apple Pay and Google Pay go through Stripe; PayPal through PayPal. Remixt never sees your card."],
          ["Where the money goes", "Plus keeps the servers running (song storage, link imports, the AI). Ads on Free still pay the artists and remixers."],
          ["Paying from Iran", "Card to card in Toman: send it, add the reference here, and Plus starts once we see it (usually within a day)."],
        ].map(([h, b]) => (
          <div key={h} className="rounded-2xl border border-border bg-surface p-4">
            <h3 className="font-semibold">{h}</h3>
            <p className="mt-1 text-muted">{b}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
