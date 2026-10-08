"use client";

import { useCallback, useEffect, useState } from "react";
import { CACHE_KINDS, cacheUsage, clearCache, type CacheKind, type CacheUsage } from "@/lib/client/localCache";
import { MODEL_CACHES, SIZE_HEADER } from "@/lib/client/modelCache";
import { LEGACY_RESULTS_CACHE } from "@/lib/client/neuralBeats";

// What Remixt keeps in this browser, with a button to clear each part: the
// IndexedDB cache (localCache.ts) and the AI models in Cache Storage
// (modelCache.ts). All of it comes back on its own when it's needed again.

type ModelKey = keyof typeof MODEL_CACHES;

const KIND_TEXT: Record<CacheKind, { title: string; body: string }> = {
  stem: {
    title: "Song audio",
    body: "Stems you've played, so opening a song or a draft again doesn't download it again. Kept up to 30 days.",
  },
  analysis: {
    title: "Analysis",
    body: "The key, rhythm and melody worked out from each stem, so the Studio and AI Match don't listen again.",
  },
  beats: {
    title: "Beats",
    body: "Where the beat model heard each beat and bar start — on a phone, beats a computer already heard.",
  },
};

const MODEL_TEXT: Record<ModelKey, { title: string; body: string }> = {
  splitter: {
    title: "Song splitter (AI model)",
    body: "Splits songs into vocals and beat on this device, and the runtime both models share. About 200 MB to download again.",
  },
  beats: {
    title: "Beat model",
    body: "Hears beats and bar starts. About 10 MB to download again.",
  },
};

type ModelUsage = Record<ModelKey, { files: number; bytes: number | null }>;

async function modelUsage(): Promise<ModelUsage> {
  const usage = { splitter: { files: 0, bytes: 0 }, beats: { files: 0, bytes: 0 } } as ModelUsage;
  if (typeof caches === "undefined") return usage;
  for (const key of Object.keys(MODEL_CACHES) as ModelKey[]) {
    try {
      if (!(await caches.has(MODEL_CACHES[key]))) continue;
      const cache = await caches.open(MODEL_CACHES[key]);
      for (const request of await cache.keys()) {
        const response = await cache.match(request);
        usage[key].files++;
        // Files kept before sizes were noted down: the size isn't known (and reading a model to find out is too much).
        const size = Number(response?.headers.get(SIZE_HEADER));
        usage[key].bytes = size && usage[key].bytes !== null ? usage[key].bytes + size : null;
      }
    } catch {
      // Leave it at what was counted.
    }
  }
  return usage;
}

function formatBytes(bytes: number | null) {
  if (bytes === null) return "size unknown";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function StorageSettings() {
  const [usage, setUsage] = useState<CacheUsage | null>(null);
  const [models, setModels] = useState<ModelUsage | null>(null);
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [u, m] = await Promise.all([cacheUsage(), modelUsage()]);
    setUsage(u);
    setModels(m);
    try {
      const e = await navigator.storage?.estimate?.();
      if (e?.quota) setEstimate({ usage: e.usage ?? 0, quota: e.quota });
      setPersisted((await navigator.storage?.persisted?.()) ?? null);
    } catch {
      // Not every browser says.
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- IndexedDB and Cache Storage only exist after mount
    void refresh();
  }, [refresh]);

  async function run(label: string, done: string, work: () => Promise<unknown>) {
    setBusy(label);
    setMessage(null);
    try {
      await work();
      setMessage(done);
    } catch {
      setMessage("Couldn't clear it — try closing other Remixt tabs first.");
    } finally {
      setBusy(null);
      await refresh();
    }
  }

  const clearKind = (kind: CacheKind) =>
    run(kind, `Cleared ${KIND_TEXT[kind].title.toLowerCase()}.`, async () => {
      await clearCache(kind);
      if (kind === "beats" && typeof caches !== "undefined") await caches.delete(LEGACY_RESULTS_CACHE);
    });

  const clearModel = (key: ModelKey) =>
    run(`model-${key}`, `Cleared the ${MODEL_TEXT[key].title.toLowerCase()} — it downloads again when it's next needed.`, () =>
      caches.delete(MODEL_CACHES[key])
    );

  function clearEverything() {
    if (!confirm("Clear everything Remixt keeps on this device? Your remixes, drafts and account aren't affected.")) return;
    void run("all", "Cleared everything. It comes back as you use the site.", async () => {
      await clearCache();
      if (typeof caches !== "undefined") {
        await Promise.all([...Object.values(MODEL_CACHES), LEGACY_RESULTS_CACHE].map((name) => caches.delete(name)));
      }
    });
  }

  async function keepIt() {
    try {
      setPersisted(await navigator.storage.persist());
    } catch {
      setPersisted(false);
    }
  }

  const row = (key: string, title: string, body: string, size: string, empty: boolean, onClear: () => void) => (
    <div key={key} className="flex items-start gap-4 border-t border-border py-4 first:border-t-0">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 text-sm text-muted">{body}</p>
        <p className="mt-1 text-xs text-muted">{size}</p>
      </div>
      <button
        onClick={onClear}
        disabled={empty || busy !== null}
        className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:border-danger/60 hover:text-danger disabled:opacity-40 disabled:hover:border-border disabled:hover:text-foreground"
      >
        {busy === key ? "Clearing…" : "Clear"}
      </button>
    </div>
  );

  return (
    <div className="mt-6 flex flex-col gap-6">
      {estimate && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-sm text-muted">Remixt uses on this device</p>
          <p className="mt-1 text-2xl font-bold">{formatBytes(estimate.usage)}</p>
          <p className="mt-1 text-xs text-muted">of the {formatBytes(estimate.quota)} your browser allows it</p>
          {persisted === false && "persist" in (navigator.storage ?? {}) && (
            <button onClick={keepIt} className="mt-3 text-sm font-medium text-brand-strong hover:underline">
              Ask the browser not to clear it when space runs low
            </button>
          )}
          {persisted && <p className="mt-3 text-xs text-success">Your browser keeps this even when space runs low.</p>}
        </div>
      )}

      <section className="rounded-xl border border-border bg-surface px-4">
        <h2 className="pt-4 text-sm font-semibold uppercase tracking-wide text-muted">Your music</h2>
        {!usage && <p className="py-4 text-sm text-muted">Looking…</p>}
        {usage &&
          CACHE_KINDS.map((kind) =>
            row(
              kind,
              KIND_TEXT[kind].title,
              KIND_TEXT[kind].body,
              usage[kind].count ? `${usage[kind].count} saved · ${formatBytes(usage[kind].bytes)}` : "Nothing saved",
              usage[kind].count === 0 && kind !== "beats",
              () => void clearKind(kind)
            )
          )}
      </section>

      <section className="rounded-xl border border-border bg-surface px-4">
        <h2 className="pt-4 text-sm font-semibold uppercase tracking-wide text-muted">AI models</h2>
        {!models && <p className="py-4 text-sm text-muted">Looking…</p>}
        {models &&
          (Object.keys(MODEL_CACHES) as ModelKey[]).map((key) =>
            row(
              `model-${key}`,
              MODEL_TEXT[key].title,
              MODEL_TEXT[key].body,
              models[key].files ? `Downloaded · ${formatBytes(models[key].bytes)}` : "Not downloaded",
              models[key].files === 0,
              () => void clearModel(key)
            )
          )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={clearEverything}
          disabled={busy !== null}
          className="rounded-lg border border-danger/60 px-4 py-2.5 text-sm font-semibold text-danger transition-colors hover:bg-danger/10 disabled:opacity-40"
        >
          {busy === "all" ? "Clearing…" : "Clear everything"}
        </button>
        {message && <p className="text-sm text-muted" role="status">{message}</p>}
      </div>
    </div>
  );
}
