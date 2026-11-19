import { HOLD_DAYS, MICROS, PAYOUT_MIN_MICROS, PARENT_SHARE_BP, SPLITS, VIEWABLE, type Split } from "@/lib/monetize/policy";

// The rules, drawn from the numbers the ledger uses (lib/monetize/policy.ts),
// so this page can't promise something the money doesn't do.

const PARTS: { key: keyof Split; label: string; color: string }[] = [
  { key: "artists", label: "Artists of the songs used", color: "var(--vocals)" },
  { key: "remixers", label: "Remixers", color: "var(--brand)" },
  { key: "platform", label: "Remixt", color: "var(--muted)" },
];

function SplitCard({ title, note, split }: { title: string; note: string; split: Split }) {
  const parts = PARTS.filter((p) => split[p.key] > 0);
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted">{note}</p>
      <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-surface-raised" aria-hidden>
        {parts.map((p) => (
          <span key={p.key} style={{ width: `${split[p.key] / 100}%`, background: p.color }} />
        ))}
      </div>
      <ul className="mt-3 grid gap-1 text-sm">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
            <span className="flex-1">{p.label}</span>
            <span className="font-semibold tabular-nums">{split[p.key] / 100}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function HowEarningWorks() {
  return (
    <section className="mt-12" aria-labelledby="how-earning-works">
      <h2 id="how-earning-works" className="text-2xl font-bold tracking-tight">
        How the money is shared
      </h2>
      <p className="mt-2 max-w-3xl text-muted">
        Advertisers pay for each view of their ad. Where the ad sits says whose it is: a remix&apos;s page belongs to the people who made that
        music, an ordinary page to Remixt.
      </p>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <SplitCard title="On a remix" note="The remix's page, or the remix playing on the radio." split={SPLITS.remix} />
        <SplitCard title="A song on the radio" note="A library song played as it is." split={SPLITS.song} />
        <SplitCard title="Everywhere else" note="Home, tools, lists and profiles keep the site running." split={SPLITS.site} />
      </div>

      <div className="mt-8 grid gap-4 text-sm sm:grid-cols-2">
        {[
          ["Artists, always", "The artists' share is split between the songs a remix uses (a vocal counts double). A take you sang in the Studio pays you. A song's share is kept for its artist until they claim it and we check it's theirs."],
          ["Remixers, always", `The remix's maker gets the remixers' share, and can share it with collaborators (keeping at least 10%). A remix of a remix sends ${PARENT_SHARE_BP / 100}% of it to the remix it came from.`],
          ["Real views only", `A view counts when at least half the ad is on screen for ${VIEWABLE.ms / 1000} second in a visible tab, once a day per person and spot. Your own views of your own work don't count, nor do robots. Clicks are never paid, so please don't click ads to help.`],
          ["Getting paid", `Earnings wait ${HOLD_DAYS} days (in case an advertiser's views turn out to be invalid), then they're yours to withdraw from $${PAYOUT_MIN_MICROS / MICROS}. Taxes on what you earn are yours to declare where you live.`],
        ].map(([title, body]) => (
          <div key={title} className="rounded-2xl border border-border bg-surface/60 p-5">
            <h3 className="font-semibold">{title}</h3>
            <p className="mt-1.5 text-muted">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
