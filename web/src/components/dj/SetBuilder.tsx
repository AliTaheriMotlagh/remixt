"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Copy, ListMusic, Loader2, Play, Save, Shuffle, Trash2, X } from "lucide-react";
import { buildSet, SET_SHAPES, setSeconds, setText, type SetShape, type SetStep } from "@/lib/client/dj/djPlaylist";
import type { BrowserEntry } from "@/lib/client/dj/djLibrary";
import { DEMO_ENTRIES, libraryEntries } from "@/lib/client/dj/djLibraryTracks";
import { setClock } from "@/lib/client/dj/djSet";
import { camelotCode } from "@/lib/client/musicKey";

// Playlists for a DJ: build a set from the library (key-to-key, a tempo
// shape, a length), reorder or reshuffle it, save it on this device, and
// hand it to the Auto DJ to play in order. Saved sets keep their songs' ids;
// a song gone from the library is skipped when the set is opened.

const STORE = "remixt-dj-sets";
type Saved = { name: string; shape: SetShape; ids: string[]; at: number };

function readSaved(): Saved[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? "[]");
    return Array.isArray(v) ? v.slice(0, 30) : [];
  } catch {
    return [];
  }
}
function writeSaved(list: Saved[]) {
  try {
    localStorage.setItem(STORE, JSON.stringify(list.slice(0, 30)));
  } catch {
    // Private mode or full: the set just isn't kept.
  }
}

export default function SetBuilder({ playing, onPlay, onClose }: { playing: boolean; onPlay: (entries: BrowserEntry[], name: string) => void; onClose: () => void }) {
  const [entries, setEntries] = useState<BrowserEntry[] | null>(null);
  const [shape, setShape] = useState<SetShape>("journey");
  const [minutes, setMinutes] = useState(60);
  const [steps, setSteps] = useState<SetStep[]>([]);
  const [name, setName] = useState("My set");
  const [saved, setSaved] = useState<Saved[]>([]);
  const [seed, setSeed] = useState(1);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the device's saved sets, read once on the client
    setSaved(readSaved());
    void libraryEntries()
      .then((r) => setEntries(r.entries.length >= 2 ? r.entries : DEMO_ENTRIES))
      .catch(() => setEntries(DEMO_ENTRIES));
  }, []);

  const build = (s = seed) => {
    if (!entries) return;
    const made = buildSet(entries, { shape, minutes, seed: s });
    setSteps(made);
    setName(`${SET_SHAPES.find((x) => x.id === shape)!.label} · ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}`);
    setNote(made.length < 2 ? "The library needs at least two songs for a set." : null);
  };

  const move = (i: number, by: -1 | 1) =>
    setSteps((list) => {
      const j = i + by;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const save = () => {
    const list = [{ name: name.trim() || "My set", shape, ids: steps.map((s) => s.entry.id), at: Date.now() }, ...saved.filter((s) => s.name !== name.trim())];
    setSaved(list);
    writeSaved(list);
    setNote("Saved on this device.");
  };
  const open = (s: Saved) => {
    if (!entries) return;
    const byId = new Map(entries.map((e) => [e.id, e]));
    const list = s.ids.map((id) => byId.get(id)).filter((e): e is BrowserEntry => !!e);
    setShape(s.shape);
    setName(s.name);
    setSteps(list.map((entry, i) => ({ entry, why: i ? "" : "", tempoStep: 0 })));
    setNote(list.length < s.ids.length ? `${s.ids.length - list.length} song(s) aren't in the library any more — left out.` : null);
  };
  const remove = (s: Saved) => {
    const list = saved.filter((x) => x !== s);
    setSaved(list);
    writeSaved(list);
  };

  return (
    <section aria-label="Build a set" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3">
      <div className="flex items-center gap-2">
        <ListMusic className="h-5 w-5 text-brand-strong" />
        <h2 className="min-w-0 flex-1 text-sm font-bold">Build a set</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="text-xs text-muted">Songs that mix into each other — keys next to each other on the Camelot wheel, tempos within reach — in the shape you choose.</p>
      <div role="radiogroup" aria-label="The set's shape" className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {SET_SHAPES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={shape === s.id}
            onClick={() => setShape(s.id)}
            className={`flex min-h-12 flex-col items-start justify-center rounded-xl border px-2.5 py-1.5 text-left ${shape === s.id ? "border-brand bg-brand/15" : "border-border hover:bg-surface-hover"}`}
          >
            <span className="text-xs font-bold">{s.label}</span>
            <span className="text-[10.5px] text-muted">{s.hint}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-muted">
          Length
          <select className="input !py-1.5 text-xs" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {[20, 30, 45, 60, 90, 120].map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => build()} disabled={!entries} className="flex min-h-10 items-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-bold text-white hover:bg-brand-strong disabled:opacity-50">
          {entries ? <ListMusic className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />} Build it
        </button>
        {steps.length > 0 && (
          <button
            type="button"
            onClick={() => {
              const s = seed + 1;
              setSeed(s);
              build(s);
            }}
            className="flex min-h-10 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-surface-hover"
          >
            <Shuffle className="h-4 w-4" /> Another
          </button>
        )}
      </div>

      {steps.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input className="input min-w-0 flex-1 !py-1.5 text-sm" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label="The set's name" />
            <span className="text-xs text-muted">
              {steps.length} songs · {setClock(setSeconds(steps))}
            </span>
          </div>
          <ol className="flex max-h-80 flex-col gap-1 overflow-y-auto overscroll-contain">
            {steps.map((s, i) => (
              <li key={s.entry.id} className="flex items-center gap-2 rounded-lg bg-background/40 px-2 py-1.5 text-xs">
                <span className="w-5 shrink-0 text-right font-bold tabular-nums text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span dir="auto" className="block truncate font-semibold">
                    {s.entry.title}
                  </span>
                  <span className="block truncate text-[11px] text-muted">
                    {s.entry.bpm ? `${Math.round(s.entry.bpm)} BPM` : "BPM ?"}
                    {s.entry.key ? ` · ${camelotCode(s.entry.key)}` : ""}
                    {s.tempoStep ? ` · ${s.tempoStep > 0 ? "+" : ""}${(s.tempoStep * 100).toFixed(1)}%` : ""}
                    {s.why ? ` · ${s.why}` : ""}
                  </span>
                </span>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Earlier" className="rounded p-1.5 text-muted hover:text-foreground disabled:opacity-30">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === steps.length - 1} aria-label="Later" className="rounded p-1.5 text-muted hover:text-foreground disabled:opacity-30">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onPlay(steps.map((s) => s.entry), name)}
              className="flex min-h-11 items-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-bold text-white hover:bg-brand-strong"
            >
              <Play className="h-4 w-4 fill-current" /> {playing ? "Play this set instead" : "Play with Auto DJ"}
            </button>
            <button type="button" onClick={save} className="flex min-h-11 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-surface-hover">
              <Save className="h-4 w-4" /> Save
            </button>
            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(setText(name, steps)).then(() => setNote("Copied the track list."))}
              className="flex min-h-11 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-surface-hover"
            >
              <Copy className="h-4 w-4" /> Copy list
            </button>
          </div>
        </>
      )}
      {note && <p className="text-xs text-muted">{note}</p>}

      {saved.length > 0 && (
        <div className="border-t border-border pt-2">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Saved sets</p>
          <ul className="flex flex-col gap-1">
            {saved.map((s) => (
              <li key={`${s.name}-${s.at}`} className="flex items-center gap-2 text-xs">
                <button type="button" onClick={() => open(s)} className="min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-left font-semibold hover:bg-surface-hover">
                  {s.name} <span className="font-normal text-muted">· {s.ids.length} songs</span>
                </button>
                <button type="button" onClick={() => remove(s)} aria-label={`Delete ${s.name}`} className="rounded p-1.5 text-muted hover:text-danger">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
