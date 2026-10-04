"use client";

import { audioEngine } from "./audioEngine";
import { siblingStems } from "./beatParts";
import { isConstrainedDevice, splitter, uploadStems, type UploadStage } from "./splitter";
import type { LaneKind, LoadableStem, StudioLane } from "./studioStore";

// Demucs on any lane, right in the Studio: the lane's stem is run through
// the same in-browser model as an upload, its vocals, drums, bass and
// melody are saved to the person's library as a new track (so the result
// keeps, can be shared in a remix, and never has to be split again), and
// handed back to be laid on the timeline (beatParts.placeStems).

export type SplitKind = "vocals" | "drums" | "bass" | "other";

export const SPLIT_KINDS: { id: SplitKind; label: string; icon: string }[] = [
  { id: "vocals", label: "Vocals", icon: "🎤" },
  { id: "drums", label: "Drums", icon: "🥁" },
  { id: "bass", label: "Bass", icon: "🎸" },
  { id: "other", label: "Melody", icon: "🎹" },
];

/** What splitting a lane is usually for: a beat into its parts, a vocal cleaned of what bled in. */
export function defaultKinds(kind: LaneKind): SplitKind[] {
  if (kind === "beat") return ["drums", "bass", "other"];
  if (kind === "vocals") return ["vocals"];
  return [kind];
}

/** The model needs more memory than a phone gives a page. */
export function canSplitHere() {
  return !isConstrainedDevice();
}

const RATE = 44100;

/** The lane's whole stem as 44.1 kHz stereo, the way the model wants it. */
async function laneAudio(lane: StudioLane) {
  await audioEngine.ensureLane(lane.laneId, lane.stemId);
  const buffer = audioEngine.getRawBuffer(lane.laneId);
  if (!buffer) throw new Error("Couldn't load this lane's audio");
  const ctx = new OfflineAudioContext(2, Math.ceil(buffer.duration * RATE), RATE);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start();
  const out = await ctx.startRendering();
  return { left: out.getChannelData(0), right: out.getChannelData(1), duration: out.duration };
}

async function json<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? fallback);
  return data as T;
}

/**
 * Splits the lane's stem with Demucs on this device, saves the result to
 * the library, and returns its stems (vocals, drums, bass, melody).
 */
export async function splitLane(lane: StudioLane, onStage: (stage: UploadStage) => void, signal?: AbortSignal): Promise<LoadableStem[]> {
  if (!canSplitHere()) throw new Error("Splitting needs a computer — a phone doesn't have the memory for the model.");
  const { result, duration } = await splitter.exclusive(true, () => onStage({ stage: "waiting" }), async () => {
    signal?.throwIfAborted();
    void splitter.load().catch(() => {});
    onStage({ stage: "decoding" });
    const { left, right, duration } = await laneAudio(lane);
    if (splitter.state.status !== "ready") onStage({ stage: "loading-model" });
    await splitter.load();
    onStage({ stage: "splitting", progress: 0 });
    const result = await splitter.split(left, right, (stage, value) => onStage({ stage, progress: value }), signal);
    return { result, duration };
  });

  onStage({ stage: "saving" });
  const title = `${lane.trackTitle} (split)`.slice(0, 200);
  const track = await json<{ id: string; uploads: Parameters<typeof uploadStems>[0] }>(
    await fetch("/api/tracks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        filename: `${lane.trackTitle.slice(0, 280)}.wav`,
        duration,
        bpm: result.bpm ?? lane.bpm,
        vocalsPeaks: result.peaks.vocals,
        beatPeaks: result.peaks.beat,
        partPeaks: { drums: result.peaks.drums, bass: result.peaks.bass, other: result.peaks.other },
        tags: ["studio-split"],
        // The stem is already in the library under someone's confirmed rights.
        rightsConfirmed: true,
      }),
    }),
    "Couldn't save the split"
  );
  await uploadStems(track.uploads, result, onStage);
  onStage({ stage: "saving" });
  await json(await fetch(`/api/tracks/${track.id}/complete`, { method: "POST" }), "Couldn't finish saving the split");

  // Its four parts, as the library knows them: the siblings of its beat.
  const { stems } = await json<{ stems: { id: string; kind: string }[] }>(await fetch(`/api/tracks/${track.id}`), "Couldn't read the split back");
  const beat = stems.find((s) => s.kind === "beat");
  if (!beat) throw new Error("The split didn't save its parts");
  return siblingStems({ stemId: beat.id }, { fresh: true });
}
