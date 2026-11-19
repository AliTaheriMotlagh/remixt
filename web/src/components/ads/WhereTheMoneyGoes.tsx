import Link from "next/link";
import { HeartHandshake } from "lucide-react";
import { adKindText, type EffectiveAds } from "@/lib/monetize/adRules";
import { ROLE_TEXT, type Role } from "@/lib/monetize/policy";

// On every public remix: who this page's ads pay, by name and share, and
// what its maker (and its songs' artists) chose — so a listener can see an
// ad here is how the people behind the music get paid.

const ROLE = (r: Role) => (r === "parent-remixer" ? "the remix it came from" : ROLE_TEXT[r].en.toLowerCase());
const COLOR = (r: Role) => ROLE_TEXT[r].color;

export default function WhereTheMoneyGoes({
  shares,
  ads,
  remixId,
  isOwner,
  audio,
}: {
  shares: { name: string; role: Role; bp: number; held: boolean }[];
  ads: EffectiveAds & { songs: { title: string; policy: string | null }[] };
  remixId: string;
  isOwner: boolean;
  /** The owner's audio-ad rules, for the kinds' descriptions. */
  audio?: Parameters<typeof adKindText>[0];
}) {
  const kindText = adKindText(audio);
  const monetizing = ads.songs.filter((s) => s.policy === "monetize").map((s) => s.title);
  const status = !ads.on
    ? "Its maker keeps ads off this remix, so it earns nothing for anyone."
    : ads.forced
      ? `Its maker turned ads off, but the artist of “${monetizing[0]}” chose to keep earning from remixes of their song, so picture ads stay on.`
      : `Ads here: ${ads.kinds.map((k) => kindText[k].en.toLowerCase()).join(", ")}.`;
  return (
    <details className="group mt-6 rounded-2xl border border-border bg-surface/60 px-4 py-3 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium">
        <HeartHandshake className="h-4 w-4 shrink-0 text-vocals" />
        <span className="flex-1">Where this remix&apos;s ad money goes</span>
        <span className="flex h-1.5 w-24 overflow-hidden rounded-full bg-surface-raised" aria-hidden>
          {shares.map((s, i) => (
            <span key={i} style={{ width: `${s.bp / 100}%`, background: COLOR(s.role), opacity: s.held ? 0.55 : 1 }} />
          ))}
        </span>
      </summary>
      <p className="mt-3 text-muted">{status}</p>
      <ul className="mt-3 grid gap-1.5">
        {shares.map((s, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: COLOR(s.role) }} />
            <span className="w-12 shrink-0 font-semibold tabular-nums">{(s.bp / 100).toFixed(s.bp % 100 ? 1 : 0)}%</span>
            <span className="min-w-0 flex-1 break-words">
              {s.name}
              {s.role !== "platform" && <span className="text-muted"> · {ROLE(s.role)}</span>}
              {s.held && <span className="text-muted"> · kept for them until they join and claim it</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        <Link href="/earnings" className="text-brand-strong hover:underline">
          How ads pay artists
        </Link>
        {isOwner && (
          <Link href={`/earnings/remix/${remixId}`} className="text-brand-strong hover:underline">
            Your ad settings and earnings for this remix
          </Link>
        )}
      </p>
    </details>
  );
}
