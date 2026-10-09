"use client";

import { memo } from "react";
import { CheckIcon, Loader2, Play, Stethoscope, Trophy } from "lucide-react";
import type { FixGroup, FixId } from "@/lib/client/aiIdeas";
import type { MixScore, Version } from "@/lib/client/mixScore";
import { Switch } from "./ui";

// The Mix check: what the AI heard wrong with the mix, in plain words, one
// row per fix — each with its own switch. Switched on, the fix is playing
// in the mix (they all work out together, so none undoes another);
// switched off, that one comes off and the rest stay. "Let AI choose"
// scores every sync, style and fix as it would sound and plays the best.

const STATUS = {
  good: { dot: "bg-success", text: "text-success", label: "Good" },
  warn: { dot: "bg-amber-400", text: "text-amber-400", label: "Could be better" },
  bad: { dot: "bg-danger", text: "text-danger", label: "Needs fixing" },
} as const;

/** What a row can do: its fix is on, can go on, or there's nothing to switch. */
export type FixState = "fixed" | "fixable" | "none";

/** What "Let AI choose" found, and the ideas it scored. */
export type Best = { ideas: unknown[]; now: MixScore; versions: Version[] };

export type CheckActions = {
  fixCheck: (fix: FixId) => void;
  unfixCheck: (fix: FixId) => void;
  findBest: () => void;
  tryBest: (ideaId: string) => void;
};

export default memo(function MixCheck({
  groups,
  helped,
  showing,
  fixState,
  working,
  canChoose,
  best,
  bestBlocked,
  keepWhole,
  onIds,
  act,
}: {
  groups: FixGroup[];
  helped: Set<string>;
  showing: "idea" | "original" | null;
  fixState: (fix: FixId | null) => FixState;
  working: string | null;
  /** Whether there's a vocal and a beat to score versions of. */
  canChoose: boolean;
  best: Best | null;
  bestBlocked: boolean;
  keepWhole: boolean;
  onIds: Set<string>;
  act: CheckActions;
}) {
  const good = groups.filter((g) => g.status === "good").length;
  const busy = working !== null;
  const choosing = working === "best";
  const top = best?.versions[0];
  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-bold">
            <Stethoscope className="text-brand-strong" />
            Mix check
          </h3>
          <p className="text-[11px] text-muted">
            {showing === "idea" ? "With the changes on · " : showing === "original" ? "Before the changes · " : ""}
            {good} of {groups.length} sound right · switch a fix on to hear it
          </p>
        </div>
        {canChoose && (
          <button
            onClick={act.findBest}
            disabled={busy && !choosing}
            aria-busy={choosing}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold transition-colors hover:border-brand disabled:opacity-50"
            title={top ? `Best: ${top.idea.title} (${top.score.total})` : `Hears every sync & style${keepWhole ? ", kept whole" : ""}, plays the best`}
          >
            {choosing ? <Loader2 className="animate-spin text-brand-strong" /> : <Trophy className="text-amber-400" />}
            {choosing ? "Comparing…" : best ? "Compare again" : "Let AI choose"}
          </button>
        )}
      </div>

      {best && (
        <div className="mt-2.5 rounded-xl bg-background p-2.5">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">AI compared {best.versions.length} versions · tap one to hear it</p>
          <ul className="flex flex-col gap-0.5">
            <li className="flex items-center gap-2 px-1 py-1 text-[11px] text-muted">
              <span className="w-7 shrink-0 text-right font-bold tabular-nums">{best.now.total}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-raised">
                <span className="block h-full rounded-full bg-muted/60" style={{ width: `${best.now.total}%` }} />
              </span>
              <span className="w-[42%] shrink-0 truncate">{showing ? "Before the changes" : "Your mix now"}</span>
            </li>
            {best.versions.map((v, n) => {
              const on = onIds.has(v.idea.id);
              return (
                <li key={v.idea.id}>
                  <button
                    onClick={() => act.tryBest(v.idea.id)}
                    disabled={bestBlocked}
                    aria-pressed={on}
                    title={v.score.parts.map((p) => `${p.label}: ${Math.round(p.score * 100)} — ${p.text}`).join("\n")}
                    className={`flex min-h-8 w-full items-center gap-2 rounded-lg px-1 text-left text-[11px] transition-colors hover:bg-surface-hover disabled:opacity-60 ${on ? "bg-brand/15 font-semibold text-foreground" : ""}`}
                  >
                    <span className="w-7 shrink-0 text-right font-bold tabular-nums">{v.score.total}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-raised">
                      <span className={`block h-full rounded-full ${v.score.total >= 85 ? "bg-success" : v.score.total >= 70 ? "bg-brand" : "bg-amber-400"}`} style={{ width: `${v.score.total}%` }} />
                    </span>
                    <span className="flex w-[42%] shrink-0 items-center gap-1 truncate">
                      {on ? <Play className="shrink-0 fill-current text-brand-strong" /> : n === 0 ? <Trophy className="shrink-0 text-amber-400" /> : null}
                      <span className="truncate">{v.idea.title}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <ul className="mt-3 flex flex-col divide-y divide-border border-t border-border">
        {groups.map((g) => {
          const state = fixState(g.fix);
          const fixed = state === "fixed";
          const pending = !!g.fix && working === `fix:${g.fix}`;
          const status = fixed && g.status === "good" ? null : STATUS[g.status];
          const canSwitch = fixed || (state === "fixable" && g.status !== "good");
          return (
            <li key={g.id} className="flex items-start gap-2.5 py-2.5">
              {fixed ? (
                <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-success text-[10px] text-white" aria-label="Fixed">
                  <CheckIcon />
                </span>
              ) : (
                <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${STATUS[g.status].dot}`} aria-label={STATUS[g.status].label} />
              )}
              <div className="min-w-0 flex-1 text-xs">
                <p className="flex flex-wrap items-baseline gap-x-1.5">
                  <span className="font-semibold">{g.label}</span>
                  <span className={`text-[10px] font-semibold ${fixed ? "text-success" : status?.text}`}>{fixed ? "Fixed" : status?.label}</span>
                </p>
                {g.checks.map((c) => (
                  <p key={c.id} className="mt-0.5 text-[11px] leading-snug text-muted">
                    {g.checks.length > 1 && <span className="font-medium text-foreground/80">{c.label}: </span>}
                    {c.text}
                  </p>
                ))}
                {helped.has(g.id) && <p className="mt-0.5 text-[10px] text-success">Good now — a change that&apos;s on sorted it out</p>}
              </div>
              {canSwitch && g.fix ? (
                <Switch
                  on={fixed}
                  busy={pending}
                  disabled={busy && !pending}
                  onChange={(on) => (on ? act.fixCheck(g.fix!) : act.unfixCheck(g.fix!))}
                  label={fixed ? `${g.label}: fixed — switch off to undo just this fix` : `Fix ${g.label.toLowerCase()}`}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
});
