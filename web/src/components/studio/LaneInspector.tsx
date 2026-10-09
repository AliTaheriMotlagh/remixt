"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Combine,
  CopyPlus,
  Download,
  LayoutGrid,
  MessageCircle,
  Play,
  RectangleHorizontal,
  Spline,
  SquareDashed,
  SquareSplitHorizontal,
  VolumeX,
  X,
} from "lucide-react";
import { kindColor, kindLabel } from "@/lib/stemKinds";
import LaneFxPanel from "../LaneFxPanel";
import LaneMatchPanel from "../LaneMatchPanel";
import KeyHelper from "./KeyHelper";
import TapTempo from "./TapTempo";
import * as commands from "@/lib/client/clipCommands";
import { liveRefs } from "@/lib/client/clipEdit";
import { startLaneExport, useExportJob } from "@/lib/client/exportJob";
import { ALL_KEYS, camelotCode, keyId, keyLabel, parseKeyId } from "@/lib/client/musicKey";
import { previewPlayer } from "@/lib/client/previewPlayer";
import { startNewStep } from "@/lib/client/studioHistory";
import {
  beatLength,
  effectiveKey,
  keyReference,
  laneName,
  snapTime,
  useStudioStore,
  type StudioLane,
} from "@/lib/client/studioStore";
import { useStudioView, type InspectorTab } from "@/lib/client/studioView";

// Everything about one lane, in one place: the lane you clicked last. Docked
// under the arrangement on larger screens, a sheet from the bottom on a
// phone. Lanes themselves stay slim — name, mute, solo, level.

const TABS: { id: InspectorTab; label: string }[] = [
  { id: "mix", label: "Mix" },
  { id: "tempo", label: "Tempo & key" },
  { id: "fx", label: "Effects" },
  { id: "edit", label: "Edit" },
  { id: "match", label: "Match" },
];

function formatOffset(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(2).padStart(5, "0");
  return `${m}:${s}`;
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3" title={hint}>
      <span className="w-20 shrink-0 text-[11px] text-muted">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
    </div>
  );
}

const pill =
  "rounded-md border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:border-brand hover:text-foreground disabled:opacity-40 pointer-coarse:py-1.5";

function MixTab({ lane }: { lane: StudioLane }) {
  const projectBpm = useStudioStore((s) => s.projectBpm);
  const groupSize = useStudioStore((s) => (s.selectedLaneIds.includes(lane.laneId) ? s.selectedLaneIds.length : 0));
  const automation = useStudioView((s) => s.automationLanes.includes(lane.laneId));
  const store = useStudioStore.getState();
  const beat = beatLength(projectBpm);
  const bar = beat * 4;
  const exporting = useExportJob((j) => j.progress !== null);

  function nudge(delta: number) {
    startNewStep();
    const { selectedLaneIds } = useStudioStore.getState();
    if (selectedLaneIds.length > 1 && selectedLaneIds.includes(lane.laneId)) store.moveLanes(selectedLaneIds, delta);
    else store.nudgeOffset(lane.laneId, delta);
  }

  return (
    <div className="grid gap-x-8 gap-y-3 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <Row label="Volume">
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.01}
            value={lane.volume}
            onChange={(e) => store.setVolume(lane.laneId, Number(e.target.value))}
            onDoubleClick={() => store.setVolume(lane.laneId, 1)}
            className="h-1.5 min-w-0 flex-1"
            style={{ accentColor: kindColor(lane.kind) }}
            aria-label="Volume"
          />
          <span className="w-16 text-right font-mono text-[11px] text-muted tabular-nums">
            {lane.volume > 0 ? `${(20 * Math.log10(lane.volume)).toFixed(1)} dB` : "−∞"}
          </span>
        </Row>
        <Row label="Pan">
          <input
            type="range"
            min={-1}
            max={1}
            step={0.01}
            value={lane.fx.pan}
            onChange={(e) => store.setFx(lane.laneId, { pan: Number(e.target.value) })}
            onDoubleClick={() => store.setFx(lane.laneId, { pan: 0 })}
            className="h-1.5 min-w-0 flex-1"
            aria-label="Pan"
          />
          <span className="w-16 text-right font-mono text-[11px] text-muted tabular-nums">
            {Math.abs(lane.fx.pan) < 0.01 ? "C" : `${Math.round(Math.abs(lane.fx.pan) * 100)} ${lane.fx.pan < 0 ? "L" : "R"}`}
          </span>
        </Row>
        <Row label="Mute · solo">
          <button onClick={() => store.toggleMute(lane.laneId)} className={`${pill} ${lane.muted ? "!border-drums !bg-drums/20 !text-foreground" : ""}`}>
            {lane.muted ? "Muted" : "Mute"}
          </button>
          <button onClick={() => store.toggleSolo(lane.laneId)} className={`${pill} ${lane.solo ? "!border-success !bg-success/20 !text-foreground" : ""}`}>
            {lane.solo ? "Soloed" : "Solo"}
          </button>
          <button
            onClick={() => useStudioView.getState().toggleAutomation(lane.laneId)}
            className={`${pill} ${automation ? "!border-brand !bg-brand/15 !text-foreground" : ""}`}
            title="Draw volume and filter changes over the song"
          >
            <Spline /> Automation
          </button>
        </Row>
        <Row label="Crossfader" hint="Put this lane on side A or B of the crossfader in the transport">
          {(["off", "a", "b"] as const).map((side) => (
            <button
              key={side}
              onClick={() => store.setLaneXfade(lane.laneId, side === "off" ? null : side)}
              className={`${pill} ${(lane.xfade ?? "off") === side ? "!border-beat !bg-beat/15 !text-foreground" : ""}`}
            >
              {side === "off" ? "Off" : `Side ${side.toUpperCase()}`}
            </button>
          ))}
        </Row>
      </div>

      <div className="flex flex-col gap-3">
        <Row label="Name" hint="Your own name for this lane — empty goes back to the track's title">
          <input
            key={`${lane.laneId}:${lane.name ?? ""}`}
            defaultValue={lane.name ?? ""}
            placeholder={lane.trackTitle}
            maxLength={40}
            onBlur={(e) => {
              if ((e.target.value.trim() || undefined) === lane.name) return;
              startNewStep();
              store.renameLane(lane.laneId, e.target.value);
            }}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            className="input !px-2 !py-1 text-xs"
            aria-label="Lane name"
          />
          <button onClick={() => (startNewStep(), store.moveLane(lane.laneId, -1))} className="nudge" title="Move the lane up">
            <ArrowUp />
          </button>
          <button onClick={() => (startNewStep(), store.moveLane(lane.laneId, 1))} className="nudge" title="Move the lane down">
            <ArrowDown />
          </button>
        </Row>
        <Row label="Starts at" hint="Where this lane starts on the timeline">
          <input
            type="number"
            min={0}
            step={0.01}
            value={Number(lane.offsetSeconds.toFixed(3))}
            onChange={(e) => store.setOffset(lane.laneId, Number(e.target.value))}
            className="input !w-24 !px-2 !py-1 text-xs"
            aria-label="Start, in seconds"
          />
          <span className="truncate font-mono text-[11px] text-muted">
            {formatOffset(lane.offsetSeconds)} → {formatOffset(lane.offsetSeconds + lane.duration)}
          </span>
        </Row>
        <Row label="Nudge" hint={groupSize > 1 ? `Moves all ${groupSize} selected lanes` : undefined}>
          <div className="flex flex-wrap gap-1">
            {[
              ["−bar", -bar],
              ["−½", -2 * beat],
              ["−beat", -beat],
              ["+beat", beat],
              ["+½", 2 * beat],
              ["+bar", bar],
            ].map(([label, delta]) => (
              <button key={label} onClick={() => nudge(delta as number)} className="nudge">
                {label}
              </button>
            ))}
            <button
              onClick={() => {
                const playhead = useStudioStore.getState().playhead;
                nudge(snapTime(playhead, useStudioStore.getState()) - lane.offsetSeconds);
              }}
              className="nudge"
            >
              to playhead
            </button>
          </div>
        </Row>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <button
            onClick={() => previewPlayer.toggle({ stemId: lane.stemId, title: lane.trackTitle, artist: lane.artistName, kind: lane.kind })}
            className={pill}
          >
            <Play className="fill-current" /> Original stem
          </button>
          <button
            onClick={() => {
              startNewStep();
              store.duplicateLane(lane.laneId);
            }}
            className={pill}
          >
            <CopyPlus /> Duplicate lane
          </button>
          <button
            onClick={() => startLaneExport(lane, `${kindLabel(lane.kind)} lane`)}
            disabled={exporting}
            className={pill}
            title="Just this lane, with its effects — in the format picked under Export"
          >
            <Download /> {exporting ? "Exporting…" : "Export lane"}
          </button>
          <button
            onClick={() => {
              startNewStep();
              store.removeLane(lane.laneId);
            }}
            className={`${pill} hover:!border-danger hover:!text-danger`}
          >
            <X /> Remove
          </button>
        </div>
      </div>
    </div>
  );
}

function TempoTab({ lane }: { lane: StudioLane }) {
  const projectBpm = useStudioStore((s) => s.projectBpm);
  const keyRef = useStudioStore((s) => keyReference(s.lanes));
  const store = useStudioStore.getState();
  const [pitchDraft, setPitchDraft] = useState(lane.pitchSemitones);
  const [seenPitch, setSeenPitch] = useState(lane.pitchSemitones);
  const [tempoDraft, setTempoDraft] = useState(lane.tempoRatio);
  const [seenTempo, setSeenTempo] = useState(lane.tempoRatio);
  const pitchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tempoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (pitchTimer.current) clearTimeout(pitchTimer.current);
      if (tempoTimer.current) clearTimeout(tempoTimer.current);
    },
    []
  );

  // Follow changes made elsewhere (undo, AI, match all) — during render, per React's guidance.
  if (lane.pitchSemitones !== seenPitch) {
    setSeenPitch(lane.pitchSemitones);
    setPitchDraft(lane.pitchSemitones);
  }
  if (lane.tempoRatio !== seenTempo) {
    setSeenTempo(lane.tempoRatio);
    setTempoDraft(lane.tempoRatio);
  }

  // Both re-render the lane's audio offline, so they commit on a short debounce.
  function changePitch(value: number) {
    setPitchDraft(value);
    if (pitchTimer.current) clearTimeout(pitchTimer.current);
    pitchTimer.current = setTimeout(() => store.setPitchSemitones(lane.laneId, value), 150);
  }
  function changeTempo(value: number) {
    setTempoDraft(value);
    if (tempoTimer.current) clearTimeout(tempoTimer.current);
    tempoTimer.current = setTimeout(() => store.setTempoRatio(lane.laneId, value), 200);
  }

  const isReference = keyRef?.laneId === lane.laneId;
  const targetKey = keyRef && !isReference ? effectiveKey(keyRef) : null;
  const playsAt = lane.bpm ? lane.bpm * tempoDraft : null;

  return (
    <div className="grid gap-x-8 gap-y-3 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <Row label="Speed" hint="Time-stretch without changing pitch">
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.005}
            value={tempoDraft}
            onChange={(e) => changeTempo(Number(e.target.value))}
            onDoubleClick={() => changeTempo(1)}
            className="h-1.5 min-w-0 flex-1"
            aria-label="Speed"
          />
          <span className="w-24 text-right font-mono text-[11px] text-muted tabular-nums">
            {tempoDraft.toFixed(3)}×{playsAt ? ` · ${playsAt.toFixed(1)}` : ""}
          </span>
        </Row>
        <Row label="Source BPM" hint="The stem's own tempo — fix it if detection got it wrong">
          <input
            type="number"
            min={20}
            max={300}
            step={0.1}
            value={lane.bpm ?? ""}
            placeholder="—"
            onChange={(e) => store.setLaneBpm(lane.laneId, e.target.value === "" ? null : Number(e.target.value))}
            className="input !w-20 !px-2 !py-1 text-xs"
            aria-label="Source BPM"
          />
          <TapTempo onTempo={(bpm) => store.setLaneBpm(lane.laneId, Math.round((bpm / lane.tempoRatio) * 10) / 10)} />
          <button
            onClick={() => store.matchLaneToProject(lane.laneId)}
            disabled={!lane.bpm}
            className={pill}
            title={`Stretch this lane to the project tempo (${projectBpm.toFixed(1)} BPM)`}
          >
            Fit to {projectBpm.toFixed(1)}
          </button>
        </Row>
        <div className="flex flex-wrap gap-1.5 text-[11px] text-muted">
          {lane.bpm &&
            [0.5, 2].map((factor) => (
              <button
                key={factor}
                onClick={() => store.setLaneBpm(lane.laneId, Math.round(lane.bpm! * factor * 10) / 10)}
                className="nudge"
                title="Detection often reads half or double the real tempo"
              >
                read as {(lane.bpm! * factor).toFixed(1)}
              </button>
            ))}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Row label="Pitch" hint="Semitones — key-shift a vocal to fit the beat">
          <input
            type="range"
            min={-12}
            max={12}
            step={1}
            value={pitchDraft}
            onChange={(e) => changePitch(Number(e.target.value))}
            onDoubleClick={() => changePitch(0)}
            className="h-1.5 min-w-0 flex-1"
            aria-label="Pitch in semitones"
          />
          <span className="w-24 text-right font-mono text-[11px] text-muted tabular-nums">
            {pitchDraft > 0 ? `+${pitchDraft}` : pitchDraft} st
          </span>
        </Row>
        <Row label="Source key" hint="Detected automatically — fix it if it's wrong">
          <select
            value={lane.musicalKey ? keyId(lane.musicalKey) : ""}
            onChange={(e) => store.setLaneKey(lane.laneId, parseKeyId(e.target.value))}
            className="input !w-24 !px-2 !py-1 text-xs"
            aria-label="Source key"
          >
            <option value="">{lane.musicalKey ? "—" : "…"}</option>
            {ALL_KEYS.map((key) => (
              <option key={keyId(key)} value={keyId(key)}>
                {keyLabel(key)}
              </option>
            ))}
          </select>
          {effectiveKey(lane) && (
            <span className="text-[11px] text-muted">
              sounds in <span className="text-foreground">{keyLabel(effectiveKey(lane)!)}</span> · {camelotCode(effectiveKey(lane)!)}
            </span>
          )}
          <button
            onClick={() => store.matchLaneKey(lane.laneId)}
            disabled={!lane.musicalKey || !targetKey}
            className={`${pill} ml-auto`}
            title={targetKey ? `Shift into ${keyLabel(targetKey)}` : "This lane sets the project key"}
          >
            {isReference ? "Project key" : "Match key"}
          </button>
        </Row>
      </div>
      <div className="lg:col-span-2">
        <KeyHelper lane={lane} />
      </div>
    </div>
  );
}

/** The Edit tab acts on the selected clips — or, when none of this lane's are, all of them. */
function selectIfNone(laneId: string) {
  const { lanes, selectedClips } = useStudioStore.getState();
  if (!liveRefs(lanes, selectedClips).some((r) => r.laneId === laneId)) commands.selectLaneClips(laneId);
}

function EditTab({ lane }: { lane: StudioLane }) {
  const arranged = !!lane.clips?.length;
  return (
    <div className="flex flex-col gap-3 text-xs">
      <p className="text-[11px] text-muted">
        Acts on the selected clips — or, with none selected, at the playhead. Right-click (long-press) any clip for the full list.
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-20 text-[11px] text-muted">Track</span>
        <div className="flex overflow-hidden rounded-lg border border-border" role="group" aria-label="Whole track or clips">
          <button
            onClick={() => commands.makeWhole(lane.laneId)}
            aria-pressed={!arranged}
            className={`px-3 py-1 text-xs font-medium pointer-coarse:py-1.5 ${!arranged ? "bg-brand text-white" : "text-muted hover:text-foreground"}`}
          >
            <RectangleHorizontal /> Whole track
          </button>
          <span className={`border-l border-border px-3 py-1 text-xs font-medium pointer-coarse:py-1.5 ${arranged ? "bg-brand text-white" : "text-muted"}`}>
            <SquareSplitHorizontal /> {arranged ? `${lane.clips!.length} clips` : "Clips"}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-20 text-[11px] text-muted">Split into</span>
        <button onClick={() => void commands.splitLane(lane.laneId, "silences")} className="nudge" title="One clip per phrase — the gaps are dropped">
          phrases (at silences)
        </button>
        {([1, 2, 4, 8] as const).map((bars) => (
          <button key={bars} onClick={() => commands.splitLane(lane.laneId, bars)} className="nudge" title="Equal clips on the bar lines, nothing dropped">
            every {bars} bar{bars === 1 ? "" : "s"}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => commands.splitAt(undefined, [lane.laneId])} className={pill}>
          <SquareSplitHorizontal /> Split at playhead
        </button>
        <button onClick={() => commands.selectLaneClips(lane.laneId)} className={pill}>
          <SquareDashed /> Select all its clips
        </button>
        <button onClick={() => commands.toPad(lane.laneId)} className={pill}>
          <LayoutGrid /> To a sample pad
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-20 text-[11px] text-muted">Stutter</span>
        {([
          ["1/16×8", 0.25, 8],
          ["1/8×4", 0.5, 4],
          ["1/8×8", 0.5, 8],
          ["1 beat×4", 1, 4],
          ["½ bar×2", 2, 2],
          ["1 bar×2", 4, 2],
        ] as const).map(([label, beats, repeats]) => (
          <button
            key={label}
            onClick={() => commands.stutter(beats, repeats, undefined, lane.laneId)}
            className="nudge"
            title="Beat repeat from the playhead, DJ-style"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-20 text-[11px] text-muted">Slice every</span>
        {([
          ["1/16", 0.25],
          ["1/8", 0.5],
          ["beat", 1],
          ["bar", 4],
        ] as const).map(([label, beats]) => (
          <button key={label} onClick={() => (selectIfNone(lane.laneId), commands.slice(beats))} className="nudge" title="Chop the clips at every grid line">
            {label}
          </button>
        ))}
        <button onClick={commands.join} className="nudge" title="Join selected pieces that follow on (⌘/Ctrl J)">
          <Combine /> join
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-20 text-[11px] text-muted">Fit to</span>
        {[1, 2, 4, 8].map((bars) => (
          <button key={bars} onClick={() => (selectIfNone(lane.laneId), commands.fitToBars(bars))} className="nudge" title="Speed the clip up or down (pitch stays) to last exactly this long">
            {bars} bar{bars === 1 ? "" : "s"}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-20 text-[11px] text-muted">Clip level</span>
        <button onClick={() => (selectIfNone(lane.laneId), commands.clipGain(-3))} className="nudge">−3 dB</button>
        <button onClick={() => (selectIfNone(lane.laneId), commands.clipGain(3))} className="nudge">+3 dB</button>
        <button onClick={() => (selectIfNone(lane.laneId), commands.resetClipGain())} className="nudge">0 dB</button>
        <button onClick={() => (selectIfNone(lane.laneId), commands.toggleClipMute())} className="nudge" title="Mute / unmute (⇧M)">
          <VolumeX /> mute
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-20 text-[11px] text-muted">Fades</span>
        <button onClick={() => (selectIfNone(lane.laneId), commands.clipFade("in", 1))} className="nudge">in 1 beat</button>
        <button onClick={() => (selectIfNone(lane.laneId), commands.clipFade("out", 1))} className="nudge">out 1 beat</button>
        <button onClick={() => (selectIfNone(lane.laneId), commands.clipFade("both", 4))} className="nudge">in+out 1 bar</button>
        <button onClick={() => (selectIfNone(lane.laneId), commands.clipFade("both", 0))} className="nudge">off</button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-20 text-[11px] text-muted" title="Over the loop when one is on, else the whole lane">Rhythm</span>
        <button onClick={() => commands.pump(lane.laneId)} className="nudge" title="Dips on every beat and swells back — the sidechain feel">pump</button>
        <button onClick={() => commands.gate(lane.laneId, 0.5)} className="nudge" title="On and off every eighth note">gate 1/8</button>
        <button onClick={() => commands.gate(lane.laneId, 0.25)} className="nudge" title="On and off every sixteenth — trance gate">gate 1/16</button>
        <button onClick={() => commands.clearAutomation(lane.laneId)} className="nudge">clear</button>
      </div>
    </div>
  );
}

/** The question the lane's "Ask AI" starts with — the person can change it before sending. */
function askAbout(lane: StudioLane) {
  const what = lane.kind === "vocals" ? "this vocal" : "this beat";
  return `About “${laneName(lane)}” (lane ${lane.laneId}): how can ${what} sit better in the mix? Check its timing, key and sound, and try a fix.`;
}

function InspectorBody({ lane, onClose }: { lane: StudioLane; onClose?: () => void }) {
  const tab = useStudioView((s) => s.inspectorTab);
  const setTab = useStudioView((s) => s.setInspectorTab);
  const accent = kindColor(lane.kind);
  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-3 pt-2.5">
        <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: accent }} />
        <div className="min-w-0 pb-2">
          <p className="truncate text-sm font-semibold leading-tight">{laneName(lane)}</p>
          <p className="truncate text-[11px] text-muted">
            {kindLabel(lane.kind)} · {lane.artistName}
          </p>
        </div>
        <button
          onClick={() => useStudioView.getState().askAi(askAbout(lane))}
          className="mb-2 flex h-8 shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 text-[11px] font-semibold text-muted hover:border-brand hover:text-foreground"
          title="Ask the AI co-producer about this lane"
        >
          <MessageCircle className="text-brand-strong" />
          <span className="max-sm:hidden">Ask AI</span>
        </button>
        <nav className="ml-auto flex min-w-0 gap-0.5 self-end overflow-x-auto scrollbar-thin max-md:hidden" aria-label="Lane settings">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id}
              className={`shrink-0 border-b-2 px-3 pb-2 text-xs font-medium transition-colors ${
                tab === t.id ? "border-brand text-foreground" : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        {onClose && (
          <button onClick={onClose} className="ml-auto mb-2 h-9 rounded-lg bg-brand px-4 text-sm font-semibold text-white md:hidden">
            Done
          </button>
        )}
      </div>
      <nav className="flex gap-1 overflow-x-auto border-b border-border px-2 py-1.5 scrollbar-thin md:hidden" aria-label="Lane settings">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${tab === t.id ? "bg-brand text-white" : "bg-surface-raised text-muted"}`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="p-3 sm:p-4">
        {tab === "mix" && <MixTab lane={lane} />}
        {tab === "tempo" && <TempoTab key={lane.laneId} lane={lane} />}
        {tab === "fx" && <LaneFxPanel lane={lane} />}
        {tab === "edit" && <EditTab lane={lane} />}
        {tab === "match" && <LaneMatchPanel key={lane.laneId} lane={lane} />}
      </div>
    </>
  );
}

export default function LaneInspector() {
  const lane = useStudioStore((s) => s.lanes.find((l) => l.laneId === s.selectedLaneIds[0]) ?? null);
  const open = useStudioView((s) => s.inspectorOpen);
  const close = useStudioView((s) => s.closeInspector);
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 47.999rem)");
    const update = () => setIsPhone(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!isPhone || !open) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [isPhone, open]);

  if (!lane) {
    return isPhone ? null : (
      <div className="rounded-xl border border-dashed border-border px-4 py-3 text-center text-xs text-muted">
        Click a lane&apos;s name to edit its level, tempo, key, effects and matching here.
      </div>
    );
  }

  if (isPhone) {
    if (!open) return null;
    return (
      <>
        <div className="fixed inset-0 z-[60] bg-black/55" onClick={close} />
        <div
          className="fixed inset-x-0 bottom-0 z-[61] max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-2xl border border-b-0 border-border bg-surface pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl"
          style={{ animation: "sheet-in 0.2s ease-out" }}
          role="dialog"
          aria-label={`${laneName(lane)} settings`}
        >
          <InspectorBody lane={lane} onClose={close} />
        </div>
      </>
    );
  }

  return (
    <section aria-label="Lane inspector" className="overflow-hidden rounded-xl border border-border bg-surface">
      <InspectorBody lane={lane} />
    </section>
  );
}
