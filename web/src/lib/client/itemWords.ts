import { autoTime, isSung, parseLyrics, serializeLyrics, type Envelope, type LyricLine } from "@/lib/lyrics";
import { voiceProfile, type VoiceProfile } from "@/lib/lyricsFit";
import type { StudioLane } from "./studioStore";
import { layOut, linesInEveryPlay } from "./vocalTime";

// A song's or remix's words placed on it as heard — for the radio, where
// the listener has only what the song is made of (its lanes), not the
// maker's lyric sheets. Found lyrics are timed to the vocal's recording;
// these put each line wherever that moment of the vocal plays (clips moved,
// cut, repeated, stretched), time untimed words from the vocal's waveform,
// and read a chosen sheet back with its nudge. No audio, no store: tested.

/** A choice of words for a song or remix (the listener's own, or set for everyone). */
export type WordsChoice = { lrc: string; shift: number; noWords: boolean; song: string };

/** The vocal's loudness through its recording, from the waveform drawn for it (no download, no decoding). */
export function peaksEnvelope(lane: Pick<StudioLane, "peaks" | "originalDuration">): Envelope {
  const peaks = lane.peaks ?? [];
  return { values: peaks, start: 0, step: lane.originalDuration / Math.max(1, peaks.length) };
}

/** What the vocal sounds like (where singing starts and stops, how many phrases), from its waveform. */
export function voiceOf(lane: Pick<StudioLane, "peaks" | "originalDuration">): VoiceProfile | null {
  return lane.peaks?.length && lane.originalDuration > 0 ? voiceProfile(peaksEnvelope(lane), lane.originalDuration) : null;
}

/** Timed lines of a recording (seconds into `stemId`), put wherever each moment plays in the song as heard, across its vocal lanes. */
export function placeWords(lanes: StudioLane[], stemId: string, timed: LyricLine[]): LyricLine[] {
  const at = timed.filter((l) => l.time !== null && isSung(l)).map((l) => ({ at: l.time!, text: l.text }));
  const vocals = lanes.filter((l) => l.kind === "vocals" && l.stemId === stemId && !l.muted);
  return vocals.length ? linesInEveryPlay(vocals.map((lane) => ({ lane, lines: at }))) : [];
}

/** Words with no times, timed from where the vocal sings (its waveform laid out as it plays): one line per sung phrase. Null when it can't. */
export function timeWords(words: LyricLine[], lane: StudioLane): LyricLine[] | null {
  const sung = words.filter(isSung).map((l) => ({ time: null, text: l.text }));
  if (!sung.length || !lane.peaks?.length) return null;
  const timed = autoTime(sung, layOut(lane, peaksEnvelope(lane)));
  return timed?.some((l) => l.time !== null) ? timed : null;
}

/** A choice's lines, nudged by its shift: the sung, timed ones, in order. */
export function linesOfChoice(choice: Pick<WordsChoice, "lrc" | "shift">): LyricLine[] {
  return parseLyrics(choice.lrc)
    .filter((l) => l.time !== null && isSung(l))
    .map((l) => ({ time: Math.max(0, Math.round((l.time! + choice.shift) * 100) / 100), text: l.text }))
    .sort((a, b) => a.time! - b.time!);
}

/** Lines as a choice's LRC. */
export function choiceLrc(lines: LyricLine[]): string {
  return serializeLyrics(lines.filter((l) => l.time !== null));
}
