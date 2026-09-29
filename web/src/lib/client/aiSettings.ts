"use client";

import { create } from "zustand";

// Which language model the Studio's per-lane AI asks, with whose key. The
// key is the user's own and stays in this browser (localStorage): requests
// go straight from the page to OpenAI or Anthropic, never through
// Remixt's server.

export type AiProvider = "anthropic" | "openai";

export const PROVIDERS: Record<AiProvider, { label: string; models: string[]; keyHint: string; keyUrl: string }> = {
  anthropic: {
    label: "Claude (Anthropic)",
    models: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5", "claude-fable-5-1"],
    keyHint: "sk-ant-…",
    keyUrl: "https://platform.claude.com/settings/keys",
  },
  openai: {
    label: "ChatGPT (OpenAI)",
    models: ["gpt-5", "gpt-5-mini", "gpt-4.1"],
    keyHint: "sk-…",
    keyUrl: "https://platform.openai.com/api-keys",
  },
};

export type AiSettings = {
  provider: AiProvider;
  keys: Record<AiProvider, string>;
  models: Record<AiProvider, string>;
};

const STORAGE_KEY = "remixt.ai-settings";

const DEFAULTS: AiSettings = {
  provider: "anthropic",
  keys: { anthropic: "", openai: "" },
  models: { anthropic: PROVIDERS.anthropic.models[0], openai: PROVIDERS.openai.models[0] },
};

function load(): AiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const saved = JSON.parse(raw) as Partial<AiSettings>;
    return {
      provider: saved.provider === "openai" ? "openai" : "anthropic",
      keys: { ...DEFAULTS.keys, ...saved.keys },
      models: { ...DEFAULTS.models, ...saved.models },
    };
  } catch {
    // Private mode, blocked storage or a corrupt entry: start clean.
    return DEFAULTS;
  }
}

type Store = AiSettings & {
  loaded: boolean;
  /** Reads the saved settings — on the client only, after hydration. */
  hydrate: () => void;
  save: (settings: AiSettings) => void;
};

export const useAiSettings = create<Store>((set, get) => ({
  ...DEFAULTS,
  loaded: false,
  hydrate: () => {
    if (!get().loaded) set({ ...load(), loaded: true });
  },
  save: (settings) => {
    set(settings);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Not persisted, but still used for this visit.
    }
  },
}));

/** The provider, key and model to use now, or null when no key is set. */
export function activeAi(): { provider: AiProvider; key: string; model: string } | null {
  const state = useAiSettings.getState();
  if (!state.loaded) state.hydrate();
  const { provider, keys, models } = useAiSettings.getState();
  const key = keys[provider].trim();
  return key ? { provider, key, model: models[provider].trim() || PROVIDERS[provider].models[0] } : null;
}
