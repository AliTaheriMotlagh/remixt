"use client";

// The working tool at the top of each tool page: drop a song, it's split in
// this browser (never uploaded), and the page gives exactly what the tool is
// for — the instrumental, the acapella, the drums, every stem, or a mashup of
// two songs — to hear, mix (each part on or off, sample-accurate through Web
// Audio), and download. Which parts each tool gives: lib/toolWorkbench.ts.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Download, Loader2, Music, Pause, Play, RotateCcw, Send, Smartphone, Upload, Wand2 } from "lucide-react";
import Waveform from "@/components/Waveform";
import { splitSong, isConstrainedDevice, useSplitter, type UploadStage } from "@/lib/client/splitter";
import { encodeWavGently } from "@/lib/client/mixdown";
import { trackEvent } from "@/lib/client/analytics";
import { uploads } from "@/lib/client/uploads";
import { downloadName, mashupRate, PART_TEXT, shownParts, signInLinks, WB_TEXT, workbenchFor, workflowFor, type Part } from "@/lib/toolWorkbench";
import type { ToolLocale } from "@/lib/tools";

type Song = {
  file: File;
  stage: UploadStage | null;
  error: string | null;
  parts: Partial<Record<Part, { mp3: Uint8Array; peaks: number[]; buffer: AudioBuffer | null }>>;
  bpm: number | null;
  duration: number;
};

let sharedCtx: AudioContext | null = null;
function audioContext(): AudioContext {
  sharedCtx ??= new AudioContext();
  return sharedCtx;
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export default function ToolWorkbench({ slug, locale }: { slug: string; locale: ToolLocale }) {
  const w = workbenchFor(slug);
  const t = WB_TEXT[locale];
  const fa = locale === "fa";
  const [songs, setSongs] = useState<(Song | null)[]>(w.songs === 2 ? [null, null] : [null]);
  const [on, setOn] = useState<Set<Part>>(new Set(w.playing));
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [match, setMatch] = useState(true);
  const [offset, setOffset] = useState(0);
  const [rendering, setRendering] = useState(false);
  const voices = useRef<AudioBufferSourceNode[]>([]);
  const started = useRef<{ ctxTime: number; from: number } | null>(null);
  const splitterState = useSplitter();
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the device is only known in the browser
    setPhone(isConstrainedDevice());
  }, []);
  // On a phone: the split queue first (lib/toolWorkbench.ts workflowFor), which needs to know who's here.
  const [tryHere, setTryHere] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    if (!phone) return;
    let live = true;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => live && setSignedIn(!!d?.user))
      .catch(() => live && setSignedIn(false));
    return () => {
      live = false;
    };
  }, [phone]);
  const flow = workflowFor({ phone, tryHere, signedIn });

  const mashup = w.songs === 2;
  const ready = songs.every((s) => s && !s.stage && !s.error && Object.keys(s.parts).length > 0);
  // The parts heard: one song's chosen parts, or the mashup's vocal (song 1) over the beat (song 2).
  const lanes = useMemo(() => {
    if (!ready) return [];
    if (mashup) {
      const [a, b] = songs as Song[];
      const rate = match ? mashupRate(a.bpm, b.bpm) : 1;
      return [
        { part: "vocals" as Part, song: a, rate: 1, delay: Math.max(0, offset) },
        { part: "beat" as Part, song: b, rate, delay: Math.max(0, -offset) },
      ];
    }
    const s = songs[0]!;
    return shownParts(w, Object.keys(s.parts)).map((part) => ({ part, song: s, rate: 1, delay: 0 }));
  }, [ready, mashup, songs, match, offset, w]);
  const length = useMemo(() => Math.max(1, ...lanes.map((l) => l.delay + (l.song.parts[l.part]?.buffer?.duration ?? l.song.duration) / l.rate)), [lanes]);

  const stop = useCallback(() => {
    for (const v of voices.current) {
      try {
        v.stop();
      } catch {}
    }
    voices.current = [];
    if (started.current) setAt(started.current.from + (audioContext().currentTime - started.current.ctxTime));
    started.current = null;
    setPlaying(false);
  }, []);

  const play = useCallback(
    (from: number) => {
      const ctx = audioContext();
      void ctx.resume();
      for (const v of voices.current) {
        try {
          v.stop();
        } catch {}
      }
      voices.current = [];
      const when = ctx.currentTime + 0.05;
      for (const l of lanes) {
        const buffer = l.song.parts[l.part]?.buffer;
        if (!buffer || (!mashup && !on.has(l.part))) continue;
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.playbackRate.value = l.rate;
        src.connect(ctx.destination);
        const into = (from - l.delay) * l.rate;
        if (into >= buffer.duration) continue;
        if (into < 0) src.start(when - into / l.rate);
        else src.start(when, into);
        voices.current.push(src);
      }
      started.current = { ctxTime: when, from };
      setPlaying(true);
    },
    [lanes, on, mashup]
  );

  // The playhead, and the end.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const s = started.current;
      if (s) {
        const now = s.from + Math.max(0, audioContext().currentTime - s.ctxTime);
        setAt(now);
        if (now >= length) {
          stop();
          setAt(0);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, length, stop]);
  useEffect(() => () => stop(), [stop]);

  // A part switched on or off while playing: the mix changes at once, from where it is.
  const toggle = (p: Part) => {
    const next = new Set(on);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    setOn(next);
  };
  useEffect(() => {
    if (playing && started.current) play(started.current.from + (audioContext().currentTime - started.current.ctxTime));
    // Only when the parts on (or the mashup's settings) change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, match, offset]);

  async function take(index: number, file: File) {
    stop();
    setAt(0);
    const update = (patch: Partial<Song>) => setSongs((list) => list.map((s, i) => (i === index ? ({ ...(s as Song), ...patch } as Song) : s)));
    setSongs((list) => list.map((s, i) => (i === index ? { file, stage: { stage: "decoding" }, error: null, parts: {}, bpm: null, duration: 0 } : s)));
    trackEvent("upload", { tool: slug, local: true });
    try {
      const { result, duration } = await splitSong(file, (stage) => update({ stage }));
      const ctx = audioContext();
      const parts: Song["parts"] = {};
      for (const [part, mp3] of Object.entries(result.mp3) as [Part, Uint8Array][]) {
        const buffer = await ctx.decodeAudioData(mp3.slice().buffer).catch(() => null);
        parts[part] = { mp3, peaks: (result.peaks as Record<string, number[]>)[part] ?? [], buffer };
      }
      update({ stage: null, parts, bpm: result.bpm, duration });
    } catch (e) {
      // The splitter's own reasons are in English: a Persian page says it in Persian.
      update({ stage: null, error: e instanceof Error && !fa ? e.message : t.failed });
      if (fa) console.warn("split failed", e);
    }
  }

  async function downloadMix() {
    if (!lanes.length) return;
    setRendering(true);
    try {
      const rate = 44_100;
      const ctx = new OfflineAudioContext(2, Math.ceil(length * rate), rate);
      for (const l of lanes) {
        const buffer = l.song.parts[l.part]?.buffer;
        if (!buffer || (!mashup && !on.has(l.part))) continue;
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.playbackRate.value = l.rate;
        src.connect(ctx.destination);
        src.start(l.delay);
      }
      const blob = await encodeWavGently(await ctx.startRendering());
      const asFirst = !!w.mixName && on.size === w.playing.length && w.playing.every((p) => on.has(p));
      const what = mashup ? "Mashup" : asFirst ? w.mixName! : [...on].map((p) => PART_TEXT[p].en.split(" (")[0]).join(" + ");
      save(blob, downloadName(songs[0]!.file.name, what, "wav"));
      trackEvent("export", { tool: slug, what: "mix" });
    } finally {
      setRendering(false);
    }
  }

  const reset = () => {
    stop();
    setAt(0);
    setSongs(w.songs === 2 ? [null, null] : [null]);
    setOn(new Set(w.playing));
  };

  return (
    <div className="rounded-3xl border border-border bg-surface/80 p-4 shadow-2xl shadow-black/30 backdrop-blur sm:p-6" dir={fa ? "rtl" : undefined}>
      {flow === "here" ? (
        <>
          <div className={`grid gap-3 ${mashup ? "sm:grid-cols-2" : ""}`}>
            {songs.map((s, i) => (
              <SongSlot
                key={i}
                label={mashup ? (i === 0 ? t.dropA : t.dropB) : t.drop}
                song={s}
                t={t}
                model={splitterState}
                onFile={(f) => take(i, f)}
              />
            ))}
          </div>
          {phone && !ready && <p className="mt-3 text-xs text-muted">{t.phone}</p>}
        </>
      ) : (
        <PhoneQueue slug={slug} t={t} mashup={mashup} signedIn={signedIn} onTryHere={() => setTryHere(true)} />
      )}

      {ready && (
        <div className="mt-5">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => (playing ? stop() : play(at >= length ? 0 : at))}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-white shadow-[0_0_24px_-6px_var(--brand)] transition-transform active:scale-95"
              aria-label={playing ? t.pause : t.play}
            >
              {playing ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
            </button>
            <span className="font-mono text-sm tabular-nums text-muted">
              {fmt(at)} / {fmt(length)}
            </span>
            <span className="ms-auto flex flex-wrap gap-2">
              <button type="button" onClick={downloadMix} disabled={rendering} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-sm font-semibold hover:bg-surface-hover disabled:opacity-50">
                {rendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} {rendering ? t.rendering : t.downloadMix}
              </button>
              <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-sm hover:bg-surface-hover">
                <RotateCcw className="h-4 w-4" /> {t.again}
              </button>
            </span>
          </div>

          {mashup && (
            <div className="mt-4 flex flex-wrap items-center gap-4 rounded-2xl border border-border p-3 text-sm">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={match} onChange={(e) => setMatch(e.target.checked)} className="accent-[var(--brand)]" />
                {t.matchTempo}
                {match && songs[0]?.bpm && songs[1]?.bpm ? (
                  <span className="text-xs text-muted">
                    ({Math.round(songs[1]!.bpm!)} → {Math.round(songs[1]!.bpm! * mashupRate(songs[0]!.bpm, songs[1]!.bpm))} BPM)
                  </span>
                ) : null}
              </label>
              <label className="inline-flex flex-1 items-center gap-2">
                {t.offset}
                <input type="range" min={-8} max={8} step={0.05} value={offset} onChange={(e) => setOffset(Number(e.target.value))} className="flex-1 accent-[var(--brand)]" />
                <span className="w-14 font-mono text-xs tabular-nums">{offset > 0 ? "+" : ""}{offset.toFixed(2)}s</span>
              </label>
            </div>
          )}

          <ul className="mt-4 flex flex-col gap-2">
            {lanes.map((l) => {
              const part = l.song.parts[l.part]!;
              const active = mashup || on.has(l.part);
              const color = PART_TEXT[l.part].color;
              return (
                <li key={`${l.part}-${songs.indexOf(l.song)}`} className={`rounded-2xl border p-3 transition-opacity ${active ? "border-border bg-surface" : "border-border/50 opacity-55"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    {!mashup && (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={active}
                        onClick={() => toggle(l.part)}
                        className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${active ? "" : "bg-surface-raised"}`}
                        style={active ? { background: color } : undefined}
                        aria-label={PART_TEXT[l.part][fa ? "fa" : "en"]}
                      >
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${active ? "start-[1.125rem]" : "start-0.5"}`} />
                      </button>
                    )}
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{PART_TEXT[l.part][fa ? "fa" : "en"]}</span>
                    <button
                      type="button"
                      onClick={() => {
                        save(new Blob([part.mp3.slice()], { type: "audio/mpeg" }), downloadName(l.song.file.name, PART_TEXT[l.part].en.split(" (")[0]));
                        trackEvent("export", { tool: slug, what: l.part });
                      }}
                      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-brand-strong hover:bg-brand/10"
                    >
                      <Download className="h-3.5 w-3.5" /> {t.download} MP3
                    </button>
                  </div>
                  <Waveform
                    peaks={part.peaks}
                    color={`${color}66`}
                    progressColor={color}
                    progress={Math.min(1, Math.max(0, (at - l.delay) * l.rate) / Math.max(1, part.buffer?.duration ?? l.song.duration))}
                    height={44}
                    className="mt-2"
                    onSeek={(f) => {
                      const to = l.delay + (f * (part.buffer?.duration ?? l.song.duration)) / l.rate;
                      setAt(to);
                      if (playing) play(to);
                    }}
                  />
                </li>
              );
            })}
          </ul>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <Link href="/studio" className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 font-semibold text-white">
              <Wand2 className="h-4 w-4" /> {t.studio}
            </Link>
            <Link href="/upload" className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 font-semibold hover:bg-surface-hover">
              <Upload className="h-4 w-4" /> {t.keep}
            </Link>
            <span className="text-xs text-muted">{t.private}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function fmt(s: number) {
  const v = Math.max(0, Math.floor(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
}

/**
 * A phone's way in: send the song to the split queue (a computer splits it
 * into the person's own library, private), or sign in for that, or split it
 * here anyway.
 */
function PhoneQueue({
  slug,
  t,
  mashup,
  signedIn,
  onTryHere,
}: {
  slug: string;
  t: Record<string, string>;
  mashup: boolean;
  signedIn: boolean | null;
  onTryHere: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const path = usePathname();
  const [sent, setSent] = useState<string[]>([]);
  const [refused, setRefused] = useState(false);
  const links = signInLinks(path);
  function send(files: File[]) {
    if (!files.length) return;
    // Private: a tool page never asked whether to publish it (it can be shared from the library later).
    const result = uploads.addFiles(files, { tags: [], mode: "queue", keepPrivate: true });
    setRefused(result.added === 0 && result.duplicates.length === 0);
    const names = files.filter((f) => !result.notAudio.includes(f.name)).map((f) => f.name);
    if (names.length) {
      setSent((list) => [...list, ...names]);
      trackEvent("upload", { tool: slug, queued: true });
    }
  }
  return (
    <div className="rounded-2xl border border-border p-5">
      <h3 className="flex items-center gap-2 font-semibold">
        <Smartphone className="h-5 w-5 text-brand-strong" aria-hidden /> {t.queueTitle}
      </h3>
      <p className="mt-2 text-sm text-muted">{t.queueBody}</p>
      {signedIn === null ? (
        <Loader2 className="mt-4 h-5 w-5 animate-spin text-muted" aria-hidden />
      ) : signedIn ? (
        <div className="mt-4">
          <input
            ref={input}
            type="file"
            accept="audio/*,.mp3,.m4a,.wav,.flac,.ogg,.aac"
            multiple={mashup}
            hidden
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              send(files);
            }}
          />
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white"
          >
            <Send className="h-4 w-4" aria-hidden /> {t.queueChoose}
          </button>
          {refused && <p className="mt-2 text-xs text-danger">{t.formats}</p>}
          {sent.length > 0 && (
            <div className="mt-4 rounded-xl bg-success/10 p-3 text-sm" role="status">
              {sent.map((name, i) => (
                <p key={`${name}-${i}`} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
                  <span>
                    {t.queueSent}: <bdi className="font-semibold">{name}</bdi>
                  </span>
                </p>
              ))}
              <Link href="/upload" className="mt-2 inline-block font-semibold text-brand-strong hover:underline">
                {t.queueFollow}
              </Link>
              {mashup && <p className="mt-1 text-xs text-muted">{t.queueMashup}</p>}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4">
          <p className="text-sm">{t.queueNeedsAccount}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={links.signup} className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white">
              {t.signUp}
            </Link>
            <Link href={links.login} className="rounded-full border border-border px-5 py-2.5 text-sm font-semibold hover:bg-surface-hover">
              {t.logIn}
            </Link>
          </div>
        </div>
      )}
      <button type="button" onClick={onTryHere} className="mt-4 block text-sm text-muted underline hover:text-foreground">
        {t.tryHere}
      </button>
    </div>
  );
}

function SongSlot({
  label,
  song,
  t,
  model,
  onFile,
}: {
  label: string;
  song: Song | null;
  t: Record<string, string>;
  model: ReturnType<typeof useSplitter>;
  onFile: (f: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const busy = !!song?.stage;
  const stage = song?.stage;
  const progress =
    stage?.stage === "loading-model"
      ? model.total
        ? model.loaded / model.total
        : null
      : stage && "progress" in stage
        ? stage.progress
        : null;
  const what =
    stage?.stage === "loading-model"
      ? t.model
      : stage?.stage === "splitting"
        ? t.splitting
        : stage?.stage === "encoding"
          ? t.encoding
          : stage?.stage === "waiting"
            ? t.waiting
            : t.decoding;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-busy={busy}
      onClick={() => !busy && input.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !busy && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f && !busy) onFile(f);
      }}
      className={`flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-5 text-center transition-colors ${
        over ? "border-brand bg-brand/10" : song && !busy && !song.error ? "border-success/50 bg-success/5" : "border-border hover:border-brand/60 hover:bg-brand/5"
      }`}
    >
      <input
        ref={input}
        type="file"
        accept="audio/*,.mp3,.m4a,.wav,.flac,.ogg,.aac"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f);
        }}
      />
      {busy ? (
        <>
          <Loader2 className="h-7 w-7 animate-spin text-brand-strong" aria-hidden />
          <p className="text-sm font-semibold">
            {what}
            {progress !== null && progress !== undefined ? ` ${Math.round(progress * 100)}%` : "…"}
          </p>
          <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-surface-raised">
            <div className={`h-full rounded-full bg-gradient-to-r from-vocals to-beat transition-[width] ${progress === null ? "w-1/3 animate-pulse" : ""}`} style={progress !== null ? { width: `${Math.round(progress * 100)}%` } : undefined} />
          </div>
          <p className="max-w-xs truncate text-xs text-muted" dir="auto">{song?.file.name}</p>
        </>
      ) : song && !song.error ? (
        <>
          <Music className="h-6 w-6 text-success" aria-hidden />
          <p className="max-w-xs truncate text-sm font-semibold" dir="auto">{song.file.name}</p>
          <p className="text-xs text-muted">{song.bpm ? `${Math.round(song.bpm)} BPM · ` : ""}{fmt(song.duration)}</p>
        </>
      ) : (
        <>
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-vocals to-beat text-white">
            <Upload className="h-5 w-5" aria-hidden />
          </span>
          <p className="text-sm font-semibold">{label}</p>
          <p className="text-xs text-muted">{t.formats}</p>
          {song?.error && <p className="text-xs text-danger">{song.error === t.failed ? t.failed : `${t.failed}: ${song.error}`}</p>}
        </>
      )}
    </div>
  );
}
