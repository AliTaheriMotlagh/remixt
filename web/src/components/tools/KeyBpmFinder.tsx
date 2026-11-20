"use client";

// The BPM and key finder's working tool (/tools/bpm-key-finder): drop a
// song and it's measured on this device — tempo (the onset grid, refined to
// a hundredth) and key (chromagram against the 24 key profiles), the same
// analysis the Studio matches songs with (lib/client/analysis.ts). No
// splitter, nothing uploaded and nothing kept, so it works on phones too.
// A second song shows how to fit the two together (lib/toolWorkbench.ts).

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowLeftRight, Gauge, KeyRound, Loader2, RotateCcw, Upload } from "lucide-react";
import { analyzeMono, ANALYSIS_RATE, refineTempo } from "@/lib/client/analysis";
import { camelotCode, keyLabel, type MusicalKey } from "@/lib/client/musicKey";
import { trackEvent } from "@/lib/client/analytics";
import { keyShift, mixesWith, signed, tempoFit, WB_TEXT } from "@/lib/toolWorkbench";
import { toolPath, type ToolLocale } from "@/lib/tools";

type Reading = { name: string; bpm: number | null; key: MusicalKey; confidence: number; seconds: number };
type Slot = { busy: true; name: string } | { busy: false; error: string } | ({ busy: false } & Reading) | null;

/** The song as mono samples at the analysis rate. Decoding straight to that rate keeps a phone's memory low. */
async function monoAtAnalysisRate(file: File): Promise<{ mono: Float32Array; seconds: number }> {
  const data = await file.arrayBuffer();
  let buffer: AudioBuffer;
  try {
    buffer = await new OfflineAudioContext(1, 1, ANALYSIS_RATE).decodeAudioData(data.slice(0));
  } catch {
    // A browser that won't decode at that rate: decode as usual, then resample by rendering.
    const full = await new OfflineAudioContext(1, 1, 44_100).decodeAudioData(data);
    const ctx = new OfflineAudioContext(1, Math.max(1, Math.ceil(full.duration * ANALYSIS_RATE)), ANALYSIS_RATE);
    const src = ctx.createBufferSource();
    src.buffer = full;
    src.connect(ctx.destination);
    src.start();
    buffer = await ctx.startRendering();
  }
  const mono = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) mono[i] += d[i] / buffer.numberOfChannels;
  }
  return { mono, seconds: buffer.duration };
}

async function measure(file: File): Promise<Reading> {
  const { mono, seconds } = await monoAtAnalysisRate(file);
  const a = await analyzeMono(mono);
  const bpm = a.bpmEstimate ? Math.round(refineTempo(a, a.bpmEstimate) * 100) / 100 : null;
  return { name: file.name, bpm, key: a.key, confidence: a.keyConfidence, seconds };
}

export default function KeyBpmFinder({ locale }: { locale: ToolLocale }) {
  const t = WB_TEXT[locale];
  const fa = locale === "fa";
  const [slots, setSlots] = useState<[Slot, Slot]>([null, null]);

  async function take(i: 0 | 1, file: File) {
    const put = (s: Slot) => setSlots((cur) => (i === 0 ? [s, cur[1]] : [cur[0], s]));
    put({ busy: true, name: file.name });
    try {
      const reading = await measure(file);
      put({ busy: false, ...reading });
      trackEvent("tool_use", { tool: "bpm-key-finder", bpm: reading.bpm ?? 0, key: keyLabel(reading.key) });
    } catch (e) {
      if (!fa) console.warn("measure failed", e);
      put({ busy: false, error: t.failed });
    }
  }

  const [a, b] = slots;
  const both = a && b && !a.busy && !b.busy && "key" in a && "key" in b ? ([a, b] as [Reading, Reading]) : null;
  const fit = both && both[0].bpm && both[1].bpm ? tempoFit(both[0].bpm, both[1].bpm) : null;
  const shift = both ? keyShift(both[0].key, both[1].key) : null;
  const num = (n: number) => (fa ? n.toLocaleString("fa-IR", { maximumFractionDigits: 2 }) : n.toLocaleString("en-US", { maximumFractionDigits: 2 }));

  return (
    <div className="rounded-3xl border border-border bg-surface/80 p-4 shadow-2xl shadow-black/30 backdrop-blur sm:p-6" dir={fa ? "rtl" : undefined}>
      <div className="grid gap-3 sm:grid-cols-2">
        {([0, 1] as const).map((i) => (
          <FinderSlot key={i} slot={slots[i]} label={i === 0 ? t.findDrop : t.compareDrop} t={t} num={num} onFile={(f) => take(i, f)} />
        ))}
      </div>

      {both && (
        <div className="mt-4 rounded-2xl border border-brand/40 bg-brand/5 p-4" role="status">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ArrowLeftRight className="h-4 w-4 text-brand-strong" aria-hidden /> {t.toMatch}
          </h3>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl bg-surface p-3">
              <dt className="text-muted">{t.speedBy}</dt>
              <dd className="mt-1 text-xl font-bold tabular-nums" dir="ltr">
                {fit ? (Math.abs(fit.percent) < 0.05 ? t.alreadyFits : `${signed(fit.percent)}%`) : t.noTempo}
                {fit && fit.multiple !== 1 && <span className="ms-2 text-xs font-normal text-muted">{fit.multiple === 2 ? t.doubleTime : t.halfTime}</span>}
              </dd>
            </div>
            <div className="rounded-xl bg-surface p-3">
              <dt className="text-muted">{t.shiftBy}</dt>
              <dd className="mt-1 text-xl font-bold tabular-nums">
                {shift === 0 ? t.alreadyFits : <span dir="ltr">{`${signed(shift!)} ${t.semitones}`}</span>}
              </dd>
            </div>
          </dl>
          <Link href={`${toolPath("mashup-maker", locale)}#try`} className="mt-3 inline-block text-sm font-semibold text-brand-strong hover:underline">
            {t.openMashup}
          </Link>
        </div>
      )}
      {(a || b) && (
        <button type="button" onClick={() => setSlots([null, null])} className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-sm hover:bg-surface-hover">
          <RotateCcw className="h-4 w-4" aria-hidden /> {t.again}
        </button>
      )}
    </div>
  );
}

function FinderSlot({ slot, label, t, num, onFile }: { slot: Slot; label: string; t: Record<string, string>; num: (n: number) => string; onFile: (f: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const busy = !!slot?.busy;
  const reading = slot && !slot.busy && "key" in slot ? slot : null;
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
      className={`flex min-h-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-5 text-center transition-colors ${
        over ? "border-brand bg-brand/10" : reading ? "border-success/50 bg-success/5" : "border-border hover:border-brand/60 hover:bg-brand/5"
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
          <p className="text-sm font-semibold">{t.listening}…</p>
          <p className="max-w-xs truncate text-xs text-muted" dir="auto">{slot.name}</p>
        </>
      ) : reading ? (
        <div className="w-full">
          <p className="truncate text-xs text-muted" dir="auto">{reading.name}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-surface p-3">
              <p className="flex items-center justify-center gap-1 text-xs text-muted">
                <Gauge className="h-3.5 w-3.5" aria-hidden /> {t.tempo}
              </p>
              <p className="mt-1 text-2xl font-black tabular-nums sm:text-3xl">{reading.bpm ? num(reading.bpm) : "—"}</p>
              <p className="text-xs text-muted">{reading.bpm ? "BPM" : t.noTempo}</p>
            </div>
            <div className="rounded-xl bg-surface p-3">
              <p className="flex items-center justify-center gap-1 text-xs text-muted">
                <KeyRound className="h-3.5 w-3.5" aria-hidden /> {t.key}
              </p>
              <p className="mt-1 text-2xl font-black sm:text-3xl" dir="ltr">{keyLabel(reading.key)}</p>
              <p className="text-xs text-muted">
                {t.camelot} <span className="font-semibold text-foreground" dir="ltr">{camelotCode(reading.key)}</span> · {t.sure} {num(Math.round(reading.confidence * 100))}%
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted">{t.mixesWith}</p>
          <ul className="mt-1.5 flex flex-wrap justify-center gap-1.5" dir="ltr">
            {mixesWith(reading.key).map((k) => (
              <li key={k.camelot} className={`rounded-full px-2.5 py-1 text-xs ${k.fit === "same" ? "bg-brand text-white" : k.fit === "relative" ? "bg-brand/15" : "bg-surface-raised"}`}>
                <span className="font-semibold">{k.camelot}</span> {k.label}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-vocals to-beat text-white">
            <Upload className="h-5 w-5" aria-hidden />
          </span>
          <p className="text-sm font-semibold">{label}</p>
          <p className="text-xs text-muted">{t.findFormats}</p>
          {slot && "error" in slot && <p className="text-xs text-danger">{slot.error}</p>}
        </>
      )}
    </div>
  );
}
