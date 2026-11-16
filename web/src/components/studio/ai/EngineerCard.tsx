"use client";

import { memo, useMemo } from "react";
import { SlidersHorizontal } from "lucide-react";
import { BANDS, MUD, REFERENCE_SHARES, eqCurve, type EngineerPlan, type LaneDecision, type MixRole } from "@/lib/client/mixEngineer";

// What the mix engineer measured and did, as pictures: the mix's tone,
// band by band, before and after (against the shape of finished mixes);
// how far the vocal clears what's behind it where a voice is understood;
// the low-mid pile-up against its limit; and per line, its EQ curve, its
// bands before and after, and why each move was made.

const ROLE: Record<MixRole, string> = { lead: "Lead vocal", vocal: "Vocal", bass: "Bass", drums: "Drums", beat: "Beat", melody: "Melody" };
const BAND_LABEL: Record<number, string> = { 4: "Mids", 5: "Presence" };

/** The mix's tone: each band's share before (outline) and after (filled), the reference marked. */
function ToneBars({ before, after, reference }: { before: number[]; after: number[]; reference?: number[] }) {
  // Shares run roughly −30..0 dB: drawn from a −32 dB floor.
  const height = (share: number) => `${Math.max(3, Math.min(100, ((share + 32) / 32) * 100))}%`;
  return (
    <div className="flex h-16 items-end gap-1" role="img" aria-label="The mix's tone by band, before and after">
      {BANDS.map((band, b) => (
        <div key={band.name} className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
          <div className="relative h-12 w-full">
            <span className="absolute inset-x-0 bottom-0 rounded-t-[3px] border border-dashed border-muted/70" style={{ height: height(before[b]) }} title={`${band.name} before: ${before[b].toFixed(1)} dB`} />
            <span
              className="absolute inset-x-[18%] bottom-0 rounded-t-[3px]"
              style={{ height: height(after[b]), background: b === MUD && after[b] > -11 ? "var(--danger)" : "var(--brand)", opacity: 0.85 }}
              title={`${band.name} after: ${after[b].toFixed(1)} dB`}
            />
            {reference && <span className="absolute inset-x-0 h-0.5 bg-success/80" style={{ bottom: height(reference[b]) }} title={`Finished mixes: ${reference[b]} dB`} />}
          </div>
          <span className="text-[8.5px] leading-none text-muted">{band.short}</span>
        </div>
      ))}
    </div>
  );
}

/** A lane's EQ as a curve, ±12 dB, 20 Hz–20 kHz. */
function Curve({ decision }: { decision: LaneDecision }) {
  const path = useMemo(() => {
    const points = eqCurve(decision.fx, 40);
    return points.map((p, i) => `${i ? "L" : "M"}${((i / (points.length - 1)) * 100).toFixed(1)},${(20 - Math.max(-12, Math.min(12, p.db)) * (18 / 12)).toFixed(1)}`).join(" ");
  }, [decision.fx]);
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-8 w-24 shrink-0 rounded bg-background/60" role="img" aria-label="EQ curve">
      <line x1="0" x2="100" y1="20" y2="20" stroke="currentColor" className="text-border" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
      <path d={path} fill="none" stroke="var(--brand)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** A lane's bands before (outline) and after (filled), each against its own loudest. */
function LaneBands({ decision }: { decision: LaneDecision }) {
  const top = Math.max(...decision.before, ...decision.after);
  const h = (v: number) => `${Math.max(4, Math.min(100, ((v - top + 36) / 36) * 100))}%`;
  return (
    <div className="flex h-8 flex-1 items-end gap-px" role="img" aria-label={`${decision.title}: its bands before and after`}>
      {BANDS.map((band, b) => (
        <div key={band.name} className="relative h-full flex-1">
          <span className="absolute inset-x-0 bottom-0 border border-dashed border-muted/60" style={{ height: h(decision.before[b]) }} />
          <span className="absolute inset-x-[20%] bottom-0 bg-brand/80" style={{ height: h(decision.after[b]) }} title={`${band.name}: ${(decision.after[b] - decision.before[b]).toFixed(1)} dB`} />
        </div>
      ))}
    </div>
  );
}

/** How far the vocal clears the backing (dB), before → after, per band. */
function Masking({ plan }: { plan: EngineerPlan }) {
  if (!plan.masking.length) return null;
  const x = (v: number) => `${50 + Math.max(-12, Math.min(12, v)) * (50 / 12)}%`;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10.5px] font-semibold">The vocal against the backing <span className="font-normal text-muted">— right of the line, it&apos;s on top</span></p>
      {plan.masking.filter((m) => m.band !== 6).map((m) => (
        <div key={m.band} className="flex items-center gap-2 text-[10px]">
          <span className="w-14 shrink-0 text-muted">{BAND_LABEL[m.band]}</span>
          <div className="relative h-2.5 flex-1 rounded-full bg-background/60">
            <span className="absolute inset-y-0 w-px bg-muted" style={{ left: "50%" }} />
            <span className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-muted bg-surface" style={{ left: x(m.before) }} title={`Before: ${m.before.toFixed(1)} dB`} />
            <span className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${m.after >= 0 ? "bg-success" : "bg-danger"}`} style={{ left: x(m.after) }} title={`After: ${m.after.toFixed(1)} dB`} />
          </div>
          <span className="w-20 shrink-0 text-right font-mono tabular-nums">
            {m.before >= 0 ? "+" : ""}
            {m.before.toFixed(1)} → {m.after >= 0 ? "+" : ""}
            {m.after.toFixed(1)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default memo(function EngineerCard({ plan, on }: { plan: EngineerPlan; on: boolean }) {
  const muddy = plan.mud.after > plan.mud.limit;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-bold">
            <SlidersHorizontal className="text-brand-strong" /> What the engineer measured
          </h3>
          <p className="text-[11px] text-muted">{on ? "Pro mix is on: before (dashed) and now (filled)" : "What Pro mix would do: now (dashed) and after (filled)"}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${muddy ? "bg-amber-400/15 text-amber-400" : "bg-success/15 text-success"}`} title="The low mids' share of the mix (250–500 Hz)">
          Mud {plan.mud.before.toFixed(0)} → {plan.mud.after.toFixed(0)} dB
        </span>
      </div>
      <div>
        <ToneBars before={plan.mix.before} after={plan.mix.after} reference={REFERENCE_SHARES} />
        <p className="mt-1 text-[9.5px] text-muted">Each band&apos;s share of the mix · green line: finished mixes · red: low mids piling up</p>
      </div>
      <Masking plan={plan} />
      {plan.lines.length > 0 && (
        <ul className="flex list-disc flex-col gap-0.5 pl-4 text-[10.5px] leading-snug text-muted">
          {plan.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      <details className="group">
        <summary className="cursor-pointer list-none text-[11px] font-semibold text-brand-strong">
          Line by line <span className="text-muted group-open:hidden">({plan.lanes.length})</span>
        </summary>
        <div className="mt-2 flex flex-col gap-2.5">
          {plan.lanes.map((d) => (
            <div key={d.laneId} className="flex flex-col gap-1 border-t border-border pt-2">
              <div className="flex items-center gap-2 text-[11px]">
                <span className="min-w-0 flex-1 truncate font-semibold">{d.title}</span>
                <span className="shrink-0 rounded-full bg-background/60 px-1.5 text-[9.5px] text-muted">{ROLE[d.role]}</span>
                <span className="shrink-0 font-mono text-[10px] tabular-nums">{Math.round(d.volume * 100)}%</span>
              </div>
              <div className="flex items-center gap-2">
                <Curve decision={d} />
                <LaneBands decision={d} />
              </div>
              {d.reasons.length > 0 && (
                <ul className="flex flex-col gap-0.5 text-[10px] leading-snug text-muted">
                  {d.reasons.map((r) => (
                    <li key={r}>· {r}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
});
