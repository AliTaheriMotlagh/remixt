"use client";

import { useEffect, useRef, useState } from "react";
import type { AiProvider } from "@/lib/aiKeys";
import { hasKey, useAiAccount, useAiChat, type ChatEntry } from "@/lib/client/aiAgent";

const PROVIDERS: Record<AiProvider, { label: string; short: string; models: string[]; keyHint: string; keyUrl: string }> = {
  anthropic: {
    label: "Claude (Anthropic)",
    short: "Claude",
    models: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5", "claude-fable-5-1"],
    keyHint: "sk-ant-…",
    keyUrl: "https://platform.claude.com/settings/keys",
  },
  openai: {
    label: "ChatGPT (OpenAI)",
    short: "ChatGPT",
    models: ["gpt-5", "gpt-5-mini", "gpt-4.1"],
    keyHint: "sk-…",
    keyUrl: "https://platform.openai.com/api-keys",
  },
};

const STARTERS = [
  "Match my vocal with the beat and arrange it like a real song",
  "Start with the chorus and bring it back at the end",
  "Make the vocal clearer on top of the beat",
];

/** Provider, key and model — saved (encrypted) in the user's account. */
function AiSettingsForm({ onDone }: { onDone: () => void }) {
  const { settings, save } = useAiAccount();
  const [provider, setProvider] = useState<AiProvider>(settings?.provider ?? "anthropic");
  const [models, setModels] = useState(settings?.models ?? { anthropic: "claude-opus-5", openai: "gpt-5" });
  const [newKeys, setNewKeys] = useState<Partial<Record<AiProvider, string>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const info = PROVIDERS[provider];
  const ending = settings?.keyEndings[provider];

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
    <div className="flex flex-col gap-2 border-b border-border p-3">
      <div className="flex flex-col gap-1 text-xs">
        {(Object.keys(PROVIDERS) as AiProvider[]).map((id) => (
          <label key={id} className="flex items-center gap-1.5">
            <input
              type="radio"
              name="ai-provider"
              checked={provider === id}
              onChange={() => setProvider(id)}
              className="accent-brand"
            />
            {PROVIDERS[id].label}
            {settings?.keyEndings[id] && <span className="text-[10px] text-success">key ••••{settings.keyEndings[id]}</span>}
          </label>
        ))}
      </div>
      <label className="flex flex-col gap-1 text-[11px] text-muted">
        {ending ? "Replace API key" : "API key"}
        <input
          type="password"
          autoComplete="off"
          value={newKeys[provider] ?? ""}
          placeholder={ending ? `saved ••••${ending} — leave empty to keep` : info.keyHint}
          onChange={(e) => setNewKeys({ ...newKeys, [provider]: e.target.value })}
          className="input !py-1 text-xs"
        />
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-muted">
        Model
        <input
          list={`ai-models-${provider}`}
          value={models[provider]}
          onChange={(e) => setModels({ ...models, [provider]: e.target.value })}
          className="input !py-1 text-xs"
        />
        <datalist id={`ai-models-${provider}`}>
          {info.models.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </label>
      <p className="text-[10px] leading-relaxed text-muted">
        Your key is saved encrypted in your Remixt account and used only for your own requests. Each message
        costs a little on your {provider === "anthropic" ? "Anthropic" : "OpenAI"} account.{" "}
        <a href={info.keyUrl} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
          Get a key
        </a>
      </p>
      {error && <p className="text-[11px] text-danger">{error}</p>}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded bg-brand px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-strong disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {ending && (
          <button
            onClick={() => setNewKeys({ ...newKeys, [provider]: "" })}
            className="nudge hover:!text-danger"
            title="Remove the saved key when you press Save"
          >
            {newKeys[provider] === "" ? "will remove key" : "remove key"}
          </button>
        )}
        <button onClick={onDone} className="nudge">
          cancel
        </button>
      </div>
    </div>
  );
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
  const provider = settings ? PROVIDERS[settings.provider] : null;

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
        Sign in to use the AI producer with your own ChatGPT or Claude key.
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
          ⚙ {ready && provider ? `${provider.short} · ${settings!.models[settings!.provider]}` : "settings"}
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
          placeholder={ready ? "Tell the AI what you want…" : "Set your API key above first"}
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
