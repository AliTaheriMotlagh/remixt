"use client";

import { useEffect, useState } from "react";
import { FlipHorizontal2, LayoutGrid, X } from "lucide-react";
import { audioEngine } from "@/lib/client/audioEngine";
import { useStudioStore, type Pad } from "@/lib/client/studioStore";
import { kindColor } from "@/lib/stemKinds";

/** Keys 1–9 and 0 play pads 1–10. */
export const PAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

/**
 * Up to 16 pads, each a slice of a stem (a vocal chop, a snare, a bar of
 * the beat) — made with "To a sample pad" on a lane. Tap to play one over the mix;
 * on a keyboard, 1–9 and 0 play the first ten.
 */
export default function SamplePads() {
  const pads = useStudioStore((s) => s.pads);
  const removePad = useStudioStore((s) => s.removePad);
  const updatePad = useStudioStore((s) => s.updatePad);
  const [editing, setEditing] = useState(false);
  const [hit, setHit] = useState<string | null>(null);

  // Cut and render each pad ahead, so the first tap plays straight away.
  useEffect(() => {
    for (const pad of pads) audioEngine.preparePad(pad);
  }, [pads]);

  function play(pad: Pad) {
    setHit(pad.id);
    setTimeout(() => setHit((current) => (current === pad.id ? null : current)), 150);
    void audioEngine.triggerPad(pad).catch(() => {});
  }

  if (pads.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface p-4 text-center text-xs text-muted">
        <span className="font-semibold text-foreground">Sample pads.</span> Select a clip on a lane (or park the playhead
        over some audio) and press{" "}
        <span className="font-semibold text-foreground">
          <LayoutGrid /> To a sample pad
        </span>{" "}
        — then tap the pad to fire it over the mix.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wide text-muted">
        <span>Pads · tap to play{pads.length > 0 ? " · keys 1–0" : ""}</span>
        <button onClick={() => setEditing((v) => !v)} className="nudge normal-case">
          {editing ? "done" : "edit"}
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
        {pads.map((pad, i) => (
          <div key={pad.id} className="relative">
            <button
              onPointerDown={(e) => {
                if (editing) return;
                e.preventDefault();
                play(pad);
              }}
              onClick={() => {
                if (!editing) return;
                const label = window.prompt("Name this pad", pad.label)?.trim();
                if (label) updatePad(pad.id, { label: label.slice(0, 40) });
              }}
              className="flex aspect-square w-full touch-manipulation select-none flex-col items-start justify-between rounded-lg border-2 p-1.5 text-left transition-transform active:scale-95"
              style={{
                borderColor: kindColor(pad.kind),
                background: hit === pad.id ? kindColor(pad.kind) : `color-mix(in srgb, ${kindColor(pad.kind)} 18%, transparent)`,
              }}
              title={editing ? "Rename" : `${pad.label}${i < PAD_KEYS.length ? ` (key ${PAD_KEYS[i]})` : ""}`}
            >
              <span className="font-mono text-[10px] text-muted">{i < PAD_KEYS.length ? PAD_KEYS[i] : ""}</span>
              <span className="line-clamp-2 text-[10px] font-medium leading-tight">
                {pad.reverse && <FlipHorizontal2 className="mr-0.5" />}
                {pad.label}
              </span>
            </button>
            {editing && (
              <button
                onClick={() => removePad(pad.id)}
                className="absolute -right-1.5 -top-1.5 flex h-5 min-h-0 w-5 items-center justify-center rounded-full bg-danger text-[10px] text-white pointer-coarse:h-7 pointer-coarse:w-7 pointer-coarse:text-xs"
                aria-label={`Remove pad ${pad.label}`}
              >
                <X />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
