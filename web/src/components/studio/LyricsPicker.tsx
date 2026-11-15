"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { ArrowLeft, Check, ChevronDown, ClipboardPaste, Clock, ExternalLink, FileText, Link2, Music2, PenLine, Search, Sparkles, Trash2 } from "lucide-react";
import { useLyrics } from "@/lib/client/lyricsStore";
import { autoTimeSheet, importLyrics, laneOfRecording, searchLyrics, type SongHint } from "@/lib/client/lyricsSources";
import { useStudioStore, type StudioLane } from "@/lib/client/studioStore";
import { useStudioView } from "@/lib/client/studioView";
import { formatClock, isSung, isSynced, parseLyrics, placeOnLane, serializeLyrics, splitSongTitle, type LyricsPage, type LyricsResult } from "@/lib/lyrics";
import { isLyricsLink, lyricsFromFile, lyricsFromHtml, lyricsLinkFrom, looksLikeHtml, type ImportedLyrics } from "@/lib/lyricsImport";

function safeHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
import { hasPersian, normalizePersian } from "@/lib/lyricsSearch";

// Choosing the lyrics to sing from, all on one screen: look a song up (in
// Persian or English letters — the mix's own song is looked up as soon as
// this opens) in the lyrics library and on Genius, paste a lyrics page's
// link or embed code, open a lyrics file (LRC, SRT, VTT, text), paste the
// words, write them, or have the AI write them — and the sheets used
// before, to switch back to or delete. However the words come in, they're
// timed on the way (autoTimeSheet): from the library's timed copy of the
// song, or from the singing in the song's vocal lane — and lined up with
// where the song plays in the mix.
// Swapping lyrics is the same two taps from anywhere: "Change", then the
// one you want.

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

/** The mix lane playing this recording, if any (see laneOfRecording). */
const laneOf = laneOfRecording;

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

function ResultRow({ result, onUse, matchesMix, busy }: { result: LyricsResult; onUse: () => void; matchesMix: boolean; busy: boolean }) {
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
              <span className="rounded-full bg-foreground/10 px-1.5 py-px text-[10px] text-muted" title="Timed for you when you use them — from the library or your mix's vocals">
                Words · auto-timed
              </span>
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
          disabled={!usable || busy}
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

function WebRow({ page, onUse, busy }: { page: LyricsPage; onUse: () => void; busy: boolean }) {
  return (
    <li className="flex items-center gap-2 rounded-xl border border-border bg-background/50 p-2 transition-colors hover:border-vocals/50">
      {page.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- a small remote thumbnail
        <img src={page.image} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-raised text-muted">
          <FileText />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span dir="auto" className="block truncate text-sm font-medium">
          {page.title}
        </span>
        <span dir="auto" className="block truncate text-[11px] text-muted">
          {[page.artist, "Genius"].filter(Boolean).join(" · ")}
        </span>
      </span>
      <a href={page.url} target="_blank" rel="noopener noreferrer" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted hover:text-foreground" aria-label={`Open “${page.title}” on Genius`}>
        <ExternalLink />
      </a>
      <button onClick={onUse} disabled={busy} className="h-10 shrink-0 rounded-lg bg-vocals px-4 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40">
        Use
      </button>
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
  const [web, setWeb] = useState<LyricsPage[]>([]);
  /** A page or file being read in. */
  const [importing, setImporting] = useState<string | null>(null);
  /** A page that couldn't be read from here, to copy the words from by hand. */
  const [manual, setManual] = useState<{ url: string; title: string; artist: string; why: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const isLink = isLyricsLink(query);

  /**
   * A new sheet from words that came in from anywhere, timed on the way
   * (see autoTimeSheet) — the singer is told how, or how to time them.
   */
  async function addTimed(lyrics: ImportedLyrics, source: "library" | "web" | "file" | "own", { aligned = false }: { aligned?: boolean } = {}) {
    let text = lyrics.text;
    let isAligned = aligned;
    let note = "";
    if (!aligned) {
      setImporting("Looking for the timing…");
      const timed = await autoTimeSheet(text, { title: lyrics.title, artist: lyrics.artist }, setImporting).catch(() => null);
      if (timed) {
        text = timed.text;
        isAligned = timed.aligned;
        note = timed.note;
      }
    }
    setImporting(null);
    create({ title: lyrics.title || "Lyrics", artist: lyrics.artist, text, source, aligned: isAligned });
    const notify = useStudioView.getState().notify;
    if (note) notify(note);
    else if (isSynced(parseLyrics(text))) notify(isAligned ? "Lyrics lined up with your song in the mix" : "Lyrics added, with their times");
    else notify(`Lyrics added${lyrics.source ? ` from ${lyrics.source}` : ""} — no timing found: tap along to time them`);
    onPicked();
  }

  /** `song`: what the page is, when known (a Genius result) — tried other ways when the page can't be read, and kept for words pasted from it by hand. */
  async function importLink(link: string, song?: SongHint) {
    setError(null);
    setManual(null);
    setImporting("Reading the page…");
    try {
      const lyrics = await importLyrics(link, song, setImporting);
      await addTimed(lyrics, lyrics.source === "lrclib.net" ? "library" : "web");
    } catch (err) {
      // The site won't let the server read it: the singer copies the words, and they're named and timed all the same.
      const url = lyricsLinkFrom(link);
      if (url) setManual({ url, title: song?.title ?? "", artist: song?.artist ?? "", why: err instanceof Error ? err.message : "" });
      else setError(err instanceof Error ? err.message : "Couldn't read that link");
    } finally {
      setImporting(null);
    }
  }

  async function openFile(chosen: File | undefined) {
    if (!chosen) return;
    if (chosen.size > 1_000_000) {
      setError("That file is too big for lyrics — pick an .lrc, .srt, .vtt or .txt file");
      return;
    }
    setError(null);
    const raw = await chosen.text().catch(() => "");
    const html = looksLikeHtml(raw) ? lyricsFromHtml(raw, "") : null;
    const text = html ? html.text : lyricsFromFile(raw);
    if (!text.trim()) {
      setError("No lyrics in that file");
      return;
    }
    const name = chosen.name.replace(/\.\w+$/, "").replace(/[_]+/g, " ").trim();
    const split = splitSongTitle(name);
    await addTimed({ title: split.song || name || "Lyrics", artist: split.artist, text, source: "" }, "file");
  }

  async function search(what: string | MixSong) {
    const label = typeof what === "string" ? what.trim() : [what.artist, what.song].filter(Boolean).join(" – ");
    if (!label) return;
    if (typeof what === "string" && isLyricsLink(label)) {
      await importLink(label);
      return;
    }
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
      const found = await searchLyrics(params);
      setResults(found.results);
      setWeb(found.web);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't search");
      setResults(null);
      setWeb([]);
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

  /** A library result as the sheet: timed ones put where their recording plays in the mix; words-only ones timed on the way. */
  async function use(result: LyricsResult) {
    let text = result.synced ?? result.plain ?? "";
    // The same recording as a lane in the mix: its times are put where that lane plays.
    const lane = result.synced ? laneOf(result, useStudioStore.getState().lanes) : null;
    if (lane) text = serializeLyrics(placeOnLane(parseLyrics(text), lane.offsetSeconds, lane.tempoRatio));
    await addTimed({ title: result.title, artist: result.artist, text, source: "" }, "library", { aligned: !!lane });
  }

  async function paste() {
    let text = "";
    try {
      text = (await navigator.clipboard.readText()).trim();
    } catch {
      // Not allowed here: the editor's box takes a long-press paste instead.
    }
    if (!text) {
      if (manual?.title) {
        // Named for the page they come from, ready for the words.
        create({ title: manual.title, artist: manual.artist, text: "", source: "web" });
        setManual(null);
        useLyrics.getState().setView("edit");
      } else onWrite();
      useStudioView.getState().notify("Paste the words into the box — long-press, or Ctrl/⌘+V");
      return;
    }
    // A link or embed code: the page it points to is read.
    if (isLyricsLink(text)) {
      setQuery(text.slice(0, 500));
      await importLink(text);
      return;
    }
    // A page's HTML: the words on it.
    const fromPage = looksLikeHtml(text) ? lyricsFromHtml(text, "") : null;
    const words = fromPage?.text ?? lyricsFromFile(text);
    const firstLine = parseLyrics(words).find(isSung)?.text ?? "";
    const typed = query.trim() && !isLyricsLink(query) ? query.trim() : "";
    const split = splitSongTitle(typed);
    const from = manual;
    setManual(null);
    await addTimed(
      {
        title: (fromPage?.title || from?.title || split.song || firstLine).slice(0, 60) || "My lyrics",
        artist: fromPage?.artist || from?.artist || split.artist,
        text: words.slice(0, 20_000),
        source: from ? safeHost(from.url) : "",
      },
      from ? "web" : "own"
    );
  }

  const q = normalizePersian(query).toLowerCase();
  const saved = q
    ? sheets.filter((s) => normalizePersian(`${s.title} ${s.artist}`).toLowerCase().includes(q))
    : sheets;
  const webSearch = `https://www.google.com/search?q=${encodeURIComponent(
    hasPersian(searchedFor) ? `متن آهنگ ${searchedFor}` : `${searchedFor} lyrics`
  )}`;
  const geniusSearch = `https://genius.com/search?q=${encodeURIComponent(searchedFor)}`;

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
          <p className="truncate text-[11px] text-muted">Find a song in Persian or English, paste a lyrics link, or bring your own words.</p>
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
          {isLink ? (
            <Link2 className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-vocals" />
          ) : (
            <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
          )}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onPaste={(e) => {
              // A pasted link or embed code is read straight away.
              const pasted = e.clipboardData.getData("text");
              if (isLyricsLink(pasted)) {
                e.preventDefault();
                setQuery(pasted.trim().slice(0, 500));
                void importLink(pasted);
              }
            }}
            placeholder="Song or artist — or paste a lyrics link"
            dir="auto"
            type="search"
            enterKeyHint={isLink ? "go" : "search"}
            aria-label="Search lyrics by song or artist, or paste a link to a lyrics page"
            className="h-11 w-full rounded-xl border border-border bg-background ps-9 pe-3 text-sm max-lg:text-base"
          />
        </div>
        <button
          type="submit"
          disabled={searching || !!importing || !query.trim()}
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-vocals px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {searching ? "Looking…" : importing ? "Reading…" : isLink ? "Import" : "Find"}
        </button>
      </form>
      {importing && (
        <p className="flex items-center gap-2 rounded-xl bg-vocals/10 px-3 py-2 text-xs text-foreground" role="status">
          <span className="h-2 w-2 animate-pulse rounded-full bg-vocals" /> {importing}
        </p>
      )}
      {error && !searching && !results && <p className="text-xs text-danger" role="alert">{error}</p>}
      {manual && (
        <div className="flex flex-col gap-2 rounded-xl border border-beat/40 bg-beat/10 p-3 text-xs" role="status">
          <p>
            <b dir="auto">{manual.title ? `“${manual.title}”: ` : ""}</b>
            {safeHost(manual.url)} doesn&apos;t let the Studio read its pages. Three steps instead:
          </p>
          <ol className="list-inside list-decimal space-y-0.5 text-muted">
            <li>Open the page — it opens in a new tab.</li>
            <li>Select the lyrics and copy them.</li>
            <li>Come back and tap Paste — they&apos;re timed for you.</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <a href={manual.url} target="_blank" rel="noopener noreferrer" className="flex h-10 items-center gap-1.5 rounded-lg border border-border bg-background px-3 font-semibold text-foreground hover:border-vocals">
              <ExternalLink /> Open the page
            </a>
            <button onClick={() => void paste()} className="flex h-10 items-center gap-1.5 rounded-lg bg-vocals px-3 font-semibold text-white hover:opacity-90">
              <ClipboardPaste /> Paste the words
            </button>
            <button onClick={() => setManual(null)} className="h-10 px-2 text-muted hover:text-foreground">
              Not now
            </button>
          </div>
        </div>
      )}

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

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <QuickAction icon={ClipboardPaste} label="Paste words or link" onClick={() => void paste()} tone="text-beat" />
        <QuickAction icon={FileText} label="Open a file" onClick={() => file.current?.click()} tone="text-success" />
        <QuickAction icon={PenLine} label="Write my own" onClick={onWrite} tone="text-vocals" />
        <QuickAction icon={Sparkles} label="Write with AI" onClick={onAi} tone="text-brand-strong" />
      </div>
      <input
        ref={file}
        type="file"
        accept=".lrc,.srt,.vtt,.txt,.html,.htm,text/plain,text/vtt,application/x-subrip"
        className="hidden"
        onChange={(e) => {
          void openFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

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
                <ResultRow key={r.id} result={r} busy={!!importing} onUse={() => void use(r)} matchesMix={!!r.synced && !!laneOf(r, lanes)} />
              ))}
            </ul>
          )}
          {!searching && web.length > 0 && (
            <>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">On Genius · words, timed for you</p>
              <ul className="flex flex-col gap-1.5">
                {web.map((page) => (
                  <WebRow key={page.url} page={page} busy={!!importing} onUse={() => void importLink(page.url, { title: page.title, artist: page.artist, geniusId: page.id })} />
                ))}
              </ul>
            </>
          )}
          {!searching && results && results.length > 0 && (
            <p className="text-[11px] text-muted">
              Not the one?{" "}
              <a href={geniusSearch} target="_blank" rel="noopener noreferrer" className="font-semibold text-vocals hover:underline">
                Search Genius
              </a>{" "}
              or{" "}
              <a href={webSearch} target="_blank" rel="noopener noreferrer" className="font-semibold text-vocals hover:underline">
                the web
              </a>
              , copy the page&apos;s link (or its embed code) and paste it in the box above.
            </p>
          )}
          {!searching && results && results.length === 0 && web.length === 0 && (
            <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border px-3 py-3 text-xs text-muted">
              <p>
                <b className="text-foreground">No lyrics found for “{searchedFor}”.</b>{" "}
                {hasPersian(searchedFor)
                  ? "Try the artist's name too, or the title in English letters (Finglish)."
                  : "Try the artist's name too, or fewer words."}
              </p>
              <p>Found them on a lyrics site? Copy the page&apos;s link (or the words), come back and tap Paste.</p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={webSearch}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 font-semibold text-foreground hover:border-vocals"
                >
                  <ExternalLink /> Search the web
                </a>
                <a
                  href={geniusSearch}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 font-semibold text-foreground hover:border-vocals"
                >
                  <ExternalLink /> Genius
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

      <p className="text-[11px] text-muted/80">Timed lyrics from LRCLIB, an open lyrics library; words from Genius or any lyrics page you link. Files: .lrc, .srt, .vtt, .txt.</p>
    </div>
  );
}
