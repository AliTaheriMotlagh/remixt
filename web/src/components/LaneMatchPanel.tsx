"use client";

import { useState } from "react";
import { SlidersVertical } from "lucide-react";
import {
  DEFAULT_OPTIONS,
  STRUCTURES,
  planFromOptions,
  type Entry,
  type MatchOptions,
} from "@/lib/client/matchOptions";
import { applyPairPlan, preparePair } from "@/lib/client/pairMatch";
import { FX_PRESETS, useStudioStore, type LanePatch, type StudioLane } from "@/lib/client/studioStore";
import { startNewStep } from "@/lib/client/studioHistory";
import { useKeepScreenOn } from "@/lib/client/wakeLock";

/**
 * The two lanes as they were before the first Apply, and as Apply left
 * them. "Apply again" and "undo" go back to the first only while the lanes
 * are still exactly the second — any edit in between (or the lanes being
 * swapped for others) makes the current mix the new starting point, so
 * nothing the user did since is thrown away.
 */
type Baseline = { patches: Record<string, LanePatch>; projectBpm: number; after: StudioLane[] | null };

function untouchedSince(base: Baseline | null, laneIds: string[]): base is Baseline {
  if (!base?.after) return false;
  const lanes = useStudioStore.getState().lanes;
  return laneIds.every((id) => !!base.patches[id] && lanes.find((l) => l.laneId === id) === base.after!.find((l) => l.laneId === id));
}

function snapshot(lane: StudioLane): LanePatch {
  return {
    bpm: lane.bpm,
    tempoRatio: lane.tempoRatio,
    offsetSeconds: lane.offsetSeconds,
    clips: lane.clips,
    volume: lane.volume,
    fx: { ...lane.fx },
  };
}

function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-muted">
      {label}
      <select
        value={String(value)}
        onChange={(e) => {
          const picked = options.find((o) => String(o.value) === e.target.value);
          if (picked) onChange(picked.value);
        }}
        className="input !py-1 text-xs normal-case tracking-normal"
        title={options.find((o) => o.value === value)?.hint}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)} title={o.hint}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * A lane's Match panel: pick the lane of the other kind, choose how they
 * should fit — tempo, when the vocal comes in, the song's shape, a timing
 * fix, level and sound — and apply. Apply again with other choices to
 * compare; undo puts both lanes back.
 */
export default function LaneMatchPanel({ lane }: { lane: StudioLane }) {
  const lanes = useStudioStore((s) => s.lanes);
  const applyLanePatches = useStudioStore((s) => s.applyLanePatches);
  // A vocal pairs with any backing lane (beat, drums, bass, melody), and back.
  const partners = lanes.filter((l) => (l.kind === "vocals") !== (lane.kind === "vocals"));
  const [partnerId, setPartnerId] = useState("");
  const [options, setOptions] = useState<MatchOptions>(DEFAULT_OPTIONS);
  const [busy, setBusy] = useState(false);
  useKeepScreenOn("lane-match", busy);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string[] | null>(null);
  const [baseline, setBaseline] = useState<Baseline | null>(null);

  const partner = partners.find((l) => l.laneId === partnerId) ?? partners[0];
  const [vocal, beat] = lane.kind === "vocals" ? [lane, partner] : [partner, lane];
  const set = <K extends keyof MatchOptions>(key: K, value: MatchOptions[K]) =>
    setOptions((current) => ({ ...current, [key]: value }));

  async function handleApply() {
    if (!vocal || !beat) return;
    setBusy(true);
    setError(null);
    try {
      // Each try starts from the lanes as they were before the first one —
      // as long as nothing else has touched them since.
      let base: Baseline;
      if (untouchedSince(baseline, [vocal.laneId, beat.laneId])) {
        base = baseline;
        applyLanePatches(base.patches, base.projectBpm);
      } else {
        base = {
          patches: { [vocal.laneId]: snapshot(vocal), [beat.laneId]: snapshot(beat) },
          projectBpm: useStudioStore.getState().projectBpm,
          after: null,
        };
      }
      const ctx = await preparePair(vocal.laneId, beat.laneId);
      const { plan, notes } = planFromOptions(ctx, options);
      startNewStep();
      const lines = applyPairPlan(ctx, plan);
      startNewStep();
      setBaseline({ ...base, after: useStudioStore.getState().lanes });
      setResult([...notes, ...lines]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't match these lanes");
    } finally {
      setBusy(false);
    }
  }

  function handleUndo() {
    if (!vocal || !beat || !untouchedSince(baseline, [vocal.laneId, beat.laneId])) return;
    applyLanePatches(baseline.patches, baseline.projectBpm);
    setBaseline(null);
    setResult(null);
  }

  const vocalPresets = FX_PRESETS.filter((p) => p.kind === "vocals");
  const beatPresets = FX_PRESETS.filter((p) => p.kind === "beat");

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-brand/40 bg-brand/10 p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold">
          <SlidersVertical /> Match
        </span>
        {partners.length === 0 ? (
          <span className="text-muted">Add a {lane.kind === "vocals" ? "beat" : "vocal"} lane to match this one with.</span>
        ) : (
          <label className="flex items-center gap-1.5 text-muted">
            with
            <select
              value={partner?.laneId ?? ""}
              onChange={(e) => setPartnerId(e.target.value)}
              className="input !w-auto !py-0.5 text-xs"
            >
              {partners.map((p) => (
                <option key={p.laneId} value={p.laneId}>
                  {p.trackTitle}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {partners.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Choice
              label="Tempo"
              value={options.tempo}
              onChange={(v) => set("tempo", v)}
              options={[
                { value: "beat", label: "Keep the beat's tempo", hint: "The vocal is stretched to the beat" },
                { value: "vocal", label: "Keep the vocal's tempo", hint: "The beat is stretched to the vocal" },
                { value: "middle", label: "Meet in the middle", hint: "Both stretched halfway — least change for each" },
              ]}
            />
            <Choice<Entry>
              label="Vocal comes in"
              value={options.entry}
              onChange={(v) => set("entry", v)}
              options={[
                { value: "auto", label: "After the intro" },
                { value: 0, label: "Right away" },
                { value: 4, label: "After 4 bars" },
                { value: 8, label: "After 8 bars" },
                { value: 16, label: "After 16 bars" },
              ]}
            />
            <Choice
              label="Song shape"
              value={options.structure}
              onChange={(v) => set("structure", v)}
              options={STRUCTURES.map((s) => ({ value: s.id, label: s.label, hint: s.hint }))}
            />
            <Choice
              label="Timing fix"
              value={options.shiftBeats}
              onChange={(v) => set("shiftBeats", v)}
              options={[
                { value: 0, label: "As detected" },
                { value: -2, label: "½ bar earlier" },
                { value: -1, label: "1 beat earlier" },
                { value: 1, label: "1 beat later" },
                { value: 2, label: "½ bar later" },
              ]}
            />
            <Choice
              label="Vocal level"
              value={options.vocalGainDb}
              onChange={(v) => set("vocalGainDb", v)}
              options={[
                { value: -3, label: "Softer" },
                { value: 0, label: "Balanced" },
                { value: 3, label: "Upfront" },
              ]}
            />
            <Choice
              label="Vocal sound"
              value={options.vocalPreset}
              onChange={(v) => set("vocalPreset", v)}
              options={[
                { value: "none", label: "Keep as is" },
                ...vocalPresets.map((p) => ({ value: p.id, label: p.label, hint: p.hint })),
              ]}
            />
            <Choice
              label="Beat sound"
              value={options.beatPreset}
              onChange={(v) => set("beatPreset", v)}
              options={[
                { value: "none", label: "Keep as is" },
                ...beatPresets.map((p) => ({ value: p.id, label: p.label, hint: p.hint })),
              ]}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleApply}
              disabled={busy}
              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-strong disabled:opacity-50"
            >
              {busy ? "Listening…" : result ? "Apply again" : "Apply"}
            </button>
            {baseline && !busy && vocal && beat && untouchedSince(baseline, [vocal.laneId, beat.laneId]) && (
              <button onClick={handleUndo} className="nudge" title="Put both lanes back as they were before Apply">
                undo
              </button>
            )}
            <span className="text-[10px] text-muted">
              {STRUCTURES.find((s) => s.id === options.structure)?.hint}. Pitch never changes.
            </span>
          </div>
        </>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
      {result && (
        <ul className="list-disc space-y-0.5 pl-4 text-[11px] leading-relaxed text-muted">
          {result.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
