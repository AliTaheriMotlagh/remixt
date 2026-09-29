"use client";

import { useEffect, useRef, useState } from "react";
import type { AiProvider, KeyedProvider, PublicAiSettings } from "@/lib/aiKeys";
import { hasKey, useAiAccount, useAiChat, type ChatEntry } from "@/lib/client/aiAgent";

type ProviderInfo = {
  label: string;
  short: string;
  /** Free to use (a free key, or no key at all). */
  free: boolean;
  models: string[];
  keyHint: string;
  keyUrl: string;
  /** How to get the key, in one line. */
  howTo: string;
};

const PROVIDERS: Record<KeyedProvider, ProviderInfo> = {
  gemini: {
    label: "Google Gemini",
    short: "Gemini",
    free: true,
    models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"],
    keyHint: "AIza…",
    keyUrl: "https://aistudio.google.com/apikey",
    howTo: "Free: sign in with a Google account at aistudio.google.com → Get API key. No card needed.",
  },
  groq: {
    label: "Groq (open models)",
    short: "Groq",
    free: true,
    models: ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "openai/gpt-oss-20b"],
    keyHint: "gsk_…",
    keyUrl: "https://console.groq.com/keys",
    howTo: "Free: sign up at console.groq.com → API Keys → Create. No card needed.",
  },
  anthropic: {
    label: "Claude (Anthropic)",
    short: "Claude",
    free: false,
    models: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5", "claude-fable-5-1"],
    keyHint: "sk-ant-…",
    keyUrl: "https://platform.claude.com/settings/keys",
    howTo: "Paid: platform.claude.com → Billing (buy credit) → API keys.",
  },
  openai: {
    label: "ChatGPT (OpenAI)",
    short: "ChatGPT",
    free: false,
    models: ["gpt-5", "gpt-5-mini", "gpt-4.1"],
    keyHint: "sk-…",
    keyUrl: "https://platform.openai.com/api-keys",
    howTo: "Paid: platform.openai.com → Billing (buy credit) → API keys.",
  },
};

const ORDER: KeyedProvider[] = ["gemini", "groq", "anthropic", "openai"];

const STARTERS = [
  "Match my vocal with the beat and arrange it like a real song",
  "Start with the chorus and bring it back at the end",
  "Make the vocal clearer on top of the beat",
];

/** Which AI, its key and model — saved (keys encrypted) in the user's account. */
function AiSettingsForm({ onDone }: { onDone: () => void }) {
  const { settings, save } = useAiAccount();
  const [provider, setProvider] = useState<AiProvider>(settings?.provider ?? "gemini");
  const [models, setModels] = useState<Record<KeyedProvider, string>>(
    settings?.models ?? { gemini: "gemini-2.5-flash", groq: "openai/gpt-oss-120b", anthropic: "claude-opus-5", openai: "gpt-5" }
  );
  const [newKeys, setNewKeys] = useState<Partial<Record<KeyedProvider, string>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const free = settings?.free ?? null;
  const keyed = provider === "free" ? null : provider;
  const info = keyed ? PROVIDERS[keyed] : null;
  const ending = keyed ? settings?.keyEndings[keyed] : null;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await save({ provider, models, keys: newKeys });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex max-h-[70%] flex-col gap-2 overflow-y-auto border-b border-border p-3">
      <div className="flex flex-col gap-1 text-xs">
        {free && (
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="ai-provider"
              checked={provider === "free"}
              onChange={() => setProvider("free")}
              className="accent-brand"
            />
            Free — built into Remixt
            <span className="text-[10px] text-success">no key needed</span>
          </label>
        )}
        {ORDER.map((id) => (
          <label key={id} className="flex items-center gap-1.5">
            <input
              type="radio"
              name="ai-provider"
              checked={provider === id}
              onChange={() => setProvider(id)}
              className="accent-brand"
            />
            {PROVIDERS[id].label}
            <span className={`text-[10px] ${PROVIDERS[id].free ? "text-success" : "text-muted"}`}>
              {PROVIDERS[id].free ? "free key" : "paid"}
            </span>
            {settings?.keyEndings[id] && <span className="text-[10px] text-muted">••••{settings.keyEndings[id]}</span>}
          </label>
        ))}
      </div>

      {provider === "free" && free && (
        <p className="text-[10px] leading-relaxed text-muted">
          Uses {free.service === "gemini" ? "Google Gemini" : "Groq"} ({free.model}) through Remixt — nothing to set up.
          You have {free.leftToday} of {free.dailyLimit} free requests left today (one message uses a few). For more, add
          your own free Gemini or Groq key.
        </p>
      )}

      {keyed && info && (
        <>
          <p className="text-[10px] leading-relaxed text-muted">
            {info.howTo}{" "}
            <a href={info.keyUrl} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
              Get a key
            </a>
          </p>
          <label className="flex flex-col gap-1 text-[11px] text-muted">
            {ending ? "Replace API key" : "API key"}
            <input
              type="password"
              autoComplete="off"
              value={newKeys[keyed] ?? ""}
              placeholder={ending ? `saved ••••${ending} — leave empty to keep` : info.keyHint}
              onChange={(e) => setNewKeys({ ...newKeys, [keyed]: e.target.value })}
              className="input !py-1 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-muted">
            Model
            <input
              list={`ai-models-${keyed}`}
              value={models[keyed]}
              onChange={(e) => setModels({ ...models, [keyed]: e.target.value })}
              className="input !py-1 text-xs"
            />
            <datalist id={`ai-models-${keyed}`}>
              {info.models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
          <p className="text-[10px] leading-relaxed text-muted">
            Your key is saved encrypted in your Remixt account and used only for your own requests.
          </p>
        </>
      )}

      {error && <p className="text-[11px] text-danger">{error}</p>}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded bg-brand px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-strong disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {keyed && ending && (
          <button
            onClick={() => setNewKeys({ ...newKeys, [keyed]: "" })}
            className="nudge hover:!text-danger"
            title="Remove the saved key when you press Save"
          >
            {newKeys[keyed] === "" ? "will remove key" : "remove key"}
          </button>
        )}
        <button onClick={onDone} className="nudge">
          cancel
        </button>
      </div>
    </div>
  );
}

/** "Gemini · gemini-2.5-flash", "Free · 38 left today", … */
function currentAiLabel(settings: PublicAiSettings) {
  if (settings.provider === "free") return settings.free ? `Free · ${settings.free.leftToday} left today` : "settings";
  return `${PROVIDERS[settings.provider].short} · ${settings.models[settings.provider]}`;
}

function Entry({ entry, undoable, onUndo }: { entry: ChatEntry; undoable: boolean; onUndo: () => void }) {
  if (entry.kind === "user") {
    return (
      <div className="ml-6 self-end whitespace-pre-wrap rounded-lg bg-brand/20 px-2.5 py-1.5 text-xs">{entry.text}</div>
    );
  }
  if (entry.kind === "action") {
    return (
      <div className={`text-[10px] ${entry.failed ? "text-danger" : "text-muted"}`}>
        {entry.failed ? "⚠" : "🔧"} {entry.text}
      </div>
    );
  }
  if (entry.kind === "error") return <div className="text-[11px] text-danger">{entry.text}</div>;
  return (
    <div className="mr-4 rounded-lg bg-surface-raised px-2.5 py-1.5 text-xs leading-relaxed">
      <p className="whitespace-pre-wrap">{entry.text}</p>
      {undoable && (
        <button onClick={onUndo} className="nudge mt-1.5" title="Put the project back as it was before this answer">
          ↶ undo these changes
        </button>
      )}
    </div>
  );
}

/**
 * The AI producer: a chat with the user's own Claude or ChatGPT, which
 * edits the open remix — arranging, stretching, levels, effects, clips —
 * and explains what it did.
 */
export default function StudioAiChat({ signedIn }: { signedIn: boolean }) {
  const account = useAiAccount();
  const { entries, running, snapshots, undone, send, stop, undoTurn, reset, draft, setDraft } = useAiChat();
  const [editingSettings, setEditingSettings] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (signedIn && account.status === "idle") void account.load();
  }, [signedIn, account]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [entries.length, running]);

  const settings = account.settings;
  const ready = hasKey(settings);

  // The last assistant message of each turn carries that turn's undo.
  const lastOfTurn = new Map<number, number>();
  for (const e of entries) if (e.kind === "assistant") lastOfTurn.set(e.turn, e.id);

  function submit() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void send(text);
  }

  if (!signedIn) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-xs text-muted">
        <span className="text-2xl">✨</span>
        Sign in to use the AI producer — free, or with your own ChatGPT, Claude, Gemini or Groq key.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-xs font-semibold">✨ AI producer</span>
        <button
          onClick={() => setEditingSettings((v) => !v)}
          className="nudge ml-auto"
          title="Choose ChatGPT or Claude and set your API key"
        >
          ⚙ {ready && settings ? currentAiLabel(settings) : "settings"}
        </button>
        {entries.length > 0 && (
          <button onClick={reset} className="nudge" title="Start a new conversation">
            new
          </button>
        )}
      </div>

      {(editingSettings || (account.status === "ready" && !ready)) && (
        <AiSettingsForm onDone={() => setEditingSettings(false)} />
      )}
      {account.status === "error" && (
        <p className="p-3 text-[11px] text-danger">Couldn&apos;t load your AI settings.</p>
      )}

      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
        {entries.length === 0 && (
          <div className="flex flex-col gap-2 text-[11px] text-muted">
            <p>
              Ask me to match and arrange your lanes, fix the timing, balance the levels or add effects — I edit the
              project for you and explain what I changed. I never change pitch.
            </p>
            {STARTERS.map((s) => (
              <button
                key={s}
                onClick={() => setDraft(s)}
                className="rounded-lg border border-border px-2.5 py-1.5 text-left transition-colors hover:border-brand/60 hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {entries.map((entry) => (
          <Entry
            key={entry.id}
            entry={entry}
            undoable={
              entry.kind === "assistant" &&
              lastOfTurn.get(entry.turn) === entry.id &&
              !!snapshots[entry.turn] &&
              !undone.includes(entry.turn) &&
              !running
            }
            onUndo={() => entry.kind === "assistant" && undoTurn(entry.turn)}
          />
        ))}
        {running && <div className="animate-pulse text-[11px] text-muted">{running}</div>}
      </div>

      <div className="flex flex-col gap-1.5 border-t border-border p-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          placeholder={ready ? "Tell the AI what you want…" : "Choose an AI in settings first"}
          disabled={!ready}
          className="input resize-none text-xs disabled:opacity-50"
        />
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted">Enter to send · Shift+Enter new line</span>
          {running ? (
            <button onClick={stop} className="nudge ml-auto hover:!text-danger">
              stop
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!ready || !draft.trim()}
              className="ml-auto rounded-lg bg-gradient-to-r from-brand to-vocals px-3 py-1 text-xs font-bold text-white disabled:opacity-40"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
