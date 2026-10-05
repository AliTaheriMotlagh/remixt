"use client";

import { ArrowRight } from "lucide-react";
import { demoSongMeta } from "@/lib/client/demoSongs";
import { analyzePair, type PairSettings } from "@/lib/client/examplesMatch";
import { RECIPES } from "./recipes";

/** Step 4: ready-made pairings, each loading straight into the Match step. */
export default function RecipeGallery({ onLoad }: { onLoad: (settings: PairSettings) => void }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {RECIPES.map((r) => {
        const vocal = demoSongMeta(r.settings.vocalId)!;
        const beat = demoSongMeta(r.settings.beatId)!;
        const a = analyzePair(vocal, beat, r.settings);
        return (
          <li key={r.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
            <span className="self-start rounded-full bg-brand/20 px-2 py-0.5 text-[11px] font-semibold text-brand-strong">{r.tag}</span>
            <h3 className="text-base font-bold leading-snug">{r.title}</h3>
            <p className="text-sm text-muted">{r.why}</p>
            <p className="text-xs text-muted">
              <span className="font-semibold text-vocals">{vocal.title}</span> ({vocal.bpm} BPM, {vocal.camelot}) over{" "}
              <span className="font-semibold text-beat">{beat.title}</span> ({beat.bpm} BPM, {beat.camelot}) · {a.semitones > 0 ? "+" : ""}
              {a.semitones} st · {a.targetBpm.toFixed(0)} BPM
            </p>
            <button
              type="button"
              onClick={() => onLoad(r.settings)}
              className="mt-auto flex min-h-10 items-center justify-center gap-1.5 self-start rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong"
            >
              Load into Match <ArrowRight />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
