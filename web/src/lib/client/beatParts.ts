"use client";

import { isStemKind } from "@/lib/stemKinds";
import { startNewStep } from "./studioHistory";
import { useStudioStore, type LoadableStem, type StudioLane } from "./studioStore";

// Every song is split by Demucs into vocals, drums, bass and the rest
// ("other": chords, melody); the beat is those three summed. These find a
// lane's sibling stems in the library — split when its song was uploaded,
// or later in the Studio (laneSplit.ts) — and put them on the timeline
// exactly where the lane is: same place, speed, pitch, clips and sound.
// A beat swapped for its three parts sounds identical, but lets drums and
// bass drop out on their own: the drops, builds and breakdowns the AI
// producer suggests once they're there.

const cache = new Map<string, Promise<LoadableStem[]>>();

/** The other stems of the lane's song (vocals, drums, bass, melody), if the library has them. */
export function siblingStems(lane: Pick<StudioLane, "stemId">, { fresh = false } = {}): Promise<LoadableStem[]> {
  let found = fresh ? undefined : cache.get(lane.stemId);
  if (!found) {
    found = fetch(`/api/stems/${lane.stemId}/parts`)
      .then((res) => (res.ok ? res.json() : { parts: [] }))
      .then((data: { parts: (Omit<LoadableStem, "kind"> & { kind: string })[] }) =>
        data.parts.flatMap((p) => (isStemKind(p.kind) ? [{ ...p, kind: p.kind }] : []))
      )
      .catch(() => []);
    cache.set(lane.stemId, found);
  }
  return found;
}

/** The beat's drums, bass and melody, if the library has them. */
export async function findParts(beat: StudioLane): Promise<LoadableStem[]> {
  return (await siblingStems(beat)).filter((s) => s.kind === "drums" || s.kind === "bass" || s.kind === "other");
}

/** Whether the mix already has the parts of this beat's song. */
export function hasParts(lanes: StudioLane[], parts: LoadableStem[]) {
  return parts.some((p) => lanes.some((l) => l.stemId === p.id));
}

/**
 * Adds `stems` as lanes lined up exactly with `sourceLaneId` — and, with
 * `replace`, takes the source lane away (its parts add up to it). One undo
 * step. Returns the new lanes' ids.
 */
export function placeStems(sourceLaneId: string, stems: LoadableStem[], { replace }: { replace: boolean }): string[] {
  const store = useStudioStore.getState();
  const source = store.lanes.find((l) => l.laneId === sourceLaneId);
  if (!source || !stems.length) return [];
  startNewStep();
  const ids = stems.map((stem) => store.addStem(stem));
  store.applyLanePatches(
    Object.fromEntries(
      ids.map((id) => [
        id,
        {
          bpm: source.bpm,
          musicalKey: source.musicalKey,
          pitchSemitones: source.pitchSemitones,
          tempoRatio: source.tempoRatio,
          offsetSeconds: source.offsetSeconds,
          volume: source.volume,
          fx: { ...source.fx },
          clips: source.clips?.map((c) => ({ ...c })) ?? null,
          automation: { ...source.automation },
        },
      ])
    )
  );
  if (replace) store.removeLane(sourceLaneId);
  return ids;
}

/** Replaces the beat lane with its parts, lined up exactly where it was — one undo step. */
export function swapInParts(beatLaneId: string, parts: LoadableStem[]): string[] {
  return placeStems(beatLaneId, parts, { replace: true });
}
