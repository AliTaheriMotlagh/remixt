"use client";

import { useRef, useState } from "react";
import { Crosshair, DoorOpen, Drum, Flag, ListMusic, Mic, Minus, Music, Play, Plus, Repeat, Zap, type LucideIcon } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { SectionPick } from "@/lib/client/aiIdeas";
import { clock, MIN_SECTION, originOf, sectionChoices, useAiScope, WHOLE_SONG, type Scope, type ScopeRange } from "@/lib/client/aiScope";
import { audioEngine } from "@/lib/client/audioEngine";
import { startNewStep } from "@/lib/client/studioHistory";
import { clipEnd, clipStart, clipsOf } from "@/lib/client/clipEdit";
import { beatLength, laneName, useStudioStore, type StudioLane } from "@/lib/client/studioStore";
import { kindColor } from "@/lib/stemKinds";

// What the AI producer may change: the whole song or one section of it,
// and every lane or only some. Every idea, fix and style follows it; the
// rest of the mix stays exactly as it is.
//
// A section is picked on a small map of the song — drag across it (it
// snaps to bars), drag the section to move it or its edges to resize it,
// or step either edge a bar at a time — or in one tap from the parts the
// AI found: the drop, where the vocal comes in, the chorus, the ending,
// the stretch that sounds out of tune, the loop and the markers.

const PICK_ICONS: Record<SectionPick["kind"] | "loop" | "marker" | "selection" | "bars", LucideIcon> = {
  part: ListMusic,
  drop: Zap,
  vocal: Mic,
  intro: DoorOpen,
  ending: Flag,
  tune: Music,
  loop: Repeat,
  marker: Flag,
  selection: Crosshair,
  bars: Play,
};

type Pick = { id: string; name: string; icon: LucideIcon; start: number; end: number; warn?: boolean };

type Drag = { mode: "new" | "move" | "start" | "end"; anchor: number; from: ScopeRange; id: number };

export default function AiScopeBar({
  lanes,
  suggestions,
  onChange,
  disabled,
  hideLanes = false,
}: {
  lanes: StudioLane[];
  suggestions: SectionPick[];
  onChange: (scope: Scope) => void;
  disabled: boolean;
  /** Leave picking lanes to someone else (the AI producer's line-sync list). */
  hideLanes?: boolean;
}) {
  const scope = useAiScope((s) => s.scope);
  const view = useStudioStore(
    useShallow((s) => ({
      loopStart: s.loopStart,
      loopEnd: s.loopEnd,
      loopEnabled: s.loopEnabled,
      markers: s.markers,
      selectedClips: s.selectedClips,
      projectBpm: s.projectBpm,
      duration: s.duration,
    }))
  );
  const [showLanes, setShowLanes] = useState(false);
  /** The section while it's being dragged out (picked when the drag ends). */
  const [draft, setDraft] = useState<ScopeRange | null>(null);
  const draftRef = useRef<ScopeRange | null>(null);
  const drag = useRef<Drag | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  const bar = beatLength(view.projectBpm) * 4;
  const span = Math.max(view.duration, bar * 4);
  const range = draft ?? scope.range;
  const own = lanes.filter((l) => originOf(l.laneId) === l.laneId);
  const picked = new Set(scope.lanes ?? []);

  // The parts the AI found first, then the person's own: the loop, selected clips, markers, the next 8 bars.
  const picks: Pick[] = [
    ...suggestions.map((p) => ({ id: p.id, name: p.name, icon: PICK_ICONS[p.kind], start: p.start, end: p.end, warn: p.kind === "tune" })),
    ...sectionChoices({ ...view, lanes, playhead: useStudioStore.getState().playhead }).map((c) => {
      const kind = c.id.startsWith("marker:") ? "marker" : (c.id as "loop" | "selection" | "bars");
      return { id: c.id, name: c.id === "bars" ? "8 bars from here" : c.label.replace(/ \d+:\d\d–\d+:\d\d$/, ""), icon: PICK_ICONS[kind], start: c.start, end: c.end };
    }),
  ];
  const same = (a: { start: number; end: number }, b: { start: number; end: number }) => Math.abs(a.start - b.start) < 0.05 && Math.abs(a.end - b.end) < 0.05;
  const current = range ? picks.find((p) => same(p, range)) : undefined;

  /** A range with its name: the part it is, or the bars it covers. */
  const named = (start: number, end: number): ScopeRange => {
    const pick = picks.find((p) => same(p, { start, end }));
    const name = pick?.name ?? `Bars ${Math.round(start / bar) + 1}–${Math.round(end / bar)}`;
    return { start, end, label: `${name} ${clock(start)}–${clock(end)}` };
  };
  const choose = (start: number, end: number) => {
    draftRef.current = null;
    setDraft(null);
    useAiScope.setState({ preview: null });
    onChange({ ...scope, range: named(start, end) });
  };

  // --- The map: drag to pick ---------------------------------------------------------------
  const timeAt = (clientX: number) => {
    const rect = stripRef.current!.getBoundingClientRect();
    return Math.min(span, Math.max(0, ((clientX - rect.left) / rect.width) * span));
  };
  const snap = (t: number) => Math.min(span, Math.max(0, Math.round(t / bar) * bar));
  const show = (next: ScopeRange) => {
    draftRef.current = next;
    setDraft(next);
    useAiScope.setState({ preview: next });
  };
  const onDown = (e: React.PointerEvent) => {
    if (disabled) return;
    const t = timeAt(e.clientX);
    const edge = (e.target as HTMLElement).dataset.edge as "start" | "end" | undefined;
    const from = scope.range ?? { start: snap(t), end: snap(t), label: "" };
    const inside = scope.range && t > scope.range.start && t < scope.range.end;
    drag.current = { mode: edge ?? (inside ? "move" : "new"), anchor: t, from, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (!edge && !inside) show({ start: snap(t), end: Math.min(span, snap(t) + bar), label: "" });
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const t = timeAt(e.clientX);
    const { from } = d;
    let start = from.start;
    let end = from.end;
    if (d.mode === "new") {
      const a = snap(d.anchor);
      const b = snap(t);
      start = Math.min(a, b);
      end = Math.max(a, b, start + bar);
    } else if (d.mode === "move") {
      const length = from.end - from.start;
      start = Math.min(span - length, Math.max(0, snap(from.start + t - d.anchor)));
      end = start + length;
    } else if (d.mode === "start") {
      start = Math.min(from.end - bar, snap(t));
    } else {
      end = Math.max(from.start + bar, snap(t));
    }
    show({ start: Math.max(0, start), end: Math.min(span, end), label: "" });
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const next = draftRef.current;
    if (next && next.end - next.start >= MIN_SECTION && !(scope.range && same(next, scope.range))) choose(next.start, next.end);
    else {
      draftRef.current = null;
      setDraft(null);
      useAiScope.setState({ preview: null });
    }
  };

  /** One edge a bar earlier or later (a section is always at least a bar). */
  const step = (edge: "start" | "end", bars: number) => {
    if (!scope.range) return;
    const { start, end } = scope.range;
    if (edge === "start") choose(Math.min(end - bar, Math.max(0, start + bars * bar)), end);
    else choose(start, Math.max(start + bar, Math.min(span, end + bars * bar)));
  };

  const hear = () => {
    if (!scope.range) return;
    audioEngine.seek(scope.range.start);
    if (!useStudioStore.getState().isPlaying) void audioEngine.play({ join: true }).catch(() => {});
  };
  const looping = !!scope.range && view.loopEnabled && same({ start: view.loopStart, end: view.loopEnd }, scope.range);
  const loop = () => {
    if (!scope.range) return;
    startNewStep();
    useStudioStore.getState().setLoop(looping ? { enabled: false } : { enabled: true, start: scope.range.start, end: scope.range.end });
  };

  const toggleLane = (laneId: string) => {
    const next = new Set(picked);
    if (next.has(laneId)) next.delete(laneId);
    else next.add(laneId);
    const all = own.every((l) => next.has(l.laneId));
    onChange({ ...scope, lanes: next.size === 0 || all ? null : own.map((l) => l.laneId).filter((id) => next.has(id)) });
  };

  const segment = (on: boolean) =>
    `flex flex-1 items-center justify-center gap-1 px-2 py-1.5 whitespace-nowrap transition-colors disabled:opacity-40 ${on ? "bg-brand text-white" : "text-muted hover:text-foreground"}`;
  const pct = (t: number) => `${(t / span) * 100}%`;
  const small = "flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted hover:text-foreground disabled:opacity-40";
  const lanesWord = scope.lanes ? scope.lanes.map((id) => own.find((l) => l.laneId === id)).filter(Boolean).map((l) => laneName(l!)).join(", ") : "All lanes";

  return (
    <div className={`flex flex-col gap-2.5 rounded-xl border bg-surface p-2.5 ${scope.range || scope.lanes ? "border-vocals/60" : "border-border"}`} aria-label="What the AI works on">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[11px] font-semibold text-muted">
          <Crosshair /> AI works on
        </span>
        <div className="flex flex-1 overflow-hidden rounded-lg border border-border text-[11px] font-semibold" role="group">
          <button type="button" className={segment(!scope.range)} aria-pressed={!scope.range} disabled={disabled} onClick={() => scope.range && onChange({ ...scope, range: null })}>
            Whole song
          </button>
          <button
            type="button"
            className={segment(!!scope.range)}
            aria-pressed={!!scope.range}
            disabled={disabled}
            onClick={() => {
              if (scope.range) return;
              // The most useful part to start from: the drop or a labelled part, else the 8 bars from here.
              const first = picks.find((p) => p.id === "drop") ?? picks.find((p) => p.id.startsWith("part:")) ?? picks[picks.length - 1];
              if (first) choose(first.start, first.end);
            }}
            title="Just one part of the song — pick it on the map below"
          >
            A section
          </button>
        </div>
      </div>

      {scope.range && (
        <>
          {/* The map of the song: a row per lane, where it plays; the section on top, to drag. */}
          <div
            ref={stripRef}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            className={`relative h-16 touch-none select-none overflow-hidden rounded-lg border border-border bg-background ${disabled ? "opacity-60" : "cursor-crosshair"}`}
            role="slider"
            aria-label="Section — drag to pick, drag its edges to resize"
            aria-valuemin={0}
            aria-valuemax={Math.round(span)}
            aria-valuenow={Math.round(scope.range.start)}
            aria-valuetext={scope.range.label}
          >
            {Array.from({ length: Math.floor(span / (bar * 4)) }, (_, i) => (
              <span key={i} className="pointer-events-none absolute inset-y-0 w-px bg-border/60" style={{ left: pct((i + 1) * bar * 4) }} aria-hidden />
            ))}
            <div className="pointer-events-none absolute inset-x-0 top-1.5 bottom-1.5 flex flex-col justify-center gap-1">
              {own.slice(0, 5).map((lane) => (
                <div key={lane.laneId} className="relative h-1.5">
                  {clipsOf(lane).map((clip, i) => (
                    <span
                      key={i}
                      className="absolute inset-y-0 rounded-full opacity-70"
                      style={{ left: pct(clipStart(lane, clip)), width: pct(Math.max(0.2, clipEnd(lane, clip) - clipStart(lane, clip))), background: kindColor(lane.kind) }}
                    />
                  ))}
                </div>
              ))}
            </div>
            {picks
              .filter((p) => p.warn)
              .map((p) => (
                <span key={p.id} className="pointer-events-none absolute bottom-0 h-1 bg-amber-400/80" style={{ left: pct(p.start), width: pct(p.end - p.start) }} aria-hidden />
              ))}
            {range && (
              <div className="absolute inset-y-0 cursor-grab border-y-2 border-vocals bg-vocals/20 active:cursor-grabbing" style={{ left: pct(range.start), width: pct(range.end - range.start) }}>
                <span data-edge="start" className="absolute inset-y-0 -left-2 w-4 cursor-ew-resize" aria-hidden>
                  <span className="pointer-events-none absolute inset-y-2 left-1.5 w-1 rounded-full bg-vocals" />
                </span>
                <span data-edge="end" className="absolute inset-y-0 -right-2 w-4 cursor-ew-resize" aria-hidden>
                  <span className="pointer-events-none absolute inset-y-2 right-1.5 w-1 rounded-full bg-vocals" />
                </span>
              </div>
            )}
            <Playhead span={span} />
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px]">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{current?.name ?? `Bars ${Math.round(scope.range.start / bar) + 1}–${Math.round(scope.range.end / bar)}`}</p>
              <p className="text-muted">
                {clock(range!.start)}–{clock(range!.end)} · {Math.max(1, Math.round((range!.end - range!.start) / bar))} bars
              </p>
            </div>
            <div className="flex items-center gap-1" role="group" aria-label="Start">
              <button type="button" className={small} onClick={() => step("start", -1)} disabled={disabled} aria-label="Start a bar earlier">
                <Minus />
              </button>
              <span className="w-8 text-center text-muted">Start</span>
              <button type="button" className={small} onClick={() => step("start", 1)} disabled={disabled} aria-label="Start a bar later">
                <Plus />
              </button>
            </div>
            <div className="flex items-center gap-1" role="group" aria-label="End">
              <button type="button" className={small} onClick={() => step("end", -1)} disabled={disabled} aria-label="End a bar earlier">
                <Minus />
              </button>
              <span className="w-8 text-center text-muted">End</span>
              <button type="button" className={small} onClick={() => step("end", 1)} disabled={disabled} aria-label="End a bar later">
                <Plus />
              </button>
            </div>
          </div>

          <div className="flex gap-1.5">
            <button type="button" onClick={hear} className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border py-1.5 text-[11px] font-semibold hover:border-brand">
              <Play className="fill-current" /> Hear it
            </button>
            <button
              type="button"
              onClick={loop}
              aria-pressed={looping}
              className={`flex flex-1 items-center justify-center gap-1 rounded-lg border py-1.5 text-[11px] font-semibold ${looping ? "border-brand bg-brand/15" : "border-border hover:border-brand"}`}
              title="Loop the section while you try ideas on it"
            >
              <Repeat /> {looping ? "Looping" : "Loop it"}
            </button>
          </div>

          {picks.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Jump to a part</p>
              <div className="-mx-2.5 flex gap-1.5 overflow-x-auto px-2.5 pb-0.5">
                {picks.map((p) => {
                  const on = same(p, scope.range!);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => choose(p.start, p.end)}
                      disabled={disabled}
                      aria-pressed={on}
                      className={`flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap disabled:opacity-40 ${
                        on ? "border-vocals bg-vocals/15" : p.warn ? "border-amber-400/60 text-amber-400" : "border-border text-muted hover:text-foreground"
                      }`}
                    >
                      <p.icon /> {p.name}
                      <span className="font-normal opacity-70">{clock(p.start)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {own.length > 1 && !hideLanes && (
        <div className="flex flex-col gap-1.5">
          <button type="button" onClick={() => setShowLanes((v) => !v)} aria-expanded={showLanes} className="flex items-center justify-between text-[11px] text-muted hover:text-foreground">
            <span>
              Lanes: <span className={`font-semibold ${scope.lanes ? "text-foreground" : ""}`}>{lanesWord}</span>
            </span>
            <span className="font-semibold text-brand-strong">{showLanes ? "Done" : "Choose"}</span>
          </button>
          {showLanes && (
            <div className="flex flex-wrap gap-1" role="group" aria-label="Lanes the AI may change">
              <button
                type="button"
                onClick={() => onChange({ ...scope, lanes: null })}
                disabled={disabled}
                aria-pressed={!scope.lanes}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${!scope.lanes ? "border-brand bg-brand/15" : "border-border text-muted hover:text-foreground"}`}
              >
                All lanes
              </button>
              {own.map((l) => {
                const on = picked.has(l.laneId);
                const LaneIcon = l.kind === "vocals" ? Mic : Drum;
                return (
                  <button
                    key={l.laneId}
                    type="button"
                    onClick={() => toggleLane(l.laneId)}
                    disabled={disabled}
                    aria-pressed={on}
                    className={`flex max-w-[11rem] items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${on ? "border-brand bg-brand/15" : "border-border text-muted hover:text-foreground"}`}
                  >
                    <LaneIcon className="shrink-0" style={{ color: kindColor(l.kind) }} />
                    <span className="truncate">{laneName(l)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {(scope.range || scope.lanes) && (
        <p className="flex items-center justify-between gap-2 text-[11px] text-muted">
          <span>Ideas change only this{scope.lanes ? `, on ${lanesWord}` : ""} — the rest stays as it is.</span>
          <button type="button" onClick={() => onChange(WHOLE_SONG)} disabled={disabled} className="shrink-0 font-semibold text-brand-strong hover:underline">
            Reset
          </button>
        </p>
      )}
    </div>
  );
}

/** Where the song is playing, on the map. */
function Playhead({ span }: { span: number }) {
  const playhead = useStudioStore((s) => s.playhead);
  return <span className="pointer-events-none absolute inset-y-0 w-0.5 bg-foreground/70" style={{ left: `${(Math.min(playhead, span) / span) * 100}%` }} aria-hidden />;
}
