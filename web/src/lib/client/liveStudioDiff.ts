// What changed between two versions of a live studio session's mix, in
// words — the "what the artist is doing" feed listeners see beside the
// Studio. Pure, so it runs (and is tested) without a browser.

export type DiffLane = {
  laneId: string;
  kind: string;
  trackTitle: string;
  name?: string;
  muted: boolean;
  solo?: boolean;
  volume: number;
  offsetSeconds: number;
  pitchSemitones: number;
  tempoRatio: number;
  fx?: Record<string, unknown>;
  clips?: { from: number; to: number; at: number }[] | null;
  automation?: Record<string, unknown>;
};

export type DiffMix = {
  lanes: DiffLane[];
  project: {
    projectBpm?: number;
    loopEnabled?: boolean;
    markers?: unknown[];
    pads?: unknown[];
    master?: unknown;
    crossfader?: number;
  };
};

const FX_WORDS: Record<string, string> = {
  pan: "panning",
  highpass: "the high-pass filter",
  lowpass: "the low-pass filter",
  eqLow: "the bass EQ",
  eqMid: "the mid EQ",
  eqHigh: "the treble EQ",
  drive: "drive",
  compress: "compression",
  width: "stereo width",
  reverb: "reverb",
  reverbSize: "the reverb size",
  delay: "delay",
  delayDivision: "the delay timing",
  delayTime: "the delay time",
  delayFeedback: "delay feedback",
  fadeIn: "the fade-in",
  fadeOut: "the fade-out",
  duck: "sidechain ducking",
};

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function laneLabel(lane: DiffLane) {
  return `“${lane.name ?? lane.trackTitle}” ${lane.kind === "beat" ? "beat" : lane.kind}`;
}

function list(words: string[]) {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** Up to `max` short lines, most telling first. Empty when nothing a listener would notice changed. */
export function describeMixChanges(prev: DiffMix | null, next: DiffMix, max = 4): string[] {
  const lines: string[] = [];
  const before = new Map((prev?.lanes ?? []).map((l) => [l.laneId, l]));
  const after = new Map(next.lanes.map((l) => [l.laneId, l]));

  if (!prev) {
    if (next.lanes.length) lines.push(`Opened a mix with ${next.lanes.length} stem${next.lanes.length === 1 ? "" : "s"}`);
    return lines;
  }

  for (const lane of next.lanes) if (!before.has(lane.laneId)) lines.push(`Added ${laneLabel(lane)}`);
  for (const lane of prev.lanes) if (!after.has(lane.laneId)) lines.push(`Removed ${laneLabel(lane)}`);

  for (const lane of next.lanes) {
    const was = before.get(lane.laneId);
    if (!was) continue;
    const name = laneLabel(lane);
    if (was.muted !== lane.muted) lines.push(`${lane.muted ? "Muted" : "Unmuted"} ${name}`);
    if (!!was.solo !== !!lane.solo) lines.push(`${lane.solo ? "Soloed" : "Unsoloed"} ${name}`);
    if (Math.abs(was.volume - lane.volume) >= 0.03) {
      lines.push(`Turned ${name} ${lane.volume > was.volume ? "up" : "down"} to ${Math.round(lane.volume * 100)}%`);
    }
    if (Math.abs(was.pitchSemitones - lane.pitchSemitones) > 0.01) {
      const p = Math.round(lane.pitchSemitones * 10) / 10;
      lines.push(`Pitched ${name} to ${p > 0 ? "+" : ""}${p} semitones`);
    }
    if (Math.abs(was.tempoRatio - lane.tempoRatio) > 0.0005) lines.push(`Changed ${name}'s speed to ${lane.tempoRatio.toFixed(3)}×`);
    if (Math.abs(was.offsetSeconds - lane.offsetSeconds) > 0.005) lines.push(`Moved ${name} on the timeline`);
    if (!same(was.clips, lane.clips)) {
      const a = was.clips?.length ?? 1;
      const b = lane.clips?.length ?? 1;
      lines.push(
        b > a ? `Cut ${name} into ${b} clips` : b < a ? `Removed ${a - b} clip${a - b === 1 ? "" : "s"} from ${name}` : `Rearranged the clips of ${name}`
      );
    }
    if (!same(was.fx, lane.fx)) {
      const keys = Object.keys({ ...(was.fx ?? {}), ...(lane.fx ?? {}) }).filter((k) => !same(was.fx?.[k], lane.fx?.[k]));
      const words = [...new Set(keys.map((k) => FX_WORDS[k] ?? k))];
      lines.push(`Tweaked ${list(words.slice(0, 3))}${words.length > 3 ? " and more" : ""} on ${name}`);
    }
    if (!same(was.automation, lane.automation)) lines.push(`Drew automation on ${name}`);
    if ((was.name ?? "") !== (lane.name ?? "") && lane.name) lines.push(`Renamed a lane to “${lane.name}”`);
  }

  const order = (lanes: DiffLane[]) => lanes.filter((l) => after.has(l.laneId) && before.has(l.laneId)).map((l) => l.laneId).join();
  if (order(prev.lanes) !== order(next.lanes)) lines.push("Reordered the lanes");

  const p = prev.project;
  const n = next.project;
  if (p.projectBpm !== undefined && n.projectBpm !== undefined && Math.abs(p.projectBpm - n.projectBpm) > 0.05) {
    lines.push(`Set the tempo to ${Math.round(n.projectBpm * 10) / 10} BPM`);
  }
  if (!!p.loopEnabled !== !!n.loopEnabled) lines.push(n.loopEnabled ? "Started looping a section" : "Stopped looping");
  if ((n.markers?.length ?? 0) > (p.markers?.length ?? 0)) lines.push("Marked a section");
  if (!same(p.pads, n.pads)) lines.push("Changed the sample pads");
  if (!same(p.master, n.master)) lines.push("Adjusted the master");
  if (p.crossfader !== undefined && n.crossfader !== undefined && Math.abs(p.crossfader - n.crossfader) > 0.02) {
    lines.push("Moved the crossfader");
  }
  return lines.slice(0, max);
}
