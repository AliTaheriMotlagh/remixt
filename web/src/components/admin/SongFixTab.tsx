"use client";

// Admin → Fix songs: songs whose name, artist, cover or lyrics are most
// likely wrong (reported by listeners first, then the most doubtful), each
// with suggestions gathered from the same searches the Studio uses — the
// artist and title Apple's catalogue knows it by, its cover, the lyrics
// library's best match — to approve in one click, or fix by hand.

import { useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, Flag, ImageOff, Loader2, Search, Sparkles, Upload, X } from "lucide-react";
import { stemCoverUrl } from "@/lib/cover";
import { splitSongTitle } from "@/lib/lyrics";
import type { FixRow } from "@/lib/songFixes";

type Found = {
  name: string | null;
  cover: { url: string; title: string; artist: string } | null;
  lyrics: { id: number; title: string; artist: string; duration: number | null; synced: string | null; plain: string | null; instrumental: boolean }[];
  sure: boolean;
};
type RemixReport = { id: string; item_id: string; title: string; fields: string[]; suggestion: string; created_at: string; reporter: string | null };

async function post(body: unknown) {
  const res = await fetch("/api/admin/songfix", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(d.error ?? "Failed");
}

/** The suggestions for one song: the catalogue's name and cover, and lyrics that fit its length. */
async function suggestionsFor(row: FixRow): Promise<Found> {
  const { song, artist } = splitSongTitle(row.suggestedName);
  const coverQ = new URLSearchParams({ title: song || row.suggestedName, artist });
  const lyricsQ = new URLSearchParams({ track: song || row.suggestedName, ...(artist ? { artist } : {}), ...(row.duration ? { duration: String(Math.round(row.duration)) } : {}) });
  const [cover, lyrics] = await Promise.all([
    fetch(`/api/covers/search?${coverQ}`).then((r) => (r.status === 200 ? r.json() : null)).catch(() => null),
    fetch(`/api/lyrics/search?${lyricsQ}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  const c = cover as Found["cover"];
  return {
    // The catalogue's own spelling of the song is the best name there is.
    name: c ? `${c.artist} - ${c.title}` : null,
    cover: c,
    lyrics: ((lyrics as { results?: Found["lyrics"] } | null)?.results ?? []).slice(0, 6),
    sure: !!(lyrics as { sure?: boolean } | null)?.sure,
  };
}

export default function SongFixTab() {
  const [only, setOnly] = useState<"doubtful" | "reported" | "all">("doubtful");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<FixRow[] | null>(null);
  const [remixes, setRemixes] = useState<RemixReport[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/admin/songfix?${new URLSearchParams({ only, q })}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { songs: FixRow[]; remixes: RemixReport[] }) => {
        setRows(d.songs);
        setRemixes(d.remixes);
      })
      .catch(() => setError("Couldn't load"));
  }, [only, q]);
  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Songs with a wrong name, artist, cover or lyrics, the most likely first: reported by listeners (&ldquo;Wrong info?&rdquo;), then names that look
        like file names, no artist, no cover, no lyrics. Open one for suggestions; &ldquo;Looks right&rdquo; drops it down the list.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {(["doubtful", "reported", "all"] as const).map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => setOnly(o)}
            className={`rounded-full px-3 py-1.5 text-sm ${only === o ? "bg-brand text-white" : "border border-border text-muted"}`}
          >
            {o === "doubtful" ? "Doubtful" : o === "reported" ? "Reported" : "All"}
          </button>
        ))}
        <label className="relative ms-auto">
          <Search className="pointer-events-none absolute start-2.5 top-2.5 h-4 w-4 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a song" className="input ps-8" dir="auto" />
        </label>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}

      {remixes.length > 0 && (
        <section className="rounded-2xl border border-drums/40 bg-drums/5 p-3">
          <h3 className="text-sm font-semibold">Reports about remixes</h3>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {remixes.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <a href={`/remixes/${r.item_id}`} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                  {r.title}
                </a>
                <span className="text-xs text-muted">
                  {r.fields.join(", ")} · {r.reporter ?? "a visitor"}
                </span>
                {r.suggestion && <span className="w-full text-muted">“{r.suggestion}”</span>}
                <button type="button" onClick={() => post({ action: "reports", ids: [r.id], status: "done" }).then(load)} className="text-xs text-success hover:underline">
                  Done
                </button>
                <button type="button" onClick={() => post({ action: "reports", ids: [r.id], status: "dismissed" }).then(load)} className="text-xs text-muted hover:underline">
                  Dismiss
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!rows ? (
        <div className="h-40 animate-pulse rounded-2xl bg-surface" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">Nothing to fix here.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-2xl border border-border bg-surface">
              <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} className="flex w-full items-center gap-3 p-3 text-start">
                <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-surface-raised">
                  {r.hasCover && r.coverStem && (
                    // eslint-disable-next-line @next/next/no-img-element -- our own cover route
                    <img src={stemCoverUrl(r.coverStem)} alt="" className="h-full w-full object-cover" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium" dir="auto">
                    {r.title}
                  </span>
                  <span className="flex flex-wrap gap-1 text-[11px]">
                    {r.reports.length > 0 && (
                      <span className="inline-flex items-center gap-1 rounded bg-danger/15 px-1.5 text-danger">
                        <Flag className="h-3 w-3" /> {r.reports.length}
                      </span>
                    )}
                    {r.doubts.filter((d) => !/report/.test(d)).map((d) => (
                      <span key={d} className="rounded bg-surface-raised px-1.5 text-muted">
                        {d}
                      </span>
                    ))}
                    <span className="text-muted">
                      · by {r.owner} · in {r.usedIn} remixes
                    </span>
                  </span>
                </span>
              </button>
              {open === r.id && <FixPanel row={r} onChanged={load} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FixPanel({ row, onChanged }: { row: FixRow; onChanged: () => void }) {
  const [found, setFound] = useState<Found | null>(null);
  const [name, setName] = useState(row.suggestedName);
  const [lyrics, setLyrics] = useState<{ lrc: string; song: string } | null>(null);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    suggestionsFor(row).then((f) => {
      if (gone) return;
      setFound(f);
      if (f.name) setName(f.name);
      const best = f.lyrics.find((l) => l.synced) ?? f.lyrics[0];
      if (best && !row.hasLyrics) setLyrics({ lrc: best.synced ?? best.plain ?? "", song: `${best.artist} - ${best.title}` });
    });
    return () => {
      gone = true;
    };
  }, [row]);

  async function run(label: string, steps: (() => Promise<void>)[]) {
    setBusy(label);
    setNote(null);
    try {
      for (const step of steps) await step();
      setNote("Done.");
      onChanged();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  const rename = () => post({ action: "rename", id: row.id, title: name.trim() });
  const useCover = () => post({ action: "cover-url", id: row.id, url: found!.cover!.url });
  const applyLyrics = (l: { lrc: string; song: string }) => post({ action: "lyrics", id: row.id, lrc: l.lrc, song: l.song, noWords: false });
  const all: (() => Promise<void>)[] = [];
  if (name.trim() && name.trim() !== row.title) all.push(rename);
  if (found?.cover) all.push(useCover);
  if (lyrics?.lrc) all.push(() => applyLyrics(lyrics));

  async function upload(file: File) {
    const res = await fetch(`/api/admin/songfix/${row.id}/cover`, { method: "PUT", body: file });
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Upload failed");
  }

  return (
    <div className="grid gap-4 border-t border-border p-3 text-sm lg:grid-cols-3">
      {row.reports.length > 0 && (
        <div className="lg:col-span-3">
          <p className="font-semibold">Reports</p>
          <ul className="mt-1 flex flex-col gap-1">
            {row.reports.map((rep) => (
              <li key={rep.id} className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-danger/10 px-1.5 text-xs">{rep.fields.join(", ")}</span>
                <span dir="auto">{rep.suggestion ? `“${rep.suggestion}”` : <span className="text-muted">no suggestion</span>}</span>
                <span className="text-xs text-muted">— {rep.reporter ?? "a visitor"}</span>
                <button type="button" onClick={() => post({ action: "reports", ids: [rep.id], status: "dismissed" }).then(onChanged)} className="text-xs text-muted hover:underline">
                  Dismiss
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="font-semibold">Name — “Artist - Song”</p>
        <input value={name} onChange={(e) => setName(e.target.value)} className="input mt-1 w-full" dir="auto" />
        {found?.name && <p className="mt-1 text-xs text-muted">Apple Music knows it as “{found.name}”.</p>}
        <button type="button" disabled={!!busy || !name.trim() || name.trim() === row.title} onClick={() => run("name", [rename])} className="mt-2 rounded-lg border border-border px-3 py-1 text-xs font-semibold disabled:opacity-40">
          Rename
        </button>
      </div>

      <div>
        <p className="font-semibold">Cover</p>
        {!found ? (
          <p className="mt-1 flex items-center gap-1 text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Looking…
          </p>
        ) : found.cover ? (
          <div className="mt-1 flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- Apple's catalogue picture */}
            <img src={found.cover.url} alt="" className="h-16 w-16 rounded-lg object-cover" />
            <div className="min-w-0 text-xs">
              <p className="truncate">{found.cover.title}</p>
              <p className="truncate text-muted">{found.cover.artist}</p>
              <button type="button" disabled={!!busy} onClick={() => run("cover", [useCover])} className="mt-1 rounded-lg border border-border px-2 py-0.5 font-semibold">
                Use this cover
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-1 text-muted">No cover found surely of this song.</p>
        )}
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-border px-2 py-1">
            <Upload className="h-3.5 w-3.5" /> Upload
            <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={(e) => e.target.files?.[0] && run("cover", [() => upload(e.target.files![0])])} />
          </label>
          {row.hasCover && (
            <button type="button" onClick={() => run("cover", [() => post({ action: "cover-remove", id: row.id })])} className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1">
              <ImageOff className="h-3.5 w-3.5" /> Remove (wrong)
            </button>
          )}
        </div>
      </div>

      <div>
        <p className="font-semibold">Lyrics {row.hasLyrics && <span className="text-xs font-normal text-success">— chosen already</span>}</p>
        {!found ? (
          <p className="mt-1 text-muted">…</p>
        ) : found.lyrics.length === 0 ? (
          <p className="mt-1 text-muted">None found in the lyrics library.</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1">
            {found.lyrics.map((l) => {
              const picked = lyrics?.song === `${l.artist} - ${l.title}` && lyrics.lrc === (l.synced ?? l.plain ?? "");
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => setLyrics({ lrc: l.synced ?? l.plain ?? "", song: `${l.artist} - ${l.title}` })}
                    className={`w-full rounded-lg border px-2 py-1 text-start text-xs ${picked ? "border-brand bg-brand/10" : "border-border"}`}
                  >
                    <span className="block truncate" dir="auto">
                      {l.artist} - {l.title}
                    </span>
                    <span className="text-muted">
                      {l.synced ? "timed" : l.instrumental ? "instrumental" : "words only"}
                      {l.duration ? ` · ${Math.floor(l.duration / 60)}:${String(Math.round(l.duration % 60)).padStart(2, "0")}` : ""}
                      {row.duration && l.duration && Math.abs(l.duration - row.duration) <= 4 ? " · same length ✓" : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={2} placeholder="…or paste the lyrics (LRC or plain)" className="input mt-2 w-full text-xs" dir="auto" />
        <div className="mt-1 flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            disabled={!!busy || (!lyrics?.lrc && !paste.trim())}
            onClick={() => run("lyrics", [() => applyLyrics(paste.trim() ? { lrc: paste.trim(), song: name } : lyrics!)])}
            className="rounded-lg border border-border px-2 py-1 font-semibold disabled:opacity-40"
          >
            Use these lyrics
          </button>
          <button type="button" onClick={() => run("lyrics", [() => post({ action: "lyrics", id: row.id, lrc: "", song: name, noWords: true })])} className="rounded-lg border border-border px-2 py-1">
            It has no words
          </button>
          <a
            href={`https://www.google.com/search?q=${encodeURIComponent(`${name} lyrics`)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1"
          >
            Search the web <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 lg:col-span-3">
        <button
          type="button"
          disabled={!!busy || all.length === 0}
          onClick={() => run("all", all)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 font-semibold text-white disabled:opacity-40"
        >
          {busy === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Approve all suggestions ({all.length})
        </button>
        <button type="button" disabled={!!busy} onClick={() => run("checked", [() => post({ action: "checked", id: row.id })])} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5">
          <Check className="h-4 w-4" /> Looks right
        </button>
        {busy && busy !== "all" && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
        {note && (
          <span className="inline-flex items-center gap-1 text-xs">
            {note === "Done." ? <Check className="h-3.5 w-3.5 text-success" /> : <X className="h-3.5 w-3.5 text-danger" />} {note}
          </span>
        )}
      </div>
    </div>
  );
}
