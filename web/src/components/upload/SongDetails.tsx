"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ImagePlus, Loader2, X } from "lucide-react";
import { squareCover } from "@/lib/client/coverImage";

// Upload → a song → Details: everything a listener sees about the song,
// filled in by its uploader — the name, who made it, album, year, genre,
// the artwork and the lyrics. Lyrics saved here are the song's words for
// everyone (the radio, the Studio's lyrics, clip videos): plain text, or
// LRC with [mm:ss.xx] times when they're timed.

type Details = { title: string; songArtist: string; album: string; year: string; genre: string; lyrics: string };

const GENRES = ["Pop", "Hip-hop", "Rap", "R&B", "Rock", "Electronic", "House", "Techno", "Lo-fi", "Jazz", "Classical", "Folk", "Persian pop", "Persian rap", "Traditional", "Other"];

export default function SongDetails({ trackId, stemId, onClose, onSaved }: { trackId: string; stemId?: string; onClose: () => void; onSaved: (title: string) => void }) {
  const [d, setD] = useState<Details | null>(null);
  const [initialLyrics, setInitialLyrics] = useState("");
  const [cover, setCover] = useState<{ blob: Blob; url: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    void Promise.all([
      fetch(`/api/tracks/${trackId}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/lyrics/choice?kind=track&id=${encodeURIComponent(trackId)}`).then((r) => (r.ok ? r.json() : null)),
    ]).then(([t, l]) => {
      if (!live) return;
      const track = t?.track ?? {};
      const lrc: string = l?.choice && !l.choice.noWords ? l.choice.lrc : "";
      setInitialLyrics(lrc);
      setD({
        title: track.title ?? "",
        songArtist: track.song_artist ?? "",
        album: track.album ?? "",
        year: track.release_year ? String(track.release_year) : "",
        genre: track.genre ?? "",
        lyrics: lrc,
      });
    });
    return () => {
      live = false;
    };
  }, [trackId]);

  useEffect(() => () => void (cover && URL.revokeObjectURL(cover.url)), [cover]);

  const set = (patch: Partial<Details>) => {
    setSaved(false);
    setD((v) => (v ? { ...v, ...patch } : v));
  };

  const pickCover = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const blob = await squareCover(file, 1000);
      setCover({ blob, url: URL.createObjectURL(blob) });
      setSaved(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that picture");
    }
  };

  const save = async () => {
    if (!d) return;
    const year = d.year.trim() ? Number(d.year) : null;
    if (year !== null && (!Number.isInteger(year) || year < 1900 || year > 2100)) return setError("The year is four digits, like 2024");
    if (!d.title.trim()) return setError("The song needs a name");
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/tracks/${trackId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: d.title.trim(), songArtist: d.songArtist, album: d.album, genre: d.genre, year }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Couldn't save the details");
      if (cover) {
        const c = await fetch(`/api/tracks/${trackId}/cover`, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: cover.blob });
        if (!c.ok) throw new Error((await c.json().catch(() => null))?.error ?? "Couldn't save the artwork");
      }
      if (d.lyrics.trim() !== initialLyrics.trim()) {
        const l = d.lyrics.trim()
          ? await fetch("/api/lyrics/choice", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ kind: "track", id: trackId, lrc: d.lyrics.trim(), shift: 0, noWords: false, song: d.title.trim() }),
            })
          : await fetch(`/api/lyrics/choice?kind=track&id=${encodeURIComponent(trackId)}`, { method: "DELETE" });
        if (!l.ok) throw new Error((await l.json().catch(() => null))?.error ?? "Couldn't save the lyrics");
        setInitialLyrics(d.lyrics.trim());
      }
      setSaved(true);
      onSaved(d.title.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save — check your connection");
    } finally {
      setSaving(false);
    }
  };

  if (!d)
    return (
      <p className="mt-3 flex items-center gap-2 text-xs text-muted" role="status">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading the details…
      </p>
    );

  const field = "input w-full";
  const art = cover?.url ?? (stemId ? `/api/stems/${stemId}/cover` : null);
  return (
    <section aria-label="Song details" className="mt-3 flex flex-col gap-3 rounded-xl border border-border bg-background/40 p-3">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => picker.current?.click()}
          className="group relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-surface-raised text-muted hover:border-brand"
          aria-label="Choose the artwork"
        >
          {art ? (
            // eslint-disable-next-line @next/next/no-img-element -- the song's own cover, or the picture just picked
            <img src={art} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
          ) : null}
          <span className="relative flex flex-col items-center gap-1 rounded-lg bg-background/70 px-1.5 py-1 text-[10px] font-semibold opacity-90 group-hover:opacity-100">
            <ImagePlus className="h-4 w-4" /> Artwork
          </span>
        </button>
        <input ref={picker} type="file" accept="image/*" hidden onChange={(e) => void pickCover(e.target.files?.[0])} />
        <div className="grid min-w-0 flex-1 gap-2">
          <label className="grid gap-1 text-xs text-muted">
            Song name
            <input className={field} value={d.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} />
          </label>
          <label className="grid gap-1 text-xs text-muted">
            Artist (who sings or made it)
            <input className={field} value={d.songArtist} maxLength={120} placeholder="e.g. Hichkas" onChange={(e) => set({ songArtist: e.target.value })} />
          </label>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="grid gap-1 text-xs text-muted">
          Album
          <input className={field} value={d.album} maxLength={120} onChange={(e) => set({ album: e.target.value })} />
        </label>
        <label className="grid gap-1 text-xs text-muted">
          Year
          <input className={field} value={d.year} inputMode="numeric" maxLength={4} placeholder="2024" onChange={(e) => set({ year: e.target.value.replace(/\D/g, "") })} />
        </label>
        <label className="grid gap-1 text-xs text-muted">
          Genre
          <input className={field} value={d.genre} maxLength={60} list="song-genres" onChange={(e) => set({ genre: e.target.value })} />
          <datalist id="song-genres">
            {GENRES.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </label>
      </div>
      <label className="grid gap-1 text-xs text-muted">
        Lyrics — plain words, or timed lines like <code className="text-foreground">[00:12.50] first line</code>
        <textarea
          className={`${field} min-h-32 font-normal leading-relaxed`}
          dir="auto"
          value={d.lyrics}
          maxLength={60_000}
          onChange={(e) => set({ lyrics: e.target.value })}
          placeholder={"Paste the words here.\nThey show on the radio, in the Studio and on clip videos."}
        />
      </label>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
          {saving ? "Saving…" : saved ? "Saved" : "Save details"}
        </button>
        <button type="button" onClick={onClose} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-sm text-muted hover:text-foreground">
          <X className="h-4 w-4" /> Close
        </button>
      </div>
    </section>
  );
}
