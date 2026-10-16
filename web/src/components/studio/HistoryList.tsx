"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, History, RotateCcw, Sparkles, Undo2, User } from "lucide-react";
import { useAiTrial } from "@/lib/client/aiTrial";
import { historyEntries, undoBackTo, undoStep, type HistoryEntry, type UndoResult } from "@/lib/client/historySteps";
import { useStudioHistory, type Snapshot } from "@/lib/client/studioHistory";
import { laneName, useStudioStore } from "@/lib/client/studioStore";

// The Studio's history: every change to the mix, newest first — what it
// changed, line by line, when, and whether you or the AI made it — with
// any one of them undone on its own (everything after it stays), or the
// mix taken back to before it. In a lane's inspector it's that lane's
// changes only, and undoing one there undoes only what it did to the lane.

function ago(at: number | null, now: number | null) {
  if (at === null) return "earlier";
  if (now === null) return "";
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : new Date(at).toLocaleDateString();
}

/** The mix as it is now, as the history sees it — only what history keeps (not the playhead, which moves every frame). */
function useCurrent(): Snapshot {
  const lanes = useStudioStore((s) => s.lanes);
  const duration = useStudioStore((s) => s.duration);
  const projectBpm = useStudioStore((s) => s.projectBpm);
  const masterVolume = useStudioStore((s) => s.masterVolume);
  const loopEnabled = useStudioStore((s) => s.loopEnabled);
  const loopStart = useStudioStore((s) => s.loopStart);
  const loopEnd = useStudioStore((s) => s.loopEnd);
  const markers = useStudioStore((s) => s.markers);
  const crossfader = useStudioStore((s) => s.crossfader);
  const pads = useStudioStore((s) => s.pads);
  const master = useStudioStore((s) => s.master);
  return useMemo(
    () => ({ lanes, duration, projectBpm, masterVolume, loopEnabled, loopStart, loopEnd, markers, crossfader, pads, master }),
    [lanes, duration, projectBpm, masterVolume, loopEnabled, loopStart, loopEnd, markers, crossfader, pads, master]
  );
}

function Entry({ entry, laneId, now, disabled, onDone }: { entry: HistoryEntry; laneId?: string; now: number | null; disabled: boolean; onDone: (result: UndoResult) => void }) {
  const [open, setOpen] = useState(false);
  const ai = entry.by === "ai";
  return (
    <li className="rounded-lg border border-border bg-surface px-2.5 py-2">
      <div className="flex items-start gap-2">
        <span
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${ai ? "bg-brand/20 text-brand-strong" : "bg-surface-raised text-muted"}`}
          title={ai ? "Made by the AI" : "Made by you"}
        >
          {ai ? <Sparkles className="h-3 w-3" /> : <User className="h-3 w-3" />}
        </span>
        <button onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 text-left" aria-expanded={open}>
          <span className="line-clamp-2 text-xs font-semibold leading-snug" dir="auto">
            {entry.title}
          </span>
          <span className="flex items-center gap-1 text-[10px] text-muted">
            {ai ? "AI" : "You"} · {ago(entry.at, now)}
            {entry.lines.length > 1 && (
              <>
                {" · "}
                {entry.lines.length} changes
                <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
              </>
            )}
          </span>
        </button>
      </div>
      {open && (
        <ul className="mt-1.5 flex flex-col gap-0.5 pl-7 text-[11px] leading-snug text-muted">
          {entry.lines.map((line, i) => (
            <li key={i} dir="auto">
              {line}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1.5 flex flex-wrap gap-1.5 pl-7">
        <button
          onClick={() => onDone(undoStep(entry.index, { laneId }))}
          disabled={disabled}
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-muted hover:border-brand hover:text-foreground disabled:opacity-40"
          title={laneId ? "Undo what this change did to this lane — everything else stays" : "Undo just this change — everything after it stays"}
        >
          <Undo2 className="h-3 w-3" /> {laneId ? "Undo on this lane" : "Undo this"}
        </button>
        {!laneId && (
          <button
            onClick={() => onDone(undoBackTo(entry.index))}
            disabled={disabled}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted hover:text-foreground disabled:opacity-40"
            title="Undo this and everything after it (redo brings them back)"
          >
            <RotateCcw className="h-3 w-3" /> Back to before this
          </button>
        )}
      </div>
    </li>
  );
}

export default function HistoryList({ laneId }: { laneId?: string }) {
  const past = useStudioHistory((s) => s.past);
  const current = useCurrent();
  const trying = useAiTrial((s) => !!s.trial);
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  const entries = useMemo(() => {
    const all = historyEntries({ past }, current);
    return (laneId ? all.filter((e) => e.laneIds.includes(laneId)) : all).reverse();
  }, [past, current, laneId]);
  // "3 min ago", kept up to date.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 15_000);
    return () => clearInterval(timer);
  }, [past]);

  function done(result: UndoResult) {
    if (!result.ok) setNote({ text: result.reason, error: true });
    else setNote({ text: result.later.length ? `${result.title}. What was changed since on ${result.later.join(", ")} went back with it.` : `${result.title}.`, error: false });
  }

  const lane = laneId ? current.lanes.find((l) => l.laneId === laneId) : undefined;
  return (
    <div className="flex flex-col gap-2 text-xs">
      <p className="flex items-center gap-1.5 font-semibold">
        <History className="h-3.5 w-3.5 text-brand-strong" />
        {lane ? `Changes to “${laneName(lane)}”` : "History"}
        <span className="font-normal text-muted">· {entries.length}</span>
      </p>
      {trying && <p className="rounded-lg bg-surface px-2 py-1.5 text-[11px] text-muted">An AI idea is being tried — keep it or undo it to change the history.</p>}
      {note && (
        <p className={`rounded-lg px-2 py-1.5 text-[11px] ${note.error ? "bg-danger/10 text-danger" : "bg-success/10 text-success"}`} role="status">
          {note.text}
        </p>
      )}
      {entries.length === 0 ? (
        <p className="text-[11px] text-muted">
          {lane ? "Nothing's been changed on this lane yet." : "Nothing's changed yet."} Every change you or the AI make shows up here, and any one of them can be undone on its own.
        </p>
      ) : (
        <ol className="flex max-h-[min(60vh,28rem)] flex-col gap-1.5 overflow-y-auto pr-0.5 scrollbar-thin">
          {entries.map((entry) => (
            <Entry key={`${entry.index}:${entry.at}`} entry={entry} laneId={laneId} now={now} disabled={trying} onDone={done} />
          ))}
        </ol>
      )}
    </div>
  );
}
