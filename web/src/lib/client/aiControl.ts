"use client";

import type { IconName } from "@/components/Icon";

// Words for the AI producer, in plain language for people who've never
// used a music app: what each idea changes, and the styles to pick from.

export type Aspect = "arrangement" | "tempo" | "key" | "levels" | "effects" | "automation" | "layers";

export const ASPECTS: { id: Aspect; label: string; icon: IconName }[] = [
  { id: "arrangement", label: "Timing", icon: "puzzle" },
  { id: "tempo", label: "Speed", icon: "timer" },
  { id: "key", label: "Key", icon: "music" },
  { id: "levels", label: "Volume", icon: "volume-2" },
  { id: "effects", label: "Sound", icon: "sparkles" },
  { id: "automation", label: "Moves", icon: "spline" },
  { id: "layers", label: "Layers", icon: "users" },
];

export const ALL_ASPECTS = ASPECTS.map((a) => a.id);

export function aspectLabel(aspect: Aspect) {
  return ASPECTS.find((a) => a.id === aspect)?.label ?? aspect;
}

export type Vibe = "any" | "radio" | "club" | "short" | "lofi" | "chill" | "hard";

export const VIBES: { id: Vibe; label: string; icon: IconName }[] = [
  { id: "any", label: "Any", icon: "sparkles" },
  { id: "radio", label: "Radio", icon: "radio" },
  { id: "club", label: "Club", icon: "disc-3" },
  { id: "short", label: "TikTok", icon: "smartphone" },
  { id: "lofi", label: "Lo-fi", icon: "cassette-tape" },
  { id: "chill", label: "Chill", icon: "moon" },
  { id: "hard", label: "Hard", icon: "flame" },
];

const VIBE_KEY = "remixt.aiVibe";

export function loadVibe(): Vibe {
  try {
    const saved = localStorage.getItem(VIBE_KEY);
    return VIBES.some((v) => v.id === saved) ? (saved as Vibe) : "any";
  } catch {
    return "any";
  }
}

export function saveVibe(vibe: Vibe) {
  try {
    localStorage.setItem(VIBE_KEY, vibe);
  } catch {
    // Private mode or storage blocked: remembered for this visit only.
  }
}

const WHOLE_KEY = "remixt.aiKeepWhole";

/** Whether the AI producer keeps tracks whole (never cuts them into clips) — remembered per browser. */
export function loadKeepWhole(): boolean {
  try {
    return localStorage.getItem(WHOLE_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveKeepWhole(on: boolean) {
  try {
    localStorage.setItem(WHOLE_KEY, on ? "1" : "0");
  } catch {
    // Private mode or storage blocked: remembered for this visit only.
  }
}

const SYNC_KEY = "remixt.aiSync";

/** The sync template the person last chose (see SYNC_TEMPLATES) — remembered per browser. */
export function loadSync(): string {
  try {
    return localStorage.getItem(SYNC_KEY) ?? "perfect";
  } catch {
    return "perfect";
  }
}

export function saveSync(id: string) {
  try {
    localStorage.setItem(SYNC_KEY, id);
  } catch {
    // Private mode or storage blocked: remembered for this visit only.
  }
}

const TIMING_KEY = "remixt.aiTiming";

/** When the vocal comes in, and whether long gaps are closed — the person's own timing choices (see IdeaOptions). */
export type Timing = { entry: "auto" | 0 | 4 | 8; tight: boolean };

export const DEFAULT_TIMING: Timing = { entry: "auto", tight: false };

/** The timing the person chose last — remembered per browser. */
export function loadTiming(): Timing {
  try {
    const saved = JSON.parse(localStorage.getItem(TIMING_KEY) ?? "null") as Partial<Timing> | null;
    const entry = saved?.entry === 0 || saved?.entry === 4 || saved?.entry === 8 ? saved.entry : "auto";
    return { entry, tight: saved?.tight === true };
  } catch {
    return DEFAULT_TIMING;
  }
}

export function saveTiming(timing: Timing) {
  try {
    localStorage.setItem(TIMING_KEY, JSON.stringify(timing));
  } catch {
    // Private mode or storage blocked: remembered for this visit only.
  }
}
