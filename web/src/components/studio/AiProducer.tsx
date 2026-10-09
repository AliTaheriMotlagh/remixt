"use client";

import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
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
  DoorOpen,
  Drum,
  Link,
  ListChecks,
  Loader2,
  Maximize2,
  MessageCircle,
  Mic,
  Minimize2,
  Music,
  Palette,
  Pause,
  Play,
  Puzzle,
  Radio,
  Search,
  SlidersHorizontal,
  SlidersVertical,
  Sparkles,
  Timer,
  Users,
  WandSparkles,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Icon, type IconName } from "@/components/Icon";
import {
  availableFixes,
  checkMix,
  compatible,
  FIX_LABEL,
  fixGroups,
  fixesOf,
  mixFix,
  ideaFits,
  keyStretch,
  LEAD_SYNCS,
  leadOf,
  mixSignature,
  prepareSession,
  rebaseSession,
  reworkIdeas,
  stretchKeyIdea,
  studioIdeas,
  suggestedSections,
  SYNC_TEMPLATES,
  syncEverythingIdea,
  timingSignature,
  type FixId,
  type Idea,
  type Session,
  type Step,
} from "@/lib/client/aiIdeas";
import {
  addFix,
  compare,
  dismissOff,
  fixHolder,
  forgetTrial,
  keepTrial,
  removeFix,
  refusedByScope,
  removeFromTrial,
  revertTrial,
  setScope,
  switchPart,
  tryIdea,
  tryIdeas,
  useAiLog,
  useAiTrial,
  type Part,
  type Trial,
} from "@/lib/client/aiTrial";
import type { CoproducerContext } from "@/lib/client/coproducerTools";
import { clock, isWhole, useAiScope, type Scope } from "@/lib/client/aiScope";
import { bestVersions, scoreMix, scoreWord } from "@/lib/client/mixScore";
import { audioEngine } from "@/lib/client/audioEngine";
import { laneName, useStudioStore, type StudioLane } from "@/lib/client/studioStore";
import { DEFAULT_TIMING, loadKeepWhole, loadSync, loadTiming, saveKeepWhole, saveSync, saveTiming, type Timing, type Vibe } from "@/lib/client/aiControl";
import AiScopeBar from "./AiScopeBar";
import CoProducer from "./CoProducer";
import MatchFinder from "./MatchFinder";
import { useStudioView, type AiTab } from "@/lib/client/studioView";
import { useKeepScreenOn } from "@/lib/client/wakeLock";
import DropMap from "./ai/DropMap";
import { Engines, FineTune, MasterIt } from "./ai/extras";
import HarmonyCard from "./ai/HarmonyCard";
import LineSync from "./ai/LineSync";
import MixCheck, { type Best, type FixState } from "./ai/MixCheck";
import { ChoiceCards, IdeaSwitch, PartChips, ScoreRing, Section, Switch, SwitchRow, type Choice } from "./ai/ui";
import WhatHappened from "./ai/WhatHappened";

// The AI producer panel, for people who've never used a music app. It
// opens and starts listening by itself. Every option is a switch — on, it
// plays in the mix at once; off, it comes out again — and they stack: a
// sync, a style, a drop and a harmony can all be on together, only the
// same kind of choice making way. Its tabs:
//
//   Sync     — Make it sound good, the Mix check (a switch per fix), every
//              line's speed and key, and who leads
//   Timing   — when the vocal comes in, cutting into lines, gaps, song shape
//   Drop     — the beat's energy and drop, and the moments made around it
//   Harmony  — is it in tune (measured, note by note), key fixes, harmonies
//   Style    — whole styles, sounds, mastering, fine-tuning
//   Ask AI   — a co-producer to talk to
//
// "What happened" says exactly what's changed — in a sentence per line, a
// before/after picture of each line, with the numbers — and what was kept
// before. The bar at the bottom flips Before / After and keeps it (one undo).

const STEPS: { id: Step; label: string }[] = [
  { id: "listen", label: "Listening to every line" },
  { id: "match", label: "Finding speed, key, chorus and drop" },
  { id: "ideas", label: "Building ideas" },
];

const bpmNow = () => useStudioStore.getState().projectBpm;

/**
 * Trying an idea never moves the playhead: it stays on the same spot in
 * the song — scaled when the idea made the whole song faster or slower.
 */
function keepPlace(bpmBefore: number) {
  const { projectBpm, playhead } = useStudioStore.getState();
  if (Math.abs(projectBpm - bpmBefore) > 0.01) audioEngine.seek((playhead * bpmBefore) / projectBpm);
}

/** Plays on from where the playhead is (starts playing if stopped) — at once, lanes still rendering join in when ready. */
function playOn() {
  if (!useStudioStore.getState().isPlaying) void audioEngine.play({ join: true }).catch(() => {});
}

const TABS: { id: AiTab; label: string; icon: LucideIcon }[] = [
  { id: "sync", label: "Sync", icon: Link },
  { id: "timing", label: "Timing", icon: Timer },
  { id: "drop", label: "Drop", icon: Zap },
  { id: "harmony", label: "Harmony", icon: Music },
  { id: "style", label: "Style", icon: Palette },
  { id: "ask", label: "Ask AI", icon: MessageCircle },
];

const isLayer = (i: Idea) => i.id.startsWith("layer-");
const isShape = (i: Idea) => i.id.startsWith("remixer-");
const isTempoChoice = (i: Idea) => i.id.startsWith("beatmaker-tempo-");
const TIMING_FIXES = ["fix-start", "fix-late-entry", "fix-intro", "fix-gap"];
const LOCK_ALL = "beatmaker-sync";

/** The Drop tab's groups of moments; any other moment is listed after them. */
const DROP_GROUPS: { title: string; hint: string; icon: LucideIcon; ids: string[] }[] = [
  { title: "On the drop", hint: "The moment a remix is remembered for", icon: Zap, ids: ["moment-chorus-drop", "moment-big-drop", "moment-build", "moment-gate", "parts-drop"] },
  { title: "Intro & entrance", hint: "How the song and the voice come in", icon: DoorOpen, ids: ["parts-intro", "moment-filter", "moment-acapella", "moment-stutter", "moment-swell"] },
  { title: "Energy", hint: "Lifts, breaks and movement", icon: Activity, ids: ["moment-dynamics", "parts-breakdown", "moment-pump", "moment-beat-switch"] },
];
const GROUPED = new Set(DROP_GROUPS.flatMap((g) => g.ids));

/** Which tab each idea is listed on (for the count of ideas on, on each tab). */
const IN_TAB: Record<AiTab, (i: Idea) => boolean> = {
  sync: (i) => i.kind === "auto" || i.kind === "sync" || i.id.startsWith("fix:") || i.id === LOCK_ALL,
  timing: (i) => isShape(i) || isTempoChoice(i) || TIMING_FIXES.includes(i.id),
  drop: (i) => i.kind === "moment" && !isLayer(i),
  harmony: (i) => i.id === "key-part" || isLayer(i) || i.id.startsWith("tune:"),
  style: (i) => i.kind === "full" || i.id.startsWith("sound-") || i.id === "fix-vocal-clash",
  // The co-producer's own hands-on changes.
  ask: (i) => !!i.edits && i.id !== "key-part" && !i.id.startsWith("tune:"),
};

/** Ideas that place the vocal or change the speed — only one of those is on at a time (hands-on changes go on top). */
const isTiming = (i: Idea) => !i.edits && (i.aspects.includes("arrangement") || i.aspects.includes("tempo"));

const LEADERS: Choice<string>[] = SYNC_TEMPLATES.filter((t) => LEAD_SYNCS.includes(t.id)).map((t) => ({ id: t.id, icon: t.icon, title: t.title, short: t.short }));

const ENTRIES: Choice<Timing["entry"]>[] = [
  { id: "auto", icon: "sparkles", title: "After the intro", short: "Where the beat's intro ends" },
  { id: 0, icon: "fast-forward", title: "Right away", short: "On bar 1, no intro" },
  { id: 4, icon: "door-open", title: "After 4 bars", short: "A short intro" },
  { id: 8, icon: "headphones" as IconName, title: "After 8 bars", short: "DJ-friendly intro" },
];

/**
 * Puts back on, worked out for `session`, the ideas that were on (by id) —
 * all in one go. `after`: the trial they were on in, so the co-producer's
 * changes come back too, and what was switched off stays off.
 */
function putBackOn(session: Session, ideas: Idea[], ids: string[], after: Trial | null = null) {
  const again = ids
    .map((ideaId) =>
      ideaId.startsWith("fix:")
        ? mixFix(session, fixesOf({ id: ideaId } as Idea))
        : (ideas.find((i) => i.id === ideaId) ?? after?.ideas.find((i) => i.id === ideaId && !!i.edits))
    )
    .filter((idea): idea is Idea => !!idea);
  return tryIdeas(session, again, { after });
}

/**
 * What to render ahead, so the ideas most likely to be tried play at once
 * (see audioEngine.prepare): per lane, the speed and pitch most ideas ask
 * for (they mostly stretch the vocal to the beat the same way), with the
 * `first` ideas' votes counting most; and the `first` ideas' clips.
 */
function lookAhead(ideas: Idea[], lanes: StudioLane[], first: string[]) {
  const votes = new Map<string, { lane: StudioLane; count: number }>();
  for (const idea of ideas) {
    for (const [laneId, patch] of Object.entries(idea.patches)) {
      const lane = lanes.find((l) => l.laneId === laneId);
      if (!lane || (patch.tempoRatio === undefined && patch.pitchSemitones === undefined)) continue;
      const tempo = patch.tempoRatio ?? lane.tempoRatio;
      const pitch = patch.pitchSemitones ?? lane.pitchSemitones;
      if (Math.abs(tempo - lane.tempoRatio) < 0.001 && pitch === lane.pitchSemitones) continue;
      const key = `${laneId}|${tempo.toFixed(4)}|${pitch}`;
      const vote = votes.get(key) ?? { lane: { ...lane, tempoRatio: tempo, pitchSemitones: pitch }, count: 0 };
      vote.count += first.includes(idea.id) ? 5 : 1;
      votes.set(key, vote);
    }
  }
  const best = new Map<string, { lane: StudioLane; count: number }>();
  for (const vote of votes.values()) {
    const top = best.get(vote.lane.laneId);
    if (!top || vote.count > top.count) best.set(vote.lane.laneId, vote);
  }
  const clips = first.flatMap((id) => {
    const idea = ideas.find((i) => i.id === id);
    if (!idea) return [];
    return Object.entries(idea.patches).flatMap(([laneId, patch]) => {
      const lane = lanes.find((l) => l.laneId === laneId);
      return lane && patch.clips?.length ? [{ ...lane, ...patch }] : [];
    });
  });
  return { speeds: [...best.values()].map((v) => v.lane), clips };
}

/** The ids of the ideas on right now (read from the store, so a handler never acts on an old render's). */
const onNow = () => useAiTrial.getState().trial?.ideas ?? [];

/**
 * Runs `work` once the browser has painted — so a tap shows at once
 * (pressed, a spinner) even when working the ideas out takes a moment.
 */
function afterPaint(work: () => void) {
  requestAnimationFrame(() => setTimeout(work, 0));
}

/** Runs a change to what's being tried, keeping the playhead's place in the song. */
function inPlace(change: () => void) {
  const bpm = bpmNow();
  change();
  keepPlace(bpm);
}

/** The vocal moved `shift` semitones from where it is now — a hands-on change (from the harmony chart), with its layers. */
function tuneIdea(lanes: StudioLane[], vocal: StudioLane, shift: number): Idea {
  const target = Math.max(-12, Math.min(12, vocal.pitchSemitones + shift));
  const moved = target - vocal.pitchSemitones;
  const layers = lanes.filter((l) => leadOf(l.laneId) === vocal.laneId);
  return {
    id: `tune:${vocal.laneId}`,
    role: "engineer",
    kind: "idea",
    icon: "music",
    title: `Vocal ${moved > 0 ? "+" : ""}${moved} semitone${Math.abs(moved) === 1 ? "" : "s"}`,
    short: "Picked on the harmony chart",
    why: "Every note of the vocal moved by the same step, so the melody stays the same but sits on different notes of the beat's chords.",
    lines: [
      `“${laneName(vocal)}”: pitch ${vocal.pitchSemitones > 0 ? "+" : ""}${vocal.pitchSemitones} → ${target > 0 ? "+" : ""}${target} semitones`,
      ...(layers.length ? [`Its ${layers.length} harmony layer${layers.length === 1 ? "" : "s"} move with it`] : []),
    ],
    patches: {},
    aspects: ["key"],
    vibes: [],
    stems: {},
    edits: [vocal, ...layers].map((l) => ({ laneId: l.laneId, pitchSemitones: Math.max(-24, Math.min(24, l.pitchSemitones + moved)) })),
  };
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
  // Dragging a clip or a fader changes the lanes many times a second: the
  // panel follows at low priority, so the Studio never waits on it.
  const lanes = useDeferredValue(useStudioStore((s) => s.lanes));
  const projectBpm = useStudioStore((s) => s.projectBpm);
  const trial = useAiTrial((s) => s.trial);
  const keptCount = useAiLog((s) => s.kept.length);
  const scope = useAiScope((s) => s.scope);
  const [vocalId, setVocalId] = useState("");
  const [beatId, setBeatId] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [step, setStep] = useState<Step | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** "What happened" is showing in place of the ideas. */
  const [explaining, setExplaining] = useState(false);
  /** The idea row opened to say why and what it changes. */
  const [expanded, setExpanded] = useState<string | null>(null);
  /** The vibes of what was last kept, for the mastering pick. */
  const [keptVibes, setKeptVibes] = useState<Vibe[]>([]);
  /** Keep tracks whole: the AI never cuts them into clips. Read after mount (it's remembered per browser). */
  const [keepWhole, setKeepWhole] = useState(false);
  /** Who leads (a LEAD_SYNCS template every idea uses, see IdeaOptions.sync). */
  const [syncId, setSyncId] = useState("perfect");
  /** When the vocal comes in, and whether long gaps are closed. */
  const [timing, setTiming] = useState<Timing>(DEFAULT_TIMING);
  /** What the ideas are worked out with right now — read by a listen that started before a switch. */
  const options = useRef({ keepWhole, sync: syncId, ...timing });
  useEffect(() => {
    options.current = { keepWhole, sync: syncId, ...timing };
  }, [keepWhole, syncId, timing]);
  /** The control being worked on (an idea's id, "whole", "surprise"…), for its spinner; one at a time. */
  const [working, setWorking] = useState<string | null>(null);
  const workingRef = useRef(false);
  /** Shows `id` as working, then runs `work` once that has painted. Taps while it runs are ignored. */
  function soon(id: string, work: () => void) {
    if (workingRef.current) return;
    workingRef.current = true;
    // Most of these start playback once worked out — a moment after the tap,
    // when a phone no longer counts it as one: let the audio start now.
    if (!useStudioStore.getState().isPlaying) void audioEngine.prepareAudio().catch(() => {});
    setWorking(id);
    afterPaint(() => {
      try {
        work();
      } finally {
        workingRef.current = false;
        setWorking(null);
      }
    });
  }
  const [personaId, setPersonaId] = useState("any");
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- localStorage only exists after mount */
    setKeepWhole(loadKeepWhole());
    // The ready-made timing syncs are a "who leads" sync with timing of their own now.
    const saved = loadSync();
    const template = SYNC_TEMPLATES.find((t) => t.id === saved);
    if (template && !LEAD_SYNCS.includes(template.id)) {
      setSyncId("perfect");
      setTiming({ entry: template.entry === 0 || template.entry === 4 || template.entry === 8 ? template.entry : "auto", tight: template.structure === "tight" });
    } else {
      setSyncId(template ? template.id : "perfect");
      setTiming(loadTiming());
    }
    setPersonaId(loadPersona());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  const persona = PERSONAS.find((p) => p.id === personaId) ?? PERSONAS[0];
  function choosePersona(id: string) {
    setPersonaId(id);
    try {
      localStorage.setItem(PERSONA_KEY, id);
    } catch {}
  }
  const [tab, setTab] = useState<AiTab>("sync");
  // Asked for a tab from elsewhere (a lane's "Ask AI", the Easy studio's "Make them fit"): show it.
  const askedTab = useStudioView((s) => s.aiTab);
  useEffect(() => {
    if (!askedTab) return;
    /* eslint-disable react-hooks/set-state-in-effect -- following the store: a tab asked for elsewhere */
    setTab(askedTab.tab);
    setExplaining(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [askedTab]);
  const question = useStudioView((s) => s.aiQuestion);
  /** Below desktop width it's a sheet: mini (just the controls), half (the mix stays in view) or full. */
  const [sheet, setSheet] = useState<Sheet>("half");
  // The Studio's "+ Add stems" button stays above the sheet, except when it's pulled up full.
  useEffect(() => useStudioView.getState().setAiSheet(sheet), [sheet]);
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
  // A pick of a lane that's gone (cleared, undone, swapped) is no pick: back to Auto.
  const vocalPick = lanes.some((l) => l.laneId === vocalId) ? vocalId : "";
  const beatPick = lanes.some((l) => l.laneId === beatId) ? beatId : "";
  const signature = mixSignature(lanes);
  const timingNow = timingSignature(lanes, projectBpm);
  const stale = !!session && session.signature !== signature;
  const repicked = !!session && ((!!vocalPick && session.vocal?.laneId !== vocalPick) || (!!beatPick && session.beat?.laneId !== beatPick));
  const trying = useMemo(() => trial?.ideas ?? [], [trial]);
  const onIds = useMemo(() => new Set(trying.map((i) => i.id)), [trying]);
  const groups = useMemo(() => (session ? fixGroups(checkMix(session, lanes)) : []), [session, lanes]);
  /** Rows that were wrong before the ideas and are right with them on, without a fix of their own. */
  const baselineLanes = trial?.showing === "idea" ? trial.baseline.lanes : null;
  const before = useMemo(() => (session && baselineLanes ? fixGroups(checkMix(session, baselineLanes)) : null), [session, baselineLanes]);
  const total = useMemo(() => (session && session.pair ? scoreMix(session, lanes) : null), [session, lanes]);
  /** The score before the changes being tried, and with them — for "What happened". */
  const scores = useMemo(() => {
    if (!session?.pair || !trial) return null;
    return { before: scoreMix({ ...session, projectBpm: trial.baseline.projectBpm }, trial.baseline.lanes).total, after: scoreMix({ ...session, projectBpm: trial.result.projectBpm }, trial.result.lanes).total };
  }, [session, trial]);
  /** Where the vocal sounds most out of tune, if one stretch stands out — measured on the mix every try starts from. */
  const baseLanes = trial?.baseline.lanes ?? lanes;
  const outOfTune = useMemo(() => (session ? keyStretch(session, baseLanes) : null), [session, baseLanes]);
  const songLength = useStudioStore((s) => s.duration);
  /** Parts of the song found from what was heard, to point the AI at in one tap. */
  const sections = useMemo(() => (session ? suggestedSections(session, baseLanes, songLength) : []), [session, baseLanes, songLength]);

  /** Listens to the lanes and works out the ideas. */
  async function analyse({ reapply = false } = {}) {
    const id = ++run.current;
    // Listening again keeps what's being tried: it's worked out again for the mix as it is now.
    const bpm = bpmNow();
    const reverted = revertTrial();
    const was = reapply ? reverted : null;
    const wasOn = was?.ideas.map((i) => i.id) ?? [];
    setError(null);
    try {
      const heardNow = await prepareSession(vocalPick || null, beatPick || null, { vibe: "any", ...options.current }, (s) => id === run.current && setStep(s));
      if (id !== run.current) return;
      // The mix was cleared or swapped for another while it listened: what
      // was heard is of a mix that's gone. It listens again, to this one.
      const nowLanes = useAiTrial.getState().trial?.baseline.lanes ?? useStudioStore.getState().lanes;
      if (mixSignature(nowLanes) !== heardNow.signature) return;
      // Let the steps paint before the (synchronous) arranging.
      await new Promise((r) => setTimeout(r, 30));
      if (id !== run.current) return;
      // Cutting, the sync or the timing may have been switched while it listened: the ideas follow the latest choice.
      const fresh: Session = { ...heardNow, options: { vibe: "any", ...options.current } };
      const found = studioIdeas(fresh);
      const sync = await syncEverythingIdea(fresh).catch(() => null);
      if (id !== run.current) return;
      const all = sync ? [...found, sync] : found;
      setSession(fresh);
      setIdeas(all);
      putBackOn(fresh, all, wasOn, was);
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

  // Cleared, or another mix opened: nothing heard, tried or picked for the
  // old one carries over — a listen still running is dropped, and the new
  // mix is listened to afresh as soon as it has lanes.
  const emptyMix = useStudioStore((s) => s.lanes.length === 0);
  const unrelated = !!session && lanes.length > 0 && !lanes.some((l) => session.lanes.some((h) => h.laneId === l.laneId));
  useEffect(() => {
    if (!emptyMix && !unrelated) return;
    run.current++;
    forgetTrial();
    heard.session = null;
    heard.ideas = [];
    /* eslint-disable react-hooks/set-state-in-effect -- following the store: the mix was cleared or replaced */
    setSession(null);
    setIdeas([]);
    setStep(null);
    setError(null);
    setSwapNote(null);
    setKeptVibes([]);
    setExplaining(false);
    setExpanded(null);
    setVocalId("");
    setBeatId("");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [emptyMix, unrelated]);

  // Different lanes (one added, one taken out): a listen that failed for
  // the old ones is tried again for these.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- following the store: the lanes changed
    setError(null);
  }, [signature]);

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
      // What was heard is the mix before the ideas being tried (one may
      // swap the beat for its parts): that's what may have changed.
      const before = useAiTrial.getState().trial?.baseline.lanes ?? now;
      if (!current || current.signature !== mixSignature(before)) {
        const found = await analyseRef.current({ reapply: true });
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

  // Once the ideas are worked out, the audio for the likeliest ones is
  // rendered ahead in the background, so tapping them plays at once.
  useEffect(() => {
    if (!open || !session || busy || !ideas.length) return;
    const timer = setTimeout(() => {
      const from = useAiTrial.getState().trial?.baseline.lanes ?? useStudioStore.getState().lanes;
      void audioEngine.prepare(lookAhead(ideas, from, ["auto-good", `sync-${syncId}`]));
    }, 1200);
    return () => clearTimeout(timer);
  }, [open, session, busy, ideas, syncId]);

  // Opening the panel, or changing which lanes there are, starts listening by itself.
  // (Not again after it failed: the person retries.)
  // Picking another vocal or beat to work on listens again, keeping what's being tried.
  const needsListen = open && lanes.length > 0 && !busy && !error && (!trial || repicked) && (!session || stale || repicked);
  useEffect(() => {
    if (!needsListen) return;
    const timer = setTimeout(() => void analyseRef.current({ reapply: true }), session ? 700 : 0);
    return () => clearTimeout(timer);
  }, [needsListen, session]);

  // The person moved things themselves (or kept an idea): work the ideas
  // out again for where things are now, from what was already heard.
  useEffect(() => {
    if (!session || trial || stale || busy || session.timing === timingNow) return;
    const timer = setTimeout(() => {
      const rebased = rebaseSession(session);
      setSession(rebased);
      setIdeas((current) => reworkIdeas(rebased, current));
    }, 350);
    return () => clearTimeout(timer);
  }, [session, trial, stale, busy, timingNow]);

  /** The mix every try starts from: the original while an idea is on. */
  const startLanes = () => useAiTrial.getState().trial?.baseline.lanes ?? useStudioStore.getState().lanes;

  /**
   * Switches an idea on, on top of what's on — the others stay; only one
   * of the same kind (another timing, another sound) makes way. One that's
   * on is switched off, just it.
   */
  function toggle(idea: Idea) {
    if (!session) return;
    soon(idea.id, () => toggleNow(idea));
  }

  function toggleNow(idea: Idea) {
    if (!session) return;
    setError(null);
    const bpm = bpmNow();
    const on = onNow();
    if (on.some((i) => i.id === idea.id)) {
      removeFromTrial(session, idea.id);
      keepPlace(bpm);
      return;
    }
    const replaced = on.filter((t) => !compatible(t, idea));
    if (!tryIdea(session, idea, { add: true })) {
      setError(
        refusedByScope(idea.id)
          ? `“${idea.title}” makes the whole song faster or slower — that only works on the whole song.`
          : `“${idea.title}” doesn't fit the mix as it is now — it's being worked out again.`
      );
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

  /** Plays an idea from its best moment — switching it on first when it's off. */
  function hear(idea: Idea) {
    if (!session) return;
    const at = idea.listenAt ?? 0;
    if (onNow().some((i) => i.id === idea.id)) {
      audioEngine.seek(at);
      playOn();
      return;
    }
    soon(idea.id, () => {
      toggleNow(idea);
      if (onNow().some((i) => i.id === idea.id)) {
        audioEngine.seek(idea.listenAt ?? at);
        playOn();
      }
    });
  }

  /**
   * Works every idea out again with different options (whole tracks, the
   * sync, the timing), without listening again — and puts back on what
   * was on, worked out the new way. Returns the new session and ideas.
   */
  function applyOptions(next: Partial<Session["options"]>, { except = [] as string[], add = [] as string[] } = {}) {
    if (!session) return null;
    const bpm = bpmNow();
    const was = revertTrial();
    const wasOn = (was?.ideas ?? []).map((i) => i.id).filter((id) => !except.includes(id));
    const rebased = rebaseSession(session, { ...session.options, ...next });
    const all = reworkIdeas(rebased, ideas);
    setSession(rebased);
    setIdeas(all);
    const on = putBackOn(rebased, all, [...wasOn, ...add.filter((id) => !wasOn.includes(id))], was);
    keepPlace(bpm);
    return { session: rebased, ideas: all, on };
  }

  /** Whole tracks or cut into lines: everything on is worked out again that way. */
  function chooseWhole(whole: boolean) {
    // Settings change only together with the ideas: not while another tap is being worked out.
    if (whole === keepWhole || !session || workingRef.current) return;
    // The switch shows at once; the ideas are worked out again just after.
    setKeepWhole(whole);
    saveKeepWhole(whole);
    options.current = { ...options.current, keepWhole: whole };
    soon("whole", () => {
      const before = onNow().length;
      const done = applyOptions({ keepWhole: whole });
      if (done && done.on.length < before) notify("Some ideas only work by cutting the vocal — they're off while tracks are kept whole");
    });
  }

  /**
   * Who leads is a setting: every idea that places the vocal uses it. With
   * a style (or another timing idea) on, that's worked out again with the
   * new sync; with none, the sync itself goes on, so it's heard. A
   * ready-made timing sync (bar 1, an 8-bar intro, no gaps) is the
   * "Perfect sync" lead with that timing.
   */
  function chooseSync(idea: Idea, onDone?: (ideas: Idea[]) => void) {
    if (!session) return;
    if (onNow().some((i) => i.id === idea.id)) return toggle(idea);
    if (workingRef.current) return;
    const template = SYNC_TEMPLATES.find((t) => `sync-${t.id}` === idea.id);
    if (!template) return;
    const lead = LEAD_SYNCS.includes(template.id) ? template.id : "perfect";
    const nextTiming: Timing = LEAD_SYNCS.includes(template.id)
      ? timing
      : { entry: template.entry === 0 || template.entry === 4 || template.entry === 8 ? template.entry : "auto", tight: template.structure === "tight" };
    setSyncId(lead);
    saveSync(lead);
    setTiming(nextTiming);
    saveTiming(nextTiming);
    options.current = { ...options.current, sync: lead, ...nextTiming };
    soon(`sync-${lead}`, () => {
      const on = onNow();
      const otherTiming = on.find((t) => t.kind !== "sync" && isTiming(t));
      const done = applyOptions({ sync: lead, ...nextTiming }, { except: on.filter((t) => t.kind === "sync").map((t) => t.id), add: otherTiming ? [] : [`sync-${lead}`] });
      if (!done) return;
      onDone?.(done.ideas);
      if (otherTiming) setSwapNote({ icon: "link", text: `“${otherTiming.title}” is now synced this way` });
      playOn();
    });
  }

  /** When the vocal comes in, or closing gaps: everything on is worked out again with it — or the sync goes on, to hear it. */
  function chooseTiming(change: Partial<Timing>) {
    if (!session || workingRef.current) return;
    const next = { ...timing, ...change };
    if (next.entry === timing.entry && next.tight === timing.tight) return;
    setTiming(next);
    saveTiming(next);
    options.current = { ...options.current, ...next };
    soon("timing", () => {
      const on = onNow();
      const anyTiming = on.some((t) => isTiming(t));
      const done = applyOptions(next, { add: anyTiming ? [] : [`sync-${syncId}`] });
      if (!done) return;
      setSwapNote({ icon: "timer", text: anyTiming ? "Worked out again with your timing" : `${SYNC_TEMPLATES.find((t) => t.id === syncId)?.title ?? "Sync"} on, with your timing` });
      playOn();
    });
  }

  /** What "Let AI choose" found last (see MixCheck) — shown while the ideas it scored are the ones listed. */
  const [best, setBest] = useState<(Best & { ideas: Idea[] }) | null>(null);
  const bestFound = best && best.ideas === ideas ? best : null;

  /** Scores every whole-mix idea, then plays the best one if it beats the mix as it is. */
  function findBest() {
    if (!session) return;
    soon("best", () => {
      const scored = bestVersions(session, ideas, 4);
      setBest({ ideas, ...scored });
      const top = scored.versions[0];
      // After this run, so it gets its own turn (and spinner).
      if (top && top.score.total > scored.now.total && !onNow().some((i) => i.id === top.idea.id)) setTimeout(() => latest.current.tryBest(top.idea.id), 0);
    });
  }

  /**
   * "Let AI choose" picked or tapped one: a sync template is the
   * sync setting; the rest are tried like any idea. Picking a sync works
   * every idea out again — the scores stay listed, as they were scored.
   */
  function tryBest(ideaId: string) {
    const idea = ideas.find((i) => i.id === ideaId);
    if (!idea || onNow().some((i) => i.id === ideaId)) return;
    if (idea.kind !== "sync") return toggle(idea);
    const scored = ideas;
    chooseSync(idea, (reworked) => setBest((b) => (b && b.ideas === scored ? { ...b, ideas: reworked } : b)));
  }

  function surprise() {
    if (!session) return;
    soon("surprise", surpriseNow);
  }

  function surpriseNow() {
    if (!session) return;
    const bpm = bpmNow();
    const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];
    const fitting = ideas.filter((i) => i.kind === "full" && ideaFits(i, startLanes()));
    // With a producer picked, the surprise comes from their kind of styles.
    const liked = fitting.filter((i) => suits(i, persona) > 0);
    const styles = liked.length ? liked : fitting;
    const style = pick(styles.length ? styles : ideas.filter((i) => ideaFits(i, startLanes())));
    if (!style) return;
    const moments = ideas.filter((i) => i.kind === "moment" && ideaFits(i, startLanes()) && compatible(style, i));
    const moment = moments.length ? pick(moments) : null;
    // A new style (with its timing and sound), and a moment, on top of what's on — all in one go: layers and fixes stay.
    if (!tryIdeas(session, moment ? [style, moment] : [style]).length) return;
    setSwapNote({ icon: style.icon, text: moment ? `${style.title} + ${moment.title}` : style.title });
    keepPlace(bpm);
    playOn();
  }

  /** ◀ ▶: the next idea of the same kind as the last one tried takes its place; everything else stays on. */
  function stepThrough(delta: number) {
    if (!session) return;
    soon("step", () => stepThroughNow(delta));
  }

  function stepThroughNow(delta: number) {
    if (!session) return;
    const on = onNow();
    // The co-producer's hands-on changes aren't flipped through: they stay on.
    const last = on.filter((i) => !i.edits).at(-1);
    const usable = (i: Idea) => ideaFits(i, startLanes()) && (i.id === last?.id || !on.some((o) => o.id === i.id));
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
        // After this run, so it gets its own turn (and spinner).
        setTimeout(() => chooseSync(next), 0);
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

  /** An idea as it's worked out for the mix now (one switched off a while ago may be out of date). */
  function latestOf(idea: Idea): Idea | null {
    if (idea.edits) return idea;
    if (idea.id.startsWith("fix:")) return session ? mixFix(session, fixesOf(idea)) : null;
    return ideas.find((i) => i.id === idea.id) ?? null;
  }

  /** The switch next to a change in "What happened": on puts it back (as worked out now), off takes just it off. */
  function switchIdea(idea: Idea, on: boolean) {
    if (!session) return;
    if (!on) return toggle(idea);
    const again = latestOf(idea);
    if (!again) {
      dismissOff(idea.id);
      setError(`“${idea.title}” doesn't fit the mix any more`);
      return;
    }
    toggle(again);
  }

  /** Switches one part of an idea (its timing, key, volume…) on or off, the rest of it staying as it is. */
  function setPart(idea: Idea, part: Part, on: boolean) {
    if (!session) return;
    soon(`${idea.id}#${part}`, () => {
      const bpm = bpmNow();
      switchPart(session, idea.id, part, on);
      keepPlace(bpm);
    });
  }

  /** Whole song or a section, every lane or some: what's on is worked out again for it at once. */
  function changeScope(next: Scope) {
    if (!session) return void setScope(null, next);
    soon("scope", () => {
      setError(null);
      inPlace(() => setScope(session, next));
    });
  }

  /** Re-keys just the stretch that rubs: the vocal moves there only. */
  function fixStretch() {
    if (!session || !outOfTune) return;
    const stretch = outOfTune;
    soon("key-part", () => {
      setError(null);
      // The idea carries its own section: whatever else is on stays on for the whole song.
      const idea = stretchKeyIdea(session, stretch, startLanes());
      if (!idea || !tryIdea(session, idea, { add: true })) {
        setError("That part couldn't be re-keyed on its own — try the key switch instead.");
        return;
      }
      setSwapNote({ icon: "music", text: `${idea.title}: only ${clock(stretch.start)}–${clock(stretch.end)} changes` });
      audioEngine.seek(idea.listenAt ?? stretch.start);
      playOn();
    });
  }

  /** The vocal moved on the harmony chart: tried like any idea (with a switch), in place of the last such move. */
  function tryShift(shift: number) {
    if (!session) return;
    const vocal = session.vocal && useStudioStore.getState().lanes.find((l) => l.laneId === session.vocal!.laneId);
    if (!vocal || !shift) return;
    soon("tune", () => {
      const bpm = bpmNow();
      const idea = tuneIdea(useStudioStore.getState().lanes, vocal, shift);
      const previous = onNow().find((i) => i.id.startsWith("tune:"));
      if (!tryIdea(session, idea, { add: true, replace: previous?.id })) {
        setError("The vocal couldn't be moved there");
        return;
      }
      keepPlace(bpm);
      playOn();
      setSwapNote({ icon: "music", text: `${idea.title} — switch it off on the Harmony tab to go back` });
    });
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

  // The Mix check's fixes build on each other: switching one on adds it to
  // the fixes already on, all worked out together, so none undoes another;
  // and each comes off on its own, the others staying on.
  const fixable = useMemo(() => (session ? availableFixes(session) : new Set<FixId>()), [session]);
  const fixesOn = useMemo(() => new Set(trying.flatMap(fixesOf).filter((f) => fixable.has(f))), [trying, fixable]);
  function fixCheck(fix: FixId) {
    if (!session) return;
    soon(`fix:${fix}`, () => {
      setError(null);
      const bpm = bpmNow();
      const replaced = addFix(session, fix, fixable);
      if (!replaced) {
        setError("That can't be fixed automatically for this mix — try Fine-tune on the Style tab.");
        return;
      }
      if (replaced.length) setSwapNote({ icon: "stethoscope", text: `${FIX_LABEL[fix]} fixed — it took the place of ${replaced.map((i) => i.title).join(", ")}` });
      keepPlace(bpm);
      playOn();
    });
  }
  /** A fix switched off: just that one comes off. */
  function unfixCheck(fix: FixId) {
    if (!session) return;
    soon(`fix:${fix}`, () => {
      setError(null);
      const bpm = bpmNow();
      const fromAll = fixHolder(fix)?.kind === "auto";
      if (!removeFix(session, fix, fixable)) return;
      setSwapNote({ icon: "stethoscope", text: `${FIX_LABEL[fix]}: back as it was${fromAll || onNow().some((i) => fixesOf(i).length) ? " — the other fixes stay on" : ""}` });
      keepPlace(bpm);
    });
  }
  /** Make it sound good: on (in place of single fixes), or off again. */
  function fixAll() {
    const all = ideas.find((i) => i.kind === "auto");
    if (all) toggle(all);
  }
  const fixState = useCallback(
    (fix: FixId | null): FixState => (!fix || !fixable.has(fix) ? "none" : fixesOn.has(fix) ? "fixed" : "fixable"),
    [fixable, fixesOn]
  );
  const helped = useMemo(
    () =>
      new Set(
        before
          ? groups.filter((g) => g.status === "good" && !(g.fix && fixesOn.has(g.fix)) && before.some((b) => b.id === g.id && b.status !== "good")).map((g) => g.id)
          : []
      ),
    [groups, before, fixesOn]
  );

  // Keys: , and . flip through ideas, B before/after, Enter keeps, Esc closes.
  // The handlers as they are this render, behind callbacks that never
  // change — so the memoised rows and the Mix check don't all redraw
  // every time anything in the panel does.
  const latest = useRef({ stepThrough, keep, close, toggle, chooseSync, fixCheck, unfixCheck, fixAll, findBest, tryBest, hear, setPart });
  useEffect(() => {
    latest.current = { stepThrough, keep, close, toggle, chooseSync, fixCheck, unfixCheck, fixAll, findBest, tryBest, hear, setPart };
  });
  const act = useMemo(
    () => ({
      toggle: (idea: Idea) => latest.current.toggle(idea),
      chooseSync: (idea: Idea) => latest.current.chooseSync(idea),
      fixCheck: (fix: FixId) => latest.current.fixCheck(fix),
      unfixCheck: (fix: FixId) => latest.current.unfixCheck(fix),
      fixAll: () => latest.current.fixAll(),
      findBest: () => latest.current.findBest(),
      tryBest: (ideaId: string) => latest.current.tryBest(ideaId),
      hear: (idea: Idea) => latest.current.hear(idea),
      setPart: (idea: Idea, part: Part, on: boolean) => latest.current.setPart(idea, part, on),
    }),
    []
  );
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]") || document.querySelector('[role="menu"]')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const has = !!useAiTrial.getState().trial;
      if (e.key === "Escape") latest.current.close();
      else if ((e.key === "b" || e.key === "B") && has) inPlace(() => compare());
      else if (e.key === "," || e.key === ".") latest.current.stepThrough(e.key === "." ? 1 : -1);
      else if (e.key === "Enter" && has) latest.current.keep();
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [open]);

  // The ideas sorted into the panel's lists — worked out again only when the ideas (or the producer picked) change.
  const lists = useMemo(() => {
    const taste = PERSONAS.find((p) => p.id === personaId) ?? PERSONAS[0];
    const ranked = (list: Idea[]) => (taste.vibes.length ? [...list].sort((a, b) => suits(b, taste) - suits(a, taste)) : list);
    const byId = new Map(ideas.map((i) => [i.id, i]));
    return {
      auto: ideas.find((i) => i.kind === "auto"),
      byId,
      lockAll: byId.get(LOCK_ALL),
      shapes: ideas.filter(isShape),
      tempos: ideas.filter(isTempoChoice),
      timingFixes: TIMING_FIXES.flatMap((id) => byId.get(id) ?? []),
      dropGroups: DROP_GROUPS.map((g) => ({ ...g, ideas: g.ids.flatMap((id) => byId.get(id) ?? []) })).filter((g) => g.ideas.length),
      moreMoments: ideas.filter((i) => i.kind === "moment" && !isLayer(i) && !GROUPED.has(i.id)),
      layers: ideas.filter(isLayer),
      styles: ranked(ideas.filter((i) => i.kind === "full")),
      sounds: ideas.filter((i) => i.id.startsWith("sound-")),
      cleanUp: ideas.filter((i) => i.id === "fix-vocal-clash"),
    };
  }, [ideas, personaId]);
  /** Which ideas fit the mix every try starts from. */
  const fitting = useMemo(() => {
    const from = trial?.baseline.lanes ?? lanes;
    return new Set(ideas.filter((i) => ideaFits(i, from)).map((i) => i.id));
  }, [ideas, trial, lanes]);
  const fits = (i: Idea) => fitting.has(i.id);
  const missing = !vocals.length ? "vocal" : !backings.length ? "beat" : null;
  const leadVocal = vocals.find((l) => !leadOf(l.laneId)) ?? vocals[0];
  const vibesNow = trying.length ? trying.flatMap((i) => i.vibes) : keptVibes;
  const current = trying[trying.length - 1];
  const hasPartLanes = lanes.some((l) => l.kind === "drums" || l.kind === "bass");
  const partsNote = hasPartLanes || session?.beatParts.length ? " · drops use the beat's own drums & bass" : "";
  const vocalLane = lanes.find((l) => l.laneId === session?.vocal?.laneId) ?? null;
  const beatLane = lanes.find((l) => l.laneId === session?.beat?.laneId) ?? null;
  const onIn = (t: AiTab) => trying.filter(IN_TAB[t]).length;
  const sw = (idea: Idea, badge?: string) => {
    const on = onIds.has(idea.id);
    return (
      <IdeaSwitch
        key={idea.id}
        idea={idea}
        on={on}
        disabled={!fits(idea)}
        working={working === idea.id}
        expanded={expanded === idea.id}
        songLength={songLength}
        onToggle={act.toggle}
        onExpand={setExpanded}
        onHear={act.hear}
        badge={badge}
      >
        {on && trial && <PartChips idea={idea} off={trial.without[idea.id] ?? []} working={working} onPart={act.setPart} />}
      </IdeaSwitch>
    );
  };
  const ready = !!session && !busy && !missing;
  const score = total?.total ?? null;
  const autoOn = !!lists.auto && onIds.has(lists.auto.id);
  const keyFix = fixState("key");
  const keyPart = trial?.ideas.find((i) => i.id === "key-part");
  const tune = trial?.ideas.find((i) => i.id.startsWith("tune:"));
  const syncOn = trying.find((i) => i.kind === "sync");
  const leaderIdea = lists.byId.get(`sync-${syncId}`);

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
  const scopeBar = (hideLanes = false) =>
    ready ? (
      <div className="mb-3">
        <AiScopeBar lanes={baseLanes} suggestions={sections} onChange={changeScope} disabled={working !== null} hideLanes={hideLanes} />
      </div>
    ) : null;

  return (
    <>
      {/* Only the full sheet covers the mix; at half or mini the lanes stay playable behind it. */}
      {/* Never over the header or the tab bar: their menus stay in reach with the panel open. */}
      {sheet === "full" && <div className="fixed inset-x-0 top-[var(--header-h)] bottom-[var(--bottom-chrome)] z-[55] bg-black/40 lg:hidden" onClick={() => setSheet("half")} />}
      <aside
        ref={sheetRef}
        aria-label="AI producer"
        data-sheet={sheet}
        className={`touch-targets fixed z-[56] flex flex-col border-border bg-background shadow-2xl transition-[height] duration-200 max-lg:inset-x-0 max-lg:bottom-[var(--bottom-chrome)] max-lg:mx-auto max-lg:max-w-2xl max-lg:rounded-t-2xl max-lg:border max-lg:border-b-0 lg:top-[var(--header-h)] lg:right-0 lg:bottom-0 lg:w-[23rem] lg:border-l xl:w-[27rem] ${
          trial ? "" : "max-lg:pb-[max(0px,calc(env(safe-area-inset-bottom)-var(--bottom-chrome)))]"
        } ${
          sheet === "full"
            ? "max-lg:h-[calc(100dvh-var(--header-h)-var(--bottom-chrome)-0.5rem)]"
            : sheet === "half"
              ? "max-lg:h-[min(58dvh,calc(100dvh-var(--header-h)-var(--bottom-chrome)-0.5rem))] landscape:max-lg:h-[calc(100dvh-var(--header-h)-var(--bottom-chrome)-0.5rem)]"
              : "max-lg:h-auto"
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
        <header className="flex shrink-0 items-center gap-2 px-3 pb-1.5 sm:gap-2.5 sm:px-4 sm:pt-2.5 sm:pb-2">
          {score !== null && !busy ? (
            <ScoreRing score={score} size={40} label={`Mix score ${score} of 100`} />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-vocals text-base text-white sm:text-lg">
              {busy || working ? <Loader2 className="animate-spin" aria-label="Working…" /> : <Sparkles />}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-1.5 text-sm font-bold">
              AI producer
              {working && score !== null && <Loader2 className="animate-spin text-brand-strong" aria-label="Working…" />}
            </h2>
            <p className="truncate text-[11px] text-muted">
              {score !== null ? `${scoreWord(score)} · ` : ""}
              {trying.length ? `${trying.length} on · ` : ""}
              {isWhole(scope) ? "" : `${scope.range ? scope.range.label : "Some lines"} only · `}Switch ideas on and off
            </p>
          </div>
          {ready && (
            <button
              onClick={() => setExplaining((v) => !v)}
              aria-pressed={explaining}
              className={`relative flex h-9 shrink-0 items-center gap-1 rounded-lg border px-2 text-[11px] font-semibold transition-colors ${explaining ? "border-brand bg-brand/15" : "border-border text-muted hover:text-foreground"}`}
              title="What happened — exactly what the AI changed, line by line"
            >
              <ListChecks className="text-brand-strong" />
              <span className="max-[420px]:hidden">What happened</span>
              {trying.length + keptCount > 0 && (
                <span className="rounded-full bg-brand px-1.5 text-[10px] leading-4 text-white" aria-label={`${trying.length} on`}>
                  {trying.length || keptCount}
                </span>
              )}
            </button>
          )}
          <button
            onClick={() => setSheet((s) => (s === "full" ? "half" : "full"))}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-foreground lg:hidden"
            aria-label={sheet === "full" ? "Make the panel smaller" : "Full screen"}
          >
            {sheet === "full" ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
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
          <nav className={`flex shrink-0 gap-0.5 overflow-x-auto border-b ${sheet === "mini" ? "max-lg:hidden" : ""} border-border px-1.5 pb-1.5 sm:px-2 sm:pb-2`} aria-label="AI producer sections">
            {TABS.map((t) => {
              const count = onIn(t.id);
              const here = tab === t.id && !explaining;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setTab(t.id);
                    setExplaining(false);
                  }}
                  aria-current={here}
                  className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-semibold whitespace-nowrap transition-colors ${
                    here ? "bg-brand text-white" : "text-muted hover:bg-surface hover:text-foreground"
                  }`}
                >
                  <t.icon className="text-sm" />
                  {t.label}
                  {count > 0 && (
                    <span
                      className={`absolute top-0 right-0.5 rounded-full px-1 text-[9px] leading-[0.875rem] ${here ? "bg-white/25" : "bg-brand text-white"}`}
                      aria-label={`${count} on`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        )}

        <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4 ${sheet === "mini" ? "max-lg:hidden" : ""}`}>
          {(lanes.length === 0 || missing) && tab !== "ask" ? (
            <div className="flex flex-col gap-3 py-2 text-sm">
              <p className="text-base font-bold">Let&apos;s make a remix</p>
              <p className="text-muted">The AI needs a vocal and a beat to work with. Pick them from the library — any vocal over any song, or every line of a song.</p>
              {[
                { done: vocals.length > 0, icon: Mic, text: "A vocal (someone singing or rapping)" },
                { done: backings.length > 0, icon: Drum, text: "A beat — or a song's drums, bass and melody" },
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
              <button
                onClick={() => useStudioView.getState().showLibrary(missing === "beat" ? "beat" : missing === "vocal" ? "vocals" : "songs")}
                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-strong"
              >
                + Pick from the library
              </button>
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

          {ready && session && explaining && (
            <WhatHappened
              trial={trial}
              onIds={onIds}
              working={working}
              scores={scores}
              onBack={() => setExplaining(false)}
              onSwitch={switchIdea}
              onPart={setPart}
              onDismiss={dismissOff}
            />
          )}

          {ready && session && !explaining && tab === "sync" && (
            <div className="flex flex-col gap-4">
              {(vocals.filter((l) => !leadOf(l.laneId)).length > 1 || backings.length > 1) && (
                <div className="grid grid-cols-1 gap-2 text-[11px] text-muted min-[380px]:grid-cols-2">
                  <label className="flex min-w-0 flex-col gap-1">
                    Vocal to work on
                    <select value={vocalPick} onChange={(e) => setVocalId(e.target.value)} className="input !py-1 text-xs">
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
                    <select value={beatPick} onChange={(e) => setBeatId(e.target.value)} className="input !py-1 text-xs">
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

              {lists.auto && (
                <div className={`flex items-center gap-3 rounded-2xl p-3 text-white transition-all ${autoOn ? "bg-brand ring-2 ring-brand-strong" : "bg-gradient-to-r from-brand to-vocals shadow-[0_0_24px_-10px_var(--vocals)]"}`}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 text-xl">
                    {working === lists.auto.id ? <Loader2 className="animate-spin" /> : autoOn ? <CheckIcon /> : <WandSparkles />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold">Make it sound good</p>
                    <p className="line-clamp-2 text-[10.5px] leading-snug text-white/85">{autoOn ? lists.auto.short || "Every fix on" : "Speed, timing, key and volumes — every fix at once"}</p>
                  </div>
                  <Switch on={autoOn} onChange={act.fixAll} label={`Make it sound good: ${autoOn ? "on" : "off"}`} busy={working === lists.auto.id} disabled={!fits(lists.auto) || (working !== null && working !== lists.auto.id)} />
                </div>
              )}

              {groups.length > 0 && (
                <MixCheck
                  groups={groups}
                  helped={helped}
                  showing={trial ? trial.showing : null}
                  fixState={fixState}
                  working={working}
                  canChoose={!!session.pair}
                  best={session.pair ? bestFound : null}
                  bestBlocked={working !== null && working !== "best"}
                  keepWhole={session.options.keepWhole ?? false}
                  onIds={onIds}
                  act={act}
                />
              )}

              <LineSync lanes={lanes} projectBpm={projectBpm} scope={scope} onScope={changeScope} disabled={working !== null} />

              {session.pair && (
                <Section icon={Users} title="Who leads" hint="Whose speed and key every line takes — every style and fix uses your pick">
                  <ChoiceCards
                    label="Who leads"
                    choices={LEADERS}
                    value={syncId}
                    working={working?.startsWith("sync-") ? working.slice(5) : null}
                    disabled={working !== null}
                    onChange={(id) => {
                      // The one picked and playing: nothing to change (its switch below takes it off).
                      if (id === syncId && onIds.has(`sync-${id}`)) return;
                      const idea = lists.byId.get(`sync-${id}`);
                      if (idea) act.chooseSync(idea);
                    }}
                  />
                  {leaderIdea && (
                    <SwitchRow
                      title={`${leaderIdea.title} — playing`}
                      hint={syncOn ? "Every line locked together your way. Switch off to hear the lines as they were." : "Switch on to hear every line synced this way (a style or fix on uses it anyway)."}
                      on={!!syncOn}
                      busy={working === leaderIdea.id}
                      disabled={working !== null && working !== leaderIdea.id}
                      onChange={() => act.toggle(syncOn ?? leaderIdea)}
                    />
                  )}
                </Section>
              )}

              {lists.lockAll && <Section icon={Link} title="Every other line" hint="Other beats, vocals and parts, all at one speed">{sw(lists.lockAll)}</Section>}

              {scopeBar(true)}

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
                  {note}
                </p>
              ))}

              <Engines />
            </div>
          )}

          {ready && session && !explaining && tab === "timing" && (
            <div className="flex flex-col gap-4">
              {scopeBar()}
              <Section icon={DoorOpen} title="When the vocal comes in" hint="Goes with whoever leads — every style and fix comes in here too">
                <ChoiceCards label="When the vocal comes in" choices={ENTRIES} value={timing.entry} columns={4} working={working === "timing" ? timing.entry : null} disabled={working !== null || !session.pair} onChange={(entry) => chooseTiming({ entry })} />
              </Section>
              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3">
                <SwitchRow
                  title="Lock every line to the beat"
                  hint={keepWhole ? "Off: tracks stay whole — only moved, sped up or slowed, re-keyed and levelled; the vocal plays as sung from where its first line lands." : "On: the vocal is cut at its silences and every line is laid on the beat's bars — the tightest fit."}
                  on={!keepWhole}
                  busy={working === "whole"}
                  disabled={working !== null && working !== "whole"}
                  onChange={(on) => chooseWhole(!on)}
                />
                <SwitchRow
                  title="Close long gaps"
                  hint="Long instrumental breaks between the vocal's parts are cut short, so it never goes quiet for long."
                  on={timing.tight}
                  busy={working === "timing"}
                  disabled={(working !== null && working !== "timing") || !session.pair}
                  onChange={(tight) => chooseTiming({ tight })}
                />
              </div>
              {lists.shapes.length > 0 && <Section icon={Puzzle} title="Song shape" hint="The vocal's parts in another order — one at a time">{lists.shapes.map((i) => sw(i))}</Section>}
              {lists.tempos.length > 0 && <Section icon={Timer} title="Whose speed" hint="Another way to agree on a tempo">{lists.tempos.map((i) => sw(i))}</Section>}
              {lists.timingFixes.length > 0 && <Section icon={Bandage} title="Timing fixes" hint="Small problems the AI spotted">{lists.timingFixes.map((i) => sw(i))}</Section>}
              {vocalLane && (
                <Section icon={SlidersVertical} title="Nudge" hint="Small hands-on moves — each one is a single undo">
                  <FineTune vocal={vocalLane} beat={beatLane} only="timing" />
                </Section>
              )}
            </div>
          )}

          {ready && session && !explaining && tab === "drop" && (
            <div className="flex flex-col gap-4">
              {scopeBar()}
              <DropMap session={session} lanes={lanes} projectBpm={projectBpm} duration={songLength} />
              {partsNote && <p className="-mt-2 text-[11px] text-muted">Drops use the beat&apos;s own drums &amp; bass — taken from the library, nothing is split again.</p>}
              {lists.dropGroups.map((g) => (
                <Section key={g.title} icon={g.icon} title={g.title} hint={g.hint}>
                  {g.ideas.map((i) => sw(i, i.id === "moment-chorus-drop" && session.drop ? "Top pick" : undefined))}
                </Section>
              ))}
              {lists.moreMoments.length > 0 && <Section icon={Sparkles} title="More moments" hint="They stack with everything">{lists.moreMoments.map((i) => sw(i))}</Section>}
            </div>
          )}

          {ready && session && !explaining && tab === "harmony" && (
            <div className="flex flex-col gap-4">
              {scopeBar()}
              <HarmonyCard session={session} lanes={lanes} onTryShift={tryShift} disabled={working !== null} />
              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3">
                <SwitchRow
                  title="Match the key"
                  hint={
                    keyFix === "none"
                      ? "Already in key — nothing to move."
                      : syncId === "vocal-leads"
                        ? "The music moves to the singer's key (Vocal leads) — the voice keeps its natural pitch."
                        : "The vocal moves to the beat's key — every note by the same step, so the melody stays the same."
                  }
                  on={keyFix === "fixed"}
                  busy={working === "fix:key"}
                  disabled={keyFix === "none" || (working !== null && working !== "fix:key")}
                  onChange={(on) => (on ? act.fixCheck("key") : act.unfixCheck("key"))}
                />
                {(outOfTune || keyPart) && (
                  <SwitchRow
                    title={outOfTune ? `Fix just ${clock(outOfTune.start)}–${clock(outOfTune.end)}` : keyPart!.title}
                    hint={
                      outOfTune
                        ? `Only ${Math.round(outOfTune.now.inChord * 100)}% of the notes sit in the chords there; ${outOfTune.shift > 0 ? "+" : ""}${outOfTune.shift} st on just that part gets ${Math.round(outOfTune.best.inChord * 100)}%.`
                        : keyPart!.short
                    }
                    on={!!keyPart}
                    busy={working === "key-part"}
                    disabled={working !== null && working !== "key-part"}
                    onChange={(on) => (on ? fixStretch() : keyPart && act.toggle(keyPart))}
                  />
                )}
                {tune && (
                  <SwitchRow title={tune.title} hint="Picked on the chart above — switch off to put the vocal back." on busy={working === tune.id} onChange={() => act.toggle(tune)} />
                )}
              </div>
              {lists.layers.length > 0 && <Section icon={Mic} title="Vocal harmonies" hint="Extra voices that follow the vocal wherever it goes — they stack with everything">{lists.layers.map((i) => sw(i))}</Section>}
            </div>
          )}

          {ready && session && !explaining && tab === "style" && (
            <div className="flex flex-col gap-4">
              <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5" role="radiogroup" aria-label="Producer style — ideas that suit it come first">
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
              {scopeBar()}
              {lists.styles.length > 0 ? (
                <Section
                  icon={Palette}
                  title="Styles"
                  hint="A whole remix in one switch — one at a time; your sync, drops and harmonies stay on"
                  action={
                    <button onClick={surprise} aria-busy={working === "surprise"} className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold hover:border-brand">
                      {working === "surprise" ? <Loader2 className="animate-spin" /> : <Dices />} Surprise me
                    </button>
                  }
                >
                  {lists.styles.map((i) => sw(i))}
                </Section>
              ) : (
                <p className="text-xs text-muted">Styles need a vocal and a beat the AI could match.</p>
              )}
              {lists.sounds.length > 0 && <Section icon={Sparkles} title="Sound" hint="Effects and levels on every line — one sound at a time">{lists.sounds.map((i) => sw(i))}</Section>}
              {lists.cleanUp.length > 0 && <Section icon={Bandage} title="Clean-up" hint="Small problems the AI spotted">{lists.cleanUp.map((i) => sw(i))}</Section>}
              <Section icon={SlidersHorizontal} title="Master it" hint="The finishing touch on the whole mix — one undo">
                <MasterIt vibes={vibesNow} />
              </Section>
              {vocalLane && (
                <Section icon={SlidersVertical} title="Fine-tune" hint="Small hands-on fixes — each one is a single undo">
                  <FineTune vocal={vocalLane} beat={beatLane} only="mix" />
                </Section>
              )}
            </div>
          )}

          {/* Kept mounted on the other tabs (and while listening), so the conversation carries on. */}
          <div hidden={tab !== "ask" || explaining} className="min-h-full">
            <CoProducer ctx={coproducer} question={question} />
          </div>
        </div>

        {trial && (
          <footer className="relative shrink-0 border-t border-border bg-surface px-3 pt-2 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
            {/* Floats above the bar, so it never pushes the ideas out of a small sheet. */}
            {swapNote && (
              <p className="pointer-events-none absolute inset-x-3 bottom-full mb-2 rounded-lg border border-brand/40 bg-surface-raised px-2.5 py-1.5 text-[11px] text-foreground shadow-lg" role="status">
                {swapNote.icon && <Icon name={swapNote.icon} className="mr-1" />}
                {swapNote.text}
              </p>
            )}
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => stepThrough(-1)} className="h-10 w-10 shrink-0 touch-manipulation rounded-xl border border-border text-sm active:scale-95 active:bg-surface-hover sm:h-9 sm:w-9 sm:rounded-lg sm:text-xs hover:bg-surface-hover" aria-label="Previous idea of this kind (,)" title="Previous idea of this kind (,)">
                {working === "step" ? <Loader2 className="mx-auto animate-spin" /> : <ChevronLeft className="mx-auto h-5 w-5 sm:h-4 sm:w-4" />}
              </button>
              <button
                onClick={() => {
                  if (swipe.current?.done) return;
                  setExplaining(true);
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
                title="What happened — exactly what's changed"
              >
                <span className="block truncate text-xs font-semibold">
                  {trial.showing === "idea" ? <Play className="mr-1 fill-current" /> : <><Pause className="mr-1 fill-current" />Before · </>}
                  {trying.length ? (
                    trying.map((i, n) => (
                      <Fragment key={i.id}>
                        {n > 0 && " + "}
                        <Icon name={i.icon} className="text-brand-strong" /> {i.title}
                      </Fragment>
                    ))
                  ) : (
                    <span className="text-muted">Everything switched off — your mix as it was</span>
                  )}
                </span>
                <span className="block text-[10px] text-muted">
                  {scores ? `Score ${scores.before} → ${scores.after} · ` : ""}
                  {trial.off.length ? `${trial.off.length} off · ` : ""}
                  <span className="font-semibold text-brand-strong">
                    What happened <ChevronUp />
                  </span>
                  <span className="sm:hidden"> · swipe for more</span>
                </span>
              </button>
              <button type="button" onClick={() => stepThrough(1)} className="h-10 w-10 shrink-0 touch-manipulation rounded-xl border border-border text-sm active:scale-95 active:bg-surface-hover sm:h-9 sm:w-9 sm:rounded-lg sm:text-xs hover:bg-surface-hover" aria-label="Next idea of this kind (.)" title="Next idea of this kind (.)">
                {working === "step" ? <Loader2 className="mx-auto animate-spin" /> : <ChevronRight className="mx-auto h-5 w-5 sm:h-4 sm:w-4" />}
              </button>
            </div>
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
              {current?.listenAt !== undefined && (
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
              <button onClick={keep} disabled={!trying.length} className="min-w-0 flex-1 rounded-lg bg-success py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-40" title="Keep (Enter)">
                <CheckIcon /> Keep it
              </button>
            </div>
          </footer>
        )}
      </aside>
    </>
  );
}
