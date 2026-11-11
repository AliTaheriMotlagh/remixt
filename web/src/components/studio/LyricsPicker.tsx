"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import { ArrowLeft, Check, ChevronDown, ClipboardPaste, Clock, ExternalLink, Music2, PenLine, Search, Sparkles, Trash2 } from "lucide-react";
import { useLyrics } from "@/lib/client/lyricsStore";
import { useStudioStore, type StudioLane } from "@/lib/client/studioStore";
import { useStudioView } from "@/lib/client/studioView";
import { formatClock, isSynced, parseLyrics, placeOnLane, serializeLyrics, splitSongTitle, type LyricsResult } from "@/lib/lyrics";
import { hasPersian, normalizePersian } from "@/lib/lyricsSearch";

// Choosing the lyrics to sing from, all on one screen: look a song up (in
// Persian or English letters — the mix's own song is looked up as soon as
// this opens), paste them, write them, or have the AI write them — and the
// sheets used before, to switch back to or delete. Swapping lyrics is the
// same two taps from anywhere: "Change", then the one you want.

/** A song playing in the mix, to look its lyrics up. */
type MixSong = { key: string; song: string; artist: string; lane: StudioLane };

/** Mix songs already looked up this visit: opening the picker again doesn't search again. */
const autoSearched = new Set<string>();

/** The songs in the mix by their titles — never a recorded take, never who uploaded it. */
function useMixSongs(): MixSong[] {
  const lanes = useStudioStore((s) => s.lanes);
  return useMemo(() => {
    const out: MixSong[] = [];
    for (const lane of lanes) {
      if (lane.artistName === "You" || /^studio vocal|— take \d+/i.test(lane.trackTitle)) continue;
      const { song, artist } = splitSongTitle(lane.trackTitle);
      if (!song) continue;
      const key = normalizePersian(`${artist} ${song}`).toLowerCase();
      if (out.some((m) => m.key === key)) continue;
      out.push({ key, song, artist, lane });
    }
    return out.slice(0, 4);
  }, [lanes]);
}

/** The mix lane playing this recording (same length, within a few seconds), if any. */
function laneOf(result: LyricsResult, lanes: StudioLane[]) {
  if (!result.duration) return null;
  return (
    lanes.find(
      (l) => l.artistName !== "You" && !l.clips && Math.abs(l.originalDuration - result.duration!) <= 3
    ) ?? null
  );
}

/** The first lines of a sheet, without their times, to glance at. */
function previewOf(result: LyricsResult) {
  const lines = parseLyrics(result.plain ?? result.synced ?? "").map((l) => l.text);
  return lines.slice(0, 14).join("\n");
}

function QuickAction({ icon: Icon, label, onClick, tone }: { icon: ComponentType<{ className?: string }>; label: string; onClick: () => void; tone: string }) {
  return (
    <button
      onClick={onClick}
      className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-background/50 px-2 py-2 text-[11px] font-semibold transition-colors hover:border-vocals/60 hover:bg-surface-raised sm:flex-row sm:gap-1.5 sm:text-xs"
    >
      <Icon className={tone} /> {label}
    </button>
  );
}

function ResultRow({ result, onUse, matchesMix }: { result: LyricsResult; onUse: () => void; matchesMix: boolean }) {
  const [open, setOpen] = useState(false);
  const usable = !!(result.plain || result.synced);
  return (
    <li className="rounded-xl border border-border bg-background/50 transition-colors hover:border-vocals/50">
      <div className="flex items-center gap-2 p-2">
        <button onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 text-left" aria-expanded={open} title="Show the first lines">
          <p dir="auto" className="truncate text-sm font-medium">
            {result.title}
          </p>
          <p dir="auto" className="truncate text-[11px] text-muted">
            {[result.artist, result.duration ? formatClock(result.duration) : ""].filter(Boolean).join(" · ")}
          </p>
          <span className="mt-1 flex flex-wrap gap-1">
            {result.synced ? (
              <span className="flex items-center gap-1 rounded-full bg-success/15 px-1.5 py-px text-[10px] font-semibold text-success" title="Every line has its time — they'll follow the song">
                <Clock className="h-3 w-3" /> Timed
              </span>
            ) : result.instrumental && !usable ? (
              <span className="rounded-full bg-foreground/10 px-1.5 py-px text-[10px] text-muted">Instrumental</span>
            ) : (
              <span className="rounded-full bg-foreground/10 px-1.5 py-px text-[10px] text-muted">Words only</span>
            )}
            {matchesMix && (
              <span className="flex items-center gap-1 rounded-full bg-brand/15 px-1.5 py-px text-[10px] font-semibold text-brand-strong" title="Same length as the song in your mix — likely the same recording">
                <Music2 className="h-3 w-3" /> Your song
              </span>
            )}
          </span>
        </button>
        <ChevronDown className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        <button
          onClick={onUse}
          disabled={!usable}
          className="h-10 shrink-0 rounded-lg bg-vocals px-4 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
        >
          Use
        </button>
      </div>
      {open && (
        <pre dir="auto" className="max-h-48 overflow-y-auto whitespace-pre-wrap border-t border-border px-3 py-2 font-sans text-xs leading-relaxed text-muted">
          {previewOf(result) || "No words — an instrumental."}
        </pre>
      )}
    </li>
  );
}

export default function LyricsPicker({ onPicked, onWrite, onAi, onBack }: { onPicked: () => void; onWrite: () => void; onAi: () => void; onBack?: () => void }) {
  const sheets = useLyrics((s) => s.sheets);
  const activeId = useLyrics((s) => s.activeId);
  const select = useLyrics((s) => s.select);
  const create = useLyrics((s) => s.create);
  const remove = useLyrics((s) => s.remove);
  const removed = useLyrics((s) => s.removed);
  const restore = useLyrics((s) => s.restore);
  const active = sheets.find((s) => s.id === activeId);
  const mixSongs = useMixSongs();
  const lanes = useStudioStore((s) => s.lanes);
  const [query, setQuery] = useState("");
  const [searchedFor, setSearchedFor] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<LyricsResult[] | null>(null);

  async function search(what: string | MixSong) {
    const label = typeof what === "string" ? what.trim() : [what.artist, what.song].filter(Boolean).join(" – ");
    if (!label) return;
    const params =
      typeof what === "string"
        ? new URLSearchParams({ q: label })
        : new URLSearchParams({
            track: what.song,
            ...(what.artist ? { artist: what.artist } : {}),
            ...(what.lane.originalDuration ? { duration: String(Math.round(what.lane.originalDuration)) } : {}),
          });
    if (typeof what !== "string") setQuery(label);
    setSearchedFor(label);
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/lyrics/search?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't search");
      setResults(data.results as LyricsResult[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't search");
      setResults(null);
    } finally {
      setSearching(false);
    }
  }

  // The mix's song is looked up as soon as the picker opens: most of the time it's the one wanted.
  const first = mixSongs[0];
  useEffect(() => {
    if (!first || autoSearched.has(first.key)) return;
    autoSearched.add(first.key);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a search started for the mix's song
    void search(first);
    // Only when the mix's first song changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first?.key]);

  function use(result: LyricsResult) {
    let text = result.synced ?? result.plain ?? "";
    let aligned = false;
    // The same recording as a lane in the mix: its times are put where that lane plays.
    const lane = result.synced ? laneOf(result, useStudioStore.getState().lanes) : null;
    if (lane) {
      text = serializeLyrics(placeOnLane(parseLyrics(text), lane.offsetSeconds, lane.tempoRatio));
      aligned = true;
    }
    create({ title: result.title, artist: result.artist, text, source: "library", aligned });
    if (lane) useStudioView.getState().notify("Lyrics lined up with your song in the mix");
    onPicked();
  }

  async function paste() {
    let text = "";
    try {
      text = (await navigator.clipboard.readText()).trim();
    } catch {
      // Not allowed here: the editor's box takes a long-press paste instead.
    }
    if (!text) {
      onWrite();
      useStudioView.getState().notify("Paste the words into the box — long-press, or Ctrl/⌘+V");
      return;
    }
    const firstLine = parseLyrics(text).find((l) => l.text)?.text ?? "";
    create({ title: (query.trim() || firstLine).slice(0, 60) || "My lyrics", artist: "", text: text.slice(0, 20_000), source: "own" });
    onPicked();
  }

  const q = normalizePersian(query).toLowerCase();
  const saved = q
    ? sheets.filter((s) => normalizePersian(`${s.title} ${s.artist}`).toLowerCase().includes(q))
    : sheets;
  const webSearch = `https://www.google.com/search?q=${encodeURIComponent(
    hasPersian(searchedFor) ? `متن آهنگ ${searchedFor}` : `${searchedFor} lyrics`
  )}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {onBack && (
          <button onClick={onBack} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-raised hover:text-foreground" aria-label="Back to the lyrics">
            <ArrowLeft />
          </button>
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold">{active ? "Change lyrics" : "Lyrics to sing from"}</p>
          <p className="truncate text-[11px] text-muted">Find a song in Persian or English, or bring your own words.</p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void search(query);
        }}
        className="flex gap-2"
      >
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="هیچکس فیروز · Hichkas Firooz"
            dir="auto"
            type="search"
            enterKeyHint="search"
            aria-label="Search lyrics by song or artist"
            className="h-11 w-full rounded-xl border border-border bg-background ps-9 pe-3 text-sm max-lg:text-base"
          />
        </div>
        <button
          type="submit"
          disabled={searching || !query.trim()}
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-vocals px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {searching ? "Looking…" : "Find"}
        </button>
      </form>

      {mixSongs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
          In your mix:
          {mixSongs.map((m) => (
            <button
              key={m.key}
              onClick={() => void search(m)}
              dir="auto"
              className="max-w-[16rem] truncate rounded-full border border-border px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-vocals hover:text-foreground"
              title={`Find the lyrics of “${m.song}”`}
            >
              {m.artist ? `${m.artist} – ${m.song}` : m.song}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <QuickAction icon={ClipboardPaste} label="Paste lyrics" onClick={() => void paste()} tone="text-beat" />
        <QuickAction icon={PenLine} label="Write my own" onClick={onWrite} tone="text-vocals" />
        <QuickAction icon={Sparkles} label="Write with AI" onClick={onAi} tone="text-brand-strong" />
      </div>

      {(searching || error || results) && (
        <section aria-label="Found online" className="flex flex-col gap-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            {searching ? `Looking for “${searchedFor}”…` : `Online · “${searchedFor}”`}
          </p>
          {searching && (
            <div className="flex flex-col gap-1.5" aria-hidden>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-raised" />
              ))}
            </div>
          )}
          {!searching && error && <p className="text-xs text-danger">{error}</p>}
          {!searching && results && results.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {results.map((r) => (
                <ResultRow key={r.id} result={r} onUse={() => use(r)} matchesMix={!!r.synced && !!laneOf(r, lanes)} />
              ))}
            </ul>
          )}
          {!searching && results && results.length === 0 && (
            <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border px-3 py-3 text-xs text-muted">
              <p>
                <b className="text-foreground">No lyrics found for “{searchedFor}”.</b>{" "}
                {hasPersian(searchedFor)
                  ? "Try the artist's name too, or the title in English letters (Finglish)."
                  : "Try the artist's name too, or fewer words."}
              </p>
              <p>Found them on a lyrics site? Copy the words, come back and tap Paste.</p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={webSearch}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 font-semibold text-foreground hover:border-vocals"
                >
                  <ExternalLink /> Search the web
                </a>
                <button onClick={() => void paste()} className="flex h-10 items-center gap-1.5 rounded-lg bg-vocals px-3 font-semibold text-white hover:opacity-90">
                  <ClipboardPaste /> Paste lyrics
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {removed && (
        <div className="flex items-center gap-2 rounded-xl bg-surface-raised px-3 py-2 text-xs" role="status">
          <span dir="auto" className="min-w-0 flex-1 truncate">
            Deleted “{removed.sheet.title}”
          </span>
          <button onClick={restore} className="h-8 shrink-0 rounded-lg px-2 font-semibold text-vocals hover:bg-vocals/10">
            Undo
          </button>
        </div>
      )}

      {saved.length > 0 && (
        <section aria-label="Your lyrics" className="flex flex-col gap-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Your lyrics · {saved.length}</p>
          <ul className="flex flex-col gap-1">
            {saved.map((s) => {
              const isActive = s.id === activeId;
              const timed = isSynced(parseLyrics(s.text));
              return (
                <li key={s.id} className={`flex items-center gap-1 rounded-xl border ${isActive ? "border-vocals/60 bg-vocals/5" : "border-border bg-background/50"}`}>
                  <button
                    onClick={() => {
                      if (!isActive) select(s.id);
                      onPicked();
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 p-2 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span dir="auto" className="block truncate text-sm font-medium">
                        {s.title || "Untitled"}
                      </span>
                      <span dir="auto" className="block truncate text-[11px] text-muted">
                        {[s.artist, timed ? "Timed" : "Not timed"].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    {isActive ? (
                      <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-vocals">
                        <Check /> In use
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold text-muted">Use</span>
                    )}
                  </button>
                  <button
                    onClick={() => remove(s.id)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted hover:text-danger"
                    aria-label={`Delete “${s.title}”`}
                    title="Delete — you can undo"
                  >
                    <Trash2 />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="text-[11px] text-muted/80">Lyrics from LRCLIB, an open lyrics library.</p>
    </div>
  );
}
