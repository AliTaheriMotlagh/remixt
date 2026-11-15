"use client";

import { useRef, useState } from "react";
import { Download, ExternalLink, Globe, Link2, Loader2, Search } from "lucide-react";
import { bringSongIn, useBringing } from "@/lib/client/songImport";
import { useStudioView } from "@/lib/client/studioView";
import { splitLinks } from "@/lib/linkHosts";
import type { MusicPage } from "@/lib/musicPages";

// Finding the song (or just its beat) to sing over, without leaving the
// Studio: a search of Iranian music sites (beatmastering.ir, rozmusic…),
// or a pasted link — a song's page on any of them, an MP3's address,
// SoundCloud, YouTube. Whatever's picked is downloaded by the server,
// split here into its beat and vocal, kept private to the singer, and put
// in the mix (lib/client/songImport.ts).

const INSTRUMENTAL = "بی کلام";

/** A name to call a pasted link by until the song has its own: its last part, readable. */
function linkName(link: string) {
  const last = link.split(/[?#]/)[0].split("/").filter(Boolean).pop() ?? "";
  let name = last;
  try {
    name = decodeURIComponent(last);
  } catch {
    // Not percent-encoded properly: as it is.
  }
  return name.replace(/\.(html?|php|mp3|m4a)$/i, "").replace(/[-_+]+/g, " ").trim().slice(0, 80) || "the song";
}

function PageRow({ page }: { page: MusicPage }) {
  const bringing = useBringing(page.url);
  const name = [page.artist, page.title].filter(Boolean).join(" – ");
  return (
    <li className="flex items-center gap-2 rounded-xl border border-border bg-background/50 p-2 transition-colors hover:border-beat/60">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-beat/15 text-beat">
        <Globe />
      </span>
      <span className="min-w-0 flex-1">
        <span dir="auto" className="block truncate text-sm font-medium">
          {page.title}
        </span>
        <span dir="auto" className="block truncate text-[11px] text-muted">
          {[page.artist, page.site].filter(Boolean).join(" · ")}
        </span>
      </span>
      <a
        href={page.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted hover:text-foreground"
        aria-label={`Open “${name}” on ${page.site}`}
      >
        <ExternalLink />
      </a>
      <button
        onClick={() => {
          const why = bringSongIn(page.url, name);
          if (why) useStudioView.getState().notify(why, "error");
        }}
        disabled={bringing}
        className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-beat px-3 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
        aria-label={`Bring “${name}” into the mix`}
      >
        {bringing ? <Loader2 className="animate-spin" /> : <Download />} {bringing ? "Getting…" : "Use"}
      </button>
    </li>
  );
}

export default function SongFinder() {
  const signedIn = useStudioView((s) => s.signedIn);
  const [query, setQuery] = useState("");
  const [instrumental, setInstrumental] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searchedFor, setSearchedFor] = useState("");
  const [pages, setPages] = useState<MusicPage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The newest search: one answering late doesn't replace it. */
  const searchId = useRef(0);
  const link = splitLinks(query.trim())[0] ?? null;
  const isLink = !!link && /^https?:\/\//i.test(query.trim());

  async function find() {
    const text = query.trim();
    if (!text) return;
    if (isLink && link) {
      const why = bringSongIn(link, linkName(link));
      if (why) setError(why);
      else setQuery("");
      return;
    }
    setSearching(true);
    setError(null);
    setSearchedFor(text);
    const id = ++searchId.current;
    const ask = async (q: string) => {
      const res = await fetch(`/api/music/search?${new URLSearchParams({ q })}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't search");
      return (data.pages ?? []) as MusicPage[];
    };
    try {
      // The instrumental and the song, together: instrumentals first (a song's beat is split out of it anyway).
      const wantBeat = instrumental && !text.includes(INSTRUMENTAL);
      const [beats, songs] = await Promise.all([wantBeat ? ask(`${text} ${INSTRUMENTAL}`).catch(() => []) : Promise.resolve([]), ask(text)]);
      if (id !== searchId.current) return;
      const seen = new Set<string>();
      setPages([...beats, ...songs].filter((p) => !seen.has(p.url) && !!seen.add(p.url)));
    } catch (err) {
      if (id !== searchId.current) return;
      setError(err instanceof Error ? err.message : "Couldn't search");
      setPages(null);
    } finally {
      if (id === searchId.current) setSearching(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-semibold">Find a song or a beat to sing over</p>
        <p className="text-[11px] text-muted">
          Search Iranian music sites, or paste a link — a song&apos;s page, an MP3, SoundCloud, YouTube. It&apos;s split here into its beat and vocal and put in your mix, private to you.
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void find();
        }}
        className="flex gap-2"
      >
        <div className="relative min-w-0 flex-1">
          {isLink ? (
            <Link2 className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-beat" />
          ) : (
            <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
          )}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Song, artist or link"
            dir="auto"
            type="search"
            enterKeyHint={isLink ? "go" : "search"}
            aria-label="Search a song or beat, or paste a link to one"
            className="h-11 w-full rounded-xl border border-border bg-background ps-9 pe-3 text-sm max-lg:text-base"
          />
        </div>
        <button
          type="submit"
          disabled={searching || !query.trim()}
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-beat px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {searching ? "Looking…" : isLink ? "Get it" : "Find"}
        </button>
      </form>
      {!isLink && (
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={instrumental} onChange={(e) => setInstrumental(e.target.checked)} className="h-4 w-4 accent-[var(--beat)]" />
          Instrumentals (بی کلام) first
        </label>
      )}
      {!signedIn && (
        <p className="rounded-xl bg-surface-raised px-3 py-2 text-xs">
          <a href="/login?next=/studio" className="font-semibold text-brand-strong hover:underline">
            Sign in
          </a>{" "}
          to bring songs in — they&apos;re kept in your library.
        </p>
      )}
      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
      {searching && (
        <div className="flex flex-col gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-raised" />
          ))}
        </div>
      )}
      {!searching && pages && (
        <section aria-label="Found" className="flex flex-col gap-1.5">
          <p dir="auto" className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted">
            {pages.length ? `Found for “${searchedFor}”` : `Nothing found for “${searchedFor}”`}
          </p>
          {pages.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {pages.map((p) => (
                <PageRow key={p.url} page={p} />
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted">Try the artist&apos;s name too, the title in Persian letters, or paste the song&apos;s link from any site.</p>
          )}
        </section>
      )}
    </div>
  );
}
