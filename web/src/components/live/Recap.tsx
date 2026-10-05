import Link from "next/link";
import { Clock, Eye, Heart, MessageCircle, UserPlus, Users } from "lucide-react";
import type { Recap as RecapData } from "@/lib/live";
import { compactNumber } from "./Reactions";
import { formatClock } from "./Stage";

/** How a session went: shown to the host when they end it, and on the page of an ended session. */
export default function Recap({
  recap,
  title,
  remixId,
  host,
}: {
  recap: RecapData;
  title: string;
  remixId?: string | null;
  /** The recap is the host's: their numbers, in the second person. */
  host?: boolean;
}) {
  const stats = [
    { icon: Clock, label: "Time live", value: formatClock(recap.durationSeconds) },
    { icon: Eye, label: "Peak watching", value: compactNumber(recap.peak) },
    { icon: Users, label: "People who joined", value: compactNumber(recap.unique) },
    { icon: MessageCircle, label: `Messages · ${recap.chatters} chatter${recap.chatters === 1 ? "" : "s"}`, value: compactNumber(recap.messages) },
    {
      icon: Heart,
      label: recap.topReaction ? `Reactions · most ${recap.topReaction}` : "Reactions",
      value: compactNumber(recap.reactions),
    },
    { icon: UserPlus, label: "New followers", value: `+${recap.newFollowers}` },
  ];
  return (
    <section className="rounded-2xl border border-border bg-gradient-to-br from-vocals-dim to-beat-dim p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Session ended</p>
      <h2 className="mt-1 text-xl font-bold">{host ? "Nice set — here's how it went" : title}</h2>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-xl border border-border bg-background/60 p-3">
            <dt className="flex items-center gap-1.5 text-[11px] text-muted">
              <Icon className="h-3.5 w-3.5" /> {label}
            </dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {remixId && (
        <Link
          href={`/remixes/${remixId}`}
          className="mt-4 inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong"
        >
          {host ? "Open the remix you played" : "Listen to the remix again"}
        </Link>
      )}
    </section>
  );
}
