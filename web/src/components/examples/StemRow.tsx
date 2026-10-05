"use client";

import { Download, Volume2, VolumeX } from "lucide-react";
import Wave from "./Wave";

/** One stem in the Split step: its waveform, with solo, mute and (for demo songs) download. */
export default function StemRow({
  label,
  hint,
  color,
  peaks,
  muted,
  soloed,
  onMute,
  onSolo,
  onDownload,
  fraction,
  small,
  revealed,
}: {
  label: string;
  hint?: string;
  color: string;
  peaks: Float32Array;
  muted: boolean;
  soloed: boolean;
  onMute: () => void;
  onSolo: () => void;
  /** Omitted: no download button (library stems are downloaded from the library itself). */
  onDownload?: () => void;
  fraction: (() => number) | null;
  small?: boolean;
  revealed: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-border bg-surface p-3 transition-all duration-700 ${revealed ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"} ${small ? "ml-3 sm:ml-6" : ""}`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="size-2.5 rounded-full" style={{ background: color }} aria-hidden />
        <span className="text-sm font-semibold">{label}</span>
        {hint && <span className="hidden text-xs text-muted sm:inline">{hint}</span>}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onSolo}
            aria-pressed={soloed}
            aria-label={`Solo ${label}`}
            className={`min-h-10 min-w-10 rounded-md border px-2 text-xs font-bold sm:min-h-8 sm:min-w-8 ${soloed ? "border-drums bg-drums text-black" : "border-border text-muted hover:text-foreground"}`}
          >
            S
          </button>
          <button
            type="button"
            onClick={onMute}
            aria-pressed={muted}
            aria-label={`Mute ${label}`}
            className={`flex min-h-10 min-w-10 items-center justify-center rounded-md border px-2 text-xs font-bold sm:min-h-8 sm:min-w-8 ${muted ? "border-danger bg-danger text-white" : "border-border text-muted hover:text-foreground"}`}
          >
            {muted ? <VolumeX /> : <Volume2 />}
          </button>
          {onDownload && (
            <button
              type="button"
              onClick={onDownload}
              aria-label={`Download ${label} as WAV`}
              title="Download WAV"
              className="flex min-h-10 min-w-10 items-center justify-center rounded-md border border-border px-2 text-muted sm:min-h-8 sm:min-w-8 hover:text-foreground"
            >
              <Download />
            </button>
          )}
        </div>
      </div>
      <Wave peaks={peaks} color={color} height={small ? 36 : 52} dim={muted} fraction={fraction} label={`${label} waveform`} />
    </div>
  );
}
