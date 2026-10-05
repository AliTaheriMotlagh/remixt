"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDownUp, Library, Loader2, Music2, RefreshCw, Search, X } from "lucide-react";
import { DEMO_ENTRIES, libraryEntries } from "@/lib/client/dj/djLibraryTracks";
import { browse, fitWith, signedTempoGap, type BrowserEntry, type SortKey } from "@/lib/client/dj/djLibrary";
import type { DeckId } from "@/lib/client/dj/djTypes";
import { fmtTime } from "@/lib/client/dj/djMath";
import { camelotCode, keyFit, keyLabel, type MusicalKey } from "@/lib/client/musicKey";

const FIT_LABEL = {
  same: { text: "Same key", cls: "text-success" },
  relative: { text: "Relative key", cls: "text-success" },
  neighbour: { text: "Neighbour key", cls: "text-beat" },
  far: { text: "Two steps: tense", cls: "text-drums" },
  clash: { text: "Key clash", cls: "text-danger" },
} as const;

const SORTS: { id: SortKey; label: string }[] = [
  { id: "title", label: "Title" },
  { id: "artist", label: "Artist" },
  { id: "bpm", label: "BPM" },
  { id: "key", label: "Key (Camelot)" },
  { id: "duration", label: "Length" },
];

export type OtherDeck = { bpm: number; key: MusicalKey; title: string } | null;

/**
 * The track browser: songs from the shared library (default when there
 * are any) and the demo songs. Search, sort, and a filter for what fits
 * the track on the other deck (Camelot same/±1/twin, tempo within 6 %
 * counting half and double time).
 */
export default function TrackLibrary({
  deck,
  other,
  loadingId,
  onPick,
  onClose,
}: {
  deck: DeckId;
  other: OtherDeck;
  loadingId: string | null;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"library" | "demo" | null>(null);
  const [lib, setLib] = useState<BrowserEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sort, setSort] = useState<SortKey>("title");
  const [desc, setDesc] = useState(false);
  const [fitsOnly, setFitsOnly] = useState(false);
  const [busy, setBusy] = useState(true);
  const search = useRef<HTMLInputElement>(null);

  const apply = (p: Promise<{ entries: BrowserEntry[] }>) =>
    p
      .then(({ entries }) => {
        setLib(entries);
        setTab((t) => t ?? (entries.length ? "library" : "demo"));
      })
      .catch(() => {
        setError("Couldn't load the library. The demo songs still work.");
        setLib([]);
        setTab((t) => t ?? "demo");
      })
      .finally(() => setBusy(false));

  const refresh = () => {
    setBusy(true);
    setError(null);
    void apply(libraryEntries(true));
  };

  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    void apply(libraryEntries());
    // Focus the search on desktop; on a phone that would pop the keyboard over the list.
    if (window.matchMedia?.("(pointer: fine)").matches) search.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const shown = tab ?? "demo";
  const rows = useMemo(
    () => browse(shown === "library" ? (lib ?? []) : DEMO_ENTRIES, { text, sort, descending: desc, compatibleOnly: fitsOnly, other: other ? { bpm: other.bpm, key: other.key } : null }),
    [shown, lib, text, sort, desc, fitsOnly, other]
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="presentation">
      <button type="button" aria-label="Close the browser" className="absolute inset-0 bg-black/60" onClick={onClose} tabIndex={-1} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Load a track on Deck ${deck}`}
        className="touch-targets relative flex max-h-[90dvh] w-full flex-col rounded-t-2xl border border-border bg-surface-raised shadow-2xl max-sm:pb-[env(safe-area-inset-bottom)] sm:max-w-2xl sm:rounded-2xl"
      >
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold">Load on Deck {deck}</h2>
            {other && (
              <p className="truncate text-[11px] text-muted">
                Other deck: {other.title} · {other.bpm.toFixed(1)} BPM · {camelotCode(other.key)}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-9 shrink-0 items-center justify-center rounded-lg hover:bg-surface-hover">
            <X />
          </button>
        </header>

        <div className="flex flex-col gap-2 border-b border-border px-3 py-2">
          <div role="tablist" aria-label="Source" className="grid grid-cols-2 gap-1">
            {(
              [
                ["library", "Library", Library, lib?.length],
                ["demo", "Demo songs", Music2, DEMO_ENTRIES.length],
              ] as const
            ).map(([id, label, Icon, n]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={shown === id}
                onClick={() => setTab(id)}
                className={`flex min-h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold ${shown === id ? "bg-brand text-white" : "bg-surface text-muted hover:text-foreground"}`}
              >
                <Icon /> {label}
                {n !== undefined && <span className="text-xs opacity-75">({n})</span>}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-0 flex-1 basis-40">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                ref={search}
                type="search"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Search title, artist, 8A, 124…"
                aria-label="Search tracks"
                className="min-h-10 w-full rounded-lg border border-border bg-surface pl-8 pr-2 text-sm"
              />
            </label>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort by" className="min-h-10 rounded-lg border border-border bg-surface px-2 text-sm">
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => setDesc(!desc)} aria-label={desc ? "Sorted descending" : "Sorted ascending"} aria-pressed={desc} className="flex size-10 items-center justify-center rounded-lg border border-border hover:bg-surface-hover">
              <ArrowDownUp />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <label className={`flex min-h-8 items-center gap-1.5 ${other ? "" : "opacity-50"}`}>
              <input type="checkbox" checked={fitsOnly} disabled={!other} onChange={(e) => setFitsOnly(e.target.checked)} className="size-4 accent-brand" />
              Fits the other deck (key ±1, tempo ±6 %)
            </label>
            {shown === "library" && (
              <button type="button" onClick={refresh} disabled={busy} className="ml-auto flex min-h-8 items-center gap-1 text-muted hover:text-foreground">
                <RefreshCw className={busy ? "animate-spin" : ""} /> Refresh
              </button>
            )}
          </div>
        </div>

        <ul className="flex min-h-40 flex-col gap-1.5 overflow-y-auto p-3">
          {error && <li className="text-sm text-danger">{error}</li>}
          {shown === "library" && lib === null && (
            <li className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="animate-spin" /> Loading the library…
            </li>
          )}
          {shown === "library" && lib && lib.length === 0 && !error && (
            <li className="rounded-xl border border-dashed border-border p-4 text-sm text-muted">
              No songs in the library yet.{" "}
              <Link href="/upload" className="font-semibold text-brand-strong underline">
                Split a song
              </Link>{" "}
              and it appears here, ready to mix.
            </li>
          )}
          {rows.length === 0 && (shown === "demo" || (lib && lib.length > 0)) && <li className="text-sm text-muted">Nothing matches. Clear the search or the filter.</li>}
          {rows.map((t) => {
            const fit = other && t.key ? FIT_LABEL[keyFit(t.key, other.key)] : null;
            const f = fitWith(t, other ? { bpm: other.bpm, key: other.key } : null);
            const gap = other && t.bpm ? signedTempoGap(t.bpm, other.bpm) * 100 : null;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onPick(t.id)}
                  disabled={loadingId !== null}
                  className={`flex w-full items-center gap-3 rounded-xl border bg-surface p-2.5 text-left hover:bg-surface-hover disabled:opacity-60 ${f?.compatible ? "border-success/60" : "border-border"}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{t.title}</p>
                    <p className="truncate text-xs text-muted">
                      {t.artist}
                      {t.duration ? ` · ${fmtTime(t.duration)}` : ""} · {t.layout === "four" ? "4 stems" : "Vocals + beat"}
                    </p>
                    {other && (
                      <p className="mt-0.5 text-[11px]">
                        {fit ? <span className={fit.cls}>{fit.text}</span> : <span className="text-muted">Key found on load</span>}
                        {gap !== null && (
                          <span className={Math.abs(gap) <= 6 ? "text-success" : "text-muted"}>
                            {" "}
                            · tempo {gap > 0 ? "+" : ""}
                            {gap.toFixed(1)}%
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right text-xs">
                    {loadingId === t.id ? <Loader2 className="ml-auto animate-spin" /> : null}
                    <p className="font-mono font-bold tabular-nums">{t.bpm ? `${t.bpm.toFixed(t.analyzed && t.source === "library" ? 2 : 0)} BPM` : "— BPM"}</p>
                    <p className="text-muted">
                      {t.key ? (
                        <>
                          {keyLabel(t.key)} · <span className="font-semibold text-brand-strong">{camelotCode(t.key)}</span>
                        </>
                      ) : (
                        "Key: on load"
                      )}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
        {shown === "library" && (
          <p className="border-t border-border px-4 py-2 text-[11px] text-muted">
            Library songs are downloaded and analysed (tempo, key, beat grid) when you load them; analysis is remembered for this session. Songs split into 4 stems get Vocals/Drums/Bass/Melody kills, older ones Vocals/Beat.
          </p>
        )}
      </div>
    </div>
  );
}
