"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ROLES,
  applyIdea,
  askLocalModel,
  ideaFits,
  mixSignature,
  prepareSession,
  studioIdeas,
  syncEverythingIdea,
  type Idea,
  type Role,
  type Session,
} from "@/lib/client/aiIdeas";
import { audioEngine } from "@/lib/client/audioEngine";
import {
  DEFAULT_URLS,
  RECOMMENDED_MODELS,
  listModels,
  loadSettings,
  saveSettings,
  type LocalAiSettings,
} from "@/lib/client/localAi";
import { undo } from "@/lib/client/studioHistory";
import { useStudioStore } from "@/lib/client/studioStore";
import { useStudioView } from "@/lib/client/studioView";
import { useKeepScreenOn } from "@/lib/client/wakeLock";

// The AI producer panel: pick whose ideas you want (remixer, sound
// engineer, beatmaker, or all three), get a handful of concrete takes on
// your mix, hear one, keep it or try the next. The studio's own ideas come
// instantly; a model on your own machine can add more, and take requests.

type Applied = { id: string; lanes: unknown };

function LocalAiSetup({ settings, onChange }: { settings: LocalAiSettings; onChange: (s: LocalAiSettings) => void }) {
  const [models, setModels] = useState<string[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  async function check(next = settings) {
    setChecking(true);
    setError(null);
    try {
      const found = await listModels(next);
      setModels(found);
      if (!next.model && found.length) {
        const preferred = RECOMMENDED_MODELS.find((m) => found.some((f) => f.startsWith(m))) ;
        const model = found.find((f) => preferred && f.startsWith(preferred)) ?? found[0];
        onChange({ ...next, model });
      }
      if (!found.length) setError(next.kind === "ollama" ? "Ollama is running but has no models yet — see step 2." : "No models loaded on the server.");
    } catch (err) {
      setModels(null);
      setError(err instanceof Error ? err.message : "Couldn't reach it");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-background p-3 text-xs">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => {
            const next = { ...settings, enabled: e.target.checked };
            onChange(next);
            if (next.enabled) void check(next);
          }}
          className="accent-brand"
        />
        <span className="font-medium">Use a model running on my computer</span>
      </label>
      <p className="text-muted">
        Free and private: the model runs on your machine and only sees the studio&apos;s measurements (tempos, keys, bars), never
        the audio. Nothing goes to our servers.
      </p>
      {settings.enabled && (
        <>
          <div className="flex gap-1">
            {(["ollama", "openai"] as const).map((kind) => (
              <button
                key={kind}
                onClick={() => onChange({ ...settings, kind, url: DEFAULT_URLS[kind], model: "" })}
                className={`flex-1 rounded-lg border px-2 py-1.5 font-medium ${settings.kind === kind ? "border-brand bg-brand/15" : "border-border text-muted"}`}
              >
                {kind === "ollama" ? "Ollama" : "LM Studio / OpenAI-style"}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-muted">
            Address
            <input
              value={settings.url}
              onChange={(e) => onChange({ ...settings, url: e.target.value })}
              className="input !py-1 font-mono text-xs"
              spellCheck={false}
            />
          </label>
          <div className="flex items-center gap-2">
            <select
              value={settings.model}
              onChange={(e) => onChange({ ...settings, model: e.target.value })}
              className="input !py-1 text-xs"
              aria-label="Model"
            >
              <option value="">{models ? "Pick a model" : "Connect to list models"}</option>
              {(models ?? (settings.model ? [settings.model] : [])).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <button onClick={() => void check()} disabled={checking} className="shrink-0 rounded-lg border border-border px-3 py-1.5 font-medium hover:border-brand disabled:opacity-50">
              {checking ? "…" : models ? "Refresh" : "Connect"}
            </button>
          </div>
          {models && !error && <p className="text-success">Connected — {models.length} model{models.length === 1 ? "" : "s"} available.</p>}
          {error && <p className="text-danger">{error}</p>}
          <details className="text-muted" open={!!error}>
            <summary className="cursor-pointer hover:text-foreground">How to set it up</summary>
            {settings.kind === "ollama" ? (
              <ol className="mt-2 list-decimal space-y-1.5 pl-4">
                <li>
                  Install Ollama from <span className="text-foreground">ollama.com</span>.
                </li>
                <li>
                  Get a model (a few GB, once): <code className="rounded bg-surface px-1 text-foreground">ollama pull qwen2.5:7b</code> — or{" "}
                  <code className="rounded bg-surface px-1 text-foreground">qwen2.5:3b</code> on a slower machine.
                </li>
                <li>
                  Let this site talk to it: quit Ollama, then run{" "}
                  <code className="break-all rounded bg-surface px-1 text-foreground">OLLAMA_ORIGINS=&quot;{origin}&quot; ollama serve</code>
                  <span className="block pt-1">
                    (Mac app: <code className="break-all rounded bg-surface px-1 text-foreground">launchctl setenv OLLAMA_ORIGINS &quot;{origin}&quot;</code>, then
                    restart Ollama.)
                  </span>
                </li>
                <li>Press Connect.</li>
              </ol>
            ) : (
              <ol className="mt-2 list-decimal space-y-1.5 pl-4">
                <li>Load a model in LM Studio (or start llama.cpp&apos;s server).</li>
                <li>Developer → start the server, and turn on “Enable CORS”.</li>
                <li>Press Connect.</li>
              </ol>
            )}
          </details>
        </>
      )}
    </div>
  );
}

function IdeaCard({
  idea,
  fits,
  applied,
  canUndo,
  onApply,
  onListen,
  onUndo,
}: {
  idea: Idea;
  fits: boolean;
  applied: boolean;
  canUndo: boolean;
  onApply: () => void;
  onListen: () => void;
  onUndo: () => void;
}) {
  const role = ROLES.find((r) => r.id === idea.role)!;
  return (
    <article
      className={`rounded-xl border p-3 transition-colors ${
        applied ? "border-brand bg-brand/10" : fits ? "border-border bg-surface hover:border-brand/50" : "border-border bg-surface opacity-50"
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-base leading-none" title={role.label}>
          {role.icon}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-snug">{idea.title}</h3>
          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted">
            {role.label}
            {idea.source === "local-ai" && <span className="ml-1.5 rounded bg-vocals/20 px-1 py-px text-vocals normal-case tracking-normal">🧠 local AI</span>}
          </p>
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-foreground/80">{idea.why}</p>
      <details className="mt-1.5">
        <summary className="cursor-pointer text-[11px] text-muted hover:text-foreground">What it changes ({idea.lines.length})</summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] leading-relaxed text-muted">
          {idea.lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </details>
      <div className="mt-2.5 flex items-center gap-1.5">
        {!fits ? (
          <span className="text-[11px] text-muted">Made for lanes that have changed — refresh to get new ideas.</span>
        ) : applied ? (
          <>
            <span className="text-xs font-semibold text-brand-strong">✓ Applied</span>
            <button onClick={onListen} className="nudge">
              ▶ listen
            </button>
            {canUndo && (
              <button onClick={onUndo} className="nudge ml-auto">
                ↶ undo
              </button>
            )}
          </>
        ) : (
          <>
            <button onClick={onListen} className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:border-brand pointer-coarse:py-1.5" title="Apply it and play from the interesting bit">
              ▶ Hear it
            </button>
            <button onClick={onApply} className="rounded-lg bg-brand px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-brand-strong pointer-coarse:py-1.5">
              Apply
            </button>
          </>
        )}
      </div>
    </article>
  );
}

export default function AiProducer() {
  const open = useStudioView((s) => s.aiOpen);
  const setOpen = useStudioView((s) => s.setAiOpen);
  const lanes = useStudioStore((s) => s.lanes);
  const [role, setRole] = useState<Role | "all">("all");
  const [request, setRequest] = useState("");
  const [vocalId, setVocalId] = useState<string>("");
  const [beatId, setBeatId] = useState<string>("");
  const [session, setSession] = useState<Session | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<Applied | null>(null);
  const [settings, setSettings] = useState<LocalAiSettings | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [modelProgress, setModelProgress] = useState<{ chars: number; started: number } | null>(null);
  const [now, setNow] = useState(0);
  const abort = useRef<AbortController | null>(null);
  useKeepScreenOn("ai-producer", busy !== null);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage only exists after mount
  useEffect(() => setSettings(loadSettings()), []);
  useEffect(() => {
    if (!modelProgress) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [modelProgress]);
  useEffect(() => () => abort.current?.abort(), []);

  // Escape closes the panel (before it stops the mix).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector('[role="menu"]')) {
        e.stopImmediatePropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [open, setOpen]);

  const vocals = lanes.filter((l) => l.kind === "vocals");
  const backings = lanes.filter((l) => l.kind !== "vocals");
  const signature = mixSignature(lanes);
  // The mix has moved on since the ideas were made (lanes swapped, added, removed, re-tempoed).
  const stale = !!session && session.signature !== signature;
  const visible = useMemo(() => ideas.filter((i) => role === "all" || i.role === role), [ideas, role]);
  const modelOn = !!settings?.enabled && !!settings.model;

  function updateSettings(next: LocalAiSettings) {
    setSettings(next);
    saveSettings(next);
  }

  async function getIdeas() {
    abort.current?.abort();
    setError(null);
    setApplied(null);
    setBusy("Listening to your lanes…");
    let fresh: Session;
    let found: Idea[] = [];
    try {
      fresh = await prepareSession(vocalId || null, beatId || null);
      setSession(fresh);
      setBusy("Working out ideas…");
      // Let the panel paint before the (synchronous) arranging.
      await new Promise((r) => setTimeout(r, 30));
      found = studioIdeas(fresh);
      const sync = await syncEverythingIdea(fresh).catch(() => null);
      if (sync) found.push(sync);
      setIdeas(found);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't analyse the lanes");
      setBusy(null);
      return;
    }
    if (!modelOn || !settings) {
      setBusy(null);
      return;
    }
    await askModel(fresh, found);
  }

  async function askModel(current: Session, offered: Idea[]) {
    if (!settings) return;
    const controller = new AbortController();
    abort.current = controller;
    setBusy(`Asking ${settings.model}…`);
    setModelProgress({ chars: 0, started: Date.now() });
    setNow(Date.now());
    try {
      const { ideas: extra, skipped } = await askLocalModel(settings, current, {
        roles: role === "all" ? ["remixer", "engineer", "beatmaker"] : [role],
        request,
        offered,
        signal: controller.signal,
        onProgress: (chars) => setModelProgress((p) => (p ? { ...p, chars } : p)),
      });
      setIdeas((existing) => [...extra, ...existing]);
      if (!extra.length) setError(`The model's ideas didn't work out${skipped ? ` (${skipped} skipped)` : ""} — try again or rephrase.`);
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") setError(err instanceof Error ? err.message : "The local model failed");
    } finally {
      if (abort.current === controller) abort.current = null;
      setModelProgress(null);
      setBusy(null);
    }
  }

  function apply(idea: Idea) {
    try {
      applyIdea(idea);
      setApplied({ id: idea.id, lanes: useStudioStore.getState().lanes });
      // Applying it was this person's choice, so the ideas still fit the mix.
      setSession((s) => (s ? { ...s, signature: mixSignature(useStudioStore.getState().lanes) } : s));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't apply that");
      return false;
    }
  }

  function listen(idea: Idea) {
    if (applied?.id !== idea.id && !apply(idea)) return;
    audioEngine.seek(idea.listenAt ?? 0);
    if (!useStudioStore.getState().isPlaying) void audioEngine.play().catch(() => {});
  }

  if (!open) return null;

  // Undo is only offered while nothing else has changed since applying.
  const canUndo = !!applied && useStudioStore.getState().lanes === applied.lanes;

  return (
    <>
      <div className="fixed inset-0 z-[55] bg-black/40 lg:hidden" onClick={() => setOpen(false)} />
      <aside
        aria-label="AI producer"
        className="fixed z-[56] flex flex-col border-border bg-background shadow-2xl max-lg:inset-x-0 max-lg:bottom-0 max-lg:max-h-[88dvh] max-lg:rounded-t-2xl max-lg:border max-lg:border-b-0 lg:top-[var(--header-h)] lg:right-0 lg:bottom-0 lg:w-[25rem] lg:border-l"
        style={{ animation: "sheet-in 0.2s ease-out" }}
      >
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-vocals text-base">✨</span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold">AI producer</h2>
            <p className="truncate text-[11px] text-muted">
              {modelOn ? `Studio analysis + 🧠 ${settings!.model}` : "Studio analysis · add a local model for more"}
            </p>
          </div>
          <button
            onClick={() => setShowSetup((v) => !v)}
            className={`rounded-lg border px-2 py-1 text-[11px] ${showSetup ? "border-brand text-foreground" : "border-border text-muted hover:text-foreground"}`}
            aria-expanded={showSetup}
          >
            🧠 Local AI
          </button>
          <button onClick={() => setOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-foreground" aria-label="Close">
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {showSetup && settings && (
            <div className="mb-3">
              <LocalAiSetup settings={settings} onChange={updateSettings} />
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            <div className="grid grid-cols-4 gap-1 rounded-xl bg-surface p-1" role="tablist" aria-label="Whose ideas">
              {[{ id: "all" as const, label: "All", icon: "✨" }, ...ROLES].map((r) => (
                <button
                  key={r.id}
                  role="tab"
                  aria-selected={role === r.id}
                  onClick={() => setRole(r.id)}
                  className={`flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[10.5px] font-medium transition-colors ${
                    role === r.id ? "bg-brand text-white" : "text-muted hover:text-foreground"
                  }`}
                >
                  <span className="text-sm leading-none">{r.icon}</span>
                  {r.id === "engineer" ? "Engineer" : r.label}
                </button>
              ))}
            </div>

            {(vocals.length > 1 || backings.length > 1) && (
              <div className="grid grid-cols-2 gap-2 text-[11px] text-muted">
                <label className="flex flex-col gap-1">
                  Vocal
                  <select value={vocalId} onChange={(e) => setVocalId(e.target.value)} className="input !py-1 text-xs">
                    <option value="">Auto</option>
                    {vocals.map((l) => (
                      <option key={l.laneId} value={l.laneId}>
                        {l.trackTitle}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  Beat
                  <select value={beatId} onChange={(e) => setBeatId(e.target.value)} className="input !py-1 text-xs">
                    <option value="">Auto</option>
                    {backings.map((l) => (
                      <option key={l.laneId} value={l.laneId}>
                        {l.trackTitle}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {modelOn && (
              <textarea
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                placeholder="Ask for something (optional) — e.g. “darker, trap feel”, “start with the chorus”, “make it danceable”"
                rows={2}
                className="input resize-none text-xs"
              />
            )}

            <div className="flex gap-2">
              <button
                onClick={() => void getIdeas()}
                disabled={busy !== null || lanes.length === 0}
                className="flex-1 rounded-xl bg-gradient-to-r from-brand to-vocals px-4 py-2.5 text-sm font-bold text-white shadow-[0_0_20px_-8px_var(--vocals)] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy ?? (ideas.length ? "↻ Fresh ideas" : "✨ Get ideas")}
              </button>
              {busy && (
                <button
                  onClick={() => {
                    abort.current?.abort();
                    setBusy(null);
                  }}
                  className="rounded-xl border border-border px-3 text-xs text-muted hover:text-foreground"
                >
                  Stop
                </button>
              )}
            </div>
            {modelProgress && (
              <p className="text-[11px] text-muted">
                🧠 Thinking… {Math.max(0, Math.round((now - modelProgress.started) / 1000))}s
                {modelProgress.chars > 0 && ` · ${modelProgress.chars.toLocaleString()} characters`} — the studio&apos;s own ideas are below meanwhile.
              </p>
            )}
            {!modelOn && ideas.length > 0 && !showSetup && (
              <button onClick={() => setShowSetup(true)} className="text-left text-[11px] text-muted hover:text-foreground">
                Want ideas that take requests (“darker”, “more drops”)? 🧠 Connect a free local model →
              </button>
            )}
          </div>

          {error && <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
          {stale && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-drums/50 bg-drums/10 px-3 py-2 text-xs">
              <span className="flex-1">Your lanes changed since these ideas were made. Ideas for lanes that are gone are greyed out.</span>
              <button onClick={() => void getIdeas()} disabled={busy !== null} className="shrink-0 font-semibold text-drums hover:underline">
                Refresh
              </button>
            </div>
          )}
          {session?.notes.map((note) => (
            <p key={note} className="mt-2 text-[11px] text-muted">
              ℹ {note}
            </p>
          ))}

          {ideas.length === 0 && !busy && (
            <div className="mt-6 flex flex-col gap-3 text-xs text-muted">
              {ROLES.map((r) => (
                <div key={r.id} className="flex gap-3 rounded-xl border border-dashed border-border p-3">
                  <span className="text-xl">{r.icon}</span>
                  <div>
                    <p className="font-semibold text-foreground">{r.label}</p>
                    <p>{r.blurb}</p>
                  </div>
                </div>
              ))}
              <p>The studio listens to every lane once (tempo, key, bars, the vocal&apos;s sections) and suggests ways to put them together. Nothing changes until you apply one — and undo always brings it back.</p>
            </div>
          )}

          <div className="mt-3 flex flex-col gap-2.5">
            {visible.map((idea) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                fits={ideaFits(idea, lanes)}
                applied={applied?.id === idea.id}
                canUndo={canUndo}
                onApply={() => apply(idea)}
                onListen={() => listen(idea)}
                onUndo={() => {
                  undo();
                  setApplied(null);
                }}
              />
            ))}
            {ideas.length > 0 && visible.length === 0 && (
              <p className="text-xs text-muted">No {ROLES.find((r) => r.id === role)?.label.toLowerCase()} ideas for this mix — try another role.</p>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
