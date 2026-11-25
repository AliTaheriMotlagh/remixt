"use client";

// /dj/crate — plan a set for an event. Left: every song with its numbers
// (tempo, Camelot key, energy, length), searchable and filterable, plus songs
// Remixt doesn't have yet, typed in by hand. Right: the set, drawn as a
// tempo line coloured by key, each blend rated, and for the song you pick,
// what goes well after it, before it, or between it and the next. Saved on
// the device, in the same place the decks' "Build a set" reads.
// The rules are in lib/client/dj/djCrate.ts.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown, ArrowLeft, ArrowUp, Copy, Download, GripVertical, Info, ListMusic, Loader2, Play, Plus, Save, Search, Shuffle, Sparkles, Trash2, Waves, X,
} from "lucide-react";
import SongArt from "@/components/SongArt";
import { camelotCode, keyLabel, ALL_KEYS, keyId, parseKeyId } from "@/lib/client/musicKey";
import { DEMO_ENTRIES, libraryEntries, measureLibrarySong } from "@/lib/client/dj/djLibraryTracks";
import { isLibraryId, libraryTrackKey } from "@/lib/client/dj/djLibrary";
import {
  buildEventSet, clock, energyOf, playedTempos, EVENTS, eventFit, friendlyKeys, fromSaved, keyHue, outsideSong, setCsv, SETS_STORE, suggest, summarize, toSaved, transition,
  type CrateSong, type DjEvent, type SavedCrate, type Transition,
} from "@/lib/client/dj/djCrate";

type Sort = "fit" | "title" | "bpm" | "key" | "energy";
type Dir = "next" | "prev" | "between";

const LEVEL: Record<Transition["level"], { dot: string; text: string; label: string }> = {
  smooth: { dot: "bg-success", text: "text-success", label: "Smooth" },
  ok: { dot: "bg-drums", text: "text-drums", label: "OK" },
  rough: { dot: "bg-danger", text: "text-danger", label: "Rough" },
  unknown: { dot: "bg-muted", text: "text-muted", label: "?" },
};

function readSaved(): SavedCrate[] {
  try {
    const v = JSON.parse(localStorage.getItem(SETS_STORE) ?? "[]");
    return Array.isArray(v) ? v.slice(0, 30) : [];
  } catch {
    return [];
  }
}
function writeSaved(list: SavedCrate[]) {
  try {
    localStorage.setItem(SETS_STORE, JSON.stringify(list.slice(0, 30)));
  } catch {
    // Private mode or full: not kept.
  }
}

function KeyBadge({ song }: { song: Pick<CrateSong, "key"> }) {
  const hue = keyHue(song.key);
  // Unknown keys say so on wider screens; on a phone the title needs the room.
  if (!song.key || hue === null) return <span className="hidden rounded-md bg-surface-raised px-1.5 py-0.5 text-[11px] text-muted sm:inline">key ?</span>;
  return (
    <span
      className="rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white"
      style={{ background: `hsl(${hue} 65% 42%)` }}
      title={keyLabel(song.key)}
    >
      {camelotCode(song.key)}
    </span>
  );
}

function EnergyBar({ song }: { song: CrateSong }) {
  const e = energyOf(song);
  return (
    <span className="flex h-1.5 w-12 overflow-hidden rounded-full bg-surface-raised" title={e ? `Energy about ${e}/10 (a guess from tempo and genre)` : "Energy not known"} aria-hidden>
      {e && <span className="rounded-full bg-gradient-to-r from-beat via-drums to-vocals" style={{ width: `${e * 10}%` }} />}
    </span>
  );
}

export default function DjCrate() {
  const [songs, setSongs] = useState<CrateSong[] | null>(null);
  const [outside, setOutside] = useState<CrateSong[]>([]);
  const [set, setSet] = useState<CrateSong[]>([]);
  const [event, setEvent] = useState<DjEvent | null>(null);
  const [minutes, setMinutes] = useState(60);
  const [seed, setSeed] = useState(1);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("fit");
  const [bpm, setBpm] = useState<[string, string]>(["", ""]);
  const [onlyFits, setOnlyFits] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [dir, setDir] = useState<Dir>("next");
  const [detail, setDetail] = useState<CrateSong | null>(null);
  const [tab, setTab] = useState<"browse" | "set">("browse");
  const [name, setName] = useState("My set");
  const [saved, setSaved] = useState<SavedCrate[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const [demo, setDemo] = useState(false);
  const router = useRouter();
  /** Measuring the keys nobody has measured yet: how far along, and whether to stop. */
  const [measuring, setMeasuring] = useState<{ done: number; total: number; title: string } | null>(null);
  const stopMeasuring = useRef(false);
  useEffect(
    () => () => {
      stopMeasuring.current = true;
    },
    []
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the device's saved sets, read once on the client
    setSaved(readSaved());
    libraryEntries()
      .then(({ songs: lib, entries }) => {
        const tags = new Map(lib.map((s) => [`lib:${s.trackId}`, s.tags]));
        const list: CrateSong[] = entries.map((e) => ({ ...e, tags: tags.get(e.id) ?? [] }));
        if (list.length >= 2) setSongs(list);
        else {
          setDemo(true);
          setSongs(DEMO_ENTRIES);
        }
      })
      .catch(() => {
        setDemo(true);
        setSongs(DEMO_ENTRIES);
      });
  }, []);

  const all = useMemo(() => [...(songs ?? []), ...outside], [songs, outside]);
  const inSet = useMemo(() => new Set(set.map((s) => s.id)), [set]);
  const summary = useMemo(() => summarize(set), [set]);
  /** What a browser row is rated against: the picked song in the set, else its last one. */
  const anchor = selected !== null ? set[selected] : set.at(-1) ?? null;

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const [lo, hi] = bpm.map((x) => Number(x) || 0);
    const rows = all.filter((s) => {
      const text = `${s.title} ${s.artist} ${s.genre} ${(s.tags ?? []).join(" ")} ${s.key ? camelotCode(s.key) : ""}`.toLowerCase();
      if (words.some((w) => !text.includes(w))) return false;
      if (lo && (!s.bpm || s.bpm < lo)) return false;
      if (hi && (!s.bpm || s.bpm > hi)) return false;
      if (onlyFits && anchor && transition(anchor, s).level !== "smooth") return false;
      return true;
    });
    const fit = (s: CrateSong) => (anchor ? (transition(anchor, s).score ?? 30) : 0) + (event ? eventFit(s, event) * 40 : 0);
    const by: Record<Sort, (a: CrateSong, b: CrateSong) => number> = {
      fit: (a, b) => fit(b) - fit(a) || a.title.localeCompare(b.title),
      title: (a, b) => a.title.localeCompare(b.title),
      bpm: (a, b) => (a.bpm ?? 999) - (b.bpm ?? 999),
      key: (a, b) => (a.key ? camelotCode(a.key) : "~").localeCompare(b.key ? camelotCode(b.key) : "~", undefined, { numeric: true }),
      energy: (a, b) => (energyOf(b) ?? 0) - (energyOf(a) ?? 0),
    };
    return rows.sort(by[sort]);
  }, [all, q, bpm, onlyFits, anchor, sort, event]);

  const suggestions = useMemo(() => {
    if (selected === null || !set[selected]) return [];
    const d: Dir = dir === "between" && selected >= set.length - 1 ? "next" : dir;
    return suggest(all, set, selected, d, { event, count: 6 });
  }, [all, set, selected, dir, event]);

  // ——— changing the set ———
  const add = (s: CrateSong, at?: number) => {
    if (inSet.has(s.id)) return;
    setSet((list) => {
      const i = at ?? (selected !== null ? selected + 1 : list.length);
      const next = [...list];
      next.splice(i, 0, s);
      return next;
    });
    if (selected !== null && at === undefined) setSelected(selected + 1);
  };
  const remove = (i: number) => {
    setSet((list) => list.filter((_, j) => j !== i));
    setSelected(null);
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= set.length || from === to) return;
    setSet((list) => {
      const next = [...list];
      const [x] = next.splice(from, 1);
      next.splice(to, 0, x);
      return next;
    });
    setSelected(to);
  };
  const buildFor = (e: DjEvent, s = seed) => {
    if (!all.length) return;
    const made = buildEventSet(all, e, { minutes, seed: s });
    setSet(made);
    setSelected(null);
    setName(`${e.label} · ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}`);
    setNote(made.length < 2 ? "There aren't enough songs for this yet — add some." : `${made.length} songs chosen for a ${e.label.toLowerCase()}. Change anything you like.`);
    setTab("set");
  };
  const placeSuggestion = (s: CrateSong) => {
    if (selected === null) return;
    add(s, dir === "prev" ? selected : selected + 1);
    if (dir === "prev") setSelected(selected + 1);
  };
  const setNoteFor = (id: string, text: string) => {
    setSet((list) => list.map((s) => (s.id === id ? { ...s, note: text || undefined } : s)));
    setDetail((d) => (d && d.id === id ? { ...d, note: text || undefined } : d));
  };

  // ——— measuring keys ———
  /** Library songs with no key yet: measured here (only the beat is downloaded), one after another. */
  const unmeasured = useMemo(() => (songs ?? []).filter((s) => !s.key && isLibraryId(s.id)), [songs]);
  const measureKeys = async (list: CrateSong[] = unmeasured) => {
    if (measuring || !list.length) return;
    stopMeasuring.current = false;
    let found = 0;
    for (let i = 0; i < list.length && !stopMeasuring.current; i++) {
      const song = list[i];
      setMeasuring({ done: i, total: list.length, title: song.title });
      const m = await measureLibrarySong(libraryTrackKey(song.id)).catch(() => null);
      if (!m || stopMeasuring.current) continue;
      found++;
      const update = (s: CrateSong) => (s.id === song.id ? { ...s, key: m.key, bpm: m.bpm, duration: s.duration ?? m.duration, analyzed: true } : s);
      setSongs((all) => all && all.map(update));
      setSet((list) => list.map(update));
      setDetail((d) => d && update(d));
    }
    setMeasuring(null);
    if (!stopMeasuring.current) {
      setNote(found === list.length ? `Measured ${found} key${found === 1 ? "" : "s"}.` : `Measured ${found} of ${list.length} — the rest couldn't be downloaded. Try again later.`);
    }
  };

  // ——— keeping it ———
  const save = () => {
    const entry = toSaved(name, set, event, Date.now());
    const list = [entry, ...saved.filter((s) => s.name !== entry.name)];
    setSaved(list);
    writeSaved(list);
    setNote(`Saved on this device as “${entry.name}”. On the decks: Build a set → Saved sets.`);
    return entry;
  };
  /** To the decks, with the Auto DJ playing this set from its first song. */
  const playOnDecks = () => {
    const entry = save();
    router.push(`/dj?set=${entry.at}`);
  };
  const open = (s: SavedCrate) => {
    const lib = songs ?? [];
    const back = fromSaved(s, lib);
    setOutside((o) => [...o.filter((x) => !(s.outside ?? []).some((y) => y.id === x.id)), ...(s.outside ?? [])]);
    setSet(back.set);
    setName(s.name);
    setEvent(EVENTS.find((e) => e.id === s.event) ?? null);
    setSelected(null);
    setNote(back.missing ? `${back.missing} song(s) aren't in the library any more — left out.` : null);
    setTab("set");
  };
  const download = () => {
    const blob = new Blob([setCsv(set)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name.replace(/[^\w\- ]+/g, "").trim() || "set"}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const copy = () => {
    const text = [name, ...set.map((s, i) => `${i + 1}. ${s.title}${s.artist ? ` — ${s.artist}` : ""}${s.bpm ? ` (${Math.round(s.bpm)} BPM${s.key ? `, ${camelotCode(s.key)}` : ""})` : ""}${s.outside ? " [not on Remixt]" : ""}`)].join("\n");
    void navigator.clipboard?.writeText(text).then(() => setNote("Copied the track list."));
  };

  // In the server HTML too (before the songs load), so search engines see the page's heading.
  const heading = (
    <>
      <Link href="/dj" className="flex w-fit items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> DJ decks
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Plan a set</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Every song with its tempo, key and energy. Pick the event, get a starting set that flows key to key, then shape it: see how each blend will
          sound, ask what goes next, and add songs that aren&apos;t on Remixt yet.
        </p>
        {demo && <p className="mt-2 text-xs text-drums">Your library is empty, so these are the demo songs. Split songs to plan with your own.</p>}
      </div>
    </>
  );

  if (!songs) {
    return (
      <div className="flex flex-col gap-4">
        <header className="flex flex-col gap-3">{heading}</header>
        <div className="flex h-64 items-center justify-center gap-2 text-muted">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading every song…
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        {heading}
        {/* The event: a starting set in its shape. */}
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1" role="radiogroup" aria-label="The event">
          {EVENTS.map((e) => (
            <button
              key={e.id}
              type="button"
              role="radio"
              aria-checked={event?.id === e.id}
              onClick={() => setEvent(event?.id === e.id ? null : e)}
              className={`flex min-w-36 shrink-0 flex-col items-start rounded-2xl border px-3 py-2 text-start ${event?.id === e.id ? "border-brand bg-brand/15" : "border-border bg-surface hover:bg-surface-hover"}`}
            >
              <span className="text-sm font-bold">{e.label}</span>
              <span className="text-[11px] text-muted">{e.hint}</span>
              <span className="mt-0.5 text-[10px] tabular-nums text-muted">{e.bpm[0]}–{e.bpm[1]} BPM</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-muted">
            Length
            <select className="input !py-1.5 text-sm" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              {[30, 45, 60, 90, 120, 180, 240].map((m) => (
                <option key={m} value={m}>
                  {m >= 60 ? `${m / 60} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!event}
            onClick={() => event && buildFor(event)}
            className="flex min-h-10 items-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-bold text-white hover:bg-brand-strong disabled:opacity-40"
          >
            <Sparkles className="h-4 w-4" /> {event ? `Build a ${event.label.toLowerCase()} set` : "Pick an event to build a set"}
          </button>
          {event && set.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setSeed(seed + 1);
                buildFor(event, seed + 1);
              }}
              className="flex min-h-10 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-surface-hover"
            >
              <Shuffle className="h-4 w-4" /> Another
            </button>
          )}
        </div>
      </header>

      {/* Phones: one side at a time. */}
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-surface p-1 lg:hidden">
        {(["browse", "set"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-lg py-2 text-sm font-semibold ${tab === t ? "bg-surface-raised" : "text-muted"}`}>
            {t === "browse" ? `Songs (${all.length})` : `Your set (${set.length})`}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* ——— the browser ——— */}
        <section aria-label="Songs" className={`${tab === "browse" ? "flex" : "hidden"} min-w-0 flex-col gap-3 rounded-2xl border border-border bg-surface p-3 lg:flex`}>
          <div className="flex items-center gap-2">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input className="input w-full !ps-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title, artist, genre, 8A…" aria-label="Search songs" />
            </label>
            <button type="button" onClick={() => setAdding((a) => !a)} className="flex min-h-10 shrink-0 items-center gap-1 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-surface-hover">
              <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Not on Remixt</span><span className="sm:hidden">Other</span>
            </button>
          </div>
          {adding && <AddOutside onAdd={(s) => (setOutside((o) => [...o, s]), add(s), setAdding(false), setNote(`Added “${s.title}” (not on Remixt).`))} />}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1 text-muted">
              BPM
              <input className="input w-16 !py-1 text-xs" inputMode="numeric" placeholder="from" value={bpm[0]} onChange={(e) => setBpm([e.target.value, bpm[1]])} />
              –
              <input className="input w-16 !py-1 text-xs" inputMode="numeric" placeholder="to" value={bpm[1]} onChange={(e) => setBpm([bpm[0], e.target.value])} />
            </label>
            <label className="flex items-center gap-1 text-muted">
              Sort
              <select className="input !py-1 text-xs" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="fit">Best fit</option>
                <option value="title">Title</option>
                <option value="bpm">Tempo</option>
                <option value="key">Key</option>
                <option value="energy">Energy</option>
              </select>
            </label>
            {anchor && (
              <label className="flex items-center gap-1.5">
                <input type="checkbox" className="accent-[var(--brand)]" checked={onlyFits} onChange={(e) => setOnlyFits(e.target.checked)} />
                Only smooth after “<span className="max-w-28 truncate">{anchor.title}</span>”
              </label>
            )}
          </div>
          {measuring ? (
            <div className="flex items-center gap-2 rounded-xl bg-brand/10 px-3 py-2 text-xs" role="status">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-strong" />
              <span className="min-w-0 flex-1 truncate">
                Measuring keys: {measuring.done + 1} of {measuring.total} · <span dir="auto">{measuring.title}</span>
              </span>
              <button type="button" onClick={() => (stopMeasuring.current = true)} className="shrink-0 font-semibold text-muted hover:text-foreground">
                Stop
              </button>
            </div>
          ) : (
            unmeasured.length > 0 && (
              <button
                type="button"
                onClick={() => void measureKeys()}
                className="flex items-center gap-2 rounded-xl border border-dashed border-brand/40 px-3 py-2 text-start text-xs hover:bg-brand/5"
              >
                <Waves className="h-4 w-4 shrink-0 text-brand-strong" />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">
                    {unmeasured.length} song{unmeasured.length === 1 ? " has" : "s have"} no key yet — measure {unmeasured.length === 1 ? "it" : "them"}
                  </span>
                  <span className="block text-muted">Listens to each song&apos;s beat in your browser (one download per song). Once measured, everyone sees the key.</span>
                </span>
              </button>
            )
          )}
          <p className="text-[11px] text-muted">
            {shown.length} song{shown.length === 1 ? "" : "s"}
            {anchor ? ` · the dot says how each would follow “${anchor.title}”` : " · add a song to the set to see how others follow it"}
          </p>
          <ul className="flex max-h-[34rem] flex-col gap-1 overflow-y-auto overscroll-contain">
            {shown.map((s) => {
              const t = anchor ? transition(anchor, s) : null;
              const used = inSet.has(s.id);
              return (
                <li key={s.id} className={`flex items-center gap-2 rounded-xl px-2 py-1.5 ${used ? "opacity-50" : "hover:bg-surface-hover"}`}>
                  {s.outside ? (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-border text-[10px] text-muted">new</span>
                  ) : (
                    <SongArt stemId={s.coverStemId} title={s.title} artist={s.artist} className="h-10 w-10 shrink-0 rounded-lg" />
                  )}
                  <button type="button" onClick={() => setDetail(s)} className="min-w-0 flex-1 text-start">
                    <span dir="auto" className="block truncate text-sm font-semibold">
                      {s.title}
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-muted">
                      <span className="truncate" dir="auto">
                        {s.artist || s.genre}
                      </span>
                      {s.outside && <span className="shrink-0 rounded bg-drums/15 px-1 text-drums">not on Remixt</span>}
                    </span>
                  </button>
                  <span className="hidden w-12 shrink-0 text-end text-xs tabular-nums text-muted sm:block">{s.bpm ? Math.round(s.bpm) : "–"}</span>
                  <KeyBadge song={s} />
                  <span className="hidden sm:block">
                    <EnergyBar song={s} />
                  </span>
                  {t && <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${LEVEL[t.level].dot}`} title={`${LEVEL[t.level].label}: ${t.keyText}`} />}
                  <button
                    type="button"
                    disabled={used}
                    onClick={() => add(s)}
                    aria-label={`Add ${s.title} to the set`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand-strong hover:bg-brand hover:text-white disabled:opacity-30"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ——— the set ——— */}
        <section aria-label="Your set" className={`${tab === "set" ? "flex" : "hidden"} min-w-0 flex-col gap-3 rounded-2xl border border-border bg-surface p-3 lg:flex`}>
          <div className="flex flex-wrap items-center gap-2">
            <ListMusic className="h-5 w-5 text-brand-strong" />
            <input className="input min-w-0 flex-1 !py-1.5 text-sm font-semibold" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label="The set's name" />
          </div>
          {set.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
              Pick an event above and press Build — or add songs one by one with <Plus className="inline h-3.5 w-3.5" />.
            </p>
          ) : (
            <>
              <dl className="grid grid-cols-4 gap-2 text-center text-xs">
                <Stat label="Songs" value={String(summary.songs)} />
                <Stat label="Length" value={`${summary.guessedLength ? "≈" : ""}${clock(summary.seconds)}`} />
                <Stat label="Flow" value={summary.flow === null ? "–" : `${summary.flow}%`} tone={summary.flow === null ? "" : summary.flow >= 75 ? "text-success" : summary.flow >= 50 ? "text-drums" : "text-danger"} />
                <Stat label="Rough blends" value={String(summary.rough)} tone={summary.rough ? "text-danger" : "text-success"} />
              </dl>
              <TempoLine set={set} selected={selected} onSelect={(i) => setSelected(selected === i ? null : i)} />
              <ol className="flex max-h-[30rem] flex-col overflow-y-auto overscroll-contain">
                {set.map((s, i) => {
                  const t = i > 0 ? summary.transitions[i - 1] : null;
                  const picked = selected === i;
                  return (
                    <li
                      key={s.id}
                      draggable
                      onDragStart={() => setDrag(i)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (drag !== null) move(drag, i);
                        setDrag(null);
                      }}
                    >
                      {t && (
                        <p className={`flex items-center gap-1.5 py-0.5 ps-9 text-[11px] ${LEVEL[t.level].text}`} title={t.tip}>
                          <span className={`h-1.5 w-1.5 rounded-full ${LEVEL[t.level].dot}`} />
                          {LEVEL[t.level].label} · {t.keyText}
                          {t.tempo !== null && ` · ${t.tempo >= 0 ? "+" : ""}${(t.tempo * 100).toFixed(1)}%`}
                        </p>
                      )}
                      <div className={`flex items-center gap-1.5 rounded-xl border px-1.5 py-1.5 ${picked ? "border-brand bg-brand/10" : "border-transparent bg-background/40"}`}>
                        <GripVertical className="hidden h-4 w-4 shrink-0 cursor-grab text-muted sm:block" aria-hidden />
                        <span className="w-5 shrink-0 text-end text-xs font-bold tabular-nums text-muted">{i + 1}</span>
                        <button type="button" onClick={() => setSelected(picked ? null : i)} className="min-w-0 flex-1 text-start" aria-pressed={picked}>
                          <span dir="auto" className="block truncate text-sm font-semibold">
                            {s.title}
                            {s.outside && <span className="ms-1.5 rounded bg-drums/15 px-1 text-[10px] font-medium text-drums">not on Remixt</span>}
                          </span>
                          <span className="block truncate text-[11px] text-muted">
                            {s.bpm ? `${Math.round(s.bpm)} BPM` : "BPM ?"} · {s.duration ? clock(s.duration) : "length ?"}
                            {s.note ? ` · ${s.note}` : ""}
                          </span>
                        </button>
                        <KeyBadge song={s} />
                        <button type="button" onClick={() => setDetail(s)} aria-label={`About ${s.title}`} className="rounded p-1.5 text-muted hover:text-foreground">
                          <Info className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Earlier" className="rounded p-1.5 text-muted hover:text-foreground disabled:opacity-30">
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => move(i, i + 1)} disabled={i === set.length - 1} aria-label="Later" className="rounded p-1.5 text-muted hover:text-foreground disabled:opacity-30">
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => remove(i)} aria-label={`Take ${s.title} out`} className="rounded p-1.5 text-muted hover:text-danger">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </>
          )}

          {/* What goes well around the picked song. */}
          {selected !== null && set[selected] && (
            <div className="rounded-2xl border border-brand/30 bg-brand/5 p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-brand-strong" /> Ideas around “<span className="truncate">{set[selected].title}</span>”
              </p>
              <div className="mt-2 flex gap-1" role="tablist">
                {(
                  [
                    ["next", "Goes well after"],
                    ["prev", "Goes well before"],
                    ...(selected < set.length - 1 ? [["between", "Fits in between"]] : []),
                  ] as [Dir, string][]
                ).map(([d, label]) => (
                  <button
                    key={d}
                    type="button"
                    role="tab"
                    aria-selected={dir === d}
                    onClick={() => setDir(d)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${dir === d ? "bg-brand text-white" : "border border-border hover:bg-surface-hover"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <ul className="mt-2 flex flex-col gap-1">
                {suggestions.length === 0 && <li className="text-xs text-muted">Every song is already in the set.</li>}
                {suggestions.map((sg) => (
                  <li key={sg.song.id} className="flex items-center gap-2 rounded-lg bg-surface/80 px-2 py-1.5">
                    <span className={`w-9 shrink-0 text-center text-xs font-bold tabular-nums ${sg.score >= 75 ? "text-success" : sg.score >= 50 ? "text-drums" : "text-danger"}`}>{sg.score}</span>
                    <button type="button" onClick={() => setDetail(sg.song)} className="min-w-0 flex-1 text-start">
                      <span dir="auto" className="block truncate text-sm font-semibold">
                        {sg.song.title}
                      </span>
                      <span className="block truncate text-[11px] text-muted">{sg.why}</span>
                    </button>
                    <KeyBadge song={sg.song} />
                    <button
                      type="button"
                      onClick={() => placeSuggestion(sg.song)}
                      aria-label={`Put ${sg.song.title} ${dir === "prev" ? "before" : "after"}`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-white"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {set.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={save} className="flex min-h-11 items-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-bold text-white hover:bg-brand-strong">
                <Save className="h-4 w-4" /> Save
              </button>
              <button
                type="button"
                onClick={playOnDecks}
                disabled={set.every((s) => s.outside)}
                className="flex min-h-11 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-surface-hover disabled:opacity-40"
              >
                <Play className="h-4 w-4" /> Play on the decks
              </button>
              <button type="button" onClick={copy} className="flex min-h-11 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-surface-hover">
                <Copy className="h-4 w-4" /> Copy
              </button>
              <button type="button" onClick={download} className="flex min-h-11 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-surface-hover">
                <Download className="h-4 w-4" /> CSV
              </button>
              <button type="button" onClick={() => (setSet([]), setSelected(null))} className="flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-muted hover:text-danger">
                <Trash2 className="h-4 w-4" /> Clear
              </button>
            </div>
          )}
          {summary.outside > 0 && (
            <p className="text-xs text-muted">
              {summary.outside} song{summary.outside === 1 ? " isn't" : "s aren't"} on Remixt: the decks skip {summary.outside === 1 ? "it" : "them"}.{" "}
              <Link href="/upload" className="font-semibold text-brand-strong hover:underline">
                Upload to play them here
              </Link>
              .
            </p>
          )}
          {note && <p className="text-xs text-muted">{note}</p>}

          {saved.length > 0 && (
            <div className="border-t border-border pt-2">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Saved sets</p>
              <ul className="flex flex-col gap-1">
                {saved.map((s) => (
                  <li key={`${s.name}-${s.at}`} className="flex items-center gap-2 text-xs">
                    <button type="button" onClick={() => open(s)} className="min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-start font-semibold hover:bg-surface-hover">
                      {s.name} <span className="font-normal text-muted">· {s.ids.length} songs{s.event ? ` · ${EVENTS.find((e) => e.id === s.event)?.label ?? ""}` : ""}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const list = saved.filter((x) => x !== s);
                        setSaved(list);
                        writeSaved(list);
                      }}
                      aria-label={`Delete ${s.name}`}
                      className="rounded p-1.5 text-muted hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      {detail && (
        <SongSheet
          song={set.find((s) => s.id === detail.id) ?? detail}
          songs={all}
          inSet={inSet.has(detail.id)}
          event={event}
          onClose={() => setDetail(null)}
          onAdd={() => add(detail)}
          onNote={(t) => setNoteFor(detail.id, t)}
          onOpen={(s) => setDetail(s)}
          onMeasure={!detail.key && isLibraryId(detail.id) && !measuring ? () => void measureKeys([detail]) : undefined}
          measuring={!!measuring}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-background/40 px-1 py-2">
      <dt className="text-[10px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className={`text-base font-bold tabular-nums ${tone}`}>{value}</dd>
    </div>
  );
}

/** The set as a line of tempos: each dot a song in its key's colour, each segment its blend. Tap a dot to pick it. */
function TempoLine({ set, selected, onSelect }: { set: CrateSong[]; selected: number | null; onSelect: (i: number) => void }) {
  // Half/double time drawn at the set's feel, so one double-time song doesn't flatten the rest.
  const played = playedTempos(set);
  const bpms = played.filter((b): b is number => !!b);
  if (bpms.length < 2) return null;
  const lo = Math.min(...bpms) - 3;
  const hi = Math.max(...bpms) + 3;
  const W = Math.max(1, set.length - 1) * 40;
  const H = 70;
  const x = (i: number) => (set.length === 1 ? W / 2 : (i / (set.length - 1)) * W);
  const y = (b: number | null) => (b ? H - 8 - ((b - lo) / (hi - lo)) * (H - 16) : H - 4);
  const color = { smooth: "var(--success)", ok: "var(--drums)", rough: "var(--danger)", unknown: "var(--muted)" } as const;
  return (
    <figure className="rounded-xl bg-background/40 p-2">
      <svg viewBox={`-8 0 ${W + 16} ${H}`} className="h-20 w-full" preserveAspectRatio="none" role="img" aria-label={`Tempo from ${Math.round(bpms[0])} to ${Math.round(bpms.at(-1)!)} BPM`}>
        {set.slice(1).map((s, i) => {
          const t = transition(set[i], s);
          return <line key={s.id} x1={x(i)} y1={y(played[i])} x2={x(i + 1)} y2={y(played[i + 1])} stroke={color[t.level]} strokeWidth={2.5} vectorEffect="non-scaling-stroke" strokeLinecap="round" />;
        })}
      </svg>
      <div className="relative -mt-20 h-20" aria-hidden={false}>
        {set.map((s, i) => {
          const hue = keyHue(s.key);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(i)}
              title={`${i + 1}. ${s.title} — ${s.bpm ? Math.round(s.bpm) : "?"} BPM${s.key ? `, ${camelotCode(s.key)}` : ""}`}
              aria-label={`Pick ${s.title}`}
              className={`absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${selected === i ? "scale-150 border-white" : "border-surface"}`}
              style={{
                left: `calc(${((x(i) + 8) / (W + 16)) * 100}%)`,
                top: `${(y(played[i]) / H) * 100}%`,
                background: hue === null ? "var(--muted)" : `hsl(${hue} 65% 50%)`,
              }}
            />
          );
        })}
      </div>
      <figcaption className="mt-1 flex justify-between text-[10px] tabular-nums text-muted">
        <span>{Math.round(lo + 3)} BPM</span>
        <span>tempo through the set · dot colour = key</span>
        <span>{Math.round(hi - 3)} BPM</span>
      </figcaption>
    </figure>
  );
}

/** A song typed in by hand: what's known about it now. */
function AddOutside({ onAdd }: { onAdd: (s: CrateSong) => void }) {
  const [f, setF] = useState({ title: "", artist: "", bpm: "", key: "", minutes: "", note: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="grid gap-2 rounded-xl border border-dashed border-brand/40 bg-brand/5 p-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (!f.title.trim()) return;
        onAdd(
          outsideSong(
            { title: f.title, artist: f.artist, bpm: Number(f.bpm) || null, key: parseKeyId(f.key), minutes: Number(f.minutes.replace(":", ".")) || null, note: f.note },
            typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now())
          )
        );
      }}
    >
      <p className="text-xs text-muted">A song you want in the set that isn&apos;t on Remixt (a request, the first dance). Add what you know — the rest can wait.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <input className="input" placeholder="Title *" value={f.title} onChange={set("title")} required dir="auto" />
        <input className="input" placeholder="Artist" value={f.artist} onChange={set("artist")} dir="auto" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input className="input" placeholder="BPM" inputMode="decimal" value={f.bpm} onChange={set("bpm")} />
        <select className="input" value={f.key} onChange={set("key")} aria-label="Key">
          <option value="">Key ?</option>
          {ALL_KEYS.map((k) => (
            <option key={keyId(k)} value={keyId(k)}>
              {camelotCode(k)} · {keyLabel(k)}
            </option>
          ))}
        </select>
        <input className="input" placeholder="Minutes" inputMode="decimal" value={f.minutes} onChange={set("minutes")} />
      </div>
      <input className="input" placeholder="Note (e.g. first dance)" value={f.note} onChange={set("note")} dir="auto" />
      <button type="submit" className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-bold text-white hover:bg-brand-strong">
        <Plus className="h-4 w-4" /> Add to the set
      </button>
    </form>
  );
}

/** Everything about one song, and what it mixes well with. */
function SongSheet({
  song, songs, inSet, event, onClose, onAdd, onNote, onOpen, onMeasure, measuring,
}: {
  song: CrateSong; songs: CrateSong[]; inSet: boolean; event: DjEvent | null;
  onClose: () => void; onAdd: () => void; onNote: (t: string) => void; onOpen: (s: CrateSong) => void;
  /** Measure this song's key now (a library song with none yet). */
  onMeasure?: () => void;
  measuring: boolean;
}) {
  const energy = energyOf(song);
  const mates = suggest(songs, [song], 0, "next", { count: 5 });
  const facts: [string, string][] = [
    ["Tempo", song.bpm ? `${Math.round(song.bpm * 10) / 10} BPM${song.analyzed ? "" : " (stored, not measured yet)"}` : "Not known yet"],
    ["Key", song.key ? `${keyLabel(song.key)} · ${camelotCode(song.key)}` : song.outside ? "Not known — pick it when adding" : "Not measured yet"],
    ["Mixes with keys", song.key ? friendlyKeys(song.key).join(", ") : "–"],
    ["Energy", energy ? `${energy}/10 (a guess from tempo and genre)` : "Not known"],
    ["Length", song.duration ? clock(song.duration) : "Not known"],
    ["Genre", song.genre || "–"],
    ...(song.tags?.length ? [["Tags", song.tags.join(", ")] as [string, string]] : []),
    ...(event ? [[`Suits a ${event.label.toLowerCase()}`, `${Math.round(eventFit(song, event) * 100)}%`] as [string, string]] : []),
    ["On Remixt", song.outside ? "No — planned by hand" : "Yes — plays on the decks"],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={song.title} onClick={onClose}>
      <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-border bg-surface p-4 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          {song.outside ? (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-dashed border-border text-xs text-muted">new</span>
          ) : (
            <SongArt stemId={song.coverStemId} title={song.title} artist={song.artist} className="h-16 w-16 shrink-0 rounded-xl" />
          )}
          <div className="min-w-0 flex-1">
            <h2 dir="auto" className="text-lg font-bold leading-snug">
              {song.title}
            </h2>
            <p dir="auto" className="text-sm text-muted">
              {song.artist}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 text-muted hover:bg-surface-hover">
            <X className="h-5 w-5" />
          </button>
        </div>
        <dl className="mt-4 grid grid-cols-[8.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
          {facts.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="break-words">{v}</dd>
            </div>
          ))}
        </dl>
        {inSet && (
          <label className="mt-3 grid gap-1 text-sm">
            <span className="text-muted">Your note</span>
            <input className="input" defaultValue={song.note ?? ""} maxLength={200} onBlur={(e) => onNote(e.target.value.trim())} placeholder="e.g. play when the cake comes" dir="auto" />
          </label>
        )}
        {mates.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Mixes well into</p>
            <ul className="mt-1 flex flex-col gap-1">
              {mates.map((m) => (
                <li key={m.song.id}>
                  <button type="button" onClick={() => onOpen(m.song)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start hover:bg-surface-hover">
                    <span className={`w-8 text-xs font-bold tabular-nums ${m.score >= 75 ? "text-success" : m.score >= 50 ? "text-drums" : "text-danger"}`}>{m.score}</span>
                    <span dir="auto" className="min-w-0 flex-1 truncate text-sm">
                      {m.song.title}
                    </span>
                    <KeyBadge song={m.song} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {!inSet && (
            <button type="button" onClick={() => (onAdd(), onClose())} className="flex min-h-11 items-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-bold text-white">
              <Plus className="h-4 w-4" /> Add to the set
            </button>
          )}
          {onMeasure && (
            <button type="button" onClick={onMeasure} className="flex min-h-11 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-surface-hover">
              <Waves className="h-4 w-4" /> Measure its key
            </button>
          )}
          {measuring && !song.key && !song.outside && (
            <span className="flex min-h-11 items-center gap-1.5 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Measuring…
            </span>
          )}
          {song.outside && (
            <Link href="/upload" className="flex min-h-11 items-center rounded-xl border border-border px-3 text-sm font-semibold hover:bg-surface-hover">
              Upload it to Remixt
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
