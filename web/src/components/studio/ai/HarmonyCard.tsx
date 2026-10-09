"use client";

import { memo, useMemo } from "react";
import { Music } from "lucide-react";
import { harmonyOf, keysNow, type Session } from "@/lib/client/aiIdeas";
import { adviseShift, harmonyStatus } from "@/lib/client/harmony";
import { camelotCode, keyFit, keyLabel } from "@/lib/client/musicKey";
import type { StudioLane } from "@/lib/client/studioStore";

// Does the vocal sound in tune over the beat? Not two key labels compared
// — the Studio listens: every note the vocal sings, against the chord the
// beat plays right then. The bar says how many sung notes sit in the
// chords now; the chart, how many would at every pitch the vocal could be
// moved to — tap one to hear the vocal there.

const FIT_WORDS = {
  same: "Same key",
  relative: "Same notes (relative keys)",
  neighbour: "Neighbours — 6 of 7 notes shared",
  far: "Two steps apart — some notes rub",
  clash: "Clashing keys",
} as const;

const STATUS_COLOR = { good: "var(--success)", warn: "#fbbf24", bad: "var(--danger)" } as const;

export default memo(function HarmonyCard({
  session,
  lanes,
  onTryShift,
  disabled,
}: {
  session: Session;
  /** The mix as it sounds now (what's being tried included). */
  lanes: StudioLane[];
  /** Moves the vocal by `shift` semitones from where it is now (tried, with a switch). */
  onTryShift: (shift: number) => void;
  disabled: boolean;
}) {
  const { pair } = session;
  const vocal = session.vocal ? lanes.find((l) => l.laneId === session.vocal!.laneId) : undefined;
  const beat = pair ? lanes.find((l) => l.laneId === pair.beatLaneId) : undefined;
  const scan = useMemo(() => (vocal && beat ? harmonyOf(session, { vocal, beat }) : null), [session, vocal, beat]);
  if (!pair || !vocal) {
    return <p className="rounded-xl border border-dashed border-border p-3 text-[11px] text-muted">Harmony needs a vocal and a beat the AI could match.</p>;
  }
  // With the beat swapped for its parts (a drop being tried), its drums carry its timing — and its key, as heard.
  const beatNow = beat ?? lanes.find((l) => l.laneId.startsWith(`${pair.beatLaneId}~`));
  const keys = beatNow ? keysNow(pair, vocal, beatNow) : { vocalKey: pair.vocalKey, beatKey: pair.beatKey };
  const fit = keyFit(keys.vocalKey, keys.beatKey);
  const status = scan ? harmonyStatus(scan.now) : fit === "clash" ? "bad" : fit === "far" ? "warn" : "good";
  const advice = scan ? adviseShift(scan) : null;
  const shifts = scan ? [...scan.byShift.entries()].sort((a, b) => a[0] - b[0]) : [];
  const top = Math.max(0.01, ...shifts.map(([, h]) => h.inChord));

  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-bold">
          <Music className="text-brand-strong" /> In tune?
        </h3>
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color: STATUS_COLOR[status], background: `color-mix(in srgb, ${STATUS_COLOR[status]} 15%, transparent)` }}>
          {status === "good" ? "In tune" : status === "warn" ? "Some lines rub" : "Out of tune"}
        </span>
      </div>

      <div className="mt-2.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
        <div className="rounded-xl bg-vocals/10 px-2 py-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-vocals">Vocal</p>
          <p className="text-sm font-bold">{keyLabel(keys.vocalKey)}</p>
          <p className="font-mono text-[10px] text-muted">
            {camelotCode(keys.vocalKey)}
            {vocal.pitchSemitones ? ` · ${vocal.pitchSemitones > 0 ? "+" : ""}${vocal.pitchSemitones} st` : " · as sung"}
          </p>
        </div>
        <span className="text-[10px] font-semibold text-muted">over</span>
        <div className="rounded-xl bg-beat/10 px-2 py-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-beat">Beat</p>
          <p className="text-sm font-bold">{keyLabel(keys.beatKey)}</p>
          <p className="font-mono text-[10px] text-muted">{camelotCode(keys.beatKey)}</p>
        </div>
      </div>
      <p className="mt-1.5 text-center text-[11px] text-muted">{FIT_WORDS[fit]}</p>

      {scan ? (
        <>
          <div className="mt-3">
            <div className="flex items-baseline justify-between text-[11px]">
              <span className="font-semibold">Sung notes in the beat&apos;s chords</span>
              <span className="font-bold tabular-nums" style={{ color: STATUS_COLOR[status] }}>
                {Math.round(scan.now.inChord * 100)}%
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-raised">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.round(scan.now.inChord * 100)}%`, background: STATUS_COLOR[status] }} />
            </div>
            {scan.now.clash > 0.05 && <p className="mt-0.5 text-[10px] text-muted">{Math.round(scan.now.clash * 100)}% rub a semitone against a loud chord note</p>}
          </div>
          <div className="mt-3">
            <p className="text-[11px] font-semibold">The vocal at another pitch — tap to hear it</p>
            <div className="mt-1.5 flex h-20 items-end gap-0.5" role="group" aria-label="Notes in the chords at each pitch shift">
              {shifts.map(([shift, h]) => {
                const now = shift === 0;
                const best = advice && advice.shift === shift && shift !== 0;
                return (
                  <button
                    key={shift}
                    type="button"
                    disabled={disabled || now}
                    onClick={() => onTryShift(shift)}
                    title={`${shift > 0 ? "+" : ""}${shift} semitones: ${Math.round(h.inChord * 100)}% of the notes in the chords${best ? " — the best fit" : ""}`}
                    className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-0.5 disabled:cursor-default"
                  >
                    <span
                      className={`w-full rounded-t-[3px] transition-all ${now ? "ring-2 ring-foreground/70" : "group-hover:brightness-125"}`}
                      style={{
                        height: `${Math.max(6, (h.inChord / top) * 100)}%`,
                        background: best ? "var(--success)" : now ? "var(--brand)" : "color-mix(in srgb, var(--brand) 40%, var(--surface-raised))",
                      }}
                    />
                    <span className={`text-[9px] tabular-nums ${now ? "font-bold text-foreground" : best ? "font-bold text-success" : "text-muted"}`}>{shift > 0 ? `+${shift}` : shift}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[10px] text-muted">
              {advice?.shift
                ? `Best: ${advice.shift > 0 ? "+" : ""}${advice.shift} semitones (${Math.round(advice.best.inChord * 100)}% in the chords). Each step bends the voice a little — small shifts sound most natural.`
                : "Where it is now is the best fit — moving it wouldn't help."}
            </p>
          </div>
        </>
      ) : (
        <p className="mt-2 text-[10.5px] text-muted">
          No clear held notes to measure (rap, speech, or very little singing) — the key labels above are what there is to go by.
        </p>
      )}
    </div>
  );
});
