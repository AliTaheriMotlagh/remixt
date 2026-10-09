"use client";

import { memo } from "react";
import { CheckIcon, ChevronDown, Headphones, Loader2, Minus, type LucideIcon } from "lucide-react";
import { Icon, type IconName } from "@/components/Icon";
import type { Idea } from "@/lib/client/aiIdeas";
import { PARTS, partsOf, type Part } from "@/lib/client/aiTrial";

// The AI producer's building blocks. Every idea is a row with a switch —
// on, it's playing in the mix; off, it isn't — that opens to say why it
// helps and exactly what it changes. Choices that exclude each other (who
// leads, when the vocal comes in) are cards, one picked at a time.

export function clock(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** An on/off switch. */
export function Switch({
  on,
  onChange,
  label,
  busy = false,
  disabled = false,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  label: string;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      aria-busy={busy}
      disabled={disabled}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!on);
      }}
      className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${on ? "bg-brand" : "bg-border"}`}
    >
      <span className={`flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] text-brand-strong shadow transition-transform ${on ? "translate-x-[18px]" : "translate-x-0.5"}`}>
        {busy && <Loader2 className="animate-spin" />}
      </span>
    </button>
  );
}

export function Section({ icon: SectionIcon, title, hint, action, children }: { icon: LucideIcon; title: string; hint?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-bold">
            <SectionIcon className="text-brand-strong" />
            {title}
          </h3>
          {hint && <p className="text-[11px] text-muted">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export const scoreColor = (total: number) => (total >= 85 ? "var(--success)" : total >= 60 ? "#fbbf24" : "var(--danger)");

/** The mix score as a ring: how full, and the colour of how good. */
export function ScoreRing({ score, size = 56, label }: { score: number; size?: number; label?: string }) {
  const r = 15.5;
  const length = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} role="meter" aria-label={label ?? "Mix score"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={score}>
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r={r} fill="none" stroke="var(--surface-raised)" strokeWidth="3.2" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke={scoreColor(score)}
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeDasharray={`${(Math.max(2, score) / 100) * length} ${length}`}
          style={{ transition: "stroke-dasharray 0.5s ease, stroke 0.5s ease" }}
        />
      </svg>
      <span className="text-base font-extrabold tabular-nums" style={{ color: scoreColor(score), fontSize: size * 0.3 }}>
        {score}
      </span>
    </span>
  );
}

/** Where in the song an idea is best heard: a dot on the song's length. */
function WhereBar({ at, length }: { at: number; length: number }) {
  const left = Math.min(100, Math.max(0, (at / length) * 100));
  return (
    <span className="mt-1 flex items-center gap-1.5" title={`Heard best around ${clock(at)}`}>
      <span className="relative h-1 flex-1 rounded-full bg-surface-raised">
        <span className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-strong" style={{ left: `${left}%` }} />
      </span>
      <span className="text-[9.5px] text-muted tabular-nums">{clock(at)}</span>
    </span>
  );
}

/**
 * One idea, as a switch: on puts it in the mix (with whatever else is
 * on), off takes it out again. Tapping the row opens why it helps and
 * exactly what it changes; `children` go there too (its parts' switches).
 */
export const IdeaSwitch = memo(function IdeaSwitch({
  idea,
  on,
  disabled,
  working,
  expanded,
  songLength,
  onToggle,
  onExpand,
  onHear,
  badge,
  children,
}: {
  idea: Idea;
  on: boolean;
  disabled: boolean;
  working: boolean;
  expanded: boolean;
  songLength: number;
  onToggle: (idea: Idea) => void;
  onExpand: (id: string | null) => void;
  /** Plays it from its best moment (switching it on first). */
  onHear?: (idea: Idea) => void;
  badge?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border transition-colors ${on ? "border-brand/70 bg-brand/10" : "border-border bg-surface"} ${disabled && !on ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-2.5 p-2.5">
        <button type="button" onClick={() => onExpand(expanded ? null : idea.id)} aria-expanded={expanded} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base transition-colors ${on ? "bg-gradient-to-br from-brand to-vocals text-white" : "bg-surface-raised text-brand-strong"}`}
            aria-hidden
          >
            <Icon name={idea.icon} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[13px] font-semibold leading-tight">{idea.title}</span>
              {badge && <span className="shrink-0 rounded-full bg-vocals px-1.5 text-[9px] font-bold leading-4 text-white">{badge}</span>}
            </span>
            <span className="block truncate text-[11px] leading-snug text-muted">{idea.short}</span>
            {idea.listenAt !== undefined && songLength > 0 && <WhereBar at={idea.listenAt} length={songLength} />}
          </span>
          <ChevronDown className={`shrink-0 text-muted transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
        <Switch on={on} onChange={() => onToggle(idea)} label={`${idea.title}: ${on ? "on" : "off"}`} busy={working} disabled={disabled && !on} />
      </div>
      {expanded && (
        <div className="flex flex-col gap-2 border-t border-border/70 px-3 pt-2 pb-3 text-[11px]">
          <p className="text-foreground/90">{idea.why}</p>
          {idea.lines.length > 0 && (
            <div>
              <p className="mb-0.5 font-semibold text-muted">Exactly what it changes</p>
              <ul className="list-disc space-y-0.5 pl-4 text-muted">
                {idea.lines.slice(0, 10).map((line, n) => (
                  <li key={n}>{line}</li>
                ))}
                {idea.lines.length > 10 && <li>…and {idea.lines.length - 10} more</li>}
              </ul>
            </div>
          )}
          {children}
          {onHear && idea.listenAt !== undefined && !disabled && (
            <button type="button" onClick={() => onHear(idea)} className="flex items-center gap-1 self-start rounded-lg border border-border px-2.5 py-1 font-semibold hover:border-brand">
              <Headphones /> Hear it {on ? "" : "on"} from {clock(idea.listenAt)}
            </button>
          )}
          {disabled && !on && <p className="text-amber-400">Doesn&apos;t fit the mix as it is now.</p>}
        </div>
      )}
    </div>
  );
});

export type Choice<T> = { id: T; icon: IconName; title: string; short: string };

/** Choices that exclude each other, as cards: the one picked is ringed. */
export function ChoiceCards<T extends string | number>({
  choices,
  value,
  onChange,
  disabled = false,
  working = null,
  label,
  columns = 2,
}: {
  choices: Choice<T>[];
  value: T;
  onChange: (id: T) => void;
  disabled?: boolean;
  /** The choice being worked out (spinner). */
  working?: T | null;
  label: string;
  columns?: 2 | 4;
}) {
  return (
    <div className={`grid gap-1.5 ${columns === 4 ? "grid-cols-2 sm:grid-cols-4 lg:grid-cols-2" : "grid-cols-2"}`} role="radiogroup" aria-label={label}>
      {choices.map((c) => {
        const picked = c.id === value;
        return (
          <button
            key={String(c.id)}
            type="button"
            role="radio"
            aria-checked={picked}
            disabled={disabled}
            onClick={() => onChange(c.id)}
            className={`relative flex flex-col items-start gap-0.5 rounded-xl border p-2 text-left transition-all active:scale-[0.98] disabled:opacity-50 ${
              picked ? "border-brand bg-brand/15 ring-2 ring-brand/40" : "border-border bg-surface hover:border-brand/60"
            }`}
          >
            <span className={`text-lg leading-none ${picked ? "text-brand-strong" : "text-muted"}`} aria-hidden>
              {working === c.id ? <Loader2 className="animate-spin" /> : <Icon name={c.icon} />}
            </span>
            <span className="text-[12px] font-semibold leading-tight">{c.title}</span>
            <span className="text-[10px] leading-snug text-muted">{c.short}</span>
          </button>
        );
      })}
    </div>
  );
}

/** A setting with a switch: a name, a few words on what it does. */
export function SwitchRow({
  title,
  hint,
  on,
  onChange,
  busy = false,
  disabled = false,
}: {
  title: string;
  hint: string;
  on: boolean;
  onChange: (on: boolean) => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className={`flex items-start gap-2.5 ${disabled && !on ? "opacity-60" : ""}`}>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold">{title}</p>
        <p className="text-[11px] leading-snug text-muted">{hint}</p>
      </div>
      <Switch on={on} onChange={onChange} label={`${title}: ${on ? "on" : "off"}`} busy={busy} disabled={disabled} />
    </div>
  );
}

/** Each part of an idea that's on (its timing, key, volume, sound…), with a switch of its own. */
export function PartChips({ idea, off, working, onPart }: { idea: Idea; off: Part[]; working: string | null; onPart: (idea: Idea, part: Part, on: boolean) => void }) {
  const parts = partsOf(idea);
  if (parts.length < 2) return null;
  return (
    <div className="flex flex-col gap-1">
      <p className="font-semibold text-muted">Switch parts of it on or off</p>
      <div className="flex flex-wrap gap-1" role="group" aria-label={`Parts of ${idea.title}`}>
        {parts.map((part) => {
          const partOn = !off.includes(part);
          const label = PARTS.find((p) => p.id === part)!.label;
          const busy = working === `${idea.id}#${part}`;
          return (
            <button
              key={part}
              type="button"
              onClick={() => onPart(idea, part, !partOn)}
              aria-pressed={partOn}
              aria-busy={busy}
              title={partOn ? `Switch off just its ${label.toLowerCase()}` : `Switch its ${label.toLowerCase()} back on`}
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                partOn ? "border-brand/60 bg-brand/15 text-foreground" : "border-border text-muted line-through"
              }`}
            >
              {busy ? <Loader2 className="animate-spin" /> : partOn ? <CheckIcon /> : <Minus />} {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
