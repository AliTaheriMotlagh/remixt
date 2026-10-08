"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, KeyRound, Loader2, MessageCircle, RotateCcw, Square, Trash2, Wand2, Wrench } from "lucide-react";
import { browserKey, converse, saveModelChoice, savedModelChoice, setBrowserKey, type ChatEvent, type Message } from "@/lib/client/coproducerChat";
import type { CoproducerContext } from "@/lib/client/coproducerTools";

// The AI co-producer: a chat with Claude that can listen to the mix
// (through the Studio's analysis), try the AI producer's ideas, adjust
// lanes and play the result. It runs on the person's own Anthropic API key
// — saved to their account (encrypted), or kept in this browser only.

type Model = { id: string; label: string; hint: string };
type KeyState = { signedIn: boolean; saved: boolean; hint: string | null; model: string | null; models: Model[] };

const SUGGESTIONS = [
  "Make it sound as good as you can",
  "Why does it sound off?",
  "Make it a radio hit",
  "Is the vocal in tune with the beat?",
  "Give the chorus more energy",
];

function KeySetup({ state, onReady }: { state: KeyState; onReady: (mode: "account" | "browser", key: string | null) => void }) {
  const [key, setKey] = useState("");
  const [model, setModel] = useState(state.model ?? state.models[0]?.id ?? "claude-opus-5-5");
  const [where, setWhere] = useState<"account" | "browser">(state.signedIn ? "account" : "browser");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const trimmed = key.trim();
    if (!/^sk-ant-/.test(trimmed)) {
      setError("An Anthropic API key starts with sk-ant-");
      return;
    }
    setError(null);
    saveModelChoice(model);
    if (where === "browser") {
      setBrowserKey(trimmed);
      onReady("browser", trimmed);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/ai/key", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: trimmed, model }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't save the key");
      onReady("account", null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the key");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3 text-xs">
      <p className="flex items-center gap-2 text-sm font-bold">
        <KeyRound className="text-brand-strong" /> Connect your AI
      </p>
      <p className="text-muted">
        The co-producer is Claude, working in your Studio: it listens to the mix, tries ideas, fixes things and explains what it did. It uses your own Anthropic API key, so its
        calls are billed to your Anthropic account.{" "}
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="text-brand-strong underline">
          Get a key
        </a>
      </p>
      <input
        // Not type="password": a password field makes the browser's password
        // manager fill a saved login email into the nearest text box (the
        // Studio's stem search). Masked with CSS instead.
        type="text"
        name="anthropic-api-key"
        autoComplete="off"
        data-1p-ignore
        data-lpignore="true"
        spellCheck={false}
        style={{ WebkitTextSecurity: "disc" } as React.CSSProperties}
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="sk-ant-…"
        className="input font-mono text-xs"
        aria-label="Anthropic API key"
      />
      <label className="flex flex-col gap-1 text-[11px] text-muted">
        Model
        <select value={model} onChange={(e) => setModel(e.target.value)} className="input !py-1 text-xs">
          {state.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} — {m.hint}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-[11px] text-muted">Keep the key</legend>
        <label className={`flex items-start gap-2 ${state.signedIn ? "" : "opacity-50"}`}>
          <input type="radio" name="where" checked={where === "account"} disabled={!state.signedIn} onChange={() => setWhere("account")} className="mt-0.5" />
          <span>
            <span className="font-semibold">On my account</span> — encrypted, works on all your devices{!state.signedIn && " (sign in first)"}
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="where" checked={where === "browser"} onChange={() => setWhere("browser")} className="mt-0.5" />
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

export default function CoProducer({ ctx, question }: { ctx: CoproducerContext; question?: { id: number; text: string } | null }) {
  const [keyState, setKeyState] = useState<KeyState | null>(null);
  const [mode, setMode] = useState<"account" | "browser" | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [model, setModel] = useState("claude-opus-5-5");
  const [history, setHistory] = useState<Message[]>([]);
  const [events, setEvents] = useState<ChatEvent[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const stop = useRef(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/ai/key")
      .then((res) => res.json())
      .then((state: KeyState) => {
        if (cancelled) return;
        setKeyState(state);
        const local = browserKey();
        const chosen = savedModelChoice() ?? state.model;
        if (chosen && state.models.some((m) => m.id === chosen)) setModel(chosen);
        if (local) {
          setMode("browser");
          setKey(local);
        } else if (state.saved) {
          setMode("account");
        }
      })
      .catch(() => !cancelled && setKeyState({ signedIn: false, saved: false, hint: null, model: null, models: [{ id: "claude-opus-5-5", label: "Claude Opus 5.5", hint: "Best ideas and judgement" }] }));
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

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setDraft("");
    setBusy(true);
    stop.current = false;
    try {
      const next = await converse(history, message, ctx, {
        model,
        key: mode === "browser" ? key : null,
        onEvent: (e) => {
          setEvents((list) => [...list, e]);
          if (e.type === "error" && e.needsKey) setMode(null);
        },
        shouldStop: () => stop.current,
      });
      setHistory(next);
    } finally {
      setBusy(false);
    }
  }

  async function forgetKey() {
    if (mode === "browser") {
      setBrowserKey(null);
      setKey(null);
    } else {
      await fetch("/api/ai/key", { method: "DELETE" }).catch(() => {});
      setKeyState((s) => (s ? { ...s, saved: false, hint: null } : s));
    }
    setMode(null);
  }

  function chooseModel(id: string) {
    setModel(id);
    saveModelChoice(id);
    if (mode === "account") void fetch("/api/ai/key", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: id }) }).catch(() => {});
  }

  if (!keyState) {
    return (
      <p className="py-6 text-center text-xs text-muted">
        <Loader2 className="animate-spin" /> Loading…
      </p>
    );
  }
  if (!mode) {
    return (
      <KeySetup
        state={keyState}
        onReady={(how, k) => {
          setMode(how);
          setKey(k);
          if (how === "account") setKeyState((s) => (s ? { ...s, saved: true } : s));
          const chosen = savedModelChoice();
          if (chosen) setModel(chosen);
        }}
      />
    );
  }

  return (
    <div className="flex min-h-full flex-col gap-3">
      <div className="flex items-center gap-2 text-[11px] text-muted">
        <MessageCircle className="text-brand-strong" />
        <select value={model} onChange={(e) => chooseModel(e.target.value)} className="input !w-auto !py-0.5 text-[11px]" aria-label="Model">
          {keyState.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <span className="min-w-0 flex-1 truncate">{mode === "browser" ? "key in this browser" : `key on your account${keyState.hint ? ` (${keyState.hint})` : ""}`}</span>
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
        <button onClick={() => void forgetKey()} disabled={busy} className="rounded p-1 hover:bg-surface-hover hover:text-danger" title="Remove the key" aria-label="Remove the key">
          <Trash2 />
        </button>
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
