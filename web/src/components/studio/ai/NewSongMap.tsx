"use client";

import { memo, useState } from "react";
import { ArrowDown, Minus, Plus, RefreshCw, Sparkles, Undo2 } from "lucide-react";
import type { NewSongMap as Map } from "@/lib/client/aiIdeas";
import type { NsTweaks } from "@/lib/client/newSong";
import { useStudioStore } from "@/lib/client/studioStore";
import { clock } from "./ui";

// The song map of a new song from everything: its parts across (drops
// marked), a row for each song's vocal and music showing where it's heard,
// the line sung in each part, and why each part is what it is. Tap a part
// to have another singer sing it, put it over another beat, or try it
// again; under the map, the whole song longer or shorter, more of one
// singer, the drops on another beat. Every change can be taken back.

const COLOURS = ["var(--vocals)", "var(--beat)", "var(--brand)", "#f59e0b"];

/** The map's earlier changes, for Undo — outlives the map itself (see AiProducer's `remembered`). */
const undoSteps: { past: NsTweaks[] } = { past: [] };

/** A different mix: the last new song's Undo steps mean nothing for it. */
export function forgetNewSongUndo() {
  undoSteps.past = [];
}

function Playhead({ seconds }: { seconds: number }) {
  const playhead = useStudioStore((s) => s.playhead);
  return <span className="pointer-events-none absolute inset-y-0 w-0.5 bg-foreground/80" style={{ left: `${(Math.min(playhead, seconds) / seconds) * 100}%` }} aria-hidden />;
}

export default memo(function NewSongMap({ map, tweaks, onTweak, busy }: { map: Map; tweaks: NsTweaks; onTweak: (next: NsTweaks) => void; busy: boolean }) {
  const { plan, names, lines } = map;
  const [open, setOpen] = useState<number | null>(null);
  // Kept outside the map: closing the AI panel (or leaving the Studio) and coming back keeps Undo working.
  const [past, setPastNow] = useState<NsTweaks[]>(() => undoSteps.past);
  const setPast = (next: (p: NsTweaks[]) => NsTweaks[]) =>
    setPastNow((p) => {
      undoSteps.past = next(p);
      return undoSteps.past;
    });
  const barSec = 240 / plan.bpm;
  const pct = (bars: number) => `${(bars / plan.bars) * 100}%`;
  const used = plan.parts.filter((p) => p.used);
  const singers = used.filter((p) => p.kind === "vocal");
  const beats = used.filter((p) => p.kind === "beat");
  // A row per song: its vocal and its music, in one colour.
  const songIds = [...new Set(used.map((p) => p.song))];
  const colourOf = (song: string) => COLOURS[songIds.indexOf(song) % COLOURS.length];

  const change = (next: NsTweaks) => {
    setPast((p) => [...p.slice(-19), tweaks]);
    onTweak(next);
  };
  const undo = () => {
    const last = past[past.length - 1];
    if (!last) return;
    setPast((p) => p.slice(0, -1));
    onTweak(last);
  };
  const swap = (index: number, patch: { vocal?: string; beat?: string }) => change({ ...tweaks, swaps: { ...tweaks.swaps, [index]: { ...tweaks.swaps?.[index], ...patch } } });
  const slot = open !== null ? plan.slots[open] : null;
  const button = "flex h-9 items-center gap-1 rounded-lg border border-border px-2.5 text-[11px] font-semibold text-muted transition-colors hover:border-brand hover:text-foreground disabled:opacity-40";

  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-bold">
            <Sparkles className="text-brand-strong" /> Song map
          </h3>
          <p className="text-[11px] text-muted">
            {clock(plan.seconds)} · {Math.round(plan.bpm)} BPM · {plan.slots.filter((s) => s.drop).length} drops · tap a part to change it
          </p>
        </div>
        <button onClick={undo} disabled={!past.length || busy} className={button} title="Take back the last change to the song">
          <Undo2 className="h-3.5 w-3.5" /> Undo
        </button>
      </div>

      <div className="mt-2.5 flex select-none flex-col gap-1">
        {/* The parts across, drops marked */}
        <div className="flex gap-2">
          <span className="w-20 shrink-0" />
          <div className="relative flex h-8 flex-1">
            {plan.slots.map((s, i) => (
              <button
                key={i}
                onClick={() => setOpen(open === i ? null : i)}
                aria-pressed={open === i}
                className={`relative flex h-full min-w-0 items-center justify-center overflow-hidden border-r border-background px-0.5 text-[9.5px] font-semibold leading-tight transition-colors ${
                  open === i ? "bg-brand text-white" : s.drop ? "bg-vocals/25 text-foreground hover:bg-vocals/40" : "bg-surface-raised text-muted hover:text-foreground"
                }`}
                style={{ width: pct(s.bars) }}
                title={`${clock(s.start * barSec)} ${s.label} — ${s.why}`}
              >
                {s.drop && <ArrowDown className="absolute left-0.5 top-0.5 h-2.5 w-2.5 text-vocals" aria-label="drop" />}
                <span className="truncate">{s.label.replace("Final chorus", "Final")}</span>
              </button>
            ))}
          </div>
        </div>
        {/* A row per song: where its vocal sings, where its music plays */}
        {songIds.flatMap((song) =>
          (["vocal", "beat"] as const).map((kind) => {
            const part = used.find((p) => p.song === song && p.kind === kind);
            if (!part) return null;
            return (
              <div key={`${song}-${kind}`} className="flex items-center gap-2">
                <span className="w-20 shrink-0 truncate text-[10px]" title={names[part.id] ?? song}>
                  <span className="font-semibold">{kind === "vocal" ? "Vocal" : "Music"}</span> <span className="text-muted">{song}</span>
                </span>
                <div className="relative h-4 flex-1 overflow-hidden rounded bg-background/60">
                  {plan.slots.flatMap((s, i) =>
                    kind === "beat"
                      ? s.beat?.id === part.id
                        ? [<span key={i} className="absolute inset-y-0.5 rounded-[3px]" style={{ left: pct(s.start), width: pct(s.bars - (s.build ? 1 : 0)), background: colourOf(song), opacity: 0.55 }} />]
                        : []
                      : s.vocals
                          .filter((v) => v.id === part.id)
                          .map((v, n) => <span key={`${i}-${n}`} className="absolute inset-y-0.5 rounded-[3px]" style={{ left: pct(s.start + v.at), width: pct(v.bars), background: colourOf(song), opacity: 0.95 }} />)
                  )}
                  <Playhead seconds={plan.seconds} />
                </div>
              </div>
            );
          })
        )}
        {/* What's sung in each part */}
        <div className="flex gap-2">
          <span className="w-20 shrink-0 text-[10px] text-muted">Lyrics</span>
          <div className="flex flex-1">
            {plan.slots.map((s, i) => (
              <span key={i} dir="auto" className="min-w-0 truncate border-r border-transparent px-0.5 text-[9.5px] italic text-muted" style={{ width: pct(s.bars) }} title={lines[i] || undefined}>
                {lines[i] || ""}
              </span>
            ))}
          </div>
        </div>
        <div className="flex justify-between pl-[5.5rem] text-[9.5px] tabular-nums text-muted" aria-hidden>
          <span>0:00</span>
          <span>{clock(plan.seconds)}</span>
        </div>
      </div>

      {slot && open !== null && (
        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-border bg-background/60 p-2.5 text-xs">
          <p>
            <span className="font-semibold">
              {clock(slot.start * barSec)} {slot.label}
            </span>{" "}
            <span className="text-muted">— {slot.why}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {slot.name !== "Intro" && slot.name !== "Outro" && singers.length > 1 && (
              <label className="flex items-center gap-1.5">
                <span className="text-muted">Sung by</span>
                <select value={slot.vocals[0]?.id ?? ""} onChange={(e) => swap(open, { vocal: e.target.value })} disabled={busy} className="h-9 rounded-lg border border-border bg-background px-2 text-xs max-lg:text-base">
                  {singers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.song}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {beats.length > 1 && slot.beat && (
              <label className="flex items-center gap-1.5">
                <span className="text-muted">Over</span>
                <select value={slot.beat.id} onChange={(e) => swap(open, { beat: e.target.value })} disabled={busy} className="h-9 rounded-lg border border-border bg-background px-2 text-xs max-lg:text-base">
                  {beats.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.song}&apos;s music
                    </option>
                  ))}
                </select>
              </label>
            )}
            {(singers.length > 1 || beats.length > 1) && (
              <button
                onClick={() => {
                  // Another go at this part: the next singer and the next beat round.
                  const nextOf = (list: { id: string }[], id: string | undefined) => list[(list.findIndex((p) => p.id === id) + 1) % list.length]?.id;
                  swap(open, {
                    ...(slot.vocals.length && singers.length > 1 ? { vocal: nextOf(singers, slot.vocals[0].id) } : {}),
                    ...(slot.beat && beats.length > 1 ? { beat: nextOf(beats, slot.beat.id) } : {}),
                  });
                }}
                disabled={busy}
                className={button}
              >
                <RefreshCw className="h-3.5 w-3.5" /> Try this part again
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={() => change({ ...tweaks, length: tweaks.length === -1 ? 0 : -1, swaps: {} })} disabled={busy || tweaks.length === -1} className={button} title="A verse and chorus fewer">
          <Minus className="h-3.5 w-3.5" /> Shorter
        </button>
        <button onClick={() => change({ ...tweaks, length: tweaks.length === 1 ? 0 : 1, swaps: {} })} disabled={busy || tweaks.length === 1} className={button} title="A verse and chorus more">
          <Plus className="h-3.5 w-3.5" /> Longer
        </button>
        {singers.length > 1 && (
          <label className="flex items-center gap-1.5 text-[11px]">
            <span className="text-muted">More of</span>
            <select value={tweaks.favour ?? ""} onChange={(e) => change({ ...tweaks, favour: e.target.value || undefined, swaps: {} })} disabled={busy} className="h-9 rounded-lg border border-border bg-background px-2 text-xs max-lg:text-base">
              <option value="">everyone</option>
              {singers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.song}
                </option>
              ))}
            </select>
          </label>
        )}
        {beats.length > 1 && (
          <label className="flex items-center gap-1.5 text-[11px]">
            <span className="text-muted">Drops on</span>
            <select value={tweaks.dropBeat ?? plan.slots.find((s) => s.drop)?.beat?.id ?? ""} onChange={(e) => change({ ...tweaks, dropBeat: e.target.value })} disabled={busy} className="h-9 rounded-lg border border-border bg-background px-2 text-xs max-lg:text-base">
              {beats.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.song}&apos;s music
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {plan.notes.length > 0 && (
        <ul className="mt-2.5 flex flex-col gap-0.5 text-[11px] text-muted">
          {plan.notes.map((n, i) => (
            <li key={i}>· {n}</li>
          ))}
        </ul>
      )}
    </div>
  );
});
