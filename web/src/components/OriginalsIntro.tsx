"use client";

import { useEffect, useRef, useState } from "react";
import { Disc3, Loader2, Mic, Play, SkipForward, Sparkles, Square } from "lucide-react";
import { audioEngine } from "@/lib/client/audioEngine";
import { previewPlayer } from "@/lib/client/previewPlayer";
import { fetchStem } from "@/lib/client/stemFetch";
import { useStudioStore, type StudioLane } from "@/lib/client/studioStore";
import { splitSongTitle } from "@/lib/lyrics";

// "Where it came from", before a remix plays: a few seconds of the original
// vocal as it was, then the original beat, then a riser and a filter sweep
// that drops into the remix itself. Each original is streamed through an
// <audio> element (a whole stem decoded would be ~85 MB — too much on a
// phone next to the remix's own audio), and the sweep is made here.

const PART_SECONDS = 5;
const RISE_SECONDS = 2.2;

type Step = "idle" | "loading" | "vocal" | "beat" | "rise" | "remix";

/** The loudest `seconds` of a lane's stem, from its waveform: where to start listening. */
export function loudestStart(peaks: ArrayLike<number>, duration: number, seconds: number): number {
  if (!peaks.length || !(duration > seconds)) return 0;
  const per = duration / peaks.length;
  const span = Math.max(1, Math.round(seconds / per));
  let sum = 0;
  for (let i = 0; i < Math.min(span, peaks.length); i++) sum += peaks[i];
  let best = sum;
  let at = 0;
  for (let i = span; i < peaks.length; i++) {
    sum += peaks[i] - peaks[i - span];
    if (sum > best) {
      best = sum;
      at = i - span + 1;
    }
  }
  return Math.max(0, Math.min(duration - seconds, at * per));
}

const vocalLane = (lanes: StudioLane[]) => lanes.find((l) => l.kind === "vocals" && !l.muted);
const beatLane = (lanes: StudioLane[]) => lanes.find((l) => (l.kind === "beat" || l.kind === "other") && !l.muted) ?? lanes.find((l) => l.kind === "drums" && !l.muted);

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), reject(new DOMException("stopped", "AbortError"))), { once: true });
  });

export default function OriginalsIntro() {
  const lanes = useStudioStore((s) => s.lanes);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const stopper = useRef<AbortController | null>(null);
  const vocal = vocalLane(lanes);
  const beat = beatLane(lanes);

  useEffect(() => () => stopper.current?.abort(), []);

  if (!vocal || !beat || vocal.stemId === beat.stemId) return null;
  const vocalSong = splitSongTitle(vocal.trackTitle);
  const beatSong = splitSongTitle(beat.trackTitle);

  const run = async () => {
    stopper.current?.abort();
    const stop = new AbortController();
    stopper.current = stop;
    const signal = stop.signal;
    setError(null);
    setStep("loading");
    previewPlayer.stop();
    audioEngine.pause();
    // Inside the tap: iOS only lets audio start from one.
    const ctx = new AudioContext();
    const urls: string[] = [];
    const cleanup = () => {
      for (const u of urls) URL.revokeObjectURL(u);
      void ctx.close().catch(() => {});
    };
    signal.addEventListener("abort", cleanup, { once: true });
    try {
      const [vBytes, bBytes] = await Promise.all([fetchStem(vocal.stemId), fetchStem(beat.stemId)]);
      if (signal.aborted) return;
      const element = (bytes: ArrayBuffer, start: number) => {
        const url = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
        urls.push(url);
        const a = new Audio(url);
        a.preload = "auto";
        a.currentTime = start;
        signal.addEventListener("abort", () => a.pause(), { once: true });
        return a;
      };
      const vAudio = element(vBytes, loudestStart(vocal.peaks, vocal.originalDuration, PART_SECONDS));
      const bAudio = element(bBytes, loudestStart(beat.peaks, beat.originalDuration, PART_SECONDS + RISE_SECONDS));
      const vGain = ctx.createGain();
      const bGain = ctx.createGain();
      const sweep = ctx.createBiquadFilter();
      sweep.type = "highpass";
      sweep.frequency.value = 20;
      ctx.createMediaElementSource(vAudio).connect(vGain).connect(ctx.destination);
      ctx.createMediaElementSource(bAudio).connect(sweep).connect(bGain).connect(ctx.destination);
      const fade = (g: GainNode, from: number, to: number, seconds: number) => {
        const t = ctx.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(from, t);
        g.gain.linearRampToValueAtTime(to, t + seconds);
      };

      // 1. The original vocal, alone.
      setStep("vocal");
      fade(vGain, 0, 1, 0.3);
      await vAudio.play();
      await wait(PART_SECONDS * 1000 - 400, signal);
      fade(vGain, 1, 0, 0.4);
      await wait(400, signal);
      vAudio.pause();

      // 2. The original beat, alone.
      setStep("beat");
      fade(bGain, 0, 1, 0.3);
      await bAudio.play();
      await wait(PART_SECONDS * 1000, signal);

      // 3. The rise: noise sweeping up while the beat thins out from the bottom.
      setStep("rise");
      const t = ctx.currentTime;
      sweep.frequency.setValueAtTime(20, t);
      sweep.frequency.exponentialRampToValueAtTime(3000, t + RISE_SECONDS);
      bGain.gain.setValueAtTime(1, t);
      bGain.gain.linearRampToValueAtTime(0.25, t + RISE_SECONDS);
      const noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * RISE_SECONDS), ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.Q.value = 6;
      band.frequency.setValueAtTime(300, t);
      band.frequency.exponentialRampToValueAtTime(9000, t + RISE_SECONDS);
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.001, t);
      nGain.gain.exponentialRampToValueAtTime(0.35, t + RISE_SECONDS * 0.95);
      nGain.gain.linearRampToValueAtTime(0, t + RISE_SECONDS);
      src.connect(band).connect(nGain).connect(ctx.destination);
      src.start(t);
      await wait(RISE_SECONDS * 1000, signal);
      bAudio.pause();

      // 4. The drop: the remix, from the top.
      setStep("remix");
      audioEngine.seek(0);
      await audioEngine.play();
      cleanup();
      setTimeout(() => setStep((s) => (s === "remix" ? "idle" : s)), 2500);
    } catch (e) {
      if (signal.aborted) return;
      cleanup();
      setStep("idle");
      setError(e instanceof Error && e.name === "NotAllowedError" ? "Tap play again to start the sound" : "Couldn't play the originals — the remix still plays");
    }
  };

  const stop = () => {
    stopper.current?.abort();
    setStep("idle");
  };
  const skip = async () => {
    stop();
    await audioEngine.play().catch(() => {});
  };

  const busy = step !== "idle";
  const parts: { id: Step; icon: React.ReactNode; label: string; sub: string; color: string }[] = [
    { id: "vocal", icon: <Mic className="h-4 w-4" />, label: "Original vocal", sub: `${vocalSong.song}${vocalSong.artist ? ` · ${vocalSong.artist}` : ""}`, color: "var(--vocals)" },
    { id: "beat", icon: <Disc3 className="h-4 w-4" />, label: "Original beat", sub: `${beatSong.song}${beatSong.artist ? ` · ${beatSong.artist}` : ""}`, color: "var(--beat)" },
    { id: "remix", icon: <Sparkles className="h-4 w-4" />, label: "The remix", sub: "Both, matched and mixed", color: "var(--brand)" },
  ];
  const order: Step[] = ["vocal", "beat", "rise", "remix"];
  const at = order.indexOf(step);

  return (
    <section aria-label="Hear the originals first" className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">Before and after</p>
          <p className="text-xs text-muted">The original vocal, then the original beat, then the drop into the remix — about 12 seconds.</p>
        </div>
        {busy ? (
          <div className="flex gap-2">
            <button type="button" onClick={() => void skip()} className="flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-surface-hover">
              <SkipForward className="h-4 w-4" /> To the remix
            </button>
            <button type="button" onClick={stop} aria-label="Stop" className="flex min-h-10 items-center rounded-lg border border-border px-3 hover:bg-surface-hover">
              <Square className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => void run()} className="flex min-h-10 items-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong">
            <Play className="h-4 w-4 fill-current" /> Originals, then the remix
          </button>
        )}
      </div>
      <ol className="grid grid-cols-3 border-t border-border">
        {parts.map((p, i) => {
          const live = step === p.id || (p.id === "beat" && step === "rise");
          const done = at > order.indexOf(p.id === "beat" ? "rise" : p.id) && step !== "idle";
          return (
            <li
              key={p.id}
              className={`relative flex min-w-0 flex-col gap-0.5 p-2.5 text-xs transition-colors sm:p-3 ${i ? "border-l border-border" : ""} ${live ? "bg-surface-raised" : ""}`}
              style={live ? { boxShadow: `inset 0 -3px 0 ${p.color}` } : undefined}
            >
              <span className="flex items-center gap-1.5 font-semibold" style={{ color: live || done ? p.color : undefined }}>
                {step === "loading" && i === 0 ? <Loader2 className="h-4 w-4 animate-spin" /> : p.icon}
                <span className="truncate">{p.label}</span>
              </span>
              <span dir="auto" className="truncate text-muted">
                {p.sub}
              </span>
              {live && (
                <span aria-hidden className="mt-1 flex h-3 items-end gap-0.5">
                  {[0, 1, 2, 3, 4].map((b) => (
                    <span key={b} className="w-1 animate-pulse rounded-full" style={{ background: p.color, height: `${40 + ((b * 37) % 60)}%`, animationDelay: `${b * 120}ms` }} />
                  ))}
                </span>
              )}
              {step === "rise" && p.id === "remix" && <span className="mt-1 text-[10px] font-bold uppercase tracking-wider text-brand-strong">Here it comes…</span>}
            </li>
          );
        })}
      </ol>
      {error && <p className="border-t border-border px-3 py-2 text-xs text-danger">{error}</p>}
    </section>
  );
}
