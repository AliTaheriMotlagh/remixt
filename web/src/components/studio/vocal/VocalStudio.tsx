"use client";

import { useEffect, useMemo, type ComponentType } from "react";
import { Check, Drum, Globe, Layers, Mic, ScrollText, SlidersVertical } from "lucide-react";
import { activeSheet, useLyrics } from "@/lib/client/lyricsStore";
import { isTakeLane } from "@/lib/client/lyricsSources";
import { useStudioStore } from "@/lib/client/studioStore";
import { useStudioView, type VocalTab } from "@/lib/client/studioView";
import { isSung, isSynced } from "@/lib/lyrics";
import { LyricsTools } from "../LyricsPanel";
import { RecordTab } from "../VocalBooth";
import SongFinder from "./SongFinder";
import TakesPanel from "./TakesPanel";
import VocalMixer, { QuickLevels } from "./VocalMixer";
import VocalStage from "./VocalStage";

// The Studio for singers and rappers. Everything is laid out around the
// voice: the stage (the words big and in time, the song's waveform, its
// parts to loop), the booth beside it (record, count-in, mic, levels), and
// under the stage the work around a take — the lyrics and their timing,
// the takes kept so far, and the vocal mix. The producer's timeline and
// mixer are a switch away (Producer mode) for anything more.

const TABS: { id: VocalTab; label: string; short: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: "lyrics", label: "Lyrics & timing", short: "Lyrics", icon: ScrollText },
  { id: "takes", label: "Takes", short: "Takes", icon: Layers },
  { id: "mix", label: "Vocal mix", short: "Mix", icon: SlidersVertical },
  { id: "songs", label: "Find a song", short: "Songs", icon: Globe },
];

/** What's left to do before a take, as three steps — shown until all are done. */
function Steps({ hasBeat, hasLyrics, timed, hasTake }: { hasBeat: boolean; hasLyrics: boolean; timed: boolean; hasTake: boolean }) {
  const steps = [
    { done: hasBeat, title: "Pick a beat", short: "Beat", action: () => useStudioView.getState().showLibrary("beat"), cta: "Add a beat" },
    {
      done: hasLyrics && timed,
      title: hasLyrics ? "Time the lyrics" : "Pick the lyrics",
      short: hasLyrics ? "Time lyrics" : "Lyrics",
      action: () => {
        useLyrics.getState().openLyrics(hasLyrics ? "sheet" : "pick");
        useStudioView.getState().setVocalTab("lyrics");
        document.getElementById("vocal-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
      },
      cta: hasLyrics ? "Time them" : "Find lyrics",
    },
    { done: hasTake, title: "Record a take", short: "Record", action: () => document.getElementById("vocal-booth")?.scrollIntoView({ behavior: "smooth", block: "center" }), cta: "Go to the booth" },
  ];
  if (steps.every((s) => s.done)) return null;
  const at = steps.findIndex((s) => !s.done);
  const current = steps[at];
  // The steps as a row of short names (never cut off on a phone), then the one to do now with its button.
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-2.5 sm:flex-row sm:items-center" aria-label="Getting started">
      <ol className="flex min-w-0 flex-1 items-center gap-1.5">
        {steps.map((s, i) => (
          <li key={s.title} className="flex min-w-0 items-center gap-1.5" aria-current={i === at ? "step" : undefined}>
            {i > 0 && <span className="h-px w-3 shrink-0 bg-border sm:w-5" aria-hidden />}
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                s.done ? "bg-success text-white" : i === at ? "bg-vocals text-white ring-4 ring-vocals/25" : "bg-surface-raised text-muted"
              }`}
            >
              {s.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={`whitespace-nowrap text-xs font-semibold ${i === at ? "" : "text-muted"} ${i === at ? "" : "max-sm:hidden"}`}>{s.short}</span>
          </li>
        ))}
      </ol>
      <div className="flex shrink-0 gap-1.5">
        {at === 0 && (
          <button
            onClick={() => {
              useStudioView.getState().setVocalTab("songs");
              document.getElementById("vocal-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:border-beat"
          >
            <Globe /> Find online
          </button>
        )}
        <button
          onClick={current.action}
          className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-vocals px-4 text-xs font-semibold text-white hover:opacity-90"
        >
          {at === 0 ? <Drum /> : at === 1 ? <ScrollText /> : <Mic />} {current.cta}
        </button>
      </div>
    </section>
  );
}

export default function VocalStudio({ signedIn }: { signedIn: boolean }) {
  const load = useLyrics((s) => s.load);
  const sheet = useLyrics(activeSheet);
  const lines = useLyrics((s) => s.lines);
  const take = useLyrics((s) => s.take);
  const lanes = useStudioStore((s) => s.lanes);
  const tab = useStudioView((s) => s.vocalTab);
  const setTab = useStudioView((s) => s.setVocalTab);
  const takes = useMemo(() => lanes.filter(isTakeLane).length, [lanes]);
  useEffect(() => load(), [load]);

  const hasLyrics = !!sheet && lines.some(isSung);
  const toBooth = () => document.getElementById("vocal-booth")?.scrollIntoView({ behavior: "smooth", block: "center" });

  return (
    <div className="flex flex-col gap-4">
      <Steps hasBeat={lanes.length > 0} hasLyrics={hasLyrics} timed={isSynced(lines)} hasTake={takes > 0} />
      {/* One booth, never mounted twice (a remount would cut a take off): on a phone it sits
          between the stage and the workspace; on a wide screen it stays beside them both. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] xl:grid-rows-[auto_1fr]">
        <div className="min-w-0 xl:col-start-1 xl:row-start-1">
          <VocalStage />
        </div>
        <div className="min-w-0 xl:col-start-2 xl:row-span-2 xl:row-start-1">
          <div className="xl:sticky xl:top-[calc(var(--header-h)+1rem)]">
            <Booth signedIn={signedIn} take={take} />
          </div>
        </div>
        <section id="vocal-workspace" aria-label="Workspace" className="min-w-0 scroll-mt-20 rounded-2xl border border-border bg-surface p-3 sm:p-4 xl:col-start-1 xl:row-start-2">
          <div className="mb-3 flex gap-1 rounded-full bg-surface-raised p-1" role="tablist" aria-label="Workspace">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full px-2 text-xs font-semibold transition-colors sm:text-sm ${
                  tab === t.id ? "bg-vocals text-white shadow-sm" : "text-muted hover:text-foreground"
                }`}
              >
                <t.icon className="shrink-0" />
                <span className="truncate max-sm:hidden">{t.label}</span>
                <span className="sm:hidden">{t.short}</span>
                {t.id === "takes" && takes > 0 && <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${tab === t.id ? "bg-white/25" : "bg-foreground/10"}`}>{takes}</span>}
              </button>
            ))}
          </div>
          <div role="tabpanel">
            {tab === "lyrics" && <LyricsTools stage onSing={toBooth} />}
            {tab === "takes" && <TakesPanel onRecord={toBooth} />}
            {tab === "mix" && <VocalMixer />}
            {tab === "songs" && <SongFinder />}
          </div>
        </section>
      </div>
    </div>
  );
}

/** The recorder and the levels to sing over, together. */
function Booth({ signedIn, take }: { signedIn: boolean; take: "idle" | "recording" | "review" }) {
  return (
    <section
      id="vocal-booth"
      aria-label="Booth"
      className={`flex flex-col gap-4 rounded-2xl border bg-surface p-3 sm:p-4 ${take === "recording" ? "border-danger/60" : "border-vocals/30"}`}
    >
      <div className="flex items-center gap-2">
        <Mic className="text-vocals" />
        <h2 className="text-sm font-bold">Booth</h2>
        {take !== "idle" && (
          <span className="ms-auto flex items-center gap-1 rounded-full bg-danger/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-danger">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" /> {take === "recording" ? "Recording" : "Review"}
          </span>
        )}
      </div>
      <RecordTab signedIn={signedIn} compact />
      <div className="border-t border-border pt-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">In your headphones</p>
        <QuickLevels />
      </div>
    </section>
  );
}
