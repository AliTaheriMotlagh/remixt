"use client";

// Words for the AI producer, in plain language for people who've never
// used a music app: what each idea changes, and the styles to pick from.

export type Aspect = "arrangement" | "tempo" | "key" | "levels" | "effects" | "automation" | "layers";

export const ASPECTS: { id: Aspect; label: string; icon: string }[] = [
  { id: "arrangement", label: "Timing", icon: "🧩" },
  { id: "tempo", label: "Speed", icon: "⏱" },
  { id: "key", label: "Key", icon: "🎼" },
  { id: "levels", label: "Volume", icon: "🔊" },
  { id: "effects", label: "Sound", icon: "✨" },
  { id: "automation", label: "Moves", icon: "〰" },
  { id: "layers", label: "Layers", icon: "👯" },
];

export const ALL_ASPECTS = ASPECTS.map((a) => a.id);

export function aspectLabel(aspect: Aspect) {
  return ASPECTS.find((a) => a.id === aspect)?.label ?? aspect;
}

export type Vibe = "any" | "radio" | "club" | "short" | "lofi" | "chill" | "hard";

export const VIBES: { id: Vibe; label: string; icon: string }[] = [
  { id: "any", label: "Any", icon: "✨" },
  { id: "radio", label: "Radio", icon: "📻" },
  { id: "club", label: "Club", icon: "🪩" },
  { id: "short", label: "TikTok", icon: "📱" },
  { id: "lofi", label: "Lo-fi", icon: "📼" },
  { id: "chill", label: "Chill", icon: "🌙" },
  { id: "hard", label: "Hard", icon: "🔥" },
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
