"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { ArrowLeft, Check, ChevronDown, ClipboardPaste, Clock, Download, ExternalLink, FileText, Globe, Link2, Loader2, Music2, PenLine, Search, Sparkles, Trash2 } from "lucide-react";
import { useLyrics, type LyricSheet } from "@/lib/client/lyricsStore";
import { autoTimeSheet, importLyrics, importLyricsLink, isTakeLane, laneOfRecording, searchLyrics, stemEnvelope, type SearchAnswer, type SongHint } from "@/lib/client/lyricsSources";
import { mixSongFor, sheetFitsMix, songKey, useMixSongs, type MixSong } from "@/lib/client/mixSongs";
import { rankByVoice, voiceProfile, type VoiceFit, type VoiceProfile } from "@/lib/lyricsFit";
import { bringSongIn, useBringing } from "@/lib/client/songImport";
import { useStudioStore } from "@/lib/client/studioStore";
import { useStudioView } from "@/lib/client/studioView";
import { placeOnStem } from "@/lib/client/vocalTime";
import { formatClock, isSung, isSynced, parseLyrics, serializeLyrics, splitSongTitle, type LyricsPage, type LyricsResult } from "@/lib/lyrics";
import { isLyricsLink, lyricsFromFile, lyricsFromHtml, lyricsLinkFrom, looksLikeHtml, type ImportedLyrics } from "@/lib/lyricsImport";
import type { MusicPage } from "@/lib/musicPages";

function safeHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
import { hasPersian, matchScore, normalizePersian } from "@/lib/lyricsSearch";

// Choosing the lyrics to sing from, all on one screen: look a song up (in
// Persian or English letters — the mix's own song is looked up as soon as
// this opens, its best match on top) in the lyrics library, on Genius and
// on Iranian music sites (which have the words most Persian songs are
// missing from the library — and the song's MP3, to bring into the mix),
// paste a lyrics page's link or embed code, open a lyrics file (LRC, SRT,
// VTT, text), paste the words, write them, or have the AI write them — and
// the sheets used before (this song's first), to switch back to or delete.
// However the words come in, they're timed on the way (autoTimeSheet):
// from the library's timed copy of the song, or from the singing in the
// song's vocal lane — and lined up with where the song plays in the mix.
// Found lyrics remember the song they're for (see mixSongs.ts), so they
// follow the mix when its song changes.

/** The last search, kept while the page is open: closing and opening the picker shows it again. */
let lastSearch: { label: string; forKey: string | null; answer: SearchAnswer } | null = null;

function rememberSearch(search: NonNullable<typeof lastSearch>) {
  lastSearch = search;
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
      className="flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-border bg-background/50 px-1 py-1.5 text-[11px] font-semibold leading-tight transition-colors hover:border-vocals/60 hover:bg-surface-raised sm:flex-row sm:gap-1.5 sm:px-2 sm:text-xs"
    >
      <Icon className={`shrink-0 ${tone}`} /> <span className="max-w-full truncate">{label}</span>
    </button>
  );
}

function ResultRow({
  result,
  onUse,
  matchesMix,
  busy,
  best = false,
  fit = null,
}: {
  result: LyricsResult;
  onUse: () => void;
  matchesMix: boolean;
  busy: boolean;
  best?: boolean;
  /** How well it fits the song's vocal in the mix (see lyricsFit.ts). */
  fit?: VoiceFit | null;
}) {
  const [open, setOpen] = useState(false);
  const usable = !!(result.plain || result.synced);
  return (
    <li className={`rounded-xl border transition-colors hover:border-vocals/50 ${best ? "border-vocals/60 bg-vocals/5" : "border-border bg-background/50"}`}>
      <div className="flex items-center gap-2 p-2">
        <button onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 text-left" aria-expanded={open} title="Show the first lines">
          <p dir="auto" className="truncate text-sm font-medium">
            {result.title}
          </p>
          <p dir="auto" className="truncate text-[11px] text-muted">
            {[result.artist, result.duration ? formatClock(result.duration) : ""].filter(Boolean).join(" · ")}
          </p>
          <span className="mt-1 flex flex-wrap gap-1">
            {best && <span className="rounded-full bg-vocals px-1.5 py-px text-[10px] font-bold text-white">Best match</span>}
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
            {fit && fit.score >= 0.75 && (
              <span className="rounded-full bg-success/15 px-1.5 py-px text-[10px] font-semibold text-success" title={`Checked against the vocal in your mix: ${fit.why}`}>
                Fits the vocal
              </span>
            )}
            {fit && fit.score < 0.35 && (
              <span className="rounded-full bg-foreground/10 px-1.5 py-px text-[10px] text-muted" title="Checked against the vocal in your mix">
                {fit.why.charAt(0).toUpperCase() + fit.why.slice(1)}
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

/** A song's page on an Iranian music site: its words to sing from, and the song itself to bring into the mix. */
function SiteRow({ page, onLyrics, busy }: { page: MusicPage; onLyrics: () => void; busy: boolean }) {
  const bringing = useBringing(page.url);
  const name = [page.artist, page.title].filter(Boolean).join(" – ");
  return (
    <li className="flex items-center gap-2 rounded-xl border border-border bg-background/50 p-2 transition-colors hover:border-vocals/50">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-beat/15 text-beat">
        <Globe />
      </span>
      <a href={page.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1" title="Open the page">
        <span dir="auto" className="block truncate text-sm font-medium">
          {page.title}
        </span>
        <span dir="auto" className="block truncate text-[11px] text-muted">
          {[page.artist, page.site].filter(Boolean).join(" · ")}
        </span>
      </a>
      <button
        onClick={() => {
          const why = bringSongIn(page.url, name);
          if (why) useStudioView.getState().notify(why, "error");
        }}
        disabled={bringing}
        className="flex h-10 shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-semibold transition-colors hover:border-beat disabled:opacity-60"
        title="Bring the song into the mix: downloaded, split here into its beat and vocal, kept private to you"
        aria-label={`Bring “${name}” into the mix`}
      >
        {bringing ? <Loader2 className="animate-spin" /> : <Download />} <span className="max-sm:hidden">{bringing ? "Getting…" : "Song"}</span>
      </button>
      <button onClick={onLyrics} disabled={busy} className="h-10 shrink-0 rounded-lg bg-vocals px-3 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40" aria-label={`Use the lyrics of “${name}”`}>
        Lyrics
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
  // The last search, shown again — unless it was for a song that's left the mix.
  const kept = lastSearch && (!lastSearch.forKey || mixSongs.some((m) => m.key === lastSearch!.forKey)) ? lastSearch : null;
  const [query, setQuery] = useState(kept?.label ?? "");
  const [searchedFor, setSearchedFor] = useState(kept?.label ?? "");
  /** The mix song the search is for, if it's one of them: the lyrics picked belong to it. */
  const [forSong, setForSong] = useState<MixSong | null>(() => (kept?.forKey ? mixSongs.find((m) => m.key === kept.forKey) ?? null : null));
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<LyricsResult[] | null>(kept?.answer.results ?? null);
  const [web, setWeb] = useState<LyricsPage[]>(kept?.answer.web ?? []);
  const [sites, setSites] = useState<MusicPage[]>(kept?.answer.sites ?? []);
  const [sure, setSure] = useState(kept?.answer.sure ?? true);
  /** The library's other results, shown when it isn't sure it has the song. */
  const [allResults, setAllResults] = useState(false);
  /** A page or file being read in. */
  const [importing, setImporting] = useState<string | null>(null);
  /** A page that couldn't be read from here, to copy the words from by hand. */
  const [manual, setManual] = useState<{ url: string; title: string; artist: string; why: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  /** The newest search: an older one answering late (the mix's song, looked up on opening) doesn't replace it. */
  const searchId = useRef(0);
  const isLink = isLyricsLink(query);

  // The song's own vocal in the mix, heard once: results are ranked by how well they fit its singing.
  const vocalLane = useMemo(() => {
    if (!forSong) return null;
    return lanes.find((l) => l.kind === "vocals" && !isTakeLane(l) && l.originalDuration > 0 && songKey(splitSongTitle(l.trackTitle).song, splitSongTitle(l.trackTitle).artist) === forSong.key) ?? null;
  }, [forSong, lanes]);
  const [voice, setVoice] = useState<{ stemId: string; profile: VoiceProfile | null } | null>(null);
  const vocalStem = vocalLane?.stemId ?? null;
  useEffect(() => {
    if (!vocalLane || voice?.stemId === vocalLane.stemId) return;
    let live = true;
    const lane = vocalLane;
    void stemEnvelope(lane)
      .then((env) => live && setVoice({ stemId: lane.stemId, profile: voiceProfile(env, lane.originalDuration) }))
      .catch(() => {});
    return () => {
      live = false;
    };
    // Heard again only for another vocal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vocalStem]);
  const voiceNow = voice && voice.stemId === vocalStem ? voice.profile : null;

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
    create({ title: lyrics.title || "Lyrics", artist: lyrics.artist, text, source, aligned: isAligned, ...binding(lyrics.title, lyrics.artist, source) });
    const notify = useStudioView.getState().notify;
    if (note) notify(note);
    else if (isSynced(parseLyrics(text))) notify(isAligned ? "Lyrics lined up with your song in the mix" : "Lyrics added, with their times");
    else notify(`Lyrics added${lyrics.source ? ` from ${lyrics.source}` : ""} — no timing found: tap along to time them`);
    onPicked();
  }

  /** Which song in the mix found lyrics are the words of (see LyricSheet.song) — or, for none in particular, the mix they were picked over. */
  function binding(title: string, artist: string, source: LyricSheet["source"]): Pick<LyricSheet, "song" | "mix"> {
    if (source === "own") return {};
    const song = mixSongFor(title, artist, mixSongs) ?? forSong;
    if (song) return { song: song.key };
    return mixSongs.length ? { mix: mixSongs.map((m) => m.key) } : {};
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

  /**
   * The words from a music site's page — or, when that page has none (only
   * the MP3, or only a translation), from the same song's page on another
   * site found by the search.
   */
  async function lyricsFromSites(page: MusicPage) {
    const same = sites.filter((p) => p.url !== page.url && matchScore(`${page.artist} ${page.title}`, p.title, p.artist) >= 0.6);
    setError(null);
    setManual(null);
    for (const [i, candidate] of [page, ...same].slice(0, 4).entries()) {
      setImporting(i === 0 ? `Reading ${candidate.site}…` : `No words on that page — trying ${candidate.site}…`);
      try {
        const lyrics = await importLyricsLink(candidate.url, { title: candidate.title, artist: candidate.artist });
        await addTimed({ ...lyrics, title: lyrics.title || candidate.title, artist: lyrics.artist || candidate.artist }, "web");
        return;
      } catch {
        // The next site.
      }
    }
    setImporting(null);
    setManual({ url: page.url, title: page.title, artist: page.artist, why: "no-words" });
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
    // Typed: for a mix song if it names one.
    const target = typeof what === "string" ? mixSongFor(splitSongTitle(label).song || label, splitSongTitle(label).artist, mixSongs) : what;
    setForSong(target);
    setSearchedFor(label);
    setSearching(true);
    setError(null);
    const id = ++searchId.current;
    try {
      const found = await searchLyrics(params);
      if (id !== searchId.current) return;
      setResults(found.results);
      setWeb(found.web);
      setSites(found.sites);
      setSure(found.sure);
      setAllResults(false);
      rememberSearch({ label, forKey: target?.key ?? null, answer: found });
    } catch (err) {
      if (id !== searchId.current) return;
      setError(err instanceof Error ? err.message : "Couldn't search");
      setResults(null);
      setWeb([]);
      setSites([]);
    } finally {
      if (id === searchId.current) setSearching(false);
    }
  }

  // The mix's song is looked up as soon as the picker opens (unless that's what's shown already): most of the time it's the one wanted.
  const first = mixSongs[0];
  useEffect(() => {
    if (!first || lastSearch?.forKey === first.key || (lastSearch && !lastSearch.forKey && kept)) return;
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
    if (lane) text = serializeLyrics(placeOnStem(parseLyrics(text), lane));
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
        create({ title: manual.title, artist: manual.artist, text: "", source: "web", ...binding(manual.title, manual.artist, "web") });
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
  const matching = q && !isLink && !results ? sheets.filter((s) => normalizePersian(`${s.title} ${s.artist}`).toLowerCase().includes(q)) : sheets;
  // The ones for the song in the mix first.
  const fits = (s: LyricSheet) => mixSongs.length > 0 && sheetFitsMix(s, mixSongs) === true;
  const saved = [...matching.filter(fits), ...matching.filter((s) => !fits(s))];
  const ranked = useMemo(() => rankByVoice(results ?? [], voiceNow), [results, voiceNow]);
  const voiceFits = useMemo(() => new Map(ranked.map((r) => [r.result.id, r.fit])), [ranked]);
  const sorted = useMemo(() => ranked.map((r) => r.result), [ranked]);
  const bestIsMix = !!sorted[0] && ((!!sorted[0].synced && !!laneOf(sorted[0], lanes)) || (voiceFits.get(sorted[0].id)?.score ?? 0) >= 0.75);
  // The library not sure it has the song, and the music sites with pages for it: those first.
  const sitesFirst = sites.length > 0 && !sure && !bestIsMix;
  const shownResults = sitesFirst && !allResults ? sorted.slice(0, 4) : sorted;
  const sitesBlock = sites.length > 0 && (
    <>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">On Iranian music sites · lyrics, and the song</p>
      <ul className="flex flex-col gap-1.5">
        {sites.map((page) => (
          <SiteRow key={page.url} page={page} busy={!!importing} onLyrics={() => void lyricsFromSites(page)} />
        ))}
      </ul>
      {sitesFirst && results && results.length > 0 && <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">From the lyrics library</p>}
    </>
  );
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

      {mixSongs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
          <Music2 className="h-3.5 w-3.5 shrink-0 text-brand-strong" /> In your mix:
          {mixSongs.map((m) => (
            <button
              key={m.key}
              onClick={() => void search(m)}
              dir="auto"
              aria-pressed={forSong?.key === m.key}
              className={`max-w-[16rem] truncate rounded-full border px-2.5 py-1 text-[11px] transition-colors hover:border-vocals hover:text-foreground ${
                forSong?.key === m.key ? "border-vocals bg-vocals/10 font-semibold text-foreground" : "border-border text-muted"
              }`}
              title={`Find the lyrics of “${m.song}”`}
            >
              {m.artist ? `${m.artist} – ${m.song}` : m.song}
            </button>
          ))}
        </div>
      )}

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
            placeholder="Song, artist or link"
            dir="auto"
            type="search"
            enterKeyHint={isLink ? "go" : "search"}
            aria-label="Search lyrics by song or artist, or paste a link to a lyrics page"
            className="h-11 w-full rounded-xl border border-border bg-background ps-9 pe-3 text-sm max-lg:text-base"
          />
        </div>
        <button
          type="submit"
          // Not held while a search runs: a new one replaces it (the mix's song is looked up on opening, and the singer may want another).
          disabled={!!importing || !query.trim()}
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-vocals px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {importing ? "Reading…" : searching && query.trim() === searchedFor ? "Looking…" : isLink ? "Import" : "Find"}
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
            {manual.why === "no-words"
              ? "the music sites found have the song but not its words. If you find them on a page:"
              : `${safeHost(manual.url)} doesn't let the Studio read its pages. Three steps instead:`}
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

      <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
        <QuickAction icon={ClipboardPaste} label="Paste" onClick={() => void paste()} tone="text-beat" />
        <QuickAction icon={FileText} label="File" onClick={() => file.current?.click()} tone="text-success" />
        <QuickAction icon={PenLine} label="Write" onClick={onWrite} tone="text-vocals" />
        <QuickAction icon={Sparkles} label="AI" onClick={onAi} tone="text-brand-strong" />
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
          <p dir="auto" className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted">
            {searching ? `Looking for “${searchedFor}”…` : `Found for “${searchedFor}”`}
          </p>
          {searching && (
            <div className="flex flex-col gap-1.5" aria-hidden>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-raised" />
              ))}
            </div>
          )}
          {!searching && error && <p className="text-xs text-danger">{error}</p>}
          {!searching && sitesFirst && sitesBlock}
          {!searching && results && results.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {shownResults.map((r, i) => (
                <ResultRow key={r.id} result={r} fit={voiceFits.get(r.id) ?? null} best={i === 0 && !sitesFirst && (bestIsMix || !!forSong || sure)} busy={!!importing} onUse={() => void use(r)} matchesMix={!!r.synced && !!laneOf(r, lanes)} />
              ))}
            </ul>
          )}
          {!searching && results && shownResults.length < results.length && (
            <button onClick={() => setAllResults(true)} className="h-9 self-start rounded-lg px-2 text-xs font-semibold text-vocals hover:bg-vocals/10">
              Show {results.length - shownResults.length} more from the lyrics library
            </button>
          )}
          {!searching && !sitesFirst && sitesBlock}
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
          {!searching && results && results.length === 0 && web.length === 0 && sites.length === 0 && (
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
          {/* The ones for the song in the mix are first, marked. */}
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
                        {fits(s) && <span className="me-1 font-semibold text-brand-strong">This song ·</span>}
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

      <p className="text-[11px] text-muted/80">
        Timed lyrics from LRCLIB, an open lyrics library; words from Genius, Iranian music sites, or any lyrics page you link. Files: .lrc, .srt, .vtt, .txt.
      </p>
    </div>
  );
}
