"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckIcon, ChevronDown, History, ListChecks, Minus, X } from "lucide-react";
import { Icon } from "@/components/Icon";
import { diffMix, type LaneDiff, type MixDiff } from "@/lib/client/aiExplain";
import type { Idea } from "@/lib/client/aiIdeas";
import { PARTS, partsOf, useAiLog, type Kept, type Part, type Trial } from "@/lib/client/aiTrial";
import { useStudioStore, viewDuration } from "@/lib/client/studioStore";
import { kindColor, kindLabel } from "@/lib/stemKinds";
import LaneStrip from "../LaneStrip";
import { ScoreRing, Switch } from "./ui";

// "What exactly happened?" — everything the AI producer changed, said
// three ways: one sentence per line of the song; every change it's
// trying, each with its switch (and a switch for each of its parts); and
// line by line, a picture of the line before and after, with the numbers.
// Changes kept earlier stay listed below, the same way.

function ago(at: number) {
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const STATUS_WORD: Record<LaneDiff["status"], string> = { added: "New line", removed: "Taken out", changed: "Changed", same: "Not touched" };

/** One line of the song, before and after: where it plays, and each change with its numbers. */
function LaneCard({ diff, span }: { diff: LaneDiff; span: number }) {
  const color = kindColor(diff.kind);
  return (
    <div className="rounded-xl border border-border bg-background/50 p-2.5">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
        <p className="min-w-0 flex-1 truncate text-xs font-semibold">
          {diff.name} <span className="font-normal text-muted">· {kindLabel(diff.kind)}</span>
        </p>
        <span
          className={`shrink-0 rounded-full px-1.5 text-[9.5px] font-bold leading-4 ${
            diff.status === "added" ? "bg-success/15 text-success" : diff.status === "removed" ? "bg-danger/15 text-danger" : "bg-brand/15 text-brand-strong"
          }`}
        >
          {STATUS_WORD[diff.status]}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-[3.25rem_1fr] items-center gap-x-2 gap-y-1 text-[9.5px] font-semibold uppercase tracking-wide text-muted">
        <span>Before</span>
        {diff.before ? <LaneStrip lane={diff.before} span={span} className="h-2.5" dim color={color} /> : <span className="h-2.5 rounded-[3px] border border-dashed border-border" />}
        <span>After</span>
        {diff.after ? <LaneStrip lane={diff.after} span={span} className="h-2.5" color={color} /> : <span className="h-2.5 rounded-[3px] border border-dashed border-border" />}
      </div>
      {diff.changes.length > 0 && (
        <dl className="mt-2 flex flex-col gap-1.5 text-[11px]">
          {diff.changes.map((c, n) => (
            <div key={n} className="grid grid-cols-[4.5rem_1fr] gap-x-2">
              <dt className="font-semibold">{c.label}</dt>
              <dd>
                <span className="font-mono text-[10.5px] text-foreground">{c.value}</span>
                <span className="block text-muted">{c.text}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** A diff, said: the summary sentences, then line by line (the lines not touched folded away). */
function DiffView({ diff, span }: { diff: MixDiff; span: number }) {
  const [showAll, setShowAll] = useState(false);
  const touched = diff.lanes.filter((d) => d.status !== "same");
  const untouched = diff.lanes.length - touched.length;
  return (
    <div className="flex flex-col gap-2">
      {diff.summary.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-xl bg-brand/[0.07] p-2.5 text-[11.5px] leading-snug">
          {diff.summary.map((line, n) => (
            <li key={n} className="flex gap-1.5">
              <ArrowRight className="mt-0.5 shrink-0 text-brand-strong" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}
      {(showAll ? diff.lanes : touched).map((d) => (
        <LaneCard key={d.laneId} diff={d} span={span} />
      ))}
      {untouched > 0 && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="self-start text-[11px] font-semibold text-brand-strong hover:underline">
          {showAll ? "Hide the lines not touched" : `${untouched} line${untouched === 1 ? "" : "s"} not touched — show`}
        </button>
      )}
    </div>
  );
}

function spanOf(diff: MixDiff, bpm: number) {
  let end = 0;
  for (const d of diff.lanes) for (const l of [d.before, d.after]) if (l) end = Math.max(end, l.offsetSeconds + l.duration);
  return viewDuration(end, bpm);
}

function KeptEntry({ kept }: { kept: Kept }) {
  const [open, setOpen] = useState(false);
  const lanes = useStudioStore((s) => s.lanes);
  const diff = useMemo(() => (open ? diffMix(kept.before, kept.after) : null), [open, kept]);
  const state = lanes === kept.after.lanes ? "now" : lanes === kept.before.lanes ? "undone" : "since";
  return (
    <li className="rounded-xl border border-border">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2 p-2.5 text-left">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-xs font-semibold">
            {kept.ideas.map((i, n) => (
              <span key={i.id}>
                {n > 0 && " + "}
                <Icon name={i.icon} className="text-brand-strong" /> {i.title}
              </span>
            ))}
          </span>
          <span className="text-[10px] text-muted">
            Kept {ago(kept.at)} ·{" "}
            {state === "now" ? <span className="text-success">in your mix now</span> : state === "undone" ? <span className="text-amber-400">undone</span> : "changed since"}
          </span>
        </span>
        <ChevronDown className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && diff && (
        <div className="border-t border-border p-2.5">
          <DiffView diff={diff} span={spanOf(diff, kept.after.projectBpm)} />
        </div>
      )}
    </li>
  );
}

export default function WhatHappened({
  trial,
  onIds,
  working,
  scores,
  onBack,
  onSwitch,
  onPart,
  onDismiss,
}: {
  trial: Trial | null;
  onIds: Set<string>;
  working: string | null;
  /** The mix score before the changes and with them on (when there's a vocal and beat to score). */
  scores: { before: number; after: number } | null;
  onBack: () => void;
  onSwitch: (idea: Idea, on: boolean) => void;
  onPart: (idea: Idea, part: Part, on: boolean) => void;
  onDismiss: (ideaId: string) => void;
}) {
  const kept = useAiLog((s) => s.kept);
  const diff = useMemo(() => (trial ? diffMix(trial.baseline, trial.result) : null), [trial]);
  const span = diff && trial ? spanOf(diff, trial.result.projectBpm) : 0;
  const listed = trial ? [...trial.ideas, ...trial.off] : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} className="flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-semibold hover:border-brand" aria-label="Back to the ideas">
          <ArrowLeft /> Back
        </button>
        <h3 className="flex items-center gap-1.5 text-sm font-bold">
          <ListChecks className="text-brand-strong" /> What happened
        </h3>
      </div>

      {trial && diff ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
            {scores ? (
              <div className="flex items-center gap-2">
                <ScoreRing score={scores.before} size={44} label="Score before" />
                <ArrowRight className="text-muted" />
                <ScoreRing score={scores.after} size={52} label="Score with the changes" />
              </div>
            ) : null}
            <div className="min-w-0 flex-1 text-xs">
              <p className="font-bold">
                {trial.ideas.length ? `${trial.ideas.length} change${trial.ideas.length === 1 ? "" : "s"} on — not kept yet` : "Everything switched off"}
              </p>
              <p className="text-[11px] text-muted">
                {scores && trial.ideas.length
                  ? scores.after > scores.before
                    ? `The mix scores ${scores.after - scores.before} points higher with them.`
                    : scores.after < scores.before
                      ? `The mix scores ${scores.before - scores.after} points lower — maybe switch one off.`
                      : "The score is the same with them."
                  : "Switch each change on or off below; Keep it makes it one undo step."}
              </p>
            </div>
          </div>

          {trial.ideas.length > 0 && <DiffView diff={diff} span={span} />}

          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Each change — switch it on or off</p>
            {listed.map((i) => {
              const isOn = onIds.has(i.id);
              const parts = partsOf(i);
              const partsOff = trial.without[i.id] ?? [];
              return (
                <div key={i.id} className={`rounded-xl border p-2.5 ${isOn ? "border-brand/60 bg-brand/[0.07]" : "border-border"}`}>
                  <div className="flex items-center gap-2">
                    <span className={`min-w-0 flex-1 truncate text-xs font-semibold ${isOn ? "" : "text-muted line-through decoration-muted/60"}`}>
                      <Icon name={i.icon} className="text-brand-strong" /> {i.title}
                    </span>
                    {!isOn && (
                      <button type="button" onClick={() => onDismiss(i.id)} className="shrink-0 rounded p-1 text-muted hover:text-danger" aria-label={`Remove ${i.title} from the list`} title="Remove from the list">
                        <X />
                      </button>
                    )}
                    <Switch on={isOn} onChange={(on) => onSwitch(i, on)} label={`${i.title}: ${isOn ? "on" : "off"}`} busy={working === i.id} />
                  </div>
                  {parts.length > 1 && (
                    <div className="mt-1.5 flex flex-wrap gap-1" role="group" aria-label={`Parts of ${i.title}`}>
                      {parts.map((part) => {
                        const partOn = !partsOff.includes(part);
                        const label = PARTS.find((p) => p.id === part)!.label;
                        return (
                          <button
                            key={part}
                            type="button"
                            onClick={() => onPart(i, part, !partOn)}
                            aria-pressed={partOn}
                            title={partOn ? `Switch off just its ${label.toLowerCase()}` : `Switch its ${label.toLowerCase()} back on`}
                            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                              partOn ? "border-brand/60 bg-brand/15 text-foreground" : "border-border text-muted line-through"
                            }`}
                          >
                            {partOn ? <CheckIcon /> : <Minus />} {label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <p className="mt-1 text-[11px] text-muted">{i.why}</p>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted">
          Nothing is being tried right now. Switch an idea on and this shows exactly what it changes — line by line, with the numbers.
        </p>
      )}

      {kept.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            <History /> Kept earlier · ⌘Z undoes the latest
          </h4>
          <ul className="flex flex-col gap-1.5">
            {kept.map((k) => (
              <KeptEntry key={k.id} kept={k} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
