"use client";

import { AudioWaveform, Check, SlidersHorizontal, Sparkles, Wand2 } from "lucide-react";
import { useStudioView, type StudioMode } from "@/lib/client/studioView";

// Who the Studio is laid out for. Someone who's never made music gets big
// cards, one per line of the song, with the AI producer doing the hard
// parts; a producer gets the whole DAW. Asked once (remembered in this
// browser), switchable any time from the Studio's header.

const MODES: {
  id: StudioMode;
  title: string;
  who: string;
  icon: typeof Wand2;
  points: string[];
  accent: string;
}[] = [
  {
    id: "easy",
    title: "Easy",
    who: "I'm new to making music",
    icon: Wand2,
    points: ["Big, simple controls — one card per line", "The AI makes your lines fit and tells you what it did", "Tap to hear, switch anything on or off"],
    accent: "from-vocals to-brand",
  },
  {
    id: "pro",
    title: "Producer",
    who: "I know my way around a DAW",
    icon: SlidersHorizontal,
    points: ["Timeline with clips, cuts, automation and shortcuts", "Mixer with faders, meters, EQ, compression and sends", "Every line — vocals, drums, bass, melody — on its own lane"],
    accent: "from-beat to-brand",
  },
];

/** The first-visit question: which Studio do you want? */
export function ModeChooser() {
  const setMode = useStudioView((s) => s.setMode);
  return (
    <section aria-labelledby="mode-title" className="mx-auto flex w-full max-w-3xl flex-col gap-4 py-4 sm:py-8">
      <div className="text-center">
        <p className="flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-strong">
          <AudioWaveform /> Welcome to the Studio
        </p>
        <h2 id="mode-title" className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          How do you want to make music?
        </h2>
        <p className="mt-1.5 text-sm text-muted">Pick the Studio that fits you — you can switch any time from the top of the page.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className="group flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 text-left transition-all hover:-translate-y-0.5 hover:border-brand hover:shadow-[0_0_40px_-16px_var(--brand)] active:scale-[0.99]"
          >
            <span className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${m.accent} text-2xl text-white`}>
              <m.icon />
            </span>
            <span>
              <span className="block text-lg font-bold">{m.title}</span>
              <span className="block text-sm text-muted">{m.who}</span>
            </span>
            <ul className="flex flex-col gap-1.5 text-[13px]">
              {m.points.map((p) => (
                <li key={p} className="flex items-start gap-2">
                  <Check className="mt-0.5 shrink-0 text-success" />
                  {p}
                </li>
              ))}
            </ul>
            <span className="mt-auto flex h-10 items-center justify-center gap-1.5 rounded-xl bg-brand text-sm font-semibold text-white group-hover:bg-brand-strong">
              {m.id === "easy" ? <Sparkles /> : <SlidersHorizontal />} Start in {m.title}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Easy or Producer, in the Studio's header. */
export function ModeSwitch() {
  const mode = useStudioView((s) => s.mode);
  const setMode = useStudioView((s) => s.setMode);
  if (!mode) return null;
  return (
    <div className="flex shrink-0 overflow-hidden rounded-lg border border-border text-xs font-semibold" role="radiogroup" aria-label="Studio mode">
      {MODES.map((m) => (
        <button
          key={m.id}
          role="radio"
          aria-checked={mode === m.id}
          onClick={() => setMode(m.id)}
          title={m.who}
          className={`flex h-8 items-center gap-1 px-2.5 transition-colors ${mode === m.id ? "bg-brand text-white" : "text-muted hover:text-foreground"}`}
        >
          <m.icon />
          <span className={mode === m.id ? "" : "max-sm:hidden"}>{m.title}</span>
        </button>
      ))}
    </div>
  );
}
