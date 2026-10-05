"use client";

import { useEffect, useRef, useState } from "react";
import { Circle, Download, Headphones, Mic, Square } from "lucide-react";
import { DjEngine, type RecordingResult } from "@/lib/client/dj/djEngine";
import type { Curve, DeckId, DjSnapshot, EqBand, FaderCurve, MonitorMode } from "@/lib/client/dj/djTypes";
import { EQ_MAX_DB, EQ_MIN_DB, TRIM_DB } from "@/lib/client/dj/djTypes";
import { downloadBlob } from "@/lib/client/demoSongs";
import type { GearProfile } from "@/lib/client/dj/gear";
import { Knob, Toggle, VFader, VuMeter, useRaf } from "./ui";

const BANDS: { band: EqBand; label: string }[] = [
  { band: "high", label: "Hi" },
  { band: "mid", label: "Mid" },
  { band: "low", label: "Low" },
];

const dbFmt = (v: number) => (v <= EQ_MIN_DB + 0.01 ? "−∞" : `${v > 0 ? "+" : ""}${v.toFixed(0)}`);

/** One mixer channel: trim (with auto gain), isolator EQ with kills, colour filter, headphone cue, fader and a pre-fader VU. */
export function ChannelStrip({ engine, id, ui, accent, compact }: { engine: DjEngine; id: DeckId; ui: DjSnapshot; accent: string; compact?: boolean }) {
  const deck = ui.decks[id];
  return (
    <section aria-label={`Channel ${id}`} className="flex min-w-0 flex-col items-center gap-1.5 rounded-xl border border-border bg-black/25 p-2" style={{ borderTopColor: accent, borderTopWidth: 3 }}>
      <h3 className="text-[11px] font-black uppercase tracking-wide">Ch {id}</h3>
      <div data-dj={`M-trim-${id}`} className="flex flex-col items-center">
        <Knob
          label="Trim"
          value={deck.trim}
          min={-TRIM_DB}
          max={TRIM_DB}
          center={0}
          step={0.5}
          onChange={(v) => engine.setTrim(id, v)}
          format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`}
          size={40}
          color="#d4d4dc"
        />
        <button
          type="button"
          aria-pressed={deck.autoGain}
          onClick={() => engine.setAutoGain(id, !deck.autoGain)}
          title={`Auto gain: levels this track to the others from its measured loudness (${deck.autoGainDb > 0 ? "+" : ""}${deck.autoGainDb.toFixed(1)} dB)`}
          className={`mt-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold pointer-coarse:py-2 ${deck.autoGain ? "bg-success/80 text-black" : "bg-surface-raised text-muted"}`}
        >
          AUTO {deck.autoGain ? `${deck.autoGainDb > 0 ? "+" : ""}${deck.autoGainDb.toFixed(1)}` : "OFF"}
        </button>
      </div>
      <div data-dj={`M-eq-${id}`} className="flex flex-col items-center gap-1">
        {BANDS.map(({ band, label }) => (
          <div key={band} className="flex items-center gap-1">
            <Knob
              label={label}
              value={deck.kill[band] ? EQ_MIN_DB : deck.eq[band]}
              min={EQ_MIN_DB}
              max={EQ_MAX_DB}
              center={0}
              step={1}
              size={compact ? 36 : 42}
              onChange={(v) => {
                if (deck.kill[band]) engine.setKill(id, band, false);
                engine.setEq(id, band, v);
              }}
              format={(v) => (deck.kill[band] ? "KILL" : dbFmt(v))}
              color={band === "low" ? "#1d6bff" : band === "mid" ? "#f5a524" : "#e5e7eb"}
            />
            <button
              type="button"
              aria-pressed={deck.kill[band]}
              onClick={() => engine.setKill(id, band, !deck.kill[band])}
              aria-label={`Kill ${label.toLowerCase()} on channel ${id}`}
              title={`Kill: cut the ${label.toLowerCase()} band completely`}
              className={`h-7 w-7 rounded text-[8px] font-black pointer-coarse:h-9 pointer-coarse:w-9 ${deck.kill[band] ? "bg-danger text-white" : "bg-surface-raised text-muted"}`}
            >
              KILL
            </button>
          </div>
        ))}
      </div>
      <div data-dj={`M-filter-${id}`}>
        <Knob
          label="Color"
          value={deck.filter}
          min={-1}
          max={1}
          center={0}
          step={0.05}
          size={40}
          onChange={(v) => engine.setFilter(id, Math.abs(v) < 0.04 ? 0 : v)}
          format={(v) => (Math.abs(v) < 0.04 ? "off" : v < 0 ? `LP ${Math.round(-v * 100)}` : `HP ${Math.round(v * 100)}`)}
          color="#06b6d4"
        />
      </div>
      <div data-dj={`M-pfl-${id}`} className="w-full">
        <Toggle
          pressed={deck.pfl}
          onClick={() => engine.setPfl(id, !deck.pfl)}
          label={`Headphone cue for channel ${id}`}
          title="CUE (PFL): hear this channel in the headphones before its fader"
          litClass="bg-drums text-black"
          className="flex min-h-9 w-full items-center justify-center gap-1"
        >
          <Headphones /> CUE
        </Toggle>
      </div>
      <div className="flex items-end gap-1.5">
        <VuMeter read={() => engine.peaks()[id]} label={`Channel ${id} level (before the fader)`} height={compact ? 96 : 124} segments={compact ? 12 : 15} />
        <div data-dj={`${id}-volume`}>
          <div data-dj={`M-fader-${id}`}>
            <VFader label="Fader" value={deck.volume} min={0} max={1} height={compact ? 100 : 130} onChange={(v) => engine.setVolume(id, v)} format={(v) => `${Math.round(v * 100)}`} capColor="#f4f4f8" />
          </div>
        </div>
      </div>
    </section>
  );
}

const CURVES: { id: Curve; label: string; hint: string }[] = [
  { id: "blend", label: "Blend", hint: "Smooth equal-power curve for long mixes" },
  { id: "linear", label: "Linear", hint: "Straight line" },
  { id: "cut", label: "Cut", hint: "Both decks full until the edges: for scratching and quick cuts" },
];

const FADER_CURVES: { id: FaderCurve; label: string }[] = [
  { id: "smooth", label: "Smooth" },
  { id: "linear", label: "Linear" },
  { id: "steep", label: "Steep" },
];

/** A crossfader you can drag with a thumb. */
function Crossfader({ engine, ui }: { engine: DjEngine; ui: DjSnapshot }) {
  const x = ui.mix.crossfader;
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ offset: number } | null>(null);
  const fromX = (clientX: number, offset: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return x;
    return Math.max(-1, Math.min(1, ((clientX - offset - r.left) / r.width) * 2 - 1));
  };
  return (
    <div data-dj="M-xfader">
      <div className="mb-0.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-muted">
        <span style={{ color: "var(--beat)" }}>A</span>
        <span>Crossfader</span>
        <span style={{ color: "var(--vocals)" }}>B</span>
      </div>
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label="Crossfader"
        aria-valuemin={-1}
        aria-valuemax={1}
        aria-valuenow={Math.round(x * 100) / 100}
        aria-valuetext={x < -0.05 ? `towards A ${Math.round(-x * 100)}%` : x > 0.05 ? `towards B ${Math.round(x * 100)}%` : "centre"}
        className="relative h-11 cursor-ew-resize touch-none select-none rounded-lg bg-black/40 focus-visible:outline-2 focus-visible:outline-brand"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const r = e.currentTarget.getBoundingClientRect();
          const capX = r.left + ((x + 1) / 2) * r.width;
          drag.current = { offset: Math.abs(e.clientX - capX) < 22 ? e.clientX - capX : 0 };
          if (!drag.current.offset) engine.setCrossfader(fromX(e.clientX, 0));
        }}
        onPointerMove={(e) => drag.current && engine.setCrossfader(fromX(e.clientX, drag.current.offset))}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onDoubleClick={() => engine.setCrossfader(0)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 0.3 : 0.05;
          if (e.key === "ArrowLeft") engine.setCrossfader(x - step);
          else if (e.key === "ArrowRight") engine.setCrossfader(x + step);
          else if (e.key === "Home") engine.setCrossfader(0);
          else return;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <div className="absolute inset-x-3 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-black/70" />
        <div className="absolute inset-y-2 left-1/2 w-px bg-white/30" />
        <div className="absolute top-1/2 h-9 w-6 -translate-x-1/2 -translate-y-1/2 rounded-[4px] border border-black/50 bg-gradient-to-r from-[#d4d4dc] to-[#6b6b78] shadow-md" style={{ left: `${((x + 1) / 2) * 100}%` }}>
          <div className="absolute inset-y-1 left-1/2 w-0.5 -translate-x-1/2 bg-black/70" />
        </div>
      </div>
    </div>
  );
}

/** Crossfader, curves, master level and the stereo master meter. */
export function MasterSection({ engine, ui, gear }: { engine: DjEngine; ui: DjSnapshot; gear: GearProfile }) {
  return (
    <section aria-label="Crossfader and master" className="flex flex-col gap-2 rounded-xl border border-border bg-black/25 p-2.5">
      <Crossfader engine={engine} ui={ui} />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex gap-1" role="group" aria-label="Crossfader curve">
            {CURVES.map((c) => (
              <Toggle key={c.id} pressed={ui.mix.curve === c.id} onClick={() => engine.setCurve(c.id)} label={`Crossfader curve: ${c.label}`} title={c.hint} className="min-h-8 px-1.5">
                {c.label}
              </Toggle>
            ))}
          </div>
          {gear.id !== "touch" && (
            <div className="flex gap-1" role="group" aria-label="Channel fader curve">
              {FADER_CURVES.map((c) => (
                <Toggle key={c.id} pressed={ui.mix.faderCurve === c.id} onClick={() => engine.setFaderCurve(c.id)} label={`Channel fader curve: ${c.label}`} title="How fast the channel faders open" className="min-h-8 px-1.5">
                  {c.label}
                </Toggle>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-end gap-1.5">
          <Knob label="Master" value={ui.mix.master} min={0} max={1} onChange={(v) => engine.setMaster(v)} format={(v) => `${Math.round(v * 100)}`} size={42} color="#f4f4f8" />
          <VuMeter read={() => engine.peaks().L} label="Master left" height={70} segments={12} />
          <VuMeter read={() => engine.peaks().R} label="Master right" height={70} segments={12} />
        </div>
      </div>
    </section>
  );
}

const MONITORS: { id: MonitorMode; label: string; hint: string }[] = [
  { id: "single", label: "One output", hint: "The cue is laid over the master on your one output" },
  { id: "split", label: "Split", hint: "Headphones: cue in the left ear, master in the right" },
  { id: "device", label: "2nd device", hint: "Master on this output, the headphone mix on another audio device" },
];

/** Headphones: cue mix, level, split cue or a second output device. */
export function HeadphoneSection({ engine, ui }: { engine: DjEngine; ui: DjSnapshot }) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [device, setDevice] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const canDevice = DjEngine.phonesDeviceSupported();

  const loadDevices = async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter((d) => d.kind === "audiooutput"));
    } catch {
      setDevices([]);
    }
  };

  return (
    <section aria-label="Headphones" className="flex flex-col gap-2 rounded-xl border border-border bg-black/25 p-2.5">
      <h3 className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide">
        <Headphones /> Headphones
      </h3>
      <div className="flex items-start justify-around gap-2">
        <div data-dj="M-cuemix">
          <Knob label="Cue mix" value={ui.mix.cueMix} min={0} max={1} center={0.5} onChange={(v) => engine.setCueMix(v)} format={(v) => (v < 0.1 ? "CUE" : v > 0.9 ? "MASTER" : `${Math.round((1 - v) * 100)}/${Math.round(v * 100)}`)} size={42} color="#f59e0b" />
        </div>
        <Knob label="Level" value={ui.mix.phones} min={0} max={1} onChange={(v) => engine.setPhones(v)} format={(v) => `${Math.round(v * 100)}`} size={42} color="#f59e0b" />
      </div>
      <div className="flex gap-1" role="group" aria-label="Headphone routing" data-dj="M-monitor">
        {MONITORS.map((m) => (
          <Toggle
            key={m.id}
            pressed={ui.mix.monitor === m.id}
            disabled={m.id === "device" && !canDevice}
            onClick={() => {
              setNote(null);
              if (m.id === "device") {
                void loadDevices();
                if (ui.mix.monitor !== "device") setNote("Pick the output your headphones are on. The master stays on this one.");
                return;
              }
              engine.setMonitor(m.id);
            }}
            label={`Headphone routing: ${m.label}`}
            title={m.id === "device" && !canDevice ? "This browser can't send audio to a second output: use Split with headphones" : m.hint}
            className="min-h-8 flex-1 px-1"
          >
            {m.label}
          </Toggle>
        ))}
      </div>
      {devices.length > 0 && (
        <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
          Headphone output
          <select
            value={device}
            onChange={async (e) => {
              const v = e.target.value;
              setDevice(v);
              try {
                await engine.setPhonesDevice(v);
                setNote("The headphone mix now plays on that device (a little latency is normal).");
              } catch (err) {
                setNote(err instanceof Error ? err.message : "Couldn't use that output.");
              }
            }}
            className="min-h-9 rounded-md border border-border bg-surface px-2 text-xs normal-case text-foreground"
          >
            <option value="">Choose…</option>
            {devices.map((d, i) => (
              <option key={d.deviceId || i} value={d.deviceId}>
                {d.label || `Output ${i + 1}${d.deviceId === "default" ? " (default)" : ""}`}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="text-[10px] leading-snug text-muted">
        {note ??
          (ui.mix.monitor === "split"
            ? "Split cue: wear headphones. Left ear is what you're cueing, right ear is the master."
            : ui.mix.monitor === "device"
              ? "Master on this output, headphone mix on the other device."
              : canDevice
                ? "With one output, the cue is laid over the master. Use Split with headphones, or send the cue to a second audio device."
                : "With one output, the cue is laid over the master. Wear headphones and use Split for a real cue (this browser can't use a second device).")}
      </p>
    </section>
  );
}

/** Talkover and the master recorder. */
export function BoothSection({ engine, ui }: { engine: DjEngine; ui: DjSnapshot }) {
  const [rec, setRec] = useState<RecordingResult | null>(null);
  const [mic, setMic] = useState<"off" | "on" | "denied">("off");
  const time = useRef<HTMLSpanElement>(null);
  const url = useRef<string | null>(null);
  useRaf(() => {
    if (time.current) {
      const s = engine.recordingSeconds();
      time.current.textContent = `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
    }
  }, ui.mix.recording);
  useEffect(
    () => () => {
      if (url.current) URL.revokeObjectURL(url.current);
    },
    []
  );
  const canRec = DjEngine.recordingSupported();
  const ext = rec?.mime.includes("mp4") ? "m4a" : rec?.mime.includes("ogg") ? "ogg" : "webm";

  return (
    <section aria-label="Talkover and recording" className="flex flex-col gap-2 rounded-xl border border-border bg-black/25 p-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <div data-dj="M-talkover" className="flex">
          <button
            type="button"
            aria-pressed={ui.mix.talkover}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              engine.setTalkover(true);
            }}
            onPointerUp={() => engine.setTalkover(false)}
            onPointerCancel={() => engine.setTalkover(false)}
            onKeyDown={(e) => {
              if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                e.preventDefault();
                engine.setTalkover(true);
              }
            }}
            onKeyUp={(e) => (e.key === " " || e.key === "Enter") && engine.setTalkover(false)}
            onBlur={() => ui.mix.talkover && engine.setTalkover(false)}
            onContextMenu={(e) => e.preventDefault()}
            title="Hold: the music ducks for an announcement"
            className={`flex min-h-10 touch-none select-none items-center gap-1.5 rounded-lg px-3 text-xs font-bold ${ui.mix.talkover ? "bg-danger text-white" : "bg-surface-raised"}`}
          >
            <Mic /> TALKOVER
          </button>
        </div>
        <button
          type="button"
          onClick={async () => setMic((await engine.enableMic()) ? "on" : "denied")}
          disabled={mic === "on"}
          className="min-h-10 rounded-lg border border-border px-2 text-[11px] font-semibold text-muted hover:text-foreground disabled:opacity-60"
          title="Use your microphone for talkover (optional)"
        >
          {mic === "on" ? "Mic ready" : mic === "denied" ? "No mic: ducking only" : "Use mic"}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" data-dj="M-record">
        {ui.mix.recording ? (
          <button
            type="button"
            onClick={async () => {
              const r = await engine.stopRecording();
              if (r) setRec(r);
            }}
            className="flex min-h-10 items-center gap-1.5 rounded-lg bg-danger px-3 text-xs font-bold text-white"
          >
            <Square className="fill-white" /> STOP <span ref={time} className="font-mono tabular-nums" />
          </button>
        ) : (
          <button
            type="button"
            disabled={!canRec}
            onClick={() => {
              setRec(null);
              engine.startRecording();
            }}
            title={canRec ? "Record the master output" : "This browser can't record audio"}
            className="flex min-h-10 items-center gap-1.5 rounded-lg bg-surface-raised px-3 text-xs font-bold hover:bg-surface-hover disabled:opacity-40"
          >
            <Circle className="fill-danger text-danger" /> REC
          </button>
        )}
        {rec && (
          <button
            type="button"
            onClick={() => downloadBlob(rec.blob, `Remixt DJ mix ${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.${ext}`)}
            className="flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-surface-hover"
          >
            <Download /> Download ({Math.round(rec.seconds)} s)
          </button>
        )}
      </div>
    </section>
  );
}
