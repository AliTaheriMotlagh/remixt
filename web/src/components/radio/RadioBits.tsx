"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, Clock3, Disc3, Hand, ListMusic, Loader2, Music2, Radio, Search, Sparkles, ThumbsUp, Upload, Users, Vote, X } from "lucide-react";
import { audioEngine } from "@/lib/client/audioEngine";
import { clock, searchStation, type RadioFeed } from "@/lib/client/radioClient";
import type { QueueRow } from "@/lib/radio";
import type { RadioItem } from "@/lib/radioPick";
import { songArtUrl, songBackdrop, songDiscUrl } from "@/lib/songArt";

// The radio's pieces, shared by the station page, its console, the embed
// and the broadcast view.

/**
 * A song's picture: its cover, else one drawn from its title (never a
 * broken image) — a record in the song's colours with its first letter.
 * `spin` (the big one on air): the record turns while the radio plays,
 * over a still background.
 */
export const RadioArt = memo(function RadioArt({
  item,
  className = "size-12 rounded-lg",
  spin,
}: {
  item: Pick<RadioItem, "title" | "artist" | "cover"> | null;
  className?: string;
  spin?: boolean;
}) {
  const title = item?.title ?? "Remixt Radio";
  const artist = item?.artist ?? "";
  const drawn = useMemo(() => songArtUrl({ title, artist }), [title, artist]);
  const [failed, setFailed] = useState<string | null>(null);
  const hasCover = !!item?.cover && failed !== item.cover;
  if (!hasCover && spin !== undefined) {
    return (
      <div className={`${className} relative shrink-0 overflow-hidden`} style={{ background: songBackdrop(title, artist) }} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element -- a data URL */}
        <img
          src={songDiscUrl({ title, artist })}
          alt=""
          className={`absolute inset-[7%] size-[86%] drop-shadow-2xl ${spin ? "animate-[spin_7s_linear_infinite] motion-reduce:animate-none" : ""}`}
        />
        {/* The light on the record stays still while it turns. */}
        <div className="pointer-events-none absolute inset-[7%] rounded-full bg-[conic-gradient(from_200deg,transparent_0deg,rgba(255,255,255,0.14)_40deg,transparent_90deg,transparent_200deg,rgba(255,255,255,0.08)_240deg,transparent_290deg)]" />
      </div>
    );
  }
  const src = hasCover ? item!.cover! : drawn;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- our own small cover routes, or a data URL
    <img
      src={src}
      alt=""
      aria-hidden
      className={`${className} shrink-0 bg-surface-raised object-cover`}
      onError={() => item?.cover && setFailed(item.cover)}
      onLoad={(e) => {
        // The stem cover route answers 204 (no picture) with an empty image.
        if (item?.cover && src === item.cover && e.currentTarget.naturalWidth === 0) setFailed(item.cover);
      }}
    />
  );
});

/** A red dot that breathes, and the word. */
export function LiveDot({ label = "On air", className = "" }: { label?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.18em] ${className}`}>
      <span className="relative flex size-2.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-danger opacity-60 motion-reduce:animate-none" />
        <span className="relative inline-flex size-2.5 rounded-full bg-danger" />
      </span>
      {label}
    </span>
  );
}

const SOURCE: Record<string, { icon: typeof Vote; text: (row: QueueRow) => string }> = {
  vote: { icon: Vote, text: (r) => (r.votes ? `Voted in by ${r.votes} listener${r.votes === 1 ? "" : "s"}` : "The vote's pick") },
  request: { icon: Hand, text: (r) => (r.requestedBy ? `Requested by ${r.requestedBy}` : "A listener's request") },
  dj: { icon: Disc3, text: () => "Picked by the DJ" },
  playlist: { icon: ListMusic, text: () => "From the playlist" },
  library: { icon: Sparkles, text: () => "Picked by the station" },
};

/** Why this song is on: voted in, requested, the DJ, the playlist. */
export function SourceChip({ row, className = "" }: { row: QueueRow; className?: string }) {
  const s = SOURCE[row.source] ?? SOURCE.library;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 ring-1 ring-white/15 backdrop-blur ${className}`}>
      <Icon className="size-3.5" /> {s.text(row)}
    </span>
  );
}

/** The song's progress on the station's clock, drawn every frame (no React render per frame). */
export function Progress({ row, position, light = true, big = false }: { row: QueueRow | null; position: () => number; light?: boolean; big?: boolean }) {
  const bar = useRef<HTMLDivElement>(null);
  const at = useRef<HTMLSpanElement>(null);
  const left = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const p = row ? position() : 0;
      const d = row?.duration ?? 0;
      if (bar.current) bar.current.style.transform = `scaleX(${d ? Math.min(1, p / d) : 0})`;
      if (at.current) at.current.textContent = clock(p);
      if (left.current) left.current.textContent = `−${clock(d - p)}`;
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [row, position]);
  return (
    <div className="w-full">
      <div className={`relative overflow-hidden rounded-full ${big ? "h-2.5" : "h-1.5"} ${light ? "bg-white/15" : "bg-surface-raised"}`} role="progressbar" aria-label="Song progress">
        <div ref={bar} className="absolute inset-0 origin-left rounded-full bg-gradient-to-r from-brand via-vocals to-beat" style={{ transform: "scaleX(0)" }} />
      </div>
      <div className={`mt-1.5 flex justify-between font-mono tabular-nums ${big ? "text-base" : "text-[11px]"} ${light ? "text-white/70" : "text-muted"}`}>
        <span ref={at}>0:00</span>
        <span ref={left} />
      </div>
    </div>
  );
}

/**
 * The music as moving light: the engine's spectrum while tuned in, a slow
 * idle wave otherwise. Mirrored bars, brand gradient; still for anyone who
 * asks for less motion.
 */
export function Visualizer({
  live,
  className = "h-24 w-full",
  bars = 64,
  analyser: source = () => audioEngine.getAnalyser(),
  levels,
}: {
  live: boolean;
  className?: string;
  bars?: number;
  /** Where the sound is read from (the radio's decks; the Studio's engine by default). */
  analyser?: () => AnalyserNode | null;
  /** The bars themselves (0–1), worked out by the caller in time with what's heard (the radio): before `analyser`. */
  levels?: (bars: number) => ArrayLike<number> | null;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let data: Uint8Array<ArrayBuffer> | null = null;
    const shown = new Float32Array(bars);
    let drawnAt = 0;
    const draw = (t: number) => {
      // 30 frames a second is plenty for bars: half the work (and battery) of the screen's rate.
      if (t - drawnAt < 30) {
        raf = requestAnimationFrame(draw);
        return;
      }
      drawnAt = t;
      // Sized only when the box changes: setting a canvas's size every frame reallocates it (and measures the page).
      const w = Math.round(el.clientWidth * devicePixelRatio);
      const h = Math.round(el.clientHeight * devicePixelRatio);
      if (el.width !== w) el.width = w;
      if (el.height !== h) el.height = h;
      ctx.clearRect(0, 0, w, h);
      const given = live && levels ? levels(bars) : null;
      const analyser = live && !given ? source() : null;
      if (analyser) {
        if (!data || data.length !== analyser.frequencyBinCount) data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
      }
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, "#8b5cf6");
      grad.addColorStop(0.5, "#ec4899");
      grad.addColorStop(1, "#06b6d4");
      ctx.fillStyle = grad;
      const gap = Math.max(1, (w / bars) * 0.28);
      const bw = w / bars - gap;
      // Hidden (no width yet, a closed panel): a bar would have a negative width, and roundRect throws on its radius.
      for (let i = 0; i < bars && bw > 0 && h > 0; i++) {
        let target: number;
        if (given) target = given[i] ?? 0;
        else if (data) {
          // Log-spaced bins: the bass gets as much room as the treble.
          const lo = Math.floor(Math.pow(data.length * 0.7, i / bars));
          const hi = Math.max(lo + 1, Math.floor(Math.pow(data.length * 0.7, (i + 1) / bars)));
          let peak = 0;
          for (let b = lo; b < hi && b < data.length; b++) peak = Math.max(peak, data[b]);
          target = peak / 255;
        } else target = still ? 0.12 : 0.1 + 0.08 * (1 + Math.sin(t / 900 + i * 0.35)) * (1 + Math.sin(t / 1700 + i * 0.11));
        // Up at once, down a little slower (a beat's bar falls rather than blinks).
        shown[i] += (target - shown[i]) * (target > shown[i] ? 0.7 : given ? 0.3 : 0.2);
        const bh = Math.max(2 * devicePixelRatio, shown[i] * h * 0.95);
        const x = i * (bw + gap) + gap / 2;
        ctx.globalAlpha = 0.35 + shown[i] * 0.65;
        ctx.beginPath();
        ctx.roundRect(x, (h - bh) / 2, bw, bh, Math.max(0, Math.min(bw, bh) / 2));
        ctx.fill();
      }
      if (!still || data || given) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [live, bars, source, levels]);
  return <canvas ref={canvas} className={className} aria-hidden />;
}

/** "in 2:31" until the song ends (the vote closes then). */
export function Countdown({ endsAt, serverNow }: { endsAt: number | null; serverNow: () => number }) {
  const el = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const tick = () => {
      if (el.current) el.current.textContent = endsAt ? clock((endsAt - serverNow()) / 1000) : "–";
    };
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [endsAt, serverNow]);
  return <span ref={el} className="font-mono tabular-nums" />;
}

/** The vote on what plays next: each choice with its share, yours lit. */
export function VoteBoard({
  feed,
  onVote,
  serverNow,
  compact = false,
}: {
  feed: RadioFeed;
  onVote?: (item: RadioItem) => Promise<unknown>;
  serverNow: () => number;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { choices, mine, total } = feed.vote;
  const leader = Math.max(0, ...choices.map((c) => c.votes));
  if (!choices.length) return null;
  return (
    <div>
      {!compact && (
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Vote className="size-5 text-brand-strong" /> What plays next?
            </h2>
            <p className="text-sm text-muted">
              {total ? `${total} vote${total === 1 ? "" : "s"} so far` : "Be the first to vote"} · closes in <Countdown endsAt={feed.now?.endsAt ?? null} serverNow={serverNow} />
            </p>
          </div>
        </div>
      )}
      <ul className="grid grid-cols-1 gap-2">
        {choices.map((c) => {
          const key = `${c.kind}:${c.id}`;
          const share = total ? c.votes / total : 0;
          const picked = mine === key;
          const leading = c.votes > 0 && c.votes === leader;
          return (
            <li key={key} className="min-w-0">
              <button
                type="button"
                disabled={!onVote || busy !== null}
                aria-pressed={picked}
                onClick={async () => {
                  if (!onVote) return;
                  setBusy(key);
                  setError(null);
                  try {
                    await onVote(c);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Couldn't vote");
                  } finally {
                    setBusy(null);
                  }
                }}
                className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border p-2.5 text-left transition ${
                  picked ? "border-brand bg-brand/15 ring-2 ring-brand/60" : "border-border bg-surface hover:border-brand/50 hover:bg-surface-hover"
                } ${onVote ? "" : "cursor-default"}`}
              >
                <span className="absolute inset-y-0 left-0 bg-gradient-to-r from-brand/25 to-vocals/10 transition-[width] duration-700 ease-out" style={{ width: `${share * 100}%` }} aria-hidden />
                <RadioArt item={c} className="relative size-14 rounded-xl" />
                <span className="relative min-w-0 flex-1">
                  <span className="block truncate font-semibold">{c.title}</span>
                  <span className="block truncate text-xs text-muted">
                    {c.artist} · {c.kind === "remix" ? "Remix" : "Song"} · {clock(c.duration)}
                  </span>
                </span>
                <span className="relative flex shrink-0 flex-col items-end">
                  <span className="text-lg font-black tabular-nums">{Math.round(share * 100)}%</span>
                  <span className="flex items-center gap-1 text-[11px] text-muted">
                    {busy === key ? <Loader2 className="size-3 animate-spin" /> : picked ? <Check className="size-3 text-success" /> : leading ? <ThumbsUp className="size-3 text-drums" /> : null}
                    {c.votes} vote{c.votes === 1 ? "" : "s"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}

/** A row of a song list (history, queue, requests, search). */
export function ItemRow({ item, meta, children }: { item: RadioItem; meta?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <li className="flex min-h-14 items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-surface-hover">
      <RadioArt item={item} className="size-11 rounded-lg" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{item.title}</span>
        <span className="block truncate text-xs text-muted">
          {item.artist}
          {meta ? <> · {meta}</> : null}
        </span>
      </span>
      {children && <span className="flex shrink-0 items-center gap-1">{children}</span>}
    </li>
  );
}

/** Searching what the station can play (songs and remixes), debounced. */
export function useStationSearch(slug: string, q: string) {
  const [items, setItems] = useState<RadioItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const found = await searchStation(slug, q);
        if (!cancelled) setItems(found);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [slug, q]);
  return { items, busy };
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface-raised px-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/30">
      <Search className="size-4 shrink-0 text-muted" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted sm:text-sm"
      />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="Clear the search" className="rounded p-1 text-muted hover:text-foreground">
          <X className="size-4" />
        </button>
      )}
    </label>
  );
}

const NAME_KEY = "remixt.radio.name";

/** Asking for a song: search, pick, (a name for guests), send. Your requests and everyone's, with how many asked. */
export function RequestPanel({
  slug,
  feed,
  onRequest,
  onWithdraw,
  signedIn,
}: {
  slug: string;
  feed: RadioFeed;
  onRequest: (item: RadioItem, name: string, message: string) => Promise<{ status?: string }>;
  onWithdraw: (item: RadioItem) => Promise<unknown>;
  signedIn: boolean;
}) {
  const [q, setQ] = useState("");
  const { items, busy } = useStationSearch(slug, q);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [note, setNote] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a remembered name, read once on the client
      setName(localStorage.getItem(NAME_KEY) ?? "");
    } catch {
      // not remembered
    }
  }, []);
  const mode = feed.station.settings.requests;
  const asked = new Set(feed.requests.map((r) => `${r.kind}:${r.id}`));
  const playing = feed.now ? `${feed.now.kind}:${feed.now.id}` : null;

  const send = async (item: RadioItem) => {
    const key = `${item.kind}:${item.id}`;
    setSending(key);
    setNote(null);
    try {
      if (!signedIn && name) localStorage.setItem(NAME_KEY, name);
    } catch {
      // not remembered
    }
    try {
      const r = await onRequest(item, name, message);
      setMessage("");
      setNote({ tone: "good", text: r.status === "pending" ? `Sent — “${item.title}” waits for the DJ to say yes.` : `“${item.title}” is in. The more listeners ask for it, the sooner it plays.` });
    } catch (e) {
      setNote({ tone: "bad", text: e instanceof Error ? e.message : "Couldn't send the request" });
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Hand className="size-5 text-vocals" /> Request a song
        </h2>
        <p className="text-sm text-muted">
          {mode === "off"
            ? "Requests are closed on this station right now."
            : mode === "review"
              ? "The DJ looks at every request first. Songs many listeners ask for go up the list."
              : "Songs many listeners ask for go up the list — and onto the vote."}
        </p>
      </div>
      {mode !== "off" && (
        <>
          <SearchBox value={q} onChange={setQ} placeholder="Search songs and remixes" />
          <div className="grid gap-2 sm:grid-cols-2">
            {!signedIn && (
              <input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 40))}
                placeholder="Your name (shown when it plays)"
                aria-label="Your name"
                className="min-h-11 rounded-xl border border-border bg-surface-raised px-3 text-base outline-none focus:border-brand sm:text-sm"
              />
            )}
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 140))}
              placeholder="A message for the DJ (optional)"
              aria-label="A message for the DJ"
              className={`min-h-11 rounded-xl border border-border bg-surface-raised px-3 text-base outline-none focus:border-brand sm:text-sm ${signedIn ? "sm:col-span-2" : ""}`}
            />
          </div>
          {note && <p className={`rounded-xl px-3 py-2 text-sm ${note.tone === "good" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>{note.text}</p>}
          <ul className="max-h-80 overflow-y-auto overscroll-contain rounded-xl border border-border/60 p-1" aria-busy={busy}>
            {items === null || (busy && !items.length) ? (
              <li className="flex items-center gap-2 p-3 text-sm text-muted">
                <Loader2 className="size-4 animate-spin" /> Searching…
              </li>
            ) : items.length === 0 ? (
              <li className="flex flex-col items-start gap-2 p-3 text-sm text-muted">
                <span>Nothing found{q ? ` for “${q}”` : ""}.</span>
                {q.trim() && <UploadInstead slug={slug} q={q} />}
              </li>
            ) : (
              items.map((item) => {
                const key = `${item.kind}:${item.id}`;
                const already = asked.has(key);
                return (
                  <ItemRow key={key} item={item} meta={`${item.kind === "remix" ? "Remix" : "Song"} · ${clock(item.duration)}`}>
                    {key === playing ? (
                      <span className="rounded-full bg-danger/15 px-2 py-1 text-[11px] font-bold text-danger">On air</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void send(item)}
                        disabled={sending !== null}
                        className={`flex min-h-10 items-center gap-1 rounded-lg px-3 text-xs font-bold disabled:opacity-60 ${already ? "border border-border hover:bg-surface-hover" : "bg-brand text-white hover:bg-brand-strong"}`}
                      >
                        {sending === key ? <Loader2 className="size-3.5 animate-spin" /> : <Hand className="size-3.5" />} {already ? "Me too" : "Request"}
                      </button>
                    )}
                  </ItemRow>
                );
              })
            )}
          </ul>
          {q.trim() && !!items?.length && (
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
              Not the one you meant? <UploadInstead slug={slug} q={q} />
            </p>
          )}
        </>
      )}
      {feed.requests.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-bold text-muted">Asked for</h3>
          <ul>
            {feed.requests.map((r) => (
              <ItemRow
                key={`${r.kind}:${r.id}`}
                item={r}
                meta={
                  <>
                    <Users className="inline size-3" /> {r.count} asked{r.names.length ? ` (${r.names.join(", ")})` : ""}
                    {r.status === "pending" ? " · waiting for the DJ" : ""}
                  </>
                }
              >
                {r.mine && (
                  <button type="button" onClick={() => void onWithdraw(r)} className="min-h-9 rounded-lg px-2 text-xs text-muted hover:bg-surface-raised hover:text-foreground" title="Take my request back">
                    Withdraw
                  </button>
                )}
              </ItemRow>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** "4 min ago". */
export function ago(ms: number, now: number) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return `${h} h ago`;
}

export function History({ rows, now }: { rows: QueueRow[]; now: number }) {
  if (!rows.length) return <p className="text-sm text-muted">Nothing has played yet.</p>;
  return (
    <ul>
      {rows.map((r) => (
        <ItemRow key={r.rowId} item={r} meta={<>{r.startsAt ? ago(r.startsAt, now) : ""}{r.status === "skipped" ? " · skipped" : ""}</>} />
      ))}
    </ul>
  );
}

export const Icons = { Radio, Music2, Clock3, Users };

/**
 * For a song the station doesn't have: upload it. The upload goes on in
 * the background (the page can be left), it joins the library once it's
 * split, and the link brings the listener back here to ask for it.
 */
export function UploadInstead({ slug, q }: { slug: string; q: string }) {
  const href = `/upload?title=${encodeURIComponent(q.trim().slice(0, 120))}&next=${encodeURIComponent(`/radio/${slug}`)}`;
  return (
    <Link href={href} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-semibold text-white hover:bg-brand-strong">
      <Upload className="size-4" /> Not here? Upload it
    </Link>
  );
}
