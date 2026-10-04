"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  availableFixes,
  checkMix,
  compatible,
  fixesOf,
  mixFix,
  ideaFits,
  mixSignature,
  prepareSession,
  rebaseSession,
  reworkIdeas,
  studioIdeas,
  syncEverythingIdea,
  timingSignature,
  type Check,
  type FixId,
  type Idea,
  type Session,
  type Step,
} from "@/lib/client/aiIdeas";
import { compare, keepTrial, removeFromTrial, revertTrial, tryIdea, useAiTrial } from "@/lib/client/aiTrial";
import { audioEngine } from "@/lib/client/audioEngine";
import { changeSpeed, gain, nudge, setSpace, spaceOf, transpose, type Space } from "@/lib/client/quickAdjust";
import { useStudioStore, type StudioLane } from "@/lib/client/studioStore";
import { useStudioView } from "@/lib/client/studioView";
import { useKeepScreenOn } from "@/lib/client/wakeLock";

// The AI producer panel, for people who've never used a music app. It
// opens and starts listening by itself, then shows, top to bottom:
//
//   Mix check          — what's wrong right now, in plain words, each with a Fix
//   Make it sound good — one button that fixes it all
//   Styles             — whole remixes to try (radio, club, TikTok…)
//   Drops & moments    — the chorus on the drop, build-ups, stutters… (with
//                        the beat's own drums and bass from the library)
//   More options       — single arrangement, speed and sound ideas
//
// Tapping anything plays it at once, from the original mix; a moment
// tapped while a style is on joins it. The bar at the bottom says what's
// playing, flips Before/After, and keeps it (one undo takes it back).

const STEPS: { id: Step; label: string }[] = [
  { id: "listen", label: "Listening to the vocal and the beat" },
  { id: "match", label: "Finding speed, key, chorus and drop" },
  { id: "ideas", label: "Building ideas" },
];

const STATUS = {
  good: { dot: "bg-success", text: "text-success", label: "Good" },
  warn: { dot: "bg-amber-400", text: "text-amber-400", label: "Could be better" },
  bad: { dot: "bg-danger", text: "text-danger", label: "Needs fixing" },
} as const;

function play(from?: number) {
  if (from !== undefined) audioEngine.seek(from);
  if (!useStudioStore.getState().isPlaying) void audioEngine.play().catch(() => {});
}

function Section({ title, hint, action, children }: { title: string; hint?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold">{title}</h3>
          {hint && <p className="text-[11px] text-muted">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A tap-to-try idea: big icon, name, a few words. */
function Tile({ idea, on, disabled, onClick }: { idea: Idea; on: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      title={idea.why}
      className={`relative flex min-h-[4.75rem] flex-col items-start gap-0.5 rounded-xl border p-2.5 text-left transition-all active:scale-[0.98] disabled:opacity-40 ${
        on ? "border-brand bg-brand/15 ring-2 ring-brand/50" : "border-border bg-surface hover:border-brand/60 hover:bg-surface-hover"
      }`}
    >
      <span className="text-xl leading-none" aria-hidden>
        {idea.icon}
      </span>
      <span className="text-[13px] font-semibold leading-tight">{idea.title}</span>
      <span className="text-[11px] leading-snug text-muted">{idea.short}</span>
      {on && <span className="absolute right-2 top-2 rounded-full bg-brand px-1.5 py-px text-[9px] font-bold text-white">▶ ON</span>}
    </button>
  );
}

/** A plain list row for the "More options" lists. */
function Row({ idea, on, disabled, onClick }: { idea: Idea; on: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      title={idea.why}
      className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors disabled:opacity-40 ${
        on ? "border-brand bg-brand/15" : "border-transparent hover:bg-surface-hover"
      }`}
    >
      <span className="w-6 shrink-0 text-center text-base" aria-hidden>
        {idea.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold">{idea.title}</span>
        <span className="block truncate text-[11px] text-muted">{idea.short}</span>
      </span>
      <span className={`shrink-0 text-[11px] font-semibold ${on ? "text-brand-strong" : "text-muted"}`}>{on ? "▶ On" : "Try"}</span>
    </button>
  );
}

function MixCheck({ checks, onFix, canFix, trying }: { checks: Check[]; onFix: (fix: FixId) => void; canFix: (fix?: FixId) => boolean; trying: boolean }) {
  const good = checks.filter((c) => c.status === "good").length;
  const score = checks.length ? good / checks.length : 1;
  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold">🩺 Mix check{trying && <span className="ml-1.5 text-[11px] font-normal text-muted">(with the idea on)</span>}</h3>
        <span className={`text-xs font-bold tabular-nums ${score === 1 ? "text-success" : score >= 0.5 ? "text-amber-400" : "text-danger"}`}>
          {good} / {checks.length} good
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-raised">
        <div
          className={`h-full rounded-full transition-all duration-500 ${score === 1 ? "bg-success" : score >= 0.5 ? "bg-amber-400" : "bg-danger"}`}
          style={{ width: `${Math.max(4, score * 100)}%` }}
        />
      </div>
      <ul className="mt-2.5 flex flex-col gap-1.5">
        {checks.map((c) => (
          <li key={c.id} className="flex items-start gap-2 text-xs">
            <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${STATUS[c.status].dot}`} aria-label={STATUS[c.status].label} />
            <span className="min-w-0 flex-1">
              <span className="font-semibold">{c.label}: </span>
              <span className="text-muted">{c.text}</span>
            </span>
            {c.status !== "good" && canFix(c.fix) && (
              <button onClick={() => onFix(c.fix!)} className="shrink-0 rounded-md bg-brand px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-brand-strong pointer-coarse:py-1.5">
                Fix
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One row of the Fine-tune section: a name and a few buttons. */
function TuneRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold">{label}</p>
        {hint && <p className="truncate text-[10px] text-muted">{hint}</p>}
      </div>
      <div className="flex shrink-0 overflow-hidden rounded-lg border border-border">{children}</div>
    </div>
  );
}

function TuneButton({ onClick, children, active, title }: { onClick: () => void; children: React.ReactNode; active?: boolean; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`min-w-[2.75rem] border-l border-border px-2.5 py-1.5 text-[11px] font-semibold first:border-l-0 ${
        active ? "bg-brand text-white" : "hover:bg-surface-hover"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Hands-on fixes for what's left after an idea: the vocal early or late,
 * louder or softer, higher or lower; the beat's level; the whole song's
 * speed; and how much space around the voice.
 */
function FineTune({ vocal, beat }: { vocal: StudioLane; beat: StudioLane | null }) {
  const projectBpm = useStudioStore((s) => s.projectBpm);
  const before = () => keepWhatsPlaying();
  const space = spaceOf(vocal.fx);
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-border bg-surface p-3">
      <TuneRow label="Vocal timing" hint="Early or late? Move it (in beats)">
        <TuneButton onClick={() => (before(), nudge(vocal.laneId, -0.5))} title="Half a beat earlier">−½</TuneButton>
        <TuneButton onClick={() => (before(), nudge(vocal.laneId, -0.125))} title="An eighth of a beat earlier">−⅛</TuneButton>
        <TuneButton onClick={() => (before(), nudge(vocal.laneId, 0.125))} title="An eighth of a beat later">+⅛</TuneButton>
        <TuneButton onClick={() => (before(), nudge(vocal.laneId, 0.5))} title="Half a beat later">+½</TuneButton>
      </TuneRow>
      <TuneRow label="Vocal volume" hint={`${Math.round(vocal.volume * 100)}%`}>
        <TuneButton onClick={() => (before(), gain(vocal.laneId, -1.5))}>−</TuneButton>
        <TuneButton onClick={() => (before(), gain(vocal.laneId, 1.5))}>+</TuneButton>
      </TuneRow>
      {beat && (
        <TuneRow label="Beat volume" hint={`${Math.round(beat.volume * 100)}%`}>
          <TuneButton onClick={() => (before(), gain(beat.laneId, -1.5))}>−</TuneButton>
          <TuneButton onClick={() => (before(), gain(beat.laneId, 1.5))}>+</TuneButton>
        </TuneRow>
      )}
      <TuneRow label="Vocal pitch" hint={vocal.pitchSemitones ? `${vocal.pitchSemitones > 0 ? "+" : ""}${vocal.pitchSemitones} semitones` : "as sung"}>
        <TuneButton onClick={() => (before(), transpose(vocal.laneId, -1))} title="A semitone lower">Lower</TuneButton>
        <TuneButton onClick={() => (before(), transpose(vocal.laneId, 1))} title="A semitone higher">Higher</TuneButton>
      </TuneRow>
      <TuneRow label="Whole song speed" hint={`${projectBpm.toFixed(0)} BPM`}>
        <TuneButton onClick={() => (before(), changeSpeed(0.97))}>Slower</TuneButton>
        <TuneButton onClick={() => (before(), changeSpeed(1.03))}>Faster</TuneButton>
      </TuneRow>
      <TuneRow label="Space around the voice">
        {(["dry", "room", "hall"] as Space[]).map((s) => (
          <TuneButton key={s} active={space === s} onClick={() => (before(), setSpace(vocal.laneId, s))}>
            {s === "dry" ? "Dry" : s === "room" ? "Room" : "Hall"}
          </TuneButton>
        ))}
      </TuneRow>
    </div>
  );
}

/** Fine-tuning works on the mix as it is: an idea being tried is kept first. */
function keepWhatsPlaying() {
  if (useAiTrial.getState().trial) keepTrial();
}

export default function AiProducer() {
  const open = useStudioView((s) => s.aiOpen);
  const setOpen = useStudioView((s) => s.setAiOpen);
  const notify = useStudioView((s) => s.notify);
  const lanes = useStudioStore((s) => s.lanes);
  const projectBpm = useStudioStore((s) => s.projectBpm);
  const trial = useAiTrial((s) => s.trial);
  const [vocalId, setVocalId] = useState("");
  const [beatId, setBeatId] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [step, setStep] = useState<Step | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const run = useRef(0);
  const busy = step !== null;
  useKeepScreenOn("ai-producer", busy);

  const vocals = lanes.filter((l) => l.kind === "vocals");
  const backings = lanes.filter((l) => l.kind !== "vocals");
  const signature = mixSignature(lanes);
  const timing = timingSignature(lanes, projectBpm);
  const stale = !!session && session.signature !== signature;
  const repicked = !!session && ((!!vocalId && session.vocal?.laneId !== vocalId) || (!!beatId && session.beat?.laneId !== beatId));
  const onIds = new Set(trial?.ideas.map((i) => i.id) ?? []);
  const trying = trial?.ideas ?? [];
  const byId = (id?: string) => ideas.find((i) => i.id === id);
  const checks = useMemo(() => (session ? checkMix(session, lanes) : []), [session, lanes]);

  /** Listens to the lanes and works out the ideas. */
  async function analyse() {
    const id = ++run.current;
    revertTrial();
    setError(null);
    try {
      const fresh = await prepareSession(vocalId || null, beatId || null, { vibe: "any" }, (s) => id === run.current && setStep(s));
      if (id !== run.current) return;
      // Let the steps paint before the (synchronous) arranging.
      await new Promise((r) => setTimeout(r, 30));
      const found = studioIdeas(fresh);
      const sync = await syncEverythingIdea(fresh).catch(() => null);
      if (id !== run.current) return;
      setSession(fresh);
      setIdeas(sync ? [...found, sync] : found);
    } catch (err) {
      if (id === run.current) setError(err instanceof Error ? err.message : "Couldn't listen to the lanes");
    } finally {
      if (id === run.current) setStep(null);
    }
  }
  const analyseRef = useRef(analyse);
  useEffect(() => {
    analyseRef.current = analyse;
  });

  // Opening the panel, or changing which lanes there are, starts listening by itself.
  // (Not again after it failed: the person retries.)
  const needsListen = open && lanes.length > 0 && !busy && !trial && !error && (!session || stale || repicked);
  useEffect(() => {
    if (!needsListen) return;
    const timer = setTimeout(() => void analyseRef.current(), session ? 700 : 0);
    return () => clearTimeout(timer);
  }, [needsListen, session]);

  // The person moved things themselves (or kept an idea): work the ideas
  // out again for where things are now, from what was already heard.
  useEffect(() => {
    if (!session || trial || stale || busy || session.timing === timing) return;
    const timer = setTimeout(() => {
      const rebased = rebaseSession(session);
      setSession(rebased);
      setIdeas((current) => reworkIdeas(rebased, current));
    }, 350);
    return () => clearTimeout(timer);
  }, [session, trial, stale, busy, timing]);

  /** The mix every try starts from: the original while an idea is on. */
  const startLanes = () => useAiTrial.getState().trial?.baseline.lanes ?? useStudioStore.getState().lanes;

  /** Plays an idea: on top of what's on if it fits alongside, else instead. Tapping one that's on takes it off. */
  function toggle(idea: Idea) {
    if (!session) return;
    setError(null);
    if (onIds.has(idea.id)) {
      removeFromTrial(session, idea.id);
      return;
    }
    const add = trying.length > 0 && trying.every((t) => compatible(t, idea));
    if (!tryIdea(session, idea, { add })) {
      setError(`“${idea.title}” doesn't fit the mix as it is now — it's being worked out again.`);
      return;
    }
    play(idea.listenAt);
  }

  function surprise() {
    if (!session) return;
    const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];
    const styles = ideas.filter((i) => i.kind === "full" && ideaFits(i, startLanes()));
    const style = pick(styles.length ? styles : ideas.filter((i) => ideaFits(i, startLanes())));
    if (!style || !tryIdea(session, style)) return;
    const moments = ideas.filter((i) => i.kind === "moment" && ideaFits(i, startLanes()) && compatible(style, i));
    const moment = moments.length ? pick(moments) : null;
    if (moment) tryIdea(session, moment, { add: true });
    play(moment?.listenAt ?? style.listenAt);
  }

  function stepThrough(delta: number) {
    const list = ideas.filter((i) => ideaFits(i, startLanes()));
    if (!list.length || !session) return;
    const currentId = trying[trying.length - 1]?.id;
    const next = list[(list.findIndex((i) => i.id === currentId) + delta + list.length) % list.length];
    if (tryIdea(session, next)) play(useStudioStore.getState().isPlaying ? undefined : next.listenAt);
  }

  function keep() {
    const kept = keepTrial();
    if (kept.length) notify(`Kept “${kept.map((i) => i.title).join(" + ")}” — ⌘Z to undo`);
  }

  function close() {
    // Like closing a preset browser: what's playing stays.
    if (useAiTrial.getState().trial) keep();
    setOpen(false);
  }

  // The Mix check's fixes build on each other: pressing one adds it to the
  // fixes already on, all worked out together, so none undoes another.
  const fixable = useMemo(() => (session ? availableFixes(session) : new Set<FixId>()), [session]);
  const fixesOn = new Set(trying.flatMap(fixesOf));
  function fixCheck(fix: FixId) {
    if (!session) return;
    setError(null);
    const idea = mixFix(session, [...fixesOn, fix]);
    if (!idea || !tryIdea(session, idea, { add: true })) {
      setError("That can't be fixed automatically for this mix — try Fine-tune below.");
      return;
    }
    play(idea.listenAt);
  }

  // Keys: , and . flip through ideas, B before/after, Enter keeps, Esc closes.
  const keys = useRef({ stepThrough, keep, close });
  useEffect(() => {
    keys.current = { stepThrough, keep, close };
  });
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]") || document.querySelector('[role="menu"]')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const has = !!useAiTrial.getState().trial;
      if (e.key === "Escape") keys.current.close();
      else if ((e.key === "b" || e.key === "B") && has) compare();
      else if (e.key === "," || e.key === ".") keys.current.stepThrough(e.key === "." ? 1 : -1);
      else if (e.key === "Enter" && has) keys.current.keep();
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [open]);

  if (!open) return null;

  const auto = byId("auto-good");
  const styles = ideas.filter((i) => i.kind === "full");
  const moments = ideas.filter((i) => i.kind === "moment");
  // The Mix check's own fixes aren't in the list; these are the rest.
  const otherFixes = ideas.filter((i) => i.kind === "fix");
  const arrangement = ideas.filter((i) => i.kind === "idea" && i.role !== "engineer");
  const sounds = ideas.filter((i) => i.kind === "idea" && i.role === "engineer");
  const fits = (i: Idea) => ideaFits(i, trial?.baseline.lanes ?? lanes);
  const missing = !vocals.length ? "vocal" : !backings.length ? "beat" : null;
  const current = trying[trying.length - 1];
  const hasPartLanes = lanes.some((l) => l.kind === "drums" || l.kind === "bass");
  const partsNote = hasPartLanes || session?.beatParts.length ? " · drops use the beat's own drums & bass" : "";
  const vocalLane = lanes.find((l) => l.laneId === session?.vocal?.laneId) ?? null;
  const beatLane = lanes.find((l) => l.laneId === session?.beat?.laneId) ?? null;

  return (
    <>
      <div className="fixed inset-0 z-[55] bg-black/40 lg:hidden" onClick={close} />
      <aside
        aria-label="AI producer"
        className="touch-targets fixed z-[56] flex flex-col border-border bg-background shadow-2xl max-lg:inset-x-0 max-lg:bottom-0 max-lg:max-h-[90dvh] max-lg:rounded-t-2xl max-lg:border max-lg:border-b-0 lg:top-[var(--header-h)] lg:right-0 lg:bottom-0 lg:w-[27rem] lg:border-l"
        style={{ animation: "sheet-in 0.2s ease-out" }}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border lg:hidden" aria-hidden />
        <header className="flex items-center gap-2.5 border-b border-border px-4 py-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-vocals text-lg">✨</span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold">AI producer</h2>
            <p className="truncate text-[11px] text-muted">Tap anything to hear it — nothing is final until you keep it</p>
          </div>
          <button onClick={close} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-foreground" aria-label="Close (keeps what's playing)">
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          {lanes.length === 0 || missing ? (
            <div className="flex flex-col gap-3 py-2 text-sm">
              <p className="text-base font-bold">Let&apos;s make a remix</p>
              <p className="text-muted">The AI needs a vocal and a beat to work with. Pick them from the library — any vocal over any song.</p>
              {[
                { done: vocals.length > 0, icon: "🎤", text: "A vocal (someone singing or rapping)" },
                { done: backings.length > 0, icon: "🥁", text: "A beat (the music of another song)" },
              ].map((s) => (
                <div key={s.text} className={`flex items-center gap-3 rounded-xl border p-3 ${s.done ? "border-success/50 bg-success/10" : "border-dashed border-border"}`}>
                  <span className="text-2xl">{s.icon}</span>
                  <span className="flex-1">{s.text}</span>
                  <span className={`text-xs font-semibold ${s.done ? "text-success" : "text-muted"}`}>{s.done ? "✓ Added" : "Not yet"}</span>
                </div>
              ))}
              <p className="text-xs text-muted">As soon as both are in, this panel listens to them and shows you how to make them sound good together.</p>
              {lanes.length > 0 && (
                <button onClick={() => void analyse()} disabled={busy} className="self-start text-xs text-brand-strong hover:underline">
                  Get sound ideas anyway →
                </button>
              )}
            </div>
          ) : null}

          {busy && (
            <div className="my-2 rounded-2xl border border-brand/40 bg-brand/10 p-4">
              <p className="text-sm font-bold">Listening…</p>
              <ol className="mt-3 flex flex-col gap-2 text-xs">
                {STEPS.map((s, i) => {
                  const now = STEPS.findIndex((x) => x.id === step);
                  const state = i < now ? "done" : i === now ? "now" : "next";
                  return (
                    <li key={s.id} className={`flex items-center gap-2 ${state === "next" ? "text-muted" : ""}`}>
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                          state === "done" ? "bg-success text-white" : state === "now" ? "animate-pulse-glow bg-brand text-white" : "bg-surface-raised"
                        }`}
                      >
                        {state === "done" ? "✓" : i + 1}
                      </span>
                      {s.label}
                    </li>
                  );
                })}
              </ol>
              <p className="mt-3 text-[11px] text-muted">A few seconds — it all happens on this device.</p>
            </div>
          )}

          {error && (
            <p className="mb-3 flex items-center gap-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
              <span className="flex-1">{error}</span>
              <button onClick={() => void analyse()} disabled={busy} className="shrink-0 font-semibold underline">
                Try again
              </button>
            </p>
          )}

          {session && !busy && !missing && (
            <div className="flex flex-col gap-5">
              {(vocals.length > 1 || backings.length > 1) && (
                <div className="grid grid-cols-2 gap-2 text-[11px] text-muted">
                  <label className="flex flex-col gap-1">
                    Vocal to work on
                    <select value={vocalId} onChange={(e) => setVocalId(e.target.value)} className="input !py-1 text-xs">
                      <option value="">{session.vocal?.trackTitle ?? "Auto"}</option>
                      {vocals.map((l) => (
                        <option key={l.laneId} value={l.laneId}>
                          {l.trackTitle}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    Beat to work on
                    <select value={beatId} onChange={(e) => setBeatId(e.target.value)} className="input !py-1 text-xs">
                      <option value="">{session.beat?.trackTitle ?? "Auto"}</option>
                      {backings.map((l) => (
                        <option key={l.laneId} value={l.laneId}>
                          {l.trackTitle}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              {checks.length > 0 && (
                <MixCheck
                  checks={checks}
                  trying={!!trial && trial.showing === "idea"}
                  canFix={(fix) => !!fix && fixable.has(fix) && !fixesOn.has(fix)}
                  onFix={fixCheck}
                />
              )}

              {auto && (
                <div>
                  <button
                    onClick={() => toggle(auto)}
                    disabled={!fits(auto)}
                    className={`w-full rounded-2xl px-4 py-3.5 text-left text-white shadow-[0_0_28px_-10px_var(--vocals)] transition-all active:scale-[0.99] disabled:opacity-50 ${
                      onIds.has(auto.id) ? "bg-brand ring-2 ring-brand-strong" : "bg-gradient-to-r from-brand to-vocals hover:brightness-110"
                    }`}
                  >
                    <span className="block text-base font-bold">{onIds.has(auto.id) ? "▶ Playing: made to sound good" : "✨ Make it sound good"}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-white/85">{auto.short}</span>
                  </button>
                  <p className="mt-1.5 text-center text-[11px] text-muted">One tap fixes it all. Then try a style or a drop below.</p>
                </div>
              )}

              {styles.length > 0 && (
                <Section
                  title="🎨 Styles"
                  hint="A whole remix in one tap"
                  action={
                    <button onClick={surprise} className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold hover:border-brand">
                      🎲 Surprise me
                    </button>
                  }
                >
                  <div className="grid grid-cols-2 gap-2">
                    {styles.map((idea) => (
                      <Tile key={idea.id} idea={idea} on={onIds.has(idea.id)} disabled={!fits(idea)} onClick={() => toggle(idea)} />
                    ))}
                  </div>
                </Section>
              )}

              {moments.length > 0 && (
                <Section
                  title="💥 Drops & moments"
                  hint={
                    session.drop
                      ? `The beat's ${session.drop.kind === "drop" ? "drop" : "biggest moment"} is at bar ${session.drop.bar + 1}${partsNote}`
                      : `Moments that make people listen${partsNote}`
                  }
                >
                  <div className="grid grid-cols-2 gap-2">
                    {moments.map((idea) => (
                      <Tile key={idea.id} idea={idea} on={onIds.has(idea.id)} disabled={!fits(idea)} onClick={() => toggle(idea)} />
                    ))}
                  </div>
                </Section>
              )}

              {vocalLane && (
                <Section title="🎚 Fine-tune" hint="Small hands-on fixes — each one is a single undo">
                  <FineTune vocal={vocalLane} beat={beatLane} />
                </Section>
              )}

              {(arrangement.length > 0 || sounds.length > 0 || otherFixes.length > 0) && (
                <details className="group rounded-xl border border-border">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm font-bold">
                    🎛 More options
                    <span className="text-xs font-normal text-muted group-open:hidden">
                      {arrangement.length + sounds.length + otherFixes.length} more ▾
                    </span>
                  </summary>
                  <div className="flex flex-col gap-3 px-1.5 pb-2">
                    {[
                      { title: "Song shape & speed", items: arrangement },
                      { title: "Sound", items: sounds },
                      { title: "Other fixes", items: otherFixes },
                    ].map(
                      (group) =>
                        group.items.length > 0 && (
                          <div key={group.title}>
                            <p className="px-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{group.title}</p>
                            <div className="flex flex-col">
                              {group.items.map((idea) => (
                                <Row key={idea.id} idea={idea} on={onIds.has(idea.id)} disabled={!fits(idea)} onClick={() => toggle(idea)} />
                              ))}
                            </div>
                          </div>
                        )
                    )}
                  </div>
                </details>
              )}

              {session.notes.map((note) => (
                <p key={note} className="text-[11px] text-muted">
                  ℹ {note}
                </p>
              ))}
            </div>
          )}
        </div>

        {trial && current && (
          <footer className="border-t border-border bg-surface px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center gap-2">
              <div className="flex shrink-0 overflow-hidden rounded-lg border border-border">
                <button onClick={() => stepThrough(-1)} className="px-2.5 py-1.5 text-xs hover:bg-surface-hover" aria-label="Previous idea (,)" title="Previous idea (,)">
                  ◀
                </button>
                <button onClick={() => stepThrough(1)} className="border-l border-border px-2.5 py-1.5 text-xs hover:bg-surface-hover" aria-label="Next idea (.)" title="Next idea (.)">
                  ▶
                </button>
              </div>
              <button onClick={() => setDetails((d) => !d)} className="min-w-0 flex-1 text-left" aria-expanded={details}>
                <span className="block truncate text-xs font-semibold">
                  {trial.showing === "idea" ? "▶ " : "⏸ Before · "}
                  {trying.map((i) => `${i.icon} ${i.title}`).join(" + ")}
                </span>
                <span className="block text-[10px] text-muted">{details ? "Hide details ▴" : "What changed? ▾"}</span>
              </button>
              <div className="flex shrink-0 overflow-hidden rounded-lg border border-border text-[11px] font-bold" role="group" aria-label="Compare (B)" title="Compare (B)">
                {(["original", "idea"] as const).map((side) => (
                  <button
                    key={side}
                    onClick={() => compare(side)}
                    aria-pressed={trial.showing === side}
                    className={`px-2.5 py-1.5 ${trial.showing === side ? "bg-brand text-white" : "text-muted hover:text-foreground"}`}
                  >
                    {side === "original" ? "Before" : "After"}
                  </button>
                ))}
              </div>
            </div>
            {details && (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-lg bg-background p-2.5 text-[11px] text-muted">
                {trying.map((i) => (
                  <div key={i.id} className="mb-2 last:mb-0">
                    <p className="font-semibold text-foreground">
                      {i.icon} {i.title}
                    </p>
                    <p className="mt-0.5">{i.why}</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                      {i.lines.map((line, n) => (
                        <li key={n}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 flex gap-2">
              <button onClick={revertTrial} className="flex-1 rounded-lg border border-border py-2 text-xs font-medium hover:border-danger/60 hover:text-danger">
                ✕ Undo
              </button>
              <button onClick={keep} className="flex-[2] rounded-lg bg-success py-2 text-xs font-bold text-white hover:opacity-90" title="Keep (Enter)">
                ✓ Keep it
              </button>
            </div>
          </footer>
        )}
      </aside>
    </>
  );
}
