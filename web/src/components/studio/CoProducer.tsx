"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, KeyRound, Loader2, RotateCcw, Square, Trash2, Wand2, Wrench } from "lucide-react";
import {
  browserKey,
  converse,
  saveModelChoice,
  saveProvider,
  savedModelChoice,
  savedProvider,
  setBrowserKey,
  type ChatEvent,
  type Message,
  type Provider,
} from "@/lib/client/coproducerChat";
import type { CoproducerContext } from "@/lib/client/coproducerTools";
import QuickHelp from "./QuickHelp";

// The AI co-producer: a chat with an AI that can listen to the mix
// (through the Studio's analysis), try the AI producer's ideas, adjust
// lanes and play the result. It runs on the person's own key — Anthropic
// (Claude) or OpenRouter (Claude or any other tool-using model), each saved
// to their account (encrypted) or kept in this browser only — or, when the
// site offers it, on the site's shared key for a few questions a day.
// Without either, Quick help answers (no AI model; see QuickHelp.tsx).

type Model = { id: string; label: string; hint: string };
type RouterModel = { id: string; name: string; context: number; promptPerMillion: number | null; completionPerMillion: number | null };
type KeyState = {
  signedIn: boolean;
  saved: Partial<Record<Provider, { hint: string; model: string }>>;
  models: Model[];
  /** The site's free AI, when it offers one: questions a day, and how many are left today (null when not signed in). */
  shared?: { limit: number; left: number | null } | null;
};

const PROVIDERS: { id: Provider; label: string; prefix: string; getKey: string; billed: string }[] = [
  { id: "anthropic", label: "Claude", prefix: "sk-ant-", getKey: "https://console.anthropic.com/settings/keys", billed: "your Anthropic account" },
  { id: "openrouter", label: "OpenRouter", prefix: "sk-or-", getKey: "https://openrouter.ai/keys", billed: "your OpenRouter credits" },
];

const SUGGESTIONS = [
  "Make it sound as good as you can",
  "Why does it sound off?",
  "Make it a radio hit",
  "Is the vocal in tune with the beat?",
  "Give the chorus more energy",
];

let routerModels: Promise<RouterModel[]> | null = null;

/** OpenRouter's tool-using models, from the server (OpenRouter isn't reachable from everywhere). */
function loadRouterModels(): Promise<RouterModel[]> {
  routerModels ??= fetch("/api/ai/models")
    .then((res) => res.json())
    .then((data: { openrouter?: RouterModel[] }) => data.openrouter ?? [])
    .catch(() => {
      routerModels = null;
      return [];
    });
  return routerModels;
}

/** A starting OpenRouter model: one of Claude's, if OpenRouter carries them. */
function defaultRouterModel(list: RouterModel[]) {
  return (list.find((m) => m.id.startsWith("anthropic/") && m.id.includes("sonnet")) ?? list.find((m) => m.id.startsWith("anthropic/")) ?? list[0])?.id ?? "";
}

const price = (m: RouterModel) =>
  m.promptPerMillion === null ? "" : m.promptPerMillion === 0 && m.completionPerMillion === 0 ? "free" : `$${m.promptPerMillion} in · $${m.completionPerMillion} out per million tokens`;

/** Picks a model: Claude's three, or any of OpenRouter's (searchable). */
function ModelPicker({ provider, models, value, onChange, compact = false }: { provider: Provider; models: Model[]; value: string; onChange: (id: string) => void; compact?: boolean }) {
  const [list, setList] = useState<RouterModel[] | null>(null);
  useEffect(() => {
    if (provider !== "openrouter") return;
    let cancelled = false;
    void loadRouterModels().then((found) => {
      if (cancelled) return;
      setList(found);
      if (!value && found.length) onChange(defaultRouterModel(found));
    });
    return () => {
      cancelled = true;
    };
    // Loaded once per provider; `value` only seeds the default.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  if (provider === "anthropic") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`input text-xs ${compact ? "!w-auto !py-0.5 text-[11px]" : "!py-1"}`} aria-label="Model">
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
            {compact ? "" : ` — ${m.hint}`}
          </option>
        ))}
      </select>
    );
  }
  const chosen = list?.find((m) => m.id === value);
  return (
    // In the chat's header it takes a row of its own: model ids are long.
    <span className={`flex min-w-0 flex-col gap-0.5 ${compact ? "order-last basis-full" : ""}`}>
      <input
        list="openrouter-models"
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        placeholder={list ? `Search ${list.length} models — e.g. anthropic/, openai/, google/` : "Loading models…"}
        name="openrouter-model"
        autoComplete="off"
        spellCheck={false}
        className={`input font-mono text-xs ${compact ? "!py-0.5 text-[11px]" : "!py-1"}`}
        aria-label="OpenRouter model"
      />
      <datalist id="openrouter-models">
        {list?.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
            {price(m) ? ` — ${price(m)}` : ""}
          </option>
        ))}
      </datalist>
      {!compact && (
        <span className="text-[10px] text-muted">
          {chosen ? `${chosen.name}${price(chosen) ? ` · ${price(chosen)}` : ""}` : list && value ? "Not one of OpenRouter's tool-using models — pick from the list" : "Only models that can use tools are listed"}
        </span>
      )}
    </span>
  );
}

function KeySetup({ provider, state, onReady }: { provider: Provider; state: KeyState; onReady: (mode: "account" | "browser", key: string | null, model: string) => void }) {
  const info = PROVIDERS.find((p) => p.id === provider)!;
  const [key, setKey] = useState("");
  const [model, setModel] = useState(savedModelChoice(provider) ?? state.saved[provider]?.model ?? (provider === "anthropic" ? state.models[0]?.id ?? "claude-opus-5-5" : ""));
  const [where, setWhere] = useState<"account" | "browser">(state.signedIn ? "account" : "browser");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const trimmed = key.trim();
    if (!trimmed.startsWith(info.prefix)) {
      setError(`A${provider === "anthropic" ? "n Anthropic" : "n OpenRouter"} key starts with ${info.prefix}`);
      return;
    }
    if (!model) {
      setError("Pick a model");
      return;
    }
    setError(null);
    saveModelChoice(provider, model);
    if (where === "browser") {
      setBrowserKey(provider, trimmed);
      onReady("browser", trimmed, model);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/ai/key", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, key: trimmed, model }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't save the key");
      onReady("account", null, model);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the key");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3 text-xs">
      <p className="flex items-center gap-2 text-sm font-bold">
        <KeyRound className="text-brand-strong" /> Connect {provider === "anthropic" ? "Claude" : "OpenRouter"}
      </p>
      <p className="text-muted">
        The co-producer works in your Studio: it listens to the mix, tries ideas, fixes things and explains what it did.{" "}
        {provider === "anthropic"
          ? "It's Claude, on your own Anthropic API key"
          : "Through OpenRouter it can be Claude or any other model that can use tools, on your own OpenRouter key"}
        , so its calls are billed to {info.billed}.{" "}
        <a href={info.getKey} target="_blank" rel="noreferrer" className="text-brand-strong underline">
          Get a key
        </a>
      </p>
      <input
        // Not type="password": a password field makes the browser's password
        // manager fill a saved login email into the nearest text box (the
        // Studio's stem search). Masked with CSS instead.
        type="text"
        name={`${provider}-api-key`}
        autoComplete="off"
        data-1p-ignore
        data-lpignore="true"
        spellCheck={false}
        style={{ WebkitTextSecurity: "disc" } as React.CSSProperties}
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder={`${info.prefix}…`}
        className="input font-mono text-xs"
        aria-label={`${info.label} API key`}
      />
      <label className="flex flex-col gap-1 text-[11px] text-muted">
        Model
        <ModelPicker provider={provider} models={state.models} value={model} onChange={setModel} />
      </label>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-[11px] text-muted">Keep the key</legend>
        <label className={`flex items-start gap-2 ${state.signedIn ? "" : "opacity-50"}`}>
          <input type="radio" name={`where-${provider}`} checked={where === "account"} disabled={!state.signedIn} onChange={() => setWhere("account")} className="mt-0.5" />
          <span>
            <span className="font-semibold">On my account</span> — encrypted, works on all your devices{!state.signedIn && " (sign in first)"}
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name={`where-${provider}`} checked={where === "browser"} onChange={() => setWhere("browser")} className="mt-0.5" />
          <span>
            <span className="font-semibold">In this browser only</span> — never stored on our server
          </span>
        </label>
      </fieldset>
      {error && <p className="rounded-lg bg-danger/10 px-2 py-1.5 text-danger">{error}</p>}
      <button onClick={() => void save()} disabled={busy || !key.trim()} className="h-9 rounded-lg bg-brand text-xs font-bold text-white hover:bg-brand-strong disabled:opacity-50">
        {busy ? (
          <>
            <Loader2 className="animate-spin" /> Checking the key…
          </>
        ) : (
          "Connect"
        )}
      </button>
    </div>
  );
}

/** Claude (Anthropic) or OpenRouter — each with its own key and model. */
function ProviderSwitch({ value, onChange, disabled }: { value: Provider; onChange: (p: Provider) => void; disabled: boolean }) {
  return (
    <div className="flex shrink-0 overflow-hidden rounded-lg border border-border text-[11px] font-semibold" role="group" aria-label="AI provider">
      {PROVIDERS.map((p) => (
        <button
          key={p.id}
          onClick={() => onChange(p.id)}
          disabled={disabled}
          aria-pressed={value === p.id}
          className={`px-2.5 py-1 ${value === p.id ? "bg-brand text-white" : "text-muted hover:text-foreground"}`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

export default function CoProducer({ ctx, question }: { ctx: CoproducerContext; question?: { id: number; text: string } | null }) {
  const [keyState, setKeyState] = useState<KeyState | null>(null);
  const [provider, setProvider] = useState<Provider>("anthropic");
  // Keys kept in this browser, by provider (read after mount — localStorage).
  const [keys, setKeys] = useState<Partial<Record<Provider, string>>>({});
  const [models, setModels] = useState<Record<Provider, string>>({ anthropic: "claude-opus-5-5", openrouter: "" });
  const [history, setHistory] = useState<Message[]>([]);
  const [events, setEvents] = useState<ChatEvent[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  /** Connecting a key of their own, rather than using the site's free questions. */
  const [ownKey, setOwnKey] = useState(false);
  const stop = useRef(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const done = (state: KeyState) => {
      if (cancelled) return;
      setKeyState(state);
      setProvider(savedProvider());
      setKeys({ anthropic: browserKey("anthropic") ?? undefined, openrouter: browserKey("openrouter") ?? undefined });
      setModels({
        anthropic: savedModelChoice("anthropic") ?? state.saved.anthropic?.model ?? "claude-opus-5-5",
        openrouter: savedModelChoice("openrouter") ?? state.saved.openrouter?.model ?? "",
      });
    };
    void fetch("/api/ai/key")
      .then((res) => res.json())
      .then((state: KeyState) => done({ ...state, saved: state.saved ?? {} }))
      .catch(() => done({ signedIn: false, saved: {}, models: [{ id: "claude-opus-5-5", label: "Claude Opus 5.5", hint: "Best ideas and judgement" }] }));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [events]);

  // A question from elsewhere (a lane's "Ask AI") is filled in, not sent: the person sends it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- following a question asked elsewhere
    if (question) setDraft(question.text);
  }, [question]);

  /** How the current provider is connected: its key in this browser, on the account, or not yet. */
  const own: "browser" | "account" | null = keys[provider] ? "browser" : keyState?.saved[provider] ? "account" : null;
  const shared = keyState?.shared ?? null;
  // No key of their own: the site's free questions, while there are some left today (Claude only).
  const canShare = !own && !ownKey && provider === "anthropic" && !!keyState?.signedIn && (shared?.left ?? 0) > 0;
  const mode: "browser" | "account" | "shared" | null = own ?? (canShare ? "shared" : null);
  const model = models[provider];

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setDraft("");
    setBusy(true);
    stop.current = false;
    const asked = provider;
    try {
      const next = await converse(history, message, ctx, {
        provider,
        model,
        key: mode === "browser" ? keys[provider]! : null,
        onEvent: (e) => {
          setEvents((list) => [...list, e]);
          // Today's free questions used up: Quick help takes over until tomorrow.
          if (e.type === "error" && e.quota) setKeyState((s) => (s?.shared ? { ...s, shared: { ...s.shared, left: 0 } } : s));
          // A rejected key: back to connecting this provider.
          if (e.type === "error" && e.needsKey) {
            setBrowserKey(asked, null);
            setKeys((k) => ({ ...k, [asked]: undefined }));
            setKeyState((s) => (s ? { ...s, saved: { ...s.saved, [asked]: undefined } } : s));
          }
        },
        shouldStop: () => stop.current,
      });
      setHistory(next);
      // How many of the site's free questions are left now (a failed call doesn't use one up).
      if (mode === "shared") {
        void fetch("/api/ai/key")
          .then((res) => res.json())
          .then((state: KeyState) => setKeyState((s) => (s ? { ...s, shared: state.shared ?? null } : s)))
          .catch(() => {});
      }
    } finally {
      setBusy(false);
    }
  }

  async function forgetKey() {
    if (mode === "browser") {
      setBrowserKey(provider, null);
      setKeys((k) => ({ ...k, [provider]: undefined }));
    } else {
      await fetch(`/api/ai/key?provider=${provider}`, { method: "DELETE" }).catch(() => {});
      setKeyState((s) => (s ? { ...s, saved: { ...s.saved, [provider]: undefined } } : s));
    }
  }

  function chooseProvider(next: Provider) {
    setProvider(next);
    saveProvider(next);
  }

  function chooseModel(id: string) {
    setModels((m) => ({ ...m, [provider]: id }));
    saveModelChoice(provider, id);
    const valid = provider === "anthropic" || /^~?[\w.-]+\/[\w.:~-]+$/.test(id);
    if (mode === "account" && valid) {
      void fetch("/api/ai/key", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, model: id }) }).catch(() => {});
    }
  }

  if (!keyState) {
    return (
      <p className="py-6 text-center text-xs text-muted">
        <Loader2 className="animate-spin" /> Loading…
      </p>
    );
  }
  if (!mode) {
    const freeNote = shared
      ? keyState.signedIn
        ? shared.left === 0
          ? ` — today's ${shared.limit} free questions are used up (they come back tomorrow)`
          : ""
        : ` — sign in for ${shared.limit} free questions a day`
      : "";
    return (
      <div className="flex flex-col gap-3">
        <QuickHelp ctx={ctx} question={question} />
        <details className="group rounded-xl border border-border" open={ownKey}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-xs font-bold">
            <span>
              <KeyRound className="text-brand-strong" /> Talk to Claude — a real conversation
              <span className="font-normal text-muted">{freeNote || " — on your own key"}</span>
            </span>
          </summary>
          <div className="flex flex-col gap-2 px-3 pb-3">
            {ownKey && shared && (shared.left ?? 0) > 0 && (
              <button onClick={() => setOwnKey(false)} className="self-start text-[11px] font-semibold text-brand-strong hover:underline">
                ← Back to the free questions ({shared.left} left today)
              </button>
            )}
            <ProviderSwitch value={provider} onChange={chooseProvider} disabled={busy} />
            <KeySetup
              key={provider}
              provider={provider}
              state={keyState}
              onReady={(how, k, chosen) => {
                setOwnKey(false);
                setModels((m) => ({ ...m, [provider]: chosen }));
                if (how === "browser") setKeys((all) => ({ ...all, [provider]: k ?? undefined }));
                else setKeyState((s) => (s ? { ...s, saved: { ...s.saved, [provider]: { hint: "", model: chosen } } } : s));
              }}
            />
          </div>
        </details>
      </div>
    );
  }

  const hint = keyState.saved[provider]?.hint;
  return (
    <div className="flex min-h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
        {mode === "shared" ? (
          <span className="min-w-0 flex-1 truncate">
            <span className="font-semibold text-success">Free AI</span> · {shared?.left ?? 0} of {shared?.limit} questions left today ·{" "}
            <button onClick={() => setOwnKey(true)} disabled={busy} className="font-semibold text-brand-strong hover:underline">
              use my own key
            </button>
          </span>
        ) : (
          <>
            <ProviderSwitch value={provider} onChange={chooseProvider} disabled={busy} />
            <ModelPicker provider={provider} models={keyState.models} value={model} onChange={chooseModel} compact />
            <span className="min-w-0 flex-1 truncate">{mode === "browser" ? "key in this browser" : `key on your account${hint ? ` (${hint})` : ""}`}</span>
          </>
        )}
        {events.length > 0 && (
          <button
            onClick={() => {
              setHistory([]);
              setEvents([]);
            }}
            disabled={busy}
            className="rounded p-1 hover:bg-surface-hover hover:text-foreground"
            title="New conversation"
            aria-label="New conversation"
          >
            <RotateCcw />
          </button>
        )}
        {mode !== "shared" && (
          <button onClick={() => void forgetKey()} disabled={busy} className="rounded p-1 hover:bg-surface-hover hover:text-danger" title="Remove the key" aria-label="Remove the key">
            <Trash2 />
          </button>
        )}
      </div>

      {events.length === 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-bold">Ask your co-producer</p>
          <p className="text-xs text-muted">It listens to the mix, tries ideas you can compare Before/After, and tells you what it changed. Nothing&apos;s final until you keep it.</p>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => void send(s)} className="rounded-full border border-border px-3 py-1 text-[11px] font-semibold hover:border-brand">
                <Wand2 className="text-brand-strong" /> {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2" aria-live="polite">
        {events.map((e, i) =>
          e.type === "user" ? (
            <p key={i} dir="auto" className="ml-8 self-end whitespace-pre-wrap rounded-2xl rounded-br-sm bg-brand px-3 py-2 text-xs text-white">
              {e.text}
            </p>
          ) : e.type === "assistant" ? (
            <p key={i} dir="auto" className="mr-6 whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-surface px-3 py-2 text-xs leading-relaxed">
              {e.text}
            </p>
          ) : e.type === "tool" ? (
            <p key={i} className={`flex items-center gap-1.5 px-1 text-[11px] ${e.isError ? "text-danger" : "text-muted"}`}>
              <Wrench className="shrink-0" /> {e.summary}
            </p>
          ) : (
            <p key={i} className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
              {e.text}
            </p>
          )
        )}
        {busy && (
          <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted">
            <Loader2 className="animate-spin" /> Thinking…
          </p>
        )}
        <div ref={end} />
      </div>

      <form
        className="sticky bottom-0 mt-auto flex items-end gap-1.5 bg-background pt-1"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <textarea
          dir="auto"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(draft);
            }
          }}
          rows={2}
          placeholder="Ask anything — “make the drop hit harder”"
          className="input min-h-[2.75rem] flex-1 resize-none text-xs"
          aria-label="Message the co-producer"
        />
        {busy ? (
          <button type="button" onClick={() => (stop.current = true)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border hover:border-danger hover:text-danger" aria-label="Stop" title="Stop">
            <Square className="fill-current" />
          </button>
        ) : (
          <button type="submit" disabled={!draft.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand text-white hover:bg-brand-strong disabled:opacity-40" aria-label="Send">
            <ArrowUp className="h-5 w-5" />
          </button>
        )}
      </form>
    </div>
  );
}
