"use client";

import { useRef, type ReactNode } from "react";
import { Activity } from "lucide-react";
import Arrangement from "@/components/studio/Arrangement";
import { useStudioStore } from "@/lib/client/studioStore";

export type StudioActivity = { id: number; text: string; at: number };

/**
 * The host's Studio as listeners see it: the real arrangement, kept in step
 * with the host's, which they can scroll and zoom but not edit (clicks,
 * drags and keys stop at this wrapper).
 */
export default function ReadOnlyStudio({ activity, header }: { activity: StudioActivity[]; header?: ReactNode }) {
  const lanes = useStudioStore((s) => s.lanes);
  const bpm = useStudioStore((s) => s.projectBpm);
  const box = useRef<HTMLDivElement>(null);
  const stop = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    if (e.type !== "pointerdown" && e.type !== "mousedown") e.preventDefault();
  };
  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="min-w-0">
        {header}
        <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted">
          <span>
            {lanes.length} stem{lanes.length === 1 ? "" : "s"} · {Math.round(bpm * 10) / 10} BPM
          </span>
          <span>Watching — scroll and zoom, the host does the editing</span>
        </div>
        {lanes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-sm text-muted">
            The host&apos;s Studio is empty — they&apos;re picking the first stems.
          </p>
        ) : (
          <div
            ref={box}
            className="select-none"
            onPointerDownCapture={stop}
            onMouseDownCapture={stop}
            onClickCapture={stop}
            onDoubleClickCapture={stop}
            onContextMenuCapture={stop}
            onKeyDownCapture={stop}
            onDragStartCapture={stop}
          >
            <Arrangement />
          </div>
        )}
      </div>
      <section className="rounded-xl border border-border bg-surface p-3" aria-label="What the host is doing">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <Activity className="h-3.5 w-3.5" /> In the Studio
        </h2>
        {activity.length === 0 ? (
          <p className="mt-2 text-xs text-muted">Every change the host makes shows up here.</p>
        ) : (
          <ol className="mt-2 flex max-h-72 flex-col gap-1.5 overflow-y-auto text-xs" aria-live="polite">
            {activity.map((a) => (
              <li key={a.id} className="animate-feed-in rounded-md px-1.5 py-1">
                <span className="mr-1.5 font-mono text-[10px] text-muted">
                  {new Date(a.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
                {a.text}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
