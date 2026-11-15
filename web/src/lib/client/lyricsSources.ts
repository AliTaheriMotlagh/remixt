"use client";

import { audioEngine } from "./audioEngine";
import { useStudioStore, type StudioLane } from "./studioStore";
import {
  alignToVoice,
  autoTime,
  borrowTimes,
  clearTimes,
  isSung,
  isSynced,
  lineSimilarity,
  parseLyrics,
  placeOnLane,
  plainText,
  serializeLyrics,
  shiftLines,
  splitSongTitle,
  type Envelope,
  type LyricLine,
  type LyricsPage,
  type LyricsResult,
} from "@/lib/lyrics";
import { geniusSongId, lyricsFromGeniusEmbed, type ImportedLyrics } from "@/lib/lyricsImport";

// Where lyrics and their timing come from, for the Studio: the lyrics
// library and Genius (api/lyrics/search), any lyrics page or embed code
// (api/lyrics/import), and the vocals in the mix — whose loudness shows
// where each line is sung.

export type SearchAnswer = { results: LyricsResult[]; web: LyricsPage[] };

export async function searchLyrics(params: URLSearchParams): Promise<SearchAnswer> {
  const res = await fetch(`/api/lyrics/search?${params}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Couldn't search");
  return { results: (data.results ?? []) as LyricsResult[], web: (data.web ?? []) as LyricsPage[] };
}

/** What's known about a song before its words are read: its name, and its Genius id when it came from a search. */
export type SongHint = { title?: string; artist?: string; geniusId?: number };

/** The words from a lyrics page, a Genius embed code, or a lyrics file's address — read by the server. */
export async function importLyricsLink(link: string, song: SongHint = {}): Promise<ImportedLyrics> {
  const res = await fetch("/api/lyrics/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ link: link.slice(0, 8000), geniusId: song.geniusId, title: song.title, artist: song.artist }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Couldn't read that link");
  return data as ImportedLyrics;
}

/** The same song's timed lyrics from the library, if it has them, and the length of the recording they're timed to. */
export async function findTimedVersion(title: string, artist: string, duration?: number | null): Promise<{ lines: LyricLine[]; duration: number | null } | null> {
  if (!title.trim()) return null;
  const params = new URLSearchParams({ track: title.trim().slice(0, 200) });
  if (artist.trim()) params.set("artist", artist.trim().slice(0, 200));
  if (duration) params.set("duration", String(Math.round(duration)));
  try {
    const { results } = await searchLyrics(params);
    const timed = results.find((r) => r.synced);
    return timed?.synced ? { lines: parseLyrics(timed.synced), duration: timed.duration } : null;
  } catch {
    return null;
  }
}

/** The mix lane playing a recording this long (within a few seconds) — the song the lyrics are timed to — if any. */
export function laneOfRecording(result: { duration: number | null }, lanes: StudioLane[]) {
  if (!result.duration) return null;
  return lanes.find((l) => l.artistName !== "You" && !l.clips && Math.abs(l.originalDuration - result.duration!) <= 3) ?? null;
}

/**
 * Untimed words get their times from the library's timed copy of the same
 * song, put where that song plays in the mix if it's there. The sheet's
 * new text and whether it's lined up with the mix — or null, when there's
 * no timed copy that matches the words.
 */
export async function timeFromLibrary(
  text: string,
  title: string,
  artist: string
): Promise<{ text: string; aligned: boolean; matched: number; total: number } | null> {
  const words = parseLyrics(text);
  if (!words.some(isSung)) return null;
  // Times already there are replaced: this is asked for on purpose.
  const plain = isSynced(words) ? words.map((l) => ({ ...l, time: null })) : words;
  const lanes = useStudioStore.getState().lanes;
  const song = lanes.find((l) => l.artistName !== "You" && !l.clips);
  const timed = await findTimedVersion(title, artist, song?.originalDuration);
  if (!timed) return null;
  const borrowed = borrowTimes(plain, timed.lines);
  if (!borrowed) return null;
  const lane = laneOfRecording(timed, lanes);
  const lines = lane ? placeOnLane(borrowed.lines, lane.offsetSeconds, lane.tempoRatio) : borrowed.lines;
  return { text: serializeLyrics(lines), aligned: !!lane, matched: borrowed.matched, total: borrowed.total };
}

/** A take recorded in the booth (named "… — take 3", or "Studio vocal — take 1"), rather than a song's own vocal. */
export function isTakeLane(lane: Pick<StudioLane, "kind" | "artistName" | "trackTitle">) {
  return lane.kind === "vocals" && (lane.artistName === "You" || /— take \d+|^studio vocal/i.test(lane.trackTitle));
}

/** Vocal lanes in the mix whose singing can time lyrics: the song's own vocal stem, or a take. */
export function vocalLanes(lanes: StudioLane[]): StudioLane[] {
  return lanes.filter((l) => l.kind === "vocals" && !l.clips && l.originalDuration > 0);
}

const RATE = 50;

/**
 * A lane's loudness on the timeline, 50 times a second, from its decoded
 * audio — or, when that isn't loaded, from the waveform it draws (coarser).
 */
export async function laneEnvelope(lane: StudioLane): Promise<Envelope> {
  const tempo = lane.tempoRatio > 0 ? lane.tempoRatio : 1;
  let buffer: AudioBuffer | null = null;
  try {
    await audioEngine.ensureLane(lane.laneId, lane.stemId);
    buffer = await audioEngine.getRawBuffer(lane.laneId);
  } catch {
    buffer = null;
  }
  if (!buffer) {
    const peaks = lane.peaks;
    return { values: peaks, start: lane.offsetSeconds, step: lane.originalDuration / Math.max(1, peaks.length) / tempo };
  }
  const data = buffer.getChannelData(0);
  const size = Math.max(1, Math.floor(buffer.sampleRate / RATE));
  const values = new Float32Array(Math.floor(data.length / size));
  for (let b = 0; b < values.length; b++) {
    let sum = 0;
    // Every 4th sample is plenty for a loudness curve, and 4× quicker.
    for (let i = b * size; i < (b + 1) * size; i += 4) sum += data[i] * data[i];
    values[b] = Math.sqrt(sum / (size / 4));
  }
  return { values, start: lane.offsetSeconds, step: size / buffer.sampleRate / tempo };
}

/** The mix's loudness at `rate` points a second, for drawing behind the lyrics: the lanes' waveforms, laid where they play. */
export function mixEnvelope(lanes: StudioLane[], rate = 20): Envelope {
  const end = lanes.reduce((top, l) => Math.max(top, l.offsetSeconds + (l.duration || l.originalDuration)), 0);
  const values = new Float32Array(Math.ceil(end * rate) + 1);
  const solo = lanes.some((l) => l.solo);
  for (const lane of lanes) {
    if (lane.muted || (solo && !lane.solo) || lane.peaks.length === 0) continue;
    if (lane.clips) {
      for (const clip of lane.clips) addPeaks(values, lane, clip.at, clip.from, clip.to, rate, clip.stretch ?? 1);
    } else {
      addPeaks(values, lane, lane.offsetSeconds, 0, lane.originalDuration, rate);
    }
  }
  let top = 0;
  for (const v of values) top = Math.max(top, v);
  if (top > 0) for (let i = 0; i < values.length; i++) values[i] /= top;
  return { values, start: 0, step: 1 / rate };
}

/** A piece of a lane's stem (from `from` to `to` seconds into it) played from `at` on the timeline. */
function addPeaks(values: Float32Array, lane: StudioLane, at: number, from: number, to: number, rate: number, stretch = 1) {
  const tempo = (lane.tempoRatio > 0 ? lane.tempoRatio : 1) * (stretch > 0 ? stretch : 1);
  const per = lane.peaks.length / Math.max(0.001, lane.originalDuration);
  const length = (to - from) / tempo;
  const gain = Math.min(1.5, Math.max(0, lane.volume));
  for (let i = Math.max(0, Math.floor(at * rate)); i < Math.min(values.length, Math.ceil((at + length) * rate)); i++) {
    const intoStem = from + (i / rate - at) * tempo;
    const p = lane.peaks[Math.min(lane.peaks.length - 1, Math.max(0, Math.floor(intoStem * per)))] ?? 0;
    values[i] = Math.max(values[i], p * gain);
  }
}

/** The mix lanes now, for code outside React. */
export function currentLanes() {
  return useStudioStore.getState().lanes;
}

// ── Getting the words when a site turns the server away ─────────────────

/**
 * A Genius song's words, read in this browser: its official embed script
 * runs in a sandboxed frame (no access to the Studio, nor it to the frame)
 * that hands back what the script wrote. Genius lets browsers through where
 * it turns servers away. Null when it doesn't load in time.
 */
export function geniusFromBrowser(id: number, timeoutMs = 12_000): Promise<ImportedLyrics | null> {
  if (typeof document === "undefined" || !Number.isSafeInteger(id) || id <= 0) return Promise.resolve(null);
  return new Promise((resolve) => {
    const nonce = Math.random().toString(36).slice(2);
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", "allow-scripts");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText = "position:absolute;width:1px;height:1px;left:-9999px;top:-9999px;border:0;opacity:0";
    frame.srcdoc = `<!doctype html><meta charset="utf-8"><body><div id="rg_embed_link_${id}" class="rg_embed_link" data-song-id="${id}"></div><script src="https://genius.com/songs/${id}/embed.js"></script><script>parent.postMessage({ remixtGenius: "${nonce}", html: document.body.innerHTML }, "*");</script></body>`;
    let done = false;
    const finish = (found: ImportedLyrics | null) => {
      if (done) return;
      done = true;
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      frame.remove();
      resolve(found);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow) return;
      const data = event.data as { remixtGenius?: unknown; html?: unknown } | null;
      if (!data || data.remixtGenius !== nonce || typeof data.html !== "string") return;
      // Only read as text — never put on the page.
      finish(lyricsFromGeniusEmbed(data.html.slice(0, 2_000_000)));
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    window.addEventListener("message", onMessage);
    document.body.appendChild(frame);
  });
}

/** A song's words from the lyrics library, by name — when its page can't be read. */
export async function wordsFromLibrary(title: string, artist: string): Promise<ImportedLyrics | null> {
  if (!title.trim()) return null;
  const params = new URLSearchParams({ track: title.trim().slice(0, 200) });
  if (artist.trim()) params.set("artist", artist.trim().slice(0, 200));
  try {
    const { results } = await searchLyrics(params);
    const found = results.find((r) => (r.plain || r.synced) && lineSimilarity(r.title, title) >= 0.5);
    if (!found) return null;
    // The words alone: their times are borrowed (and lined up with the mix) by autoTimeSheet.
    const text = found.plain ?? serializeLyrics(clearTimes(parseLyrics(found.synced ?? "")));
    return { title: found.title, artist: found.artist, text, source: "lrclib.net" };
  } catch {
    return null;
  }
}

/**
 * The words from a link (a lyrics page, a Genius song or its embed code),
 * trying every way there is: the server reads the page (or Genius's embed),
 * then — for Genius — this browser reads the embed, then the lyrics library
 * has the same song by name. Throws the server's reason when none works.
 */
export async function importLyrics(link: string, song: SongHint = {}, onStep?: (step: string) => void): Promise<ImportedLyrics> {
  const named = (found: ImportedLyrics) => ({ ...found, title: found.title || song.title || "", artist: found.artist || song.artist || "" });
  try {
    return named(await importLyricsLink(link, song));
  } catch (err) {
    const id = song.geniusId ?? geniusSongId(link);
    if (id) {
      onStep?.("Opening the song on Genius…");
      const fromBrowser = await geniusFromBrowser(id);
      if (fromBrowser) return named(fromBrowser);
    }
    if (song.title) {
      onStep?.("Looking the song up in the lyrics library…");
      const fromLibrary = await wordsFromLibrary(song.title, song.artist ?? "");
      if (fromLibrary) return fromLibrary;
    }
    throw err;
  }
}

// ── Timing found words automatically ────────────────────────────────────

/**
 * The song's own vocal in the mix (not a take), to time lyrics from — the
 * one whose title is most like the lyrics' song when there are several.
 */
export function songVocalLane(lanes: StudioLane[], title = ""): StudioLane | null {
  const voices = vocalLanes(lanes).filter((l) => !isTakeLane(l));
  if (voices.length <= 1 || !title.trim()) return voices[0] ?? null;
  const scored = voices.map((l) => ({ l, s: lineSimilarity(splitSongTitle(l.trackTitle).song, title) }));
  scored.sort((a, b) => b.s - a.s);
  return scored[0].l;
}

/** Where the lane's audio ends on the timeline. */
function laneEnd(lane: StudioLane) {
  return lane.offsetSeconds + (lane.duration || lane.originalDuration / (lane.tempoRatio > 0 ? lane.tempoRatio : 1));
}

/** Lines timed from where the singing starts in a vocal lane (see lyrics.autoTime). */
export async function timeFromVoice(lines: LyricLine[], lane: StudioLane): Promise<LyricLine[] | null> {
  const env = await laneEnvelope(lane);
  return autoTime(lines, env, { from: lane.offsetSeconds, to: laneEnd(lane) });
}

/** Timed lines moved onto where a vocal lane sings them (see lyrics.alignToVoice). */
export async function alignWithVoice(lines: LyricLine[], lane: StudioLane): Promise<{ lines: LyricLine[]; matched: number; total: number } | null> {
  const env = await laneEnvelope(lane);
  const fit = alignToVoice(lines, env);
  return fit ? { lines: Math.abs(fit.shift) < 0.02 ? lines : shiftLines(lines, fit.shift), matched: fit.matched, total: fit.total } : null;
}

/** How a sheet got its times: kept as they came, borrowed from the library's timed copy, heard in the vocals — or none found. */
export type TimingSource = "kept" | "library" | "vocals" | "none";
export type TimedSheet = { text: string; how: TimingSource; aligned: boolean; note: string };

/**
 * Times for words as they come in — every way of adding lyrics goes
 * through here, so they follow the song without a tap whenever that can
 * be worked out: the library's timed copy of the song (put where the song
 * plays in the mix), else the singing in the song's own vocal lane. Times
 * the words already have are kept, and lined up with that vocal when it's
 * in the mix.
 */
export async function autoTimeSheet(text: string, song: { title: string; artist: string }, onStep?: (step: string) => void): Promise<TimedSheet> {
  const lines = parseLyrics(text);
  const none: TimedSheet = { text, how: "none", aligned: false, note: "" };
  if (!lines.some(isSung)) return none;
  const voice = songVocalLane(currentLanes(), song.title);
  const lineUp = async (timed: LyricLine[]) => {
    if (!voice) return null;
    onStep?.("Lining the words up with the vocals…");
    return alignWithVoice(timed, voice).catch(() => null);
  };

  if (isSynced(lines)) {
    const placed = await lineUp(lines);
    return placed
      ? { text: serializeLyrics(placed.lines), how: "kept", aligned: true, note: `Lined up with the vocals in your mix — ${placed.matched} of ${placed.total} lines land on the singing` }
      : { ...none, how: "kept" };
  }

  onStep?.("Looking for the timing…");
  const borrowed = await timeFromLibrary(text, song.title, song.artist).catch(() => null);
  if (borrowed) {
    const from = `Timed from the lyrics library — ${borrowed.matched} of ${borrowed.total} lines matched`;
    if (borrowed.aligned) return { text: borrowed.text, how: "library", aligned: true, note: `${from}, lined up with your song` };
    const placed = await lineUp(parseLyrics(borrowed.text));
    if (placed) return { text: serializeLyrics(placed.lines), how: "library", aligned: true, note: `${from}, lined up with the vocals in your mix` };
    return { text: borrowed.text, how: "library", aligned: false, note: `${from} — timed to the original song` };
  }

  if (voice) {
    onStep?.("Listening to the vocals for the timing…");
    const heard = await timeFromVoice(lines, voice).catch(() => null);
    if (heard) return { text: serializeLyrics(heard), how: "vocals", aligned: true, note: "Timed from the vocals in your mix — a first guess: play it through and fix any line that's off" };
  }
  return none;
}

/** A sheet's words with their times taken off, to time again from scratch. */
export function untimed(text: string) {
  return plainText(clearTimes(parseLyrics(text)));
}
