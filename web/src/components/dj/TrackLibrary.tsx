"use client";

import { useEffect, useRef } from "react";
import { Loader2, X } from "lucide-react";
import { DJ_TRACKS } from "@/lib/client/dj/djTrackInfo";
import type { DeckId, TrackInfo } from "@/lib/client/dj/djTypes";
import { keyFit, keyLabel } from "@/lib/client/musicKey";

const FIT_LABEL = {
  same: { text: "Same key", cls: "text-success" },
  relative: { text: "Relative key: same notes", cls: "text-success" },
  neighbour: { text: "Neighbour key: blends", cls: "text-beat" },
  far: { text: "Two steps: tense", cls: "text-drums" },
  clash: { text: "Clashes", cls: "text-danger" },
} as const;

/** A sheet listing the demo tracks, with how each fits the track on the other deck. */
export default function TrackLibrary({
  deck,
  other,
  loadingId,
  onPick,
  onClose,
}: {
  deck: DeckId;
  other: TrackInfo | null;
  loadingId: string | null;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="presentation">
      <button type="button" aria-label="Close the library" className="absolute inset-0 bg-black/60" onClick={onClose} tabIndex={-1} />
      <div role="dialog" aria-modal="true" aria-label={`Load a track on Deck ${deck}`} className="touch-targets relative flex max-h-[85dvh] w-full flex-col rounded-t-2xl border border-border bg-surface-raised shadow-2xl max-sm:pb-[env(safe-area-inset-bottom)] sm:max-w-xl sm:rounded-2xl">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-base font-bold">Load on Deck {deck}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-9 items-center justify-center rounded-lg hover:bg-surface-hover">
            <X />
          </button>
        </header>
        <ul className="flex flex-col gap-2 overflow-y-auto p-3">
          {DJ_TRACKS.map((t, i) => {
            const fit = other ? FIT_LABEL[keyFit(t.key, other.key)] : null;
            const gap = other ? ((t.bpm - other.bpm) / other.bpm) * 100 : null;
            return (
              <li key={t.id}>
                <button
                  ref={i === 0 ? first : undefined}
                  type="button"
                  onClick={() => onPick(t.id)}
                  disabled={loadingId !== null}
                  className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left hover:bg-surface-hover disabled:opacity-60"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{t.title}</p>
                    <p className="truncate text-xs text-muted">
                      {t.artist} · {t.genre}
                    </p>
                    {fit && (
                      <p className="mt-0.5 text-[11px]">
                        <span className={fit.cls}>{fit.text}</span>
                        {gap !== null && <span className="text-muted"> · tempo {gap > 0 ? "+" : ""}{gap.toFixed(0)}% vs the other deck</span>}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right text-xs">
                    {loadingId === t.id ? <Loader2 className="animate-spin" /> : null}
                    <p className="font-mono font-bold tabular-nums">{t.bpm} BPM</p>
                    <p className="text-muted">
                      {keyLabel(t.key)} · <span className="font-semibold text-brand-strong">{t.camelot}</span>
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
