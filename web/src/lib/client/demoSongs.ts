"use client";

// The demo songs: original music synthesised in the browser (see
// demoSongsDsp.ts), rendered as separate stems so the Examples lab and the
// DJ simulator can show what stem splitting is for — with no copyrighted
// audio anywhere. Rendering is deterministic and cached per session.

import {
  DEMO_SONG_DEFS,
  DEMO_SONGS,
  DEMO_STEMS,
  demoSongDef,
  demoSongMeta,
  type DemoSongMeta,
  type DemoStem,
} from "./demoSongDefs";
import { SAMPLE_RATE, balanceStems, renderRawStem, sumStereo, type Stereo } from "./demoSongsDsp";

export { DEMO_SONG_DEFS, DEMO_SONGS, DEMO_STEMS, demoSongDef, demoSongMeta };
export type { DemoSongMeta, DemoStem };

export type DemoPeakKey = "mix" | "vocal" | "beat" | DemoStem;

export type RenderedDemoSong = {
  id: string;
  meta: DemoSongMeta;
  stems: Record<DemoStem, AudioBuffer>;
  /** Everything: the four stems summed (built on first use, to save memory). */
  readonly mix: AudioBuffer;
  /** Drums + bass + chords: the "instrumental" a splitter would hand back (built on first use). */
  readonly beat: AudioBuffer;
  /** 800 bins of max |sample| for drawing. */
  peaks: Record<DemoPeakKey, Float32Array>;
};

const PEAK_BINS = 800;

function makeBuffer(stereo: Stereo): AudioBuffer {
  const length = stereo.l.length;
  let buffer: AudioBuffer;
  try {
    buffer = new AudioBuffer({ numberOfChannels: 2, length, sampleRate: SAMPLE_RATE });
  } catch {
    buffer = new OfflineAudioContext(2, 1, SAMPLE_RATE).createBuffer(2, length, SAMPLE_RATE);
  }
  buffer.copyToChannel(stereo.l as Float32Array<ArrayBuffer>, 0);
  buffer.copyToChannel(stereo.r as Float32Array<ArrayBuffer>, 1);
  return buffer;
}

function sumBuffers(buffers: AudioBuffer[]): AudioBuffer {
  const length = buffers[0].length;
  const l = new Float32Array(length);
  const r = new Float32Array(length);
  for (const b of buffers) {
    const bl = b.getChannelData(0);
    const br = b.getChannelData(1);
    for (let i = 0; i < length; i++) {
      l[i] += bl[i];
      r[i] += br[i];
    }
  }
  return makeBuffer({ l, r });
}

function peaksOfArrays(l: Float32Array, r: Float32Array, bins: number): Float32Array {
  const out = new Float32Array(bins);
  const per = l.length / bins;
  for (let b = 0; b < bins; b++) {
    const from = Math.floor(b * per);
    const to = Math.min(l.length, Math.max(from + 1, Math.floor((b + 1) * per)));
    let max = 0;
    for (let i = from; i < to; i++) max = Math.max(max, Math.abs(l[i]), Math.abs(r[i]));
    out[b] = max;
  }
  return out;
}

/** Max |sample| over `bins` equal slices of the buffer (both channels). */
export function peaksOf(buffer: AudioBuffer, bins: number): Float32Array {
  return peaksOfArrays(buffer.getChannelData(0), buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : buffer.getChannelData(0), bins);
}

const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// A rendered song is ~125 MB of audio, so only the few most recent are kept.
const MAX_CACHED = 3;
const cache = new Map<string, Promise<RenderedDemoSong>>();

/** Lets go of a cached song (the DJ simulator does once it has what it needs). */
export function releaseDemoSong(id: string) {
  cache.delete(id);
}

/**
 * Synthesises one demo song as four stems plus the full mix and the
 * drums+bass+chords "beat". Stems are rendered one at a time with a yield
 * between them so the page stays responsive. Cached: asking twice is free.
 */
export function renderDemoSong(id: string): Promise<RenderedDemoSong> {
  const cached = cache.get(id);
  if (cached) {
    cache.delete(id);
    cache.set(id, cached); // most recently used
    return cached;
  }
  const promise = (async () => {
    const def = demoSongDef(id);
    const meta = demoSongMeta(id);
    if (!def || !meta) throw new Error(`Unknown demo song: ${id}`);
    const raw = {} as Record<DemoStem, Stereo>;
    for (const stem of DEMO_STEMS) {
      raw[stem] = renderRawStem(def, stem);
      await yieldToUi();
    }
    const balanced = balanceStems(def, raw);
    const mixSum = sumStereo(DEMO_STEMS.map((s) => balanced[s]));
    const beatSum = sumStereo([balanced.drums, balanced.bass, balanced.chords]);
    const peaks = {
      mix: peaksOfArrays(mixSum.l, mixSum.r, PEAK_BINS),
      beat: peaksOfArrays(beatSum.l, beatSum.r, PEAK_BINS),
      vocal: peaksOfArrays(balanced.vocal.l, balanced.vocal.r, PEAK_BINS),
      drums: peaksOfArrays(balanced.drums.l, balanced.drums.r, PEAK_BINS),
      bass: peaksOfArrays(balanced.bass.l, balanced.bass.r, PEAK_BINS),
      chords: peaksOfArrays(balanced.chords.l, balanced.chords.r, PEAK_BINS),
    } satisfies Record<DemoPeakKey, Float32Array>;
    const stems = {} as Record<DemoStem, AudioBuffer>;
    for (const stem of DEMO_STEMS) stems[stem] = makeBuffer(balanced[stem]);
    let mix: AudioBuffer | null = null;
    let beat: AudioBuffer | null = null;
    return {
      id,
      meta,
      stems,
      peaks,
      get mix() {
        return (mix ??= sumBuffers(DEMO_STEMS.map((s) => stems[s])));
      },
      get beat() {
        return (beat ??= sumBuffers([stems.drums, stems.bass, stems.chords]));
      },
    } satisfies RenderedDemoSong;
  })();
  cache.set(id, promise);
  // A failed render shouldn't be remembered.
  promise.catch(() => cache.delete(id));
  while (cache.size > MAX_CACHED) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined || oldest === id) break;
    cache.delete(oldest);
  }
  return promise;
}

/** A copy of part of a buffer (for looping a few bars). */
export function sliceBuffer(buffer: AudioBuffer, fromSec: number, toSec: number): AudioBuffer {
  const rate = buffer.sampleRate;
  const from = Math.max(0, Math.floor(fromSec * rate));
  const to = Math.min(buffer.length, Math.max(from + 1, Math.floor(toSec * rate)));
  const out = new OfflineAudioContext(buffer.numberOfChannels, 1, rate).createBuffer(buffer.numberOfChannels, to - from, rate);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    out.copyToChannel(buffer.getChannelData(c).subarray(from, to) as Float32Array<ArrayBuffer>, c);
  }
  return out;
}

/** 16-bit PCM WAV, so a demo song (or one stem) can be saved and dropped into the real splitter. */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const bytes = 44 + frames * channels * 2;
  const view = new DataView(new ArrayBuffer(bytes));
  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, bytes - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, frames * channels * 2, true);
  const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const v = Math.max(-1, Math.min(1, data[c][i]));
      view.setInt16(offset, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([view], { type: "audio/wav" });
}

/** Saves a blob as a file through a temporary link. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function demoFileName(meta: DemoSongMeta, part?: string) {
  const base = `${meta.artist} - ${meta.title}`.replace(/[^\w\- ]+/g, "").trim();
  return `${base}${part ? ` (${part})` : ""}.wav`;
}
