"use client";

import { create } from "zustand";
import type { ChatTurn } from "@/app/api/ai/chat/route";
import type { AiProvider, AiSettingsUpdate, PublicAiSettings } from "@/lib/aiKeys";
import { AI_TOOLS, type AiToolInput, type AiToolName } from "@/lib/aiTools";
import { applyPairPlan, describePair, preparePair, type PairContext } from "./aiMatch";
import { ALL_STEPS, applyMatch, cutSilences, suggestMatches } from "./autoMatch";
import { keyLabel } from "./musicKey";
import {
  DEFAULT_FX,
  beatLength,
  clipSpan,
  clipStart,
  clipsOf,
  effectiveKey,
  useStudioStore,
  type LaneFx,
  type StudioLane,
} from "./studioStore";

// The Studio's AI producer: a chat in which the user's own model (Claude
// or ChatGPT, key saved in their account) edits the open remix. The model
// runs on the server (/api/ai/chat); its tool calls are carried out here,
// on the live project and the audio the browser holds, and the results go
// back to it — until it's done and says what it changed. Each turn can be
// undone in one step.

// --- Account settings ----------------------------------------------------------

type AccountStore = {
  settings: PublicAiSettings | null;
  status: "idle" | "loading" | "ready" | "signed-out" | "error";
  load: () => Promise<void>;
  save: (update: AiSettingsUpdate) => Promise<void>;
};

export const useAiAccount = create<AccountStore>((set, get) => ({
  settings: null,
  status: "idle",
  load: async () => {
    if (get().status === "loading") return;
    set({ status: "loading" });
    try {
      const res = await fetch("/api/users/me/ai");
      if (res.status === 401) return set({ status: "signed-out", settings: null });
      if (!res.ok) throw new Error();
      set({ settings: (await res.json()) as PublicAiSettings, status: "ready" });
    } catch {
      set({ status: "error" });
    }
  },
  save: async (update) => {
    const res = await fetch("/api/users/me/ai", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    if (!res.ok) throw new Error("Couldn't save your AI settings.");
    set({ settings: (await res.json()) as PublicAiSettings, status: "ready" });
  },
}));

/** Whether the chosen AI can be used: a saved key, or the site's free AI. */
export function hasKey(settings: PublicAiSettings | null) {
  if (!settings) return false;
  if (settings.provider === "free") return !!settings.free;
  return !!settings.keyEndings[settings.provider];
}

// --- Lanes and bars as the model sees them ---------------------------------------

const laneName = (index: number) => `L${index + 1}`;

function laneByName(name: string): StudioLane {
  const lanes = useStudioStore.getState().lanes;
  const index = Number(/^L(\d+)$/i.exec(name.trim())?.[1]) - 1;
  const lane = lanes[index];
  if (!lane) throw new Error(`There's no lane ${name}. Lanes are ${lanes.map((_, i) => laneName(i)).join(", ") || "none"}.`);
  return lane;
}

function barSeconds() {
  return beatLength(useStudioStore.getState().projectBpm) * 4;
}

/** Ruler bar (from 1, fractional) at a timeline position, and back. */
const toBar = (seconds: number) => Math.round((seconds / barSeconds() + 1) * 100) / 100;
const fromBar = (bar: number) => Math.max(0, (bar - 1) * barSeconds());

function changedFx(fx: LaneFx) {
  const out: Partial<LaneFx> = {};
  for (const key of Object.keys(DEFAULT_FX) as (keyof LaneFx)[]) {
    if (fx[key] !== DEFAULT_FX[key]) (out as Record<string, unknown>)[key] = fx[key];
  }
  return out;
}

function describeProject() {
  const state = useStudioStore.getState();
  return {
    projectBpm: state.projectBpm,
    secondsPerBar: Math.round(barSeconds() * 1000) / 1000,
    lengthBars: Math.round((state.duration / barSeconds()) * 10) / 10,
    loop: state.loopEnabled ? { startBar: toBar(state.loopStart), endBar: toBar(state.loopEnd) } : null,
    lanes: state.lanes.map((lane, i) => {
      const key = effectiveKey(lane);
      return {
        lane: laneName(i),
        kind: lane.kind,
        title: lane.trackTitle,
        artist: lane.artistName,
        sourceBpm: lane.bpm,
        speed: Math.round(lane.tempoRatio * 1000) / 1000,
        playsAtBpm: lane.bpm ? Math.round(lane.bpm * lane.tempoRatio * 10) / 10 : null,
        key: key ? keyLabel(key) : "unknown",
        pitchShift: lane.pitchSemitones,
        startBar: toBar(lane.offsetSeconds),
        endBar: toBar(lane.offsetSeconds + lane.duration),
        volume: lane.volume,
        muted: lane.muted,
        solo: lane.solo,
        effects: changedFx(lane.fx),
        clips: lane.clips?.length ? lane.clips.length : "whole take",
      };
    }),
  };
}

// --- Tools ------------------------------------------------------------------------

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Pairs analysed in this conversation, so arranging uses the sections the model was shown. */
const pairs = new Map<string, PairContext>();

async function pairFor(vocal: string, beat: string, fresh = false) {
  const vocalLane = laneByName(vocal);
  const beatLane = laneByName(beat);
  const key = `${vocalLane.laneId}|${beatLane.laneId}`;
  if (fresh || !pairs.has(key)) pairs.set(key, await preparePair(vocalLane.laneId, beatLane.laneId));
  return pairs.get(key)!;
}

const tools: { [N in AiToolName]: (input: AiToolInput<N>) => Promise<unknown> } = {
  get_project: async () => describeProject(),

  analyze_pair: async ({ vocal, beat }) => describePair(await pairFor(vocal, beat, true)),

  arrange_pair: async (input) => {
    const ctx = await pairFor(input.vocal, input.beat);
    return { changes: applyPairPlan(ctx, input), project: describeProject() };
  },

  auto_match: async () => {
    const { plans, undo } = await suggestMatches(ALL_STEPS);
    const plan = plans[0];
    if (!plan) return { changes: ["Nothing to match"] };
    applyMatch(plan, undo);
    return { plan: plan.title, changes: plan.lines, project: describeProject() };
  },

  set_lane: async (input) => {
    const lane = laneByName(input.lane);
    const store = useStudioStore.getState();
    if (input.preset) store.applyPreset(lane.laneId, input.preset);
    const fx: Partial<LaneFx> = {};
    if (input.pan !== undefined) fx.pan = clamp(input.pan, -1, 1);
    if (input.reverb !== undefined) fx.reverb = clamp(input.reverb, 0, 1);
    if (input.reverb_size !== undefined) fx.reverbSize = clamp(input.reverb_size, 0.3, 6);
    if (input.delay !== undefined) fx.delay = clamp(input.delay, 0, 1);
    if (input.delay_division !== undefined) fx.delayDivision = input.delay_division;
    if (input.delay_feedback !== undefined) fx.delayFeedback = clamp(input.delay_feedback, 0, 0.85);
    if (input.eq_low !== undefined) fx.eqLow = clamp(input.eq_low, -12, 12);
    if (input.eq_mid !== undefined) fx.eqMid = clamp(input.eq_mid, -12, 12);
    if (input.eq_high !== undefined) fx.eqHigh = clamp(input.eq_high, -12, 12);
    if (input.highpass !== undefined) fx.highpass = clamp(input.highpass, 20, 2000);
    if (input.lowpass !== undefined) fx.lowpass = clamp(input.lowpass, 500, 20000);
    if (input.width !== undefined) fx.width = clamp(input.width, 0, 1);
    if (input.drive !== undefined) fx.drive = clamp(input.drive, 0, 1);
    if (input.compress !== undefined) fx.compress = input.compress;
    if (input.fade_in !== undefined) fx.fadeIn = clamp(input.fade_in, 0, 30);
    if (input.fade_out !== undefined) fx.fadeOut = clamp(input.fade_out, 0, 30);
    if (Object.keys(fx).length) store.setFx(lane.laneId, fx);
    if (input.volume !== undefined) store.setVolume(lane.laneId, clamp(input.volume, 0, 1.5));
    if (input.muted !== undefined && input.muted !== lane.muted) store.toggleMute(lane.laneId);
    if (input.solo !== undefined && input.solo !== lane.solo) store.toggleSolo(lane.laneId);
    return describeProject().lanes.find((l) => l.lane === input.lane);
  },

  move_lane: async ({ lane: name, beats }) => {
    const lane = laneByName(name);
    useStudioStore.getState().nudgeOffset(lane.laneId, beats * beatLength(useStudioStore.getState().projectBpm));
    return describeProject().lanes.find((l) => l.lane === name);
  },

  clips: async ({ lane: name, action, clip, bar }) => {
    const lane = laneByName(name);
    const store = useStudioStore.getState();
    const index = clip !== undefined ? Math.round(clip) - 1 : -1;
    const need = (what: string) => {
      throw new Error(`“${action}” needs ${what}.`);
    };
    if (action === "split") {
      if (bar === undefined) need("a bar");
      if (!store.splitAt(lane.laneId, fromBar(bar!))) throw new Error(`No clip of ${name} plays at bar ${bar}.`);
    } else if (action === "delete") {
      if (index < 0) need("a clip number");
      if (!lane.clips || lane.clips.length < 2) throw new Error(`${name} has only one clip; use whole_take or mute instead.`);
      store.deleteClip(lane.laneId, index);
    } else if (action === "duplicate") {
      if (index < 0) need("a clip number");
      store.duplicateClip(lane.laneId, index);
    } else if (action === "move") {
      if (index < 0 || bar === undefined) need("a clip number and a bar");
      if (lane.clips?.length) store.moveClip(lane.laneId, index, fromBar(bar!));
      else store.setOffset(lane.laneId, fromBar(bar!));
    }
    const current = useStudioStore.getState().lanes.find((l) => l.laneId === lane.laneId)!;
    return {
      lane: name,
      clips: clipsOf(current).map((c, i) => ({
        clip: i + 1,
        startBar: toBar(clipStart(current, c)),
        lengthBars: Math.round((clipSpan(c) / current.tempoRatio / barSeconds()) * 100) / 100,
        fromSecondInStem: Math.round(c.from * 100) / 100,
      })),
    };
  },

  cut_silences: async ({ lane: name }) => {
    const count = await cutSilences(laneByName(name).laneId);
    return count ? { lane: name, clips: count } : { lane: name, note: "No silences to cut" };
  },

  whole_take: async ({ lane: name }) => {
    useStudioStore.getState().clearClips(laneByName(name).laneId);
    return describeProject().lanes.find((l) => l.lane === name);
  },

  set_loop: async ({ start_bar, end_bar, clear }) => {
    const store = useStudioStore.getState();
    if (clear) store.setLoop({ enabled: false, start: 0, end: 0 });
    else {
      if (start_bar === undefined || end_bar === undefined || end_bar <= start_bar) {
        throw new Error("Give start_bar and a later end_bar, or clear: true.");
      }
      store.setLoop({ enabled: true, start: fromBar(start_bar), end: fromBar(end_bar) });
    }
    return describeProject().loop;
  },
};

async function runTool(name: string, input: unknown): Promise<{ output: string; isError: boolean }> {
  if (!(name in AI_TOOLS)) return { output: `Unknown tool ${name}.`, isError: true };
  const tool = name as AiToolName;
  const parsed = AI_TOOLS[tool].input.safeParse(input);
  if (!parsed.success) {
    return { output: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`, isError: true };
  }
  try {
    const run = tools[tool] as (input: unknown) => Promise<unknown>;
    return { output: JSON.stringify(await run(parsed.data)), isError: false };
  } catch (err) {
    return { output: err instanceof Error ? err.message : "That didn't work.", isError: true };
  }
}

/** A short line for the chat about what a tool call did. */
function actionLabel(name: string, input: Record<string, unknown>) {
  switch (name) {
    case "get_project":
      return "Looked at the project";
    case "analyze_pair":
      return `Listened to ${input.vocal} and ${input.beat}`;
    case "arrange_pair":
      return `Arranged ${input.vocal} on ${input.beat}`;
    case "auto_match":
      return "Ran AI Match";
    case "set_lane":
      return `Adjusted ${input.lane}`;
    case "move_lane":
      return `Moved ${input.lane} ${input.beats} beats`;
    case "clips":
      return input.action === "list" ? `Checked ${input.lane}'s clips` : `${String(input.action)} clip on ${input.lane}`;
    case "cut_silences":
      return `Cut silences on ${input.lane}`;
    case "whole_take":
      return `Restored ${input.lane}'s whole take`;
    case "set_loop":
      return input.clear ? "Cleared the loop" : `Looped bars ${input.start_bar}–${input.end_bar}`;
    default:
      return name;
  }
}

// --- Conversation ----------------------------------------------------------------

type ApiMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; raw: unknown }
  | { role: "tool"; results: { id: string; output: string; isError?: boolean }[] };

export type ChatEntry =
  | { id: number; kind: "user"; text: string }
  | { id: number; kind: "assistant"; text: string; turn: number }
  | { id: number; kind: "action"; text: string; failed: boolean }
  | { id: number; kind: "error"; text: string };

type NewEntry = ChatEntry extends infer E ? (E extends ChatEntry ? Omit<E, "id"> : never) : never;

type Snapshot = Pick<
  ReturnType<typeof useStudioStore.getState>,
  "lanes" | "duration" | "projectBpm" | "loopEnabled" | "loopStart" | "loopEnd"
>;

type ChatStore = {
  entries: ChatEntry[];
  running: string | null;
  /** The project before each turn, to undo it. */
  snapshots: Record<number, Snapshot>;
  undone: number[];
  /** What's in the message box — a lane's ✨ AI button fills it in. */
  draft: string;
  setDraft: (text: string) => void;
  /** Whether the Studio sidebar shows the chat (rather than the library). */
  open: boolean;
  setOpen: (open: boolean) => void;
  send: (text: string) => Promise<void>;
  stop: () => void;
  undoTurn: (turn: number) => void;
  reset: () => void;
};

const MAX_STEPS = 16;
let history: ApiMessage[] = [];
let provider: AiProvider | null = null;
let controller: AbortController | null = null;
let nextId = 1;
let turnCount = 0;

function snapshotProject(): Snapshot {
  const { lanes, duration, projectBpm, loopEnabled, loopStart, loopEnd } = useStudioStore.getState();
  return { lanes, duration, projectBpm, loopEnabled, loopStart, loopEnd };
}

export const useAiChat = create<ChatStore>((set, get) => {
  const add = (entry: NewEntry) => set((s) => ({ entries: [...s.entries, { ...entry, id: nextId++ } as ChatEntry] }));

  async function callModel(signal: AbortSignal): Promise<ChatTurn> {
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, messages: history }),
      signal,
    });
    const body = await res.json().catch(() => ({ error: "The AI request failed." }));
    if (res.status === 409 && body.code === "provider_changed") {
      // Settings switched to the other model mid-conversation: its history
      // isn't portable, so carry on with just the latest request.
      await useAiAccount.getState().load();
      provider = useAiAccount.getState().settings?.provider ?? provider;
      const lastUser = [...history].reverse().find((m) => m.role === "user");
      history = lastUser ? [lastUser] : [];
      add({ kind: "error", text: "AI settings switched provider — continuing in a new conversation." });
      return callModel(signal);
    }
    if (!res.ok) throw new Error(body.error ?? "The AI request failed.");
    return body as ChatTurn;
  }

  return {
    entries: [],
    running: null,
    snapshots: {},
    undone: [],
    draft: "",
    setDraft: (draft) => set({ draft }),
    open: false,
    setOpen: (open) => set({ open }),

    send: async (text) => {
      if (get().running || !text.trim()) return;
      const settings = useAiAccount.getState().settings;
      if (!hasKey(settings)) {
        add({ kind: "error", text: "Choose an AI and add its key in AI settings first." });
        return;
      }
      provider ??= settings!.provider;
      const turn = ++turnCount;
      set((s) => ({ snapshots: { ...s.snapshots, [turn]: snapshotProject() }, running: "Thinking…" }));
      add({ kind: "user", text });
      history.push({ role: "user", text });
      controller = new AbortController();
      const { signal } = controller;

      try {
        for (let step = 0; step < MAX_STEPS; step++) {
          set({ running: step === 0 ? "Thinking…" : "Working…" });
          const reply = await callModel(signal);
          if (reply.text.trim()) add({ kind: "assistant", text: reply.text.trim(), turn });
          if (reply.status === "done") {
            history.push({ role: "assistant", raw: reply.raw });
            return;
          }

          const results: { id: string; output: string; isError?: boolean }[] = [];
          for (const call of reply.toolCalls) {
            if (signal.aborted) {
              results.push({ id: call.id, output: "Stopped by the user.", isError: true });
              continue;
            }
            set({ running: `${actionLabel(call.name, (call.input ?? {}) as Record<string, unknown>)}…` });
            const result = await runTool(call.name, call.input);
            results.push({ id: call.id, output: result.output, ...(result.isError ? { isError: true } : {}) });
            add({
              kind: "action",
              text: actionLabel(call.name, (call.input ?? {}) as Record<string, unknown>) + (result.isError ? ` — ${result.output}` : ""),
              failed: result.isError,
            });
          }
          // The reply and its results go into the history together, so an
          // error or a stop never leaves a tool call unanswered.
          history.push({ role: "assistant", raw: reply.raw }, { role: "tool", results });
          if (signal.aborted) return;
        }
        add({ kind: "error", text: "Stopped after many steps — ask me to continue if there's more to do." });
      } catch (err) {
        add({
          kind: "error",
          text: signal.aborted ? "Stopped." : err instanceof Error ? err.message : "The AI request failed.",
        });
      } finally {
        controller = null;
        set({ running: null });
        // The free AI's "left today" count went down.
        if (provider === "free") void useAiAccount.getState().load();
      }
    },

    stop: () => controller?.abort(),

    undoTurn: (turn) => {
      const snapshot = get().snapshots[turn];
      if (!snapshot) return;
      useStudioStore.setState(snapshot);
      set((s) => ({ undone: [...s.undone, turn] }));
      add({ kind: "error", text: "Undid that turn's changes." });
      history.push({ role: "user", text: "(I undid all the changes you made in your last turn.)" });
    },

    reset: () => {
      controller?.abort();
      history = [];
      provider = null;
      pairs.clear();
      set({ entries: [], snapshots: {}, undone: [], running: null });
    },
  };
});

