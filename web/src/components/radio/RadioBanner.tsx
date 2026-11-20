import Link from "next/link";
import { Headphones, Play, Radio } from "lucide-react";
import type { StationCard } from "@/lib/radio";
import { LiveDot, RadioArt } from "./RadioBits";

/**
 * The radio, on pages that aren't the radio (the home page): the house
 * station's song on air now, one tap from tuning in. Server-rendered from
 * listStations; shows nothing when there are no stations.
 */
export default function RadioBanner({ stations }: { stations: StationCard[] }) {
  const [house, ...rest] = stations;
  if (!house) return null;
  const listening = stations.reduce((n, s) => n + s.listeners, 0);
  const item = house.now ?? { title: house.name, artist: house.owner ?? "", cover: null };
  return (
    <Link
      href={`/radio/${house.slug}`}
      className="group relative isolate flex flex-col gap-4 overflow-hidden rounded-[28px] border border-white/10 bg-black p-4 text-white transition hover:border-white/30 sm:flex-row sm:items-center sm:p-5"
      aria-label={`Tune in to ${house.name}${house.now ? `: ${house.now.title} by ${house.now.artist}` : ""}`}
    >
      <div className="absolute inset-0 -z-10" aria-hidden>
        <RadioArt item={item} className="absolute inset-0 size-full scale-150 opacity-35 blur-3xl" />
        <div className="absolute -left-16 -top-24 size-72 rounded-full bg-brand/40 blur-3xl" />
      </div>
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <RadioArt item={item} className="size-20 rounded-2xl shadow-2xl sm:size-24" />
          <span className="absolute inset-x-2 bottom-2 flex h-5 items-end gap-[3px]" aria-hidden>
            {[0.6, 1, 0.75, 0.9, 0.5].map((h, i) => (
              <span key={i} className="eq-bar block flex-1 rounded-t-sm bg-white/90" style={{ height: `${h * 100}%`, transformOrigin: "bottom", ["--d" as string]: `${-i * 0.23}s` }} />
            ))}
          </span>
        </div>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-black uppercase tracking-[0.2em] text-white/70">
            <span className="flex items-center gap-1.5">
              <Radio className="size-3.5" aria-hidden /> Remixt radio
            </span>
            <LiveDot label={house.now ? "On air" : "Ready"} className="text-red-400" />
          </p>
          <p className="mt-1 truncate text-lg font-black sm:text-xl">{house.now ? house.now.title : house.name}</p>
          <p className="truncate text-sm text-white/70">
            {house.now ? house.now.artist : house.tagline}
            {rest.length > 0 && ` · ${rest.length + 1} stations`}
          </p>
        </div>
      </div>
      <span className="flex items-center gap-3 sm:ms-auto">
        <span className="flex items-center gap-1 text-sm text-white/70">
          <Headphones className="size-4" aria-hidden /> {listening} listening
        </span>
        <span className="flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-black text-black transition group-hover:scale-105">
          <Play className="size-4 fill-current" aria-hidden /> Tune in
        </span>
      </span>
    </Link>
  );
}
