"use client";

import { useEffect, useRef, useState } from "react";
import { placeStems, siblingStems } from "@/lib/client/beatParts";
import { SPLIT_KINDS, canSplitHere, defaultKinds, splitLane, type SplitKind } from "@/lib/client/laneSplit";
import { useSplitter, type UploadStage } from "@/lib/client/splitter";
import { useStudioStore, type LoadableStem } from "@/lib/client/studioStore";
import { useStudioView } from "@/lib/client/studioView";
import { describeStage } from "@/lib/client/uploads";
import { useKeepScreenOn } from "@/lib/client/wakeLock";

// "Split with Demucs…" on any lane: asks which parts you want, uses the
// library's copy when the song was already split (instant), otherwise runs
// the model on this computer and saves the result to your library — then
// lays the parts on the timeline exactly where the lane is.

export default function SplitLaneDialog() {
  const laneId = useStudioView((s) => s.splitLaneId);
  const setSplitLane = useStudioView((s) => s.setSplitLane);
  const notify = useStudioView((s) => s.notify);
  const lane = useStudioStore((s) => s.lanes.find((l) => l.laneId === laneId) ?? null);
  const splitterState = useSplitter();
  const [library, setLibrary] = useState<LoadableStem[] | null>(null);
  const [kinds, setKinds] = useState<SplitKind[]>([]);
  const [replace, setReplace] = useState(true);
  const [stage, setStage] = useState<UploadStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const working = stage !== null;
  useKeepScreenOn("lane-split", working);

  const laneKind = lane?.kind;
  const stemId = lane?.stemId;
  useEffect(() => {
    if (!laneKind || !stemId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a fresh dialog for each lane
    setKinds(defaultKinds(laneKind));
    setReplace(true);
    setError(null);
    setLibrary(null);
    void siblingStems({ stemId }).then((found) => !cancelled && setLibrary(found));
    return () => {
      cancelled = true;
    };
  }, [laneKind, stemId]);

  if (!laneId || !lane) return null;

  const fromLibrary = (kind: SplitKind) => library?.find((s) => s.kind === kind && s.id !== lane.stemId);
  const instant = kinds.length > 0 && kinds.every((k) => fromLibrary(k));
  const whole = defaultKinds(lane.kind);
  // The parts add up to the lane only when they're all of it.
  const canReplace = whole.every((k) => kinds.includes(k));
  const close = () => {
    if (working) return;
    setSplitLane(null);
  };

  function finish(stems: LoadableStem[]) {
    const chosen = kinds.flatMap((k) => stems.find((s) => s.kind === k) ?? []);
    if (!chosen.length) throw new Error("The split didn't produce those parts");
    placeStems(laneId!, chosen, { replace: replace && canReplace });
    notify(`Added ${chosen.map((s) => SPLIT_KINDS.find((k) => k.id === s.kind)?.label).join(", ")} — ⌘Z to undo`);
    setSplitLane(null);
  }

  async function start() {
    setError(null);
    if (instant) {
      finish(library!);
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setStage({ stage: "decoding" });
    try {
      finish(await splitLane(lane!, setStage, controller.signal));
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") setError(err instanceof Error ? err.message : "The split didn't finish");
    } finally {
      abort.current = null;
      setStage(null);
    }
  }

  const progress = stage ? describeStage(stage, splitterState) : null;

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/50" onClick={close} />
      <div
        role="dialog"
        aria-label="Split with Demucs"
        className="touch-targets fixed z-[71] flex flex-col gap-3 border border-border bg-surface-raised p-4 shadow-2xl max-sm:inset-x-0 max-sm:bottom-0 max-sm:rounded-t-2xl max-sm:pb-[max(1rem,env(safe-area-inset-bottom))] sm:left-1/2 sm:top-1/2 sm:w-[26rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
        style={{ animation: "sheet-in 0.18s ease-out" }}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-beat/20 text-xl">🧩</span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold">Split with Demucs</h2>
            <p className="truncate text-xs text-muted">“{lane.trackTitle}”</p>
          </div>
          <button onClick={close} disabled={working} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:text-foreground disabled:opacity-40" aria-label="Close">
            ✕
          </button>
        </div>

        <p className="text-xs text-muted">
          Demucs separates a recording into vocals, drums, bass and melody. Pick the parts you want as their own lanes — they line up exactly where
          this lane is.
        </p>

        <div className="grid grid-cols-2 gap-2">
          {SPLIT_KINDS.map((k) => {
            const on = kinds.includes(k.id);
            const ready = !!fromLibrary(k.id);
            return (
              <label
                key={k.id}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border p-2.5 text-xs ${on ? "border-brand bg-brand/10" : "border-border"} ${working ? "pointer-events-none opacity-60" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => setKinds(on ? kinds.filter((x) => x !== k.id) : [...kinds, k.id])}
                  className="h-4 w-4 accent-brand"
                />
                <span className="text-lg leading-none">{k.icon}</span>
                <span className="min-w-0">
                  <span className="block font-semibold">{k.label}</span>
                  <span className={`block text-[10px] ${ready ? "text-success" : "text-muted"}`}>{library === null ? "…" : ready ? "ready — instant" : "needs splitting"}</span>
                </span>
              </label>
            );
          })}
        </div>

        {canReplace && (
          <label className={`flex items-center gap-2 text-xs ${working ? "opacity-60" : ""}`}>
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} disabled={working} className="h-4 w-4 accent-brand" />
            Replace the original lane (the parts add up to the same sound)
          </label>
        )}

        {progress && (
          <div className="rounded-xl bg-background p-3 text-xs">
            <div className="flex justify-between gap-2">
              <span className="font-medium">{progress.label}…</span>
              {progress.progress !== null && <span className="tabular-nums text-muted">{Math.round(progress.progress * 100)}%</span>}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-raised">
              <div
                className={`h-full rounded-full bg-gradient-to-r from-brand to-beat transition-all ${progress.progress === null ? "w-full animate-pulse-glow opacity-60" : ""}`}
                style={progress.progress !== null ? { width: `${Math.max(3, progress.progress * 100)}%` } : undefined}
              />
            </div>
            <p className="mt-2 text-[11px] text-muted">Keep this tab open. The result is saved to your library, so it never needs splitting again.</p>
          </div>
        )}

        {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
        {!instant && !canSplitHere() && (
          <p className="rounded-lg bg-amber-400/10 px-3 py-2 text-xs text-amber-400">Splitting runs the model on your device and needs a computer — open the Studio on one.</p>
        )}

        <div className="flex gap-2">
          {working ? (
            <button onClick={() => abort.current?.abort()} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium hover:border-danger/60 hover:text-danger">
              Stop
            </button>
          ) : (
            <>
              <button onClick={close} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-muted hover:text-foreground">
                Cancel
              </button>
              <button
                onClick={() => void start()}
                disabled={!kinds.length || library === null || (!instant && !canSplitHere())}
                className="flex-[2] rounded-xl bg-beat py-2.5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-40"
              >
                {instant ? "Add them now" : "Split now · ~1–2 min"}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
