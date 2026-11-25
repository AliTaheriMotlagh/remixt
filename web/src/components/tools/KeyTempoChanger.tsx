"use client";

// The key & tempo changer's working tool (/tools/key-tempo-changer): drop a
// song, move its key in semitones and its speed in percent — each without
// the other — then make it, hear it and download it. The same time-stretch
// and pitch engine the Studio uses (lib/client/pitchTempo.ts). No splitter
// and nothing uploaded, so it works on phones too.

import { useEffect, useRef, useState } from "react";
import { Download, Loader2, Pause, Play, RotateCcw, Upload, Wand2 } from "lucide-react";
import { analyzeMono, ANALYSIS_RATE, refineTempo } from "@/lib/client/analysis";
import { trackEvent } from "@/lib/client/analytics";
import { encodeWav } from "@/lib/client/mixdown";
import { encodeMp3 } from "@/lib/client/mp3";
import { camelotCode, keyLabel, transposeKey, type MusicalKey } from "@/lib/client/musicKey";
import { renderPitchTempo } from "@/lib/client/pitchTempo";
import type { ToolLocale } from "@/lib/tools";

const TEXT = {
  en: {
    drop: "Drop a song here, or tap to choose one",
    formats: "MP3, WAV, M4A, FLAC or OGG · read on your device, never uploaded",
    reading: "Reading the song…",
    key: "Key",
    speed: "Speed",
    semis: (n: number) => `${n > 0 ? "+" : ""}${n} semitone${Math.abs(n) === 1 ? "" : "s"}`,
    was: "Was",
    now: "Now",
    make: "Make it",
    making: "Making it…",
    play: "Play",
    pause: "Pause",
    mp3: "Download MP3",
    wav: "Download WAV",
    again: "Another song",
    reset: "Back to the original",
    failed: "Couldn't read that file — try an MP3 or WAV",
    changed: "Settings changed — make it again to hear them",
  },
  fa: {
    drop: "آهنگ را این‌جا رها کنید یا برای انتخاب بزنید",
    formats: "MP3، WAV، M4A، FLAC یا OGG · روی دستگاه شما خوانده می‌شود، آپلود نمی‌شود",
    reading: "در حال خواندن آهنگ…",
    key: "گام",
    speed: "سرعت",
    semis: (n: number) => `${n > 0 ? "+" : ""}${n.toLocaleString("fa-IR")} نیم‌پرده`,
    was: "قبلاً",
    now: "حالا",
    make: "بساز",
    making: "در حال ساختن…",
    play: "پخش",
    pause: "توقف",
    mp3: "دانلود MP3",
    wav: "دانلود WAV",
    again: "آهنگ دیگر",
    reset: "برگشت به نسخه‌ی اصلی",
    failed: "این فایل خوانده نشد — MP3 یا WAV را امتحان کنید",
    changed: "تنظیم عوض شد — دوباره بسازید تا بشنوید",
  },
};

type Song = { name: string; buffer: AudioBuffer; bpm: number | null; key: MusicalKey | null };

function mono(buffer: AudioBuffer) {
  // Analysis wants mono at its own rate: render a downmix there.
  const ctx = new OfflineAudioContext(1, Math.max(1, Math.ceil(buffer.duration * ANALYSIS_RATE)), ANALYSIS_RATE);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  src.start();
  return ctx.startRendering().then((b) => b.getChannelData(0));
}

function save(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export default function KeyTempoChanger({ locale }: { locale: ToolLocale }) {
  const t = TEXT[locale];
  const fa = locale === "fa";
  const [song, setSong] = useState<Song | null>(null);
  const [busy, setBusy] = useState<"reading" | "making" | "mp3" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [semis, setSemis] = useState(0);
  const [speed, setSpeed] = useState(100);
  const [result, setResult] = useState<{ buffer: AudioBuffer; semis: number; speed: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const ctx = useRef<AudioContext | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null);

  const stop = () => {
    source.current?.stop();
    source.current = null;
    setPlaying(false);
  };
  useEffect(() => () => {
    source.current?.stop();
    void ctx.current?.close();
  }, []);
  const context = () => (ctx.current ??= new AudioContext());

  async function take(file: File) {
    stop();
    setError(null);
    setResult(null);
    setSemis(0);
    setSpeed(100);
    setBusy("reading");
    try {
      const buffer = await context().decodeAudioData(await file.arrayBuffer());
      setSong({ name: file.name, buffer, bpm: null, key: null });
      // Tempo and key, so the new ones can be shown; the song is usable before this finishes.
      const a = await analyzeMono(await mono(buffer));
      const bpm = a.bpmEstimate ? Math.round(refineTempo(a, a.bpmEstimate) * 10) / 10 : null;
      setSong({ name: file.name, buffer, bpm, key: a.key });
    } catch {
      setError(t.failed);
      setSong(null);
    } finally {
      setBusy(null);
    }
  }

  async function make() {
    if (!song) return;
    stop();
    setBusy("making");
    try {
      const buffer = await renderPitchTempo(context(), song.buffer, { tempo: speed / 100, pitchSemitones: semis, priority: "now" });
      setResult({ buffer, semis, speed });
      trackEvent("tool_use", { tool: "key-tempo-changer", semitones: semis, speed });
      play(buffer);
    } catch {
      setError(t.failed);
    } finally {
      setBusy(null);
    }
  }

  function play(buffer: AudioBuffer) {
    stop();
    const c = context();
    void c.resume();
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.connect(c.destination);
    src.onended = () => source.current === src && setPlaying(false);
    src.start();
    source.current = src;
    setPlaying(true);
  }

  const base = song?.name.replace(/\.[^.]+$/, "") ?? "song";
  const label = `${base} (${semis ? t.semis(semis) : ""}${semis && speed !== 100 ? ", " : ""}${speed !== 100 ? `${speed}%` : ""})`.replace(" ()", "");
  const stale = result && (result.semis !== semis || result.speed !== speed);
  const newKey = song?.key ? transposeKey(song.key, semis) : null;
  const newBpm = song?.bpm ? Math.round(song.bpm * (speed / 100) * 10) / 10 : null;

  return (
    <div className="rounded-3xl border border-border bg-surface/80 p-4 shadow-2xl shadow-black/30 backdrop-blur sm:p-6" dir={fa ? "rtl" : undefined}>
      <input
        ref={input}
        type="file"
        accept="audio/*,.mp3,.m4a,.wav,.flac,.ogg,.aac"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void take(f);
        }}
      />
      {!song ? (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) void take(f);
          }}
          disabled={busy === "reading"}
          className="flex min-h-44 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border p-5 text-center hover:border-brand/60 hover:bg-brand/5"
        >
          {busy === "reading" ? <Loader2 className="h-7 w-7 animate-spin text-brand-strong" /> : (
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-vocals to-beat text-white">
              <Upload className="h-5 w-5" />
            </span>
          )}
          <span className="text-sm font-semibold">{busy === "reading" ? t.reading : t.drop}</span>
          <span className="text-xs text-muted">{t.formats}</span>
          {error && <span className="text-xs text-danger">{error}</span>}
        </button>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="truncate text-sm font-semibold" dir="auto">
            {song.name}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="rounded-2xl bg-surface-raised p-3">
              <span className="flex items-center justify-between text-xs text-muted">
                {t.key}
                <span className="font-semibold text-foreground" dir="ltr">{semis ? t.semis(semis) : "0"}</span>
              </span>
              <input type="range" min={-12} max={12} step={1} value={semis} onChange={(e) => setSemis(Number(e.target.value))} className="mt-2 h-8 w-full accent-brand" aria-label={t.key} />
              {song.key && (
                <span className="text-xs text-muted" dir="ltr">
                  {t.was} {keyLabel(song.key)} ({camelotCode(song.key)}) → <strong className="text-foreground">{keyLabel(newKey!)} ({camelotCode(newKey!)})</strong>
                </span>
              )}
            </label>
            <label className="rounded-2xl bg-surface-raised p-3">
              <span className="flex items-center justify-between text-xs text-muted">
                {t.speed}
                <span className="font-semibold text-foreground" dir="ltr">{speed}%</span>
              </span>
              <input type="range" min={50} max={150} step={1} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="mt-2 h-8 w-full accent-brand" aria-label={t.speed} />
              {song.bpm && (
                <span className="text-xs text-muted" dir="ltr">
                  {t.was} {song.bpm} BPM → <strong className="text-foreground">{newBpm} BPM</strong>
                </span>
              )}
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void make()} disabled={!!busy || (semis === 0 && speed === 100)} className="flex min-h-11 items-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-bold text-white hover:bg-brand-strong disabled:opacity-50">
              {busy === "making" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} {busy === "making" ? t.making : t.make}
            </button>
            {result && (
              <>
                <button type="button" onClick={() => (playing ? stop() : play(result.buffer))} className="flex min-h-11 items-center gap-1.5 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-surface-hover">
                  {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} {playing ? t.pause : t.play}
                </button>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={async () => {
                    setBusy("mp3");
                    try {
                      save(await encodeMp3(result.buffer), `${label}.mp3`);
                    } finally {
                      setBusy(null);
                    }
                  }}
                  className="flex min-h-11 items-center gap-1.5 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-surface-hover disabled:opacity-50"
                >
                  {busy === "mp3" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} {t.mp3}
                </button>
                <button type="button" onClick={() => save(encodeWav(result.buffer), `${label}.wav`)} className="flex min-h-11 items-center gap-1.5 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-surface-hover">
                  <Download className="h-4 w-4" /> {t.wav}
                </button>
              </>
            )}
          </div>
          {stale && <p className="text-xs text-beat">{t.changed}</p>}
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex flex-wrap gap-2 text-sm">
            <button type="button" onClick={() => { setSemis(0); setSpeed(100); stop(); }} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 hover:bg-surface-hover">
              <RotateCcw className="h-4 w-4" /> {t.reset}
            </button>
            <button type="button" onClick={() => { stop(); setSong(null); setResult(null); }} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 hover:bg-surface-hover">
              <Upload className="h-4 w-4" /> {t.again}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
