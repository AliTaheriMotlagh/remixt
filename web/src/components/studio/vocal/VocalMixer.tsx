"use client";

import { useMemo, useState, type ComponentType } from "react";
import { AudioLines, Drum, Headphones, Layers2, Mic, Minus, Music2, Plus, Sparkles, Timer } from "lucide-react";
import { audioEngine } from "@/lib/client/audioEngine";
import { projectKey } from "@/lib/client/lineStatus";
import { keyLabel } from "@/lib/client/musicKey";
import { startNewStep } from "@/lib/client/studioHistory";
import { FX_PRESETS, useStudioStore, type LaneFx, type StudioLane } from "@/lib/client/studioStore";
import { doubleTake, groupOf, type Group } from "@/lib/client/vocalLanes";
import { Meter } from "../MixerConsole";

// A singer's mix: the sound of your voice (presets, reverb, echo) put on
// every take at once and doubled for a fuller sound; the beat moved into
// your range and ducked under your voice; and the three levels that matter
// while recording — the beat, the original singer (a guide to sing along
// with, or off), and your own voice. Each lane on its own is in Tracks.

const GROUPS: { id: Group; label: string; hint: string; icon: ComponentType<{ className?: string }>; color: string }[] = [
  { id: "beat", label: "Beat", hint: "Everything that isn't a voice", icon: Drum, color: "var(--beat)" },
  { id: "guide", label: "Guide vocal", hint: "The original singer — sing along to it, then turn it off", icon: AudioLines, color: "var(--brand)" },
  { id: "voice", label: "Your voice", hint: "Your takes", icon: Mic, color: "var(--vocals)" },
];

const MAX = 1.5;
/** Gain ↔ slider position: a square-root taper, so 0 dB sits about four-fifths of the way up (as the mixer's faders). */
const toPos = (gain: number) => Math.sqrt(Math.max(0, gain) / MAX);
const toGain = (pos: number) => MAX * Math.max(0, Math.min(1, pos)) ** 2;
const dbText = (gain: number) => (gain <= 0.0005 ? "−∞" : `${gain >= 1 ? "+" : ""}${(20 * Math.log10(gain)).toFixed(1)} dB`);

function Level({ value, onChange, label, color }: { value: number; onChange: (gain: number) => void; label: string; color: string }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <input
        type="range"
        min={0}
        max={1}
        step={0.005}
        value={toPos(value)}
        onChange={(e) => onChange(toGain(Number(e.target.value)))}
        onDoubleClick={() => onChange(1)}
        aria-label={label}
        aria-valuetext={dbText(value)}
        title="Double-click for 0 dB"
        className="h-2 min-w-0 flex-1 cursor-pointer"
        style={{ accentColor: color }}
      />
      <span className="w-14 shrink-0 text-right text-[10px] tabular-nums text-muted">{dbText(value)}</span>
    </div>
  );
}

/** Every lane of a group louder or quieter together, keeping their balance. */
function setGroupLevel(lanes: StudioLane[], gain: number) {
  const store = useStudioStore.getState();
  const top = Math.max(0, ...lanes.map((l) => l.volume));
  for (const lane of lanes) store.setVolume(lane.laneId, top > 0.0005 ? Math.min(MAX, (lane.volume * gain) / top) : gain);
}

function setGroupMuted(lanes: StudioLane[], muted: boolean) {
  const store = useStudioStore.getState();
  for (const lane of lanes) if (lane.muted !== muted) store.toggleMute(lane.laneId);
}

function useGroups() {
  const lanes = useStudioStore((s) => s.lanes);
  return useMemo(() => {
    const out: Record<Group, StudioLane[]> = { beat: [], guide: [], voice: [] };
    for (const lane of lanes) out[groupOf(lane)].push(lane);
    return out;
  }, [lanes]);
}

/** The three levels that matter while singing, with a meter and an on/off each. */
export function QuickLevels() {
  const groups = useGroups();
  const master = useStudioStore((s) => s.masterVolume);
  const setMaster = useStudioStore((s) => s.setMasterVolume);
  const metronome = useStudioStore((s) => s.metronome);
  const toggleMetronome = useStudioStore((s) => s.toggleMetronome);
  const shown = GROUPS.filter((g) => groups[g.id].length > 0);
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-col gap-2.5">
      {shown.map((g) => {
        const lanes = groups[g.id];
        const muted = lanes.every((l) => l.muted);
        const level = Math.max(...lanes.map((l) => l.volume));
        return (
          <div key={g.id} className="flex items-center gap-2" title={g.hint}>
            <button
              onClick={() => setGroupMuted(lanes, !muted)}
              aria-pressed={!muted}
              className={`flex h-9 w-28 shrink-0 items-center gap-1.5 rounded-lg border px-2 text-xs font-semibold transition-colors max-lg:h-10 ${
                muted ? "border-border text-muted line-through" : "border-transparent bg-surface-raised text-foreground"
              }`}
              aria-label={`${g.label}: ${muted ? "off — turn on" : "on — turn off"}`}
            >
              <g.icon className="shrink-0" />
              <span className="truncate">{g.label}</span>
            </button>
            <Meter source={() => {
              const playing = lanes.find((l) => !l.muted);
              return playing ? audioEngine.getLaneMeter(playing.laneId) : null;
            }} className="h-7 shrink-0" />
            <Level value={muted ? 0 : level} onChange={(gain) => (muted ? setGroupMuted(lanes, false) : setGroupLevel(lanes, gain))} label={`${g.label} level`} color={g.color} />
          </div>
        );
      })}
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-28 shrink-0 items-center gap-1.5 px-2 text-xs font-semibold text-muted max-lg:h-10">
          <Headphones /> Master
        </span>
        <Meter source={() => audioEngine.getAnalyser()} className="h-7 shrink-0" />
        <Level value={master} onChange={setMaster} label="Master level" color="var(--foreground)" />
      </div>
      <button
        onClick={toggleMetronome}
        aria-pressed={metronome}
        className={`flex h-9 items-center gap-1.5 self-start rounded-full border px-3 text-xs font-semibold transition-colors max-lg:h-10 ${
          metronome ? "border-vocals bg-vocals/10 text-vocals" : "border-border text-muted hover:text-foreground"
        }`}
        title="A click on every beat while it plays"
      >
        <Timer /> Click {metronome ? "on" : "off"}
      </button>
    </div>
  );
}

const VOICE_PRESETS = FX_PRESETS.filter((p) => p.kind === "vocals" || p.id === "clean");

/** Your voice's sound, on every take at once. */
function VoiceSound({ takes }: { takes: StudioLane[] }) {
  const setFx = useStudioStore((s) => s.setFx);
  const applyPreset = useStudioStore((s) => s.applyPreset);
  const [picked, setPicked] = useState<string | null>(null);
  const first = takes[0]?.fx;
  if (!first) return <p className="text-xs text-muted">Record a take to shape your voice&apos;s sound.</p>;
  const all = (patch: Partial<LaneFx>) => takes.forEach((t) => setFx(t.laneId, patch));
  const slider = (label: string, value: number, patch: (v: number) => Partial<LaneFx>, max = 1) => (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-16 shrink-0 text-muted">{label}</span>
      <input
        type="range"
        min={0}
        max={max}
        step={0.01}
        value={value}
        onChange={(e) => all(patch(Number(e.target.value)))}
        className="h-2 min-w-0 flex-1 cursor-pointer"
        style={{ accentColor: "var(--vocals)" }}
      />
      <span className="w-9 shrink-0 text-right tabular-nums text-muted">{Math.round((value / max) * 100)}%</span>
    </label>
  );
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Voice presets">
        {VOICE_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              takes.forEach((t) => applyPreset(t.laneId, p.id));
              setPicked(p.id);
            }}
            aria-pressed={picked === p.id}
            title={p.hint}
            className={`h-9 rounded-full border px-3 text-xs font-semibold transition-colors max-lg:h-10 ${
              picked === p.id ? "border-vocals bg-vocals text-white" : "border-border text-muted hover:border-vocals hover:text-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {slider("Reverb", first.reverb, (reverb) => ({ reverb }))}
      {slider("Echo", first.delay, (delay) => ({ delay }))}
      {slider("Width", first.width, (width) => ({ width }))}
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={first.compress} onChange={(e) => all({ compress: e.target.checked })} className="h-4 w-4" style={{ accentColor: "var(--vocals)" }} />
        <span>Even out the level (compressor)</span>
      </label>
    </div>
  );
}

/** The beat (and guide) moved up or down together, to sit in the singer's range — the key shown before and after. */
function BeatKey({ backing }: { backing: StudioLane[] }) {
  const lanes = useStudioStore((s) => s.lanes);
  const setPitch = useStudioStore((s) => s.setPitchSemitones);
  const ref = useMemo(() => projectKey(lanes), [lanes]);
  const shift = ref.pitch ?? 0;
  const move = (delta: number) => {
    startNewStep();
    for (const lane of backing) setPitch(lane.laneId, Math.max(-12, Math.min(12, lane.pitchSemitones + delta)));
  };
  const step = "flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted hover:border-vocals hover:text-foreground disabled:opacity-40 max-lg:h-10 max-lg:w-10";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={() => move(-1)} disabled={shift <= -12} className={step} aria-label="Beat a semitone lower">
        <Minus />
      </button>
      <div className="min-w-28 text-center">
        <p className="text-sm font-bold tabular-nums">{ref.key ? keyLabel(ref.key) : "Key not known"}</p>
        <p className="text-[11px] tabular-nums text-muted">{shift === 0 ? "as recorded" : `${shift > 0 ? "+" : ""}${shift} semitone${Math.abs(shift) === 1 ? "" : "s"}`}</p>
      </div>
      <button onClick={() => move(1)} disabled={shift >= 12} className={step} aria-label="Beat a semitone higher">
        <Plus />
      </button>
      {shift !== 0 && (
        <button onClick={() => move(-shift)} className="text-xs text-muted underline-offset-2 hover:text-foreground hover:underline">
          back to the original key
        </button>
      )}
    </div>
  );
}

export default function VocalMixer() {
  const groups = useGroups();
  const setFx = useStudioStore((s) => s.setFx);
  const backing = useMemo(() => [...groups.beat, ...groups.guide], [groups]);
  const duck = groups.beat.length ? Math.max(...groups.beat.map((l) => l.fx.duck)) : 0;
  const playingTakes = groups.voice.filter((t) => !t.muted && !/· double$/.test(t.name ?? ""));
  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Your voice's sound" className="flex flex-col gap-2 rounded-xl border border-vocals/30 bg-vocals/5 p-3">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-vocals">
          <Sparkles /> Your voice&apos;s sound · every take
        </p>
        <VoiceSound takes={groups.voice} />
        {playingTakes.length > 0 && (
          <button
            onClick={() => playingTakes.forEach(doubleTake)}
            className="mt-1 flex h-9 items-center gap-1.5 self-start rounded-lg border border-vocals/50 px-3 text-xs font-semibold text-vocals hover:bg-vocals/10 max-lg:h-10"
            title="A copy of each take playing, a touch late and spread left and right — a fuller, wider voice. Undo takes it away."
          >
            <Layers2 /> Double my voice
          </button>
        )}
      </section>

      {backing.length > 0 && (
        <section aria-label="The beat's key" className="flex flex-col gap-2 rounded-xl border border-border p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            <Music2 /> Fit the beat to your voice
          </p>
          <p className="text-xs text-muted">Too high or too low to sing? Move the beat (and the guide vocal) up or down — your takes stay as they are.</p>
          <BeatKey backing={backing} />
        </section>
      )}

      {groups.beat.length > 0 && (
        <section aria-label="Room for the voice" className="flex flex-col gap-2 rounded-xl border border-border p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            <Drum /> Make room for the voice
          </p>
          <label className="flex items-center gap-2 text-xs">
            <span className="w-16 shrink-0 text-muted">Duck</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={duck}
              onChange={(e) => groups.beat.forEach((l) => setFx(l.laneId, { duck: Number(e.target.value) }))}
              className="h-2 min-w-0 flex-1 cursor-pointer"
              style={{ accentColor: "var(--beat)" }}
              aria-label="How far the beat dips under the vocals"
            />
            <span className="w-10 shrink-0 text-right tabular-nums text-muted">{duck ? `${Math.round(duck * 100)}%` : "Off"}</span>
          </label>
          <p className="text-[11px] text-muted">The beat dips a little while you sing, so every word comes through.</p>
        </section>
      )}

      <section aria-label="Levels" className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Levels · every lane in Tracks</p>
        <QuickLevels />
      </section>
    </div>
  );
}
