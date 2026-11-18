// How well a found lyric sheet fits the vocal it's for. The library has
// many copies of a popular song — radio edits, live takes, a remix, the
// same title by someone else — and the title alone can't tell them apart.
// The singing can: a timed sheet's last line should come when the vocal
// stops singing, its first when it starts, and a sheet should have about
// as many lines as the vocal has sung phrases. Pure, so the lyrics picker
// and the tests share it.

import { isSung, parseLyrics, voicedRuns, type Envelope, type LyricsResult } from "./lyrics";

/** What the vocal sounds like, in seconds into its recording (the stem, not the edited timeline). */
export type VoiceProfile = {
  /** When the singing starts and stops. */
  firstSung: number;
  lastSung: number;
  /** Stretches of singing between real pauses — about one per line. */
  phrases: number;
  /** The recording's length. */
  duration: number;
};

/** A pause this long ends a phrase; shorter ones are breaths inside a line. */
const PHRASE_GAP = 0.45;

/** The vocal's shape from its loudness curve; null when nothing is sung in it. */
export function voiceProfile(env: Envelope, duration: number): VoiceProfile | null {
  const runs = voicedRuns(env);
  if (!runs.length) return null;
  let phrases = 1;
  for (let i = 1; i < runs.length; i++) if (runs[i][0] - runs[i - 1][1] >= PHRASE_GAP) phrases++;
  return { firstSung: runs[0][0], lastSung: runs[runs.length - 1][1], phrases, duration };
}

export type VoiceFit = {
  /** 0 (doesn't fit this vocal) to 1 (surely its words). */
  score: number;
  /** A few plain words on why, shown with the result. */
  why: string;
};

/** 1 within `good` seconds, falling to 0 at `bad`. */
function closeness(off: number, good: number, bad: number) {
  if (off <= good) return 1;
  if (off >= bad) return 0;
  return 1 - (off - good) / (bad - good);
}

/**
 * How well `result` fits the vocal: its length against the recording's,
 * its first and last times against where the singing starts and stops
 * (timed sheets), and its line count against the sung phrases. Null when
 * there's nothing to compare (no words).
 */
export function voiceFit(result: Pick<LyricsResult, "duration" | "plain" | "synced">, voice: VoiceProfile): VoiceFit | null {
  const text = result.synced ?? result.plain;
  if (!text) return null;
  const lines = parseLyrics(text).filter(isSung);
  if (!lines.length) return null;

  const parts: { weight: number; value: number }[] = [];
  const reasons: string[] = [];

  if (result.duration) {
    const off = Math.abs(result.duration - voice.duration);
    parts.push({ weight: 1, value: closeness(off, 3, 25) });
    if (off <= 3) reasons.push("same length");
  }

  const times = lines.map((l) => l.time).filter((t): t is number => t !== null);
  if (result.synced && times.length >= 2) {
    // The last line starts a few seconds before the singing stops: it still has to be sung.
    const last = Math.max(...times);
    const endOff = Math.max(0, last - voice.lastSung, voice.lastSung - last - 8);
    const startOff = Math.abs(Math.min(...times) - voice.firstSung);
    const end = closeness(endOff, 2, 30);
    const start = closeness(startOff, 2, 20);
    parts.push({ weight: 2, value: end }, { weight: 1, value: start });
    if (end > 0.8 && start > 0.8) reasons.push("timed to this vocal");
    else if (end < 0.3) reasons.push(last > voice.lastSung ? "runs past the singing" : "ends before the singing does");
  }

  // A line is usually one phrase; a long line can be two, two short ones one.
  if (voice.phrases >= 4) {
    const ratio = lines.length / voice.phrases;
    const value = ratio >= 0.6 && ratio <= 1.6 ? 1 : ratio < 0.6 ? Math.max(0, ratio / 0.6 - 0.35) / 0.65 : closeness(ratio, 1.6, 3.5);
    parts.push({ weight: 1, value });
    if (value < 0.4) reasons.push(ratio < 0.6 ? "fewer lines than are sung" : "more lines than are sung");
  }

  if (!parts.length) return null;
  const total = parts.reduce((s, p) => s + p.weight, 0);
  const score = Math.round((parts.reduce((s, p) => s + p.weight * p.value, 0) / total) * 100) / 100;
  if (!reasons.length) reasons.push(score >= 0.7 ? "fits the singing" : "doesn't line up with the singing");
  return { score, why: reasons.join(", ") };
}

/**
 * Results put in order for this vocal: the server's order (title match,
 * timed first) kept as the base, each moved up as far as it fits the
 * singing better. A sheet that clearly fits beats a slightly better
 * title; one that clearly doesn't drops below those that do.
 */
export function rankByVoice<T extends Pick<LyricsResult, "duration" | "plain" | "synced">>(results: T[], voice: VoiceProfile | null): { result: T; fit: VoiceFit | null }[] {
  const scored = results.map((result, i) => {
    const fit = voice ? voiceFit(result, voice) : null;
    // The server's order is worth a little; fitting the singing is worth more.
    const base = results.length > 1 ? 1 - i / (results.length - 1) : 1;
    return { result, fit, rank: base * 1.2 + (fit ? fit.score * 3 : 1.5) };
  });
  return scored.sort((a, b) => b.rank - a.rank).map(({ result, fit }) => ({ result, fit }));
}
