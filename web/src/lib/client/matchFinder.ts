import type { LoadableStem } from "./studioStore";

// "Find a beat that fits": the library's stems ranked by how little they'd
// have to be stretched to play at a vocal's tempo (or the other way round).
// Half and double time count — a 70 BPM vocal sits on a 140 BPM beat.
// Pure, so it can be tested without the library or a browser.

export type TempoFit = {
  /** How much the candidate would be sped up (>1) or slowed down to fit. */
  stretch: number;
  /** Read at half (0.5) or double (2) its tempo, or as is (1). */
  factor: 0.5 | 1 | 2;
};

/** How a stem at `bpm` fits a part at `targetBpm`: the gentlest of as-is, half and double time. */
export function tempoFit(targetBpm: number, bpm: number): TempoFit | null {
  if (!(targetBpm > 0) || !(bpm > 0)) return null;
  let best: TempoFit | null = null;
  for (const factor of [1, 0.5, 2] as const) {
    const stretch = targetBpm / (bpm * factor);
    if (!best || Math.abs(Math.log(stretch)) < Math.abs(Math.log(best.stretch)) - 1e-9) best = { stretch, factor };
  }
  return best;
}

/** A fit in words: "same speed", "4% faster", "half time, 2% slower". */
export function describeFit(fit: TempoFit) {
  const change = Math.abs(fit.stretch - 1);
  const speed = change < 0.015 ? "same speed" : `${Math.round(change * 100)}% ${fit.stretch > 1 ? "faster" : "slower"}`;
  return fit.factor === 1 ? speed : `${fit.factor === 0.5 ? "half" : "double"} time, ${speed}`;
}

export type Candidate<T extends LoadableStem> = { stem: T; fit: TempoFit };

/**
 * The stems that fit `targetBpm` best, closest first — none needing more
 * than `maxStretch` (25%) either way. Stems without a tempo, and those in
 * `exclude`, are left out.
 */
export function rankByTempo<T extends LoadableStem>(
  stems: T[],
  targetBpm: number,
  { exclude = new Set<string>(), limit = 6, maxStretch = 0.25 }: { exclude?: Set<string>; limit?: number; maxStretch?: number } = {}
): Candidate<T>[] {
  return stems
    .filter((s) => !exclude.has(s.id))
    .map((stem) => ({ stem, fit: tempoFit(targetBpm, stem.track_bpm ?? 0) }))
    .filter((c): c is Candidate<T> => !!c.fit && Math.abs(Math.log(c.fit.stretch)) <= Math.log(1 + maxStretch))
    .sort((a, b) => Math.abs(Math.log(a.fit.stretch)) - Math.abs(Math.log(b.fit.stretch)))
    .slice(0, limit);
}
