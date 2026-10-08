"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpToLine,
  Bandage,
  CassetteTape,
  CheckIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Dices,
  Disc3,
  Drum,
  Info,
  Link,
  Loader2,
  MessageCircle,
  Mic,
  Minus,
  Palette,
  Pause,
  Play,
  Plus,
  Puzzle,
  Radio,
  RectangleHorizontal,
  Scissors,
  Search,
  SlidersHorizontal,
  SlidersVertical,
  Sparkles,
  Stethoscope,
  Trophy,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Icon, type IconName } from "@/components/Icon";
import {
  availableFixes,
  checkMix,
  compatible,
  fixesOf,
  mixFix,
  ideaFits,
  leadOf,
  masterFor,
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
import type { CoproducerContext } from "@/lib/client/coproducerTools";
import { bestVersions, scoreMix, scoreWord, type MixScore, type Version } from "@/lib/client/mixScore";
import { beatModelEnabled, setBeatModelEnabled, useBeatModel } from "@/lib/client/neuralBeats";
import { setStretchEngine, stretchEngine } from "@/lib/client/pitchTempo";
import { audioEngine } from "@/lib/client/audioEngine";
import { changeSpeed, gain, nudge, setSpace, spaceOf, transpose, type Space } from "@/lib/client/quickAdjust";
import { startNewStep } from "@/lib/client/studioHistory";
import { MASTER_PRESETS, laneName, useStudioStore, type StudioLane } from "@/lib/client/studioStore";
import { loadKeepWhole, loadSync, saveKeepWhole, saveSync, type Vibe } from "@/lib/client/aiControl";
import { masterPresetOf } from "./MasterPanel";
import CoProducer from "./CoProducer";
import MatchFinder from "./MatchFinder";
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
//   Vocal layers       — doubles and octaves that follow the vocal
//   Master it          — one-tap mastering, the preset that suits the style picked
//   Find a match       — library beats (or vocals) that fit with the least stretching
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

const bpmNow = () => useStudioStore.getState().projectBpm;

/**
 * Trying an idea never moves the playhead: it stays on the same spot in
 * the song — scaled when the idea made the whole song faster or slower.
 */
function keepPlace(bpmBefore: number) {
  const { projectBpm, playhead } = useStudioStore.getState();
  if (Math.abs(projectBpm - bpmBefore) > 0.01) audioEngine.seek((playhead * bpmBefore) / projectBpm);
}

/** Plays on from where the playhead is (starts playing if stopped). */
function playOn() {
  if (!useStudioStore.getState().isPlaying) void audioEngine.play().catch(() => {});
}

type Tab = "sync" | "styles" | "moments" | "mix" | "ask";

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "sync", label: "Sync", icon: Link },
  { id: "styles", label: "Styles", icon: Palette },
  { id: "moments", label: "Moments", icon: Zap },
  { id: "mix", label: "Mix", icon: SlidersVertical },
  { id: "ask", label: "Ask AI", icon: MessageCircle },
];

/** Ideas that place the vocal or change the speed — only one of those is on at a time. */
const isTiming = (i: Idea) => i.aspects.includes("arrangement") || i.aspects.includes("tempo");

/** Puts back on, worked out for `session`, the ideas that were on (by id). */
function putBackOn(session: Session, ideas: Idea[], ids: string[]) {
  for (const ideaId of ids) {
    const again = ideaId.startsWith("fix:") ? mixFix(session, fixesOf({ id: ideaId } as Idea)) : ideas.find((i) => i.id === ideaId);
    if (again) tryIdea(session, again, { add: true });
  }
}

/** Runs a change to what's being tried, keeping the playhead's place in the song. */
function inPlace(change: () => void) {
  const bpm = bpmNow();
  change();
  keepPlace(bpm);
}

function Section({ icon: SectionIcon, title, hint, action, children }: { icon: LucideIcon; title: string; hint?: string; action?: React.ReactNode; children: React.ReactNode }) {
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

/** A tap-to-try idea: big icon, name, a few words. `selected` marks a setting that's chosen (a sync). */
function Tile({ idea, on, disabled, onClick, selected = false, badge }: { idea: Idea; on: boolean; disabled: boolean; onClick: () => void; selected?: boolean; badge?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on || selected}
      title={idea.why}
      className={`relative flex h-full min-h-[4.75rem] w-full flex-col items-start gap-0.5 rounded-xl border p-2.5 text-left transition-all active:scale-[0.98] disabled:opacity-40 ${
        on ? "border-brand bg-brand/15 ring-2 ring-brand/50" : selected ? "border-brand/70 bg-brand/[0.07]" : "border-border bg-surface hover:border-brand/60 hover:bg-surface-hover"
      }`}
    >
      <span className="text-xl leading-none text-brand-strong" aria-hidden>
        <Icon name={idea.icon} />
      </span>
      <span className="pr-8 text-[13px] font-semibold leading-tight">{idea.title}</span>
      <span className="text-[11px] leading-snug text-muted">{idea.short}</span>
      {on ? (
        <span className="absolute right-2 top-2 flex items-center gap-0.5 rounded-full bg-brand px-1.5 py-px text-[9px] font-bold text-white">
          <Play className="fill-current" /> ON
        </span>
      ) : badge ? (
        <span className={`absolute right-1.5 top-1.5 rounded-full px-1.5 py-px text-[9px] font-bold text-white ${selected ? "bg-brand" : "bg-vocals"}`}>{badge}</span>
      ) : null}
    </button>
  );
}

/** A plain list row, for the longer lists. */
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
      <span className="w-6 shrink-0 text-center text-base text-brand-strong" aria-hidden>
        <Icon name={idea.icon} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold">{idea.title}</span>
        <span className="block truncate text-[11px] text-muted">{idea.short}</span>
      </span>
      <span className={`shrink-0 text-[11px] font-semibold ${on ? "text-brand-strong" : "text-muted"}`}>
        {on ? (
          <>
            <Play className="fill-current" /> On
          </>
        ) : (
          "Try"
        )}
      </span>
    </button>
  );
}

function MixCheck({ checks, onFix, canFix, trying, total }: { checks: Check[]; onFix: (fix: FixId) => void; canFix: (fix?: FixId) => boolean; trying: boolean; total: MixScore | null }) {
  const good = checks.filter((c) => c.status === "good").length;
  const score = checks.length ? good / checks.length : 1;
  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold">
          <Stethoscope className="mr-1.5 text-brand-strong" />
          Mix check{trying && <span className="ml-1.5 text-[11px] font-normal text-muted">(with the idea on)</span>}
        </h3>
        <span className={`text-xs font-bold tabular-nums ${score === 1 ? "text-success" : score >= 0.5 ? "text-amber-400" : "text-danger"}`}>
          {total ? `${total.total}/100 · ` : ""}
          {good} / {checks.length} good
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-raised">
        <div
          className={`h-full rounded-full transition-all duration-500 ${score === 1 ? "bg-success" : score >= 0.5 ? "bg-amber-400" : "bg-danger"}`}
          style={{ width: `${Math.max(4, score * 100)}%` }}
        />
      </div>
      {total && <p className="mt-1.5 text-[11px] text-muted">{scoreWord(total.total)} — scored on speed, groove, bars, harmony, balance, how natural it sounds and the ending</p>}
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
        <TuneButton onClick={() => (before(), gain(vocal.laneId, -1.5))} title="Vocal quieter">
          <Minus className="text-sm" />
        </TuneButton>
        <TuneButton onClick={() => (before(), gain(vocal.laneId, 1.5))} title="Vocal louder">
          <Plus className="text-sm" />
        </TuneButton>
      </TuneRow>
      {beat && (
        <TuneRow label="Beat volume" hint={`${Math.round(beat.volume * 100)}%`}>
          <TuneButton onClick={() => (before(), gain(beat.laneId, -1.5))} title="Beat quieter">
            <Minus className="text-sm" />
          </TuneButton>
          <TuneButton onClick={() => (before(), gain(beat.laneId, 1.5))} title="Beat louder">
            <Plus className="text-sm" />
          </TuneButton>
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

/**
 * One-tap mastering: the master bus presets, with the one that suits the
 * style being tried (or last kept) marked as the AI's pick.
 */
function MasterIt({ vibes }: { vibes: Vibe[] }) {
  const master = useStudioStore((s) => s.master);
  const current = masterPresetOf(master);
  const pick = masterFor(vibes);
  return (
    <div className="grid grid-cols-2 gap-1.5 min-[480px]:grid-cols-3 lg:grid-cols-2">
      {MASTER_PRESETS.filter((p) => p.id !== "off").map((p) => {
        const on = current?.id === p.id;
        return (
          <button
            key={p.id}
            onClick={() => {
              keepWhatsPlaying();
              startNewStep();
              useStudioStore.getState().setMaster(on ? MASTER_PRESETS[0].master : p.master);
              useStudioView.getState().notify(on ? "Master off" : `Mastered: ${p.label} — ⌘Z to undo`);
            }}
            aria-pressed={on}
            title={p.hint}
            className={`relative h-full rounded-xl border px-2.5 py-2 text-left text-xs transition-colors ${on ? "border-brand bg-brand/15" : "border-border bg-surface hover:border-brand/60"}`}
          >
            <span className="block font-semibold">{p.label}</span>
            <span className="line-clamp-2 block text-[10px] leading-snug text-muted">{p.hint}</span>
            {p.id === pick && !on && <span className="absolute -top-1.5 right-1.5 rounded-full bg-vocals px-1.5 text-[9px] font-bold text-white">AI pick</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The AI auditioning its own ideas: every whole-mix idea scored as it
 * would sound (mixScore.ts), best first, each one tap to hear.
 */
function BestVersions({ session, ideas, onTry, onIds }: { session: Session; ideas: Idea[]; onTry: (idea: Idea) => void; onIds: Set<string> }) {
  const [result, setResult] = useState<{ now: MixScore; versions: Version[] } | null>(null);
  const [working, setWorking] = useState(false);
  function find() {
    setWorking(true);
    // A frame to show it's working: scoring every idea takes a moment.
    setTimeout(() => {
      const found = bestVersions(session, ideas, 4);
      setResult(found);
      setWorking(false);
      const best = found.versions[0];
      if (best && best.score.total > found.now.total && !onIds.has(best.idea.id)) onTry(best.idea);
    }, 30);
  }
  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold">
            <Trophy className="mr-1.5 text-brand-strong" />
            Find the best version
          </h3>
          <p className="text-[11px] text-muted">The AI scores every way it could sync and style this mix, and plays you the best one</p>
        </div>
        <button onClick={find} disabled={working} className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
          {working ? <Loader2 className="animate-spin" /> : result ? "Again" : "Find it"}
        </button>
      </div>
      {result && (
        <ul className="mt-2.5 flex flex-col gap-1.5">
          <li className="flex items-center gap-2 text-[11px] text-muted">
            <span className="w-8 shrink-0 text-right font-bold tabular-nums">{result.now.total}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-raised">
              <span className="block h-full rounded-full bg-muted/60" style={{ width: `${result.now.total}%` }} />
            </span>
            <span className="w-28 shrink-0 truncate">your mix now</span>
          </li>
          {result.versions.map((v) => (
            <li key={v.idea.id}>
              <button onClick={() => onTry(v.idea)} className={`flex w-full items-center gap-2 rounded-lg px-0 py-0.5 text-left text-[11px] hover:bg-surface-hover ${onIds.has(v.idea.id) ? "font-semibold text-foreground" : ""}`} title={v.score.parts.map((p) => `${p.label}: ${Math.round(p.score * 100)} — ${p.text}`).join("\n")}>
                <span className="w-8 shrink-0 text-right font-bold tabular-nums">{v.score.total}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-raised">
                  <span className={`block h-full rounded-full ${v.score.total >= 85 ? "bg-success" : v.score.total >= 70 ? "bg-brand" : "bg-amber-400"}`} style={{ width: `${v.score.total}%` }} />
                </span>
                <span className="w-28 shrink-0 truncate">
                  {onIds.has(v.idea.id) && <Play className="mr-0.5 fill-current" />}
                  {v.idea.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** How the Studio listens and stretches: the beat model and the high-quality stretcher, each with a switch. */
function Engines() {
  const model = useBeatModel();
  const [beatsOn, setBeatsOn] = useState(true);
  const [hq, setHq] = useState(true);
  const [rerendering, setRerendering] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage only exists after mount
    setBeatsOn(beatModelEnabled());
    setHq(stretchEngine() === "hq");
  }, []);
  const status =
    !beatsOn || model.status === "off"
      ? "off — bars come from the Studio's own tracker"
      : model.status === "loading"
        ? model.fromCache
          ? "starting…"
          : `downloading ${Math.round((100 * model.loaded) / Math.max(1, model.total))}% of ${(model.total / 1e6).toFixed(0)} MB (first time only)`
        : model.status === "failed"
          ? `couldn't load (${model.error ?? "error"}) — using the Studio's own tracker`
          : model.working
            ? "listening to the beat…"
            : model.status === "ready"
              ? "on — hears every beat and where each bar starts"
              : "on — loads when the AI first listens";
  return (
    <details className="group rounded-xl border border-border text-[11px]">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 font-semibold">
        <span>
          <Sparkles /> Listening & sound engines
        </span>
        <ChevronDown className="text-muted group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-2.5 px-3 pb-3">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={beatsOn}
            onChange={(e) => {
              setBeatsOn(e.target.checked);
              setBeatModelEnabled(e.target.checked);
            }}
            className="mt-0.5"
          />
          <span>
            <span className="font-semibold">AI beat tracking</span> (Beat This! model, ~10 MB, runs on this device)
            <span className="block text-muted">{status}</span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={hq}
            disabled={rerendering}
            onChange={(e) => {
              setHq(e.target.checked);
              setStretchEngine(e.target.checked ? "hq" : "classic");
              setRerendering(true);
              void audioEngine.rerenderAll().finally(() => setRerendering(false));
            }}
            className="mt-0.5"
          />
          <span>
            <span className="font-semibold">High-quality stretch</span> — cleaner speed and key changes, voices keep their natural tone
            <span className="block text-muted">{rerendering ? "re-rendering the lanes…" : hq ? "on (Signalsmith Stretch)" : "off (classic SoundTouch)"}</span>
          </span>
        </label>
      </div>
    </details>
  );
}

/** Fine-tuning works on the mix as it is: an idea being tried is kept first. */
function keepWhatsPlaying() {
  if (useAiTrial.getState().trial) keepTrial();
}

/** Who's producing: ranks the ideas that suit that producer's taste first (nothing is hidden). */
type Persona = { id: string; label: string; icon: LucideIcon; vibes: Vibe[] };
const PERSONAS: Persona[] = [
  { id: "any", label: "Any style", icon: Sparkles, vibes: [] },
  { id: "club", label: "Club DJ", icon: Disc3, vibes: ["club", "hard"] },
  { id: "lofi", label: "Lo-fi", icon: CassetteTape, vibes: ["lofi", "chill"] },
  { id: "radio", label: "Radio hit", icon: Radio, vibes: ["radio", "short"] },
];
const PERSONA_KEY = "remixt-ai-persona";
function loadPersona(): string {
  try {
    return localStorage.getItem(PERSONA_KEY) ?? "any";
  } catch {
    return "any";
  }
}
/** How well an idea suits a persona: shared vibes, so a stable sort keeps the rest in order. */
const suits = (idea: Idea, persona: Persona) => idea.vibes.filter((v) => persona.vibes.includes(v)).length;

/**
 * What the AI producer heard last, for the co-producer's tools — which run
 * outside React (in the middle of a conversation) and need it at once,
 * not on the next render. There's one AI producer panel.
 */
const heard: { session: Session | null; ideas: Idea[] } = { session: null, ideas: [] };

function keepHeard(session: Session, ideas: Idea[]) {
  heard.session = session;
  heard.ideas = ideas;
  return session;
}

type Sheet = "mini" | "half" | "full";
const SHEETS: Sheet[] = ["mini", "half", "full"];

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
  /** The vibes of what was last kept, for the mastering pick. */
  const [keptVibes, setKeptVibes] = useState<Vibe[]>([]);
  /** Keep tracks whole: the AI never cuts them into clips. Read after mount (it's remembered per browser). */
  const [keepWhole, setKeepWhole] = useState(false);
  /** The sync template every idea uses (see IdeaOptions.sync). */
  const [syncId, setSyncId] = useState("perfect");
  const [personaId, setPersonaId] = useState("any");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage only exists after mount
    setKeepWhole(loadKeepWhole());
    setSyncId(loadSync());
    setPersonaId(loadPersona());
  }, []);
  const persona = PERSONAS.find((p) => p.id === personaId) ?? PERSONAS[0];
  function choosePersona(id: string) {
    setPersonaId(id);
    try {
      localStorage.setItem(PERSONA_KEY, id);
    } catch {}
  }
  const [tab, setTab] = useState<Tab>("sync");
  // A lane's "Ask AI" (in the lane inspector) opens the chat with its question.
  const question = useStudioView((s) => s.aiQuestion);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- following the store: a question asked elsewhere
    if (question) setTab("ask");
  }, [question]);
  /** Below desktop width it's a sheet: mini (just the controls), half (the mix stays in view) or full. */
  const [sheet, setSheet] = useState<Sheet>("half");
  const sheetRef = useRef<HTMLElement>(null);
  const drag = useRef<{ y: number; at: Sheet; moved: boolean } | null>(null);
  const swipe = useRef<{ x: number; done: boolean } | null>(null);
  // The Studio pads its bottom by the sheet's height, so every lane stays reachable behind it.
  useEffect(() => {
    const el = sheetRef.current;
    if (!open || !el) return;
    const root = document.documentElement;
    const phone = window.matchMedia("(max-width: 63.99rem)");
    const publish = () => root.style.setProperty("--ai-sheet-h", phone.matches ? `${el.offsetHeight}px` : "0px");
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    phone.addEventListener("change", publish);
    publish();
    return () => {
      observer.disconnect();
      phone.removeEventListener("change", publish);
      root.style.removeProperty("--ai-sheet-h");
    };
  }, [open]);
  /** "X takes the place of Y" — shown in the bottom bar for a few seconds. */
  const [swapNote, setSwapNote] = useState<{ icon?: IconName; text: string } | null>(null);
  useEffect(() => {
    if (!swapNote) return;
    const timer = setTimeout(() => setSwapNote(null), 4500);
    return () => clearTimeout(timer);
  }, [swapNote]);
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
  const total = useMemo(() => (session && session.pair ? scoreMix(session, lanes) : null), [session, lanes]);

  /** Listens to the lanes and works out the ideas. */
  async function analyse(whole = keepWhole, { reapply = false } = {}) {
    const id = ++run.current;
    // Switching how the AI may edit keeps what's being tried: it's worked out again the new way.
    const wasOn = reapply ? (useAiTrial.getState().trial?.ideas.map((i) => i.id) ?? []) : [];
    const bpm = bpmNow();
    revertTrial();
    setError(null);
    try {
      const fresh = await prepareSession(vocalId || null, beatId || null, { vibe: "any", keepWhole: whole, sync: syncId }, (s) => id === run.current && setStep(s));
      if (id !== run.current) return;
      // Let the steps paint before the (synchronous) arranging.
      await new Promise((r) => setTimeout(r, 30));
      const found = studioIdeas(fresh);
      const sync = await syncEverythingIdea(fresh).catch(() => null);
      if (id !== run.current) return;
      const all = sync ? [...found, sync] : found;
      setSession(fresh);
      setIdeas(all);
      putBackOn(fresh, all, wasOn);
      keepPlace(bpm);
      return { session: fresh, ideas: all };
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

  // The co-producer reads the latest session and ideas (see `heard`), and can ask for a listen.
  useEffect(() => {
    heard.session = session;
    heard.ideas = ideas;
  });
  const [coproducer] = useState<CoproducerContext>(() => ({
    session: () => heard.session,
    ideas: () => heard.ideas,
    listen: async () => {
      const { lanes: now, projectBpm: bpm } = useStudioStore.getState();
      if (!now.length) return null;
      const current = heard.session;
      if (!current || current.signature !== mixSignature(now)) {
        const found = await analyseRef.current();
        return found ? keepHeard(found.session, found.ideas) : heard.session;
      }
      // Moved since (kept an idea, adjusted a lane): rework the ideas for where things are now.
      if (!useAiTrial.getState().trial && current.timing !== timingSignature(now, bpm)) {
        const rebased = rebaseSession(current);
        const reworked = reworkIdeas(rebased, heard.ideas);
        setSession(rebased);
        setIdeas(reworked);
        return keepHeard(rebased, reworked);
      }
      return current;
    },
  }));

  // Opening the panel, or changing which lanes there are, starts listening by itself.
  // (Not again after it failed: the person retries.)
  // Picking another vocal or beat to work on listens again, keeping what's being tried.
  const needsListen = open && lanes.length > 0 && !busy && !error && (!trial || repicked) && (!session || stale || repicked);
  useEffect(() => {
    if (!needsListen) return;
    const timer = setTimeout(() => void analyseRef.current(undefined, { reapply: true }), session ? 700 : 0);
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

  /**
   * Plays an idea on top of what's on — the others stay; only one of the
   * same kind (another timing, another sound) makes way. Tapping one
   * that's on takes just it off.
   */
  function toggle(idea: Idea) {
    if (!session) return;
    setError(null);
    const bpm = bpmNow();
    if (onIds.has(idea.id)) {
      removeFromTrial(session, idea.id);
      keepPlace(bpm);
      return;
    }
    const replaced = trying.filter((t) => !compatible(t, idea));
    if (!tryIdea(session, idea, { add: true })) {
      setError(`“${idea.title}” doesn't fit the mix as it is now — it's being worked out again.`);
      return;
    }
    // A style taking over from a sync template keeps that sync (it's a setting): say so, not "replaced".
    const sync = replaced.find((t) => t.kind === "sync");
    const gone = replaced.filter((t) => t.kind !== "sync");
    if (gone.length) setSwapNote({ icon: idea.icon, text: `${idea.title} took the place of ${gone.map((t) => t.title).join(", ")} — the rest stays on` });
    else if (sync) setSwapNote({ icon: idea.icon, text: `${idea.title} — synced your way (${sync.title})` });
    keepPlace(bpm);
    playOn();
  }

  /**
   * Works every idea out again with different options (whole tracks, the
   * sync), without listening again — and puts back on what was on, worked
   * out the new way. Returns the new session and ideas.
   */
  function applyOptions(next: Partial<Session["options"]>, { except = [] as string[] } = {}) {
    if (!session) return null;
    const bpm = bpmNow();
    const wasOn = (useAiTrial.getState().trial?.ideas.map((i) => i.id) ?? []).filter((id) => !except.includes(id));
    revertTrial();
    const rebased = rebaseSession(session, { ...session.options, ...next });
    const all = reworkIdeas(rebased, ideas);
    setSession(rebased);
    setIdeas(all);
    putBackOn(rebased, all, wasOn);
    keepPlace(bpm);
    return { session: rebased, ideas: all };
  }

  /** Whole tracks or cut into lines: everything on is worked out again that way. */
  function chooseWhole(whole: boolean) {
    if (whole === keepWhole) return;
    setKeepWhole(whole);
    saveKeepWhole(whole);
    applyOptions({ keepWhole: whole });
  }

  /**
   * A sync template is a setting: every idea that places the vocal uses
   * it. With a style (or another timing idea) on, that's worked out again
   * with the new sync; with none, the template itself is tried.
   */
  function chooseSync(idea: Idea) {
    if (!session) return;
    if (onIds.has(idea.id)) return toggle(idea);
    const id = idea.id.slice("sync-".length);
    setSyncId(id);
    saveSync(id);
    const otherTiming = trying.find((t) => t.kind !== "sync" && isTiming(t));
    const done = applyOptions({ sync: id }, { except: trying.filter((t) => t.kind === "sync").map((t) => t.id) });
    if (!done) return;
    if (otherTiming) {
      setSwapNote({ icon: "link", text: `${idea.title}: “${otherTiming.title}” is now synced this way` });
      playOn();
      return;
    }
    const again = done.ideas.find((i) => i.id === idea.id);
    const bpm = bpmNow();
    if (again && tryIdea(done.session, again, { add: true })) {
      keepPlace(bpm);
      playOn();
    }
  }

  function surprise() {
    if (!session) return;
    const bpm = bpmNow();
    const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];
    const fitting = ideas.filter((i) => i.kind === "full" && ideaFits(i, startLanes()));
    // With a producer picked, the surprise comes from their kind of styles.
    const liked = fitting.filter((i) => suits(i, persona) > 0);
    const styles = liked.length ? liked : fitting;
    const style = pick(styles.length ? styles : ideas.filter((i) => ideaFits(i, startLanes())));
    // A new style (with its timing and sound) on top of what's on: layers and fixes stay.
    if (!style || !tryIdea(session, style, { add: true })) return;
    const moments = ideas.filter((i) => i.kind === "moment" && ideaFits(i, startLanes()) && compatible(style, i));
    const moment = moments.length ? pick(moments) : null;
    if (moment) tryIdea(session, moment, { add: true });
    keepPlace(bpm);
    playOn();
  }

  /** ◀ ▶: the next idea of the same kind as the last one tried takes its place; everything else stays on. */
  function stepThrough(delta: number) {
    if (!session) return;
    const last = trying[trying.length - 1];
    const usable = (i: Idea) => ideaFits(i, startLanes()) && (i.id === last?.id || !onIds.has(i.id));
    // The same kind as the last one tried; when that's the only one of its
    // kind (the one-tap "auto" idea, say), every other idea is fair game.
    let list = ideas.filter((i) => usable(i) && (!last || i.kind === last.kind));
    if (list.length < 2) list = ideas.filter(usable);
    if (!list.length || (list.length === 1 && list[0].id === last?.id)) {
      setSwapNote({ text: "No other ideas fit the mix right now" });
      return;
    }
    const from = list.findIndex((i) => i.id === last?.id);
    // Walk on until one fits: an idea that can't be placed is skipped, not a dead end.
    for (let n = 1; n <= list.length; n++) {
      const next = list[(((from < 0 && delta < 0 ? 0 : from) + delta * n) % list.length + list.length) % list.length];
      if (next.id === last?.id) continue;
      if (next.kind === "sync" && last?.kind === "sync") {
        chooseSync(next);
        return;
      }
      const bpm = bpmNow();
      if (tryIdea(session, next, { add: true, replace: last?.id })) {
        keepPlace(bpm);
        playOn();
        setSwapNote({ icon: next.icon, text: next.title });
        return;
      }
    }
    setSwapNote({ text: "No other ideas fit the mix right now" });
  }

  function keep() {
    const kept = keepTrial();
    if (kept.length) {
      setKeptVibes(kept.flatMap((i) => i.vibes));
      notify(`Kept “${kept.map((i) => i.title).join(" + ")}” — ⌘Z to undo`);
    }
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
    const bpm = bpmNow();
    const idea = mixFix(session, [...fixesOn, fix]);
    if (!idea || !tryIdea(session, idea, { add: true })) {
      setError("That can't be fixed automatically for this mix — try Fine-tune below.");
      return;
    }
    keepPlace(bpm);
    playOn();
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
      else if ((e.key === "b" || e.key === "B") && has) inPlace(() => compare());
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

  // The grab bar: drag up or down to snap between sizes, tap to step through them.
  const onGrabDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, at: sheet, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onGrabMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.y;
    if (Math.abs(dy) < 40) return;
    const at = SHEETS.indexOf(d.at);
    const next = SHEETS[Math.max(0, Math.min(SHEETS.length - 1, at + (dy < 0 ? 1 : -1)))];
    d.moved = true;
    d.y = e.clientY;
    d.at = next;
    setSheet(next);
  };
  const onGrabUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) setSheet((s) => (s === "full" ? "mini" : SHEETS[SHEETS.indexOf(s) + 1]));
  };

  const auto = byId("auto-good");
  const ranked = (list: Idea[]) => (persona.vibes.length ? [...list].sort((a, b) => suits(b, persona) - suits(a, persona)) : list);
  const styles = ranked(ideas.filter((i) => i.kind === "full"));
  const syncs = ideas.filter((i) => i.kind === "sync");
  const isLayer = (i: Idea) => i.id.startsWith("layer-");
  const moments = ranked(ideas.filter((i) => i.kind === "moment" && !isLayer(i)));
  const layers = ideas.filter(isLayer);
  // The Mix check's own fixes aren't in the list; these are the rest.
  const otherFixes = ideas.filter((i) => i.kind === "fix");
  const arrangement = ideas.filter((i) => i.kind === "idea" && i.role !== "engineer");
  const sounds = ideas.filter((i) => i.kind === "idea" && i.role === "engineer");
  const fits = (i: Idea) => ideaFits(i, trial?.baseline.lanes ?? lanes);
  const missing = !vocals.length ? "vocal" : !backings.length ? "beat" : null;
  const leadVocal = vocals.find((l) => !leadOf(l.laneId)) ?? vocals[0];
  const vibesNow = trying.length ? trying.flatMap((i) => i.vibes) : keptVibes;
  const current = trying[trying.length - 1];
  const hasPartLanes = lanes.some((l) => l.kind === "drums" || l.kind === "bass");
  const partsNote = hasPartLanes || session?.beatParts.length ? " · drops use the beat's own drums & bass" : "";
  const vocalLane = lanes.find((l) => l.laneId === session?.vocal?.laneId) ?? null;
  const beatLane = lanes.find((l) => l.laneId === session?.beat?.laneId) ?? null;

  const inTab: Record<Tab, (i: Idea) => boolean> = {
    sync: (i) => i.kind === "auto" || i.kind === "sync" || i.id.startsWith("fix:"),
    styles: (i) => i.kind === "full" || (i.kind === "idea" && i.role !== "engineer"),
    moments: (i) => i.kind === "moment" || (i.kind === "fix" && !i.id.startsWith("fix:")),
    mix: (i) => i.kind === "idea" && i.role === "engineer",
    ask: () => false,
  };
  const onIn = (t: Tab) => trying.filter(inTab[t]).length;
  const tile = (idea: Idea, badge?: string) => (
    <Tile key={idea.id} idea={idea} on={onIds.has(idea.id)} disabled={!fits(idea)} onClick={() => toggle(idea)} badge={badge} />
  );
  const ready = !!session && !busy && !missing;

  return (
    <>
      {/* Only the full sheet covers the mix; at half or mini the lanes stay playable behind it. */}
      {sheet === "full" && <div className="fixed inset-0 z-[55] bg-black/40 lg:hidden" onClick={() => setSheet("half")} />}
      <aside
        ref={sheetRef}
        aria-label="AI producer"
        data-sheet={sheet}
        className={`touch-targets fixed z-[56] flex flex-col border-border bg-background shadow-2xl transition-[height] duration-200 max-lg:inset-x-0 max-lg:bottom-0 max-lg:mx-auto max-lg:max-w-2xl max-lg:rounded-t-2xl max-lg:border max-lg:border-b-0 max-lg:pb-[env(safe-area-inset-bottom)] lg:top-[var(--header-h)] lg:right-0 lg:bottom-0 lg:w-[23rem] lg:border-l xl:w-[27rem] ${
          sheet === "full" ? "max-lg:h-[92dvh]" : sheet === "half" ? "max-lg:h-[52dvh] landscape:max-lg:h-[70dvh]" : "max-lg:h-auto"
        }`}
        style={{ animation: "sheet-in 0.2s ease-out" }}
      >
        <button
          type="button"
          onPointerDown={onGrabDown}
          onPointerMove={onGrabMove}
          onPointerUp={onGrabUp}
          onPointerCancel={() => (drag.current = null)}
          className="flex h-6 w-full shrink-0 touch-none cursor-grab items-center justify-center lg:hidden"
          aria-label={`Resize panel (now ${sheet})`}
        >
          <span className="h-1 w-10 rounded-full bg-border" aria-hidden />
        </button>
        <header className="flex shrink-0 items-center gap-2.5 px-4 pt-2.5 pb-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-vocals text-lg text-white">
            <Sparkles />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold">AI producer</h2>
            <p className="truncate text-[11px] text-muted">Tap to hear it · options stack · nothing&apos;s final until you keep it</p>
          </div>
          <button
            onClick={() => setSheet((s) => (s === "mini" ? "half" : "mini"))}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-foreground lg:hidden"
            aria-label={sheet === "mini" ? "Show ideas" : "Shrink to just the controls"}
          >
            {sheet === "mini" ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
          <button onClick={close} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-foreground" aria-label="Close (keeps what's playing)">
            <X className="h-5 w-5" />
          </button>
        </header>

        {(ready || (!busy && lanes.length > 0)) && (
          <nav className={`flex shrink-0 gap-1 overflow-x-auto border-b ${sheet === "mini" ? "max-lg:hidden" : ""} border-border px-3 pb-2`} aria-label="AI producer sections">
            {TABS.map((t) => {
              const count = onIn(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  aria-current={tab === t.id}
                  className={`relative flex flex-1 items-center justify-center gap-1 rounded-lg px-1.5 py-1.5 text-xs font-semibold transition-colors ${
                    tab === t.id ? "bg-brand text-white" : "text-muted hover:bg-surface hover:text-foreground"
                  }`}
                >
                  <t.icon />
                  {t.label}
                  {count > 0 && (
                    <span className={`ml-0.5 rounded-full px-1.5 text-[10px] leading-4 ${tab === t.id ? "bg-white/25" : "bg-brand text-white"}`} aria-label={`${count} on`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        )}

        <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 ${sheet === "mini" ? "max-lg:hidden" : ""}`}>
          {ready && (tab === "styles" || tab === "moments") && (
            <div className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-0.5" role="radiogroup" aria-label="Producer style — ideas that suit it come first">
              {PERSONAS.map((p) => (
                <button
                  key={p.id}
                  role="radio"
                  aria-checked={persona.id === p.id}
                  onClick={() => choosePersona(p.id)}
                  className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold whitespace-nowrap transition-colors ${
                    persona.id === p.id ? "border-brand bg-brand/15 text-foreground" : "border-border text-muted hover:text-foreground"
                  }`}
                >
                  <p.icon /> {p.label}
                </button>
              ))}
            </div>
          )}
          {(lanes.length === 0 || missing) && tab !== "ask" ? (
            <div className="flex flex-col gap-3 py-2 text-sm">
              <p className="text-base font-bold">Let&apos;s make a remix</p>
              <p className="text-muted">The AI needs a vocal and a beat to work with. Pick them from the library — any vocal over any song.</p>
              {[
                { done: vocals.length > 0, icon: Mic, text: "A vocal (someone singing or rapping)" },
                { done: backings.length > 0, icon: Drum, text: "A beat (the music of another song)" },
              ].map((s) => (
                <div key={s.text} className={`flex items-center gap-3 rounded-xl border p-3 ${s.done ? "border-success/50 bg-success/10" : "border-dashed border-border"}`}>
                  <s.icon className="h-6 w-6 text-brand-strong" />
                  <span className="flex-1">{s.text}</span>
                  <span className={`text-xs font-semibold ${s.done ? "text-success" : "text-muted"}`}>
                    {s.done ? (
                      <>
                        <CheckIcon /> Added
                      </>
                    ) : (
                      "Not yet"
                    )}
                  </span>
                </div>
              ))}
              <p className="text-xs text-muted">As soon as both are in, this panel listens to them and shows you how to make them sound good together.</p>
              {missing === "beat" && leadVocal?.bpm && (
                <MatchFinder
                  kind="beat"
                  bpm={leadVocal.bpm}
                  title={
                    <>
                      <Search /> Beats that fit “{leadVocal.trackTitle}” ({leadVocal.bpm.toFixed(0)} BPM)
                    </>
                  }
                />
              )}
              {missing === "vocal" && backings[0]?.bpm && (
                <MatchFinder
                  kind="vocals"
                  bpm={backings[0].bpm}
                  title={
                    <>
                      <Search /> Vocals that fit “{backings[0].trackTitle}” ({backings[0].bpm.toFixed(0)} BPM)
                    </>
                  }
                />
              )}
              {lanes.length > 0 && (
                <button onClick={() => void analyse()} disabled={busy} className="self-start text-xs text-brand-strong hover:underline">
                  Get sound ideas anyway <ArrowRight />
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
                        {state === "done" ? <CheckIcon /> : i + 1}
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

          {ready && session && tab === "sync" && (
            <div className="flex flex-col gap-5">
              {(vocals.filter((l) => !leadOf(l.laneId)).length > 1 || backings.length > 1) && (
                <div className="grid grid-cols-1 gap-2 text-[11px] text-muted min-[380px]:grid-cols-2">
                  <label className="flex min-w-0 flex-col gap-1">
                    Vocal to work on
                    <select value={vocalId} onChange={(e) => setVocalId(e.target.value)} className="input !py-1 text-xs">
                      <option value="">{session.vocal ? laneName(session.vocal) : "Auto"}</option>
                      {vocals.filter((l) => !leadOf(l.laneId)).map((l) => (
                        <option key={l.laneId} value={l.laneId}>
                          {laneName(l)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex min-w-0 flex-col gap-1">
                    Beat to work on
                    <select value={beatId} onChange={(e) => setBeatId(e.target.value)} className="input !py-1 text-xs">
                      <option value="">{session.beat ? laneName(session.beat) : "Auto"}</option>
                      {backings.map((l) => (
                        <option key={l.laneId} value={l.laneId}>
                          {laneName(l)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              {checks.length > 0 && (
                <MixCheck
                  checks={checks}
                  total={total}
                  trying={!!trial && trial.showing === "idea"}
                  canFix={(fix) => !!fix && fixable.has(fix) && !fixesOn.has(fix)}
                  onFix={fixCheck}
                />
              )}

              {session.pair && <BestVersions session={session} ideas={ideas} onIds={onIds} onTry={(idea) => (onIds.has(idea.id) ? undefined : toggle(idea))} />}

              {auto && (
                <div>
                  <button
                    onClick={() => toggle(auto)}
                    disabled={!fits(auto)}
                    className={`w-full rounded-2xl px-4 py-3.5 text-left text-white shadow-[0_0_28px_-10px_var(--vocals)] transition-all active:scale-[0.99] disabled:opacity-50 ${
                      onIds.has(auto.id) ? "bg-brand ring-2 ring-brand-strong" : "bg-gradient-to-r from-brand to-vocals hover:brightness-110"
                    }`}
                  >
                    <span className="block text-base font-bold">
                      {onIds.has(auto.id) ? (
                        <>
                          <Play className="fill-current" /> On: made to sound good
                        </>
                      ) : (
                        <>
                          <Sparkles /> Make it sound good
                        </>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-white/85">{auto.short}</span>
                  </button>
                  <p className="mt-1.5 text-center text-[11px] text-muted">One tap fixes it all — with the sync and cutting choices below.</p>
                </div>
              )}

              <Section icon={Scissors} title="Cutting" hint="How the AI may edit your tracks — everything on is worked out again when you switch">
                <div className="flex overflow-hidden rounded-xl border border-border text-xs font-semibold" role="group" aria-label="How the AI may edit your tracks">
                  {([
                    [false, Scissors, "Cut into lines", "Tightest fit: the vocal is cut at its silences and every line laid on the beat"],
                    [true, RectangleHorizontal, "Keep tracks whole", "Nothing is cut: tracks are only moved, sped up or slowed, re-keyed and levelled"],
                  ] as const).map(([whole, ChoiceIcon, label, hint]) => (
                    <button
                      key={label}
                      onClick={() => chooseWhole(whole)}
                      aria-pressed={keepWhole === whole}
                      title={hint}
                      className={`flex-1 px-2 py-2 transition-colors ${keepWhole === whole ? "bg-brand text-white" : "text-muted hover:text-foreground"}`}
                    >
                      <ChoiceIcon /> {label}
                    </button>
                  ))}
                </div>
              </Section>

              {syncs.length > 0 && (
                <Section icon={Link} title="Sync templates" hint="How the vocal, the beat and every other lane meet — your pick is used by every style and fix">
                  <div className="grid grid-cols-2 gap-2">
                    {syncs.map((idea) => {
                      const chosen = idea.id === `sync-${syncId}`;
                      return (
                        <Tile
                          key={idea.id}
                          idea={idea}
                          on={onIds.has(idea.id)}
                          selected={chosen}
                          disabled={!fits(idea)}
                          onClick={() => chooseSync(idea)}
                          badge={chosen ? "Your sync" : idea.id === "sync-perfect" ? "Best start" : undefined}
                        />
                      );
                    })}
                  </div>
                </Section>
              )}

              {vocalLane?.bpm && (
                <details className="group rounded-xl border border-border">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm font-bold">
                    <span>
                      <Search /> Find a beat that fits
                    </span>
                    <span className="text-xs font-normal text-muted group-open:hidden">
                      from the library <ChevronDown />
                    </span>
                  </summary>
                  <div className="px-3 pb-3">
                    <MatchFinder kind="beat" bpm={vocalLane.bpm} title={`Beats near ${vocalLane.bpm.toFixed(0)} BPM, least stretching first`} />
                  </div>
                </details>
              )}

              {session.notes.map((note) => (
                <p key={note} className="text-[11px] text-muted">
                  <Info /> {note}
                </p>
              ))}

              <Engines />
            </div>
          )}

          {ready && session && tab === "styles" && (
            <div className="flex flex-col gap-5">
              {styles.length > 0 ? (
                <Section
                  icon={Palette}
                  title="Styles"
                  hint="A whole remix in one tap — synced your way, and your layers and moments stay on"
                  action={
                    <button onClick={surprise} className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold hover:border-brand">
                      <Dices /> Surprise me
                    </button>
                  }
                >
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">{styles.map((idea) => tile(idea))}</div>
                </Section>
              ) : (
                <p className="text-xs text-muted">Styles need a vocal and a beat the AI could match.</p>
              )}
              {arrangement.length > 0 && (
                <Section icon={Puzzle} title="Song shape & speed" hint="One change to the arrangement at a time">
                  <div className="flex flex-col">
                    {arrangement.map((idea) => (
                      <Row key={idea.id} idea={idea} on={onIds.has(idea.id)} disabled={!fits(idea)} onClick={() => toggle(idea)} />
                    ))}
                  </div>
                </Section>
              )}
            </div>
          )}

          {ready && session && tab === "moments" && (
            <div className="flex flex-col gap-5">
              {moments.length > 0 && (
                <Section
                  icon={Zap}
                  title="Drops & moments"
                  hint={
                    session.drop
                      ? `The beat's ${session.drop.kind === "drop" ? "drop" : "biggest moment"} is at bar ${session.drop.bar + 1}${partsNote}`
                      : `Moments that make people listen${partsNote}`
                  }
                >
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">{moments.map((idea) => tile(idea))}</div>
                </Section>
              )}
              {layers.length > 0 && (
                <Section icon={Mic} title="Vocal layers" hint="Extra lanes that follow the vocal — they stack with everything">
                  <div className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-3">{layers.map((idea) => tile(idea))}</div>
                </Section>
              )}
              {otherFixes.length > 0 && (
                <Section icon={Bandage} title="Other fixes" hint="Small problems the AI spotted">
                  <div className="flex flex-col">
                    {otherFixes.map((idea) => (
                      <Row key={idea.id} idea={idea} on={onIds.has(idea.id)} disabled={!fits(idea)} onClick={() => toggle(idea)} />
                    ))}
                  </div>
                </Section>
              )}
            </div>
          )}

          {ready && session && tab === "mix" && (
            <div className="flex flex-col gap-5">
              <Section icon={SlidersHorizontal} title="Master it" hint="The finishing touch on the whole mix — one undo">
                <MasterIt vibes={vibesNow} />
              </Section>
              {sounds.length > 0 && (
                <Section icon={Sparkles} title="Sound" hint="Effects and levels on every lane — one sound at a time">
                  <div className="flex flex-col">
                    {sounds.map((idea) => (
                      <Row key={idea.id} idea={idea} on={onIds.has(idea.id)} disabled={!fits(idea)} onClick={() => toggle(idea)} />
                    ))}
                  </div>
                </Section>
              )}
              {vocalLane && (
                <Section icon={SlidersVertical} title="Fine-tune" hint="Small hands-on fixes — each one is a single undo">
                  <FineTune vocal={vocalLane} beat={beatLane} />
                </Section>
              )}
            </div>
          )}

          {/* Kept mounted on the other tabs (and while listening), so the conversation carries on. */}
          <div hidden={tab !== "ask"} className="min-h-full">
            <CoProducer ctx={coproducer} question={question} />
          </div>
        </div>

        {trial && current && (
          <footer className="shrink-0 border-t border-border bg-surface px-3 pt-2 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
            {swapNote && (
              <p className="mb-1.5 rounded-md bg-brand/15 px-2 py-1 text-[11px] text-foreground" role="status">
                {swapNote.icon && <Icon name={swapNote.icon} className="mr-1" />}
                {swapNote.text}
              </p>
            )}
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => stepThrough(-1)} className="h-11 w-11 shrink-0 touch-manipulation rounded-xl border border-border text-sm active:scale-95 active:bg-surface-hover sm:h-9 sm:w-9 sm:rounded-lg sm:text-xs hover:bg-surface-hover" aria-label="Previous idea of this kind (,)" title="Previous idea of this kind (,)">
                <ChevronLeft className="mx-auto h-5 w-5 sm:h-4 sm:w-4" />
              </button>
              <button
                onClick={() => {
                  if (swipe.current?.done) return;
                  setDetails((d) => !d);
                }}
                onPointerDown={(e) => (swipe.current = { x: e.clientX, done: false })}
                onPointerUp={(e) => {
                  const start = swipe.current;
                  if (!start || e.pointerType === "mouse") return;
                  const dx = e.clientX - start.x;
                  // A swipe on the bar flips through ideas, like a phone's photo viewer.
                  if (Math.abs(dx) > 50) {
                    start.done = true;
                    stepThrough(dx < 0 ? 1 : -1);
                  }
                }}
                className="min-w-0 flex-1 touch-pan-y px-1 text-left"
                aria-expanded={details}
              >
                <span className="block truncate text-xs font-semibold">
                  {trial.showing === "idea" ? <Play className="mr-1 fill-current" /> : <><Pause className="mr-1 fill-current" />Before · </>}
                  {trying.map((i, n) => (
                    <Fragment key={i.id}>
                      {n > 0 && " + "}
                      <Icon name={i.icon} className="text-brand-strong" /> {i.title}
                    </Fragment>
                  ))}
                </span>
                <span className="block text-[10px] text-muted">
                  {trying.length > 1 ? `${trying.length} on together · ` : ""}
                  {details ? (
                    <>
                      Hide details <ChevronUp />
                    </>
                  ) : (
                    <>
                      What changed? <ChevronDown />
                    </>
                  )}
                  <span className="sm:hidden"> · swipe for more</span>
                </span>
              </button>
              <button type="button" onClick={() => stepThrough(1)} className="h-11 w-11 shrink-0 touch-manipulation rounded-xl border border-border text-sm active:scale-95 active:bg-surface-hover sm:h-9 sm:w-9 sm:rounded-lg sm:text-xs hover:bg-surface-hover" aria-label="Next idea of this kind (.)" title="Next idea of this kind (.)">
                <ChevronRight className="mx-auto h-5 w-5 sm:h-4 sm:w-4" />
              </button>
            </div>
            {details && (
              <div className="mt-2 max-h-[30dvh] overflow-y-auto rounded-lg bg-background p-2.5 text-[11px] text-muted">
                {trying.map((i) => (
                  <div key={i.id} className="mb-2 last:mb-0">
                    <p className="flex items-center gap-2 font-semibold text-foreground">
                      <span className="min-w-0 flex-1">
                        <Icon name={i.icon} className="text-brand-strong" /> {i.title}
                      </span>
                      <button onClick={() => toggle(i)} className="shrink-0 rounded border border-border px-1.5 text-[10px] font-normal text-muted hover:text-danger">
                        take off
                      </button>
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
            <div className="mt-2 flex items-stretch gap-1.5">
              <div className="flex shrink-0 overflow-hidden rounded-lg border border-border text-[11px] font-bold" role="group" aria-label="Compare (B)" title="Compare (B)">
                {(["original", "idea"] as const).map((side) => (
                  <button
                    key={side}
                    onClick={() => inPlace(() => compare(side))}
                    aria-pressed={trial.showing === side}
                    className={`px-2.5 py-2 ${trial.showing === side ? "bg-brand text-white" : "text-muted hover:text-foreground"}`}
                  >
                    {side === "original" ? "Before" : "After"}
                  </button>
                ))}
              </div>
              {current.listenAt !== undefined && (
                <button
                  onClick={() => {
                    audioEngine.seek(current.listenAt!);
                    playOn();
                  }}
                  className="shrink-0 rounded-lg border border-border px-2.5 text-[11px] text-muted hover:text-foreground"
                  title="Jump to the best moment to hear it (otherwise the playhead stays where you are)"
                  aria-label="Jump to the best part"
                >
                  <ArrowUpToLine />
                  <span className="max-[400px]:hidden"> Best part</span>
                </button>
              )}
              <button onClick={() => inPlace(revertTrial)} className="shrink-0 rounded-lg border border-border px-3 text-xs font-medium hover:border-danger/60 hover:text-danger" title="Take everything off (⌘Z)">
                <X />
                <span className="max-[400px]:hidden"> Undo</span>
              </button>
              <button onClick={keep} className="min-w-0 flex-1 rounded-lg bg-success py-2 text-xs font-bold text-white hover:opacity-90" title="Keep (Enter)">
                <CheckIcon /> Keep it
              </button>
            </div>
          </footer>
        )}
      </aside>
    </>
  );
}
